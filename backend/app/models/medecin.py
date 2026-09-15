"""
app/models/medecin.py
------------------------
Modèle de la table "MédecinT" (registre des dentistes/médecins), reprenant
les colonnes du fichier fourni MédecinT_Registre_des_Médecins.xlsx.
"""

from typing import Optional
from pydantic import BaseModel, Field, ConfigDict


class MedecinBase(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    nom: str = Field(..., alias="Nom")
    prenoms: Optional[str] = Field(None, alias="Prénoms")
    adresse: Optional[str] = Field(None, alias="Adresse")
    telephone: Optional[str] = Field(None, alias="Téléphone")
    cellulaire: Optional[str] = Field(None, alias="Cellulaire")
    id_medecin: Optional[str] = Field(None, alias="IDMédecin")
    email: Optional[str] = Field(None, alias="E_Mail")
    titre: Optional[str] = Field("Dr", alias="Titre")
    domaine: Optional[str] = Field(None, alias="Domaine")
    en_activite: bool = Field(True, alias="EnActivité")
    commission: float = Field(0, alias="Commission")

    # NOUVEAU champ (introduit pour ce projet) : le dentiste est-il le
    # dentiste principal du cabinet (référencé dans la fiche Cabinet) ?
    est_dentiste_principal: bool = False


class MedecinEnBase(MedecinBase):
    numero_enreg: int = Field(..., alias="Numéro_Enreg")
