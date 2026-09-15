"""
app/models/utilisateur.py
-----------------------------
Modèle de la table "UtilisateurBlg" (comptes utilisateurs), reprenant les
colonnes du fichier fourni UtilisateurBlg_Utilisateurs.xlsx. Contrairement au
legacy (colonne "Mot_de_Passe" en clair), le mot de passe est TOUJOURS haché
ici (cf. app/core/security.py) — c'est une règle de sécurité non négociable
du projet.
"""

from datetime import datetime
from typing import Optional, Literal
from pydantic import BaseModel, Field, ConfigDict, EmailStr

# Les 5 rôles définis dans le cahier des charges.
Role = Literal["Caissier", "Secrétariat Cabinet", "Dentiste", "Comptable", "Administrateur"]


class UtilisateurBase(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    login: str = Field(..., alias="Login")
    nom_complet: Optional[str] = None
    email: Optional[EmailStr] = Field(None, alias="Email")
    role: Role

    # Droits fins repris du legacy (utilisés pour le journal d'audit des
    # actions sensibles, §10 du cahier des charges).
    peut_supprimer_recu: bool = Field(False, alias="PeutSupprimerRecu")
    peut_faire_remboursement: bool = Field(False, alias="PeutFaireRemboursement")
    peut_faire_avoir: bool = Field(False, alias="PeutFaireAvoir")
    peut_supprimer_paiement: bool = Field(False, alias="PeutSupprimerPaiement")
    peut_corriger_cotation: bool = Field(False, alias="PeutCorrigerCotation")
    peut_editer_assurance: bool = Field(False, alias="PeutEditerAssurance")
    actif: bool = True


class UtilisateurCreation(UtilisateurBase):
    mot_de_passe: str  # en clair à la création, haché avant stockage


class UtilisateurEnBase(UtilisateurBase):
    numero_enreg: int = Field(..., alias="Numéro_Enreg")
    mot_de_passe_hache: str
    date_heure_derniere_connexion: Optional[datetime] = Field(None, alias="DH_DernCnx")
    derniere_machine_utilisee: Optional[str] = Field(None, alias="DernMachineUtilisée")


class UtilisateurConnexion(BaseModel):
    login: str
    mot_de_passe: str


class JetonAcces(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: Role
    login: str
    nom_complet: Optional[str] = None
