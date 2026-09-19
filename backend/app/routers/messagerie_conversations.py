"""
app/routers/messagerie_conversations.py
--------------------------------------------
§ demande utilisateur — Centre de Messagerie Phase 2 : réception/envoi réel
des messages WhatsApp via le webhook Meta (WhatsApp Business Cloud API).

Le webhook est scopé PAR CABINET (/webhook/{code_cabinet}), pas une URL
unique partagée par toute la plateforme — cohérent avec l'architecture
multi-cabinets où chaque cabinet a SA PROPRE App Meta / son propre WABA
(voir app/models/configuration_whatsapp.py). Le super-admin renseigne cette
URL exacte (https://.../api/messagerie/webhook/<code>) dans la console Meta
du cabinet concerné.

Sécurité : la requête POST du webhook est authentifiée par sa signature
HMAC-SHA256 (en-tête X-Hub-Signature-256, calculée par Meta avec l'App
Secret du cabinet) — jamais par un simple token dans l'URL, qui serait
rejouable. La requête GET (vérification initiale du endpoint par Meta) est
authentifiée par le jeton_verification_webhook choisi par le cabinet.

Une "conversation" n'est PAS un document séparé à maintenir en double :
c'est le regroupement, calculé à la lecture, de tous les MessageWhatsApp
partageant le même numero_telephone pour un cabinet.
"""

import hashlib
import hmac
import json
from datetime import datetime, timedelta

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, Response, UploadFile, status

from app.core.database import obtenir_base, Collections
from app.core.dependances import exiger_role
from app.utils.compteurs import prochain_numero
from app.utils.whatsapp_api import envoyer_media_whatsapp, envoyer_message_whatsapp_texte, URL_API_META

router = APIRouter(prefix="/api/messagerie", tags=["Messagerie WhatsApp — Conversations"])

ROLES_MESSAGERIE = ("Administrateur", "Secrétariat Cabinet")

# § demande utilisateur (illustré par la référence Site-SawaliSmartSystems,
# bandeau "Fenêtre 24h ouverte/fermée") : Meta n'autorise l'envoi de
# messages LIBRES (texte ou média, hors template pré-approuvé) que dans les
# 24h suivant le DERNIER message reçu du contact — règle de la plateforme
# WhatsApp Business elle-même, pas une limitation de cette application.
FENETRE_24H_SECONDES = 24 * 3600


# ============================================================================
# Webhook Meta (réception) — PAS d'authentification utilisateur (appelé par
# les serveurs Meta), sécurisé par jeton de vérification + signature HMAC.
# ============================================================================

@router.get("/webhook/{code_cabinet}")
async def verifier_webhook(code_cabinet: str, request: Request):
    """
    § challenge de vérification Meta (une seule fois, à la configuration du
    webhook dans la console développeur Meta) : renvoie hub.challenge TEL
    QUEL en texte brut si hub.verify_token correspond au jeton choisi par
    CE cabinet — jamais un jeton partagé entre cabinets.
    """
    parametres = request.query_params
    mode = parametres.get("hub.mode")
    jeton = parametres.get("hub.verify_token")
    challenge = parametres.get("hub.challenge")

    base = obtenir_base()
    config = await base[Collections.CONFIGURATION_WHATSAPP].find_one({"cabinet_code": code_cabinet})
    if mode == "subscribe" and config and jeton and jeton == config.get("jeton_verification_webhook"):
        return Response(content=challenge or "", media_type="text/plain")
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Jeton de vérification invalide.")


def _signature_valide(app_secret: str | None, corps_brut: bytes, signature_recue: str | None) -> bool:
    """Vérifie X-Hub-Signature-256 = 'sha256=' + HMAC-SHA256(corps_brut, app_secret)."""
    if not app_secret or not signature_recue or not signature_recue.startswith("sha256="):
        return False
    signature_attendue = hmac.new(app_secret.encode(), corps_brut, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature_attendue, signature_recue[len("sha256="):])


