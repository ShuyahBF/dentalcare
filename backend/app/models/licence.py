"""
app/models/licence.py
--------------------------
§ demande utilisateur — cycle de vie commercial d'un cabinet sur la
plateforme : essai gratuit à la création (durée_essai_jours, décomptée
depuis la date de création du cabinet), puis licences d'utilisation
générées UNIQUEMENT par le super-admin. À l'expiration d'une licence sans
renouvellement, le cabinet est automatiquement suspendu (voir
app/utils/verification_licences.py, exécuté quotidiennement).
"""

from datetime import datetime
from typing import Literal
from pydantic import BaseModel

StatutLicence = Literal["Active", "Expirée", "Remplacée"]


class Licence(BaseModel):
    numero_enreg: int
    cabinet_code: str
    date_creation: datetime  # date à laquelle cette licence a été générée
    # Date à partir de laquelle cette licence prend effet (§ demande
    # utilisateur : "la date de renouvellement").
    date_renouvellement: datetime
    # Cycle de renouvellement en jours (ex: 30 pour un cycle mensuel) — sert
    # de valeur par défaut suggérée lors du PROCHAIN renouvellement.
    duree_renouvellement_jours: int
    # Durée réellement couverte par CETTE licence, en jours.
    duree_souscription_jours: int
    # Calculée = date_renouvellement + duree_souscription_jours (jamais
    # saisie directement, toujours recalculée côté serveur).
    date_expiration: datetime
    genere_par: str  # login du super-admin qui a généré cette licence
    statut: StatutLicence = "Active"
    # Empêche de renvoyer plusieurs fois la même notification "expiration
    # proche" pour cette licence (voir verification_licences.py).
    notification_3j_envoyee: bool = False
