"""
app/utils/vidal_securisation.py
--------------------------------------
Sécurisation de prescription — schéma XML de /alerts/full, port fidèle du
portail SAWALI de référence (vérifié ligne à ligne contre le Manuel
d'intégration API REST VIDAL Sécurisation France, MI_APIREST REV_03).
"""

import re
import xml.etree.ElementTree as ET
from typing import Any, Optional

# 18 types d'alerte réels du manuel VIDAL — les 4 premiers sont cochés par défaut côté UI.
TYPES_ALERTE = [
    "CONTRA_INDICATION", "ALLERGY", "DRUG_INTERACTION", "POSOLOGY",
    "PRECAUTION", "WARNING", "SIDE_EFFECT", "PHYSICO_CHEMICAL_INTERACTION",
    "SURVEILLANCE", "REDUNDANT_ACTIVE_INGREDIENT", "SAME_DRUG",
    "FOOD_INTERACTION", "DISPENSING_RISK", "PRESCRIPTION_CONTEXT",
    "EXONERATION", "INDICATOR", "FOCUS", "HAS",
]
TYPES_ALERTE_DEFAUT = ["CONTRA_INDICATION", "ALLERGY", "DRUG_INTERACTION", "POSOLOGY"]


def construire_xml_posology_request(patient: dict, route_ref: Optional[str] = None) -> str:
    """Construit le body XML de /product/{id}/posology-descriptors et
    /vmp/{id}/posology-descriptors.

    § Diagnostic 19/09/2026 (via Journal VIDAL + Manuel d'intégration API
    REST VIDAL Sécurisation REV_03, p.90-91, fourni par l'utilisateur) :
    contrairement à /alerts/full (Sécurisation) où AUCUNE information n'est
    obligatoire, cet appel exige dateOfBirth/gender/weight/height — d'où le
    HTTP 400 systématique tant que l'implémentation initiale n'envoyait que
    route/indication en paramètres de requête, sans aucune donnée patient.
    Schéma confirmé par le manuel (reproduit ci-dessous) :

        <posology-request>
          <patient>
            <dateOfBirth>1980-01-01T01:01:01</dateOfBirth> <!--obligatoire-->
            <gender>MALE</gender>                          <!--obligatoire-->
            <weight>80</weight>                             <!--obligatoire, kg-->
            <height>180</height>                            <!--obligatoire, cm-->
            <hepaticInsufficiency>NONE</hepaticInsufficiency> <!--facultatif-->
            <routes><route>vidal://route/38</route></routes> <!--facultatif/souhaitable-->
          </patient>
        </posology-request>

    Note : contrairement à /alerts/full, "indication" n'apparaît JAMAIS dans
    le schéma documenté pour cet appel — seul "route" est prévu (et à
    l'intérieur de <patient>, pas d'une ligne de prescription). L'ancien
    paramètre de requête "indication" envoyé par l'implémentation initiale
    n'était donc jamais un paramètre valide pour cet endpoint.
    """
    root = ET.Element("posology-request")
    patient_el = ET.SubElement(root, "patient")
    dob = (patient or {}).get("dateOfBirth")
    _set_text(patient_el, "dateOfBirth", f"{dob}T00:00:00" if dob else None)
    _set_text(patient_el, "gender", (patient or {}).get("gender"))
    _set_text(patient_el, "weight", (patient or {}).get("weight"))
    _set_text(patient_el, "height", (patient or {}).get("height"))
    if (patient or {}).get("gender") == "FEMALE":
        bf = (patient or {}).get("breastFeedingStartDate")
        _set_text(patient_el, "breastFeedingStartDate", f"{bf}T00:00:00" if bf else None)
    _set_text(patient_el, "hepaticInsufficiency", (patient or {}).get("hepaticInsufficiency"))
    if route_ref:
        routes_el = ET.SubElement(patient_el, "routes")
        _set_text(routes_el, "route", f"vidal://route/{route_ref}")
    xml_str = ET.tostring(root, encoding="unicode")
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + xml_str


def _set_text(parent: ET.Element, tag: str, value: Any) -> None:
    if value in (None, ""):
        return
    ET.SubElement(parent, tag).text = str(value)


