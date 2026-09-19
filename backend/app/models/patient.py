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

    # NOUVEAU (§ demande utilisateur : "les pages Posologie et Sécurisation
    # doivent permettre d'importer les données requises depuis la fiche
    # d'un patient") — profil clinique VIDAL, optionnel, alimenté/mis à
    # jour DEPUIS ces deux pages (jamais un formulaire dédié séparé) :
    # la première consultation le remplit, les suivantes l'importent. Ces
    # champs n'existaient sur AUCUN dossier avant cette demande (le
    # Dossier_Examen ne porte que les actes dentaires, jamais de données
    # cliniques générales). allergies/pathologies/molecules_a_eviter
    # reprennent le format {label, ref} de ChampTagsReferentiel
    # (VidalSecurisation.jsx) — `ref` est une référence VIDAL résolue
    # (transmise telle quelle à l'analyse), `ref: null` un texte libre
    # informatif. La créatininémie est un résultat de laboratoire qui se
    # périme vite : conservée comme simple DERNIÈRE VALEUR CONNUE, à
    # confirmer par le médecin à chaque consultation plutôt qu'un fait
    # figé du dossier.
    poids_kg: Optional[float] = Field(None, alias="PoidsKg")
    taille_cm: Optional[float] = Field(None, alias="TailleCm")
    insuffisance_hepatique: Optional[Literal["NONE", "MODERATE", "SEVERE"]] = Field(None, alias="InsuffisanceHepatique")
    derniere_creatininemie_umol_l: Optional[float] = Field(None, alias="DerniereCreatininemieUmolL")
    allergies: list[dict] = Field(default_factory=list, alias="AllergiesVidal")
    pathologies: list[dict] = Field(default_factory=list, alias="PathologiesVidal")
    molecules_a_eviter: list[dict] = Field(default_factory=list, alias="MoleculesAEviterVidal")
    date_maj_profil_clinique: Optional[datetime] = Field(None, alias="DateMajProfilClinique")


class ProfilCliniqueVidal(BaseModel):
    """Corps de PUT /patients/{numero_enreg}/profil-clinique — mise à jour PARTIELLE, ne touche jamais à l'identité (nom/prénoms/etc.). Mêmes alias que PatientBase ci-dessus : c'est le MÊME champ Mongo, lu et écrit par les deux modèles."""
    model_config = ConfigDict(populate_by_name=True)

    poids_kg: Optional[float] = Field(None, alias="PoidsKg")
    taille_cm: Optional[float] = Field(None, alias="TailleCm")
    insuffisance_hepatique: Optional[Literal["NONE", "MODERATE", "SEVERE"]] = Field(None, alias="InsuffisanceHepatique")
    derniere_creatininemie_umol_l: Optional[float] = Field(None, alias="DerniereCreatininemieUmolL")
    allergies: list[dict] = Field(default_factory=list, alias="AllergiesVidal")
    pathologies: list[dict] = Field(default_factory=list, alias="PathologiesVidal")
    molecules_a_eviter: list[dict] = Field(default_factory=list, alias="MoleculesAEviterVidal")


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

    # Identifiant patient affiché dans l'interface (format du reçu) : 8
    # caractères = code cabinet (4) + numéro d'ordre annuel (4), ex: "00010152".
    id_patient: str = Field(..., alias="ID_Patient")
    # NOUVEAU (§ demande utilisateur — architecture SaaS multi-cabinets) :
    # le cabinet propriétaire de cette fiche patient. Jamais modifiable.
    cabinet_code: str = Field(..., alias="cabinet_code")
