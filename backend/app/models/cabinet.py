"""
app/models/cabinet.py
------------------------
DEVENU multi-tenant (§ demande utilisateur : "ce projet est une application
SaaS"). La collection "Cabinet" contient désormais UN document par cabinet
dentaire client de la plateforme (au lieu d'un document unique) — chacun
avec son propre "code_cabinet" (4 chiffres, séquence générée par la
plateforme) et son "etat" d'abonnement. Toute donnée métier (Patient,
MédecinT, RendezVous, ProduitClinique, VenteClinique, UtilisateurBlg, etc.)
porte désormais un champ "cabinet_code" et n'est jamais visible/modifiable
que par les utilisateurs de CE cabinet — l'isolation des données entre
cabinets est la règle absolue de cette architecture.
"""

from datetime import datetime
from typing import Optional, Literal
from pydantic import BaseModel, Field

NumerotationDentaire = Literal["internationale", "universelle"]

# États d'abonnement d'un cabinet sur la plateforme (§ demande utilisateur).
# Seul "Actif" autorise la connexion de ses utilisateurs (voir auth.py).
EtatCabinet = Literal["Actif", "En Attente", "Suspendu", "Expiré", "Inactif"]


class Cabinet(BaseModel):
    # Identifiant unique du cabinet sur la plateforme : 4 chiffres, généré
    # par séquence (voir utils/compteurs.py::prochain_code_cabinet). Jamais
    # choisi manuellement, jamais modifiable après création.
    code_cabinet: str

    denomination: str = "Nouveau Cabinet"
    logo_url: Optional[str] = None
    adresse: str = "Ouagadougou, Burkina Faso"
    geolocalisation: Optional[str] = None  # ex: "12.3714,-1.5197"
    telephone: Optional[str] = None
    email: Optional[str] = None
    dentiste_principal_numero_enreg: Optional[int] = None  # référence MédecinT (de CE cabinet)
    equipe_dentistes: list[int] = Field(default_factory=list)  # autres MédecinT.Numéro_Enreg
    papier_entete_url: Optional[str] = None
    devise: str = "FCFA"
    texte_bas_de_page: Optional[str] = None
    annee_creation: Optional[int] = None
    prefixe_numero_recu: str = "R-"
    duree_validite_proforma_jours: int = 15
    fuseau_horaire: str = "Africa/Ouagadougou"
    delai_rappel_controle_mois: int = 6
    canal_rappel_prefere: str = "WhatsApp"
    numerotation_dentaire: NumerotationDentaire = "internationale"
    # NOUVEAU (§ demande utilisateur) : si activé, la connexion de tout
    # utilisateur de CE cabinet exige un second facteur — un code à 6
    # chiffres envoyé par WhatsApp au numéro de téléphone enregistré sur son
    # compte (voir app/routers/auth.py). Nécessite une Configuration
    # WhatsApp active pour ce cabinet ET un numéro de téléphone sur chaque
    # compte utilisateur, sinon la connexion de ce compte échoue proprement
    # avec un message explicite plutôt que de bloquer silencieusement.
    otp_whatsapp_actif: bool = False
    # NOUVEAU (§ demande utilisateur) : thème d'interface choisi par CE
    # cabinet, parmi la liste maintenue par le super-admin (jamais une
    # couleur libre) — None = thème SAWALI par défaut. Mode clair/sombre
    # indépendant du thème choisi.
    theme_code: Optional[str] = None
    mode_affichage: Literal["clair", "sombre"] = "clair"

    # --- Champs propres au multi-tenant (§ demande utilisateur) ---
    etat: EtatCabinet = "En Attente"
    date_creation: datetime = Field(default_factory=datetime.utcnow)
    date_derniere_modification: Optional[datetime] = None
    date_expiration: Optional[datetime] = None
    # NOUVEAU (§ demande utilisateur) : durée de la période d'essai/démo
    # gratuite, décomptée depuis date_creation. Passé ce délai SANS licence
    # générée par le super-admin, le cabinet est automatiquement suspendu
    # (voir app/utils/verification_licences.py, exécuté quotidiennement).
    duree_essai_jours: Optional[int] = 30
    # Traçabilité de ce qui a été recopié à la création (informatif, ex:
    # ["catalogue", "types_paiement", "assurances"]) — jamais les Patients,
    # reçus/détails de reçus, Médecins ou RendezVous (§ demande utilisateur :
    # ces données démarrent toujours vides pour un nouveau cabinet).
    elements_reproduits_a_la_creation: list[str] = Field(default_factory=list)
    cabinet_modele_code: Optional[str] = None  # code du cabinet source, si reproduction

