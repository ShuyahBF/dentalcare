"""
app/models/patient.py
------------------------
Modèle de la table "Patient", reprenant les colonnes exactes du fichier
Patient_Patients.xlsx fourni (la colonne "N° Enr." de tête, purement un
artefact d'export legacy, est volontairement ignorée/recréée par notre
propre compteur applicatif).
"""

from datetime import datetime
from typing import Optional, Literal
from pydantic import BaseModel, Field, ConfigDict

Sexe = Literal["Masculin", "Féminin"]


class PatientBase(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    nom: Optional[str] = Field(None, alias="Nom")
    prenoms: Optional[str] = Field(None, alias="Prénoms")
    date_naissance: Optional[datetime] = Field(None, alias="Date Naissance")
    adresse: Optional[str] = Field(None, alias="Adresse")
    telephone: Optional[str] = Field(None, alias="Téléphone")
    photo: Optional[str] = Field(None, alias="Photo")
    groupe_clinique: Optional[str] = Field(None, alias="GroupeClin")
    email: Optional[str] = Field(None, alias="EMail")
    medecin_traitant: Optional[str] = Field(None, alias="Médecin Traitant")
    personne_a_prevenir: Optional[str] = Field(None, alias="PersonneAPrévenir")
    profession: Optional[str] = Field(None, alias="Profession")
    nom_jeune_fille: Optional[str] = Field(None, alias="NomJF")
    lieu_naissance: Optional[str] = Field(None, alias="LieuNaissance")

    # NOUVEAU champ (introduit pour ce projet) : le sexe du patient. Une
    # clinique (hospitalière ou dentaire) doit toujours pouvoir l'indiquer
    # sur un reçu, au même titre que le nom/prénoms/date de naissance/téléphone.
    sexe: Optional[Sexe] = Field(None, alias="Sexe")

    # NOUVEAU champ (introduit pour ce projet) : distingue le patient
    # générique "Client CASH" (utilisé quand l'identité complète n'a pas
    # encore été enregistrée comme un vrai dossier patient) des vrais
    # patients. Vérifié/recréé automatiquement au démarrage du serveur (voir
    # app/utils/client_cash.py). IMPORTANT : même avec ce patient générique,
    # l'identité complète (nom, prénoms, date de naissance, téléphone, sexe)
    # reste obligatoire SUR CHAQUE REÇU — voir VenteClinique.identite_recu
    # dans app/models/vente_clinique.py — conformément aux règles d'une
    # clinique (hospitalière ou dentaire).
    est_client_cash: bool = Field(False, alias="EstClientCash")


class PatientCreation(PatientBase):
    nom: str = Field(..., alias="Nom")


class PatientEnBase(PatientBase):
    """Document tel que stocké en base, avec les champs de traçabilité."""
    numero_enreg: int = Field(..., alias="Numéro_Enreg")  # notre équivalent du "N° Enr." auto-généré
    date_creation: datetime = Field(default_factory=datetime.utcnow, alias="Date Création")
    heure_creation: Optional[str] = Field(None, alias="Heure Création")
    etat_en_cours: int = Field(1, alias="Etat_En_Cours")  # 1 = actif, 0 = archivé
    nb_vues: int = Field(0, alias="NbVues")
    date_heure_dernier_consultation: Optional[datetime] = Field(None, alias="DateHeure_dernierConsultation")
    consulteur: Optional[str] = Field(None, alias="Consulteur")
    nb_modifications: int = Field(0, alias="NbModifications")
    date_heure_derniere_modification: Optional[datetime] = Field(None, alias="Dateheure_dernierModification")
    modifieur: Optional[str] = Field(None, alias="Modifieur")

    # Identifiant patient affiché dans l'interface, format "ID Patient" du reçu (ex: 233911)
    id_patient: int = Field(..., alias="ID_Patient")
