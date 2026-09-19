"""
app/utils/vidal_client.py
--------------------------------
Client VIDAL France (module payant, abonnement plateforme SAWALI SMART
SYSTEMS) — port fidèle de `routes/vidal.py` + `routes/vidal_fiche.py` +
`routes/vidal_riche.py` du portail SAWALI de référence, déjà testés en réel
sur cette même API. Simplifications assumées par rapport à la version
portail (moins pertinentes pour DentalCare, cabinet unique par praticien) :
  - Pas de webhook-proxy (n8n/Zapier) : appel direct à l'API VIDAL toujours.
  - Pas de mode "référentiel synchronisé hors-ligne" (vidal_sync.py) :
    recherche toujours en temps réel.
  - Configuration UNIQUE au niveau plateforme (pas de portée par tenant) :
    l'abonnement VIDAL est celui de SAWALI SMART SYSTEMS, partagé par tous
    les cabinets actifs.

§ demande utilisateur ("Comptabiliser toutes requêtes à Vidal") : CHAQUE
appel réel passe par `appeler_vidal()` ci-dessous, quel que soit
l'endpoint applicatif qui l'a déclenché (recherche, fiche produit,
posologie, sécurisation...) — la journalisation vit donc À CET ENDROIT
UNIQUE plutôt que dupliquée dans chaque routeur, pour ne jamais pouvoir
oublier un futur nouvel usage de VIDAL. Voir _journaliser_appel ci-dessous
et app/routers/vidal_journal.py pour la page de consultation super-admin.
"""

import asyncio
import hashlib
import json
import logging
import re
import time
from datetime import datetime, timedelta
from typing import Any, Optional

import httpx
from fastapi import HTTPException, status

from app.core.database import obtenir_base, Collections

_journal_logger = logging.getLogger("sawali.vidal.journal")

DEFAULT_TEST_BASE_URL = "https://api.vidal.fr/rest/api"
DEFAULT_PROD_BASE_URL = "https://api.vidal.fr/rest/api"

_ID_CONFIGURATION_VIDAL = "vidal_plateforme"  # document singleton


# ---------------------------------------------------------------------------
# Configuration (plateforme — super-admin)
# ---------------------------------------------------------------------------

async def obtenir_configuration_vidal() -> dict:
    base = obtenir_base()
    doc = await base[Collections.CONFIGURATION_VIDAL].find_one({"_id": _ID_CONFIGURATION_VIDAL})
    return doc or {}


async def charger_config_active() -> dict:
    """Résout la config VIDAL active (selon mode_actif) pour un appel API : base_url/app_id/app_key/ttl/quota/timeout."""
    s = await obtenir_configuration_vidal()
    mode = s.get("mode_actif") or "test"
    if mode == "production":
        base_url = s.get("production_base_url") or DEFAULT_PROD_BASE_URL
        app_id = (s.get("production_app_id") or "").strip()
        app_key = (s.get("production_app_key") or "").strip()
    else:
        base_url = s.get("test_base_url") or DEFAULT_TEST_BASE_URL
        app_id = (s.get("test_app_id") or "").strip()
        app_key = (s.get("test_app_key") or "").strip()
    return {
        "enabled": bool(s.get("module_actif")),
        "mode": mode,
        "base_url": (base_url or "").rstrip("/"),
        "app_id": app_id,
        "app_key": app_key,
        "cache_ttl_hours": int(s.get("ttl_cache_heures") or 168),
        "quota_per_day": int(s.get("quota_utilisateur_jour") or 200),
        "http_timeout": int(s.get("timeout_http_secondes") or 12),
    }


def exiger_module_actif(cfg: dict) -> None:
    if not cfg["enabled"]:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Module VIDAL désactivé par la plateforme.")
    if not cfg["app_id"] or not cfg["app_key"]:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=f"Identifiants VIDAL ({cfg['mode']}) non configurés.")


# ---------------------------------------------------------------------------
# Cache Mongo (TTL configurable) + quota journalier par utilisateur
# ---------------------------------------------------------------------------

def _cle_cache(mode: str, method: str, chemin: str, params: dict) -> str:
    charge = json.dumps({"e": mode, "m": method, "p": chemin, "q": params or {}}, sort_keys=True)
    return hashlib.sha256(charge.encode("utf-8")).hexdigest()


async def _cache_lire(cle: str, ttl_heures: int) -> Optional[dict]:
    base = obtenir_base()
    doc = await base[Collections.VIDAL_CACHE].find_one({"_id": cle})
    if not doc or not doc.get("stocke_le"):
        return None
    if datetime.utcnow() - doc["stocke_le"] > timedelta(hours=ttl_heures):
        return None
    payload = doc.get("payload")
    if isinstance(payload, dict) and payload.get("_erreur"):
        return None  # ne jamais resservir une erreur en cache
    return payload


