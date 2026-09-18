"""
app/models/configuration_whatsapp.py
-----------------------------------------
§ demande utilisateur — Centre de Messagerie WA : chaque cabinet paramètre
SES PROPRES identifiants Meta (WhatsApp Business Platform / Cloud API), pour
que les échanges (texte, vocal, image, vidéo) avec ses patients passent par
SON PROPRE numéro WhatsApp Business, jamais un numéro partagé entre cabinets
— cohérent avec l'isolation stricte de l'architecture SaaS multi-cabinets.

Champs sensibles (token_acces_systeme, app_secret, jeton_verification_webhook)
: jamais retournés en clair par l'API une fois enregistrés — voir
app/routers/messagerie.py, qui les masque systématiquement en lecture.
"""

from typing import Optional
from pydantic import BaseModel


class ConfigurationWhatsApp(BaseModel):
    cabinet_code: str

    # Identifiants Meta (WhatsApp Business Platform / Cloud API) — voir
    # https://developers.facebook.com/docs/whatsapp/cloud-api/get-started
    waba_id: Optional[str] = None  # WhatsApp Business Account ID
    numero_telephone_id: Optional[str] = None  # Phone Number ID (utilisé dans les appels API)
    numero_telephone_affiche: Optional[str] = None  # numéro humainement lisible, ex: "+226 25 33 28 71"
    app_id: Optional[str] = None  # Meta App ID

    # --- Sensibles : jamais renvoyés en clair une fois enregistrés ---
    token_acces_systeme: Optional[str] = None  # jeton d'accès permanent (System User)
    app_secret: Optional[str] = None
    jeton_verification_webhook: Optional[str] = None  # choisi par le cabinet, vérifié à la configuration du webhook Meta

    actif: bool = False  # intégration activée pour ce cabinet
