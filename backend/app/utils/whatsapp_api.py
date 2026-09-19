"""
app/utils/whatsapp_api.py
------------------------------
§ demande utilisateur : envoi réel d'un message WhatsApp via l'API Cloud
Meta (WhatsApp Business Platform), en utilisant les identifiants propres au
cabinet (voir app/models/configuration_whatsapp.py). Premier usage concret :
le code OTP de connexion (voir app/routers/auth.py). La fonction gère tous
les cas d'échec proprement (config absente, erreur réseau, réponse Meta en
erreur) pour ne jamais faire planter la connexion.

Retourne (succès, message) — jamais un simple booléen — pour que le bouton
"Tester" (Administration/Plateforme → Communication) puisse afficher la
RAISON précise d'un échec (token invalide, numéro non enregistré...), pas
seulement "ça ne marche pas".
"""

import httpx

URL_API_META = "https://graph.facebook.com/v20.0"


async def envoyer_message_whatsapp_texte(config: dict | None, numero_destinataire: str, texte: str) -> tuple[bool, str]:
    """
    Envoie un message texte WhatsApp au numéro donné, avec les identifiants
    de `config` (document ConfigurationWhatsApp du cabinet ou de la
    plateforme). Retourne (succès, message).
    """
    if not config or not config.get("token_acces_systeme") or not config.get("numero_telephone_id"):
        return False, "Configuration WhatsApp incomplète (token d'accès ou identifiant de numéro manquant)."
    numero = "".join(ch for ch in (numero_destinataire or "") if ch.isdigit())
    if not numero:
        return False, "Numéro de téléphone destinataire manquant ou invalide."

    url = f"{URL_API_META}/{config['numero_telephone_id']}/messages"
    entetes = {"Authorization": f"Bearer {config['token_acces_systeme']}"}
    charge = {"messaging_product": "whatsapp", "to": numero, "type": "text", "text": {"body": texte}}
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            reponse = await client.post(url, json=charge, headers=entetes)
            if reponse.status_code == 200:
                return True, f"Message WhatsApp envoyé avec succès au {numero_destinataire}."
            # § l'API Meta renvoie un corps JSON détaillé en cas d'erreur
            # (error.message) — bien plus utile au super-admin qu'un simple
            # code HTTP pour diagnostiquer un token expiré, un numéro non
            # vérifié, une fenêtre de conversation de 24h expirée, etc.
            try:
                detail = reponse.json().get("error", {}).get("message", reponse.text)
            except ValueError:
                detail = reponse.text
            return False, f"L'API WhatsApp a refusé l'envoi (HTTP {reponse.status_code}) : {detail}"
    except httpx.HTTPError as exc:
        return False, f"Connexion à l'API WhatsApp impossible : {exc}"
