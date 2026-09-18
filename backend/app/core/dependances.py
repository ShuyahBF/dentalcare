"""
app/core/dependances.py
---------------------------
Dépendances FastAPI réutilisées dans tous les routeurs :
  - obtenir_utilisateur_courant : décode le JWT envoyé dans l'en-tête
    Authorization et vérifie que l'utilisateur existe toujours et est actif
  - exiger_role(...) : fabrique de dépendance qui restreint l'accès à une
    route à une liste de rôles autorisés (contrôle d'accès serveur, §10)
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

from app.core.database import obtenir_base, Collections
from app.core.security import decoder_jeton_acces

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/connexion")


async def obtenir_utilisateur_courant(jeton: str = Depends(oauth2_scheme)) -> dict:
    exception_identification = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Session invalide ou expirée, veuillez vous reconnecter.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    donnees = decoder_jeton_acces(jeton)
    if donnees is None:
        raise exception_identification

    login = donnees.get("sub")
    base = obtenir_base()
    utilisateur = await base[Collections.UTILISATEUR_BLG].find_one({"Login": login})
    if utilisateur is None or not utilisateur.get("actif", True):
        raise exception_identification
    return utilisateur


def exiger_role(*roles_autorises: str):
    """
    Utilisation : Depends(exiger_role("Administrateur", "Comptable"))
    L'Administrateur a par construction tous les droits (§ description des
    rôles), donc il est toujours implicitement autorisé.
    """

    async def verificateur(utilisateur: dict = Depends(obtenir_utilisateur_courant)) -> dict:
        role = utilisateur.get("role")
        if role != "Administrateur" and role not in roles_autorises:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Accès refusé : cette action nécessite l'un des rôles {roles_autorises}.",
            )
        return utilisateur

    return verificateur


async def exiger_super_admin(utilisateur: dict = Depends(obtenir_utilisateur_courant)) -> dict:
    """
    Réservé aux comptes plateforme (§ demande utilisateur — architecture
    SaaS) : gestion des cabinets eux-mêmes (création, état d'abonnement...).
    Distinct de exiger_role("Administrateur"), qui ne donne accès qu'aux
    données du PROPRE cabinet de l'Administrateur.
    """
    if not utilisateur.get("EstSuperAdmin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès refusé : réservé à l'administration de la plateforme SAWALI DentalCare.",
        )
    return utilisateur
