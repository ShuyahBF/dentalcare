"""
app/models/dossier_examen.py
--------------------------------
Modèle de la table "Dossier_Examen", reprenant les colonnes du fichier fourni
Dossier_Examen_Dossier_dExamen_des_Patients.xlsx, PLUS le champ NOUVEAU
"ContenuExams" (introduit pour ce projet) qui stocke l'état persistant du
schéma dentaire interactif du patient (couleur/statut de chaque dent), comme
demandé au §6 du cahier des charges : "Le statut (couleur) de chaque dent
doit être persistant dans le Dossier_Examen du patient et visible à la
prochaine visite."
"""

from datetime import datetime
from typing import Optional, Literal
from pydantic import BaseModel, Field, ConfigDict

# Les 5 statuts possibles d'une dent sur le schéma interactif, avec leur
# code couleur (cf. §6 du cahier des charges).
StatutDent = Literal[
    "Sain",
    "Carie/Obturation",     # Bleu
    "Couronne/Bridge",      # Vert
    "Implant",               # Rouge
    "Orthodontie",           # Jaune
    "Problème Parodontal",  # Orange
    "Extrait",
]


class ActeDent(BaseModel):
    """Un acte dentaire réalisé/prévu sur une dent précise du schéma."""
    numero_dent: int  # numérotation FDI (11-18, 21-28, 31-38, 41-48)
    code_produit: int  # référence vers ProduitClinique.Code Produit
    libelle_acte: str
    statut: StatutDent = "Sain"


class ContenuExamens(BaseModel):
    """
    L'état complet du schéma dentaire du patient à un instant donné :
    la liste des actes/statuts par dent + un commentaire libre.
    Sérialisé en JSON et stocké dans le champ "ContenuExams" du Dossier_Examen.
    """
    actes_par_dent: list[ActeDent] = Field(default_factory=list)
    commentaire_general: Optional[str] = None


class DossierExamenBase(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    dos_lib: Optional[str] = Field(None, alias="Dos_lib")
    client: Optional[int] = Field(None, alias="Client")  # Numéro_Enreg du patient
    prescripteur: Optional[str] = Field(None, alias="Prescripteur")
    montant: float = Field(0, alias="Montant")
    traite: int = Field(0, alias="Traité")
    regle: int = Field(0, alias="Réglé")
    vise: int = Field(0, alias="Visé")
    conclusions: Optional[str] = Field(None, alias="Conclusions")
    observations: Optional[str] = Field(None, alias="Observations")
    groupe_assurance: Optional[str] = Field(None, alias="Groupe_Assur")
    nom_specialiste: Optional[str] = Field(None, alias="Nom_Spécialiste")  # dentiste assigné

    # Rapport professionnel du dentiste (§4g)
    dos_indication: Optional[str] = Field(None, alias="DOS_INDICATION")
    dos_resultats: Optional[str] = Field(None, alias="DOS_RESULTATS")
    dos_conclusion: Optional[str] = Field(None, alias="DOS_CONCLUSION")

    # NOUVEAU champ : schéma dentaire persistant (JSON sérialisé de ContenuExamens)
    contenu_exams: Optional[dict] = Field(None, alias="ContenuExams")

    est_archive: bool = Field(False, alias="estArchivé")


class DossierExamenEnBase(DossierExamenBase):
    numero_enreg: int = Field(..., alias="Numéro_Enreg")
    dos_num: int = Field(..., alias="Dos_num")
    date_heure_creation: datetime = Field(default_factory=datetime.utcnow, alias="DateHeure_Creation")
    date_heure_modification: Optional[datetime] = Field(None, alias="Dateheure_modification")

    # Suivi de l'envoi WhatsApp du rapport (§4g)
    rapport_envoye_whatsapp: bool = False
    date_envoi_whatsapp: Optional[datetime] = None
