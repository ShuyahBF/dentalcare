"""
app/utils/client_cash.py
----------------------------
Le "Client CASH" est un patient générique utilisé pour les ventes au
comptoir sans identification du patient (§ demande utilisateur). Son
existence est vérifiée à chaque démarrage du serveur, et il est recréé
automatiquement s'il a été supprimé par erreur — pour que le Caissier
puisse TOUJOURS établir un reçu, même sans patient sélectionné.
"""

from datetime import datetime

from app.core.database import obtenir_base, Collections
from app.utils.compteurs import prochain_numero

NOM_CLIENT_CASH = "Client CASH"


async def assurer_client_cash_existe() -> dict:
    """
    Retourne le document Patient "Client CASH", en le créant s'il n'existe
    pas déjà (recherche par le flag EstClientCash, pas par le nom, pour
    rester robuste si le nom est un jour modifié depuis l'interface).
    """
    base = obtenir_base()
    existant = await base[Collections.PATIENT].find_one({"EstClientCash": True})
    if existant:
        return existant

    numero_enreg = await prochain_numero("Patient", valeur_depart=100000)
    document = {
        "Numéro_Enreg": numero_enreg,
        "ID_Patient": numero_enreg,
        "Nom": NOM_CLIENT_CASH,
        "Date Création": datetime.utcnow(),
        "Etat_En_Cours": 1,
        "NbVues": 0,
        "NbModifications": 0,
        "EstClientCash": True,
    }
    await base[Collections.PATIENT].insert_one(document)
    return document
