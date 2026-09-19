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


async def envoyer_message_whatsapp_texte(config: dict | None, numero_destinataire: str, texte: str, repondre_a_wamid: str | None = None) -> tuple[bool, str, str | None]:
    """
    Envoie un message texte WhatsApp au numéro donné, avec les identifiants
    de `config` (document ConfigurationWhatsApp du cabinet ou de la
    plateforme). Retourne (succès, message, wamid).

    § `repondre_a_wamid` (porté depuis Site-SawaliSmartSystems,
    `_wa_send_text`) : cite un message précédent via `context.message_id` —
    seule la réponse la PLUS RÉCENTE Meta le supporte, et uniquement pour
    des messages échangés dans les 30 derniers jours.

    § le `wamid` renvoyé par Meta à l'ENVOI est capturé et retourné pour être
    stocké sur le message dans notre base — SANS lui, deux choses cassent
    silencieusement : 1) les accusés de réception (livré/lu) reçus plus
    tard sur le webhook ne peuvent jamais être rapprochés du message
    sortant correspondant (_traiter_accuse_reception les cherche par
    wamid) ; 2) impossible de RÉPONDRE plus tard à CE message sortant
    (voir repondre_a_wamid ci-dessus).
    """
    if not config or not config.get("token_acces_systeme") or not config.get("numero_telephone_id"):
        return False, "Configuration WhatsApp incomplète (token d'accès ou identifiant de numéro manquant).", None
    numero = "".join(ch for ch in (numero_destinataire or "") if ch.isdigit())
    if not numero:
        return False, "Numéro de téléphone destinataire manquant ou invalide.", None

    url = f"{URL_API_META}/{config['numero_telephone_id']}/messages"
    entetes = {"Authorization": f"Bearer {config['token_acces_systeme']}"}
    charge: dict = {"messaging_product": "whatsapp", "to": numero, "type": "text", "text": {"body": texte}}
    if repondre_a_wamid:
        charge["context"] = {"message_id": repondre_a_wamid}
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            reponse = await client.post(url, json=charge, headers=entetes)
            if reponse.status_code == 200:
                wamid = (reponse.json().get("messages") or [{}])[0].get("id")
                return True, f"Message WhatsApp envoyé avec succès au {numero_destinataire}.", wamid
            # § l'API Meta renvoie un corps JSON détaillé en cas d'erreur
            # (error.message) — bien plus utile au super-admin qu'un simple
            # code HTTP pour diagnostiquer un token expiré, un numéro non
            # vérifié, une fenêtre de conversation de 24h expirée, etc.
            try:
                detail = reponse.json().get("error", {}).get("message", reponse.text)
            except ValueError:
                detail = reponse.text
            return False, f"L'API WhatsApp a refusé l'envoi (HTTP {reponse.status_code}) : {detail}", None
    except httpx.HTTPError as exc:
        return False, f"Connexion à l'API WhatsApp impossible : {exc}", None


async def lister_modeles_whatsapp(config: dict | None) -> tuple[bool, str, list]:
    """
    § demande utilisateur ("permettre d'utiliser un modèle de messages quand
    la fenêtre de 24h META est dépassée") — porté depuis Site-SawaliSmartSystems
    (GET /me/whatsapp/templates) : liste les modèles de message Meta
    APPROUVÉS pour le WABA du cabinet. Seuls les modèles pré-approuvés par
    Meta peuvent être envoyés HORS de la fenêtre libre de 24h (c'est la
    règle Meta elle-même, pas une limite de cette application).
    Retourne (succès, message_erreur, liste_modeles).
    """
    if not config or not config.get("token_acces_systeme") or not config.get("waba_id"):
        return False, "Configuration WhatsApp incomplète (token d'accès ou identifiant WABA manquant).", []
    entetes = {"Authorization": f"Bearer {config['token_acces_systeme']}"}
    url = f"{URL_API_META}/{config['waba_id']}/message_templates"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            reponse = await client.get(url, params={"limit": 100}, headers=entetes)
            if reponse.status_code != 200:
                try:
                    detail = reponse.json().get("error", {}).get("message", reponse.text)
                except ValueError:
                    detail = reponse.text
                return False, f"L'API WhatsApp a refusé la liste des modèles (HTTP {reponse.status_code}) : {detail}", []
            # § seuls les modèles au statut APPROVED sont utilisables à
            # l'envoi (les autres — EN ATTENTE, REJETÉ, DÉSACTIVÉ — feraient
            # échouer l'envoi côté Meta).
            modeles = [t for t in reponse.json().get("data", []) if (t.get("status") or "").upper() == "APPROVED"]
            return True, "", modeles
    except httpx.HTTPError as exc:
        return False, f"Connexion à l'API WhatsApp impossible : {exc}", []


