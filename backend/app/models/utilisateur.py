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
    # NOUVEAU (§ demande utilisateur) : utilisé notamment pour notifier le
    # super-admin par WhatsApp des licences arrivant à expiration.
    telephone: Optional[str] = Field(None, alias="Téléphone")
    # NOUVEAU (§ demande utilisateur) : pour un compte Dentiste, référence sa
    # propre fiche MédecinT — permet à /rendez-vous (planning) de savoir
    # QUEL médecin afficher pour "son" planning, sans ambiguïté de nom.
    medecin_numero_enreg: Optional[int] = Field(None, alias="MedecinNumeroEnreg")
    role: Role

    # NOUVEAU (§ demande utilisateur — architecture SaaS multi-cabinets) :
    # chaque utilisateur appartient à EXACTEMENT un cabinet (None uniquement
    # pour un compte super-admin plateforme, voir est_super_admin). Le Login
    # est unique sur TOUTE la plateforme (pas seulement au sein d'un
    # cabinet) puisqu'il n'y a aucun sélecteur de cabinet à la connexion —
    # c'est le couple login/mot de passe seul qui détermine le cabinet.
    cabinet_code: Optional[str] = Field(None, alias="CodeCabinet")
    # Compte plateforme (ex: équipe SAWALI SMART SYSTEMS) qui gère les
    # cabinets eux-mêmes (création, état d'abonnement...) — distinct de
    # l'Administrateur d'un cabinet, qui ne gère que SON propre cabinet.
    est_super_admin: bool = Field(False, alias="EstSuperAdmin")

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


class VerificationOTP(BaseModel):
    """§ demande utilisateur — deuxième étape de la connexion OTP WhatsApp."""
    jeton_session_otp: str
    code: str


class JetonAcces(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: Role
    login: str
    nom_complet: Optional[str] = None
    # NOUVEAU (§ demande utilisateur — architecture SaaS multi-cabinets) :
    # permet au frontend de distinguer un compte plateforme (redirigé vers
    # la gestion des cabinets) d'un Administrateur de cabinet classique.
    est_super_admin: bool = False
    # NOUVEAU (§ demande utilisateur — afficher la dernière connexion dans
    # la sidebar) : la connexion PRÉCÉDENTE (avant celle-ci, qui vient de
    # mettre DH_DernCnx à jour côté serveur) — None si première connexion.
    # Capturée AVANT l'écrasement pour rester utile toute la session : la
    # valeur affichée ne doit jamais devenir "maintenant" une fois connecté.
    derniere_connexion_precedente: Optional[datetime] = None
    # NOUVEAU (§ demande utilisateur : "un dentiste principal emploie
    # souvent des vacataires, étudiants, etc. et ne souhaite pas partager
    # [les statistiques financières]") : calculé une seule fois à la
    # connexion (comme est_super_admin) plutôt que via un appel réseau à
    # chaque affichage de la sidebar — le frontend peut ainsi masquer le
    # lien "Statistiques" pour tout Dentiste qui n'est pas LE médecin
    # principal du cabinet, sans aller-retour supplémentaire.
    est_dentiste_principal: bool = False


class ReponseConnexion(BaseModel):
    """
    § demande utilisateur — réponse de POST /auth/connexion, qui couvre les
    deux issues possibles : soit le jeton d'accès final (otp_requis=False),
    soit une demande de code OTP WhatsApp (otp_requis=True), à confirmer
    ensuite via POST /auth/verifier-otp.
    """
    otp_requis: bool = False
    jeton_session_otp: Optional[str] = None
    otp_envoye: Optional[bool] = None
    access_token: Optional[str] = None
    token_type: str = "bearer"
    role: Optional[Role] = None
    login: Optional[str] = None
    nom_complet: Optional[str] = None
    est_super_admin: bool = False
    derniere_connexion_precedente: Optional[datetime] = None
    est_dentiste_principal: bool = False
