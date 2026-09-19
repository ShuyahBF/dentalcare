"""
app/utils/verification_licences.py
---------------------------------------
§ demande utilisateur : exécuté une fois par jour (voir planification dans
app/main.py, cycle_de_vie) pour chaque cabinet actif :
  1. Détermine sa date d'expiration effective — celle de sa licence Active
     la plus récente, ou à défaut date_creation + duree_essai_jours (essai
     gratuit).
  2. Si l'expiration est dans <= 3 jours et qu'aucune notification n'a
     encore été envoyée pour cette échéance : crée une NotificationPlateforme
     ("expiration_proche"), visible par le super-admin depuis /plateforme.
  3. Si l'expiration est dépassée : suspend automatiquement le cabinet
     (Etat -> "Suspendu") et crée une NotificationPlateforme
     ("suspension_automatique").

IMPORTANT — portée actuelle : ce module crée les notifications EN BASE (donc
visibles immédiatement dans l'interface /plateforme à la prochaine connexion
du super-admin), gère la suspension automatique, ET tente l'envoi EFFECTIF
par email et par WhatsApp (email_envoye / whatsapp_envoye sur
NotificationPlateforme) via la configuration SMTP/WhatsApp de la
PLATEFORME (CODE_PLATEFORME — voir app/routers/plateforme_communication.py
pour la paramétrer, avec un bouton "Tester" pour vérifier les identifiants
avant de compter dessus). Si cette configuration est absente ou inactive,
les deux champs restent à False — la notification reste néanmoins visible
en base normalement.
"""

from datetime import datetime, timedelta

from app.core.database import obtenir_base, Collections
from app.models.configuration_smtp import CODE_PLATEFORME
from app.utils.compteurs import prochain_numero
from app.utils.smtp_api import envoyer_email
from app.utils.whatsapp_api import envoyer_message_whatsapp_texte

SEUIL_NOTIFICATION_JOURS = 3


async def _envoyer_notification_reelle(base, cabinet_code: str, type_notification: str, message: str) -> tuple[bool, bool]:
    """
    § demande utilisateur : envoi EFFECTIF (email + WhatsApp) d'une
    notification plateforme, en plus de sa création en base (déjà gérée par
    ailleurs). Utilise la configuration SMTP/WhatsApp de la PLATEFORME
    (CODE_PLATEFORME, distincte de celle de chaque cabinet — voir
    app/models/configuration_smtp.py) et envoie à TOUS les comptes
    super-admin ayant un email/téléphone renseigné. Retourne
    (email_envoye, whatsapp_envoye) — True dès qu'AU MOINS UN envoi de ce
    type a réussi (plusieurs super-admins peuvent exister).
    """
    smtp_config = await base[Collections.CONFIGURATION_SMTP].find_one({"cabinet_code": CODE_PLATEFORME})
    wa_config = await base[Collections.CONFIGURATION_WHATSAPP].find_one({"cabinet_code": CODE_PLATEFORME})
    super_admins = [u async for u in base[Collections.UTILISATEUR_BLG].find({"EstSuperAdmin": True})]

    sujet = "⚠️ Alerte licence — " + ("Cabinet suspendu" if type_notification == "suspension_automatique" else "Expiration proche")
    email_envoye = False
    whatsapp_envoye = False

    if smtp_config and smtp_config.get("actif"):
        for u in super_admins:
            if not u.get("Email"):
                continue
            succes, _detail = await envoyer_email(smtp_config, u["Email"], sujet, message)
            email_envoye = email_envoye or succes

    if wa_config and wa_config.get("actif"):
        for u in super_admins:
            if not u.get("Téléphone"):
                continue
            succes, _detail = await envoyer_message_whatsapp_texte(wa_config, u["Téléphone"], f"{sujet}\n\n{message}")
            whatsapp_envoye = whatsapp_envoye or succes

    return email_envoye, whatsapp_envoye


