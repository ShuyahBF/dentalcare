"""
app/models/produit_clinique.py
----------------------------------
Modèle de la table "ProduitClinique" : le catalogue des actes/prestations et
de leurs tarifs. Reprend les colonnes essentielles du fichier fourni
ProduitClinique_Produits.xlsx (celui-ci contient des dizaines de colonnes
héritées d'un contexte multi-spécialités/pharmacie ; on ne garde ici que les
colonnes réellement utiles au cabinet dentaire, le reste n'étant pas
pertinent pour SAWALI DentalCare).
"""

from typing import Optional
from pydantic import BaseModel, Field, ConfigDict


class ProduitCliniqueBase(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    code_produit: int = Field(..., alias="Code Produit")
    libelle: str = Field(..., alias="Libellé")
    prix_public: float = Field(0, alias="Prix Public")
    # Domaine (6 catégories des actes dentaires) :
    # CONS = Consultation, CONSV = Soins conservateurs, SCANAL = Endodontie/canal,
    # SCHIRU = Chirurgie, SPARAD = Parodontologie, PROTHE = Prothèses
    domaine: Optional[str] = Field(None, alias="Domaine")
    key_unik: Optional[str] = Field(None, alias="keyUnik")
    exige_prestataire: bool = Field(False, alias="ExigePrestataire")
    tva: float = Field(0, alias="Tva")
    commission: float = Field(0, alias="Commission")
    est_prestation_consultation: bool = Field(False, alias="estPrestationConsultation")
    etat_produit: str = Field("ACT", alias="Etat Produit")  # "ACT" = acte (par opposition à un produit physique)

    # NOUVEAU champ (introduit pour ce projet) : restreint la proposition de
    # l'acte, sur le schéma dentaire interactif, à certains numéros de dents
    # FDI. None = applicable à toute dent sélectionnée (comportement par
    # défaut, ex: "DÉTARTRAGE" ne dépend pas d'une dent précise).
    dents_applicables: Optional[list[int]] = None
