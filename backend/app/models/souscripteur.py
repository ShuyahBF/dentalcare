"""
app/models/souscripteur.py
------------------------------
§ demande utilisateur : pour attacher une prise en charge (assurance) à un
reçu, il faut désormais référencer le SOUSCRIPTEUR — la personne physique
ou morale ayant signé la convention avec la compagnie d'assurance (ex: un
employeur ayant une convention avec une mutuelle, dont bénéficient ses
employés/patients). Ce n'est ni le patient, ni la compagnie d'assurance
elle-même : un référentiel dédié, propre à chaque cabinet, alimenté au fil
des saisies ("liste dynamique") plutôt que pré-rempli.
"""

from datetime import datetime
from pydantic import BaseModel, Field


class Souscripteur(BaseModel):
    numero_enreg: int
    cabinet_code: str
    nom: str
    date_creation: datetime = Field(default_factory=datetime.utcnow)
