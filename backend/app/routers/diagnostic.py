"""
app/routers/diagnostic.py
------------------------------
Route de diagnostic réservée à l'Administrateur : exécute en direct quelques
requêtes de contrôle sur les collections clés (ProduitClinique, Cabinet,
UtilisateurBlg) et retourne, pour chacune, la requête utilisée et le
résultat brut. Sert à diagnostiquer un écart entre "les données existent en
base" et "l'application ne les affiche pas", sans avoir à deviner depuis
l'extérieur (utile notamment pour distinguer un problème de connexion
backend<->MongoDB d'un problème de cache/déploiement frontend).
"""

from app.core.database import obtenir_base, Collections
from app.core.dependances import exiger_role
from app.core.config import settings
from fastapi import APIRouter, Depends

router = APIRouter(prefix="/api/admin/diagnostic", tags=["Diagnostic (Administrateur)"])


@router.get("")
async def executer_diagnostic(utilisateur: dict = Depends(exiger_role("Administrateur"))):
    base = obtenir_base()
    resultats = []

    for nom_collection, filtre in [
        (Collections.PRODUIT_CLINIQUE, {}),
        (Collections.CABINET, {}),
        (Collections.UTILISATEUR_BLG, {}),
        (Collections.SUGGESTION_HISTORIQUE, {}),
    ]:
        try:
            nombre = await base[nom_collection].count_documents(filtre)
            echantillon = await base[nom_collection].find_one(filtre)
            if echantillon:
                echantillon.pop("_id", None)
                echantillon.pop("mot_de_passe_hache", None)  # jamais exposer un hash, même partiellement
            resultats.append({
                "collection": nom_collection,
                "requete_mongo": f"db.{nom_collection}.find({filtre})",
                "nombre_documents": nombre,
                "echantillon": echantillon,
                "erreur": None,
            })
        except Exception as exc:  # noqa: BLE001 — diagnostic volontairement permissif pour remonter l'erreur telle quelle
            resultats.append({
                "collection": nom_collection,
                "requete_mongo": f"db.{nom_collection}.find({filtre})",
                "nombre_documents": None,
                "echantillon": None,
                "erreur": f"{type(exc).__name__}: {exc}",
            })

    return {
        "base_de_donnees_ciblee": settings.mongodb_db_name,
        "resultats": resultats,
    }
