"""
app/routers/releves_bons.py
-------------------------------
§ demande utilisateur : module de production des "Relevés de Bons" —
documents PDF envoyés aux assureurs pour réclamer, par reçus et numéros de
bons, les sommes dues sur une période (la part assureur des prises en
charge, jamais réclamée directement au patient — celui-ci ne règle que sa
propre part, voir le correctif "reste à payer sur le montant NET").

Réservé au Comptable et à l'Administrateur (qui couvre aussi le
super-admin, dont le rôle vaut toujours "Administrateur" — voir
exiger_role), toujours borné au cabinet de l'utilisateur courant.

Deux modèles, tous deux réutilisant les PriseEnCharge déjà ouvertes lors de
l'établissement de chaque reçu (jamais recalculées ici, uniquement lues et
mises en forme) :
  - "simple"   : pour UN couple (assureur, souscripteur) — une ligne par
                 reçu (numéro de bon, part assuré/assureur, motif).
  - "détaillé" : pour UN assureur, toutes les souscripteurs/groupes qu'il
                 couvre, avec le détail acte par acte de chaque reçu.

La "Maintenance des Bons" (filtrage/tri avancé avant génération, voir la
capture fournie) est un module à part, prévu pour une session ultérieure —
ce routeur se limite pour l'instant à la production des 2 PDF eux-mêmes à
partir d'un assureur + une période (+ un souscripteur pour le modèle
simple).
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Response, status

from app.core.database import obtenir_base, Collections
from app.core.dependances import exiger_role
from app.utils.compteurs import prochain_numero
from app.utils.formatage import identite_patient_affichee
from app.utils.pdf_documents import (
    _motif_vente, generer_pdf_releve_bons_simple, generer_pdf_releve_bons_detaille,
)

router = APIRouter(prefix="/api/releves-bons", tags=["Relevés de Bons"])


def _borne_fin_journee(date_fin: str) -> datetime:
    """La borne de fin reçue (YYYY-MM-DD) doit inclure toute la journée."""
    return datetime.fromisoformat(date_fin).replace(hour=23, minute=59, second=59)


async def _obtenir_cabinet(base, cabinet_code: str) -> dict:
    cabinet = await base[Collections.CABINET].find_one({"code_cabinet": cabinet_code})
    return cabinet or {}


async def _prises_en_charge_periode(base, cabinet_code: str, assurance_numero_enreg: int, date_debut: datetime, date_fin: datetime, souscripteur: str | None = None) -> list[dict]:
    """
    Retourne les PriseEnCharge (non annulées) émises pour CETTE assurance
    sur la période, enrichies de la vente (patient, lignes) correspondante
    — chaque élément : {"pec": ..., "vente": ..., "lien": ...}. Ignore
    silencieusement les prises en charge dont le reçu associé a depuis été
    annulé (rien à réclamer sur un reçu annulé).
    """
    liens = {l["numero_enreg"]: l async for l in base[Collections.ASSURANCE_PATIENT].find({"cabinet_code": cabinet_code, "assurance_numero_enreg": assurance_numero_enreg})}
    if not liens:
        return []
    filtre = {
        "cabinet_code": cabinet_code,
        "assurance_patient_numero_enreg": {"$in": list(liens.keys())},
        "statut": {"$ne": "Annulée"},
        "date_demande": {"$gte": date_debut, "$lte": date_fin},
    }
    if souscripteur:
        filtre["souscripteur"] = souscripteur
    resultat = []
    async for pec in base[Collections.PRISE_EN_CHARGE].find(filtre):
        vente = await base[Collections.VENTE_CLINIQUE].find_one({"Référence": pec["vente_reference"], "cabinet_code": cabinet_code})
        if not vente or vente.get("annule"):
            continue
        resultat.append({"pec": pec, "vente": vente, "lien": liens.get(pec["assurance_patient_numero_enreg"])})
    resultat.sort(key=lambda r: r["pec"].get("date_demande") or datetime.min)
    return resultat


@router.get("/souscripteurs")
async def lister_souscripteurs_periode(
    assurance_numero_enreg: int, date_debut: str, date_fin: str,
    utilisateur: dict = Depends(exiger_role("Comptable")),
):
    """
    § alimente le sélecteur du modèle "simple" (qui exige un souscripteur
    précis) : liste les souscripteurs distincts ayant au moins un bon pour
    CET assureur sur la période choisie, avec le nombre de reçus concernés.
    """
    base = obtenir_base()
    lignes = await _prises_en_charge_periode(
        base, utilisateur["CodeCabinet"], assurance_numero_enreg,
        datetime.fromisoformat(date_debut), _borne_fin_journee(date_fin),
    )
    comptes: dict[str, int] = {}
    for l in lignes:
        souscripteur = l["pec"].get("souscripteur") or "—"
        comptes[souscripteur] = comptes.get(souscripteur, 0) + 1
    return sorted([{"souscripteur": s, "nombre_recus": n} for s, n in comptes.items()], key=lambda x: x["souscripteur"])


@router.get("/simple/pdf")
async def generer_releve_simple(
    assurance_numero_enreg: int, souscripteur: str, date_debut: str, date_fin: str,
    utilisateur: dict = Depends(exiger_role("Comptable")),
):
    """Modèle "standard simple" (§ demande utilisateur) — un couple (assureur, souscripteur), une ligne par reçu."""
    base = obtenir_base()
    cabinet_code = utilisateur["CodeCabinet"]
    assurance = await base[Collections.ASSURANCE].find_one({"numero_enreg": assurance_numero_enreg, "cabinet_code": cabinet_code})
    if not assurance:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assurance introuvable.")

    debut = datetime.fromisoformat(date_debut)
    fin = _borne_fin_journee(date_fin)
    donnees = await _prises_en_charge_periode(base, cabinet_code, assurance_numero_enreg, debut, fin, souscripteur=souscripteur)
    if not donnees:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Aucun bon trouvé pour cet assureur/souscripteur sur cette période.")

    lignes_pdf = []
    for d in donnees:
        pec, vente, lien = d["pec"], d["vente"], d["lien"]
        lignes_pdf.append({
            "date": vente.get("Date Vente") or pec.get("date_demande") or debut,
            "nom_assure": identite_patient_affichee(vente),
            "numero_bon": pec.get("numero_bon", ""),
            "matricule": (lien or {}).get("numero_adherent"),
            "part_assure": pec.get("part_assure", 0) or 0,
            "part_assureur": pec.get("part_assureur", 0) or 0,
            "motif": _motif_vente(vente),
        })

    cabinet = await _obtenir_cabinet(base, cabinet_code)
    reference_releve = f"RB-{debut.year}{await prochain_numero(f'releve_bons_{cabinet_code}_{debut.year}', valeur_depart=1):05d}"
    pdf_octets = generer_pdf_releve_bons_simple(cabinet, assurance, souscripteur, debut, fin, lignes_pdf, reference_releve)
    return Response(content=pdf_octets, media_type="application/pdf", headers={
        "Content-Disposition": f'inline; filename="{reference_releve}.pdf"'
    })


@router.get("/detaille/pdf")
async def generer_releve_detaille(
    assurance_numero_enreg: int, date_debut: str, date_fin: str,
    utilisateur: dict = Depends(exiger_role("Comptable")),
):
    """Modèle "détaillé par souscripteur" (§ demande utilisateur) — un assureur, toutes ses souscripteurs/groupes, détail acte par acte."""
    base = obtenir_base()
    cabinet_code = utilisateur["CodeCabinet"]
    assurance = await base[Collections.ASSURANCE].find_one({"numero_enreg": assurance_numero_enreg, "cabinet_code": cabinet_code})
    if not assurance:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assurance introuvable.")

    debut = datetime.fromisoformat(date_debut)
    fin = _borne_fin_journee(date_fin)
    donnees = await _prises_en_charge_periode(base, cabinet_code, assurance_numero_enreg, debut, fin)
    if not donnees:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Aucun bon trouvé pour cet assureur sur cette période.")

    # § regroupe par souscripteur (ordre d'apparition), chaque bon détaillé
    # acte par acte — la part assureur de CHAQUE ligne est proratisée sur
    # son propre sous-total plutôt que répartie arbitrairement, pour que la
    # somme des lignes détaillées corresponde exactement au sous-total du
    # reçu affiché juste en dessous.
    groupes_par_souscripteur: dict[str, dict] = {}
    for d in donnees:
        pec, vente, lien = d["pec"], d["vente"], d["lien"]
        souscripteur = pec.get("souscripteur") or "—"
        if souscripteur not in groupes_par_souscripteur:
            groupes_par_souscripteur[souscripteur] = {
                "souscripteur": souscripteur,
                "pourcentage": (lien or {}).get("pourcentage_prise_en_charge", assurance.get("pourcentage_prise_en_charge_defaut", 80)),
                "lignes": [],
            }
        montant_total_vente = pec.get("montant_total") or sum(l.get("sous_total", 0) for l in vente.get("lignes", [])) or 1
        pourcentage = groupes_par_souscripteur[souscripteur]["pourcentage"]
        details = []
        for ligne in vente.get("lignes", []):
            sous_total = ligne.get("sous_total", 0) or 0
            part_assureur_ligne = round(sous_total * pourcentage / 100, 2)
            details.append((ligne.get("libelle", ""), part_assureur_ligne))
        groupes_par_souscripteur[souscripteur]["lignes"].append({
            "numero_bon": pec.get("numero_bon", ""),
            "date": vente.get("Date Vente") or pec.get("date_demande") or debut,
            "nom_assure": identite_patient_affichee(vente),
            "reference_recu": pec.get("vente_reference", ""),
            "details": details,
            "part_assureur_recu": pec.get("part_assureur", 0) or 0,
        })

    cabinet = await _obtenir_cabinet(base, cabinet_code)
    reference_releve = f"RB-{debut.year}{await prochain_numero(f'releve_bons_{cabinet_code}_{debut.year}', valeur_depart=1):05d}"
    pdf_octets = generer_pdf_releve_bons_detaille(cabinet, assurance, debut, fin, list(groupes_par_souscripteur.values()), reference_releve)
    return Response(content=pdf_octets, media_type="application/pdf", headers={
        "Content-Disposition": f'inline; filename="{reference_releve}.pdf"'
    })