async def _cache_ecrire(cle: str, payload: dict) -> None:
    if isinstance(payload, dict) and payload.get("_erreur"):
        return  # les réponses en erreur ne sont jamais mises en cache
    base = obtenir_base()
    await base[Collections.VIDAL_CACHE].update_one(
        {"_id": cle}, {"$set": {"payload": payload, "stocke_le": datetime.utcnow()}}, upsert=True
    )


async def verifier_et_incrementer_quota(login: str, cfg: dict) -> None:
    limite = cfg["quota_per_day"]
    if limite <= 0:
        return  # 0 = illimité
    base = obtenir_base()
    aujourdhui = datetime.utcnow().date().isoformat()
    doc = await base[Collections.VIDAL_USAGE_JOUR].find_one_and_update(
        {"login": login, "jour": aujourdhui}, {"$inc": {"compte": 1}}, upsert=True, return_document=True,
    )
    if (doc or {}).get("compte", 1) > limite:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=f"Quota VIDAL journalier dépassé ({limite} requêtes/jour).")


# ---------------------------------------------------------------------------
# Journal des appels VIDAL (§ demande utilisateur — super-admin uniquement)
# ---------------------------------------------------------------------------

async def _journaliser_appel(
    *, mode: str, methode: str, chemin: str, statut: str, duree_ms: int,
    login: Optional[str], cabinet_code: Optional[str], erreur: Optional[str] = None,
) -> None:
    """
    Fire-and-forget : ne doit JAMAIS faire échouer ni ralentir l'appel VIDAL
    réel (§ porté depuis Site-SawaliSmartSystems, routes/vidal_audit.py —
    même principe de non-blocage). Toute exception ici est avalée après
    journalisation applicative — la requête VIDAL a déjà répondu à
    l'utilisateur au moment où cette tâche de fond s'exécute.
    """
    try:
        base = obtenir_base()
        await base[Collections.VIDAL_APPELS_LOG].insert_one({
            "date_heure": datetime.utcnow(), "mode": mode, "methode": methode, "chemin": chemin,
            "statut": statut, "duree_ms": duree_ms, "login": login, "cabinet_code": cabinet_code,
            "erreur": (erreur or "")[:300] or None,
        })
    except Exception:  # noqa: BLE001
        _journal_logger.exception("[vidal_journal] journalisation de l'appel VIDAL impossible")


# ---------------------------------------------------------------------------
# Appel HTTP VIDAL (auth app_id/app_key en query string)
# ---------------------------------------------------------------------------

async def appeler_vidal(
    cfg: dict, method: str, chemin: str, params: Optional[dict] = None, corps_xml: Optional[str] = None,
    login: Optional[str] = None, cabinet_code: Optional[str] = None,
) -> dict:
    """
    Un appel HTTP à VIDAL. Ajoute app_id/app_key à la query string. Retourne
    le texte brut sous {"raw": ...} (VIDAL répond en Atom/XML pour la
    plupart des endpoints) ou {"_erreur": {...}} en cas d'échec réseau/HTTP —
    jamais d'exception levée ici, l'appelant décide (cohérent avec le
    portail de référence : ne jamais planter sur une erreur VIDAL externe).

    § `login`/`cabinet_code` (optionnels, transmis par chaque routeur
    appelant) : identifient QUI a déclenché l'appel, pour le journal
    super-admin. Absents pour un appel technique sans utilisateur identifié
    (aucun cas actuel, mais la fonction reste utilisable sans).
    """
    debut = time.monotonic()
    qp = dict(params or {})
    qp.setdefault("app_id", cfg["app_id"])
    qp.setdefault("app_key", cfg["app_key"])
    url = f"{cfg['base_url']}{chemin}"
    try:
        async with httpx.AsyncClient(timeout=cfg["http_timeout"]) as client:
            if method.upper() == "GET":
                r = await client.get(url, params=qp, headers={"Accept": "application/atom+xml, application/xml, application/json;q=0.5"})
            elif method.upper() == "POST" and corps_xml is not None:
                r = await client.post(
                    url, params=qp, content=corps_xml.encode("utf-8"),
                    headers={"Accept": "application/atom+xml, application/xml", "Content-Type": "text/xml; charset=utf-8"},
                )
            else:
                r = await client.request(method.upper(), url, params=qp)
    except httpx.HTTPError as exc:
        duree_ms = int((time.monotonic() - debut) * 1000)
        message = f"VIDAL injoignable : {str(exc)[:300]}"
        asyncio.create_task(_journaliser_appel(
            mode=cfg.get("mode", "?"), methode=method.upper(), chemin=chemin, statut="exception",
            duree_ms=duree_ms, login=login, cabinet_code=cabinet_code, erreur=message,
        ))
        return {"raw": None, "_erreur": {"statut": 0, "message": message}}

    duree_ms = int((time.monotonic() - debut) * 1000)
    if r.status_code >= 400:
        message = f"VIDAL a répondu {r.status_code}"
        asyncio.create_task(_journaliser_appel(
            mode=cfg.get("mode", "?"), methode=method.upper(), chemin=chemin, statut="erreur",
            duree_ms=duree_ms, login=login, cabinet_code=cabinet_code, erreur=message,
        ))
        return {"raw": r.text, "_erreur": {"statut": r.status_code, "message": message}}

    asyncio.create_task(_journaliser_appel(
        mode=cfg.get("mode", "?"), methode=method.upper(), chemin=chemin, statut="ok",
        duree_ms=duree_ms, login=login, cabinet_code=cabinet_code,
    ))
    return {"raw": r.text}


