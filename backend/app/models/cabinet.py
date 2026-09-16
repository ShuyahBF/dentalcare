"""
app/models/cabinet.py
------------------------
NOUVELLE table "Cabinet" (introduite pour ce projet, absente du legacy) :
un document UNIQUE en base qui centralise le paramétrage du cabinet, édité
depuis le module Administrateur (§9 du cahier des charges).
"""

from typing import Optional, Literal
from pydantic import BaseModel, Field

NumerotationDentaire = Literal["internationale", "universelle"]


class Cabinet(BaseModel):
    denomination: str = "SAWALI DentalCare"
    logo_url: Optional[str] = None
    adresse: str = "Ouagadougou, Burkina Faso"
    geolocalisation: Optional[str] = None  # ex: "12.3714,-1.5197"
    telephone: Optional[str] = None
    email: Optional[str] = None
    dentiste_principal_numero_enreg: Optional[int] = None  # référence MédecinT
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
    # NOUVEAU champ (introduit pour ce projet) : le système de numérotation
    # dentaire affiché par défaut sur le schéma interactif (§ demande
    # utilisateur : "la préférence du schéma dépend de l'école de formation
    # du dentiste"). "internationale" = notation FDI (11-48, standard en
    # Europe/Afrique francophone) ; "universelle" = notation américaine
    # (1-32 en continu). Les deux références sont de toute façon toujours
    # enregistrées sur chaque ligne de reçu, quel que soit ce réglage.
    numerotation_dentaire: NumerotationDentaire = "internationale"
