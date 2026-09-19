"""
app/routers/medicaments_locaux.py
--------------------------------------
§ demande utilisateur (saisie des ordonnances) : référentiel de désignations
propres au cabinet, pour les produits absents de VIDAL — voir
app/models/medicament_local.py. Recherché EN PLUS de VIDAL par
RechercheMedicamentOrdonnance.jsx ; créé UNIQUEMENT via /creer-si-absent, à
la confirmation explicite du dentiste en fin de saisie d'ordonnance
("il est demandé s'il faut créer ses nouvelles références").
"""

from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.database import obtenir_base, Collections
from app.core.dependances import exiger_role
from app.utils.compteurs import prochain_numero

router = APIRouter(prefix="/api/medicaments-locaux", tags=["Médicaments locaux (hors VIDAL)"])


@router.get("/rechercher")
async def rechercher_medicaments_locaux(q: str, utilisateur: dict = Depends(exiger_role("Dentiste"))):
    """§ alimente le tag "Nouveau" vs référence déjà connue localement — recherche insensible à la casse, préfixe ou sous-chaîne."""
    if len(q.strip()) < 2:
        return {"results": []}
    base = obtenir_base()
    curseur = base[Collections.MEDICAMENT_LOCAL].find(
        {"cabinet_code": utilisateur["CodeCabinet"], "designation": {"$regex": q.strip(), "$options": "i"}},
        {"_id": 0, "numero_enreg": 1, "designation": 1},
    ).limit(10)
    return {"results": [{"title": d["designation"], "local_id": d["numero_enreg"]} async for d in curseur]}


class CreationMedicamentLocalRequete(BaseModel):
    designation: str


@router.post("/creer-si-absent", status_code=201)
async def creer_medicament_local_si_absent(requete: CreationMedicamentLocalRequete, utilisateur: dict = Depends(exiger_role("Dentiste"))):
    """
    § demande utilisateur : "à la fin de la saisie de l'ordonnance il est
    demandé s'il faut créer ses nouvelles références. Si oui elles seront
    disponibles pour d'autres sessions" — idempotent (jamais de doublon si
    déjà créée entre-temps par une autre ordonnance).
    """
    base = obtenir_base()
    cabinet_code = utilisateur["CodeCabinet"]
    designation = requete.designation.strip().upper()
    if not designation:
        return {"cree": False}
    existant = await base[Collections.MEDICAMENT_LOCAL].find_one({"cabinet_code": cabinet_code, "designation": designation})
    if existant:
        return {"cree": False, "numero_enreg": existant["numero_enreg"]}
    numero_enreg = await prochain_numero("MedicamentLocal")
    document = {
        "numero_enreg": numero_enreg, "cabinet_code": cabinet_code, "designation": designation,
        "cree_par": utilisateur["Login"], "date_creation": datetime.utcnow(),
    }
    await base[Collections.MEDICAMENT_LOCAL].insert_one(document)
    return {"cree": True, "numero_enreg": numero_enreg}
