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
from app.models.vente_clinique import LigneVente, IdentiteRecu
from app.utils.compteurs import prochain_numero, prochain_numero_recu
from app.utils.pdf_documents import generer_pdf_recu, generer_pdf_etat_de_caisse
from app.utils.audit import journaliser_action

router = APIRouter(prefix="/api/caisse", tags=["Caisse"])


class CreationVenteRequete(BaseModel):
    patient_numero_enreg: int
    lignes: list[LigneVente]
    type_document: str = "Reçu"  # "Reçu" (payé) ou "Proforma" (différé)
    mode_reglement: Optional[str] = "Espèces"
    reference_paiement: Optional[str] = None  # référence de transaction (mobile money...), exigée selon le TypePaiement choisi
    dossier_examen_numero_enreg: Optional[int] = None  # rattache la vente à un dossier existant
    assurance_patient_numero_enreg: Optional[int] = None  # requis si mode_reglement == "Assurance"
    # OBLIGATOIRE quel que soit le mode de règlement (même Assurance) : une
    # clinique (hospitalière ou dentaire) doit toujours faire figurer
    # l'identité complète sur le reçu.
    identite_recu: IdentiteRecu


async def _obtenir_cabinet(base) -> dict:
    cabinet = await base[Collections.CABINET].find_one({})
    return cabinet or {"denomination": "SAWALI DentalCare", "devise": "FCFA", "adresse": "Ouagadougou, Burkina Faso"}


