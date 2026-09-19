"""
app/routers/verification.py
--------------------------------
Routes PUBLIQUES (aucune authentification) : accessibles en scannant le QR
code imprimé sur un état de caisse ou une ordonnance (§ demande
utilisateur). La sécurité repose entièrement sur la SIGNATURE du jeton
(voir app/utils/verification_documents.py) — impossible à forger sans la
clé secrète du serveur — jamais sur le secret de l'URL elle-même.

§ demande utilisateur : "le patient se rendant en pharmacie donne la
possibilité d'ouvrir un lien permettant à l'officine de vérifier, servir...
Le médecin qui a émis l'ordonnance peut avoir le retour d'informations."
"""

from datetime import datetime

from fastapi import APIRouter, HTTPException, status

from app.core.database import obtenir_base, Collections
from app.models.service_officine import ServiceOfficineEcriture
from app.utils.compteurs import prochain_numero
from app.utils.formatage import identite_patient_affichee
from app.utils.verification_documents import decoder_jeton_verification

router = APIRouter(prefix="/api/verification", tags=["Vérification publique (QR codes)"])


def _jeton_ou_404(jeton: str, type_document: str) -> dict:
    donnees = decoder_jeton_verification(jeton, type_document)
    if not donnees:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lien de vérification invalide ou document non reconnu.")
    return donnees


@router.get("/etat-caisse/{jeton}")
async def verifier_etat_caisse(jeton: str):
    """
    § demande utilisateur : QR "Cabinet, Caissier, Montants, nombre de
    lignes" — ces 4 informations SONT le jeton lui-même (signées à la
    génération du PDF, voir generer_pdf_etat_de_caisse), donc affichées ici
    telles quelles, sans nouvelle requête sur les ventes — le document est
    authentique si et seulement si le jeton se décode, ce qui suffit à
    prouver qu'il n'a pas été altéré depuis son émission par le serveur.
    """
    donnees = _jeton_ou_404(jeton, "etat-caisse")
    base = obtenir_base()
    cabinet = await base[Collections.CABINET].find_one({"code_cabinet": donnees.get("cabinet_code")})
    return {
        "cabinet_denomination": cabinet.get("denomination") if cabinet else donnees.get("cabinet_code"),
        "caissier": donnees.get("caissier"),
        "montant_total": donnees.get("montant_total"),
        "nombre_lignes": donnees.get("nombre_lignes"),
    }


@router.get("/ordonnance/{jeton}")
async def verifier_ordonnance(jeton: str):
    """
    § demande utilisateur : contrairement à l'état de caisse, le jeton
    n'encode QUE la référence — le contenu (lignes prescrites, patient,
    services déjà rendus par d'autres officines) est relu EN DIRECT depuis
    la base à chaque ouverture, pour rester à jour même après impression.
    """
    donnees = _jeton_ou_404(jeton, "ordonnance")
    base = obtenir_base()
    cabinet_code = donnees.get("cabinet_code")
    reference = donnees.get("ordonnance_reference")
    ordonnance = await base[Collections.ORDONNANCE].find_one({"reference": reference, "cabinet_code": cabinet_code})
    if not ordonnance:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cette ordonnance n'existe plus.")
    cabinet = await base[Collections.CABINET].find_one({"code_cabinet": cabinet_code})
    patient = await base[Collections.PATIENT].find_one({"Numéro_Enreg": ordonnance.get("patient_numero_enreg"), "cabinet_code": cabinet_code}) or {}
    services = [s async for s in base[Collections.SERVICE_OFFICINE].find({"ordonnance_reference": reference, "cabinet_code": cabinet_code}).sort("date_service", -1)]
    for s in services:
        s.pop("_id", None)
    return {
        "reference": ordonnance.get("reference"),
        "date_creation": ordonnance.get("date_creation"),
        "lignes": ordonnance.get("lignes", []),
        "cabinet_denomination": cabinet.get("denomination") if cabinet else cabinet_code,
        "dentiste_nom": ordonnance.get("dentiste_nom"),
        "patient_affiche": identite_patient_affichee({"Libellé": f"{patient.get('Nom', '')} {patient.get('Prénoms', '')}".strip()}) if patient else None,
        "services_deja_rendus": services,
    }


@router.post("/ordonnance/{jeton}/servir")
async def servir_ordonnance(jeton: str, payload: ServiceOfficineEcriture):
    """
    § demande utilisateur : formulaire rempli par l'officine, "en fonction
    des quantités disponibles chez eux" (chaque ligne indique disponible/
    quantité servie). cabinet_code et ordonnance_reference viennent
    EXCLUSIVEMENT du jeton signé, jamais du corps envoyé par l'officine —
    impossible d'enregistrer un service sur une ordonnance qu'on ne peut
    pas prouver avoir légitimement scannée.
    """
    donnees = _jeton_ou_404(jeton, "ordonnance")
    base = obtenir_base()
    cabinet_code = donnees.get("cabinet_code")
    reference = donnees.get("ordonnance_reference")
    ordonnance = await base[Collections.ORDONNANCE].find_one({"reference": reference, "cabinet_code": cabinet_code})
    if not ordonnance:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cette ordonnance n'existe plus.")

    document = payload.model_dump()
    document["numero_enreg"] = await prochain_numero("ServiceOfficine", valeur_depart=1000)
    document["cabinet_code"] = cabinet_code
    document["ordonnance_reference"] = reference
    document["date_service"] = datetime.utcnow()
    await base[Collections.SERVICE_OFFICINE].insert_one(document)
    document.pop("_id", None)
    return document
