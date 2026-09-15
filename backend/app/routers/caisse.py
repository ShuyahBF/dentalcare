"""
app/routers/caisse.py
-------------------------
Cœur du parcours patient (§4 du cahier des charges) :
  - création d'un panier de prestations (saisie clavier OU sélection sur le
    schéma dentaire interactif, chaque sélection cumulant le montant total
    en temps réel)
  - génération d'un REÇU définitif (payé immédiatement) ou d'une PROFORMA
    (paiement différé)
  - génération PDF du reçu (fidèle au modèle fourni) et de l'état de caisse
  - persistance du statut du schéma dentaire choisi dans le Dossier_Examen
    du patient (ContenuExams), pour qu'il soit visible à la prochaine visite
"""

from datetime import datetime, time
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from pydantic import BaseModel

from app.core.database import obtenir_base, Collections
from app.core.dependances import obtenir_utilisateur_courant, exiger_role
from app.models.vente_clinique import LigneVente
from app.utils.compteurs import prochain_numero, prochain_numero_recu
from app.utils.pdf_documents import generer_pdf_recu, generer_pdf_etat_de_caisse
from app.utils.audit import journaliser_action

router = APIRouter(prefix="/api/caisse", tags=["Caisse"])


class CreationVenteRequete(BaseModel):
    patient_numero_enreg: int
    lignes: list[LigneVente]
    type_document: str = "Reçu"  # "Reçu" (payé) ou "Proforma" (différé)
    mode_reglement: Optional[str] = "Espèces"
    dossier_examen_numero_enreg: Optional[int] = None  # rattache la vente à un dossier existant


async def _obtenir_cabinet(base) -> dict:
    cabinet = await base[Collections.CABINET].find_one({})
    return cabinet or {"denomination": "SAWALI DentalCare", "devise": "FCFA", "adresse": "Ouagadougou, Burkina Faso"}


@router.post("/ventes", status_code=status.HTTP_201_CREATED)
async def creer_vente(requete: CreationVenteRequete, utilisateur: dict = Depends(exiger_role("Caissier"))):
    """
    Crée un reçu ou une proforma à partir du panier (§4b-d). Le montant total
    est recalculé côté serveur (jamais fait confiance au montant envoyé par
    le client) pour éviter toute manipulation.
    """
    base = obtenir_base()

    patient = await base[Collections.PATIENT].find_one({"Numéro_Enreg": requete.patient_numero_enreg})
    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient introuvable.")
    if not requete.lignes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Le panier est vide.")

    lignes_calculees = []
    montant_total = 0.0
    for ligne in requete.lignes:
        sous_total = ligne.quantite * ligne.prix_unitaire * (1 - ligne.pourcentage_remise / 100)
        ligne_dict = ligne.model_dump()
        ligne_dict["sous_total"] = round(sous_total, 2)
        lignes_calculees.append(ligne_dict)
        montant_total += sous_total

    numero_enreg = await prochain_numero("VenteClinique", valeur_depart=10000)
    reference = await prochain_numero_recu()
    maintenant = datetime.utcnow()

    document = {
        "Numéro_Enreg": numero_enreg,
        "Référence": reference,
        "Code Client": str(requete.patient_numero_enreg),
        "Date Vente": maintenant,
        "DateHeure_Création": maintenant,
        "Code Vendeur": utilisateur["Login"],
        "Libellé": f"{patient.get('Nom', '')} {patient.get('Prénoms', '')}".strip(),
        "Montant": round(montant_total, 2),
        "Réglé": 1 if requete.type_document == "Reçu" else 0,
        "MontantRéglé": round(montant_total, 2) if requete.type_document == "Reçu" else 0,
        "Caisse": "CAISSE1",
        "Dossier": requete.dossier_examen_numero_enreg,
        "DuréeValidité": 15,
        "NbImpressions": 0,
        "type_document": requete.type_document,
        "mode_reglement": requete.mode_reglement,
        "lignes": lignes_calculees,
    }
    await base[Collections.VENTE_CLINIQUE].insert_one(document)

    # Miroir dénormalisé dans A_Acheté (compatibilité legacy, une ligne par acte)
    lignes_a_achete = [
        {
            "Référence": reference, "Code Produit": ligne["code_produit"], "Qte Livrée": ligne["quantite"],
            "Prix Public": ligne["prix_unitaire"], "Réduction": ligne["pourcentage_remise"],
            "Domaine": ligne.get("domaine"), "Date_Sortie": maintenant, "Realisé_par": utilisateur["Login"],
        }
        for ligne in lignes_calculees
    ]
    if lignes_a_achete:
        await base[Collections.A_ACHETE].insert_many(lignes_a_achete)

    await journaliser_action(utilisateur["Login"], f"creation_{requete.type_document.lower()}", {"reference": reference, "montant": montant_total})

    document.pop("_id", None)
    return document


