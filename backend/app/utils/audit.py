"""
app/utils/audit.py
----------------------
Journal d'audit des actions sensibles (suppression de reçu, remboursement,
avoir, correction de cotation — cf. droits UtilisateurBlg), comme exigé au
§10 "SÉCURITÉ" du cahier des charges.
"""

from datetime import datetime

from app.core.database import obtenir_base


async def journaliser_action(login: str, action: str, details: dict | None = None) -> None:
    """Enregistre une entrée d'audit horodatée dans la collection JournalAudit."""
    base = obtenir_base()
    await base["JournalAudit"].insert_one({
        "login": login,
        "action": action,
        "details": details or {},
        "date_heure": datetime.utcnow(),
    })
