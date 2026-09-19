"""
app/routers/plateforme_communication.py
--------------------------------------------
§ demande utilisateur : bouton "Communication" à côté de chaque cabinet
dans /plateforme (après "Journal"), réservé au super-admin, pour paramétrer
SMTP et WhatsApp DE CHAQUE CABINET — plus les siens propres (identifiés par
le code réservé CODE_PLATEFORME). Un "Copier" permet de dupliquer la
configuration d'un cabinet vers un autre SANS jamais exposer les champs
sensibles (mot de passe SMTP, token WhatsApp...) au navigateur du
super-admin : la copie est effectuée entièrement côté serveur.

§ demande utilisateur ("vérifie d'abord dans Site-SawaliSmartSystems avant
d'implémenter") : le diagnostic WhatsApp ci-dessous (test-config enrichi,
token-health, webhook-subscription, webhook-subscribe) est PORTÉ depuis
backend/server.py de ce dépôt de référence (routes /admin/whatsapp/*),
adapté à l'architecture multi-cabinets de cette plateforme (une config
ConfigurationWhatsApp PAR CABINET, au lieu d'un unique document `settings`
global côté référence) — même logique de diagnostic, mêmes messages
d'erreur Meta explicites, jamais réécrits depuis zéro.
"""

from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.core.database import obtenir_base, Collections
from app.core.dependances import exiger_super_admin
from app.models.configuration_smtp import CODE_PLATEFORME
from app.utils.smtp_api import envoyer_email
from app.utils.whatsapp_api import envoyer_message_whatsapp_texte, URL_API_META

router = APIRouter(prefix="/api/plateforme/cabinets/{code_cabinet}/communication", tags=["Plateforme — Communication (super-admin)"])

CHAMPS_SENSIBLES_SMTP = ("mot_de_passe",)
CHAMPS_SENSIBLES_WA = ("token_acces_systeme", "app_secret", "jeton_verification_webhook")


def _masquer(document: dict | None, champs_sensibles: tuple) -> dict:
    document = dict(document) if document else {}
    for champ in champs_sensibles:
        document[f"{champ}_renseigne"] = bool(document.get(champ))
        document.pop(champ, None)
    document.pop("_id", None)
    return document


async def _verifier_cabinet_existe(base, code_cabinet: str):
    if code_cabinet == CODE_PLATEFORME:
        return  # pas un vrai cabinet — toujours valide, c'est la configuration du super-admin lui-même
    if not await base[Collections.CABINET].find_one({"code_cabinet": code_cabinet}):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cabinet introuvable.")


@router.get("")
async def obtenir_communication(code_cabinet: str, super_admin: dict = Depends(exiger_super_admin)):
    """Configuration SMTP + WhatsApp de ce cabinet (ou de la plateforme si code_cabinet == PLATEFORME) — champs sensibles masqués."""
    base = obtenir_base()
    await _verifier_cabinet_existe(base, code_cabinet)
    smtp = await base[Collections.CONFIGURATION_SMTP].find_one({"cabinet_code": code_cabinet})
    whatsapp = await base[Collections.CONFIGURATION_WHATSAPP].find_one({"cabinet_code": code_cabinet})
    return {
        "smtp": _masquer(smtp, CHAMPS_SENSIBLES_SMTP),
        "whatsapp": _masquer(whatsapp, CHAMPS_SENSIBLES_WA),
    }


@router.put("/smtp")
async def modifier_smtp(code_cabinet: str, donnees: dict, super_admin: dict = Depends(exiger_super_admin)):
    """Un champ sensible (mot_de_passe) omis conserve sa valeur déjà enregistrée — même principe qu'ailleurs sur la plateforme."""
    base = obtenir_base()
    await _verifier_cabinet_existe(base, code_cabinet)
    champs_autorises = ("hote", "port", "utilisateur", "mot_de_passe", "adresse_expediteur", "nom_expediteur", "utiliser_tls", "actif")
    valeurs = {k: v for k, v in donnees.items() if k in champs_autorises}
    valeurs["cabinet_code"] = code_cabinet
    await base[Collections.CONFIGURATION_SMTP].update_one({"cabinet_code": code_cabinet}, {"$set": valeurs}, upsert=True)
    config = await base[Collections.CONFIGURATION_SMTP].find_one({"cabinet_code": code_cabinet})
    return _masquer(config, CHAMPS_SENSIBLES_SMTP)