@router.post("/ventes", status_code=status.HTTP_201_CREATED)
async def creer_vente(requete: CreationVenteRequete, utilisateur: dict = Depends(exiger_role("Caissier"))):
    """
    Crée un reçu ou une proforma à partir du panier (§4b-d). Le montant total
    est recalculé côté serveur (jamais fait confiance au montant envoyé par
    le client) pour éviter toute manipulation. L'identité complète
    (identite_recu) est obligatoire et validée par Pydantic (IdentiteRecu),
    quel que soit le mode de règlement. Si le mode de règlement choisi
    correspond à un TypePaiement paramétré avec "exige_reference", la
    référence de transaction est obligatoire (validée ici, pas seulement
    côté interface, pour éviter tout contournement).
    """
    base = obtenir_base()

    patient = await base[Collections.PATIENT].find_one({"Numéro_Enreg": requete.patient_numero_enreg})
    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient introuvable.")
    if not requete.lignes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Le panier est vide.")

    if requete.mode_reglement and requete.mode_reglement != "Assurance":
        type_paiement = await base[Collections.TYPE_PAIEMENT].find_one({"nom": requete.mode_reglement})
        if type_paiement and type_paiement.get("exige_reference") and not (requete.reference_paiement or "").strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"La référence de transaction est obligatoire pour le mode de règlement « {requete.mode_reglement} ».",
            )

    # Quand le règlement se fait par assurance, c'est le "Prix Second" (Prix
    # Assurance) du catalogue qui s'applique — jamais le prix envoyé par le
    # client, toujours recalculé ici à partir du catalogue pour éviter toute
    # manipulation. Le montant qui en résulte est ensuite réparti entre
    # part patient et part assureur selon le %PC de l'assurance (plus bas).
    prix_assurance_par_code = {}
    if requete.mode_reglement == "Assurance":
        codes = {ligne.code_produit for ligne in requete.lignes}
        curseur = base[Collections.PRODUIT_CLINIQUE].find({"Code Produit": {"$in": list(codes)}})
        async for produit in curseur:
            prix_second = produit.get("Prix Second")
            if prix_second is not None:
                prix_assurance_par_code[produit["Code Produit"]] = prix_second

    lignes_calculees = []
    montant_total = 0.0
    for ligne in requete.lignes:
        prix_unitaire_effectif = prix_assurance_par_code.get(ligne.code_produit, ligne.prix_unitaire)
        sous_total = ligne.quantite * prix_unitaire_effectif * (1 - ligne.pourcentage_remise / 100)
        ligne_dict = ligne.model_dump()
        ligne_dict["prix_unitaire"] = prix_unitaire_effectif
        ligne_dict["sous_total"] = round(sous_total, 2)
        lignes_calculees.append(ligne_dict)
        montant_total += sous_total

    numero_enreg = await prochain_numero("VenteClinique", valeur_depart=10000)
    reference = await prochain_numero_recu()
    maintenant = datetime.utcnow()
    identite = requete.identite_recu.model_dump(mode="json")

    document = {
        "Numéro_Enreg": numero_enreg,
        "Référence": reference,
        "Code Client": str(requete.patient_numero_enreg),
        "Date Vente": maintenant,
        "DateHeure_Création": maintenant,
        "Code Vendeur": utilisateur["Login"],
        "Libellé": f"{identite['nom']} {identite['prenoms']}".strip(),
        "identite_recu": identite,
        "Montant": round(montant_total, 2),
        "Réglé": 1 if requete.type_document == "Reçu" else 0,
        "MontantRéglé": round(montant_total, 2) if requete.type_document == "Reçu" else 0,
        "Caisse": "CAISSE1",
        "Dossier": requete.dossier_examen_numero_enreg,
        "DuréeValidité": 15,
        "NbImpressions": 0,
        "type_document": requete.type_document,
        "mode_reglement": requete.mode_reglement,
        "reference_paiement": requete.reference_paiement,
        "lignes": lignes_calculees,
    }
    await base[Collections.VENTE_CLINIQUE].insert_one(document)

    # Miroir dénormalisé dans A_Acheté (compatibilité legacy, une ligne par acte)
    lignes_a_achete = [
        {
            "Référence": reference, "Code Produit": ligne["code_produit"], "Qte Livrée": ligne["quantite"],
            "Prix Public": ligne["prix_unitaire"], "Réduction": ligne["pourcentage_remise"],
            "Domaine": ligne.get("domaine"), "Date_Sortie": maintenant, "Realisé_par": utilisateur["Login"],
            "numero_dent_international": ligne.get("numero_dent_international"),
            "numero_dent_universel": ligne.get("numero_dent_universel"),
        }
        for ligne in lignes_calculees
    ]
    if lignes_a_achete:
        await base[Collections.A_ACHETE].insert_many(lignes_a_achete)

    # Archive le schéma dentaire de ce reçu dans Pièces_Scannées_Utilisateurs
    # (§ demande utilisateur), sous le numéro de reçu — pour qu'à l'ouverture
    # du dossier patient par le Dentiste, le schéma puisse être rechargé tel
    # qu'il était au moment de ce reçu si c'est l'enregistrement le plus
    # récent pour ce patient (voir GET /patients/{numero}/dernier-schema-dentaire).
    lignes_avec_dent = [l for l in lignes_calculees if l.get("numero_dent_international")]
    if lignes_avec_dent:
        numero_piece = await prochain_numero("Pièces_Scannées_Utilisateurs", valeur_depart=100000)
        await base[Collections.PIECES_SCANNEES].insert_one({
            "N° Enr.": numero_piece,
            "IDPiècescannée": numero_piece,
            "Date_Heure": maintenant,
            "Observations": f"{reference}_0",
            "Machine": "CAISSE.RECUS",
            "Propriétaire": requete.patient_numero_enreg,
            "Ouvert": 0,
            "Enregistrement": 1,
            # Champs ajoutés pour ce projet :
            "reference_recu": reference,
            "patient_numero_enreg": requete.patient_numero_enreg,
            "type_document": requete.type_document,
            "lignes_schema": [
                {
                    "numero_dent": l["numero_dent_international"],
                    "code_produit": l["code_produit"],
                    "libelle": l["libelle"],
                    "domaine": l.get("domaine"),
                }
                for l in lignes_avec_dent
            ],
        })

    # Si le règlement se fait via une assurance, ouvre automatiquement une
    # demande de prise en charge avec calcul de la répartition assureur/patient
    # (réutilise la même logique que POST /api/assurances/prises-en-charge).
    prise_en_charge_creee = None
    if requete.mode_reglement == "Assurance" and requete.assurance_patient_numero_enreg:
        lien = await base[Collections.ASSURANCE_PATIENT].find_one({"numero_enreg": requete.assurance_patient_numero_enreg})
        if lien:
            pourcentage = lien.get("pourcentage_prise_en_charge", 80)
            part_assureur = montant_total * pourcentage / 100
            plafond = lien.get("plafond_annuel")
            consomme = lien.get("montant_consomme_annee", 0)
            if plafond is not None and consomme + part_assureur > plafond:
                part_assureur = max(0, plafond - consomme)
            part_assure = montant_total - part_assureur

            numero_pec = await prochain_numero("PriseEnCharge", valeur_depart=1000)
            prise_en_charge_creee = {
                "numero_enreg": numero_pec, "vente_reference": reference,
                "assurance_patient_numero_enreg": requete.assurance_patient_numero_enreg,
                "montant_total": montant_total, "part_assureur": round(part_assureur, 2),
                "part_assure": round(part_assure, 2), "statut": "Demandée", "date_demande": maintenant,
            }
            await base[Collections.PRISE_EN_CHARGE].insert_one(dict(prise_en_charge_creee))
            await base[Collections.ASSURANCE_PATIENT].update_one(
                {"numero_enreg": lien["numero_enreg"]}, {"$inc": {"montant_consomme_annee": part_assureur}}
            )
            await base[Collections.VENTE_CLINIQUE].update_one(
                {"Référence": reference},
                {"$set": {"PArtAssureur": round(part_assureur, 2), "PArtAssuré": round(part_assure, 2)}},
            )

    await journaliser_action(utilisateur["Login"], f"creation_{requete.type_document.lower()}", {"reference": reference, "montant": montant_total})

    document.pop("_id", None)
    if prise_en_charge_creee:
        document["prise_en_charge"] = prise_en_charge_creee
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
