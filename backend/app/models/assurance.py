"""
app/models/assurance.py
---------------------------
NOUVELLES tables introduites pour ce projet (absentes du legacy Biolog, mais
nécessaires puisque le fichier legacy VenteClinique référence déjà des
"Assureurs" et "Bons" dans son état de caisse fourni en exemple, ex: MCI,
OLEA, SONAR90, HENNER...) :

  - Assurance : le référentiel des compagnies d'assurance/mutuelles
  - AssurancePatient : le lien patient <-> assurance, avec % de prise en
    charge et plafond annuel
  - PriseEnCharge : le cycle de vie d'une demande de prise en charge
    (demande -> accord -> facturation -> paiement), avec calcul automatique
    de la répartition assureur/patient
"""

from datetime import datetime
from typing import Optional, Literal
from pydantic import BaseModel, Field

StatutPriseEnCharge = Literal["Demandée", "Accordée", "Refusée", "Facturée", "Payée"]


class Assurance(BaseModel):
    numero_enreg: int
    nom: str  # ex: "MCI", "OLEA80", "SONAR90", "HENNER"
    contact: Optional[str] = None
    email: Optional[str] = None
    delai_remboursement_jours: int = 30
    # NOUVEAU (introduit pour ce projet) : le %PC par défaut de CETTE
    # assurance/ce plan (ex: "OLEA80" → 80). C'est la SEULE source du %PC :
    # le caissier ne le saisit jamais lui-même, ni à la création du lien
    # patient-assurance ni à l'établissement d'un reçu — voir
    # lier_patient_assurance() dans app/routers/assurances.py, qui l'impose
    # côté serveur (rejette toute valeur envoyée par le client).
    pourcentage_prise_en_charge_defaut: float = 80
    actif: bool = True


class AssurancePatient(BaseModel):
    numero_enreg: int
    patient_numero_enreg: int
    assurance_numero_enreg: int
    numero_adherent: Optional[str] = None
    # Toujours copié depuis Assurance.pourcentage_prise_en_charge_defaut au
    # moment du rattachement (jamais saisi par le caissier) — voir
    # lier_patient_assurance() dans app/routers/assurances.py. La valeur
    # envoyée ici par le client, s'il y en a une, est ignorée côté serveur.
    pourcentage_prise_en_charge: float = 80
    plafond_annuel: Optional[float] = None
    montant_consomme_annee: float = 0
    date_debut: datetime = Field(default_factory=datetime.utcnow)
    date_fin: Optional[datetime] = None


class PriseEnCharge(BaseModel):
    numero_enreg: int
    vente_reference: str  # référence VenteClinique.Référence concernée
    assurance_patient_numero_enreg: int
    montant_total: float
    part_assureur: float
    part_assure: float
    statut: StatutPriseEnCharge = "Demandée"
    reference_bon: Optional[str] = None  # ex: "173465", format legacy du bon
    date_demande: datetime = Field(default_factory=datetime.utcnow)
    date_accord: Optional[datetime] = None
    date_facturation: Optional[datetime] = None
    date_paiement: Optional[datetime] = None
    observations: Optional[str] = None
