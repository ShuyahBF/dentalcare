"""
app/routers/vidal.py
-------------------------
§ demande utilisateur : Module VIDAL France — recherche médicament,
monographies (RCP), catalogue réglementaire et analyse de prescriptions
(interactions, contre-indications, allergies). Port fidèle du portail
SAWALI SMART SYSTEMS de référence (déjà testé en réel sur l'API VIDAL) —
voir app/utils/vidal_client.py pour les simplifications assumées.

Réservé au Dentiste (usage clinique) et à l'Administrateur (vérification/
configuration) — jamais au Caissier/Secrétariat/Comptable.
"""

from datetime import datetime
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, Body, Depends, HTTPException, Query, status
from fastapi.responses import Response
from pydantic import BaseModel

from app.core.database import obtenir_base, Collections
from app.core.dependances import exiger_role
from app.utils.vidal_client import (
    charger_config_active, exiger_module_actif, verifier_et_incrementer_quota,
    _cle_cache, _cache_lire, _cache_ecrire, appeler_vidal, parser_entrees_atom, parser_fiche_produit,
)
from app.utils.vidal_securisation import construire_xml_prescription, construire_xml_posology_request, parser_reponse_alertes, ORDRE_SEVERITE
from app.utils.compteurs import prochain_numero
from app.utils.audit import journaliser_action

router = APIRouter(prefix="/api/vidal", tags=["VIDAL France"])

# Hôtes VIDAL publics autorisés pour /documents/proxy — jamais un proxy ouvert.
_HOTES_DOCUMENTS_AUTORISES = {"api.vidal.fr", "document-rcp.vidal.fr"}

_ACCES = exiger_role("Dentiste", "Administrateur")


async def _config_prete(login: str):
    cfg = await charger_config_active()
    exiger_module_actif(cfg)
    await verifier_et_incrementer_quota(login, cfg)
    return cfg


@router.get("/search/parsed")
async def recherche_medicament(q: str = Query(..., min_length=2), utilisateur: dict = Depends(_ACCES)):
    cfg = await _config_prete(utilisateur["Login"])
    params = {"q": q}
    cle = _cle_cache(cfg["mode"], "GET", "/products", params)
    data = await _cache_lire(cle, cfg["cache_ttl_hours"])
    if data is None:
        data = await appeler_vidal(cfg, "GET", "/products", params=params, login=utilisateur["Login"], cabinet_code=utilisateur["CodeCabinet"])
        await _cache_ecrire(cle, data)
    return {"query": q, "results": parser_entrees_atom(data.get("raw"))}


@router.get("/product/{product_id}/detail")
async def fiche_produit(product_id: str, utilisateur: dict = Depends(_ACCES)):
    cfg = await _config_prete(utilisateur["Login"])
    chemin = f"/product/{product_id}"
    params = {"aggregate": ["ROUTE", "DOCUMENTS"]}
    cle = _cle_cache(cfg["mode"], "GET", chemin, params)
    data = await _cache_lire(cle, cfg["cache_ttl_hours"])
    if data is None:
        data = await appeler_vidal(cfg, "GET", chemin, params=params, login=utilisateur["Login"], cabinet_code=utilisateur["CodeCabinet"])
        await _cache_ecrire(cle, data)
    return parser_fiche_produit(data.get("raw"))


@router.get("/product/{product_id}/indications")
async def indications_produit(product_id: str, utilisateur: dict = Depends(_ACCES)):
    cfg = await _config_prete(utilisateur["Login"])
    data = await appeler_vidal(cfg, "GET", f"/product/{product_id}/indications", login=utilisateur["Login"], cabinet_code=utilisateur["CodeCabinet"])
    entries = parser_entrees_atom(data.get("raw"))
    return {"product_id": product_id, "indications": [
        {"label": e["title"], "ref": f"vidal://indication/{e['vidal_id']}"} for e in entries if e.get("title") and e.get("vidal_id")
    ]}


