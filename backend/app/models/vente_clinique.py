"""
app/models/vente_clinique.py
--------------------------------
Modèles des tables "VenteClinique" (entête du reçu/facture/proforma) et
"A_Acheté" (détail des lignes de prestations), reprenant les colonnes
essentielles des fichiers fournis VenteClinique_Vente_et_Reçu.xlsx et
A_Acheté_Détails_des_Reçues.xlsx.
"""

from datetime import datetime
from typing import Optional, Literal
from pydantic import BaseModel, Field, ConfigDict

ModeReglement = str  # libre : "Espèces", "Assurance", ou le nom d'un TypePaiement paramétrable (ex: "Orange Money")
TypeDocument = Literal["Reçu", "Proforma"]
Sexe = Literal["Masculin", "Féminin"]


class LigneVente(BaseModel):
    """Une ligne du panier (un acte sélectionné, saisi au clavier ou via le schéma dentaire)."""
    code_produit: int  # référence ProduitClinique.Code Produit
    libelle: str
    domaine: Optional[str] = None
    quantite: int = 1
    prix_unitaire: float
    pourcentage_remise: float = 0
    sous_total: float  # = quantite * prix_unitaire * (1 - pourcentage_remise/100)
    numero_dent: Optional[int] = None  # rétrocompatibilité : = numero_dent_international
    # NOUVEAU (introduit pour ce projet) : les deux références sont toujours
    # enregistrées ensemble sur chaque ligne, quelle que soit la numérotation
    # affichée au moment de la saisie (§ demande utilisateur — la préférence
    # d'affichage dépend de l'école de formation du dentiste, mais la donnée
    # enregistrée doit rester exploitable dans les deux systèmes).
    numero_dent_international: Optional[int] = None  # notation FDI (11-48)
    numero_dent_universel: Optional[int] = None  # notation américaine (1-32)


class IdentiteRecu(BaseModel):
    """
    NOUVEAU (introduit pour ce projet) : l'identité complète devant
    obligatoirement figurer sur CHAQUE reçu, conformément aux règles d'une
    clinique (hospitalière ou dentaire) — y compris pour un règlement par
    assurance, et y compris pour un patient "Client CASH" (qui n'a par
    définition pas encore de fiche complète : ces champs sont alors saisis
    directement à la vente et imprimés tels quels sur ce reçu précis).
    """
    nom: str
    prenoms: str
    date_naissance: datetime
    telephone: str
    sexe: Sexe


class VenteCliniqueBase(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    reference: str = Field(..., alias="Référence")  # numéro de reçu, ex: R-202613786
    code_client: Optional[str] = Field(None, alias="Code Client")
    date_vente: datetime = Field(default_factory=datetime.utcnow, alias="Date Vente")
    code_vendeur: Optional[str] = Field(None, alias="Code Vendeur")  # login du caissier
    libelle: Optional[str] = Field(None, alias="Libellé")  # nom du patient
    montant: float = Field(0, alias="Montant")
    regle: int = Field(0, alias="Réglé")  # 0 = non réglé (proforma), 1 = réglé (reçu)
    montant_regle: float = Field(0, alias="MontantRéglé")
    caisse: Optional[str] = Field(None, alias="Caisse")  # ex: "CAISSE1"
    dossier: Optional[int] = Field(None, alias="Dossier")  # référence vers Dossier_Examen
    ref_bon: Optional[str] = Field(None, alias="RéfBon")  # référence bon assurance
    duree_validite: int = Field(15, alias="DuréeValidité")  # jours de validité du reçu/proforma
    part_assureur: float = Field(0, alias="PArtAssureur")
    part_assure: float = Field(0, alias="PArtAssuré")
    avec_remise: bool = Field(False, alias="avecRemise")
    montant_remise: float = Field(0, alias="MontantRemise")

    type_document: TypeDocument = "Reçu"
    mode_reglement: Optional[ModeReglement] = None
    # Référence de la transaction (ex: numéro de transaction mobile money),
    # obligatoire côté serveur quand le TypePaiement choisi l'exige.
    reference_paiement: Optional[str] = None

    # Obligatoire sur tout reçu, quel que soit le mode de règlement (même Assurance).
    identite_recu: Optional[IdentiteRecu] = None


class VenteCliniqueEnBase(VenteCliniqueBase):
    numero_enreg: int = Field(..., alias="Numéro_Enreg")
    date_heure_creation: datetime = Field(default_factory=datetime.utcnow, alias="DateHeure_Création")
    date_heure_modification: Optional[datetime] = Field(None, alias="DateHeure_Modiffication")
    nb_impressions: int = Field(0, alias="NbImpressions")
    lignes: list[LigneVente] = Field(default_factory=list)


class AAcheteBase(BaseModel):
    """Une ligne de détail (table 'A_Acheté'), miroir dénormalisé de LigneVente pour compatibilité legacy."""
    model_config = ConfigDict(populate_by_name=True)

    reference: str = Field(..., alias="Référence")  # = VenteClinique.Référence (jointure)
    code_produit: int = Field(..., alias="Code Produit")
    qte_livree: int = Field(1, alias="Qte Livrée")
    prix_public: float = Field(0, alias="Prix Public")
    reduction: float = Field(0, alias="Réduction")
    domaine: Optional[str] = Field(None, alias="Domaine")
    date_sortie: datetime = Field(default_factory=datetime.utcnow, alias="Date_Sortie")
    realise_par: Optional[str] = Field(None, alias="Realisé_par")