@router.post("/ventes/{reference}/encaisser")
async def encaisser_proforma(reference: str, utilisateur: dict = Depends(exiger_role("Caissier"))):
    """Transforme une proforma en reçu définitif (le patient revient payer)."""
    base = obtenir_base()
    vente = await base[Collections.VENTE_CLINIQUE].find_one({"Référence": reference})
    if not vente:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vente introuvable.")
    await base[Collections.VENTE_CLINIQUE].update_one(
        {"Référence": reference},
        {"$set": {"Réglé": 1, "MontantRéglé": vente["Montant"], "type_document": "Reçu"}},
    )
    await journaliser_action(utilisateur["Login"], "encaissement_proforma", {"reference": reference})
    return {"statut": "encaissé"}


@router.get("/ventes")
async def lister_ventes(
    date_debut: Optional[str] = None,
    date_fin: Optional[str] = None,
    caissier: Optional[str] = None,
    mode_reglement: Optional[str] = None,
    utilisateur: dict = Depends(obtenir_utilisateur_courant),
):
    """Liste filtrable des reçus/proformas — utilisée par le module Comptable (§8)."""
    base = obtenir_base()
    filtre: dict = {}
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

    curseur = base[Collections.VENTE_CLINIQUE].find(filtre).sort("Date Vente", -1)
    return [v async for v in curseur]


@router.get("/ventes/{reference}/pdf")
async def telecharger_pdf_recu(reference: str, utilisateur: dict = Depends(obtenir_utilisateur_courant)):
    base = obtenir_base()
    vente = await base[Collections.VENTE_CLINIQUE].find_one({"Référence": reference})
    if not vente:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vente introuvable.")
    patient = await base[Collections.PATIENT].find_one({"Numéro_Enreg": int(vente["Code Client"])})
    cabinet = await _obtenir_cabinet(base)

    pdf_octets = generer_pdf_recu(vente, patient or {}, cabinet, vente.get("Code Vendeur", ""))
    await base[Collections.VENTE_CLINIQUE].update_one({"Référence": reference}, {"$inc": {"NbImpressions": 1}})

    return Response(content=pdf_octets, media_type="application/pdf", headers={
        "Content-Disposition": f'inline; filename="{reference}.pdf"'
    })


@router.get("/etat-de-caisse/pdf")
async def telecharger_etat_de_caisse(
    date_debut: str,
    date_fin: str,
    caissier: Optional[str] = None,
    utilisateur: dict = Depends(obtenir_utilisateur_courant),
):
    base = obtenir_base()
    filtre: dict = {
        "Date Vente": {
            "$gte": datetime.fromisoformat(date_debut),
            "$lte": datetime.combine(datetime.fromisoformat(date_fin).date(), time.max),
        }
    }
    caissier_cible = caissier or utilisateur["Login"]
    filtre["Code Vendeur"] = caissier_cible

    recus = [v async for v in base[Collections.VENTE_CLINIQUE].find(filtre).sort("Date Vente", 1)]
    cabinet = await _obtenir_cabinet(base)

    pdf_octets = generer_pdf_etat_de_caisse(
        caissier_cible, datetime.fromisoformat(date_debut), datetime.fromisoformat(date_fin), recus, cabinet
    )
    return Response(content=pdf_octets, media_type="application/pdf", headers={
        "Content-Disposition": f'inline; filename="etat_caisse_{caissier_cible}.pdf"'
    })