@router.post("/webhook/{code_cabinet}")
async def recevoir_webhook(code_cabinet: str, request: Request):
    """
    Reçoit les événements Meta (messages entrants, accusés de réception) —
    traite chaque message texte/média entrant : l'associe à un contact
    existant (par numéro) ou l'ajoute/met à jour dans ContactEnAttente
    (bannière d'import, voir GET /messagerie/contacts-en-attente), puis
    stocke le message.
    """
    base = obtenir_base()
    config = await base[Collections.CONFIGURATION_WHATSAPP].find_one({"cabinet_code": code_cabinet})
    corps_brut = await request.body()
    signature = request.headers.get("x-hub-signature-256")
    # § si app_secret est configuré, la signature DOIT être valide — sinon
    # (configuration encore incomplète), on accepte quand même pour ne pas
    # bloquer un cabinet en cours de paramétrage initial, mais ce cas est
    # temporaire (la vérification est fortement recommandée en production,
    # dès que app_secret est renseigné elle devient obligatoire).
    if config and config.get("app_secret") and not _signature_valide(config.get("app_secret"), corps_brut, signature):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Signature invalide.")

    try:
        charge = json.loads(corps_brut or b"{}")
    except json.JSONDecodeError:
        return {"statut": "ignoré (corps invalide)"}

    for entree in charge.get("entry", []):
        for changement in entree.get("changes", []):
            valeur = changement.get("value", {})
            for message in valeur.get("messages", []):
                await _traiter_message_entrant(base, code_cabinet, message, valeur.get("contacts", []))
            for statut_evt in valeur.get("statuses", []):
                await _traiter_accuse_reception(base, code_cabinet, statut_evt)

    return {"statut": "traité"}


async def _traiter_message_entrant(base, code_cabinet: str, message: dict, contacts_meta: list[dict]) -> None:
    numero_expediteur = message.get("from", "")
    type_msg = message.get("type", "text")
    contenu_texte = None
    media_id = None
    media_mime_type = None
    media_nom_fichier = None
    type_stocke = "autre"

    if type_msg == "text":
        contenu_texte = message.get("text", {}).get("body")
        type_stocke = "texte"
    elif type_msg in ("image", "video", "audio", "document"):
        type_stocke = type_msg
        bloc_media = message.get(type_msg, {})
        media_id = bloc_media.get("id")
        media_mime_type = bloc_media.get("mime_type")
        media_nom_fichier = bloc_media.get("filename")
        contenu_texte = bloc_media.get("caption")
    else:
        contenu_texte = f"[Message de type non pris en charge : {type_msg}]"

    numero_message = await prochain_numero("MessageWhatsApp", valeur_depart=1)
    await base[Collections.MESSAGE_WHATSAPP].insert_one({
        "numero_enreg": numero_message, "cabinet_code": code_cabinet, "numero_telephone": numero_expediteur,
        "direction": "entrant", "type_message": type_stocke, "contenu_texte": contenu_texte,
        "media_id_meta": media_id, "media_mime_type": media_mime_type, "media_nom_fichier": media_nom_fichier,
        "wamid": message.get("id"), "statut": "recu", "caissier_login": None,
        "date_heure": datetime.utcnow(),
    })

    # § contact déjà connu (par téléphone OU whatsapp) -> rien de plus à
    # faire, il apparaîtra dans ses conversations. Sinon -> ContactEnAttente
    # (créé ou mis à jour, jamais dupliqué pour le même numéro).
    contact_existant = await base[Collections.CONTACT_MESSAGERIE].find_one({
        "cabinet_code": code_cabinet,
        "$or": [{"telephone": numero_expediteur}, {"whatsapp": numero_expediteur}],
    })
    if not contact_existant:
        nom_profil = next((c.get("profile", {}).get("name") for c in contacts_meta if c.get("wa_id") == numero_expediteur), None)
        apercu = contenu_texte or f"[{type_stocke}]"
        existant_attente = await base[Collections.CONTACT_EN_ATTENTE].find_one({"cabinet_code": code_cabinet, "depuis": numero_expediteur})
        if existant_attente:
            await base[Collections.CONTACT_EN_ATTENTE].update_one(
                {"numero_enreg": existant_attente["numero_enreg"], "cabinet_code": code_cabinet},
                {"$set": {"dernier_message": apercu, "dernier_vu_le": datetime.utcnow(), "nom_profil_wa": nom_profil or existant_attente.get("nom_profil_wa")},
                 "$inc": {"nombre_messages": 1}},
            )
        else:
            numero_attente = await prochain_numero("ContactEnAttente", valeur_depart=1)
            await base[Collections.CONTACT_EN_ATTENTE].insert_one({
                "numero_enreg": numero_attente, "cabinet_code": code_cabinet, "depuis": numero_expediteur,
                "nom_profil_wa": nom_profil, "dernier_message": apercu, "nombre_messages": 1,
                "dernier_vu_le": datetime.utcnow(),
            })


