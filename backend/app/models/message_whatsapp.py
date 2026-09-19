"""
app/models/message_whatsapp.py
-----------------------------------
§ demande utilisateur — Centre de Messagerie Phase 2 : chaque message
WhatsApp échangé (entrant OU sortant) avec un contact, texte ou média. Une
"conversation" n'est PAS stockée comme un document séparé : c'est le
regroupement (calculé à la lecture, voir GET /messagerie/conversations) de
tous les MessageWhatsApp partageant le même `numero_telephone` pour un
cabinet donné — plus simple à tenir cohérent qu'une table Conversation
séparée à maintenir en double.
"""

from datetime import datetime
from typing import Literal, Optional
from pydantic import BaseModel, Field

TypeMessage = Literal["texte", "image", "document", "audio", "video", "autre"]
StatutMessage = Literal["recu", "envoye", "livre", "lu", "echec"]


class MessageWhatsApp(BaseModel):
    numero_enreg: int
    cabinet_code: str
    # § toujours le numéro de l'INTERLOCUTEUR (le contact/patient), jamais
    # celui du cabinet — sert de clé de regroupement en conversation.
    numero_telephone: str
    direction: Literal["entrant", "sortant"]
    type_message: TypeMessage = "texte"
    contenu_texte: Optional[str] = None
    # § médias : jamais téléchargés/stockés en base à la réception (l'URL
    # Meta expire vite) — seul l'identifiant média Meta est conservé, le
    # téléchargement se fait à la demande via GET /messagerie/media/{id}
    # (voir app/routers/messagerie_conversations.py).
    media_id_meta: Optional[str] = None
    media_mime_type: Optional[str] = None
    media_nom_fichier: Optional[str] = None
    # Identifiant du message côté Meta (wamid) — permet de rapprocher les
    # accusés de réception (statuts "livré"/"lu") reçus ultérieurement sur
    # le même webhook.
    wamid: Optional[str] = None
    statut: StatutMessage = "recu"
    # Login du caissier/secrétariat qui a envoyé (uniquement pour direction="sortant").
    caissier_login: Optional[str] = None
    date_heure: datetime = Field(default_factory=datetime.utcnow)
