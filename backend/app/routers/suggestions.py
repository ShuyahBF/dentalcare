"""
app/routers/suggestions.py
-------------------------------
Module "/admin/suggestions-history" : suivi de toutes les suggestions,
évolutions et corrections discutées pour la plateforme, dont la source de
vérité est le fichier SUGGESTION.MD versionné avec le code (voir
app/utils/suggestions_md.py pour le format attendu).
"""

from fastapi import APIRouter, Depends

from app.core.database import obtenir_base, Collections
from app.core.dependances import exiger_role
from app.utils.suggestions_md import parser_suggestion_md

router = APIRouter(prefix="/api/admin/suggestions-history", tags=["Suggestions (Administrateur)"])


@router.get("")
async def lister_suggestions(utilisateur: dict = Depends(exiger_role("Administrateur"))):
    """Retourne l'historique tel que stocké en base (peuplé par /resynchroniser)."""
    base = obtenir_base()
    curseur = base[Collections.SUGGESTION_HISTORIQUE].find({}).sort("numero_enreg", -1)
    return [s async for s in curseur]


@router.post("/resynchroniser")
async def resynchroniser_depuis_fichier(utilisateur: dict = Depends(exiger_role("Administrateur"))):
    """
    Relit SUGGESTION.MD et remet à jour la collection SuggestionHistorique
    (upsert par numero_enreg). À déclencher depuis l'interface après avoir
    ajouté une nouvelle entrée au fichier.
    """
    base = obtenir_base()
    entrees = parser_suggestion_md()
    for entree in entrees:
        document = entree.model_dump(mode="json")
        await base[Collections.SUGGESTION_HISTORIQUE].update_one(
            {"numero_enreg": entree.numero_enreg}, {"$set": document}, upsert=True
        )
    return {"statut": "resynchronisé", "nombre_entrees": len(entrees)}
