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
from app.utils.compteurs import prochain_numero, prochain_numero_recu, prochain_numero_cabinet
from app.utils.formatage import identite_patient_affichee
from app.utils.pdf_documents import generer_pdf_recu, generer_pdf_etat_de_caisse
from app.utils.audit import journaliser_action

router = APIRouter(prefix="/api/caisse", tags=["Caisse"])


class CreationVenteRequete(BaseModel):
    patient_numero_enreg: int
    lignes: list[LigneVente]
    type_document: str = "Reçu"  # "Reçu" (payé) ou "Proforma" (différé)
    # Le type de paiement précise TOUJOURS comment le patient règle le
    # montant NET de son reçu (§ demande utilisateur) — y compris quand une
    # assurance prend en charge le reste : ce n'est jamais remplacé par
    # "Assurance", qui est un complément (voir assurance_patient_numero_enreg).
    mode_reglement: Optional[str] = "Espèces"
    reference_paiement: Optional[str] = None  # référence de transaction (mobile money...), exigée selon le TypePaiement choisi
    dossier_examen_numero_enreg: Optional[int] = None  # rattache la vente à un dossier existant
    # Présence = ce reçu est pris en charge (en partie) par une assurance.
    # Interdit pour le Client CASH (§ demande utilisateur), vérifié ci-dessous.
    assurance_patient_numero_enreg: Optional[int] = None
    # § demande utilisateur : pour attacher une prise en charge, DEUX
    # informations sont désormais obligatoires — validées ci-dessous, pas
    # seulement côté interface, pour éviter tout contournement :
    #   - numero_bon : numéro du bon d'assurance, TOUJOURS numérique.
    #   - souscripteur : la personne physique ou morale ayant signé la
    #     convention avec la compagnie d'assurance (jamais le patient lui-même).
    numero_bon: Optional[int] = None
    souscripteur: Optional[str] = None
    # OBLIGATOIRE quel que soit le mode de règlement (même avec assurance) :
    # une clinique (hospitalière ou dentaire) doit toujours faire figurer
    # l'identité complète sur le reçu.
    identite_recu: IdentiteRecu


