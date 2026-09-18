"""
app/routers/types_paiement.py
----------------------------------
Gestion des modes de règlement paramétrables (Espèces, Orange Money, Moov
Money, etc.) depuis le module Administrateur, consommée par la Caisse pour
peupler son sélecteur de mode de règlement.
"""

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.database import obtenir_base, Collections
from app.core.dependances import obtenir_utilisateur_courant, exiger_role
from app.models.type_paiement import TypePaiement
from app.utils.compteurs import prochain_numero

router = APIRouter(prefix="/api/types-paiement", tags=["Modes de paiement"])


@router.get("")
async def lister_types_paiement(inclure_inactifs: bool = False, utilisateur: dict = Depends(obtenir_utilisateur_courant)):
    """
    Liste des modes de règlement. Par défaut ne retourne que les modes
    actifs (utilisé par le sélecteur de la Caisse) ; l'Administration peut
    demander inclure_inactifs=true pour tout voir et gérer.
    """
    base = obtenir_base()
    filtre = {"cabinet_code": utilisateur["CodeCabinet"]}
    if not inclure_inactifs:
        filtre["actif"] = True
    curseur = base[Collections.TYPE_PAIEMENT].find(filtre).sort("numero_enreg", 1)
    return [t async for t in curseur]


@router.post("", status_code=status.HTTP_201_CREATED)
async def creer_type_paiement(donnees: dict, utilisateur: dict = Depends(exiger_role("Administrateur"))):
    base = obtenir_base()
    numero_enreg = await prochain_numero("TypePaiement", valeur_depart=1)
    type_paiement = TypePaiement(numero_enreg=numero_enreg, **{k: v for k, v in donnees.items() if k != "numero_enreg"})
    document = type_paiement.model_dump()
    document["cabinet_code"] = utilisateur["CodeCabinet"]
    await base[Collections.TYPE_PAIEMENT].insert_one(document)
    return type_paiement


@router.put("/{numero_enreg}")
async def modifier_type_paiement(numero_enreg: int, donnees: dict, utilisateur: dict = Depends(exiger_role("Administrateur"))):
    base = obtenir_base()
    valeurs = {k: v for k, v in donnees.items() if k in ("nom", "exige_reference", "actif")}
    resultat = await base[Collections.TYPE_PAIEMENT].update_one({"numero_enreg": numero_enreg, "cabinet_code": utilisateur["CodeCabinet"]}, {"$set": valeurs})
    if resultat.matched_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Mode de paiement introuvable.")
    return {"statut": "modifié"}


@router.delete("/{numero_enreg}")
async def supprimer_type_paiement(numero_enreg: int, utilisateur: dict = Depends(exiger_role("Administrateur"))):
    base = obtenir_base()
    resultat = await base[Collections.TYPE_PAIEMENT].delete_one({"numero_enreg": numero_enreg, "cabinet_code": utilisateur["CodeCabinet"]})
    if resultat.deleted_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Mode de paiement introuvable.")
    return {"statut": "supprimé"}