# ---------------------------------------------------------------------------
# Parsing Atom/XML VIDAL (regex, fidèle au portail de référence — dégrade
# proprement en listes vides si le format diffère, jamais d'exception).
# ---------------------------------------------------------------------------

_ENTRY_RE = re.compile(r"<entry\b[^>]*>(.*?)</entry>", re.DOTALL | re.IGNORECASE)
_TITLE_RE = re.compile(r"<title[^>]*>([^<]+)</title>", re.IGNORECASE)
_ID_RE = re.compile(r"<(?:[a-z][a-z0-9]*:)?id>\s*(\d+)\s*</(?:[a-z][a-z0-9]*:)?id>", re.IGNORECASE)
_VMP_RE = re.compile(r'<(?:[a-z][a-z0-9]*:)?vmp\b[^>]*\bvidalId="(\d+)"', re.IGNORECASE)


def parser_entrees_atom(raw: Optional[str]) -> list[dict]:
    """Extrait {title, vidal_id, vmp_id} de chaque <entry> d'une réponse Atom VIDAL."""
    items: list[dict] = []
    if not isinstance(raw, str) or "<entry" not in raw:
        return items
    for block in _ENTRY_RE.findall(raw):
        title_m = _TITLE_RE.search(block)
        title = (title_m.group(1) if title_m else "").strip()
        if not title:
            continue
        id_m = _ID_RE.search(block)
        vmp_m = _VMP_RE.search(block)
        items.append({"title": title, "vidal_id": id_m.group(1) if id_m else None, "vmp_id": vmp_m.group(1) if vmp_m else None})
    return items


_CATEGORIES_RE = re.compile(r'<entry\b[^>]*\bcategories="([^"]*)"[^>]*>(.*?)</entry>', re.DOTALL | re.IGNORECASE)
_ITEM_TYPE_RE = re.compile(r'<(?:[a-z][a-z0-9]*:)?itemType\b[^>]*\bname="([^"]*)"', re.IGNORECASE)
_DOC_LINK_RE = re.compile(r'<link\b[^>]*\brel="related"[^>]*\btype="application/xhtml\+xml"[^>]*\bhref="([^"]*)"', re.IGNORECASE)


def parser_fiche_produit(raw: Optional[str]) -> dict:
    """Parse GET /product/{id}?aggregate=ROUTE&aggregate=DOCUMENTS → {name, vmp_id, routes[], documents[]}."""
    name = vmp_id = None
    routes: list[dict] = []
    documents: dict[str, dict] = {}
    if not isinstance(raw, str) or "<entry" not in raw:
        return {"name": name, "vmp_id": vmp_id, "routes": routes, "documents": []}
    for categories, block in _CATEGORIES_RE.findall(raw):
        cats = categories.upper()
        if "PRODUCT" in cats:
            title_m = _TITLE_RE.search(block)
            name = title_m.group(1).strip() if title_m else name
            vmp_m = _VMP_RE.search(block)
            vmp_id = vmp_m.group(1) if vmp_m else vmp_id
        elif "ROUTE" in cats:
            id_m, title_m = _ID_RE.search(block), _TITLE_RE.search(block)
            routes.append({"id": id_m.group(1) if id_m else None, "name": title_m.group(1).strip() if title_m else None})
        elif "DOCUMENT" in cats:
            type_m = _ITEM_TYPE_RE.search(block)
            item_type = type_m.group(1) if type_m else None
            if not item_type or item_type in documents:
                continue
            title_m, link_m = _TITLE_RE.search(block), _DOC_LINK_RE.search(block)
            doc_url = link_m.group(1) if link_m else None
            documents[item_type] = {
                "item_type": item_type, "title": title_m.group(1).strip() if title_m else None, "url": doc_url,
                "is_html": bool(doc_url and doc_url.lower().endswith((".html", ".htm"))),
            }
    return {"name": name, "vmp_id": vmp_id, "routes": routes, "documents": list(documents.values())}
