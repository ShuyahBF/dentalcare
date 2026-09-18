"""
app/routers/comptable.py
-----------------------------
Tableau de bord des encaissements/règlements basé sur VenteClinique/A_Acheté
(§8), filtrable par période/caissier/dentiste/mode de règlement, avec export
Excel et PDF.
"""

import io
from datetime import datetime, time

from fastapi import APIRouter, Depends
from fastapi.responses import Response
import openpyxl

from app.core.database import obtenir_base, Collections
from app.core.dependances import exiger_role
from app.utils.formatage import identite_patient_affichee

router = APIRouter(prefix="/api/comptable", tags=["Comptable"])


async def _requete_ventes_filtrees(cabinet_code: str, date_debut: str | None, date_fin: str | None, caissier: str | None, mode_reglement: str | None) -> list[dict]:
    base = obtenir_base()
    filtre: dict = {"cabinet_code": cabinet_code}
    if date_debut or date_fin:
        filtre["Date Vente"] = {}
        if date_debut:
            filtre["Date Vente"]["$gte"] = datetime.fromisoformat(date_debut)
        if date_fin:
            filtre["Date Vente"]["$lte"] = datetime.combine(datetime.fromisoformat(date_fin).date(), time.max)
    if caissier:
        filtre["Code Vendeur"] = caissier
    if mode_reglement:
        filtre["mode_reglement"] = mode_reglement
    ventes = [v async for v in base[Collections.VENTE_CLINIQUE].find(filtre).sort("Date Vente", -1)]
    for v in ventes:
        v["patient_affiche"] = identite_patient_affichee(v)
        v["reste_a_payer"] = round((v.get("Montant", 0) or 0) - (v.get("MontantRéglé", 0) or 0), 2)
    return ventes


@router.get("/tableau-de-bord")
async def tableau_de_bord(
    date_debut: str | None = None,
    date_fin: str | None = None,
    caissier: str | None = None,
    mode_reglement: str | None = None,
    utilisateur: dict = Depends(exiger_role("Comptable")),
):
    ventes = await _requete_ventes_filtrees(utilisateur["CodeCabinet"], date_debut, date_fin, caissier, mode_reglement)

    total_general = sum(v.get("Montant", 0) for v in ventes)
    par_mode: dict[str, float] = {}
    par_caissier: dict[str, float] = {}
    par_domaine: dict[str, float] = {}

    for v in ventes:
        mode = v.get("mode_reglement", "Espèces")
        par_mode[mode] = par_mode.get(mode, 0) + v.get("Montant", 0)
        caissier_v = v.get("Code Vendeur", "?")
        par_caissier[caissier_v] = par_caissier.get(caissier_v, 0) + v.get("Montant", 0)
        for ligne in v.get("lignes", []):
            d = ligne.get("domaine") or "Autre"
            par_domaine[d] = par_domaine.get(d, 0) + ligne.get("sous_total", 0)

    # § demande utilisateur : liste déroulante des caissiers — calculée sur
    # la PÉRIODE seule (date_debut/date_fin), JAMAIS restreinte par le
    # filtre `caissier` déjà appliqué à `ventes` ci-dessus, sinon la liste
    # se réduirait à une seule option dès qu'un caissier est sélectionné.
    ventes_periode = await _requete_ventes_filtrees(utilisateur["CodeCabinet"], date_debut, date_fin, None, None)
    logins_periode = sorted({v.get("Code Vendeur") for v in ventes_periode if v.get("Code Vendeur")})
    base = obtenir_base()
    utilisateurs_periode = {
        u["Login"]: u.get("nom_complet")
        async for u in base[Collections.UTILISATEUR_BLG].find({"Login": {"$in": logins_periode}, "cabinet_code": utilisateur["CodeCabinet"]}, {"Login": 1, "nom_complet": 1})
    }
    caissiers_disponibles = [{"login": login, "nom_complet": utilisateurs_periode.get(login) or login} for login in logins_periode]

    return {
        "nombre_ventes": len(ventes),
        "total_general": total_general,
        "repartition_par_mode_reglement": par_mode,
        "repartition_par_caissier": par_caissier,
        "repartition_par_domaine": par_domaine,
        "caissiers_disponibles": caissiers_disponibles,
        "ventes": ventes,
    }


@router.get("/export-excel")
async def exporter_excel(
    date_debut: str | None = None,
    date_fin: str | None = None,
    caissier: str | None = None,
    mode_reglement: str | None = None,
    utilisateur: dict = Depends(exiger_role("Comptable")),
):
    ventes = await _requete_ventes_filtrees(utilisateur["CodeCabinet"], date_debut, date_fin, caissier, mode_reglement)

    classeur = openpyxl.Workbook()
    feuille = classeur.active
    feuille.title = "Encaissements"
    feuille.append(["N° Reçu", "Patient", "Date", "Caissier", "Mode règlement", "Montant", "Reste à payer", "Réglé"])
    for v in ventes:
        date_vente = v.get("Date Vente")
        feuille.append([
            v.get("Référence"), v.get("patient_affiche") or v.get("Libellé"),
            date_vente.strftime("%d/%m/%Y %H:%M") if date_vente else "",
            v.get("Code Vendeur"), v.get("mode_reglement"), v.get("Montant", 0), v.get("reste_a_payer", 0),
            "Oui" if v.get("Réglé") else "Non",
        ])

    tampon = io.BytesIO()
    classeur.save(tampon)
    tampon.seek(0)
    return Response(
        content=tampon.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=encaissements.xlsx"},
    )
