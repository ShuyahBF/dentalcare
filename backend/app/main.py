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

from app.core.database import connecter_base_de_donnees, fermer_base_de_donnees
from app.core.config import settings
from app.routers import (
    auth, patients, produits, caisse, dossiers_examen,
    medecins, rendez_vous, rappels, assurances, utilisateurs, cabinet, comptable, suggestions,
)


@asynccontextmanager
async def cycle_de_vie(app: FastAPI):
    await connecter_base_de_donnees()
    yield
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


@app.get("/api/sante")
async def verification_sante():
    """Route de contrôle de vie (health check), utile pour Emergent au déploiement."""
    return {"statut": "ok", "application": settings.nom_application}
