"""
app/routers/patients.py
---------------------------
CRUD et recherche des patients, + consultation de l'historique complet des
Dossier_Examen d'un patient (§4h du cahier des charges : "Le Dentiste doit
pouvoir consulter, depuis la fiche d'un Patient, l'historique complet de
tous ses Dossier_Examen passés").
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.database import obtenir_base, Collections
from app.core.dependances import obtenir_utilisateur_courant
from app.models.patient import PatientCreation
from app.utils.compteurs import prochain_numero

router = APIRouter(prefix="/api/patients", tags=["Patients"])


@router.get("")
async def lister_patients(recherche: str | None = None, limite: int = 50, utilisateur: dict = Depends(obtenir_utilisateur_courant)):
    """
    Liste/recherche des patients. La recherche porte sur le nom, les
    prénoms ou le téléphone (utilisé par l'autocomplétion caisse).
    """
    base = obtenir_base()
    filtre = {"Etat_En_Cours": 1}
    if recherche:
        filtre["$or"] = [
            {"Nom": {"$regex": recherche, "$options": "i"}},
            {"Prénoms": {"$regex": recherche, "$options": "i"}},
            {"Téléphone": {"$regex": recherche, "$options": "i"}},
        ]
    curseur = base[Collections.PATIENT].find(filtre).sort("Date Création", -1).limit(limite)
    return [p async for p in curseur]


@router.get("/{numero_enreg}")
async def obtenir_patient(numero_enreg: int, utilisateur: dict = Depends(obtenir_utilisateur_courant)):
    base = obtenir_base()
    patient = await base[Collections.PATIENT].find_one({"Numéro_Enreg": numero_enreg})
    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient introuvable.")
    return patient


@router.get("/{numero_enreg}/dossiers")
async def historique_dossiers_patient(numero_enreg: int, utilisateur: dict = Depends(obtenir_utilisateur_courant)):
    """Historique complet des Dossier_Examen d'un patient (§4h), le plus récent en premier."""
    base = obtenir_base()
    curseur = base[Collections.DOSSIER_EXAMEN].find({"Client": numero_enreg}).sort("DateHeure_Creation", -1)
    return [d async for d in curseur]


@router.post("", status_code=status.HTTP_201_CREATED)
async def creer_patient(patient: PatientCreation, utilisateur: dict = Depends(obtenir_utilisateur_courant)):
    base = obtenir_base()
    numero_enreg = await prochain_numero("Patient", valeur_depart=100000)
    document = patient.model_dump(by_alias=True, exclude_none=True)
    document.update({
        "Numéro_Enreg": numero_enreg,
        "ID_Patient": numero_enreg,
        "Date Création": datetime.utcnow(),
        "Etat_En_Cours": 1,
        "NbVues": 0,
        "NbModifications": 0,
        "Consulteur": utilisateur["Login"],
    })
    await base[Collections.PATIENT].insert_one(document)
    return document


@router.put("/{numero_enreg}")
async def modifier_patient(numero_enreg: int, patient: PatientCreation, utilisateur: dict = Depends(obtenir_utilisateur_courant)):
    base = obtenir_base()
    mise_a_jour = patient.model_dump(by_alias=True, exclude_none=True)
    mise_a_jour.update({
        "Dateheure_dernierModification": datetime.utcnow(),
        "Modifieur": utilisateur["Login"],
    })
    resultat = await base[Collections.PATIENT].update_one(
        {"Numéro_Enreg": numero_enreg},
        {"$set": mise_a_jour, "$inc": {"NbModifications": 1}},
    )
    if resultat.matched_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient introuvable.")
    return {"statut": "modifié"}
