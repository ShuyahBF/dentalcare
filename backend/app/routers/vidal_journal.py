"""
app/routers/vidal_journal.py
-----------------------------------
§ demande utilisateur : "Comptabiliser toutes requêtes à Vidal. Tracer et
résumer dans une page pour super-admin (date/heure requête, réponse,
utilisateur, durée)." — consultation du journal alimenté par
app/utils/vidal_client.py (appeler_vidal), point de passage UNIQUE de
tous les appels VIDAL réels de l'application (recherche, fiche produit,
posologie, équivalents, référentiels, sécurisation), garantissant que
RIEN n'échappe à ce journal, y compris tout futur nouvel usage de VIDAL.

§ porté depuis Site-SawaliSmartSystems (routes/vidal_audit.py) pour la
liste brute filtrable par période — le résumé (totaux, taux d'erreur,
durée moyenne, répartition par utilisateur/mode) est propre à cette
demande, DentalCare n'ayant pas l'équivalent du tableau de bord
"Officines"/30-90j de la référence (module sans objet ici).

Réservé au super-admin — jamais aux cabinets clients eux-mêmes, y compris
leurs Administrateurs (l'abonnement VIDAL est celui de la PLATEFORME,
partagé, pas une ressource par cabinet).
"""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query

from app.core.database import obtenir_base, Collections
from app.core.dependances import exiger_super_admin

router = APIRouter(prefix="/api/vidal/admin", tags=["VIDAL — Journal (super-admin)"])


def _filtre_periode(depuis: Optional[str], jusqua: Optional[str]) -> dict:
    filtre_date: dict = {}
    if depuis:
        try:
            filtre_date["$gte"] = datetime.fromisoformat(depuis.replace("Z", "+00:00")).replace(tzinfo=None)
        except ValueError:
            pass
    if jusqua:
        try:
            filtre_date["$lte"] = datetime.fromisoformat(jusqua.replace("Z", "+00:00")).replace(tzinfo=None)
        except ValueError:
            pass
    return {"date_heure": filtre_date} if filtre_date else {}


@router.get("/vidal-journal")
async def lister_journal_vidal(
    depuis: Optional[str] = Query(None, description="ISO 8601 — filtre 'à partir de'"),
    jusqua: Optional[str] = Query(None, description="ISO 8601 — filtre 'jusqu'à'"),
    limite: int = Query(200, ge=1, le=1000),
    utilisateur: dict = Depends(exiger_super_admin),
):
    """Liste brute des appels VIDAL, du plus récent au plus ancien — colonnes demandées : date/heure, réponse (statut), utilisateur, durée."""
    base = obtenir_base()
    requete = _filtre_periode(depuis, jusqua)
    curseur = base[Collections.VIDAL_APPELS_LOG].find(requete, {"_id": 0}).sort("date_heure", -1).limit(limite)
    entrees = [e async for e in curseur]

    # § enrichissement du code cabinet en dénomination lisible — le
    # super-admin ne mémorise pas les codes cabinet par cœur.
    codes = {e.get("cabinet_code") for e in entrees if e.get("cabinet_code")}
    denominations: dict[str, str] = {}
    if codes:
        async for c in base[Collections.CABINET].find({"code_cabinet": {"$in": list(codes)}}, {"code_cabinet": 1, "denomination": 1}):
            denominations[c["code_cabinet"]] = c.get("denomination") or c["code_cabinet"]
    for e in entrees:
        e["cabinet_nom"] = denominations.get(e.get("cabinet_code")) or e.get("cabinet_code")

    return {"entrees": entrees, "total_periode": len(entrees)}


@router.get("/vidal-journal/resume")
async def resumer_journal_vidal(
    depuis: Optional[str] = Query(None, description="ISO 8601 — filtre 'à partir de'"),
    jusqua: Optional[str] = Query(None, description="ISO 8601 — filtre 'jusqu'à'"),
    utilisateur: dict = Depends(exiger_super_admin),
):
    """
    Résumé de la période filtrée : total d'appels, répartition par statut
    (ok/erreur/exception), durée moyenne, et classement par utilisateur —
    calculé sur TOUTE la période demandée (pas seulement les `limite`
    dernières lignes retournées par /vidal-journal, qui peut être tronqué).
    """
    base = obtenir_base()
    requete = _filtre_periode(depuis, jusqua)
    pipeline = [
        {"$match": requete},
        {"$facet": {
            "totaux": [
                {"$group": {"_id": None, "total": {"$sum": 1}, "duree_moyenne_ms": {"$avg": "$duree_ms"}}}
            ],
            "par_statut": [
                {"$group": {"_id": "$statut", "total": {"$sum": 1}}}
            ],
            "par_utilisateur": [
                {"$group": {"_id": "$login", "total": {"$sum": 1}, "duree_moyenne_ms": {"$avg": "$duree_ms"}}},
                {"$sort": {"total": -1}},
                {"$limit": 10},
            ],
            "par_mode": [
                {"$group": {"_id": "$mode", "total": {"$sum": 1}}}
            ],
        }},
    ]
    resultat = await base[Collections.VIDAL_APPELS_LOG].aggregate(pipeline).to_list(length=1)
    brut = resultat[0] if resultat else {"totaux": [], "par_statut": [], "par_utilisateur": [], "par_mode": []}
    totaux = brut["totaux"][0] if brut["totaux"] else {"total": 0, "duree_moyenne_ms": None}

    return {
        "total_appels": totaux["total"],
        "duree_moyenne_ms": round(totaux["duree_moyenne_ms"]) if totaux.get("duree_moyenne_ms") is not None else None,
        "par_statut": {d["_id"] or "inconnu": d["total"] for d in brut["par_statut"]},
        "par_utilisateur": [{"login": d["_id"] or "inconnu", "total": d["total"], "duree_moyenne_ms": round(d["duree_moyenne_ms"]) if d.get("duree_moyenne_ms") is not None else None} for d in brut["par_utilisateur"]],
        "par_mode": {d["_id"] or "inconnu": d["total"] for d in brut["par_mode"]},
    }
