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

§ demande utilisateur (correctif numérotation + unicité) : "Le nom de
l'assurance et la période doivent être unique dans la base de données. On
ne peut pas regénérer un nouveau relevé mais plutôt utiliser le bouton
action dans le tableau historique pour 'regénérer'." — l'unicité porte sur
(cabinet, modèle, assureur[, souscripteur pour le modèle simple], période) :
une seule génération INITIALE possible par combinaison ; toute nouvelle
tentative de génération pour une combinaison déjà connue est REFUSÉE (409),
avec le numero_enreg existant pour que le frontend puisse proposer
directement le bouton "Régénérer" — qui ne crée JAMAIS un nouveau relevé,
il RAFRAÎCHIT le même document en place (même numero_enreg, même
numero_generation, PDF recalculé à partir des données actuelles).

§ demande utilisateur (numérotation) : "La numérotation c'est toujours
Année+4 '0' significatifs+numéro d'ordre (pour toutes les assurances c'est
le même numéro en continu)" — numero_generation = année de génération +
numéro d'ordre sur 4 chiffres (ex: "20260112"), une séquence CONTINUE par
cabinet ET par modèle (jamais réinitialisée par année, jamais par
assureur) — voir app/routers/plateforme.py pour la gestion super-admin de
ces séquences.
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


async def _cle_unicite(base, cabinet_code: str, type_releve: str, assurance_numero_enreg: int, souscripteur: str | None, debut: datetime, fin: datetime) -> dict | None:
    """
    § demande utilisateur : "Le nom de l'assurance et la période doivent
    être unique dans la base de données" — retourne le relevé déjà généré
    pour cette combinaison (cabinet, modèle, assureur[, souscripteur],
    période EXACTE), ou None si aucun n'existe encore.
    """
    filtre = {
        "cabinet_code": cabinet_code, "type_releve": type_releve, "assurance_numero_enreg": assurance_numero_enreg,
        "date_debut": debut, "date_fin": fin,
    }
    if type_releve == "simple":
        filtre["souscripteur"] = souscripteur
    return await base[Collections.RELEVE_BONS].find_one(filtre)


def _nouveau_numero_generation(sequence: int) -> str:
    """§ "Année+4 '0' significatifs+numéro d'ordre" — ex: 2026 + 0112 -> "20260112"."""
    return f"{datetime.now().year}{sequence:04d}"


async def _construire_donnees_simple(base, cabinet_code: str, assurance_numero_enreg: int, souscripteur: str, debut: datetime, fin: datetime):
    """Calcule (assurance, lignes_pdf, montant_total) pour le modèle simple — partagé entre première génération et régénération."""
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
    return assurance, donnees, lignes_pdf, round(montant_total, 2)


async def _construire_donnees_detaille(base, cabinet_code: str, assurance_numero_enreg: int, debut: datetime, fin: datetime):
    """Calcule (assurance, groupes_par_souscripteur, montant_total) pour le modèle détaillé — partagé entre première génération et régénération."""
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
    return assurance, donnees, list(groupes_par_souscripteur.values()), round(montant_total, 2)


async def _generer_premiere_fois_simple(base, cabinet_code: str, genere_par: str, assurance_numero_enreg: int, souscripteur: str, debut: datetime, fin: datetime) -> dict:
    """§ unicité : refuse (409) si un relevé existe déjà pour cette combinaison — voir _cle_unicite."""
    existant = await _cle_unicite(base, cabinet_code, "simple", assurance_numero_enreg, souscripteur, debut, fin)
    if existant:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Un relevé simple existe déjà pour cet assureur/souscripteur sur cette période (n°{existant['numero_generation']}) — utilisez le bouton \"Régénérer\" de l'historique pour le rafraîchir.")

    assurance, donnees, lignes_pdf, montant_total = await _construire_donnees_simple(base, cabinet_code, assurance_numero_enreg, souscripteur, debut, fin)
    cabinet = await _obtenir_cabinet(base, cabinet_code)
    numero_generation = _nouveau_numero_generation(await prochain_numero(f"releve_bons_simple_{cabinet_code}"))
    pdf_octets = generer_pdf_releve_bons_simple(cabinet, assurance, souscripteur, debut, fin, lignes_pdf, numero_generation)

    document = {
        "numero_enreg": await prochain_numero("ReleveBons"),
        "cabinet_code": cabinet_code,
        "numero_generation": numero_generation,
        "type_releve": "simple",
        "assurance_numero_enreg": assurance_numero_enreg,
        "nom_assureur": _intitule_assurance(assurance),
        "souscripteur": souscripteur,
        "nombre_recus": len(donnees),
        "montant_total": montant_total,
        "date_debut": debut,
        "date_fin": fin,
        "date_generation": datetime.utcnow(),
        "genere_par": genere_par,
        "pdf_base64": base64.b64encode(pdf_octets).decode("ascii"),
        "nombre_regenerations": 0,
    }
    await base[Collections.RELEVE_BONS].insert_one(document)
    return document


