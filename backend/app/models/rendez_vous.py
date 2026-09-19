"""
app/models/rendez_vous.py
-----------------------------
NOUVELLES tables introduites pour ce projet : "RendezVous" (agenda des
dentistes, géré par le Secrétariat Cabinet, §4e du cahier des charges) et
"Rappel" (système de relance patient automatisable — contrôle 6 mois,
relance de devis, suivi post-opératoire — pratique standard des logiciels
dentaires internationaux).
"""

from datetime import datetime
from typing import Optional, Literal
from pydantic import BaseModel, Field

StatutRendezVous = Literal["Proposé", "Confirmé", "En cours", "Reporté", "Annulé", "Honoré", "Absent"]
TypeRappel = Literal["Contrôle 6 mois", "Relance devis/proforma", "Suivi post-opératoire", "Autre"]


class RendezVous(BaseModel):
    numero_enreg: int
    patient_numero_enreg: int
    dentiste_numero_enreg: int
    date_heure_debut: datetime
    date_heure_fin: datetime
    motif: Optional[str] = None
    vente_reference: Optional[str] = None  # reçu/proforma d'origine (§4e)
    statut: StatutRendezVous = "Proposé"
    cree_par: Optional[str] = None  # login du Secrétariat Cabinet
    date_creation: datetime = Field(default_factory=datetime.utcnow)
    observations: Optional[str] = None


class Rappel(BaseModel):
    numero_enreg: int
    patient_numero_enreg: int
    type_rappel: TypeRappel
    date_prevue: datetime
    dossier_examen_numero_enreg: Optional[int] = None
    message: Optional[str] = None
    envoye: bool = False
    date_envoi: Optional[datetime] = None
    canal: str = "WhatsApp"