@router.put("/whatsapp")
async def modifier_whatsapp(code_cabinet: str, donnees: dict, super_admin: dict = Depends(exiger_super_admin)):
    base = obtenir_base()
    await _verifier_cabinet_existe(base, code_cabinet)
    champs_autorises = ("waba_id", "numero_telephone_id", "numero_telephone_affiche", "app_id", "token_acces_systeme", "app_secret", "jeton_verification_webhook", "actif")
    valeurs = {k: v for k, v in donnees.items() if k in champs_autorises}
    valeurs["cabinet_code"] = code_cabinet
    await base[Collections.CONFIGURATION_WHATSAPP].update_one({"cabinet_code": code_cabinet}, {"$set": valeurs}, upsert=True)
    config = await base[Collections.CONFIGURATION_WHATSAPP].find_one({"cabinet_code": code_cabinet})
    return _masquer(config, CHAMPS_SENSIBLES_WA)


class CopieCommunicationRequete(BaseModel):
    code_cabinet_source: str
    elements: list[str]  # sous-ensemble de ["smtp", "whatsapp"]


@router.post("/copier")
async def copier_communication(code_cabinet: str, requete: CopieCommunicationRequete, super_admin: dict = Depends(exiger_super_admin)):
    """
    Copie la configuration SMTP et/ou WhatsApp d'un AUTRE cabinet vers celui-ci
    (§ demande utilisateur — bouton "Copier"). Entièrement côté serveur : les
    valeurs sensibles (mot de passe SMTP, token WhatsApp...) transitent de
    document à document SANS JAMAIS être exposées au navigateur du
    super-admin, contrairement à un simple copier-coller de formulaire.
    """
    base = obtenir_base()
    await _verifier_cabinet_existe(base, code_cabinet)
    await _verifier_cabinet_existe(base, requete.code_cabinet_source)
    if code_cabinet == requete.code_cabinet_source:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Le cabinet source doit être différent du cabinet cible.")

    resultat = {}
    if "smtp" in requete.elements:
        source = await base[Collections.CONFIGURATION_SMTP].find_one({"cabinet_code": requete.code_cabinet_source})
        if source:
            copie = {k: v for k, v in source.items() if k not in ("_id", "cabinet_code")}
            copie["cabinet_code"] = code_cabinet
            await base[Collections.CONFIGURATION_SMTP].update_one({"cabinet_code": code_cabinet}, {"$set": copie}, upsert=True)
        resultat["smtp"] = bool(source)
    if "whatsapp" in requete.elements:
        source = await base[Collections.CONFIGURATION_WHATSAPP].find_one({"cabinet_code": requete.code_cabinet_source})
        if source:
            copie = {k: v for k, v in source.items() if k not in ("_id", "cabinet_code")}
            copie["cabinet_code"] = code_cabinet
            await base[Collections.CONFIGURATION_WHATSAPP].update_one({"cabinet_code": code_cabinet}, {"$set": copie}, upsert=True)
        resultat["whatsapp"] = bool(source)
    return {"statut": "copié", "elements_copies": resultat}


