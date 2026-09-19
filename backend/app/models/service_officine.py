"""
app/models/service_officine.py
-----------------------------------
§ demande utilisateur : "le patient se rendant en pharmacie [scanne le QR
de l'ordonnance, ce qui] donne la possibilité d'ouvrir un lien permettant à
l'officine de vérifier, servir (en fonction des quantités disponibles chez
eux). Le médecin qui a émis l'ordonnance peut avoir le retour d'informations
de ses ordonnances." — une officine (pharmacie), en ouvrant le lien de
vérification d'une ordonnance (voir app/routers/verification.py, page
PUBLIQUE sans authentification — l'officine n'a pas de compte SAWALI
DentalCare), remplit ce formulaire pour indiquer ce qu'elle a effectivement
délivré. Le dentiste consulte ensuite ce retour depuis SA fiche d'ordonnance
(GET /dossiers-examen/{dos_num}/ordonnance, enrichi de ces services).
"""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class LigneServieOfficine(BaseModel):
    designation: str
    disponible: bool = True  # l'officine avait le produit en stock
    quantite_servie: Optional[str] = None  # texte libre (ex: "1 boîte de 20"), l'officine peut préciser à sa façon


class ServiceOfficine(BaseModel):
    numero_enreg: int
    cabinet_code: str
    ordonnance_reference: str  # = Ordonnance.reference (jointure)
    nom_officine: str
    ville: Optional[str] = None
    lignes_servies: list[LigneServieOfficine] = Field(default_factory=list)
    commentaire: Optional[str] = None
    date_service: datetime = Field(default_factory=datetime.utcnow)


class ServiceOfficineEcriture(BaseModel):
    """Payload accepté depuis la page publique de vérification — le serveur complète cabinet_code/ordonnance_reference/numero_enreg depuis le jeton, jamais depuis le formulaire (l'officine ne doit pas pouvoir les falsifier)."""
    nom_officine: str
    ville: Optional[str] = None
    lignes_servies: list[LigneServieOfficine] = Field(default_factory=list)
    commentaire: Optional[str] = None
