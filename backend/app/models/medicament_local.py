"""
app/models/medicament_local.py
-----------------------------------
§ demande utilisateur (saisie des ordonnances) : "permettre de retrouver
des produits dans la liste des produits Vidal, ou absents de la liste
Vidal [...] à la fin de la saisie de l'ordonnance il est demandé s'il faut
créer ses nouvelles références. Si oui elles seront disponibles pour
d'autres sessions." — référentiel de désignations propres au cabinet
(médicaments/produits absents de VIDAL, ex: spécificités locales), alimenté
au fil des ordonnances plutôt que pré-rempli, cherché EN PLUS de VIDAL à la
saisie d'une désignation (voir RechercheMedicamentOrdonnance.jsx).
"""

from datetime import datetime
from pydantic import BaseModel, Field


class MedicamentLocal(BaseModel):
    numero_enreg: int
    cabinet_code: str
    designation: str  # toujours en MAJUSCULES (§ demande utilisateur — cohérent avec la saisie des ordonnances)
    date_creation: datetime = Field(default_factory=datetime.utcnow)
    cree_par: str
