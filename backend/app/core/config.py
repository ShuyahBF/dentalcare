"""
app/core/config.py
--------------------
Paramètres de configuration de l'application, centralisés ici et lus depuis
les variables d'environnement (fichier .env en développement, variables
d'environnement réelles en production/Emergent).

Rappel du projet : c'est un site SaaS -> les paramètres de connexion (URI
MongoDB, nom de la base) définissent LA base de données utilisée. Chaque
cabinet client pourra donc, à terme, avoir sa propre base en changeant
simplement MONGODB_DB_NAME.
"""

import os
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # --- Base de données MongoDB Atlas ---
    # URI de connexion complet (ex: mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/)
    mongodb_uri: str = os.getenv(
        "MONGODB_URI", "mongodb://localhost:27017"
    )
    # Nom de la base logique pour ce cabinet (Cluster0 peut héberger plusieurs
    # cabinets, chacun dans sa propre base Mongo, comme convenu).
    mongodb_db_name: str = os.getenv("MONGODB_DB_NAME", "sawali_dentalcare")

    # --- Sécurité / JWT ---
    jwt_secret_key: str = os.getenv(
        "JWT_SECRET_KEY", "CHANGER_CETTE_CLE_EN_PRODUCTION_SAWALI_2026"
    )
    jwt_algorithm: str = "HS256"
    jwt_duree_validite_minutes: int = 60 * 12  # 12h de session, adapté à une journée de travail au cabinet

    # --- Application ---
    nom_application: str = "SAWALI DentalCare"
    environnement: str = os.getenv("ENVIRONNEMENT", "developpement")

    # --- WhatsApp ---
    # Préfixe international par défaut pour générer les liens wa.me si le
    # numéro du patient n'a pas déjà son indicatif (+226 = Burkina Faso).
    indicatif_pays_defaut: str = "226"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