def _build_patient(el: ET.Element, patient: dict) -> None:
    dob = patient.get("dateOfBirth")
    _set_text(el, "dateOfBirth", f"{dob}T00:00:00" if dob else None)
    _set_text(el, "gender", patient.get("gender"))
    _set_text(el, "weight", patient.get("weight"))
    _set_text(el, "height", patient.get("height"))
    if patient.get("gender") == "FEMALE":
        bf = patient.get("breastFeedingStartDate")
        _set_text(el, "breastFeedingStartDate", f"{bf}T00:00:00" if bf else None)
        _set_text(el, "weeksOfAmenorrhea", patient.get("weeksOfAmenorrhea"))
    # VIDAL attend la clairance (mL/min, Cockcroft & Gault), calculée côté
    # frontend depuis âge/poids/sexe/créatininémie — pas la créatininémie brute.
    clairance = patient.get("clairance")
    _set_text(el, "creatin", f"{clairance:.1f}" if isinstance(clairance, (int, float)) else None)
    _set_text(el, "hepaticInsufficiency", patient.get("hepaticInsufficiency"))
    _build_ref_block(el, "allergies", "allergy", patient.get("allergies"))
    _build_ref_block(el, "molecules", "molecule", patient.get("molecules"))
    _build_ref_block(el, "pathologies", "pathology", patient.get("pathologies"))


def _build_ref_block(parent: ET.Element, block_tag: str, item_tag: str, items: Any) -> None:
    refs = [it.get("ref") for it in (items or []) if isinstance(it, dict) and it.get("ref")]
    if not refs:
        return
    block_el = ET.SubElement(parent, block_tag)
    for ref in refs:
        _set_text(block_el, item_tag, ref)


def _build_line(lines_el: ET.Element, line: dict) -> None:
    li = ET.SubElement(lines_el, "prescription-line")
    drug_ref = line.get("drugRef")
    _set_text(li, "drug", f"vidal://product/{drug_ref}" if drug_ref else None)
    _set_text(li, "dose", line.get("dose"))
    _set_text(li, "unitId", line.get("unitId"))
    _set_text(li, "duration", line.get("duration"))
    _set_text(li, "durationType", line.get("durationType"))
    _set_text(li, "frequencyType", line.get("frequencyType"))
    route_ref = line.get("route")
    if route_ref:
        routes_el = ET.SubElement(li, "routes")
        _set_text(routes_el, "route", f"vidal://route/{route_ref}")
    indication_ref = line.get("indication")
    if indication_ref:
        indications_el = ET.SubElement(li, "indications")
        _set_text(indications_el, "indication", indication_ref)
    posologies = line.get("posologies") or []
    if posologies:
        dosages_el = ET.SubElement(li, "dosages")
        for p in posologies:
            if not (p.get("dose") or p.get("intervalMin") or p.get("intervalMax")):
                continue
            dosage_el = ET.SubElement(dosages_el, "dosage")
            _set_text(dosage_el, "dose", p.get("dose"))
            _set_text(dosage_el, "unitId", p.get("unitId"))
            interval_el = ET.SubElement(dosage_el, "interval")
            _set_text(interval_el, "min", p.get("intervalMin"))
            _set_text(interval_el, "max", p.get("intervalMax"))
            _set_text(interval_el, "unitId", p.get("intervalUnitId") or "41")
    if line.get("startDate") or line.get("endDate"):
        period_el = ET.SubElement(li, "period")
        sd, ed = line.get("startDate"), line.get("endDate")
        _set_text(period_el, "startDate", f"{sd}T00:00:00" if sd else None)
        _set_text(period_el, "endDate", f"{ed}T00:00:00" if ed else None)
    _set_text(li, "status", line.get("status") or "ACTIVE")
    group_el = ET.SubElement(li, "group")
    _set_text(group_el, "groupId", line.get("groupId") or 1)
    _set_text(group_el, "groupType", line.get("groupType") or "SAME_ORDER")
    if line.get("ald"):
        ald_el = ET.SubElement(li, "aldStatus")
        _set_text(ald_el, "ald", "true")
        _set_text(ald_el, "aldCode", line.get("aldCode"))


def construire_xml_prescription(patient: dict, lignes: list[dict], types_alerte: Optional[list[str]] = None) -> str:
    """Construit le body XML de /alerts/full selon le schéma confirmé du manuel (patient / prescription-lines / alert-types)."""
    root = ET.Element("prescription")
    patient_el = ET.SubElement(root, "patient")
    _build_patient(patient_el, patient or {})
    lines_el = ET.SubElement(root, "prescription-lines")
    for line in (lignes or []):
        if not line.get("drugRef") and not line.get("drug"):
            continue
        _build_line(lines_el, line)
    types_el = ET.SubElement(root, "alert-types")
    for t in (types_alerte or TYPES_ALERTE_DEFAUT):
        _set_text(types_el, "alert-type", t)
    xml_str = ET.tostring(root, encoding="unicode")
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + xml_str


