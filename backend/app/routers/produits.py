"""
app/routers/produits.py
---------------------------
Consultation et gestion du catalogue ProduitClinique (les actes dentaires et
leurs tarifs). La recherche/autocomplétion (§4b : "saisir chaque acte au
clavier (recherche/autocomplete sur le catalogue ProduitClinique)") est
utilisée par l'interface Caisse.
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.database import obtenir_base, Collections
from app.core.dependances import obtenir_utilisateur_courant, exiger_role
from app.models.produit_clinique import ProduitCliniqueBase

router = APIRouter(prefix="/api/produits", tags=["Catalogue des actes"])


@router.get("")
async def lister_produits(recherche: str | None = None, domaine: str | None = None, inclure_inactifs: bool = False, utilisateur: dict = Depends(obtenir_utilisateur_courant)):
    """
    § tri par Libellé INCHANGÉ volontairement — cette route sert aussi
    l'autocomplétion de la Caisse (recherche d'un acte au clavier), où
    l'ordre alphabétique est essentiel. `derniere_activite` (§ principe
    permanent) est calculée et exposée pour l'affichage seulement, jamais
    utilisée pour retrier ici.
    """
    base = obtenir_base()
    filtre: dict = {"cabinet_code": utilisateur["CodeCabinet"]}
    if not inclure_inactifs:
        # Seuls les actes actifs apparaissent dans les listes de la Caisse
        # (recherche rapide + schéma dentaire). Rétrocompatible : un
        # document créé avant l'ajout du champ "Actif" est considéré actif
        # par défaut (absence de champ != False).
        filtre["Actif"] = {"$ne": False}
    if recherche:
        filtre["Libellé"] = {"$regex": recherche, "$options": "i"}
    if domaine:
        filtre["Domaine"] = domaine
    curseur = base[Collections.PRODUIT_CLINIQUE].find(filtre).sort("Libellé", 1)
    produits = [p async for p in curseur]
    for p in produits:
        creation = p.get("DateHeure_Creation")
        modification = p.get("DateHeure_Modification")
        p["derniere_activite"] = max(filter(None, [creation, modification])) if (creation or modification) else None
    return produits


@router.get("/domaines")
async def lister_domaines(utilisateur: dict = Depends(obtenir_utilisateur_courant)):
    """Retourne la liste des 6 domaines distincts présents en base, pour le regroupement de l'interface caisse."""
    base = obtenir_base()
    domaines = await base[Collections.PRODUIT_CLINIQUE].distinct("Domaine", {"cabinet_code": utilisateur["CodeCabinet"]})
    return sorted([d for d in domaines if d])


@router.post("", status_code=status.HTTP_201_CREATED)
async def creer_produit(produit: ProduitCliniqueBase, utilisateur: dict = Depends(exiger_role("Administrateur"))):
    """Ajout d'un acte au catalogue — réservé à l'Administrateur (§9)."""
    base = obtenir_base()
    document = produit.model_dump(by_alias=True)
    document["cabinet_code"] = utilisateur["CodeCabinet"]
    document["DateHeure_Creation"] = datetime.utcnow()
    await base[Collections.PRODUIT_CLINIQUE].update_one(
        {"Code Produit": produit.code_produit, "cabinet_code": utilisateur["CodeCabinet"]}, {"$set": document}, upsert=True
    )
    return document


@router.put("/{code_produit}")
async def modifier_produit(code_produit: int, produit: ProduitCliniqueBase, utilisateur: dict = Depends(exiger_role("Administrateur"))):
    base = obtenir_base()
    valeurs = produit.model_dump(by_alias=True)
    valeurs["DateHeure_Modification"] = datetime.utcnow()
    resultat = await base[Collections.PRODUIT_CLINIQUE].update_one(
        {"Code Produit": code_produit, "cabinet_code": utilisateur["CodeCabinet"]}, {"$set": valeurs}
    )
    if resultat.matched_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Acte introuvable.")
    return {"statut": "modifié"}
