"""
app/core/database.py
-----------------------
Connexion asynchrone à MongoDB Atlas via Motor.

Les noms de "collections" MongoDB reprennent EXACTEMENT les noms des tables
legacy (Patient, Dossier_Examen, ProduitClinique, VenteClinique, A_Acheté,
MédecinT, UtilisateurBlg, Pièces_Scannées_Utilisateurs), plus les nouvelles
tables créées pour ce projet (Cabinet, Assurance, AssurancePatient,
PriseEnCharge, RendezVous, Rappel), comme convenu avec l'utilisateur pour
simplifier la maintenance croisée avec le système Biolog/Windev existant.
"""

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from app.core.config import settings


class GestionnaireBaseDeDonnees:
    client: AsyncIOMotorClient | None = None
    base: AsyncIOMotorDatabase | None = None


gestionnaire_bd = GestionnaireBaseDeDonnees()


async def connecter_base_de_donnees() -> None:
    """À appeler au démarrage de l'application (événement FastAPI 'startup')."""
    gestionnaire_bd.client = AsyncIOMotorClient(settings.mongodb_uri)
    gestionnaire_bd.base = gestionnaire_bd.client[settings.mongodb_db_name]


async def fermer_base_de_donnees() -> None:
    """À appeler à l'arrêt de l'application (événement FastAPI 'shutdown')."""
    if gestionnaire_bd.client:
        gestionnaire_bd.client.close()


def obtenir_base() -> AsyncIOMotorDatabase:
    """Raccourci utilisé partout dans les routeurs pour accéder à la base courante."""
    if gestionnaire_bd.base is None:
        raise RuntimeError("La base de données n'est pas connectée (connecter_base_de_donnees() non appelé).")
    return gestionnaire_bd.base


# --- Noms des collections (constantes, pour éviter les fautes de frappe) ---
class Collections:
    PATIENT = "Patient"
    DOSSIER_EXAMEN = "Dossier_Examen"
    PRODUIT_CLINIQUE = "ProduitClinique"
    VENTE_CLINIQUE = "VenteClinique"
    A_ACHETE = "A_Acheté"
    MEDECIN_T = "MédecinT"
    UTILISATEUR_BLG = "UtilisateurBlg"
    PIECES_SCANNEES = "Pièces_Scannées_Utilisateurs"
    PRESTATIONS = "Prestations"
    CABINET = "Cabinet"
    ASSURANCE = "Assurance"
    ASSURANCE_PATIENT = "AssurancePatient"
    PRISE_EN_CHARGE = "PriseEnCharge"
    RENDEZ_VOUS = "RendezVous"
    RAPPEL = "Rappel"
    SUGGESTION_HISTORIQUE = "SuggestionHistorique"
    TYPE_PAIEMENT = "TypePaiement"
    CONFIGURATION_WHATSAPP = "ConfigurationWhatsApp"
    CONFIGURATION_SMTP = "ConfigurationSMTP"
    CODE_OTP = "CodeOTP"
    CONTACT_MESSAGERIE = "ContactMessagerie"
    CONTACT_EN_ATTENTE = "ContactEnAttente"
    CONVERSATION_WHATSAPP = "ConversationWhatsApp"
    MESSAGE_WHATSAPP = "MessageWhatsApp"
    LICENCE = "Licence"
    ORDONNANCE = "Ordonnance"
    THEME_PLATEFORME = "ThemePlateforme"
    CONFIGURATION_VIDAL = "ConfigurationVidal"
    VIDAL_CACHE = "VidalCache"
    VIDAL_USAGE_JOUR = "VidalUsageJour"
    VIDAL_HISTORIQUE_SECURISATION = "VidalHistoriqueSecurisation"
    NOTIFICATION_PLATEFORME = "NotificationPlateforme"
    JOURNAL_AUDIT = "JournalAudit"
    COMPTEURS = "Compteurs"  # séquences auto-incrémentées (N° Enr., N° Reçu...)
