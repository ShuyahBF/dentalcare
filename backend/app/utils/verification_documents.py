"""
app/utils/verification_documents.py
----------------------------------------
§ demande utilisateur : "apposer un QR Code crypté... Cela sécurise ce
document de gestion" (état de caisse) — même mécanisme réutilisé pour les
ordonnances ("Même chose aussi pour les ordonnances").

Réutilise le JWT déjà en place (creer_jeton_acces/decoder_jeton_acces,
signature HMAC via JWT_SECRET_KEY) plutôt qu'un chiffrement au sens strict :
un document scanné par un tiers (officine, auditeur, patient) doit rester
LISIBLE sans détenir de clé secrète côté lecteur — c'est l'AUTHENTICITÉ
(impossible à forger sans la clé du serveur) qui sécurise le document, pas
sa confidentialité. Un JWT signé garantit exactement cela : falsifier son
contenu (montants, nombre de lignes, référence...) sans la clé secrète du
serveur produit une signature invalide, détectée par decoder_jeton_verification.
"""

from datetime import timedelta
from typing import Optional

from app.core.config import settings
from app.core.security import creer_jeton_acces, decoder_jeton_acces

# Un document imprimé (papier) doit rester vérifiable durablement — jamais
# une expiration "en pratique" comme un jeton de session (12h). ~10 ans.
DUREE_VALIDITE_VERIFICATION = timedelta(days=3650)


def creer_jeton_verification(type_document: str, donnees: dict) -> str:
    """type_document: ex. 'etat-caisse', 'ordonnance' — vérifié au décodage,
    empêche qu'un jeton d'état de caisse soit présenté comme une ordonnance."""
    payload = {"type_verif": type_document, **donnees}
    return creer_jeton_acces(payload, duree_supplementaire=DUREE_VALIDITE_VERIFICATION)


def decoder_jeton_verification(jeton: str, type_document: str) -> Optional[dict]:
    """Retourne les données du jeton si signature valide ET type attendu — None sinon (jamais d'exception, cohérent avec decoder_jeton_acces)."""
    donnees = decoder_jeton_acces(jeton)
    if not donnees or donnees.get("type_verif") != type_document:
        return None
    return donnees


def construire_url_verification(type_document: str, jeton: str) -> str:
    return f"{settings.frontend_url}/verification/{type_document}/{jeton}"
