"""
app/routers/statistiques.py
--------------------------------
§ demande utilisateur : "des graphiques de reçus payés à la caisse par
périodes sur les montants, par actes, par dents et toutes autres choses que
tu trouveras pertinentes." Réservé au Médecin principal, à l'Administrateur
et au Comptable (voir app/core/dependances.py::exiger_acces_statistiques).

Toutes les requêtes portent sur les REÇUS effectivement RÉGLÉS (Réglé == 1,
c'est-à-dire les "Reçu", pas les "Proforma"), à l'exclusion des reçus
annulés — même convention de cohérence financière que comptable.py :
toujours `MontantRéglé`, jamais `Montant` (facturé), pour tout total
d'argent réellement encaissé ; la répartition par ligne (acte/dent/domaine)
est proratisée au taux réellement réglé du reçu, pour le cas rare d'un reçu
partiellement réglé.
"""

from datetime import datetime, time

from fastapi import APIRouter, Depends

from app.core.database import obtenir_base, Collections
from app.core.dependances import exiger_acces_statistiques

router = APIRouter(prefix="/api/statistiques", tags=["Statistiques"])


async def _requete_recus_payes(cabinet_code: str, date_debut: str | None, date_fin: str | None) -> list[dict]:
    base = obtenir_base()
    filtre: dict = {"cabinet_code": cabinet_code, "Réglé": 1, "annule": {"$ne": True}}
    if date_debut or date_fin:
        filtre["Date Vente"] = {}
        if date_debut:
            filtre["Date Vente"]["$gte"] = datetime.fromisoformat(date_debut)
        if date_fin:
            filtre["Date Vente"]["$lte"] = datetime.combine(datetime.fromisoformat(date_fin).date(), time.max)
    return [v async for v in base[Collections.VENTE_CLINIQUE].find(filtre)]


def _taux_regle(vente: dict) -> float:
    montant_total = vente.get("Montant", 0) or 0
    montant_regle = vente.get("MontantRéglé", 0) or 0
    return (montant_regle / montant_total) if montant_total > 0 else 0


@router.get("/synthese")
async def synthese(date_debut: str | None = None, date_fin: str | None = None, utilisateur: dict = Depends(exiger_acces_statistiques)):
    recus = await _requete_recus_payes(utilisateur["CodeCabinet"], date_debut, date_fin)
    total_encaisse = sum(r.get("MontantRéglé", 0) or 0 for r in recus)
    nombre_recus = len(recus)
    return {
        "total_encaisse": round(total_encaisse, 2),
        "nombre_recus": nombre_recus,
        "panier_moyen": round(total_encaisse / nombre_recus, 2) if nombre_recus else 0,
    }


@router.get("/par-periode")
async def par_periode(
    date_debut: str | None = None, date_fin: str | None = None, granularite: str = "jour",
    utilisateur: dict = Depends(exiger_acces_statistiques),
):
    """granularite: 'jour' | 'semaine' | 'mois'. Les périodes sans reçu
    n'apparaissent pas (un graphique en barres/lignes les traite comme 0,
    inutile de les matérialiser côté serveur)."""
    recus = await _requete_recus_payes(utilisateur["CodeCabinet"], date_debut, date_fin)
    compteurs: dict[str, dict] = {}
    for r in recus:
        dt: datetime = r.get("Date Vente")
        if not dt:
            continue
        if granularite == "mois":
            cle = dt.strftime("%Y-%m")
        elif granularite == "semaine":
            annee_iso, semaine_iso, _ = dt.isocalendar()
            cle = f"{annee_iso}-S{semaine_iso:02d}"
        else:
            cle = dt.strftime("%Y-%m-%d")
        bucket = compteurs.setdefault(cle, {"periode": cle, "montant": 0.0, "nombre": 0})
        bucket["montant"] += r.get("MontantRéglé", 0) or 0
        bucket["nombre"] += 1
    resultat = sorted(compteurs.values(), key=lambda b: b["periode"])
    for b in resultat:
        b["montant"] = round(b["montant"], 2)
    return resultat


