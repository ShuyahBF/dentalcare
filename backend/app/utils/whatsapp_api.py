"""
app/utils/whatsapp_api.py
------------------------------
§ demande utilisateur : envoi réel d'un message WhatsApp via l'API Cloud
Meta (WhatsApp Business Platform), en utilisant les identifiants propres au
cabinet (voir app/models/configuration_whatsapp.py). Premier usage concret :
le code OTP de connexion (voir app/routers/auth.py). Non testable en direct
dans cet environnement (aucun identifiant Meta réel disponible ici) — la
fonction gère néanmoins tous les cas d'échec proprement (config absente,
erreur réseau, réponse Meta en erreur) pour ne jamais faire planter la
connexion : elle retourne simplement False, et l'appelant décide de la
conduite à tenir.
"""

import httpx

URL_API_META = "https://graph.facebook.com/v20.0"


async def envoyer_message_whatsapp_texte(config: dict | None, numero_destinataire: str, texte: str) -> bool:
    """
    Envoie un message texte WhatsApp au numéro donné, avec les identifiants
    de `config` (document ConfigurationWhatsApp du cabinet). Retourne True
    seulement si l'API Meta a confirmé l'envoi (statut 200).
    """
    if not config or not config.get("token_acces_systeme") or not config.get("numero_telephone_id"):
        return False
    numero = "".join(ch for ch in (numero_destinataire or "") if ch.isdigit())
    if not numero:
        return False

    url = f"{URL_API_META}/{config['numero_telephone_id']}/messages"
    entetes = {"Authorization": f"Bearer {config['token_acces_systeme']}"}
    charge = {"messaging_product": "whatsapp", "to": numero, "type": "text", "text": {"body": texte}}
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            reponse = await client.post(url, json=charge, headers=entetes)
            return reponse.status_code == 200
    except httpx.HTTPError:
        return False
