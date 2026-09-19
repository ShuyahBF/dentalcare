"""
app/main.py
--------------
Point d'entrée de l'API SAWALI DentalCare. Assemble tous les routeurs,
configure le CORS (pour le frontend React en développement local) et gère
la connexion/déconnexion à MongoDB Atlas au démarrage/arrêt du serveur.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.encoders import ENCODERS_BY_TYPE
from bson import ObjectId
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.core.database import connecter_base_de_donnees, fermer_base_de_donnees
from app.core.config import settings
from app.utils.client_cash import assurer_client_cash_pour_tous_cabinets_actifs
from app.utils.verification_licences import verifier_essais_et_licences
from app.routers import (
    auth, patients, produits, caisse, dossiers_examen,
    medecins, rendez_vous, rappels, assurances, souscripteurs, utilisateurs, cabinet, comptable, suggestions, diagnostic, types_paiement, plateforme, plateforme_communication, messagerie, messagerie_conversations, themes, vidal, vidal_journal, statistiques, verification, releves_bons, medicaments_locaux,
)

# Enregistre bson.ObjectId dans la table globale d'encodeurs JSON de FastAPI.
# CORRECTIF IMPORTANT : la plupart de nos routes retournent des documents
# MongoDB "bruts" (obtenus via Motor), qui contiennent toujours un champ
# interne "_id" de type ObjectId. FastAPI ne sait pas le sérialiser en JSON
# nativement, ce qui provoquait une erreur 500 silencieuse (corps de réponse
# en texte brut, sans "detail" JSON) sur TOUTE route renvoyant une liste ou
# un document Mongo sans l'avoir nettoyé à la main — observé en production :
# les onglets Cabinet et Catalogue restaient vides malgré des données bien
# présentes en base. Cette ligne corrige le problème une fois pour toutes,
# pour les routes existantes ET les futures, sans avoir à modifier chaque
# routeur individuellement.
ENCODERS_BY_TYPE[ObjectId] = str


@asynccontextmanager
async def cycle_de_vie(app: FastAPI):
    await connecter_base_de_donnees()
    # Garantit que le patient générique "Client CASH" existe toujours, pour
    # que le Caissier puisse établir un reçu sans patient sélectionné.
    await assurer_client_cash_pour_tous_cabinets_actifs()

    # § demande utilisateur : vérification quotidienne des essais/licences
    # de chaque cabinet (notification 3j avant expiration, suspension
    # automatique si non renouvelé) — un premier passage immédiat au
    # démarrage, puis une fois par jour.
    planificateur = AsyncIOScheduler()
    planificateur.add_job(verifier_essais_et_licences, "interval", hours=24, next_run_time=None)
    planificateur.start()
    await verifier_essais_et_licences()

    yield
    planificateur.shutdown(wait=False)
    await fermer_base_de_donnees()


app = FastAPI(
    title=settings.nom_application,
    description="Plateforme SaaS de gestion de cabinet dentaire — SAWALI SMART SYSTEMS",
    version="1.0.0",
    lifespan=cycle_de_vie,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Enregistrement de tous les routeurs métier ---
app.include_router(auth.router)
app.include_router(patients.router)
app.include_router(produits.router)
app.include_router(caisse.router)
app.include_router(dossiers_examen.router)
app.include_router(medecins.router)
app.include_router(rendez_vous.router)
app.include_router(rappels.router)
app.include_router(assurances.router)
app.include_router(utilisateurs.router)
app.include_router(cabinet.router)
app.include_router(comptable.router)
app.include_router(suggestions.router)
app.include_router(diagnostic.router)
app.include_router(types_paiement.router)
app.include_router(plateforme.router)
app.include_router(plateforme_communication.router)
app.include_router(messagerie.router)
app.include_router(messagerie_conversations.router)
app.include_router(themes.router)
app.include_router(vidal.router)
app.include_router(vidal_journal.router)
app.include_router(souscripteurs.router)
app.include_router(statistiques.router)
app.include_router(verification.router)
app.include_router(releves_bons.router)
app.include_router(medicaments_locaux.router)


@app.get("/api/sante")
async def verification_sante():
    """Route de contrôle de vie (health check), utile pour Emergent au déploiement."""
    return {"statut": "ok", "application": settings.nom_application}