@router.get("/par-acte")
async def par_acte(date_debut: str | None = None, date_fin: str | None = None, limite: int = 15, utilisateur: dict = Depends(exiger_acces_statistiques)):
    recus = await _requete_recus_payes(utilisateur["CodeCabinet"], date_debut, date_fin)
    compteurs: dict[str, dict] = {}
    for r in recus:
        taux = _taux_regle(r)
        for ligne in r.get("lignes", []):
            libelle = ligne.get("libelle") or "Acte non désigné"
            bucket = compteurs.setdefault(libelle, {"libelle": libelle, "montant": 0.0, "nombre": 0})
            bucket["montant"] += (ligne.get("sous_total", 0) or 0) * taux
            bucket["nombre"] += ligne.get("quantite", 1) or 1
    resultat = sorted(compteurs.values(), key=lambda b: b["montant"], reverse=True)[:limite]
    for b in resultat:
        b["montant"] = round(b["montant"], 2)
    return resultat


@router.get("/par-dent")
async def par_dent(date_debut: str | None = None, date_fin: str | None = None, utilisateur: dict = Depends(exiger_acces_statistiques)):
    """Regroupe par numéro de dent (notation internationale FDI, référence
    interne de l'application). Les lignes sans dent (actes non liés à une
    dent précise : détartrage global, consultation...) sont exclues — pas
    pertinentes pour ce graphique précis."""
    recus = await _requete_recus_payes(utilisateur["CodeCabinet"], date_debut, date_fin)
    compteurs: dict[int, dict] = {}
    for r in recus:
        taux = _taux_regle(r)
        for ligne in r.get("lignes", []):
            numero_dent = ligne.get("numero_dent_international") or ligne.get("numero_dent")
            if not numero_dent:
                continue
            bucket = compteurs.setdefault(numero_dent, {"numero_dent": numero_dent, "montant": 0.0, "nombre": 0})
            bucket["montant"] += (ligne.get("sous_total", 0) or 0) * taux
            bucket["nombre"] += ligne.get("quantite", 1) or 1
    resultat = sorted(compteurs.values(), key=lambda b: b["numero_dent"])
    for b in resultat:
        b["montant"] = round(b["montant"], 2)
    return resultat


@router.get("/par-mode-paiement")
async def par_mode_paiement(date_debut: str | None = None, date_fin: str | None = None, utilisateur: dict = Depends(exiger_acces_statistiques)):
    recus = await _requete_recus_payes(utilisateur["CodeCabinet"], date_debut, date_fin)
    compteurs: dict[str, dict] = {}
    for r in recus:
        mode = r.get("mode_reglement") or "Espèces"
        bucket = compteurs.setdefault(mode, {"mode": mode, "montant": 0.0, "nombre": 0})
        bucket["montant"] += r.get("MontantRéglé", 0) or 0
        bucket["nombre"] += 1
    resultat = sorted(compteurs.values(), key=lambda b: b["montant"], reverse=True)
    for b in resultat:
        b["montant"] = round(b["montant"], 2)
    return resultat


@router.get("/par-domaine")
async def par_domaine(date_debut: str | None = None, date_fin: str | None = None, utilisateur: dict = Depends(exiger_acces_statistiques)):
    recus = await _requete_recus_payes(utilisateur["CodeCabinet"], date_debut, date_fin)
    compteurs: dict[str, dict] = {}
    for r in recus:
        taux = _taux_regle(r)
        for ligne in r.get("lignes", []):
            domaine = ligne.get("domaine") or "Autre"
            bucket = compteurs.setdefault(domaine, {"domaine": domaine, "montant": 0.0})
            bucket["montant"] += (ligne.get("sous_total", 0) or 0) * taux
    resultat = sorted(compteurs.values(), key=lambda b: b["montant"], reverse=True)
    for b in resultat:
        b["montant"] = round(b["montant"], 2)
    return resultat


@router.get("/caissiers")
async def lister_caissiers(utilisateur: dict = Depends(exiger_acces_statistiques)):
    """§ demande utilisateur : "voir les arrêts de caisse comme le
    comptable" — liste des caissiers du cabinet, pour peupler le sélecteur
    d'état de caisse (voir GET /caisse/etat-de-caisse/pdf, dont l'accès
    croisé est réservé aux mêmes rôles que ce module)."""
    base = obtenir_base()
    curseur = base[Collections.UTILISATEUR_BLG].find(
        {"CodeCabinet": utilisateur["CodeCabinet"], "role": "Caissier"}, {"Login": 1, "nom_complet": 1}
    )
    return [{"login": u["Login"], "nom_complet": u.get("nom_complet") or u["Login"]} async for u in curseur]


