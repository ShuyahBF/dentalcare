"""
app/models/contact_messagerie.py
-------------------------------------
§ demande utilisateur : reproduction du Centre de Messagerie de référence
(portail SAWALI SMART SYSTEMS, page /contacts) — annuaire de contacts
unifié pour les échanges WhatsApp (texte/vocal/image/vidéo à venir), avec
import en un clic des expéditeurs WhatsApp inconnus. Adapté à l'architecture
SaaS multi-cabinets : chaque contact appartient à EXACTEMENT un cabinet
(cabinet_code), jamais partagé entre cabinets (contrairement à la référence,
qui autorise une recherche cross-tenant — volontairement NON reproduite ici,
car elle contredirait l'isolation stricte des données de cette plateforme).
"""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class ContactMessagerie(BaseModel):
    numero_enreg: int
    cabinet_code: str
    code_unique: str  # ex: "0001-0007" — inaltérable, généré à la création
    nom: str
    telephone: Optional[str] = ""
    whatsapp: Optional[str] = ""
    email: Optional[str] = ""
    societe: Optional[str] = ""  # peu utilisé en clinique dentaire, conservé pour fidélité à la référence
    notes: Optional[str] = ""
    tags: list[str] = Field(default_factory=list)
    # "Partagés équipe" (visible par tout le cabinet) vs "Privé" (créateur
    # seul) — reproduit tel quel depuis la référence, filtre "Partagés
    # équipe / Privés" dans l'interface.
    partage: bool = True
    photo_url: Optional[str] = None
    proprietaire_login: str
    proprietaire_nom: Optional[str] = None
    date_creation: datetime = Field(default_factory=datetime.utcnow)
    date_derniere_modification: Optional[datetime] = None
    # Calculé à la lecture (jamais stocké) : date du dernier message
    # WhatsApp échangé avec ce contact — alimente le tri "Interaction
    # (plus récente)". None tant que le Centre de Messagerie n'envoie/ne
    # reçoit pas encore de messages réels (Phase 2).
    derniere_interaction_le: Optional[datetime] = None


class ContactMessagerieCreation(BaseModel):
    nom: str
    telephone: Optional[str] = ""
    whatsapp: Optional[str] = ""
    email: Optional[str] = ""
    societe: Optional[str] = ""
    notes: Optional[str] = ""
    tags: list[str] = Field(default_factory=list)
    partage: bool = True
    photo_url: Optional[str] = None


class ContactEnAttente(BaseModel):
    """
    Un numéro WhatsApp inconnu ayant écrit au cabinet, pas encore promu en
    contact de l'annuaire (bannière jaune "contact(s) inconnu(s)..." de la
    référence). Alimenté par le récepteur de webhook WhatsApp (Phase 2 du
    Centre de Messagerie — pas encore construit à ce stade).
    """
    numero_enreg: int
    cabinet_code: str
    depuis: str  # numéro de téléphone
    nom_profil_wa: Optional[str] = None
    dernier_message: Optional[str] = None
    nombre_messages: int = 1
    dernier_vu_le: datetime = Field(default_factory=datetime.utcnow)
