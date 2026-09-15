"""
app/utils/compteurs.py
-------------------------
MongoDB n'a pas d'auto-incrément natif comme HFSQL. On simule ici la
génération des "N° Enr." (identifiants numériques séquentiels utilisés dans
tout le legacy Biolog) et des numéros de reçu format "R-2026......", via une
collection dédiée "Compteurs" avec un compteur atomique par entité.
"""

from datetime import datetime

from app.core.database import obtenir_base, Collections


async def prochain_numero(nom_sequence: str, valeur_depart: int = 1) -> int:
    """
    Retourne le prochain entier de la séquence 'nom_sequence' (ex: "Patient",
    "Dossier_Examen", "VenteClinique"...), de façon atomique (findOneAndUpdate
    avec $inc), pour éviter les doublons même en cas d'accès concurrent.
    """
    base = obtenir_base()
    resultat = await base[Collections.COMPTEURS].find_one_and_update(
        {"_id": nom_sequence},
        {"$inc": {"valeur": 1}},
        upsert=True,
        return_document=True,
    )
    valeur = resultat["valeur"]
    # Première utilisation de la séquence : on part de valeur_depart si fourni.
    if valeur == 1 and valeur_depart > 1:
        await base[Collections.COMPTEURS].update_one(
            {"_id": nom_sequence}, {"$set": {"valeur": valeur_depart}}
        )
        return valeur_depart
    return valeur


async def prochain_numero_recu() -> str:
    """
    Génère un numéro de reçu au format legacy "R-2026......" (préfixe R-,
    année en cours, puis un numéro séquentiel), comme sur le modèle de reçu
    fourni (ex: R-202613786).
    """
    annee = datetime.now().year
    sequence = await prochain_numero(f"recu_{annee}", valeur_depart=1)
    # Le modèle fourni utilise un numéro à 5 chiffres après l'année (ex: 13786).
    return f"R-{annee}{sequence:05d}"
