"""
app/routers/auth.py
-----------------------
Route de connexion : vérifie le login/mot de passe contre UtilisateurBlg et
retourne un JWT contenant le rôle (utilisé ensuite pour le contrôle d'accès
côté serveur sur toutes les autres routes).
"""

from datetime import datetime

from fastapi import APIRouter, HTTPException, status

from app.core.database import obtenir_base, Collections
from app.core.security import verifier_mot_de_passe, creer_jeton_acces
from app.models.utilisateur import UtilisateurConnexion, JetonAcces
from app.utils.audit import journaliser_action

router = APIRouter(prefix="/api/auth", tags=["Authentification"])


@router.post("/connexion", response_model=JetonAcces)
async def connexion(identifiants: UtilisateurConnexion):
    base = obtenir_base()
    utilisateur = await base[Collections.UTILISATEUR_BLG].find_one({"Login": identifiants.login})

    if not utilisateur or not verifier_mot_de_passe(identifiants.mot_de_passe, utilisateur["mot_de_passe_hache"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Login ou mot de passe incorrect.",
        )
    if not utilisateur.get("actif", True):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Ce compte est désactivé.")

    # § demande utilisateur (architecture SaaS multi-cabinets) : pas de
    # sélecteur de cabinet à la connexion — c'est le couple login/mot de
    # passe seul qui détermine le cabinet. Un compte super-admin plateforme
    # n'est rattaché à aucun cabinet et n'est donc pas concerné par ce
    # contrôle d'état d'abonnement.
    if not utilisateur.get("EstSuperAdmin") and utilisateur.get("CodeCabinet"):
        cabinet = await base[Collections.CABINET].find_one({"code_cabinet": utilisateur["CodeCabinet"]})
        if not cabinet:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cabinet introuvable pour ce compte.")
        if cabinet.get("etat") != "Actif":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"L'accès de votre cabinet est actuellement « {cabinet.get('etat')} ». Contactez votre administrateur ou SAWALI SMART SYSTEMS.",
            )

    jeton = creer_jeton_acces({"sub": utilisateur["Login"], "role": utilisateur["role"]})

    # Traçabilité de la dernière connexion (repris du champ legacy DH_DernCnx)
    await base[Collections.UTILISATEUR_BLG].update_one(
        {"Login": identifiants.login},
        {"$set": {"DH_DernCnx": datetime.utcnow()}},
    )
    await journaliser_action(identifiants.login, "connexion")

    return JetonAcces(
        access_token=jeton,
        role=utilisateur["role"],
        login=utilisateur["Login"],
        nom_complet=utilisateur.get("nom_complet"),
        est_super_admin=utilisateur.get("EstSuperAdmin", False),
    )