@router.get("/vmp/{vmp_id}/equivalents")
async def equivalents_vmp(vmp_id: str, exclude_product_id: str | None = None, utilisateur: dict = Depends(_ACCES)):
    cfg = await _config_prete(utilisateur["Login"])
    chemin = f"/vmp/{vmp_id}/products"
    params = {"page-size": 50}
    cle = _cle_cache(cfg["mode"], "GET", chemin, params)
    data = await _cache_lire(cle, cfg["cache_ttl_hours"])
    if data is None:
        data = await appeler_vidal(cfg, "GET", chemin, params=params, login=utilisateur["Login"], cabinet_code=utilisateur["CodeCabinet"])
        await _cache_ecrire(cle, data)
    equivalents = parser_entrees_atom(data.get("raw"))
    if exclude_product_id:
        equivalents = [e for e in equivalents if e.get("vidal_id") != exclude_product_id]
    return {"vmp_id": vmp_id, "equivalents": equivalents}


@router.get("/documents/proxy")
async def proxy_document(url: str = Query(..., min_length=1), utilisateur: dict = Depends(_ACCES)):
    """Relaie un document VIDAL public (RCP PDF...) depuis notre propre origine — liste d'hôtes limitée, jamais un proxy ouvert."""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or parsed.hostname not in _HOTES_DOCUMENTS_AUTORISES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="URL de document VIDAL non autorisée.")
    try:
        async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
            r = await client.get(url)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Erreur en récupérant le document : {str(exc)[:200]}") from exc
    if r.status_code >= 400:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Document VIDAL introuvable ({r.status_code}).")
    return Response(content=r.content, media_type=r.headers.get("content-type", "application/octet-stream"))


class PatientPosologie(BaseModel):
    """§ Manuel VIDAL REV_03 p.90-91 : dateOfBirth/gender/weight/height sont
    documentés OBLIGATOIRES pour cet appel précis (contrairement à
    /alerts/full où rien n'est obligatoire) — d'où l'échec HTTP 400 tant
    qu'ils n'étaient pas transmis."""
    dateOfBirth: str | None = None
    gender: str | None = None
    weight: float | None = None
    height: float | None = None
    hepaticInsufficiency: str | None = None
    breastFeedingStartDate: str | None = None


@router.post("/product/{product_id}/posology-descriptors")
async def posologie_experimentale(
    product_id: str, patient: PatientPosologie = Body(...), route: str | None = None,
    utilisateur: dict = Depends(_ACCES),
):
    """
    § Diagnostic conclu le 19/09/2026 grâce au Manuel d'intégration API REST
    VIDAL Sécurisation REV_03 (p.90-91), fourni par l'utilisateur via Google
    Drive : cet appel exige un corps XML `<posology-request><patient>...`
    avec dateOfBirth/gender/weight/height OBLIGATOIRES (Content-Type
    text/xml) — jamais un GET, jamais des paramètres de requête
    route/indication comme tenté initialement (d'où les échecs HTTP 405
    puis 400 observés successivement, voir Journal VIDAL super-admin). Le
    paramètre "indication" n'existe pas dans le schéma documenté de cet
    appel — seul "route" est prévu, à l'intérieur de <patient>.
    """
    cfg = await _config_prete(utilisateur["Login"])
    xml_corps = construire_xml_posology_request(patient.model_dump(), route)
    data = await appeler_vidal(cfg, "POST", f"/product/{product_id}/posology-descriptors", corps_xml=xml_corps, login=utilisateur["Login"], cabinet_code=utilisateur["CodeCabinet"])
    if data.get("_erreur"):
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="VIDAL n'a pas retourné de posologie pour ce produit.")
    return {"data": data}


# ---------------------------------------------------------------------------
# Recherche référentielle (allergies/pathologies/molécules) + Sécurisation
# ---------------------------------------------------------------------------