async def _traiter_accuse_reception(base, code_cabinet: str, statut_evt: dict) -> None:
    """Met à jour le statut (livré/lu/échec) d'un message SORTANT déjà stocké, retrouvé par son wamid."""
    wamid = statut_evt.get("id")
    nouveau_statut = statut_evt.get("status")  # "sent" | "delivered" | "read" | "failed"
    correspondance = {"sent": "envoye", "delivered": "livre", "read": "lu", "failed": "echec"}
    if not wamid or nouveau_statut not in correspondance:
        return
    await base[Collections.MESSAGE_WHATSAPP].update_one(
        {"wamid": wamid, "cabinet_code": code_cabinet}, {"$set": {"statut": correspondance[nouveau_statut]}}
    )


# ============================================================================
# Conversations (lecture/envoi) — authentifié, réservé Administrateur/Secrétariat.
# ============================================================================

@router.get("/conversations")
async def lister_conversations(utilisateur: dict = Depends(exiger_role(*ROLES_MESSAGERIE))):
    """
    Une conversation par numéro de téléphone distinct ayant au moins un
    message — dernier message + contact associé (si connu) pour
    l'affichage, triées par activité la plus récente.
    """
    base = obtenir_base()
    cabinet_code = utilisateur["CodeCabinet"]
    messages = [m async for m in base[Collections.MESSAGE_WHATSAPP].find({"cabinet_code": cabinet_code}).sort("date_heure", 1)]
    par_numero: dict[str, dict] = {}
    for m in messages:
        par_numero[m["numero_telephone"]] = m  # le dernier itéré (tri croissant) = le plus récent
    contacts = {c.get("telephone") or c.get("whatsapp"): c async for c in base[Collections.CONTACT_MESSAGERIE].find({"cabinet_code": cabinet_code})}

    conversations = []
    for numero, dernier in par_numero.items():
        contact = contacts.get(numero)
        conversations.append({
            "numero_telephone": numero,
            "contact_nom": contact.get("nom") if contact else None,
            "contact_numero_enreg": contact.get("numero_enreg") if contact else None,
            "dernier_message": dernier.get("contenu_texte") or f"[{dernier.get('type_message')}]",
            "dernier_message_direction": dernier["direction"],
            "dernier_message_le": dernier["date_heure"],
        })
    conversations.sort(key=lambda c: c["dernier_message_le"], reverse=True)
    return conversations


@router.get("/conversations/{numero_telephone}/messages")
async def messages_conversation(numero_telephone: str, utilisateur: dict = Depends(exiger_role(*ROLES_MESSAGERIE))):
    """
    § demande utilisateur : en plus des messages, indique si la fenêtre
    libre Meta de 24h est ouverte (voir FENETRE_24H_SECONDES ci-dessus) —
    affiché dans l'interface pour éviter une tentative d'envoi vouée à
    l'échec côté Meta, avec l'heure d'expiration exacte.
    """
    base = obtenir_base()
    curseur = base[Collections.MESSAGE_WHATSAPP].find(
        {"cabinet_code": utilisateur["CodeCabinet"], "numero_telephone": numero_telephone}
    ).sort("date_heure", 1)
    messages = [m async for m in curseur]
    dernier_entrant = max((m["date_heure"] for m in messages if m["direction"] == "entrant"), default=None)
    fenetre_ouverte = bool(dernier_entrant) and (datetime.utcnow() - dernier_entrant).total_seconds() < FENETRE_24H_SECONDES
    expire_le = (dernier_entrant + timedelta(seconds=FENETRE_24H_SECONDES)) if dernier_entrant else None
    return {"messages": messages, "can_send_text": fenetre_ouverte, "window_expires_at": expire_le}


