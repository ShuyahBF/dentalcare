"""
app/routers/diagnostic.py
------------------------------
Route de diagnostic réservée à l'Administrateur : exécute en direct quelques
requêtes de contrôle sur les collections clés et retourne, pour chacune, la
requête utilisée et le résultat brut. Sert à diagnostiquer un écart entre
"les données existent en base" et "l'application ne les affiche pas", sans
avoir à deviner depuis l'extérieur (utile notamment pour distinguer un
problème de connexion backend<->MongoDB d'un problème de cache/déploiement
frontend).

Le paramètre "collections" permet de ne diagnostiquer que la ou les
collections pertinentes pour le module actuellement affiché côté frontend
(ex: l'onglet Catalogue ne demande que ProduitClinique), plutôt que de
systématiquement tout tester.
"""

from app.core.database import obtenir_base, Collections
from app.core.dependances import exiger_role
from app.core.config import settings
from fastapi import APIRouter, Depends

router = APIRouter(prefix="/api/admin/diagnostic", tags=["Diagnostic (Administrateur)"])

# Association module frontend -> collection(s) Mongo à interroger. Tenue ici
# pour rester la source de vérité si de nouveaux modules/onglets apparaissent.
COLLECTIONS_PAR_MODULE = {
    "Cabinet": [Collections.CABINET],
    "Utilisateurs": [Collections.UTILISATEUR_BLG],
    "Médecins": [Collections.MEDECIN_T],
    "Catalogue": [Collections.PRODUIT_CLINIQUE],
    "Assurances": [Collections.ASSURANCE],
    "Paiements": [Collections.TYPE_PAIEMENT],
    "Suggestions": [Collections.SUGGESTION_HISTORIQUE],
}

TOUTES_LES_COLLECTIONS = [
    Collections.PRODUIT_CLINIQUE, Collections.CABINET,
    Collections.UTILISATEUR_BLG, Collections.SUGGESTION_HISTORIQUE, Collections.MEDECIN_T,
]


@router.get("")
async def executer_diagnostic(module: str | None = None, utilisateur: dict = Depends(exiger_role("Administrateur"))):
    """
    `module` : nom d'un onglet du frontend (Cabinet, Utilisateurs, Catalogue,
    Suggestions). Si omis ou inconnu, diagnostique toutes les collections
    (comportement précédent, conservé pour compatibilité).
    """
    base = obtenir_base()
    resultats = []
    collections_a_tester = COLLECTIONS_PAR_MODULE.get(module, TOUTES_LES_COLLECTIONS)

    for nom_collection in collections_a_tester:
        filtre: dict = {}
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
        "module": module,
        "resultats": resultats,
    }