@router.delete("/{type_config}/champ-sensible/{champ}")
async def effacer_champ_sensible(code_cabinet: str, type_config: str, champ: str, super_admin: dict = Depends(exiger_super_admin)):
    """Efface un champ sensible précis (ex: révocation d'un mot de passe ou token compromis)."""
    if type_config == "smtp":
        collection, champs_valides = Collections.CONFIGURATION_SMTP, CHAMPS_SENSIBLES_SMTP
    elif type_config == "whatsapp":
        collection, champs_valides = Collections.CONFIGURATION_WHATSAPP, CHAMPS_SENSIBLES_WA
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Type de configuration inconnu.")
    if champ not in champs_valides:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Champ inconnu.")
    base = obtenir_base()
    await base[collection].update_one({"cabinet_code": code_cabinet}, {"$unset": {champ: ""}})
    return {"statut": "effacé"}


class TestSMTPRequete(BaseModel):
    destinataire: str


class TestWhatsAppRequete(BaseModel):
    numero_destinataire: str


@router.post("/smtp/tester")
async def tester_smtp(code_cabinet: str, requete: TestSMTPRequete, super_admin: dict = Depends(exiger_super_admin)):
    """
    § demande utilisateur : bouton "Tester" — envoie un VRAI email de test
    avec la configuration SMTP ENREGISTRÉE (celle en base, jamais une
    valeur non sauvegardée saisie dans le formulaire — pour tester
    exactement ce qui sera utilisé en production, pas un brouillon).
    """
    base = obtenir_base()
    await _verifier_cabinet_existe(base, code_cabinet)
    config = await base[Collections.CONFIGURATION_SMTP].find_one({"cabinet_code": code_cabinet})
    libelle = "la plateforme SAWALI" if code_cabinet == CODE_PLATEFORME else f"le cabinet {code_cabinet}"
    succes, message = await envoyer_email(
        config, requete.destinataire,
        sujet="Test de configuration SMTP — SAWALI DentalCare",
        corps=(
            f"Ceci est un email de test envoyé depuis la configuration SMTP de {libelle}.\n\n"
            "Si vous recevez ce message, votre configuration SMTP fonctionne correctement."
        ),
    )
    return {"succes": succes, "message": message}


@router.post("/whatsapp/tester")
async def tester_whatsapp(code_cabinet: str, requete: TestWhatsAppRequete, super_admin: dict = Depends(exiger_super_admin)):
    """§ demande utilisateur : bouton "Tester" — envoie un VRAI message WhatsApp avec la configuration ENREGISTRÉE."""
    base = obtenir_base()
    await _verifier_cabinet_existe(base, code_cabinet)
    config = await base[Collections.CONFIGURATION_WHATSAPP].find_one({"cabinet_code": code_cabinet})
    libelle = "la plateforme SAWALI" if code_cabinet == CODE_PLATEFORME else f"le cabinet {code_cabinet}"
    succes, message = await envoyer_message_whatsapp_texte(
        config, requete.numero_destinataire,
        f"Ceci est un message de test envoyé depuis la configuration WhatsApp de {libelle}. Si vous recevez ce message, votre configuration fonctionne correctement. ✅",
    )
    return {"succes": succes, "message": message}


# ============================================================================
# § porté depuis Site-SawaliSmartSystems (backend/server.py, routes
# /admin/whatsapp/test-config, /token-health, /webhook-subscription,
# /webhook-subscribe) — adapté au modèle multi-cabinets (une config par
# cabinet, plutôt qu'un unique document `settings` plateforme). Diagnostic
# BEAUCOUP plus complet que le simple "Tester" ci-dessus : vérifie
# séparément WABA, numéro, templates, santé/expiration du token, et la
# souscription effective du webhook côté Meta — chaque panneau explique
# PRÉCISÉMENT quoi corriger, pas seulement "ça ne marche pas".
# ============================================================================

