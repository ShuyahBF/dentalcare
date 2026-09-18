"""
app/utils/compteurs.py
-------------------------
MongoDB n'a pas d'auto-incrément natif comme HFSQL. On simule ici la
génération des "N° Enr." (identifiants numériques séquentiels utilisés dans
tout le legacy Biolog) et des numéros de reçu format "R-2026......", via une
collection dédiée "Compteurs" avec un compteur atomique par entité.

§ demande utilisateur (architecture SaaS multi-cabinets) : deux nouveaux
générateurs —
  - prochain_code_cabinet() : le code unique à 4 chiffres de chaque cabinet
    client de la plateforme (séquence globale, jamais réinitialisée).
  - prochain_numero_cabinet(type_entite, cabinet_code) : le numéro à 8
    caractères des patients/rendez-vous/reçus (ex: "00010152"), composé du
    code cabinet (4 chiffres) + un numéro d'ordre (4 chiffres) dont la
    séquence est propre à CHAQUE cabinet ET à L'ANNÉE EN COURS (elle repart
    de 1 au 1er janvier de chaque année, pour chaque cabinet).
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


async def prochain_code_cabinet() -> str:
    """Code unique à 4 chiffres du prochain cabinet créé sur la plateforme (ex: "0001", "0002"...)."""
    sequence = await prochain_numero("code_cabinet", valeur_depart=1)
    if sequence > 9999:
        raise ValueError("Limite de 9999 cabinets sur la plateforme atteinte (code à 4 chiffres).")
    return f"{sequence:04d}"


async def prochain_numero_cabinet(type_entite: str, cabinet_code: str) -> str:
    """
    Numéro à 8 caractères pour un patient, un rendez-vous ou un reçu :
    code cabinet (4 chiffres) + numéro d'ordre (4 chiffres), ex: "00010152"
    pour le cabinet 0001, 152e élément de ce type émis cette année. La
    séquence est propre à (type_entite, cabinet_code, année en cours) — elle
    repart de 1 chaque nouvelle année, pour chaque cabinet indépendamment.
    """
    annee = datetime.now().year
    nom_sequence = f"{type_entite}_{cabinet_code}_{annee}"
    sequence = await prochain_numero(nom_sequence, valeur_depart=1)
    if sequence > 9999:
        raise ValueError(f"Limite de 9999 {type_entite} par an atteinte pour le cabinet {cabinet_code}.")
    return f"{cabinet_code}{sequence:04d}"


async def prochain_numero_recu(cabinet_code: str) -> str:
    """
    Génère un numéro de reçu au format "R-00010152" : préfixe R- (lisibilité,
    conserve la compatibilité visuelle avec le modèle de reçu fourni) suivi
    du numéro à 8 caractères propre au cabinet (voir prochain_numero_cabinet).
    """
    return f"R-{await prochain_numero_cabinet('recu', cabinet_code)}"

