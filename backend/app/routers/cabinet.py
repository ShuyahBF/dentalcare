"""
app/routers/cabinet.py
--------------------------
Paramétrage de la fiche Cabinet (logo, dénomination, géolocalisation,
dentiste principal + équipe, papier entête, devise, bas de page, année de
création) — §9 du cahier des charges. Document unique en base.
"""

from fastapi import APIRouter, Depends

from app.core.database import obtenir_base, Collections
from app.core.dependances import obtenir_utilisateur_courant, exiger_role
from app.models.cabinet import Cabinet

router = APIRouter(prefix="/api/cabinet", tags=["Cabinet (Administrateur)"])


@router.get("")
async def obtenir_cabinet(utilisateur: dict = Depends(obtenir_utilisateur_courant)):
    """
    Route publique-métier (accessible à tous les rôles connectés) : le
    logo/nom du cabinet doit s'afficher dans la sidebar de toutes les
    interfaces (§7).
    """
    base = obtenir_base()
    cabinet = await base[Collections.CABINET].find_one({})
    return cabinet or Cabinet().model_dump()


@router.put("")
async def modifier_cabinet(cabinet: Cabinet, utilisateur: dict = Depends(exiger_role("Administrateur"))):
    base = obtenir_base()
    await base[Collections.CABINET].update_one({}, {"$set": cabinet.model_dump()}, upsert=True)
    return cabinet
