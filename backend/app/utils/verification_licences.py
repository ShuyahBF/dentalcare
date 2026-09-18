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
du super-admin) et gère la suspension automatique, qui sont les deux
mécanismes qui peuvent être testés et vérifiés dès maintenant. L'envoi
EFFECTIF par email et par WhatsApp (email_envoye / whatsapp_envoye sur
NotificationPlateforme) nécessite des identifiants d'envoi non configurés à
ce stade (un compte SMTP pour l'email ; un numéro WhatsApp Business propre à
la PLATEFORME, distinct des numéros de chaque cabinet, pour le WhatsApp) —
voir SUGGESTION.MD pour le détail de ce qui reste à brancher.
"""

from datetime import datetime, timedelta

from app.core.database import obtenir_base, Collections
from app.utils.compteurs import prochain_numero

SEUIL_NOTIFICATION_JOURS = 3


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
    await base[Collections.NOTIFICATION_PLATEFORME].insert_one({
        "numero_enreg": numero_enreg, "cabinet_code": cabinet_code, "type_notification": type_notification,
        "message": message, "date_creation": datetime.utcnow(), "lue": False,
        "email_envoye": False, "whatsapp_envoye": False,
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
