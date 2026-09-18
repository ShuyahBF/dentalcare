"""
app/utils/audit.py
----------------------
Journal d'audit des actions sensibles (suppression de reçu, remboursement,
avoir, correction de cotation — cf. droits UtilisateurBlg), comme exigé au
§10 "SÉCURITÉ" du cahier des charges.

§ demande utilisateur (super-admin plateforme) : chaque entrée porte
désormais le cabinet_code de l'auteur, pour que le super-admin puisse
consulter les logs d'activité PAR CABINET depuis /plateforme. Le
cabinet_code n'a pas besoin d'être fourni explicitement par chaque appelant
(pour ne pas devoir modifier tous les appels existants) : il est retrouvé
automatiquement à partir du login.
"""

from datetime import datetime

from app.core.database import obtenir_base, Collections


async def journaliser_action(login: str, action: str, details: dict | None = None, cabinet_code: str | None = None) -> None:
    """Enregistre une entrée d'audit horodatée dans la collection JournalAudit, rattachée au cabinet de l'auteur."""
    base = obtenir_base()
    if cabinet_code is None:
        auteur = await base[Collections.UTILISATEUR_BLG].find_one({"Login": login})
        cabinet_code = auteur.get("CodeCabinet") if auteur else None
    await base[Collections.JOURNAL_AUDIT].insert_one({
        "login": login,
        "cabinet_code": cabinet_code,
        "action": action,
        "details": details or {},
        "date_heure": datetime.utcnow(),
    })
