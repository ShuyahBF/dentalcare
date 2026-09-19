"""
app/utils/compteurs.py
-------------------------
MongoDB n'a pas d'auto-incrément natif comme HFSQL. On simule ici la
génération des "N° Enr." (identifiants numériques séquentiels utilisés dans
tout le legacy Biolog) et des numéros de reçu, via une collection dédiée
"Compteurs" avec un compteur atomique par entité.

§ demande utilisateur (architecture SaaS multi-cabinets) : deux nouveaux
générateurs —
  - prochain_code_cabinet() : le code unique à 4 chiffres de chaque cabinet
    client de la plateforme (séquence globale, jamais réinitialisée).
  - prochain_numero_cabinet(type_entite, cabinet_code) : le numéro à 12
    caractères des patients/rendez-vous (ex: "000120260152"), composé du
    code cabinet (4 chiffres) + année en cours (4 chiffres) + un numéro
    d'ordre (4 chiffres) dont la séquence est propre à CHAQUE cabinet ET à
    L'ANNÉE EN COURS (elle repart de 1 au 1er janvier de chaque année, pour
    chaque cabinet).
  - prochain_numero_recu(cabinet_code) : la référence de reçu au format
    "R-202600152" (préfixe R- + année + numéro d'ordre à 5 chiffres,
    JAMAIS le code cabinet — voir la fonction pour le détail).
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


async def definir_compteur(nom_sequence: str, prochain_index: int) -> None:
    """
    § demande utilisateur (super-admin — "définir/réinitialiser les index
    de numéros utilisés par types de documents [...] le numéro de compteur
    défini effacera et reprendra les références de documents") : force la
    séquence `nom_sequence` de sorte que le PROCHAIN appel à
    prochain_numero() renvoie exactement `prochain_index` — écrase la
    progression antérieure de cette séquence (upsert, fonctionne même si
    elle n'a encore jamais été utilisée). N'efface JAMAIS les documents
    déjà générés eux-mêmes (leur historique reste consultable) — seule la
    séquence de numérotation à venir est réinitialisée.
    """
    base = obtenir_base()
    await base[Collections.COMPTEURS].update_one(
        {"_id": nom_sequence}, {"$set": {"valeur": prochain_index - 1}}, upsert=True
    )


async def valeur_compteur(nom_sequence: str) -> int:
    """Dernier numéro déjà attribué par cette séquence (0 si jamais utilisée) — lecture seule, ne consomme pas de numéro."""
    base = obtenir_base()
    doc = await base[Collections.COMPTEURS].find_one({"_id": nom_sequence})
    return (doc or {}).get("valeur", 0)


async def prochain_code_cabinet() -> str:
    """Code unique à 4 chiffres du prochain cabinet créé sur la plateforme (ex: "0001", "0002"...)."""
    sequence = await prochain_numero("code_cabinet", valeur_depart=1)
    if sequence > 9999:
        raise ValueError("Limite de 9999 cabinets sur la plateforme atteinte (code à 4 chiffres).")
    return f"{sequence:04d}"


async def prochain_numero_cabinet(type_entite: str, cabinet_code: str) -> str:
    """
    § demande utilisateur : numéro pour un patient ou un rendez-vous —
    code cabinet (4 chiffres) + année en cours (4 chiffres) + numéro d'ordre
    (4 chiffres), ex: "000120260152" pour le cabinet 0001, 152e élément de ce
    type émis en 2026. La séquence est propre à (type_entite, cabinet_code,
    année en cours) — elle repart de 1 chaque nouvelle année, pour chaque
    cabinet indépendamment.
    """
    annee = datetime.now().year
    nom_sequence = f"{type_entite}_{cabinet_code}_{annee}"
    sequence = await prochain_numero(nom_sequence, valeur_depart=1)
    if sequence > 9999:
        raise ValueError(f"Limite de 9999 {type_entite} par an atteinte pour le cabinet {cabinet_code}.")
    return f"{cabinet_code}{annee}{sequence:04d}"


async def prochain_numero_recu(cabinet_code: str) -> str:
    """
    § demande utilisateur : référence de reçu au format "R-202600152" —
    préfixe R-, ANNÉE en cours (pas le code cabinet, contrairement aux
    patients/RDV — chaque cabinet gère sa propre numérotation de reçus,
    l'unicité en base restant garantie par le couple (référence,
    cabinet_code), jamais par la référence seule), puis un numéro d'ordre à
    5 chiffres propre à ce cabinet ET à l'année en cours (repart de 1 chaque
    nouvelle année).

    § bug corrigé (référence dupliquée "R-202600004") : ce format légataire
    coexiste, pour les cabinets migrés depuis l'ancien système mono-cabinet,
    avec des reçus déjà émis AVANT l'introduction de ce compteur dédié — le
    compteur seul ne "sait" donc pas toujours où en est la vraie séquence.
    Boucle défensive : si la référence générée est déjà prise (collision
    avec un reçu légataire ou tout autre cas), on repasse au numéro suivant
    jusqu'à en trouver un réellement libre, plutôt que de faire confiance
    aveuglément au compteur.
    """
    base = obtenir_base()
    annee = datetime.now().year
    for _ in range(1000):  # garde-fou : ne boucle jamais indéfiniment
        sequence = await prochain_numero(f"recu_{cabinet_code}_{annee}", valeur_depart=1)
        if sequence > 99999:
            raise ValueError(f"Limite de 99999 reçus par an atteinte pour le cabinet {cabinet_code}.")
        candidate = f"R-{annee}{sequence:05d}"
        deja_pris = await base[Collections.VENTE_CLINIQUE].find_one({"Référence": candidate, "cabinet_code": cabinet_code})
        if not deja_pris:
            return candidate
    raise ValueError(f"Impossible de générer une référence de reçu libre pour le cabinet {cabinet_code} (1000 tentatives).")


async def prochain_code_unique(prefixe: str, cabinet_code: str) -> str:
    """
    Code unique inaltérable, format "0001-0007" (code cabinet + numéro
    d'ordre), séquence propre à chaque cabinet ET à `prefixe` (jamais
    réinitialisée par année). Utilisé pour les contacts du Centre de
    Messagerie et les ordonnances du Dentiste.
    """
    sequence = await prochain_numero(f"{prefixe}_{cabinet_code}", valeur_depart=1)
    return f"{cabinet_code}-{sequence:04d}"


async def prochain_code_unique_contact(cabinet_code: str) -> str:
    """
    Code unique inaltérable d'un contact du Centre de Messagerie (§ demande
    utilisateur — reproduction de la référence), format "0001-0007" : code
    cabinet + numéro d'ordre, séquence propre à chaque cabinet (jamais
    réinitialisée par année, contrairement aux patients/RDV/reçus).
    """
    return await prochain_code_unique("contact", cabinet_code)

