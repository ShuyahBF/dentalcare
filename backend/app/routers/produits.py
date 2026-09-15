"""
app/routers/produits.py
---------------------------
Consultation et gestion du catalogue ProduitClinique (les actes dentaires et
leurs tarifs). La recherche/autocomplétion (§4b : "saisir chaque acte au
clavier (recherche/autocomplete sur le catalogue ProduitClinique)") est
utilisée par l'interface Caisse.
"""

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.database import obtenir_base, Collections
from app.core.dependances import obtenir_utilisateur_courant, exiger_role
from app.models.produit_clinique import ProduitCliniqueBase

router = APIRouter(prefix="/api/produits", tags=["Catalogue des actes"])


@router.get("")
async def lister_produits(recherche: str | None = None, domaine: str | None = None, utilisateur: dict = Depends(obtenir_utilisateur_courant)):
    base = obtenir_base()
    filtre: dict = {}
    if recherche:
        filtre["Libellé"] = {"$regex": recherche, "$options": "i"}
    if domaine:
        filtre["Domaine"] = domaine
    curseur = base[Collections.PRODUIT_CLINIQUE].find(filtre).sort("Libellé", 1)
    return [p async for p in curseur]


@router.get("/domaines")
async def lister_domaines(utilisateur: dict = Depends(obtenir_utilisateur_courant)):
    """Retourne la liste des 6 domaines distincts présents en base, pour le regroupement de l'interface caisse."""
    base = obtenir_base()
    domaines = await base[Collections.PRODUIT_CLINIQUE].distinct("Domaine")
    return sorted([d for d in domaines if d])


@router.post("", status_code=status.HTTP_201_CREATED)
async def creer_produit(produit: ProduitCliniqueBase, utilisateur: dict = Depends(exiger_role("Administrateur"))):
    """Ajout d'un acte au catalogue — réservé à l'Administrateur (§9)."""
    base = obtenir_base()
    document = produit.model_dump(by_alias=True)
    await base[Collections.PRODUIT_CLINIQUE].update_one(
        {"Code Produit": produit.code_produit}, {"$set": document}, upsert=True
    )
    return document


@router.put("/{code_produit}")
async def modifier_produit(code_produit: int, produit: ProduitCliniqueBase, utilisateur: dict = Depends(exiger_role("Administrateur"))):
    base = obtenir_base()
    resultat = await base[Collections.PRODUIT_CLINIQUE].update_one(
        {"Code Produit": code_produit}, {"$set": produit.model_dump(by_alias=True)}
    )
    if resultat.matched_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Acte introuvable.")
    return {"statut": "modifié"}