@router.post("/whatsapp/test-config")
async def tester_config_whatsapp(code_cabinet: str, super_admin: dict = Depends(exiger_super_admin)):
    """
    Valide les identifiants Meta en sondant Graph API (WABA, numéro,
    templates) — un check par élément, chacun avec son propre détail,
    plutôt qu'un seul verdict global. Reproduit /admin/whatsapp/test-config
    de la référence.
    """
    base = obtenir_base()
    await _verifier_cabinet_existe(base, code_cabinet)
    config = await base[Collections.CONFIGURATION_WHATSAPP].find_one({"cabinet_code": code_cabinet}) or {}
    access_token = (config.get("token_acces_systeme") or "").strip()
    waba_id = (config.get("waba_id") or "").strip()
    phone_id = (config.get("numero_telephone_id") or "").strip()
    app_id = (config.get("app_id") or "").strip()

    checks: list[dict] = []

    def ajouter(cle, libelle, ok, detail):
        checks.append({"key": cle, "label": libelle, "ok": bool(ok), "detail": detail})

    ajouter("access_token", "Token d'accès renseigné", bool(access_token), "Token présent" if access_token else "Manquant")
    ajouter("waba_id", "WABA ID renseigné", bool(waba_id), waba_id or "Manquant")
    ajouter("phone_id", "Phone Number ID renseigné", bool(phone_id), phone_id or "Manquant")
    ajouter("app_id", "App ID renseigné (optionnel)", bool(app_id), app_id or "Non fourni (facultatif)")

    if not access_token or not waba_id or not phone_id:
        return {"ok": False, "checks": checks, "summary": "Informations requises manquantes — impossible de contacter Meta."}

    entetes = {"Authorization": f"Bearer {access_token}"}
    try:
        async with httpx.AsyncClient(timeout=10) as http:
            r1 = await http.get(f"{URL_API_META}/{waba_id}", params={"fields": "id,name,message_template_namespace"}, headers=entetes)
            try:
                d1 = r1.json()
            except ValueError:
                d1 = {"text": r1.text[:500]}
            if r1.status_code < 300:
                ajouter("waba_check", "WABA accessible", True, f"{d1.get('name') or '(sans nom)'} (id={d1.get('id')})")
            else:
                erreur = (d1.get("error") or {}).get("message") if isinstance(d1, dict) else None
                ajouter("waba_check", "WABA accessible", False, f"HTTP {r1.status_code} — {erreur or 'erreur Meta'}")

            r2 = await http.get(f"{URL_API_META}/{phone_id}", params={"fields": "display_phone_number,verified_name,quality_rating,code_verification_status"}, headers=entetes)
            try:
                d2 = r2.json()
            except ValueError:
                d2 = {"text": r2.text[:500]}
            if r2.status_code < 300:
                ajouter("phone_check", "Numéro WhatsApp Business validé", True, f"{d2.get('display_phone_number') or '?'} — {d2.get('verified_name') or '?'} — Qualité {d2.get('quality_rating') or '?'}")
            else:
                erreur = (d2.get("error") or {}).get("message") if isinstance(d2, dict) else None
                ajouter("phone_check", "Numéro WhatsApp Business validé", False, f"HTTP {r2.status_code} — {erreur or 'erreur Meta'}")

            r3 = await http.get(f"{URL_API_META}/{waba_id}/message_templates", params={"limit": 1}, headers=entetes)
            if r3.status_code < 300:
                try:
                    total = len((r3.json() or {}).get("data") or [])
                except ValueError:
                    total = 0
                ajouter("templates_check", "Lecture des templates", True, f"Réponse Meta OK ({total} template(s) trouvé(s) dans la 1ère page)")
            else:
                try:
                    d3 = r3.json()
                    erreur = (d3.get("error") or {}).get("message") if isinstance(d3, dict) else None
                except ValueError:
                    erreur = None
                ajouter("templates_check", "Lecture des templates", False, f"HTTP {r3.status_code} — {erreur or 'erreur Meta'}")
    except httpx.TimeoutException:
        ajouter("network", "Connexion Meta Graph API", False, "Timeout 10s — vérifiez la connectivité sortante du serveur")
    except httpx.HTTPError as exc:
        ajouter("network", "Connexion Meta Graph API", False, f"Erreur : {str(exc)[:200]}")

    ok = all(c["ok"] for c in checks if c["key"] != "app_id")  # app_id facultatif
    resume = "Tous les paramètres sont valides — prêt à envoyer." if ok else "Un ou plusieurs paramètres sont invalides. Voir détail."
    return {"ok": ok, "checks": checks, "summary": resume}


