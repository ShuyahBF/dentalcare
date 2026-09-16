"""
scripts/seed_donnees_initiales.py
------------------------------------
Script à exécuter UNE FOIS pour initialiser la base MongoDB Atlas avec :
  1) Le catalogue des 56 actes fournis (ProduitClinique), avec les prix à 0
     complétés par des tarifs de référence cohérents avec le marché
     ouest-africain, PLUS 11 actes courants dans les cabinets dentaires
     modernes qui manquaient à la liste initiale (67 actes au total).
  2) La fiche "Cabinet" par défaut.
  3) 5 comptes de démonstration, un par rôle.

Exécution :
    cd backend
    python -m scripts.seed_donnees_initiales
"""

import asyncio

from motor.motor_asyncio import AsyncIOMotorClient

from app.core.config import settings
from app.core.security import hacher_mot_de_passe
from app.utils.suggestions_md import parser_suggestion_md

# --- 1) Catalogue des actes ---
# Les 56 actes transmis par l'utilisateur (prix à 0 remplacés par une
# estimation raisonnable, signalée par le commentaire "# complété").
CATALOGUE_ACTES = [
    (1, "CONSULTATION", 10000, "CONS"),
    (2, "RADIOGRAPHIE RETRO-ALVEOLAIRE", 5000, "CONS"),
    (3, "CONSULTATION D'URGENCE+RADIO", 20000, "CONS"),
    (4, "CERTIFICAT MEDICAL", 5000, "CONS"),  # complété
    (5, "SOINS D'URGENCE", 15000, "CONSV"),
    (6, "OBTURATION A L'AMALGAME [1 FACE]", 15000, "CONSV"),
    (7, "OBTURATION A L'AMALGAME [2 FACES]", 20000, "CONSV"),
    (8, "OBTURATION A L'AMALGAME [3 FACES]", 25000, "CONSV"),  # complété
    (9, "OBTURATION A L'AMALGAME (AVEC TENON RADICULAIRE)", 30000, "CONSV"),
    (10, "OBTURATION A L'AMALGAME SUR DENT DE LAIT", 15000, "CONSV"),
    (11, "OBTURATION AUX COMPOSITES [1 FACE]", 20000, "CONSV"),  # complété
    (12, "OBTURATION AUX COMPOSITES [2 FACES]", 75000, "CONSV"),
    (13, "OBTURATION AUX COMPOSITES [3 FACES] AVEC TENON RADICULAIRE", 90000, "CONSV"),  # complété
    (14, "OBTURATION AUX COMPOSITES RECONSTITUTION CORONAIRE TOTALE", 60000, "CONSV"),  # complété
    (15, "OBTURATION AUX COMPOSITES TRAITEMENT MYLOLYSES", 35000, "CONSV"),  # complété
    (16, "OBTURATION AUX COMPOSITES SUR DENT DE LAIT", 20000, "CONSV"),  # complété
    (17, "OBTURATION AUX CV1 [1 FACE]", 15000, "CONSV"),  # complété
    (18, "OBTURATION AUX CV1 [2 FACES]", 20000, "CONSV"),  # complété
    (19, "OBTURATION AUX CV1 [3 FACES]", 25000, "CONSV"),  # complété
    (20, "OBTURATION AUX CV1 SUR DENT DE LAIT", 15000, "CONSV"),  # complété
    (21, "GROUPE INCISIVO-CANIN (traitement de canal)", 25000, "SCANAL"),
    (22, "GROUPE PREMOLAIRE (traitement de canal)", 40000, "SCANAL"),
    (23, "SOIN D'URGENCE (PANSEMENT, PULPÉRYL, ETC)", 15000, "CONSV"),
    (24, "OBTURATION D'AMALGAME (3 FACES)", 25000, "CONSV"),
    (25, "OBTURATION AUX CVI (1 FACE)", 20000, "CONSV"),
    (26, "OBTURATION AU CVI (2 FACES)", 30000, "CONSV"),
    (27, "OBTURATION AU CVI (3 FACES)", 30000, "CONSV"),
    (28, "OBTURATION AU CVI SUR DENT DE LAIT", 15000, "CONSV"),
    (29, "GROUPE MOLAIRE (traitement de canal)", 50000, "SCANAL"),
    (30, "EXTRACTION MONORADICULÉE", 30000, "SCHIRU"),
    (31, "EXTRACTION PLURIRADICULÉE", 40000, "SCHIRU"),
    (32, "EXTRACTION DENT DE SAGESSE", 50000, "SCHIRU"),
    (33, "ALVÉOLECTOMIE", 50000, "SCHIRU"),
    (34, "EXTRACTION CHIRURGICALE (DENT ENCLAVÉE, DENT INCLUSE...)", 40000, "SCHIRU"),
    (35, "DÉCAPUCHONNAGE/GINGIVECTOMIE", 20000, "SCHIRU"),
    (36, "EXTRACTION DENT DE LAIT", 15000, "SCHIRU"),
    (37, "DÉTARTRAGE", 25000, "SPARAD"),
    (38, "CURETAGE/CADRAN", 20000, "SPARAD"),
    (39, "ATTOUCHEMENT (ATA)", 15000, "SPARAD"),
    (40, "GOUTTIÈRE OCCLUSALE", 60000, "SPARAD"),
    (41, "CONTENTION AU COMPOSITE", 20000, "SPARAD"),
    (42, "TRAITEMENT DE SENSIBILITÉ", 10000, "SPARAD"),
    (43, "LIGATURE", 15000, "SPARAD"),  # complété
    (44, "PROTHÈSE CONJOINTE COURONNE COULÉE", 150000, "PROTHE"),
    (45, "PROTHÈSE CONJOINTE COURONNE CÉRAMO-MÉTALLIQUE (CCM)", 250000, "PROTHE"),
    (46, "PROTHÈSE CONJOINTE COURONNE CÉRAMO-CERAMIQUE (CCC)", 300000, "PROTHE"),
    (47, "PROTHÈSE CONJOINTE BRIDGE (SUR DEVIS)", 0, "PROTHE"),  # reste sur devis, volontairement
    (48, "PROTHÈSE ADJOINTE SOUPLE (VALPLAST) 1-2 DENTS", 150000, "PROTHE"),
    (49, "PROTHÈSE ADJOINTE SOUPLE (VALPLAST) 3-4 DENTS", 175000, "PROTHE"),  # complété (progression cohérente)
    (50, "PROTHÈSE ADJOINTE (VALPLAST) 5-6 DENTS", 200000, "PROTHE"),
    (51, "PROTHÈSE ADJOINTE SOUPLE (VALPLAST) 7-8 DENTS", 225000, "PROTHE"),
    (52, "PROTHÈSE ADJOINTE SOUPLE (VALPLAST) 9-10 DENTS", 250000, "PROTHE"),
    (53, "PROTHÈSE ADJOINTE SOUPLE (VALPLAST) PLUS DE 10 DENTS", 275000, "PROTHE"),  # complété
    (54, "PROTHÈSE ADJOINTE SOUPLE (VALPLAST) TOTALE", 300000, "PROTHE"),
    (55, "PROTHÈSE MÉDICALE (STELLITE) PLAQUE NUE", 200000, "PROTHE"),
    (56, "PROTHÈSE MÉTALLIQUE (STELLITE) + PRIX PROTHÈSE AMOVIBLE", 50000, "PROTHE"),  # complété (supplément)

    # --- Actes complémentaires "meilleures pratiques mondiales", absents de la liste initiale ---
    (57, "DÉTARTRAGE + POLISSAGE COMPLET", 30000, "SPARAD"),
    (58, "SCELLEMENT DE SILLONS (PAR DENT, PRÉVENTION CARIE ENFANT)", 8000, "CONSV"),
    (59, "APPLICATION DE FLUOR (PRÉVENTION)", 10000, "CONSV"),
    (60, "BLANCHIMENT DENTAIRE AU FAUTEUIL", 100000, "SPARAD"),
    (61, "RADIOGRAPHIE PANORAMIQUE", 15000, "CONS"),
    (62, "POSE D'IMPLANT DENTAIRE (UNITAIRE, SUR DEVIS)", 0, "SCHIRU"),
    (63, "PILIER + COURONNE SUR IMPLANT", 350000, "PROTHE"),
    (64, "TRAITEMENT PARODONTAL PROFOND (SURFAÇAGE RADICULAIRE, PAR QUADRANT)", 35000, "SPARAD"),
    (65, "CONSULTATION DE SUIVI / CONTRÔLE POST-OPÉRATOIRE", 5000, "CONS"),
    (66, "FACETTE CÉRAMIQUE (UNITAIRE)", 200000, "PROTHE"),
    (67, "GOUTTIÈRE DE BLANCHIMENT SUR MESURE", 50000, "PROTHE"),
]

