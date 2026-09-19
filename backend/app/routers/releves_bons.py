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

§ demande utilisateur (numérotation + historique) : chaque génération est
désormais NUMÉROTÉE simplement (entier brut, séquence propre à chaque
cabinet ET à chaque modèle — voir app/routers/plateforme.py pour la gestion
super-admin de ces séquences) et CONSERVÉE (voir app/models/releve_bons.py)
— un tableau "Historique des relevés" liste tout ce qui a déjà été produit,
avec 3 actions par ligne : Réimprimer (le PDF exact déjà généré, sans
recalcul), Envoyer (WhatsApp/Email à un contact du cabinet) et Régénérer
(reproduit le même document à partir des données ACTUELLES, sous un
NOUVEAU numéro — le relevé d'origine, potentiellement déjà transmis à
l'assureur, reste inchangé dans l'historique).

La "Maintenance des Bons" (filtrage/tri avancé avant génération, voir la
capture fournie) est un module à part, prévu pour une session ultérieure —
ce routeur se limite pour l'instant à la production des 2 PDF eux-mêmes à
partir d'un assureur + une période (+ un souscripteur pour le modèle
simple).
"""

import base64
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel

from app.core.database import obtenir_base, Collections
from app.core.dependances import exiger_role
from app.utils.audit import journaliser_action
from app.utils.compteurs import prochain_numero
from app.utils.formatage import identite_patient_affichee
from app.utils.pdf_documents import (
    _motif_vente, _intitule_assurance, generer_pdf_releve_bons_simple, generer_pdf_releve_bons_detaille,
)
from app.utils.whatsapp import normaliser_numero_whatsapp
from app.utils.whatsapp_api import envoyer_media_whatsapp
from app.utils.smtp_api import envoyer_email

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


async def _generer_et_enregistrer_simple(base, cabinet_code: str, genere_par: str, assurance_numero_enreg: int, souscripteur: str, debut: datetime, fin: datetime, regenere_depuis: int | None = None) -> dict:
    """Construit le PDF "modèle simple", l'enregistre dans l'historique (numéro simple auto-incrémenté) et retourne le document ReleveBons créé."""
    assurance = await base[Collections.ASSURANCE].find_one({"numero_enreg": assurance_numero_enreg, "cabinet_code": cabinet_code})
    if not assurance:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assurance introuvable.")
    donnees = await _prises_en_charge_periode(base, cabinet_code, assurance_numero_enreg, debut, fin, souscripteur=souscripteur)
    if not donnees:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Aucun bon trouvé pour cet assureur/souscripteur sur cette période.")

    lignes_pdf = []
    montant_total = 0.0
    for d in donnees:
        pec, vente, lien = d["pec"], d["vente"], d["lien"]
        part_assure = pec.get("part_assure", 0) or 0
        part_assureur = pec.get("part_assureur", 0) or 0
        montant_total += part_assureur
        lignes_pdf.append({
            "date": vente.get("Date Vente") or pec.get("date_demande") or debut,
            "nom_assure": identite_patient_affichee(vente),
            "numero_bon": pec.get("numero_bon", ""),
            "matricule": (lien or {}).get("numero_adherent"),
            "part_assure": part_assure,
            "part_assureur": part_assureur,
            "motif": _motif_vente(vente),
        })

    cabinet = await _obtenir_cabinet(base, cabinet_code)
    numero_generation = await prochain_numero(f"releve_bons_simple_{cabinet_code}")
    pdf_octets = generer_pdf_releve_bons_simple(cabinet, assurance, souscripteur, debut, fin, lignes_pdf, str(numero_generation))

    document = {
        "numero_enreg": await prochain_numero("ReleveBons"),
        "cabinet_code": cabinet_code,
        "numero_generation": numero_generation,
        "type_releve": "simple",
        "assurance_numero_enreg": assurance_numero_enreg,
        "nom_assureur": _intitule_assurance(assurance),
        "souscripteur": souscripteur,
        "nombre_recus": len(donnees),
        "montant_total": round(montant_total, 2),
        "date_debut": debut,
        "date_fin": fin,
        "date_generation": datetime.utcnow(),
        "genere_par": genere_par,
        "pdf_base64": base64.b64encode(pdf_octets).decode("ascii"),
        "regenere_depuis": regenere_depuis,
    }
    await base[Collections.RELEVE_BONS].insert_one(document)
    return document


async def _generer_et_enregistrer_detaille(base, cabinet_code: str, genere_par: str, assurance_numero_enreg: int, debut: datetime, fin: datetime, regenere_depuis: int | None = None) -> dict:
    """Construit le PDF "modèle détaillé", l'enregistre dans l'historique (numéro simple auto-incrémenté) et retourne le document ReleveBons créé."""
    assurance = await base[Collections.ASSURANCE].find_one({"numero_enreg": assurance_numero_enreg, "cabinet_code": cabinet_code})
    if not assurance:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assurance introuvable.")
    donnees = await _prises_en_charge_periode(base, cabinet_code, assurance_numero_enreg, debut, fin)
    if not donnees:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Aucun bon trouvé pour cet assureur sur cette période.")

    # § regroupe par souscripteur (ordre d'apparition), chaque bon détaillé
    # acte par acte — la part assureur de CHAQUE ligne est proratisée sur
    # son propre sous-total plutôt que répartie arbitrairement, pour que la
    # somme des lignes détaillées corresponde exactement au sous-total du
    # reçu affiché juste en dessous.
    groupes_par_souscripteur: dict[str, dict] = {}
    montant_total = 0.0
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
        part_assureur_recu = pec.get("part_assureur", 0) or 0
        montant_total += part_assureur_recu
        groupes_par_souscripteur[souscripteur]["lignes"].append({
            "numero_bon": pec.get("numero_bon", ""),
            "date": vente.get("Date Vente") or pec.get("date_demande") or debut,
            "nom_assure": identite_patient_affichee(vente),
            "reference_recu": pec.get("vente_reference", ""),
            "details": details,
            "part_assureur_recu": part_assureur_recu,
        })

    cabinet = await _obtenir_cabinet(base, cabinet_code)
    numero_generation = await prochain_numero(f"releve_bons_detaille_{cabinet_code}")
    pdf_octets = generer_pdf_releve_bons_detaille(cabinet, assurance, debut, fin, list(groupes_par_souscripteur.values()), str(numero_generation))

    document = {
        "numero_enreg": await prochain_numero("ReleveBons"),
        "cabinet_code": cabinet_code,
        "numero_generation": numero_generation,
        "type_releve": "detaille",
        "assurance_numero_enreg": assurance_numero_enreg,
        "nom_assureur": _intitule_assurance(assurance),
        "souscripteur": None,
        "nombre_recus": len(donnees),
        "montant_total": round(montant_total, 2),
        "date_debut": debut,
        "date_fin": fin,
        "date_generation": datetime.utcnow(),
        "genere_par": genere_par,
        "pdf_base64": base64.b64encode(pdf_octets).decode("ascii"),
        "regenere_depuis": regenere_depuis,
    }
    await base[Collections.RELEVE_BONS].insert_one(document)
    return document


def _reponse_pdf(document: dict) -> Response:
    pdf_octets = base64.b64decode(document["pdf_base64"])
    return Response(content=pdf_octets, media_type="application/pdf", headers={
        "Content-Disposition": f'inline; filename="releve-bons-{document["numero_generation"]}.pdf"'
    })


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
    document = await _generer_et_enregistrer_simple(
        base, utilisateur["CodeCabinet"], utilisateur["Login"], assurance_numero_enreg, souscripteur,
        datetime.fromisoformat(date_debut), _borne_fin_journee(date_fin),
    )
    await journaliser_action(utilisateur["Login"], "generation_releve_bons_simple", {"numero_generation": document["numero_generation"], "assurance": document["nom_assureur"], "souscripteur": souscripteur}, cabinet_code=utilisateur["CodeCabinet"])
    return _reponse_pdf(document)


@router.get("/detaille/pdf")
async def generer_releve_detaille(
    assurance_numero_enreg: int, date_debut: str, date_fin: str,
    utilisateur: dict = Depends(exiger_role("Comptable")),
):
    """Modèle "détaillé par souscripteur" (§ demande utilisateur) — un assureur, toutes ses souscripteurs/groupes, détail acte par acte."""
    base = obtenir_base()
    document = await _generer_et_enregistrer_detaille(
        base, utilisateur["CodeCabinet"], utilisateur["Login"], assurance_numero_enreg,
        datetime.fromisoformat(date_debut), _borne_fin_journee(date_fin),
    )
    await journaliser_action(utilisateur["Login"], "generation_releve_bons_detaille", {"numero_generation": document["numero_generation"], "assurance": document["nom_assureur"]}, cabinet_code=utilisateur["CodeCabinet"])
    return _reponse_pdf(document)


@router.get("/historique")
async def historique_releves(utilisateur: dict = Depends(exiger_role("Comptable"))):
    """
    § demande utilisateur : "Dès l'accès au module un tableau 'Historique
    des relevés' sera affiché par date/heure décroissante des relevés déjà
    générés" — métadonnées seulement (jamais le PDF lui-même, trop lourd
    pour une liste ; voir /{numero_enreg}/pdf pour le récupérer).
    """
    base = obtenir_base()
    curseur = base[Collections.RELEVE_BONS].find(
        {"cabinet_code": utilisateur["CodeCabinet"]},
        {"pdf_base64": 0},
    ).sort("date_generation", -1)
    return [d async for d in curseur]


async def _obtenir_releve_ou_404(base, cabinet_code: str, numero_enreg: int) -> dict:
    document = await base[Collections.RELEVE_BONS].find_one({"numero_enreg": numero_enreg, "cabinet_code": cabinet_code})
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Relevé introuvable.")
    return document


@router.get("/{numero_enreg}/pdf")
async def reimprimer_releve(numero_enreg: int, utilisateur: dict = Depends(exiger_role("Comptable"))):
    """§ demande utilisateur : "Réimprimer" — le PDF EXACT déjà généré (aucun recalcul), tel que transmis/imprimé la première fois."""
    base = obtenir_base()
    document = await _obtenir_releve_ou_404(base, utilisateur["CodeCabinet"], numero_enreg)
    return _reponse_pdf(document)


@router.post("/{numero_enreg}/regenerer")
async def regenerer_releve(numero_enreg: int, utilisateur: dict = Depends(exiger_role("Comptable"))):
    """
    § demande utilisateur : "Régénérer" — reproduit le MÊME relevé (même
    assureur, même période, même souscripteur pour le modèle simple) à
    partir des données ACTUELLES (un bon ajouté/corrigé depuis peut donc
    apparaître), sous un NOUVEAU numéro de génération — le relevé
    d'origine n'est jamais modifié ni supprimé. Renvoie les métadonnées
    (pas le PDF lui-même) : le frontend enchaîne sur GET /{numero_enreg}/pdf
    pour l'affichage, cohérent avec le reste du module.
    """
    base = obtenir_base()
    cabinet_code = utilisateur["CodeCabinet"]
    original = await _obtenir_releve_ou_404(base, cabinet_code, numero_enreg)
    if original["type_releve"] == "simple":
        nouveau = await _generer_et_enregistrer_simple(
            base, cabinet_code, utilisateur["Login"], original["assurance_numero_enreg"], original["souscripteur"],
            original["date_debut"], original["date_fin"], regenere_depuis=numero_enreg,
        )
    else:
        nouveau = await _generer_et_enregistrer_detaille(
            base, cabinet_code, utilisateur["Login"], original["assurance_numero_enreg"],
            original["date_debut"], original["date_fin"], regenere_depuis=numero_enreg,
        )
    await journaliser_action(utilisateur["Login"], "regeneration_releve_bons", {"numero_enreg_origine": numero_enreg, "nouveau_numero_generation": nouveau["numero_generation"]}, cabinet_code=cabinet_code)
    nouveau.pop("pdf_base64", None)
    return nouveau


@router.get("/contacts")
async def lister_contacts_pour_envoi(utilisateur: dict = Depends(exiger_role("Comptable"))):
    """
    § alimente le sélecteur "Envoyer" — contacts DU CABINET (annuaire du
    Centre de Messagerie, réutilisé tel quel plutôt que dupliqué) ayant au
    moins un numéro WhatsApp OU un email renseigné, seuls les champs
    nécessaires à l'envoi étant exposés ici.
    """
    base = obtenir_base()
    curseur = base[Collections.CONTACT_MESSAGERIE].find(
        {"cabinet_code": utilisateur["CodeCabinet"], "$or": [{"whatsapp": {"$nin": [None, ""]}}, {"telephone": {"$nin": [None, ""]}}, {"email": {"$nin": [None, ""]}}]},
        {"numero_enreg": 1, "nom": 1, "telephone": 1, "whatsapp": 1, "email": 1, "_id": 0},
    ).sort("nom", 1)
    return [d async for d in curseur]


class EnvoiReleveRequete(BaseModel):
    contact_numero_enreg: int
    canal: str  # "whatsapp" | "email"


@router.post("/{numero_enreg}/envoyer")
async def envoyer_releve(numero_enreg: int, requete: EnvoiReleveRequete, utilisateur: dict = Depends(exiger_role("Comptable"))):
    """§ demande utilisateur : "l'envoyer par WhatsApp/eMail d'un contact" — envoi RÉEL, pas un simple lien à ouvrir (même mécanisme que l'envoi d'ordonnance par WhatsApp, voir dossiers_examen.py)."""
    base = obtenir_base()
    cabinet_code = utilisateur["CodeCabinet"]
    document = await _obtenir_releve_ou_404(base, cabinet_code, numero_enreg)
    contact = await base[Collections.CONTACT_MESSAGERIE].find_one({"numero_enreg": requete.contact_numero_enreg, "cabinet_code": cabinet_code})
    if not contact:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contact introuvable.")
    cabinet = await _obtenir_cabinet(base, cabinet_code)
    nom_cabinet = cabinet.get("denomination", "SAWALI DentalCare")
    pdf_octets = base64.b64decode(document["pdf_base64"])
    nom_fichier = f"releve-bons-{document['numero_generation']}.pdf"
    libelle_type = "simple" if document["type_releve"] == "simple" else "détaillé"

    if requete.canal == "whatsapp":
        numero_brut = contact.get("whatsapp") or contact.get("telephone")
        if not numero_brut:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Ce contact n'a pas de numéro WhatsApp/téléphone enregistré.")
        numero = normaliser_numero_whatsapp(numero_brut)
        config = await base[Collections.CONFIGURATION_WHATSAPP].find_one({"cabinet_code": cabinet_code})
        succes, message, _type_media, _media_id, _wamid = await envoyer_media_whatsapp(
            config, numero, pdf_octets, "application/pdf", nom_fichier=nom_fichier,
            legende=f"{nom_cabinet} — Relevé de Bons {libelle_type} n°{document['numero_generation']} ({document['nom_assureur']})",
        )
        if not succes:
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=message)
    elif requete.canal == "email":
        if not contact.get("email"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Ce contact n'a pas d'adresse email enregistrée.")
        config = await base[Collections.CONFIGURATION_SMTP].find_one({"cabinet_code": cabinet_code})
        succes, message = await envoyer_email(
            config, contact["email"],
            sujet=f"{nom_cabinet} — Relevé de Bons {libelle_type} n°{document['numero_generation']}",
            corps=f"Veuillez trouver ci-joint le Relevé de Bons {libelle_type} n°{document['numero_generation']} ({document['nom_assureur']}), période du {document['date_debut'].strftime('%d/%m/%Y')} au {document['date_fin'].strftime('%d/%m/%Y')}.\n\n{nom_cabinet}",
            piece_jointe=pdf_octets, nom_piece_jointe=nom_fichier,
        )
        if not succes:
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=message)
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Canal d'envoi non reconnu (whatsapp ou email attendu).")

    await journaliser_action(utilisateur["Login"], "envoi_releve_bons", {"numero_enreg": numero_enreg, "canal": requete.canal, "contact": contact.get("nom")}, cabinet_code=cabinet_code)
    return {"envoye": True, "canal": requete.canal}