# ---------------------------------------------------------------------------
# Réponse /alerts/full — schéma confirmé (manuel MI_APIREST REV_03)
# ---------------------------------------------------------------------------
_SUMMARY_RE = re.compile(r'<vidal:(max\w+Severity)\b[^>]*\bseverity="([^"]*)"[^>]*>(.*?)</vidal:\1>', re.DOTALL | re.IGNORECASE)
_ALERT_ENTRY_RE = re.compile(r'<entry\b[^>]*\bvidal:categories="ALERT"[^>]*>(.*?)</entry>', re.DOTALL | re.IGNORECASE)
_TITLE_RE = re.compile(r"<title[^>]*>(.*?)</title>", re.DOTALL | re.IGNORECASE)
_CONTENT_RE = re.compile(r'<content\b[^>]*>(.*?)</content>', re.DOTALL | re.IGNORECASE)
_ALERT_TYPE_RE = re.compile(r'<vidal:alertType\b[^>]*\bname="([^"]*)"[^>]*>(.*?)</vidal:alertType>', re.DOTALL | re.IGNORECASE)
_SEVERITY_RE = re.compile(r"<vidal:severity>(.*?)</vidal:severity>", re.DOTALL | re.IGNORECASE)
_SUBTYPE_RE = re.compile(r'<vidal:subType\b[^>]*\bname="([^"]*)"[^>]*>(.*?)</vidal:subType>', re.DOTALL | re.IGNORECASE)
_DETAIL_RE = re.compile(r'<vidal:detail\b[^>]*>(.*?)</vidal:detail>', re.DOTALL | re.IGNORECASE)
_TRIGGERED_BY_RE = re.compile(r'<vidal:triggeredBy\b[^>]*\bid="([^"]*)"[^>]*\btype="([^"]*)"[^>]*>(.*?)</vidal:triggeredBy>', re.DOTALL | re.IGNORECASE)
_SOURCE_RE = re.compile(r'<vidal:source\b[^>]*\bdate="([^"]*)"[^>]*>(.*?)</vidal:source>', re.DOTALL | re.IGNORECASE)
_TAG_STRIP_RE = re.compile(r"<[^>]+>")

# Gravité croissante — sert à trier les alertes et choisir une couleur.
ORDRE_SEVERITE = {"NO_ALERT": 0, "INFO": 1, "LEVEL_1": 2, "LEVEL_2": 3, "LEVEL_3": 4, "LEVEL_4": 5}


def _clean(text: Optional[str]) -> str:
    if not text:
        return ""
    return _TAG_STRIP_RE.sub("", text).strip()


def parser_reponse_alertes(raw: Optional[str]) -> dict:
    """Parse la réponse /alerts/full : résumé par catégorie puis alertes détaillées, triées par gravité décroissante."""
    summary: list[dict] = []
    alerts: list[dict] = []
    if not isinstance(raw, str) or "<" not in raw:
        return {"summary": summary, "alerts": alerts}

    for category, severity, label in _SUMMARY_RE.findall(raw):
        summary.append({"category": category, "severity": severity, "label": _clean(label)})

    for block in _ALERT_ENTRY_RE.findall(raw):
        title_m, content_m = _TITLE_RE.search(block), _CONTENT_RE.search(block)
        type_m, severity_m = _ALERT_TYPE_RE.search(block), _SEVERITY_RE.search(block)
        subtype_m, detail_m = _SUBTYPE_RE.search(block), _DETAIL_RE.search(block)
        triggered_m, source_m = _TRIGGERED_BY_RE.search(block), _SOURCE_RE.search(block)
        alerts.append({
            "title": _clean(title_m.group(1)) if title_m else None,
            "content": _clean(content_m.group(1)) if content_m else None,
            "alert_type": type_m.group(1) if type_m else None,
            "alert_type_label": _clean(type_m.group(2)) if type_m else None,
            "severity": severity_m.group(1).strip() if severity_m else None,
            "sub_type": subtype_m.group(1) if subtype_m else None,
            "sub_type_label": _clean(subtype_m.group(2)) if subtype_m else None,
            "detail": _clean(detail_m.group(1)) if detail_m else None,
            "triggered_by_label": _clean(triggered_m.group(3)) if triggered_m else None,
            "source_date": source_m.group(1) if source_m else None,
            "source_label": _clean(source_m.group(2)) if source_m else None,
        })
    alerts.sort(key=lambda a: ORDRE_SEVERITE.get(a.get("severity"), -1), reverse=True)
    return {"summary": summary, "alerts": alerts}