async def _verifier_fenetre_ouverte(base, cabinet_code: str, numero_telephone: str) -> None:
    dernier_entrant = await base[Collections.MESSAGE_WHATSAPP].find_one(
        {"cabinet_code": cabinet_code, "numero_telephone": numero_telephone, "direction": "entrant"},
        sort=[("date_heure", -1)],
    )
    if not dernier_entrant or (datetime.utcnow() - dernier_entrant["date_heure"]).total_seconds() >= FENETRE_24H_SECONDES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Fenêtre 24h fermée — aucun message reçu de ce contact dans les dernières 24 heures. Seul un template Meta pré-approuvé peut être envoyé (non pris en charge ici pour l'instant).",
        )


@router.post("/conversations/{numero_telephone}/envoyer", status_code=status.HTTP_201_CREATED)
async def envoyer_message_conversation(numero_telephone: str, donnees: dict, utilisateur: dict = Depends(exiger_role(*ROLES_MESSAGERIE))):
    """Envoie un message TEXTE au numéro donné via l'API WhatsApp du cabinet, et l'enregistre dans la conversation."""
    texte = (donnees.get("texte") or "").strip()
    if not texte:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Le message ne peut pas être vide.")
    base = obtenir_base()
    cabinet_code = utilisateur["CodeCabinet"]
    await _verifier_fenetre_ouverte(base, cabinet_code, numero_telephone)
    config = await base[Collections.CONFIGURATION_WHATSAPP].find_one({"cabinet_code": cabinet_code})
    if not config or not config.get("actif"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="La configuration WhatsApp de ce cabinet n'est pas active. Contactez SAWALI SMART SYSTEMS.")

    succes, message_erreur = await envoyer_message_whatsapp_texte(config, numero_telephone, texte)
    if not succes:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=message_erreur)

    numero_message = await prochain_numero("MessageWhatsApp", valeur_depart=1)
    document = {
        "numero_enreg": numero_message, "cabinet_code": cabinet_code, "numero_telephone": numero_telephone,
        "direction": "sortant", "type_message": "texte", "contenu_texte": texte,
        "media_id_meta": None, "media_mime_type": None, "media_nom_fichier": None,
        "wamid": None, "statut": "envoye", "caissier_login": utilisateur["Login"],
        "date_heure": datetime.utcnow(),
    }
    await base[Collections.MESSAGE_WHATSAPP].insert_one(document)
    document.pop("_id", None)
    return document


# § demande utilisateur ("on ne peut envoyer ni vocal, ni pièce jointe, ni
# vidéo") — porté depuis Site-SawaliSmartSystems (POST /me/whatsapp/send-media),
# simplifié : upload direct des octets vers Meta plutôt qu'un hébergement
# public préalable (pas de filigrane/QR ici, hors périmètre dentaire).
TAILLE_MAX_MEDIA_OCTETS = 16 * 1024 * 1024  # 16 Mo — plafond image de l'API Meta, valable comme garde-fou général