def _categorie_age(date_naissance) -> str:
    """§ demande utilisateur : "ordonnances par genre (H/F/Bébé, etc.)" —
    tranches usuelles en pédiatrie/pharmacologie, pertinentes pour la
    posologie (un bébé et un adulte ne reçoivent jamais la même chose)."""
    if not date_naissance:
        return "Âge inconnu"
    age_jours = (datetime.utcnow() - date_naissance).days
    age_ans = age_jours / 365.25
    if age_ans < 2:
        return "Bébé (< 2 ans)"
    if age_ans < 12:
        return "Enfant (2-11 ans)"
    if age_ans < 18:
        return "Adolescent (12-17 ans)"
    if age_ans < 60:
        return "Adulte (18-59 ans)"
    return "Senior (60 ans et +)"


@router.get("/ordonnances-par-profil")
async def ordonnances_par_profil(date_debut: str | None = None, date_fin: str | None = None, utilisateur: dict = Depends(exiger_acces_statistiques)):
    """§ demande utilisateur : "les statistiques feront aussi apparaître
    les ordonnances par genre (H/F/Bébé, etc.)" — regroupe par sexe ET
    tranche d'âge du patient AU MOMENT DE LA REQUÊTE (pas à la date de
    l'ordonnance — un patient dont on ne connaît que l'âge actuel, cohérent
    avec le reste de l'application qui ne fige jamais un âge historique)."""
    base = obtenir_base()
    filtre: dict = {"cabinet_code": utilisateur["CodeCabinet"]}
    if date_debut or date_fin:
        filtre["date_creation"] = {}
        if date_debut:
            filtre["date_creation"]["$gte"] = datetime.fromisoformat(date_debut)
        if date_fin:
            filtre["date_creation"]["$lte"] = datetime.combine(datetime.fromisoformat(date_fin).date(), time.max)
    ordonnances = [o async for o in base[Collections.ORDONNANCE].find(filtre)]
    numeros_patients = {o.get("patient_numero_enreg") for o in ordonnances if o.get("patient_numero_enreg")}
    patients = {
        p["Numéro_Enreg"]: p
        async for p in base[Collections.PATIENT].find({"Numéro_Enreg": {"$in": list(numeros_patients)}, "cabinet_code": utilisateur["CodeCabinet"]})
    }
    compteurs: dict[str, int] = {}
    for o in ordonnances:
        p = patients.get(o.get("patient_numero_enreg"))
        sexe = (p.get("Sexe") if p else None) or "Sexe inconnu"
        categorie = _categorie_age(p.get("Date Naissance") if p else None)
        cle = f"{sexe} — {categorie}"
        compteurs[cle] = compteurs.get(cle, 0) + 1
    return sorted([{"profil": k, "nombre": v} for k, v in compteurs.items()], key=lambda x: x["nombre"], reverse=True)


@router.get("/ordonnances-service-officine")
async def ordonnances_service_officine(date_debut: str | None = None, date_fin: str | None = None, utilisateur: dict = Depends(exiger_acces_statistiques)):
    """§ demande utilisateur : "celles servies en officine (le remplissage
    du formulaire en ligne à remplir par les officines)" — une ordonnance
    est "servie" dès qu'AU MOINS une officine a soumis un retour via le lien
    de vérification du QR (voir app/routers/verification.py)."""
    base = obtenir_base()
    filtre: dict = {"cabinet_code": utilisateur["CodeCabinet"]}
    if date_debut or date_fin:
        filtre["date_creation"] = {}
        if date_debut:
            filtre["date_creation"]["$gte"] = datetime.fromisoformat(date_debut)
        if date_fin:
            filtre["date_creation"]["$lte"] = datetime.combine(datetime.fromisoformat(date_fin).date(), time.max)
    references = [o["reference"] async for o in base[Collections.ORDONNANCE].find(filtre, {"reference": 1}) if o.get("reference")]
    if not references:
        return {"nombre_total": 0, "nombre_servies": 0, "nombre_non_servies": 0}
    references_servies = {
        s["ordonnance_reference"]
        async for s in base[Collections.SERVICE_OFFICINE].find({"ordonnance_reference": {"$in": references}, "cabinet_code": utilisateur["CodeCabinet"]}, {"ordonnance_reference": 1})
    }
    nombre_servies = len(references_servies)
    return {"nombre_total": len(references), "nombre_servies": nombre_servies, "nombre_non_servies": len(references) - nombre_servies}
