"""
app/models/suggestion.py
----------------------------
NOUVELLE table "SuggestionHistorique" (introduite pour ce projet) : le
miroir en base de données du fichier SUGGESTION.MD (versionné avec le code),
consultable depuis le module Administrateur (/admin/suggestions-history).
"""

from datetime import date
from typing import Literal
from pydantic import BaseModel

StatutSuggestion = Literal["Implémentée", "En cours", "Proposée", "Rejetée"]


class SuggestionHistorique(BaseModel):
    numero_enreg: int
    date_entree: date
    titre: str
    statut: StatutSuggestion
    details: list[str]
    source: str = "SUGGESTION.MD"