@router.post("/conversations/{numero_telephone}/envoyer-media", status_code=status.HTTP_201_CREATED)
async def envoyer_media_conversation(
    numero_telephone: str,
    legende: str | None = Form(None),
    fichier: UploadFile = File(...),
    utilisateur: dict = Depends(exiger_role(*ROLES_MESSAGERIE)),
):
    """Envoie une image, vidéo, note vocale ou document au numéro donné (upload multipart)."""
    contenu = await fichier.read()
    if not contenu:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Fichier vide.")
    if len(contenu) > TAILLE_MAX_MEDIA_OCTETS:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail=f"Fichier trop volumineux (max {TAILLE_MAX_MEDIA_OCTETS // (1024 * 1024)} Mo).")

    base = obtenir_base()
    cabinet_code = utilisateur["CodeCabinet"]
    await _verifier_fenetre_ouverte(base, cabinet_code, numero_telephone)
    config = await base[Collections.CONFIGURATION_WHATSAPP].find_one({"cabinet_code": cabinet_code})
    if not config or not config.get("actif"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="La configuration WhatsApp de ce cabinet n'est pas active. Contactez SAWALI SMART SYSTEMS.")

    mime_type = fichier.content_type or "application/octet-stream"
    succes, message_erreur, type_media, media_id = await envoyer_media_whatsapp(config, numero_telephone, contenu, mime_type, fichier.filename, legende)
    if not succes:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=message_erreur)

    numero_message = await prochain_numero("MessageWhatsApp", valeur_depart=1)
    document = {
        "numero_enreg": numero_message, "cabinet_code": cabinet_code, "numero_telephone": numero_telephone,
        "direction": "sortant", "type_message": type_media, "contenu_texte": legende,
        # § le media_id renvoyé par Meta À L'UPLOAD est réutilisé tel quel
        # pour le réaffichage ultérieur — même proxy GET /media/{id} que
        # pour les médias ENTRANTS (voir plus bas), aucune duplication de
        # logique nécessaire.
        "media_id_meta": media_id, "media_mime_type": mime_type, "media_nom_fichier": fichier.filename,
        "wamid": None, "statut": "envoye", "caissier_login": utilisateur["Login"],
        "date_heure": datetime.utcnow(),
    }
    await base[Collections.MESSAGE_WHATSAPP].insert_one(document)
    document.pop("_id", None)
    return document


@router.get("/media/{numero_enreg_message}")
async def obtenir_media(numero_enreg_message: int, utilisateur: dict = Depends(exiger_role(*ROLES_MESSAGERIE))):
    """
    § les médias ne sont JAMAIS stockés en base (l'URL Meta expire vite,
    voir MessageWhatsApp.media_id_meta) — téléchargés à la demande à
    chaque consultation : 1) résout l'URL temporaire via l'API Meta,
    2) télécharge le contenu, 3) le renvoie tel quel (proxy), pour ne
    jamais exposer le token d'accès système du cabinet au navigateur.
    """
    base = obtenir_base()
    cabinet_code = utilisateur["CodeCabinet"]
    message = await base[Collections.MESSAGE_WHATSAPP].find_one({"numero_enreg": numero_enreg_message, "cabinet_code": cabinet_code})
    if not message or not message.get("media_id_meta"):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Média introuvable.")
    config = await base[Collections.CONFIGURATION_WHATSAPP].find_one({"cabinet_code": cabinet_code})
    if not config or not config.get("token_acces_systeme"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Configuration WhatsApp indisponible.")

    entetes = {"Authorization": f"Bearer {config['token_acces_systeme']}"}
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            reponse_resolution = await client.get(f"{URL_API_META}/{message['media_id_meta']}", headers=entetes)
            if reponse_resolution.status_code != 200:
                raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Impossible de résoudre l'URL du média (lien Meta peut-être expiré).")
            url_media = reponse_resolution.json().get("url")
            reponse_media = await client.get(url_media, headers=entetes)
            if reponse_media.status_code != 200:
                raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Téléchargement du média impossible.")
    except httpx.HTTPError:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Connexion à l'API WhatsApp impossible.")

    entetes_reponse = {}
    if message.get("media_nom_fichier"):
        entetes_reponse["Content-Disposition"] = f'inline; filename="{message["media_nom_fichier"]}"'
    return Response(content=reponse_media.content, media_type=message.get("media_mime_type") or "application/octet-stream", headers=entetes_reponse)
