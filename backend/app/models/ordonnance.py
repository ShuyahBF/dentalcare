"""
app/models/ordonnance.py
------------------------------
§ demande utilisateur : le Dentiste génère/édite une ordonnance que le
patient utilise pour acheter les produits recommandés par son médecin
traitant. Rattachée à un Dossier_Examen (1 ordonnance par dossier, éditable
autant de fois que nécessaire). Peut reproduire en bas de page, à la
demande (oui par défaut), le schéma dentaire des dents traitées sur ce
dossier — voir generer_pdf_ordonnance dans app/utils/pdf_documents.py.
"""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class LigneOrdonnance(BaseModel):
    designation: str
    posologie: Optional[str] = None  # instructions d'usage (ex: "2 fois par jour")
    duree: Optional[str] = None  # ex: "7 jours"
    quantite: Optional[str] = None
    # § demande utilisateur : "Un tag rouge s'affiche en face des produits
    # existants dans le vidal[,] dans le cas contraire 'nouveau' s'affiche"
    # — vidal_id renseigné dès que la désignation a été choisie depuis les
    # résultats VIDAL (tag rouge) ; source distingue "vidal" / "local"
    # (référence personnalisée déjà créée par ce cabinet) / None (jamais
    # rapprochée, "Nouveau").
    vidal_id: Optional[str] = None
    source: Optional[str] = None  # "vidal" | "local" | None


class Ordonnance(BaseModel):
    numero_enreg: int
    cabinet_code: str
    dossier_examen_numero_enreg: int
    patient_numero_enreg: int
    reference: str  # ex: "0001-0007", généré à la création (voir prochain_code_unique_contact — même schéma)
    dentiste_login: str
    dentiste_nom: Optional[str] = None
    lignes: list[LigneOrdonnance] = Field(default_factory=list)
    # Toggle "reproduire le schéma dentaire en bas de page" (§ demande
    # utilisateur : "à la demande mais oui par défaut").
    afficher_schema_dentaire: bool = True
    date_creation: datetime = Field(default_factory=datetime.utcnow)
    date_derniere_modification: Optional[datetime] = None


class OrdonnanceEcriture(BaseModel):
    """Payload accepté en création/modification — le serveur complète le reste (numéros, dates, auteur)."""
    lignes: list[LigneOrdonnance] = Field(default_factory=list)
    afficher_schema_dentaire: bool = True
