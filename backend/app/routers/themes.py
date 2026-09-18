"""
app/routers/themes.py
--------------------------
§ demande utilisateur : catalogue de thèmes d'interface maintenu par le
super-admin. Lecture (liste des thèmes actifs, pour le sélecteur de chaque
cabinet) ouverte à tout utilisateur authentifié ; création/modification/
suppression réservées au super-admin — voir aussi les champs
Cabinet.theme_code / Cabinet.mode_affichage et leur résolution dans
GET /api/cabinet (app/routers/cabinet.py).
"""

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.database import obtenir_base, Collections
from app.core.dependances import obtenir_utilisateur_courant, exiger_super_admin
from app.models.theme import ThemePlateforme, ThemePlateformeEcriture

router = APIRouter(prefix="/api/themes", tags=["Thèmes"])


@router.get("")
async def lister_themes(utilisateur: dict = Depends(obtenir_utilisateur_courant)):
    """Thèmes actifs du catalogue plateforme, pour le sélecteur de chaque cabinet — accessible à tout utilisateur connecté."""
    base = obtenir_base()
    curseur = base[Collections.THEME_PLATEFORME].find({"actif": True}).sort("nom", 1)
    themes = [t async for t in curseur]
    for t in themes:
        t.pop("_id", None)
    return themes


@router.get("/tous")
async def lister_tous_les_themes(super_admin: dict = Depends(exiger_super_admin)):
    """Catalogue complet, y compris désactivés — pour la gestion super-admin."""
    base = obtenir_base()
    curseur = base[Collections.THEME_PLATEFORME].find({}).sort("nom", 1)
    themes = [t async for t in curseur]
    for t in themes:
        t.pop("_id", None)
    return themes


@router.post("", status_code=status.HTTP_201_CREATED)
async def creer_theme(theme: ThemePlateforme, super_admin: dict = Depends(exiger_super_admin)):
    base = obtenir_base()
    if await base[Collections.THEME_PLATEFORME].find_one({"code": theme.code}):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Ce code de thème existe déjà.")
    await base[Collections.THEME_PLATEFORME].insert_one(theme.model_dump())
    return theme


@router.put("/{code}")
async def modifier_theme(code: str, theme: ThemePlateformeEcriture, super_admin: dict = Depends(exiger_super_admin)):
    base = obtenir_base()
    valeurs = {k: v for k, v in theme.model_dump(exclude_none=True).items()}
    resultat = await base[Collections.THEME_PLATEFORME].update_one({"code": code}, {"$set": valeurs})
    if resultat.matched_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Thème introuvable.")
    return {"statut": "modifié"}


@router.delete("/{code}")
async def supprimer_theme(code: str, super_admin: dict = Depends(exiger_super_admin)):
    base = obtenir_base()
    # Les cabinets ayant choisi ce thème retombent sur le thème par défaut
    # plutôt que de casser leur affichage.
    await base[Collections.CABINET].update_many({"theme_code": code}, {"$set": {"theme_code": None}})
    resultat = await base[Collections.THEME_PLATEFORME].delete_one({"code": code})
    if resultat.deleted_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Thème introuvable.")
    return {"statut": "supprimé"}
