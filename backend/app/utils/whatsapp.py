"""
app/utils/whatsapp.py
-------------------------
Génère un lien wa.me pré-rempli pour envoyer un message (avec éventuellement
un texte pointant vers le PDF téléchargé) au numéro du patient, comme demandé
au §4g ("envoyer par WhatsApp (lien wa.me ou API WhatsApp Business)").
"""

import re

from app.core.config import settings


def normaliser_numero_whatsapp(numero: str) -> str:
    """
    Nettoie un numéro de téléphone et lui ajoute l'indicatif pays par défaut
    (+226 Burkina Faso) s'il n'est pas déjà présent.
    """
    chiffres = re.sub(r"\D", "", numero or "")
    if chiffres.startswith(settings.indicatif_pays_defaut):
        return chiffres
    if chiffres.startswith("0"):
        chiffres = chiffres[1:]
    return f"{settings.indicatif_pays_defaut}{chiffres}"


def generer_lien_whatsapp(numero_telephone: str, message: str) -> str:
    """Retourne une URL https://wa.me/... prête à ouvrir dans un nouvel onglet côté frontend."""
    numero = normaliser_numero_whatsapp(numero_telephone)
    from urllib.parse import quote

    return f"https://wa.me/{numero}?text={quote(message)}"