@router.get("/whatsapp/token-health")
async def diagnostic_token_whatsapp(code_cabinet: str, super_admin: dict = Depends(exiger_super_admin)):
    """
    Diagnostic du token WhatsApp Cloud API (validité, expiration, type
    USER vs SYSTEM_USER — seul SYSTEM_USER ne peut pas expirer) + test
    fonctionnel sur le numéro configuré. Reproduit
    /admin/whatsapp/token-health de la référence (pattern « marche 2 jours
    puis ne marche plus » = token utilisateur 24h).
    """
    base = obtenir_base()
    await _verifier_cabinet_existe(base, code_cabinet)
    config = await base[Collections.CONFIGURATION_WHATSAPP].find_one({"cabinet_code": code_cabinet}) or {}
    access_token = (config.get("token_acces_systeme") or "").strip()
    phone_number_id = (config.get("numero_telephone_id") or "").strip()
    app_secret = (config.get("app_secret") or "").strip()
    app_id_connu = (config.get("app_id") or "").strip()
    if not access_token:
        return {"ok": False, "reason": "no_token", "message": "Aucun token d'accès renseigné pour ce cabinet."}

    resultat: dict = {"ok": False, "token_type": None, "is_valid": None, "expires_at": None, "days_to_expiry": None, "scopes": [], "app_id": None, "phone_check": None, "message": None}

    try:
        async with httpx.AsyncClient(timeout=8) as http:
            parametres = {"input_token": access_token}
            if app_id_connu and app_secret:
                parametres["access_token"] = f"{app_id_connu}|{app_secret}"
            else:
                parametres["access_token"] = access_token  # auto-introspection
            r = await http.get(f"{URL_API_META}/debug_token", params=parametres)
            d = r.json() if r.status_code < 500 else {}
            donnees = (d or {}).get("data") or {}
            if r.status_code >= 300 or not donnees:
                resultat["message"] = (d.get("error") or {}).get("message") or f"HTTP {r.status_code}"
            else:
                resultat["is_valid"] = bool(donnees.get("is_valid"))
                resultat["token_type"] = donnees.get("type")
                resultat["app_id"] = donnees.get("app_id")
                resultat["scopes"] = donnees.get("scopes") or []
                exp = donnees.get("expires_at")
                if exp and exp > 0:
                    dt = datetime.fromtimestamp(exp, tz=timezone.utc)
                    resultat["expires_at"] = dt.isoformat()
                    resultat["days_to_expiry"] = round((dt - datetime.now(timezone.utc)).total_seconds() / 86400, 2)
    except httpx.HTTPError as exc:
        resultat["message"] = f"debug_token exception : {exc}"

    if phone_number_id and access_token:
        try:
            async with httpx.AsyncClient(timeout=8) as http:
                r = await http.get(f"{URL_API_META}/{phone_number_id}", params={"fields": "display_phone_number,verified_name,quality_rating,name_status"}, headers={"Authorization": f"Bearer {access_token}"})
                if r.status_code < 300:
                    resultat["phone_check"] = {"ok": True, **r.json()}
                else:
                    try:
                        erreur = (r.json() or {}).get("error") or {}
                    except ValueError:
                        erreur = {}
                    resultat["phone_check"] = {"ok": False, "error": erreur.get("message") or f"HTTP {r.status_code}", "error_code": erreur.get("code")}
        except httpx.HTTPError as exc:
            resultat["phone_check"] = {"ok": False, "error": str(exc)[:200]}

    resultat["ok"] = bool(resultat.get("is_valid")) and (resultat.get("phone_check") or {}).get("ok") in (True, None)
    if resultat["token_type"] == "USER" and resultat.get("days_to_expiry") is not None:
        if resultat["days_to_expiry"] < 7:
            resultat["warning"] = f"⚠️ Token utilisateur expire dans {resultat['days_to_expiry']} jour(s) — passez à un token SYSTEM_USER permanent."
    elif resultat["token_type"] == "USER":
        resultat["warning"] = "⚠️ Token de type USER : risque d'expiration inopinée. Utilisez un token SYSTEM_USER permanent pour la production."
    return resultat


