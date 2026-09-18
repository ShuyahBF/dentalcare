"""
app/utils/client_cash.py
----------------------------
Le "Client CASH" est un patient générique utilisé pour les ventes au
comptoir sans identification du patient (§ demande utilisateur). Son
existence est vérifiée à chaque démarrage du serveur POUR CHAQUE CABINET
ACTIF de la plateforme (architecture SaaS multi-cabinets — chaque cabinet a
le sien, comme tout le reste de ses données), et il est recréé
automatiquement s'il a été supprimé par erreur — pour que le Caissier
puisse TOUJOURS établir un reçu, même sans patient sélectionné.
"""

from datetime import datetime

from app.core.database import obtenir_base, Collections
from app.utils.compteurs import prochain_numero, prochain_numero_cabinet

NOM_CLIENT_CASH = "Client CASH"


async def assurer_client_cash_existe(cabinet_code: str) -> dict:
    """
    Retourne le document Patient "Client CASH" DU CABINET cabinet_code, en
    le créant s'il n'existe pas déjà (recherche par le flag EstClientCash +
    cabinet_code, pas par le nom, pour rester robuste si le nom est un jour
    modifié depuis l'interface).
    """
    base = obtenir_base()
    existant = await base[Collections.PATIENT].find_one({"EstClientCash": True, "cabinet_code": cabinet_code})
    if existant:
        return existant

    numero_enreg = await prochain_numero("Patient", valeur_depart=100000)
    id_patient = await prochain_numero_cabinet("patient", cabinet_code)
    document = {
        "Numéro_Enreg": numero_enreg,
        "ID_Patient": id_patient,
        "cabinet_code": cabinet_code,
        "Nom": NOM_CLIENT_CASH,
        "Date Création": datetime.utcnow(),
        "Etat_En_Cours": 1,
        "NbVues": 0,
        "NbModifications": 0,
        "EstClientCash": True,
    }
    await base[Collections.PATIENT].insert_one(document)
    return document


async def assurer_client_cash_pour_tous_cabinets_actifs() -> None:
    """Appelé au démarrage du serveur (lifespan) : un Client CASH par cabinet actif."""
    base = obtenir_base()
    async for cabinet in base[Collections.CABINET].find({"etat": "Actif"}):
        await assurer_client_cash_existe(cabinet["code_cabinet"])
