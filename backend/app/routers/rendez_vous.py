"""
app/routers/rendez_vous.py
------------------------------
Le Secrétariat Cabinet confirme ou modifie le rendez-vous à partir du
reçu/proforma établi par le Caissier (§4e du cahier des charges).
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.database import obtenir_base, Collections
from app.core.dependances import obtenir_utilisateur_courant, exiger_role
from app.models.rendez_vous import RendezVous
from app.utils.compteurs import prochain_numero, prochain_numero_cabinet

router = APIRouter(prefix="/api/rendez-vous", tags=["Rendez-vous (Secrétariat)"])


@router.get("")
async def lister_rendez_vous(
    dentiste_numero_enreg: int | None = None,
    date_debut: str | None = None,
    date_fin: str | None = None,
    utilisateur: dict = Depends(obtenir_utilisateur_courant),
):
    base = obtenir_base()
    filtre: dict = {"cabinet_code": utilisateur["CodeCabinet"]}
    if dentiste_numero_enreg:
        filtre["dentiste_numero_enreg"] = dentiste_numero_enreg
    if date_debut or date_fin:
        filtre["date_heure_debut"] = {}
        if date_debut:
            filtre["date_heure_debut"]["$gte"] = datetime.fromisoformat(date_debut)
        if date_fin:
            filtre["date_heure_debut"]["$lte"] = datetime.fromisoformat(date_fin)
    curseur = base[Collections.RENDEZ_VOUS].find(filtre).sort("date_heure_debut", 1)
    return [rv async for rv in curseur]


@router.post("", status_code=status.HTTP_201_CREATED)
async def creer_rendez_vous(rendez_vous: RendezVous, utilisateur: dict = Depends(exiger_role("Secrétariat Cabinet", "Caissier"))):
    base = obtenir_base()
    cabinet_code = utilisateur["CodeCabinet"]
    numero_enreg = await prochain_numero("RendezVous", valeur_depart=1000)
    # Référence humaine à 8 caractères, propre au cabinet + année en cours
    # (§ demande utilisateur), ex: "00010027".
    reference = await prochain_numero_cabinet("rdv", cabinet_code)
    document = rendez_vous.model_dump()
    document["numero_enreg"] = numero_enreg
    document["reference"] = reference
    document["cabinet_code"] = cabinet_code
    document["cree_par"] = utilisateur["Login"]
    await base[Collections.RENDEZ_VOUS].insert_one(document)
    document.pop("_id", None)
    return document


@router.put("/{numero_enreg}/statut")
async def modifier_statut_rendez_vous(numero_enreg: int, statut: str, utilisateur: dict = Depends(exiger_role("Secrétariat Cabinet"))):
    base = obtenir_base()
    resultat = await base[Collections.RENDEZ_VOUS].update_one(
        {"numero_enreg": numero_enreg, "cabinet_code": utilisateur["CodeCabinet"]}, {"$set": {"statut": statut}}
    )
    if resultat.matched_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rendez-vous introuvable.")
    return {"statut": "mis à jour"}