@router.get("/whatsapp/webhook-subscription")
async def diagnostic_souscription_webhook(code_cabinet: str, super_admin: dict = Depends(exiger_super_admin)):
    """
    Vérifie côté Meta si l'app est toujours abonnée aux événements
    `messages` du WABA — cause typique du « plus aucun message entrant
    depuis X jours alors que l'envoi fonctionne ». Reproduit
    /admin/whatsapp/webhook-subscription de la référence.
    """
    base = obtenir_base()
    await _verifier_cabinet_existe(base, code_cabinet)
    config = await base[Collections.CONFIGURATION_WHATSAPP].find_one({"cabinet_code": code_cabinet}) or {}
    access_token = (config.get("token_acces_systeme") or "").strip()
    waba_id = (config.get("waba_id") or "").strip()
    phone_number_id = (config.get("numero_telephone_id") or "").strip()
    if not access_token or not waba_id:
        return {
            "ok": False, "reason": "missing_config", "message": "Token d'accès ou WABA ID manquant dans la configuration de ce cabinet.",
            "configured": {"access_token": bool(access_token), "waba_id": bool(waba_id), "phone_number_id": bool(phone_number_id)},
        }

    resultat: dict = {"ok": False, "waba_id": waba_id, "phone_number_id": phone_number_id or None, "subscribed_apps": [], "messages_subscribed": False, "message": None, "token_probe": None}

    try:
        async with httpx.AsyncClient(timeout=8) as http:
            r0 = await http.get(f"{URL_API_META}/me", headers={"Authorization": f"Bearer {access_token}"})
            try:
                me = r0.json()
            except ValueError:
                me = {"_raw_text": (r0.text or "")[:300]}
            resultat["token_probe"] = {
                "status": r0.status_code, "ok": r0.status_code < 300,
                "id": me.get("id") if isinstance(me, dict) else None, "name": me.get("name") if isinstance(me, dict) else None,
                "error": ((me or {}).get("error") or {}).get("message") if isinstance(me, dict) else None,
                "error_code": ((me or {}).get("error") or {}).get("code") if isinstance(me, dict) else None,
            }
            if r0.status_code >= 300:
                erreur_obj = (me or {}).get("error") if isinstance(me, dict) else {}
                if (erreur_obj or {}).get("code") == 190:
                    resultat["message"] = (
                        "🔑 Token Meta expiré ou invalide (code 190). Régénérez un System User Token permanent dans "
                        "Meta Business Manager → Paramètres business → Utilisateurs système → Générer un nouveau token, "
                        "puis collez-le dans Plateforme → Communication → WhatsApp."
                    )
                    resultat["error_code"] = 190
                    resultat["error_type"] = "OAuthException"
                    return resultat
    except httpx.HTTPError as exc:
        resultat["token_probe"] = {"ok": False, "error": f"{type(exc).__name__}: {str(exc)[:200]}"}

    try:
        async with httpx.AsyncClient(timeout=10) as http:
            r = await http.get(f"{URL_API_META}/{waba_id}/subscribed_apps", headers={"Authorization": f"Bearer {access_token}"})
            resultat["http_status"] = r.status_code
            try:
                donnees = r.json()
            except ValueError:
                resultat["raw_response_preview"] = (r.text or "")[:500]
                resultat["message"] = f"⚠️ Réponse non-JSON de Meta. HTTP {r.status_code}. Aperçu : {(r.text or '')[:160]!r}"
                return resultat
            if r.status_code >= 300:
                erreur = (donnees or {}).get("error") or {} if isinstance(donnees, dict) else {}
                resultat["message"] = erreur.get("message") or f"HTTP {r.status_code}"
                resultat["error_code"] = erreur.get("code")
                resultat["error_type"] = erreur.get("type")
                resultat["raw_response_preview"] = str(donnees)[:500]
                return resultat
            apps = (donnees or {}).get("data") or [] if isinstance(donnees, dict) else []
            resultat["subscribed_apps"] = apps
            a_messages = False
            for a in apps:
                champs = a.get("subscribed_fields") or []
                if isinstance(champs, list) and any((c.get("name") if isinstance(c, dict) else str(c)) == "messages" for c in champs):
                    a_messages = True
                    break
            if not a_messages and apps:
                a_messages = True
                resultat["note"] = "Souscription présente mais Meta n'a pas renvoyé `subscribed_fields` (token sans scope étendu). Le compte est probablement OK."
            resultat["messages_subscribed"] = a_messages
            resultat["ok"] = a_messages
            if not apps:
                resultat["message"] = "❌ Aucune app abonnée à ce WABA — Meta n'enverra plus jamais de webhook tant que vous n'aurez pas re-souscrit l'app. Cliquez sur « 🔁 Re-souscrire le webhook »."
    except httpx.HTTPError as exc:
        resultat["message"] = f"⚠️ Erreur réseau lors de l'appel Meta : {type(exc).__name__}: {str(exc)[:200] or '(message vide)'}"
        resultat["error_type"] = type(exc).__name__
    return resultat


