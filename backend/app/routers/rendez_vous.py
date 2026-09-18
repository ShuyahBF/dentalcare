"""
app/routers/rendez_vous.py
------------------------------
Le Secrétariat Cabinet confirme ou modifie le rendez-vous à partir du
reçu/proforma établi par le Caissier (§4e du cahier des charges).

§ demande utilisateur : le Dentiste consulte SON PROPRE planning ("Rendez-
vous" dans sa sidebar), inspiré de /portal/planning — voir aussi la route
/charge-a-venir (panneau "Charge 30j à venir").
"""

from datetime import datetime, timedelta, time

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.database import obtenir_base, Collections
from app.core.dependances import obtenir_utilisateur_courant, exiger_role
from app.models.rendez_vous import RendezVous
from app.utils.compteurs import prochain_numero, prochain_numero_cabinet

router = APIRouter(prefix="/api/rendez-vous", tags=["Rendez-vous (Secrétariat)"])


async def _enrichir_avec_patient(base, cabinet_code: str, rendez_vous: list[dict]) -> list[dict]:
    """Ajoute patient_nom/patient_prenoms/patient_telephone à chaque RDV (résolu depuis Patient), pour l'affichage direct sans aller-retour supplémentaire."""
    numeros = {rv["patient_numero_enreg"] for rv in rendez_vous}
    if not numeros:
        return rendez_vous
    patients = {
        p["Numéro_Enreg"]: p
        async for p in base[Collections.PATIENT].find({"Numéro_Enreg": {"$in": list(numeros)}, "cabinet_code": cabinet_code})
    }
    for rv in rendez_vous:
        p = patients.get(rv["patient_numero_enreg"])
        rv["patient_nom"] = p.get("Nom") if p else None
        rv["patient_prenoms"] = p.get("Prénoms") if p else None
        rv["patient_telephone"] = p.get("Téléphone") if p else None
    return rendez_vous


@router.get("")
async def lister_rendez_vous(
    dentiste_numero_enreg: int | None = None,
    date_debut: str | None = None,
    date_fin: str | None = None,
    utilisateur: dict = Depends(obtenir_utilisateur_courant),
):
    base = obtenir_base()
    filtre: dict = {"cabinet_code": utilisateur["CodeCabinet"]}
    if dentiste_numero_enreg:
        filtre["dentiste_numero_enreg"] = dentiste_numero_enreg
    if date_debut or date_fin:
        filtre["date_heure_debut"] = {}
        if date_debut:
            filtre["date_heure_debut"]["$gte"] = datetime.fromisoformat(date_debut)
        if date_fin:
            filtre["date_heure_debut"]["$lte"] = datetime.fromisoformat(date_fin)
    curseur = base[Collections.RENDEZ_VOUS].find(filtre).sort("date_heure_debut", 1)
    rendez_vous = [rv async for rv in curseur]
    return await _enrichir_avec_patient(base, utilisateur["CodeCabinet"], rendez_vous)


@router.get("/charge-a-venir")
async def charge_rendez_vous_a_venir(
    dentiste_numero_enreg: int,
    jours: int = 30,
    utilisateur: dict = Depends(obtenir_utilisateur_courant),
):
    """
    § demande utilisateur — panneau "Charge Nj à venir" du planning : nombre
    de rendez-vous par jour, sur les `jours` prochains jours à partir
    d'aujourd'hui, pour un dentiste donné. Les statuts "Annulé" et "Absent"
    ne comptent pas dans la charge (rendez-vous qui n'occuperont pas le
    fauteuil).
    """
    base = obtenir_base()
    debut = datetime.combine(datetime.utcnow().date(), time.min)
    fin = debut + timedelta(days=jours)
    filtre = {
        "cabinet_code": utilisateur["CodeCabinet"], "dentiste_numero_enreg": dentiste_numero_enreg,
        "date_heure_debut": {"$gte": debut, "$lt": fin},
        "statut": {"$nin": ["Annulé", "Absent"]},
    }
    compteurs: dict[str, int] = {}
    async for rv in base[Collections.RENDEZ_VOUS].find(filtre, {"date_heure_debut": 1}):
        jour = rv["date_heure_debut"].date().isoformat()
        compteurs[jour] = compteurs.get(jour, 0) + 1

    resultat = []
    for i in range(jours):
        jour = (debut + timedelta(days=i)).date().isoformat()
        resultat.append({"date": jour, "nombre": compteurs.get(jour, 0)})
    return resultat


@router.post("", status_code=status.HTTP_201_CREATED)
async def creer_rendez_vous(rendez_vous: RendezVous, utilisateur: dict = Depends(exiger_role("Secrétariat Cabinet", "Caissier"))):
    base = obtenir_base()
    cabinet_code = utilisateur["CodeCabinet"]
    numero_enreg = await prochain_numero("RendezVous", valeur_depart=1000)
    # Référence humaine (code cabinet + année + n° d'ordre), propre au cabinet + année en cours
    # (§ demande utilisateur), ex: "00010027".
    reference = await prochain_numero_cabinet("rdv", cabinet_code)
    document = rendez_vous.model_dump()
    document["numero_enreg"] = numero_enreg
    document["reference"] = reference
    document["cabinet_code"] = cabinet_code
    document["cree_par"] = utilisateur["Login"]
    await base[Collections.RENDEZ_VOUS].insert_one(document)
    document.pop("_id", None)
    return document


@router.put("/{numero_enreg}/statut")
async def modifier_statut_rendez_vous(numero_enreg: int, statut: str, utilisateur: dict = Depends(exiger_role("Secrétariat Cabinet"))):
    base = obtenir_base()
    resultat = await base[Collections.RENDEZ_VOUS].update_one(
        {"numero_enreg": numero_enreg, "cabinet_code": utilisateur["CodeCabinet"]}, {"$set": {"statut": statut}}
    )
    if resultat.matched_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rendez-vous introuvable.")
    return {"statut": "mis à jour"}