# --- 2) Fiche cabinet par défaut ---
CABINET_PAR_DEFAUT = {
    "denomination": "SAWALI DentalCare",
    "adresse": "Ouagadougou, Burkina Faso",
    "devise": "FCFA",
    "prefixe_numero_recu": "R-",
    "duree_validite_proforma_jours": 15,
    "fuseau_horaire": "Africa/Ouagadougou",
    "delai_rappel_controle_mois": 6,
    "canal_rappel_prefere": "WhatsApp",
}

# --- 3) Comptes de démonstration (un par rôle) ---
# ATTENTION : mots de passe de démonstration à CHANGER immédiatement en
# production, depuis le module Administrateur, comme convenu.
# --- Modes de règlement par défaut (paramétrables ensuite depuis l'Administration) ---
TYPES_PAIEMENT_PAR_DEFAUT = [
    {"nom": "Espèces", "exige_reference": False},
    {"nom": "Orange Money", "exige_reference": True},
    {"nom": "Moov Money", "exige_reference": True},
]

COMPTES_DEMO = [
    {"login": "admin", "mot_de_passe": "Admin2026!", "role": "Administrateur", "nom_complet": "Administrateur SAWALI"},
    {"login": "caissier1", "mot_de_passe": "Caisse2026!", "role": "Caissier", "nom_complet": "Caissier Démo"},
    {"login": "secretariat1", "mot_de_passe": "Secret2026!", "role": "Secrétariat Cabinet", "nom_complet": "Secrétariat Démo"},
    {"login": "dentiste1", "mot_de_passe": "Dent2026!", "role": "Dentiste", "nom_complet": "Dr Démo"},
    {"login": "comptable1", "mot_de_passe": "Compt2026!", "role": "Comptable", "nom_complet": "Comptable Démo"},
]