async def envoyer_modele_whatsapp(
    config: dict | None,
    numero_destinataire: str,
    nom_modele: str,
    code_langue: str,
    variables_corps: list[str] | None = None,
) -> tuple[bool, str, str | None]:
    """
    Envoie un modèle Meta pré-approuvé — SEUL type de message autorisé hors
    de la fenêtre libre de 24h (voir lister_modeles_whatsapp ci-dessus).
    `variables_corps` : substitue {{1}}, {{2}}... du corps du modèle, dans
    l'ordre (§ porté depuis _wa_send_template de Site-SawaliSmartSystems,
    simplifié aux variables de CORPS uniquement — pas d'en-tête média/bouton
    dynamique, hors périmètre dentaire pour l'instant).
    Retourne (succès, message, wamid).
    """
    if not config or not config.get("token_acces_systeme") or not config.get("numero_telephone_id"):
        return False, "Configuration WhatsApp incomplète (token d'accès ou identifiant de numéro manquant).", None
    numero = "".join(ch for ch in (numero_destinataire or "") if ch.isdigit())
    if not numero:
        return False, "Numéro de téléphone destinataire manquant ou invalide.", None

    charge: dict = {
        "messaging_product": "whatsapp", "to": numero, "type": "template",
        "template": {"name": nom_modele, "language": {"code": code_langue}},
    }
    if variables_corps:
        charge["template"]["components"] = [{
            "type": "body",
            "parameters": [{"type": "text", "text": v} for v in variables_corps],
        }]
    entetes = {"Authorization": f"Bearer {config['token_acces_systeme']}"}
    url = f"{URL_API_META}/{config['numero_telephone_id']}/messages"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            reponse = await client.post(url, json=charge, headers=entetes)
            if reponse.status_code == 200:
                wamid = (reponse.json().get("messages") or [{}])[0].get("id")
                return True, f"Modèle envoyé avec succès au {numero_destinataire}.", wamid
            try:
                detail = reponse.json().get("error", {}).get("message", reponse.text)
            except ValueError:
                detail = reponse.text
            return False, f"L'API WhatsApp a refusé l'envoi du modèle (HTTP {reponse.status_code}) : {detail}", None
    except httpx.HTTPError as exc:
        return False, f"Connexion à l'API WhatsApp impossible : {exc}", None


def _type_media_pour_mime(mime_type: str) -> str:
    """§ classe un type MIME dans l'une des 4 catégories média WhatsApp (image/video/audio/document)."""
    mime_type = (mime_type or "").lower()
    if mime_type.startswith("image/"):
        return "image"
    if mime_type.startswith("video/"):
        return "video"
    if mime_type.startswith("audio/"):
        return "audio"
    return "document"


