"""
app/core/security.py
-----------------------
Fonctions de sécurité :
  - hachage/vérification des mots de passe avec bcrypt (jamais en clair,
    contrairement au champ "Mot_de_Passe" en clair du legacy UtilisateurBlg)
  - création/décodage des jetons JWT pour l'authentification par session

NOTE IMPORTANTE (compatibilité) : il existe une incompatibilité connue entre
certaines versions de "bcrypt" et "passlib" (passlib tente de lire
bcrypt.__about__.__version__, qui n'existe plus dans bcrypt>=4.1). On épingle
donc une version compatible dans requirements.txt plutôt que de contourner
ici, pour rester sur l'implémentation standard recommandée.
"""

from datetime import datetime, timedelta, timezone
from typing import Optional

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

# --- Hachage des mots de passe ---
contexte_pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hacher_mot_de_passe(mot_de_passe_clair: str) -> str:
    """Transforme un mot de passe en clair en un hachage bcrypt sûr à stocker en base."""
    return contexte_pwd.hash(mot_de_passe_clair)


def verifier_mot_de_passe(mot_de_passe_clair: str, mot_de_passe_hache: str) -> bool:
    """Compare un mot de passe saisi au hachage stocké en base."""
    return contexte_pwd.verify(mot_de_passe_clair, mot_de_passe_hache)


# --- JSON Web Tokens ---
def creer_jeton_acces(donnees: dict, duree_supplementaire: Optional[timedelta] = None) -> str:
    """
    Crée un JWT signé contenant les informations essentielles de la session
    (login, rôle, id utilisateur). Expire après jwt_duree_validite_minutes.
    """
    a_encoder = donnees.copy()
    expiration = datetime.now(timezone.utc) + (
        duree_supplementaire or timedelta(minutes=settings.jwt_duree_validite_minutes)
    )
    a_encoder.update({"exp": expiration})
    return jwt.encode(a_encoder, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decoder_jeton_acces(jeton: str) -> Optional[dict]:
    """Décode et valide un JWT. Retourne None si invalide/expiré."""
    try:
        return jwt.decode(jeton, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except JWTError:
        return None
