"""
app/routers/souscripteurs.py
--------------------------------
§ demande utilisateur : référentiel des souscripteurs (personnes physiques
ou morales ayant signé une convention avec une compagnie d'assurance),
alimenté au fil des saisies plutôt que pré-rempli — "la liste des
souscripteurs doit être dynamique". Aucune modification/suppression
exposée pour l'instant : uniquement rechercher et ajouter à la demande
(voir POST, utilisé par la Caisse quand l'utilisateur confirme vouloir
mémoriser un nouveau nom saisi qui ne correspond à aucun souscripteur
existant).
"""

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.database import obtenir_base, Collections
from app.core.dependances import obtenir_utilisateur_courant, exiger_role
from app.models.souscripteur import Souscripteur
from app.utils.compteurs import prochain_numero

router = APIRouter(prefix="/api/souscripteurs", tags=["Souscripteurs"])


@router.get("")
async def lister_souscripteurs(q: str | None = None, utilisateur: dict = Depends(obtenir_utilisateur_courant)):
    """Liste/recherche (autocomplétion) — `q` filtre par sous-chaîne du nom, insensible à la casse."""
    base = obtenir_base()
    filtre: dict = {"cabinet_code": utilisateur["CodeCabinet"]}
    if q:
        filtre["nom"] = {"$regex": q, "$options": "i"}
    curseur = base[Collections.SOUSCRIPTEUR].find(filtre).sort("nom", 1)
    return [s async for s in curseur]


@router.post("", status_code=status.HTTP_201_CREATED)
async def creer_souscripteur(donnees: dict, utilisateur: dict = Depends(exiger_role("Caissier"))):
    """
    Mémorise un nouveau souscripteur — appelé uniquement après confirmation
    explicite de l'utilisateur (§ demande utilisateur : "demander s'il faut
    mémoriser ce souscripteur"), jamais automatiquement.
    """
    base = obtenir_base()
    nom = (donnees.get("nom") or "").strip()
    if not nom:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Le nom du souscripteur est obligatoire.")
    cabinet_code = utilisateur["CodeCabinet"]
    existant = await base[Collections.SOUSCRIPTEUR].find_one({"nom": nom, "cabinet_code": cabinet_code})
    if existant:
        return existant
    numero_enreg = await prochain_numero("Souscripteur", valeur_depart=1)
    souscripteur = Souscripteur(numero_enreg=numero_enreg, cabinet_code=cabinet_code, nom=nom)
    document = souscripteur.model_dump()
    await base[Collections.SOUSCRIPTEUR].insert_one(dict(document))
    return document
