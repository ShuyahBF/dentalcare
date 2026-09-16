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
from pydantic import BaseModel, Field, ConfigDict, model_validator


class ProduitCliniqueBase(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    code_produit: int = Field(..., alias="Code Produit")
    libelle: str = Field(..., alias="Libellé")
    prix_public: float = Field(0, alias="Prix Public")
    # NOUVEAU champ (introduit pour ce projet) : le tarif appliqué quand le
    # reçu est réglé par une assurance ("Prix Second"). Si non renseigné, le
    # Prix Public reste utilisé même en règlement assurance. C'est ce tarif
    # (et non le Prix Public) qui est ensuite réparti entre part patient et
    # part assureur selon le %PC de l'assurance du patient. RÈGLE (§ demande
    # utilisateur) : s'il est défini, il doit toujours être ≥ Prix Public —
    # validé ci-dessous (create ET update passent par ce même modèle).
    prix_assurance: Optional[float] = Field(None, alias="Prix Second")
    # NOUVEAU champ (introduit pour ce projet) : seuls les actes actifs sont
    # proposés à la Caisse (recherche rapide + schéma dentaire) ; un acte
    # désactivé reste visible/modifiable dans le catalogue Administration
    # mais disparaît des listes de sélection.
    actif: bool = Field(True, alias="Actif")
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

    @model_validator(mode="after")
    def _prix_assurance_au_moins_egal_au_prix_public(self):
        if self.prix_assurance is not None and self.prix_assurance < self.prix_public:
            raise ValueError(
                f"Le Prix Assurance ({self.prix_assurance}) ne peut pas être inférieur au Prix Public ({self.prix_public})."
            )
        return self
