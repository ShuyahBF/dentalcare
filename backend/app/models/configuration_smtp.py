"""
app/models/configuration_smtp.py
-------------------------------------
§ demande utilisateur : chaque cabinet paramètre SES PROPRES identifiants
SMTP (envoi d'email) — utilisés notamment pour les notifications
patient/cabinet à venir. Le super-admin dispose également des siens, pour
les notifications PLATEFORME (ex: alerte d'expiration de licence) —
identifiés par le code réservé CODE_PLATEFORME (jamais un vrai code cabinet,
qui est toujours 4 chiffres).

Champs sensibles (mot_de_passe) : jamais retournés en clair une fois
enregistrés — voir app/routers/plateforme_communication.py, qui les masque
systématiquement en lecture, exactement comme ConfigurationWhatsApp.
"""

from typing import Optional
from pydantic import BaseModel

CODE_PLATEFORME = "PLATEFORME"


class ConfigurationSMTP(BaseModel):
    cabinet_code: str  # code cabinet à 4 chiffres, ou CODE_PLATEFORME pour le super-admin

    hote: Optional[str] = None  # ex: "smtp.gmail.com"
    port: int = 587
    utilisateur: Optional[str] = None
    adresse_expediteur: Optional[str] = None
    nom_expediteur: Optional[str] = None
    utiliser_tls: bool = True

    # --- Sensible : jamais renvoyé en clair une fois enregistré ---
    mot_de_passe: Optional[str] = None

    actif: bool = False
