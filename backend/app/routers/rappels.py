"""
app/routers/rappels.py
--------------------------
Système de rappels automatisables (contrôle 6 mois, relance de devis, suivi
post-opératoire) — pratique standard des logiciels dentaires internationaux,
ajoutée au-delà du cahier des charges initial pour améliorer le suivi
patient.
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.database import obtenir_base, Collections
from app.core.dependances import obtenir_utilisateur_courant, exiger_role
from app.models.rendez_vous import Rappel
from app.utils.compteurs import prochain_numero
from app.utils.whatsapp import generer_lien_whatsapp

router = APIRouter(prefix="/api/rappels", tags=["Rappels patients"])


@router.get("/a-envoyer")
async def rappels_a_envoyer(utilisateur: dict = Depends(obtenir_utilisateur_courant)):
    """Rappels dont la date prévue est atteinte et qui n'ont pas encore été envoyés."""
    base = obtenir_base()
    curseur = base[Collections.RAPPEL].find({"envoye": False, "date_prevue": {"$lte": datetime.utcnow()}}).sort("date_prevue", 1)
    return [r async for r in curseur]


@router.post("", status_code=status.HTTP_201_CREATED)
async def creer_rappel(rappel: Rappel, utilisateur: dict = Depends(exiger_role("Dentiste", "Secrétariat Cabinet"))):
    base = obtenir_base()
    numero_enreg = await prochain_numero("Rappel", valeur_depart=1000)
    document = rappel.model_dump()
    document["numero_enreg"] = numero_enreg
    await base[Collections.RAPPEL].insert_one(document)
    document.pop("_id", None)
    return document


@router.get("/{numero_enreg}/lien-whatsapp")
async def lien_whatsapp_rappel(numero_enreg: int, utilisateur: dict = Depends(obtenir_utilisateur_courant)):
    base = obtenir_base()
    rappel = await base[Collections.RAPPEL].find_one({"numero_enreg": numero_enreg})
    if not rappel:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rappel introuvable.")
    patient = await base[Collections.PATIENT].find_one({"Numéro_Enreg": rappel["patient_numero_enreg"]})
    if not patient or not patient.get("Téléphone"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Le patient n'a pas de numéro de téléphone enregistré.")

    message = rappel.get("message") or f"Bonjour {patient.get('Nom', '')}, ceci est un rappel ({rappel['type_rappel']}) de la part de SAWALI DentalCare."
    lien = generer_lien_whatsapp(patient["Téléphone"], message)

    await base[Collections.RAPPEL].update_one(
        {"numero_enreg": numero_enreg}, {"$set": {"envoye": True, "date_envoi": datetime.utcnow()}}
    )
    return {"lien_whatsapp": lien}
