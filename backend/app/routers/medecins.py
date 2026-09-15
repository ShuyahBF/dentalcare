"""
app/routers/medecins.py
---------------------------
Gestion du registre des dentistes (MédecinT) et calcul des créneaux libres
de leur agenda (§4a : "consulte le calendrier de disponibilité du dentiste
pour programmer un rendez-vous").
"""

from datetime import datetime, timedelta, time

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.database import obtenir_base, Collections
from app.core.dependances import obtenir_utilisateur_courant, exiger_role
from app.models.medecin import MedecinBase
from app.utils.compteurs import prochain_numero

router = APIRouter(prefix="/api/medecins", tags=["Dentistes"])

# Heures d'ouverture par défaut du cabinet (modifiable plus tard par créneau
# personnalisé côté Administrateur — volontairement simple pour la V1).
HEURE_OUVERTURE = time(8, 0)
HEURE_FERMETURE = time(18, 0)
DUREE_CRENEAU_MINUTES = 30


@router.get("")
async def lister_medecins(utilisateur: dict = Depends(obtenir_utilisateur_courant)):
    base = obtenir_base()
    curseur = base[Collections.MEDECIN_T].find({"EnActivité": True})
    return [m async for m in curseur]


@router.post("", status_code=status.HTTP_201_CREATED)
async def creer_medecin(medecin: MedecinBase, utilisateur: dict = Depends(exiger_role("Administrateur"))):
    base = obtenir_base()
    numero_enreg = await prochain_numero("MédecinT", valeur_depart=100)
    document = medecin.model_dump(by_alias=True)
    document["Numéro_Enreg"] = numero_enreg
    await base[Collections.MEDECIN_T].insert_one(document)
    document.pop("_id", None)
    return document


@router.get("/{numero_enreg}/creneaux-disponibles")
async def creneaux_disponibles(numero_enreg: int, date_cible: str, utilisateur: dict = Depends(obtenir_utilisateur_courant)):
    """
    Calcule les créneaux de 30 min disponibles pour un dentiste sur une
    journée donnée, en soustrayant ses rendez-vous déjà confirmés/proposés.
    """
    base = obtenir_base()
    jour = datetime.fromisoformat(date_cible).date()
    debut_jour = datetime.combine(jour, HEURE_OUVERTURE)
    fin_jour = datetime.combine(jour, HEURE_FERMETURE)

    rendez_vous_existants = [
        rv async for rv in base[Collections.RENDEZ_VOUS].find({
            "dentiste_numero_enreg": numero_enreg,
            "date_heure_debut": {"$gte": debut_jour, "$lt": fin_jour},
            "statut": {"$in": ["Proposé", "Confirmé", "Reporté"]},
        })
    ]
    intervalles_occupes = [(rv["date_heure_debut"], rv["date_heure_fin"]) for rv in rendez_vous_existants]

    creneaux = []
    curseur_temps = debut_jour
    while curseur_temps + timedelta(minutes=DUREE_CRENEAU_MINUTES) <= fin_jour:
        fin_creneau = curseur_temps + timedelta(minutes=DUREE_CRENEAU_MINUTES)
        chevauche = any(curseur_temps < fin_occ and fin_creneau > debut_occ for debut_occ, fin_occ in intervalles_occupes)
        if not chevauche:
            creneaux.append({"debut": curseur_temps.isoformat(), "fin": fin_creneau.isoformat()})
        curseur_temps = fin_creneau

    return creneaux
