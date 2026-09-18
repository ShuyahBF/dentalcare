"""
app/models/notification_plateforme.py
------------------------------------------
§ demande utilisateur : le super-admin doit être informé quand une licence
de cabinet approche de son expiration (3 jours avant) ou quand un cabinet
vient d'être suspendu automatiquement faute de renouvellement. Ces
notifications sont TOUJOURS créées en base (visibles depuis /plateforme,
donc le super-admin les voit dès sa prochaine connexion) ; leur envoi par
email et WhatsApp est une couche additionnelle qui nécessite des
identifiants d'envoi (SMTP, WhatsApp Business plateforme) non encore
configurés — voir la note dans verification_licences.py.
"""

from datetime import datetime
from typing import Literal
from pydantic import BaseModel, Field

TypeNotification = Literal["expiration_proche", "suspension_automatique"]


class NotificationPlateforme(BaseModel):
    numero_enreg: int
    cabinet_code: str
    type_notification: TypeNotification
    message: str
    date_creation: datetime = Field(default_factory=datetime.utcnow)
    lue: bool = False
    # Traçabilité de la tentative d'envoi effectif (email/WhatsApp) — reste
    # à False tant que les identifiants d'envoi platform-level ne sont pas
    # configurés (voir Suggestion.MD).
    email_envoye: bool = False
    whatsapp_envoye: bool = False
