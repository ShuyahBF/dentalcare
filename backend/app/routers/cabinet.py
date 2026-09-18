"""
app/routers/cabinet.py
--------------------------
Paramétrage de la fiche du PROPRE cabinet de l'utilisateur courant (logo,
dénomination, géolocalisation, dentiste principal + équipe, papier entête,
devise, bas de page, année de création) — §9 du cahier des charges. Depuis
le passage à l'architecture SaaS multi-cabinets, ce n'est plus un document
unique en base : chaque cabinet a le sien, retrouvé via le cabinet_code de
l'utilisateur connecté. La gestion de l'ENSEMBLE des cabinets de la
plateforme (création, état d'abonnement) est réservée au super-admin — voir
app/routers/plateforme.py.
"""

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.database import obtenir_base, Collections
from app.core.dependances import obtenir_utilisateur_courant, exiger_role

router = APIRouter(prefix="/api/cabinet", tags=["Cabinet (Administrateur)"])


@router.get("")
async def obtenir_cabinet(utilisateur: dict = Depends(obtenir_utilisateur_courant)):
    """
    Route accessible à tous les rôles connectés (du propre cabinet de
    l'utilisateur) : le logo/nom du cabinet doit s'afficher dans la sidebar
    de toutes les interfaces (§7).
    """
    base = obtenir_base()
    cabinet = await base[Collections.CABINET].find_one({"code_cabinet": utilisateur["CodeCabinet"]})
    if not cabinet:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cabinet introuvable.")
    return cabinet


@router.put("")
async def modifier_cabinet(donnees: dict, utilisateur: dict = Depends(exiger_role("Administrateur"))):
    """
    L'Administrateur ne peut modifier QUE la fiche de SON PROPRE cabinet —
    jamais code_cabinet, etat, ni date_creation, réservés au super-admin
    plateforme (voir app/routers/plateforme.py).
    """
    base = obtenir_base()
    valeurs = {k: v for k, v in donnees.items() if k not in ("code_cabinet", "etat", "date_creation", "elements_reproduits_a_la_creation", "cabinet_modele_code")}
    resultat = await base[Collections.CABINET].update_one({"code_cabinet": utilisateur["CodeCabinet"]}, {"$set": valeurs})
    if resultat.matched_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cabinet introuvable.")
    return {"statut": "modifié"}