async def envoyer_media_whatsapp(
    config: dict | None,
    numero_destinataire: str,
    contenu: bytes,
    mime_type: str,
    nom_fichier: str | None = None,
    legende: str | None = None,
    repondre_a_wamid: str | None = None,
) -> tuple[bool, str, str | None, str | None, str | None]:
    """
    § demande utilisateur ("on ne peut envoyer ni vocal, ni pièce jointe, ni
    vidéo") — envoie un média WhatsApp (image/vidéo/audio/document) en DEUX
    étapes officielles de l'API Cloud Meta : 1) upload direct des octets
    vers Meta (`POST /{phone_number_id}/media`), qui renvoie un `media_id` ;
    2) envoi du message référençant ce `media_id`. Contrairement à
    Site-SawaliSmartSystems (qui héberge le fichier publiquement via
    /api/files/{id} pour que Meta le récupère par URL, avec filigrane/QR
    optionnels), l'upload direct ne nécessite AUCUN hébergement public —
    plus simple et suffisant à cette échelle.

    Retourne (succès, message, type_media, media_id_meta, wamid) — le
    media_id Meta retourné est stocké tel quel sur le message SORTANT, pour
    être réaffiché plus tard via le même proxy GET /messagerie/media/{id}
    qui sert déjà les médias ENTRANTS (voir
    app/routers/messagerie_conversations.py). Le wamid (voir
    envoyer_message_whatsapp_texte ci-dessus pour le détail de son
    importance) permet de rapprocher les accusés de réception ET de
    répondre plus tard à CE média précis.
    """
    if not config or not config.get("token_acces_systeme") or not config.get("numero_telephone_id"):
        return False, "Configuration WhatsApp incomplète (token d'accès ou identifiant de numéro manquant).", None, None, None
    numero = "".join(ch for ch in (numero_destinataire or "") if ch.isdigit())
    if not numero:
        return False, "Numéro de téléphone destinataire manquant ou invalide.", None, None, None
    if not contenu:
        return False, "Fichier vide.", None, None, None

    type_media = _type_media_pour_mime(mime_type)
    entetes = {"Authorization": f"Bearer {config['token_acces_systeme']}"}
    phone_id = config["numero_telephone_id"]

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            # 1) Upload direct des octets vers Meta.
            fichiers = {"file": (nom_fichier or "fichier", contenu, mime_type or "application/octet-stream")}
            donnees = {"messaging_product": "whatsapp", "type": mime_type or "application/octet-stream"}
            reponse_upload = await client.post(f"{URL_API_META}/{phone_id}/media", data=donnees, files=fichiers, headers=entetes)
            if reponse_upload.status_code != 200:
                try:
                    detail = reponse_upload.json().get("error", {}).get("message", reponse_upload.text)
                except ValueError:
                    detail = reponse_upload.text
                return False, f"Échec de l'upload du média vers Meta (HTTP {reponse_upload.status_code}) : {detail}", type_media, None, None
            media_id = reponse_upload.json().get("id")
            if not media_id:
                return False, "Meta n'a renvoyé aucun identifiant de média après l'upload.", type_media, None, None

            # 2) Envoi du message référençant ce media_id.
            bloc_media: dict = {"id": media_id}
            if legende and type_media in ("image", "video", "document"):
                bloc_media["caption"] = legende
            if nom_fichier and type_media == "document":
                bloc_media["filename"] = nom_fichier
            charge: dict = {"messaging_product": "whatsapp", "to": numero, "type": type_media, type_media: bloc_media}
            if repondre_a_wamid:
                charge["context"] = {"message_id": repondre_a_wamid}
            reponse_envoi = await client.post(f"{URL_API_META}/{phone_id}/messages", json=charge, headers=entetes)
            if reponse_envoi.status_code == 200:
                wamid = (reponse_envoi.json().get("messages") or [{}])[0].get("id")
                return True, f"Média envoyé avec succès au {numero_destinataire}.", type_media, media_id, wamid
            try:
                detail = reponse_envoi.json().get("error", {}).get("message", reponse_envoi.text)
            except ValueError:
                detail = reponse_envoi.text
            return False, f"L'API WhatsApp a refusé l'envoi du média (HTTP {reponse_envoi.status_code}) : {detail}", type_media, media_id, None
    except httpx.HTTPError as exc:
        return False, f"Connexion à l'API WhatsApp impossible : {exc}", type_media, None, None
