"""
app/routers/utilisateurs.py
--------------------------------
Gestion des comptes utilisateurs et de leurs droits (§9 module
Administrateur). Réservé au rôle Administrateur.
"""

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.database import obtenir_base, Collections
from app.core.dependances import exiger_role
from app.core.security import hacher_mot_de_passe
from app.models.utilisateur import UtilisateurCreation
from app.utils.compteurs import prochain_numero
from app.utils.audit import journaliser_action

router = APIRouter(prefix="/api/utilisateurs", tags=["Comptes utilisateurs (Administrateur)"])


@router.get("")
async def lister_utilisateurs(utilisateur: dict = Depends(exiger_role("Administrateur"))):
    base = obtenir_base()
    curseur = base[Collections.UTILISATEUR_BLG].find({}, {"mot_de_passe_hache": 0})  # jamais exposer le hash
    return [u async for u in curseur]


@router.post("", status_code=status.HTTP_201_CREATED)
async def creer_utilisateur(nouveau: UtilisateurCreation, utilisateur: dict = Depends(exiger_role("Administrateur"))):
    base = obtenir_base()
    existant = await base[Collections.UTILISATEUR_BLG].find_one({"Login": nouveau.login})
    if existant:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ce login existe déjà.")

    numero_enreg = await prochain_numero("UtilisateurBlg", valeur_depart=1)
    document = nouveau.model_dump(by_alias=True, exclude={"mot_de_passe"})
    document.update({
        "Numéro_Enreg": numero_enreg,
        "mot_de_passe_hache": hacher_mot_de_passe(nouveau.mot_de_passe),
    })
    await base[Collections.UTILISATEUR_BLG].insert_one(document)
    await journaliser_action(utilisateur["Login"], "creation_compte", {"login": nouveau.login, "role": nouveau.role})

    document.pop("_id", None)
    document.pop("mot_de_passe_hache", None)
    return document


@router.put("/{login}/mot-de-passe")
async def reinitialiser_mot_de_passe(login: str, nouveau_mot_de_passe: str, utilisateur: dict = Depends(exiger_role("Administrateur"))):
    base = obtenir_base()
    resultat = await base[Collections.UTILISATEUR_BLG].update_one(
        {"Login": login}, {"$set": {"mot_de_passe_hache": hacher_mot_de_passe(nouveau_mot_de_passe)}}
    )
    if resultat.matched_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Utilisateur introuvable.")
    await journaliser_action(utilisateur["Login"], "reinitialisation_mot_de_passe", {"login": login})
    return {"statut": "mot de passe réinitialisé"}


@router.put("/{login}/statut")
async def activer_desactiver_utilisateur(login: str, actif: bool, utilisateur: dict = Depends(exiger_role("Administrateur"))):
    base = obtenir_base()
    resultat = await base[Collections.UTILISATEUR_BLG].update_one({"Login": login}, {"$set": {"actif": actif}})
    if resultat.matched_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Utilisateur introuvable.")
    return {"statut": "actif" if actif else "désactivé"}