async def _date_expiration_effective(base, cabinet: dict) -> datetime | None:
    """Date d'expiration effective d'un cabinet : sa licence Active la plus récente, sinon sa période d'essai."""
    licence_active = await base[Collections.LICENCE].find_one(
        {"cabinet_code": cabinet["code_cabinet"], "statut": "Active"},
        sort=[("date_expiration", -1)],
    )
    if licence_active:
        return licence_active["date_expiration"], licence_active
    duree_essai = cabinet.get("duree_essai_jours")
    date_creation = cabinet.get("date_creation")
    if duree_essai and date_creation:
        if isinstance(date_creation, str):
            date_creation = datetime.fromisoformat(date_creation.replace("Z", "+00:00")).replace(tzinfo=None)
        return date_creation + timedelta(days=duree_essai), None
    return None, None


async def _creer_notification(base, cabinet_code: str, type_notification: str, message: str) -> None:
    numero_enreg = await prochain_numero("NotificationPlateforme", valeur_depart=1)
    # § demande utilisateur : l'envoi EFFECTIF (email/WhatsApp) est désormais
    # câblé (voir _envoyer_notification_reelle ci-dessus) — auparavant ces
    # deux champs restaient TOUJOURS à False faute d'identifiants d'envoi
    # branchés. Tenté AVANT l'insertion pour enregistrer le résultat réel
    # dès la création, pas un simple placeholder.
    email_envoye, whatsapp_envoye = await _envoyer_notification_reelle(base, cabinet_code, type_notification, message)
    await base[Collections.NOTIFICATION_PLATEFORME].insert_one({
        "numero_enreg": numero_enreg, "cabinet_code": cabinet_code, "type_notification": type_notification,
        "message": message, "date_creation": datetime.utcnow(), "lue": False,
        "email_envoye": email_envoye, "whatsapp_envoye": whatsapp_envoye,
    })


async def verifier_essais_et_licences() -> dict:
    """Tâche quotidienne — retourne un résumé (utile pour la journalisation et les tests)."""
    base = obtenir_base()
    maintenant = datetime.utcnow()
    cabinets_suspendus, notifications_creees = [], []

    async for cabinet in base[Collections.CABINET].find({"etat": "Actif"}):
        date_expiration, licence = await _date_expiration_effective(base, cabinet)
        if date_expiration is None:
            continue  # pas d'échéance définie pour ce cabinet (essai illimité) : rien à vérifier

        if maintenant >= date_expiration:
            await base[Collections.CABINET].update_one({"code_cabinet": cabinet["code_cabinet"]}, {"$set": {"etat": "Suspendu"}})
            if licence:
                await base[Collections.LICENCE].update_one({"numero_enreg": licence["numero_enreg"]}, {"$set": {"statut": "Expirée"}})
                source_echeance = "licence"
            else:
                source_echeance = "période d'essai"
            await _creer_notification(
                base, cabinet["code_cabinet"], "suspension_automatique",
                f"Le cabinet {cabinet['code_cabinet']} ({cabinet.get('denomination', '')}) a été suspendu automatiquement : "
                f"{source_echeance} expirée le {date_expiration.strftime('%d/%m/%Y')} sans renouvellement.",
            )
            cabinets_suspendus.append(cabinet["code_cabinet"])
            continue

        jours_restants = (date_expiration - maintenant).days
        deja_notifie = licence.get("notification_3j_envoyee", False) if licence else cabinet.get("notification_essai_3j_envoyee", False)
        if jours_restants <= SEUIL_NOTIFICATION_JOURS and not deja_notifie:
            source_echeance = "licence" if licence else "fin de période d'essai"
            await _creer_notification(
                base, cabinet["code_cabinet"], "expiration_proche",
                f"Le cabinet {cabinet['code_cabinet']} ({cabinet.get('denomination', '')}) arrive à expiration le "
                f"{date_expiration.strftime('%d/%m/%Y')} ({source_echeance}) — dans {jours_restants} jour(s).",
            )
            if licence:
                await base[Collections.LICENCE].update_one({"numero_enreg": licence["numero_enreg"]}, {"$set": {"notification_3j_envoyee": True}})
            else:
                await base[Collections.CABINET].update_one({"code_cabinet": cabinet["code_cabinet"]}, {"$set": {"notification_essai_3j_envoyee": True}})
            notifications_creees.append(cabinet["code_cabinet"])

    return {"cabinets_suspendus": cabinets_suspendus, "notifications_creees": notifications_creees}