async def initialiser() -> None:
    client = AsyncIOMotorClient(settings.mongodb_uri)
    base = client[settings.mongodb_db_name]

    # --- Catalogue ---
    for code, libelle, prix, domaine in CATALOGUE_ACTES:
        await base["ProduitClinique"].update_one(
            {"Code Produit": code},
            {"$set": {
                "Code Produit": code, "Libellé": libelle, "Prix Public": prix,
                "Domaine": domaine, "keyUnik": f"{domaine},{code}", "ExigePrestataire": False,
                "Etat Produit": "ACT",
            }},
            upsert=True,
        )
    print(f"[OK] {len(CATALOGUE_ACTES)} actes chargés dans ProduitClinique.")

    # --- Cabinet ---
    await base["Cabinet"].update_one({}, {"$set": CABINET_PAR_DEFAUT}, upsert=True)
    print("[OK] Fiche Cabinet initialisée.")

    # --- Comptes de démonstration ---
    for compte in COMPTES_DEMO:
        existant = await base["UtilisateurBlg"].find_one({"Login": compte["login"]})
        if existant:
            continue
        dernier = await base["Compteurs"].find_one_and_update(
            {"_id": "UtilisateurBlg"}, {"$inc": {"valeur": 1}}, upsert=True, return_document=True
        )
        await base["UtilisateurBlg"].insert_one({
            "Numéro_Enreg": dernier["valeur"],
            "Login": compte["login"],
            "role": compte["role"],
            "nom_complet": compte["nom_complet"],
            "mot_de_passe_hache": hacher_mot_de_passe(compte["mot_de_passe"]),
            "actif": True,
            "PeutSupprimerRecu": compte["role"] == "Administrateur",
            "PeutFaireRemboursement": compte["role"] in ("Administrateur", "Comptable"),
            "PeutFaireAvoir": compte["role"] in ("Administrateur", "Comptable"),
            "PeutSupprimerPaiement": compte["role"] == "Administrateur",
            "PeutCorrigerCotation": compte["role"] in ("Administrateur", "Dentiste"),
            "PeutEditerAssurance": compte["role"] in ("Administrateur", "Comptable"),
        })
    print(f"[OK] {len(COMPTES_DEMO)} comptes de démonstration vérifiés/créés.")

    # --- Modes de règlement ---
    for i, tp in enumerate(TYPES_PAIEMENT_PAR_DEFAUT, start=1):
        await base["TypePaiement"].update_one(
            {"nom": tp["nom"]},
            {"$setOnInsert": {"numero_enreg": i, "nom": tp["nom"], "exige_reference": tp["exige_reference"], "actif": True}},
            upsert=True,
        )
    print(f"[OK] {len(TYPES_PAIEMENT_PAR_DEFAUT)} modes de règlement vérifiés/créés.")

    # --- Historique des suggestions (SUGGESTION.MD -> SuggestionHistorique) ---
    entrees_suggestions = parser_suggestion_md()
    for entree in entrees_suggestions:
        await base["SuggestionHistorique"].update_one(
            {"numero_enreg": entree.numero_enreg},
            {"$set": entree.model_dump(mode="json")},
            upsert=True,
        )
    print(f"[OK] {len(entrees_suggestions)} entrées de SUGGESTION.MD synchronisées.")

    client.close()


if __name__ == "__main__":
    asyncio.run(initialiser())