async def _obtenir_cabinet(base, cabinet_code: str) -> dict:
    cabinet = await base[Collections.CABINET].find_one({"code_cabinet": cabinet_code})
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
    cabinet_code = utilisateur["CodeCabinet"]

    patient = await base[Collections.PATIENT].find_one({"Numéro_Enreg": requete.patient_numero_enreg, "cabinet_code": cabinet_code})
    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient introuvable.")
    if not requete.lignes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Le panier est vide.")

    # Le Client CASH ne peut jamais avoir d'assurance (§ demande utilisateur)
    # — vérifié ici, pas seulement côté interface, pour éviter tout contournement.
    if requete.assurance_patient_numero_enreg and patient.get("EstClientCash"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Le Client CASH ne peut pas avoir d'assurance.")

    # § demande utilisateur : numéro de bon (numérique) et souscripteur
    # obligatoires dès qu'une prise en charge est attachée — validés ici,
    # jamais seulement côté interface.
    if requete.assurance_patient_numero_enreg:
        if requete.numero_bon is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Le numéro de bon est obligatoire pour attacher une prise en charge.")
        if not (requete.souscripteur or "").strip():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Le souscripteur est obligatoire pour attacher une prise en charge.")

    if requete.mode_reglement:
        type_paiement = await base[Collections.TYPE_PAIEMENT].find_one({"nom": requete.mode_reglement, "cabinet_code": cabinet_code})
        if type_paiement and type_paiement.get("exige_reference") and not (requete.reference_paiement or "").strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"La référence de transaction est obligatoire pour le mode de règlement « {requete.mode_reglement} ».",
            )

    # Quand le reçu est pris en charge par une assurance, c'est le "Prix
    # Second" (Prix Assurance) du catalogue qui s'applique — jamais le prix
    # envoyé par le client, toujours recalculé ici à partir du catalogue
    # pour éviter toute manipulation. Le montant qui en résulte est ensuite
    # réparti entre part patient et part assureur selon le %PC (plus bas).
    prix_assurance_par_code = {}
    if requete.assurance_patient_numero_enreg:
        codes = {ligne.code_produit for ligne in requete.lignes}
        curseur = base[Collections.PRODUIT_CLINIQUE].find({"Code Produit": {"$in": list(codes)}, "cabinet_code": cabinet_code})
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
    reference = await prochain_numero_recu(cabinet_code)
    maintenant = datetime.utcnow()
    identite = requete.identite_recu.model_dump(mode="json")
    # § demande utilisateur : l'ID_Patient est intégré à identite_recu pour
    # affichage sur le reçu ET dans les historiques ("Nom Prénoms (ID)") —
    # évite toute confusion entre homonymes.
    identite["id_patient"] = patient.get("ID_Patient")

    document = {
        "Numéro_Enreg": numero_enreg,
        "Référence": reference,
        "cabinet_code": cabinet_code,
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
        "RéfBon": requete.numero_bon,
        "souscripteur": requete.souscripteur,
    }
    await base[Collections.VENTE_CLINIQUE].insert_one(document)

    # Miroir dénormalisé dans A_Acheté (compatibilité legacy, une ligne par acte)
    lignes_a_achete = [
        {
            "Référence": reference, "cabinet_code": cabinet_code, "Code Produit": ligne["code_produit"], "Qte Livrée": ligne["quantite"],
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
            "cabinet_code": cabinet_code,
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

    # Si le reçu est pris en charge par une assurance, ouvre automatiquement
    # une demande de prise en charge avec calcul de la répartition
    # assureur/patient (réutilise la même logique que POST /api/assurances/prises-en-charge).
    prise_en_charge_creee = None
    if requete.assurance_patient_numero_enreg:
        lien = await base[Collections.ASSURANCE_PATIENT].find_one({"numero_enreg": requete.assurance_patient_numero_enreg, "cabinet_code": cabinet_code})
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
                "numero_enreg": numero_pec, "vente_reference": reference, "cabinet_code": cabinet_code,
                "assurance_patient_numero_enreg": requete.assurance_patient_numero_enreg,
                "montant_total": montant_total, "part_assureur": round(part_assureur, 2),
                "part_assure": round(part_assure, 2), "statut": "Demandée", "date_demande": maintenant,
                "numero_bon": requete.numero_bon, "souscripteur": requete.souscripteur.strip(),
            }
            await base[Collections.PRISE_EN_CHARGE].insert_one(dict(prise_en_charge_creee))
            await base[Collections.ASSURANCE_PATIENT].update_one(
                {"numero_enreg": lien["numero_enreg"]}, {"$inc": {"montant_consomme_annee": part_assureur}}
            )
            await base[Collections.VENTE_CLINIQUE].update_one(
                {"Référence": reference, "cabinet_code": cabinet_code},
                {"$set": {"PArtAssureur": round(part_assureur, 2), "PArtAssuré": round(part_assure, 2)}},
            )

    await journaliser_action(utilisateur["Login"], f"creation_{requete.type_document.lower()}", {"reference": reference, "montant": montant_total})

    document.pop("_id", None)
    if prise_en_charge_creee:
        document["prise_en_charge"] = prise_en_charge_creee
    return document


@router.post("/ventes/{reference}/encaisser")
async def encaisser_proforma(
    reference: str,
    montant: Optional[float] = None,
    mode_reglement: Optional[str] = None,
    reference_paiement: Optional[str] = None,
    utilisateur: dict = Depends(exiger_role("Caissier")),
):
    """
    Transforme une proforma en reçu, en totalité ou en partie.

    § demande utilisateur : un encaissement avec RAP nécessite d'avoir
    d'abord ouvert le détail du reçu (voir GET /ventes/{reference}) pour
    voir les lignes et confirmer/ajuster le montant réellement encaissé —
    ce endpoint accepte donc un montant PARTIEL (`montant`), cumulé sur les
    encaissements déjà reçus (`MontantRéglé`). Sans `montant` fourni, encaisse
    le reste à payer en totalité (comportement historique, rétrocompatible).
    Le reçu ne devient "Réglé" (type_document="Reçu") qu'une fois le montant
    cumulé réglé atteint le total — tant qu'il reste un RAP, il demeure une
    Proforma, encaissable à nouveau plus tard (encaissements échelonnés).
    """
    base = obtenir_base()
    vente = await base[Collections.VENTE_CLINIQUE].find_one({"Référence": reference, "cabinet_code": utilisateur["CodeCabinet"]})
    if not vente:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vente introuvable.")
    if vente.get("annule"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Ce reçu est annulé.")

    deja_regle = vente.get("MontantRéglé", 0) or 0
    reste_a_payer = round(vente["Montant"] - deja_regle, 2)
    if reste_a_payer <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Ce reçu est déjà intégralement réglé.")

    montant_encaisse = reste_a_payer if montant is None else round(montant, 2)
    if montant_encaisse <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Le montant encaissé doit être positif.")
    if montant_encaisse > reste_a_payer + 0.01:  # tolérance d'arrondi flottant
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Le montant encaissé ({montant_encaisse:,.0f}) dépasse le reste à payer ({reste_a_payer:,.0f}).")

    nouveau_montant_regle = round(deja_regle + montant_encaisse, 2)
    integralement_regle = nouveau_montant_regle >= vente["Montant"] - 0.01
    valeurs = {"MontantRéglé": nouveau_montant_regle, "Réglé": 1 if integralement_regle else 0, "type_document": "Reçu" if integralement_regle else "Proforma"}
    if mode_reglement:
        valeurs["mode_reglement"] = mode_reglement
    if reference_paiement:
        valeurs["reference_paiement"] = reference_paiement
    await base[Collections.VENTE_CLINIQUE].update_one({"Référence": reference, "cabinet_code": utilisateur["CodeCabinet"]}, {"$set": valeurs})
    await journaliser_action(utilisateur["Login"], "encaissement_proforma", {"reference": reference, "montant_encaisse": montant_encaisse, "solde": integralement_regle})
    return {"statut": "encaissé", "montant_encaisse": montant_encaisse, "reste_a_payer": round(vente["Montant"] - nouveau_montant_regle, 2), "integralement_regle": integralement_regle}


@router.put("/ventes/{reference}")
async def modifier_vente(reference: str, requete: CreationVenteRequete, utilisateur: dict = Depends(exiger_role("Caissier"))):
    """
    § demande utilisateur : corrige un reçu/proforma PAS ENCORE payé
    (identité mal orthographiée, rattachement à une assurance, dents/actes
    du schéma) — réutilise exactement le même formulaire que "Nouveau reçu",
    en mode édition, plutôt qu'une modale séparée.

    Restreint aux reçus dont RIEN n'a encore été réglé (MontantRéglé == 0) :
    au-delà, changer le contenu remettrait en cause un encaissement déjà
    perçu — refusé explicitement plutôt que de tenter une réconciliation
    hasardeuse.

    Ne re-synchronise PAS le miroir A_Acheté ni l'archive du schéma dentaire
    (Pièces_Scannées_Utilisateurs) : ceux-ci restent l'instantané de la
    création initiale — simplification assumée, ce ne sont pas les documents
    de référence pour la facturation (le document VenteClinique l'est).
    """
    base = obtenir_base()
    cabinet_code = utilisateur["CodeCabinet"]
    existante = await base[Collections.VENTE_CLINIQUE].find_one({"Référence": reference, "cabinet_code": cabinet_code})
    if not existante:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reçu introuvable.")
    if existante.get("annule"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Impossible de modifier un reçu annulé.")
    if (existante.get("MontantRéglé", 0) or 0) > 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Impossible de modifier ce reçu : un encaissement a déjà été enregistré dessus.")

    patient = await base[Collections.PATIENT].find_one({"Numéro_Enreg": requete.patient_numero_enreg, "cabinet_code": cabinet_code})
    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient introuvable.")
    if not requete.lignes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Le panier est vide.")
    if requete.assurance_patient_numero_enreg and patient.get("EstClientCash"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Le Client CASH ne peut pas avoir d'assurance.")

    # § demande utilisateur : numéro de bon (numérique) et souscripteur
    # obligatoires dès qu'une prise en charge est attachée — validés ici,
    # jamais seulement côté interface.
    if requete.assurance_patient_numero_enreg:
        if requete.numero_bon is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Le numéro de bon est obligatoire pour attacher une prise en charge.")
        if not (requete.souscripteur or "").strip():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Le souscripteur est obligatoire pour attacher une prise en charge.")

    if requete.mode_reglement:
        type_paiement = await base[Collections.TYPE_PAIEMENT].find_one({"nom": requete.mode_reglement, "cabinet_code": cabinet_code})
        if type_paiement and type_paiement.get("exige_reference") and not (requete.reference_paiement or "").strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"La référence de transaction est obligatoire pour le mode de règlement « {requete.mode_reglement} ».",
            )

    prix_assurance_par_code = {}
    if requete.assurance_patient_numero_enreg:
        codes = {ligne.code_produit for ligne in requete.lignes}
        curseur = base[Collections.PRODUIT_CLINIQUE].find({"Code Produit": {"$in": list(codes)}, "cabinet_code": cabinet_code})
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

    identite = requete.identite_recu.model_dump(mode="json")
    identite["id_patient"] = patient.get("ID_Patient")

    valeurs = {
        "Code Client": str(requete.patient_numero_enreg),
        "Libellé": f"{identite['nom']} {identite['prenoms']}".strip(),
        "identite_recu": identite,
        "Montant": round(montant_total, 2),
        "type_document": requete.type_document,
        "mode_reglement": requete.mode_reglement,
        "reference_paiement": requete.reference_paiement,
        "lignes": lignes_calculees,
        "PArtAssureur": None,
        "PArtAssuré": None,
        "RéfBon": requete.numero_bon,
        "souscripteur": requete.souscripteur,
    }

    # § une éventuelle prise en charge assurance précédente est annulée (et
    # sa consommation restituée) avant d'en recréer une nouvelle le cas
    # échéant — jamais deux prises en charge actives pour le même reçu.
    ancienne_pec = await base[Collections.PRISE_EN_CHARGE].find_one({"vente_reference": reference, "cabinet_code": cabinet_code, "statut": "Demandée"})
    if ancienne_pec:
        await base[Collections.ASSURANCE_PATIENT].update_one(
            {"numero_enreg": ancienne_pec["assurance_patient_numero_enreg"], "cabinet_code": cabinet_code},
            {"$inc": {"montant_consomme_annee": -ancienne_pec.get("part_assureur", 0)}},
        )
        await base[Collections.PRISE_EN_CHARGE].update_one({"numero_enreg": ancienne_pec["numero_enreg"]}, {"$set": {"statut": "Annulée"}})

    if requete.assurance_patient_numero_enreg:
        lien = await base[Collections.ASSURANCE_PATIENT].find_one({"numero_enreg": requete.assurance_patient_numero_enreg, "cabinet_code": cabinet_code})
        if lien:
            pourcentage = lien.get("pourcentage_prise_en_charge", 80)
            part_assureur = montant_total * pourcentage / 100
            plafond = lien.get("plafond_annuel")
            consomme = lien.get("montant_consomme_annee", 0)
            if plafond is not None and consomme + part_assureur > plafond:
                part_assureur = max(0, plafond - consomme)
            part_assure = montant_total - part_assureur
            numero_pec = await prochain_numero("PriseEnCharge", valeur_depart=1000)
            await base[Collections.PRISE_EN_CHARGE].insert_one({
                "numero_enreg": numero_pec, "vente_reference": reference, "cabinet_code": cabinet_code,
                "assurance_patient_numero_enreg": requete.assurance_patient_numero_enreg,
                "montant_total": montant_total, "part_assureur": round(part_assureur, 2),
                "part_assure": round(part_assure, 2), "statut": "Demandée", "date_demande": datetime.utcnow(),
                "numero_bon": requete.numero_bon, "souscripteur": requete.souscripteur.strip(),
            })
            await base[Collections.ASSURANCE_PATIENT].update_one({"numero_enreg": lien["numero_enreg"]}, {"$inc": {"montant_consomme_annee": part_assureur}})
            valeurs["PArtAssureur"] = round(part_assureur, 2)
            valeurs["PArtAssuré"] = round(part_assure, 2)

    await base[Collections.VENTE_CLINIQUE].update_one({"Référence": reference, "cabinet_code": cabinet_code}, {"$set": valeurs})
    await journaliser_action(utilisateur["Login"], "modification_recu", {"reference": reference})
    vente = await base[Collections.VENTE_CLINIQUE].find_one({"Référence": reference, "cabinet_code": cabinet_code})
    vente.pop("_id", None)
    vente["patient_affiche"] = identite_patient_affichee(vente)
    return vente


@router.post("/ventes/{reference}/dupliquer", status_code=status.HTTP_201_CREATED)
async def dupliquer_vente(reference: str, utilisateur: dict = Depends(exiger_role("Caissier"))):
    """
    § demande utilisateur : duplique un reçu sous une nouvelle référence —
    reprend EXACTEMENT ce qui a été facturé à l'origine (lignes, montants,
    identité), jamais recalculé depuis le catalogue actuel (dont les prix
    peuvent avoir changé depuis). Utile en cas de reçu perdu/à réimprimer
    avec une nouvelle traçabilité propre, sans reconstituer toute la vente.
    """
    base = obtenir_base()
    cabinet_code = utilisateur["CodeCabinet"]
    originale = await base[Collections.VENTE_CLINIQUE].find_one({"Référence": reference, "cabinet_code": cabinet_code})
    if not originale:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reçu introuvable.")
    if originale.get("annule"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Impossible de dupliquer un reçu annulé.")

    numero_enreg = await prochain_numero("VenteClinique", valeur_depart=10000)
    nouvelle_reference = await prochain_numero_recu(cabinet_code)
    maintenant = datetime.utcnow()
    copie = {
        k: v for k, v in originale.items()
        if k not in ("_id", "Référence", "Numéro_Enreg", "Date Vente", "DateHeure_Création", "NbImpressions", "annule", "date_annulation", "annule_par", "Réglé", "MontantRéglé", "type_document")
    }
    # § demande utilisateur : un reçu dupliqué ne porte AUCUNE information de
    # paiement — il redevient une Proforma (Réglé=0, MontantRéglé=0), à
    # encaisser à nouveau explicitement (voir POST /ventes/{reference}/encaisser).
    # Tant qu'il n'est pas intégralement payé, il ne peut être ouvert QUE pour
    # être complété/encaissé — jamais consulté/imprimé comme un reçu final.
    copie.update({
        "Numéro_Enreg": numero_enreg, "Référence": nouvelle_reference, "Date Vente": maintenant,
        "DateHeure_Création": maintenant, "NbImpressions": 0, "Code Vendeur": utilisateur["Login"],
        "duplique_de": reference, "Réglé": 0, "MontantRéglé": 0, "type_document": "Proforma",
    })
    await base[Collections.VENTE_CLINIQUE].insert_one(copie)
    await journaliser_action(utilisateur["Login"], "duplication_recu", {"reference_originale": reference, "nouvelle_reference": nouvelle_reference}, cabinet_code=cabinet_code)
    copie.pop("_id", None)
    return copie


@router.put("/ventes/{reference}/annuler")
async def annuler_vente(reference: str, utilisateur: dict = Depends(exiger_role("Caissier"))):
    """
    § demande utilisateur : annule un reçu — son montant n'entre plus dans
    les totaux de l'état de caisse, mais il y reste visible (barré) pour la
    traçabilité (voir generer_pdf_etat_de_caisse). Réservé aux comptes
    habilités (droit PeutSupprimerRecu) ou à l'Administrateur, pas à tout
    caissier — un reçu annulé reste une action sensible.
    """
    if not utilisateur.get("PeutSupprimerRecu") and utilisateur.get("role") != "Administrateur":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Vous n'avez pas le droit d'annuler un reçu.")
    base = obtenir_base()
    cabinet_code = utilisateur["CodeCabinet"]
    vente = await base[Collections.VENTE_CLINIQUE].find_one({"Référence": reference, "cabinet_code": cabinet_code})
    if not vente:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reçu introuvable.")
    if vente.get("annule"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Ce reçu est déjà annulé.")

    maintenant = datetime.utcnow()
    await base[Collections.VENTE_CLINIQUE].update_one(
        {"Référence": reference, "cabinet_code": cabinet_code},
        {"$set": {"annule": True, "date_annulation": maintenant, "annule_par": utilisateur["Login"]}},
    )
    await journaliser_action(utilisateur["Login"], "annulation_recu", {"reference": reference}, cabinet_code=cabinet_code)
    return {"statut": "annulé"}


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
    filtre: dict = {"cabinet_code": utilisateur["CodeCabinet"]}
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
    ventes = [v async for v in curseur]
    for v in ventes:
        # § demande utilisateur : identité patient complète (nom, prénoms,
        # ID entre parenthèses) affichée directement — évite toute
        # confusion entre homonymes, sans recalcul côté frontend.
        v["patient_affiche"] = identite_patient_affichee(v)
        v["reste_a_payer"] = round((v.get("Montant", 0) or 0) - (v.get("MontantRéglé", 0) or 0), 2)
    return ventes


@router.get("/ventes/{reference}")
async def obtenir_vente(reference: str, utilisateur: dict = Depends(obtenir_utilisateur_courant)):
    """
    § demande utilisateur : détail complet d'un reçu (lignes, identité,
    montants) — utilisé par la modale "Encaisser" pour ne jamais encaisser
    à l'aveugle un reçu avec RAP sans en avoir d'abord vu le contenu, et par
    le mode "modification" de la page Caisse (édition de l'identité, de
    l'assurance rattachée et des actes/dents avant paiement).
    """
    base = obtenir_base()
    vente = await base[Collections.VENTE_CLINIQUE].find_one({"Référence": reference, "cabinet_code": utilisateur["CodeCabinet"]})
    if not vente:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reçu introuvable.")
    vente["patient_affiche"] = identite_patient_affichee(vente)
    vente["reste_a_payer"] = round((vente.get("Montant", 0) or 0) - (vente.get("MontantRéglé", 0) or 0), 2)
    # § le document VenteClinique ne stocke pas directement le lien
    # assurance_patient (seulement les montants PArtAssureur/PArtAssuré déjà
    # calculés) — résolu ici depuis la PriseEnCharge active, pour que le
    # mode édition puisse pré-cocher/pré-sélectionner l'assurance d'origine.
    pec = await base[Collections.PRISE_EN_CHARGE].find_one({"vente_reference": reference, "cabinet_code": utilisateur["CodeCabinet"], "statut": "Demandée"})
    vente["assurance_patient_numero_enreg"] = pec["assurance_patient_numero_enreg"] if pec else None
    vente["numero_bon"] = pec.get("numero_bon") if pec else None
    vente["souscripteur"] = pec.get("souscripteur") if pec else None
    return vente


@router.get("/ventes/{reference}/pdf")
async def telecharger_pdf_recu(reference: str, utilisateur: dict = Depends(obtenir_utilisateur_courant)):
    base = obtenir_base()
    vente = await base[Collections.VENTE_CLINIQUE].find_one({"Référence": reference, "cabinet_code": utilisateur["CodeCabinet"]})
    if not vente:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vente introuvable.")
    # § demande utilisateur : un reçu DUPLIQUÉ et non intégralement payé ne
    # peut être ouvert pour consultation — seul l'encaissement (POST
    # .../encaisser) est disponible tant qu'il reste un reste à payer.
    if vente.get("duplique_de") and not vente.get("Réglé"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ce reçu dupliqué n'est pas encore payé — encaissez-le d'abord avant de pouvoir le consulter.",
        )
    patient = await base[Collections.PATIENT].find_one({"Numéro_Enreg": int(vente["Code Client"]), "cabinet_code": utilisateur["CodeCabinet"]})
    cabinet = await _obtenir_cabinet(base, utilisateur["CodeCabinet"])

    pdf_octets = generer_pdf_recu(vente, patient or {}, cabinet, vente.get("Code Vendeur", ""))
    await base[Collections.VENTE_CLINIQUE].update_one({"Référence": reference, "cabinet_code": utilisateur["CodeCabinet"]}, {"$inc": {"NbImpressions": 1}})

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
        "cabinet_code": utilisateur["CodeCabinet"],
        "Date Vente": {
            "$gte": datetime.fromisoformat(date_debut),
            "$lte": datetime.combine(datetime.fromisoformat(date_fin).date(), time.max),
        }
    }
    caissier_cible = caissier or utilisateur["Login"]
    filtre["Code Vendeur"] = caissier_cible

    recus = [v async for v in base[Collections.VENTE_CLINIQUE].find(filtre).sort("Date Vente", 1)]
    cabinet = await _obtenir_cabinet(base, utilisateur["CodeCabinet"])

    pdf_octets = generer_pdf_etat_de_caisse(
        caissier_cible, datetime.fromisoformat(date_debut), datetime.fromisoformat(date_fin), recus, cabinet
    )
    return Response(content=pdf_octets, media_type="application/pdf", headers={
        "Content-Disposition": f'inline; filename="etat_caisse_{caissier_cible}.pdf"'
    })