_REFERENTIEL = {
    "allergy": {"chemin": "/allergies", "schema": "allergy"},
    "molecule": {"chemin": "/allergies", "schema": "molecule"},
    "pathology": {"chemin": "/pathologies", "schema": "cim10", "params_extra": {"type": "CIM10"}},
}


@router.get("/referential/search")
async def recherche_referentielle(kind: str = Query(..., pattern="^(allergy|pathology|molecule)$"), q: str = Query(..., min_length=2), utilisateur: dict = Depends(_ACCES)):
    cfg = await _config_prete(utilisateur["Login"])
    spec = _REFERENTIEL[kind]
    params = {"q": q, **spec.get("params_extra", {})}
    data = await appeler_vidal(cfg, "GET", spec["chemin"], params=params, login=utilisateur["Login"], cabinet_code=utilisateur["CodeCabinet"])
    if data.get("_erreur"):
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Recherche référentielle indisponible.")
    entries = parser_entrees_atom(data.get("raw"))
    return {"kind": kind, "results": [
        {"label": e["title"], "ref": f"vidal://{spec['schema']}/{e['vidal_id']}"} for e in entries if e.get("title") and e.get("vidal_id")
    ]}


class PayloadSecurisation(BaseModel):
    patient: dict = {}
    current_treatments: list[dict] = []
    new_prescription_lines: list[dict] = []
    alert_types: list[str] | None = None
    patient_nom: str | None = None  # affichage seul (historique), jamais transmis à VIDAL


@router.post("/securisation/analyze")
async def analyser_prescription(payload: PayloadSecurisation = Body(...), utilisateur: dict = Depends(_ACCES)):
    if not payload.new_prescription_lines and not payload.current_treatments:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Au moins un médicament est requis.")
    cfg = await _config_prete(utilisateur["Login"])

    toutes_lignes = (
        [{**l, "groupType": "PREVIOUS_ORDER", "groupId": 2} for l in payload.current_treatments]
        + [{**l, "groupType": "SAME_ORDER", "groupId": 1} for l in payload.new_prescription_lines]
    )
    xml_corps = construire_xml_prescription(payload.patient, toutes_lignes, payload.alert_types)
    data = await appeler_vidal(cfg, "POST", "/alerts/full", corps_xml=xml_corps, login=utilisateur["Login"], cabinet_code=utilisateur["CodeCabinet"])
    analyse = parser_reponse_alertes(data.get("raw"))

    severites = [s.get("severity") for s in analyse.get("summary", []) if s.get("severity")]
    severite_max = max(severites, key=lambda s: ORDRE_SEVERITE.get(s, -1)) if severites else None

    base = obtenir_base()
    numero_enreg = await prochain_numero("VidalHistoriqueSecurisation", valeur_depart=1)
    entree = {
        "numero_enreg": numero_enreg, "cabinet_code": utilisateur["CodeCabinet"], "login": utilisateur["Login"],
        "patient_nom": payload.patient_nom, "nombre_lignes": len(toutes_lignes), "severite_max": severite_max,
        "analyse": analyse, "mode": cfg["mode"], "date_creation": datetime.utcnow(),
    }
    await base[Collections.VIDAL_HISTORIQUE_SECURISATION].insert_one(entree)
    await journaliser_action(utilisateur["Login"], "securisation_prescription", {"severite_max": severite_max}, cabinet_code=utilisateur["CodeCabinet"])
    entree.pop("_id", None)
    return {"analyse": analyse, "id": numero_enreg}


@router.get("/securisation/history")
async def historique_securisation(utilisateur: dict = Depends(_ACCES)):
    base = obtenir_base()
    curseur = (
        base[Collections.VIDAL_HISTORIQUE_SECURISATION]
        .find({"cabinet_code": utilisateur["CodeCabinet"], "login": utilisateur["Login"]}, {"analyse": 0})
        .sort("date_creation", -1)
        .limit(50)
    )
    return [d async for d in curseur]