async def _generer_premiere_fois_detaille(base, cabinet_code: str, genere_par: str, assurance_numero_enreg: int, debut: datetime, fin: datetime) -> dict:
    """§ unicité : refuse (409) si un relevé existe déjà pour cette combinaison — voir _cle_unicite."""
    existant = await _cle_unicite(base, cabinet_code, "detaille", assurance_numero_enreg, None, debut, fin)
    if existant:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Un relevé détaillé existe déjà pour cet assureur sur cette période (n°{existant['numero_generation']}) — utilisez le bouton \"Régénérer\" de l'historique pour le rafraîchir.")

    assurance, donnees, groupes, montant_total = await _construire_donnees_detaille(base, cabinet_code, assurance_numero_enreg, debut, fin)
    cabinet = await _obtenir_cabinet(base, cabinet_code)
    numero_generation = _nouveau_numero_generation(await prochain_numero(f"releve_bons_detaille_{cabinet_code}"))
    pdf_octets = generer_pdf_releve_bons_detaille(cabinet, assurance, debut, fin, groupes, numero_generation)

    document = {
        "numero_enreg": await prochain_numero("ReleveBons"),
        "cabinet_code": cabinet_code,
        "numero_generation": numero_generation,
        "type_releve": "detaille",
        "assurance_numero_enreg": assurance_numero_enreg,
        "nom_assureur": _intitule_assurance(assurance),
        "souscripteur": None,
        "nombre_recus": len(donnees),
        "montant_total": montant_total,
        "date_debut": debut,
        "date_fin": fin,
        "date_generation": datetime.utcnow(),
        "genere_par": genere_par,
        "pdf_base64": base64.b64encode(pdf_octets).decode("ascii"),
        "nombre_regenerations": 0,
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
    """Modèle "standard simple" (§ demande utilisateur) — un couple (assureur, souscripteur), une ligne par reçu. Une seule génération INITIALE par combinaison (assureur, souscripteur, période) — voir _generer_premiere_fois_simple."""
    base = obtenir_base()
    document = await _generer_premiere_fois_simple(
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
    """Modèle "détaillé par souscripteur" (§ demande utilisateur) — un assureur, toutes ses souscripteurs/groupes, détail acte par acte. Une seule génération INITIALE par combinaison (assureur, période) — voir _generer_premiere_fois_detaille."""
    base = obtenir_base()
    document = await _generer_premiere_fois_detaille(
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
    """§ demande utilisateur : "Réimprimer" — le PDF EXACT déjà généré (aucun recalcul), tel que transmis/imprimé la dernière fois (y compris après une régénération)."""
    base = obtenir_base()
    document = await _obtenir_releve_ou_404(base, utilisateur["CodeCabinet"], numero_enreg)
    return _reponse_pdf(document)


@router.post("/{numero_enreg}/regenerer")
async def regenerer_releve(numero_enreg: int, utilisateur: dict = Depends(exiger_role("Comptable"))):
    """
    § demande utilisateur : "On ne peut pas regénérer un nouveau relevé
    mais plutôt utiliser le bouton action dans le tableau historique pour
    'regénérer'" — RAFRAÎCHIT le document EXISTANT (même numero_enreg,
    même numero_generation) à partir des données ACTUELLES (un bon ajouté/
    corrigé depuis peut donc apparaître) ; ne crée JAMAIS un nouveau
    relevé ni ne consomme un nouveau numéro.
    """
    base = obtenir_base()
    cabinet_code = utilisateur["CodeCabinet"]
    original = await _obtenir_releve_ou_404(base, cabinet_code, numero_enreg)

    if original["type_releve"] == "simple":
        assurance, donnees, lignes_pdf, montant_total = await _construire_donnees_simple(base, cabinet_code, original["assurance_numero_enreg"], original["souscripteur"], original["date_debut"], original["date_fin"])
        cabinet = await _obtenir_cabinet(base, cabinet_code)
        pdf_octets = generer_pdf_releve_bons_simple(cabinet, assurance, original["souscripteur"], original["date_debut"], original["date_fin"], lignes_pdf, original["numero_generation"])
    else:
        assurance, donnees, groupes, montant_total = await _construire_donnees_detaille(base, cabinet_code, original["assurance_numero_enreg"], original["date_debut"], original["date_fin"])
        cabinet = await _obtenir_cabinet(base, cabinet_code)
        pdf_octets = generer_pdf_releve_bons_detaille(cabinet, assurance, original["date_debut"], original["date_fin"], groupes, original["numero_generation"])

    valeurs = {
        "nom_assureur": _intitule_assurance(assurance),
        "nombre_recus": len(donnees),
        "montant_total": montant_total,
        "date_generation": datetime.utcnow(),
        "genere_par": utilisateur["Login"],
        "pdf_base64": base64.b64encode(pdf_octets).decode("ascii"),
        "nombre_regenerations": (original.get("nombre_regenerations") or 0) + 1,
    }
    await base[Collections.RELEVE_BONS].update_one({"numero_enreg": numero_enreg, "cabinet_code": cabinet_code}, {"$set": valeurs})
    nouveau = {**original, **valeurs}

    await journaliser_action(utilisateur["Login"], "regeneration_releve_bons", {"numero_enreg": numero_enreg, "numero_generation": original["numero_generation"]}, cabinet_code=cabinet_code)
    nouveau.pop("pdf_base64", None)
    nouveau.pop("_id", None)
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