@router.post("/whatsapp/webhook-subscribe")
async def resouscrire_webhook(code_cabinet: str, super_admin: dict = Depends(exiger_super_admin)):
    """
    Re-souscrit l'app Meta au WABA pour rétablir le flux des webhooks
    entrants (équivalent POST /{waba_id}/subscribed_apps) — à utiliser
    quand le diagnostic ci-dessus renvoie subscribed_apps: []. Reproduit
    /admin/whatsapp/webhook-subscribe de la référence.
    """
    base = obtenir_base()
    await _verifier_cabinet_existe(base, code_cabinet)
    config = await base[Collections.CONFIGURATION_WHATSAPP].find_one({"cabinet_code": code_cabinet}) or {}
    access_token = (config.get("token_acces_systeme") or "").strip()
    waba_id = (config.get("waba_id") or "").strip()
    if not access_token or not waba_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Token d'accès ou WABA ID manquant.")
    try:
        async with httpx.AsyncClient(timeout=15) as http:
            r = await http.post(f"{URL_API_META}/{waba_id}/subscribed_apps", headers={"Authorization": f"Bearer {access_token}"})
            if r.status_code >= 300:
                erreur = {}
                try:
                    erreur = (r.json() or {}).get("error") or {}
                except ValueError:
                    pass
                return {
                    "ok": False, "status": r.status_code, "message": erreur.get("message") or f"HTTP {r.status_code}",
                    "error_code": erreur.get("code"), "error_type": erreur.get("type"), "fbtrace_id": erreur.get("fbtrace_id"),
                    "hint": "Si l'erreur dit 'permission denied' ou 'app does not have permission', ouvrez Meta Business Suite → Paramètres → Comptes WhatsApp → votre WABA → Apps connectées, et vérifiez que l'app est bien associée.",
                }
            corps = r.json() or {}
            return {"ok": True, "status": r.status_code, "response": corps, "message": "✅ Souscription re-créée. Meta devrait recommencer à appeler votre webhook dans les prochaines secondes. Envoyez un message WA depuis un téléphone vers votre numéro Business pour confirmer."}
    except httpx.HTTPError as exc:
        return {"ok": False, "message": f"⚠️ Erreur réseau : {type(exc).__name__}: {str(exc)[:200] or '(message vide)'}", "error_type": type(exc).__name__}
