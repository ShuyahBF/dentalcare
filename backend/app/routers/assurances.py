"""
app/routers/assurances.py
------------------------------
Gestion du référentiel des assurances/mutuelles, du lien patient-assurance
(% prise en charge, plafond annuel) et du cycle de vie complet d'une prise
en charge : demande -> accord -> facturation -> paiement, avec calcul
automatique de la répartition assureur/patient et suivi du plafond annuel.
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.database import obtenir_base, Collections
from app.core.dependances import obtenir_utilisateur_courant, exiger_role
from app.models.assurance import Assurance, AssurancePatient, PriseEnCharge
from app.utils.compteurs import prochain_numero

router = APIRouter(prefix="/api/assurances", tags=["Assurances"])


@router.get("")
async def lister_assurances(inclure_inactifs: bool = False, utilisateur: dict = Depends(obtenir_utilisateur_courant)):
    base = obtenir_base()
    filtre = {"cabinet_code": utilisateur["CodeCabinet"]}
    if not inclure_inactifs:
        filtre["actif"] = True
    curseur = base[Collections.ASSURANCE].find(filtre)
    return [a async for a in curseur]


@router.post("", status_code=status.HTTP_201_CREATED)
async def creer_assurance(assurance_data: dict, utilisateur: dict = Depends(exiger_role("Administrateur", "Comptable"))):
    base = obtenir_base()
    numero_enreg = await prochain_numero("Assurance", valeur_depart=1)
    assurance = Assurance(numero_enreg=numero_enreg, **{k: v for k, v in assurance_data.items() if k != "numero_enreg"})
    document = assurance.model_dump()
    document["cabinet_code"] = utilisateur["CodeCabinet"]
    await base[Collections.ASSURANCE].insert_one(document)
    return assurance


@router.put("/{numero_enreg}")
async def modifier_assurance(numero_enreg: int, assurance_data: dict, utilisateur: dict = Depends(exiger_role("Administrateur", "Comptable"))):
    """
    Modifie une assurance (§ demande utilisateur : intitulé, %PC par défaut,
    contact, email, délai de remboursement, actif — tout doit être
    modifiable depuis le tableau de l'onglet Administration → Assurances).
    Remplacement complet des champs métier (comme pour le catalogue et les
    médecins) : le front envoie toujours l'objet complet avec le(s) champ(s)
    modifié(s).
    """
    base = obtenir_base()
    valeurs = {k: v for k, v in assurance_data.items() if k in (
        "nom", "contact", "email", "delai_remboursement_jours", "pourcentage_prise_en_charge_defaut", "actif",
    )}
    resultat = await base[Collections.ASSURANCE].update_one({"numero_enreg": numero_enreg, "cabinet_code": utilisateur["CodeCabinet"]}, {"$set": valeurs})
    if resultat.matched_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assurance introuvable.")
    return {"statut": "modifié"}


@router.post("/patients", status_code=status.HTTP_201_CREATED)
async def lier_patient_assurance(lien: AssurancePatient, utilisateur: dict = Depends(exiger_role("Caissier", "Administrateur"))):
    """
    Rattache un patient à une assurance. Le %PC n'est JAMAIS celui envoyé
    par le client : il est toujours repris depuis la configuration de
    l'assurance elle-même (Assurance.pourcentage_prise_en_charge_defaut,
    ex: "OLEA80" → 80%) — le caissier n'a pas la main dessus, conformément
    aux règles métier (§ demande utilisateur).
    """
    base = obtenir_base()
    assurance = await base[Collections.ASSURANCE].find_one({"numero_enreg": lien.assurance_numero_enreg, "cabinet_code": utilisateur["CodeCabinet"]})
    if not assurance:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assurance introuvable.")

    numero_enreg = await prochain_numero("AssurancePatient", valeur_depart=1)
    document = lien.model_dump()
    document["numero_enreg"] = numero_enreg
    document["cabinet_code"] = utilisateur["CodeCabinet"]
    document["pourcentage_prise_en_charge"] = assurance.get("pourcentage_prise_en_charge_defaut", 80)
    await base[Collections.ASSURANCE_PATIENT].insert_one(document)
    document.pop("_id", None)
    return document


@router.get("/patients/{patient_numero_enreg}")
async def lister_assurances_du_patient(patient_numero_enreg: int, utilisateur: dict = Depends(obtenir_utilisateur_courant)):
    """
    Liste les liens assurance d'un patient, avec le nom de l'assurance déjà
    résolu (utilisé par la Caisse pour proposer un choix au règlement).
    """
    base = obtenir_base()
    liens = [l async for l in base[Collections.ASSURANCE_PATIENT].find({"patient_numero_enreg": patient_numero_enreg, "cabinet_code": utilisateur["CodeCabinet"]})]
    for lien in liens:
        assurance = await base[Collections.ASSURANCE].find_one({"numero_enreg": lien["assurance_numero_enreg"], "cabinet_code": utilisateur["CodeCabinet"]})
        lien["nom_assurance"] = assurance["nom"] if assurance else "Assurance inconnue"
    return liens


@router.post("/prises-en-charge", status_code=status.HTTP_201_CREATED)
async def demander_prise_en_charge(prise_en_charge: PriseEnCharge, utilisateur: dict = Depends(exiger_role("Caissier"))):
    """
    Ouvre une demande de prise en charge. La répartition assureur/patient est
    recalculée côté serveur à partir du % défini sur AssurancePatient, en
    tenant compte du plafond annuel déjà consommé.
    """
    base = obtenir_base()
    lien = await base[Collections.ASSURANCE_PATIENT].find_one({"numero_enreg": prise_en_charge.assurance_patient_numero_enreg, "cabinet_code": utilisateur["CodeCabinet"]})
    if not lien:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lien patient-assurance introuvable.")

    pourcentage = lien.get("pourcentage_prise_en_charge", 80)
    part_assureur_calculee = prise_en_charge.montant_total * pourcentage / 100

    plafond = lien.get("plafond_annuel")
    consomme = lien.get("montant_consomme_annee", 0)
    if plafond is not None and consomme + part_assureur_calculee > plafond:
        part_assureur_calculee = max(0, plafond - consomme)

    part_assure_calculee = prise_en_charge.montant_total - part_assureur_calculee

    numero_enreg = await prochain_numero("PriseEnCharge", valeur_depart=1000)
    document = prise_en_charge.model_dump()
    document.update({
        "numero_enreg": numero_enreg,
        "cabinet_code": utilisateur["CodeCabinet"],
        "part_assureur": round(part_assureur_calculee, 2),
        "part_assure": round(part_assure_calculee, 2),
    })
    await base[Collections.PRISE_EN_CHARGE].insert_one(document)

    await base[Collections.ASSURANCE_PATIENT].update_one(
        {"numero_enreg": lien["numero_enreg"]},
        {"$inc": {"montant_consomme_annee": part_assureur_calculee}},
    )
    document.pop("_id", None)
    return document


@router.put("/prises-en-charge/{numero_enreg}/statut")
async def changer_statut_prise_en_charge(numero_enreg: int, statut: str, utilisateur: dict = Depends(exiger_role("Comptable", "Caissier"))):
    """Fait avancer une prise en charge dans son cycle de vie (Demandée -> Accordée -> Facturée -> Payée)."""
    base = obtenir_base()
    champ_date = {
        "Accordée": "date_accord", "Facturée": "date_facturation", "Payée": "date_paiement",
    }.get(statut)
    mise_a_jour = {"statut": statut}
    if champ_date:
        mise_a_jour[champ_date] = datetime.utcnow()

    resultat = await base[Collections.PRISE_EN_CHARGE].update_one({"numero_enreg": numero_enreg, "cabinet_code": utilisateur["CodeCabinet"]}, {"$set": mise_a_jour})
    if resultat.matched_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prise en charge introuvable.")
    return {"statut": "mis à jour"}


@router.get("/prises-en-charge")
async def lister_prises_en_charge(statut: str | None = None, utilisateur: dict = Depends(exiger_role("Comptable", "Caissier"))):
    """Liste des demandes de prise en charge, filtrable par statut — utilisée par le module Comptable (§8)."""
    base = obtenir_base()
    filtre = {"cabinet_code": utilisateur["CodeCabinet"]}
    if statut:
        filtre["statut"] = statut
    curseur = base[Collections.PRISE_EN_CHARGE].find(filtre).sort("date_demande", -1)
    return [p async for p in curseur]
