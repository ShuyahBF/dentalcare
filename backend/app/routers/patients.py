"""
app/routers/patients.py
---------------------------
CRUD et recherche des patients, + consultation de l'historique complet des
Dossier_Examen d'un patient (§4h du cahier des charges : "Le Dentiste doit
pouvoir consulter, depuis la fiche d'un Patient, l'historique complet de
tous ses Dossier_Examen passés").

§ demande utilisateur (architecture SaaS multi-cabinets) : chaque patient
appartient à EXACTEMENT un cabinet (cabinet_code), et aucune route de ce
routeur ne lit/écrit jamais de patient en dehors du cabinet de l'utilisateur
courant — l'isolation des données entre cabinets est stricte.
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.database import obtenir_base, Collections
from app.core.dependances import obtenir_utilisateur_courant, exiger_role
from app.models.patient import PatientCreation
from app.utils.compteurs import prochain_numero, prochain_numero_cabinet
from app.utils.client_cash import assurer_client_cash_existe

router = APIRouter(prefix="/api/patients", tags=["Patients"])


@router.get("/client-cash")
async def obtenir_client_cash(utilisateur: dict = Depends(obtenir_utilisateur_courant)):
    """
    Retourne le patient générique "Client CASH" DU CABINET DE L'UTILISATEUR
    COURANT (créé/vérifié au démarrage du serveur pour chaque cabinet actif,
    voir app/utils/client_cash.py). Utilisé par la Caisse pour établir un
    reçu même si aucun patient n'a été sélectionné/identifié. Recrée le
    document à la volée si, par extraordinaire, il a été supprimé depuis le
    démarrage du serveur.
    """
    return await assurer_client_cash_existe(utilisateur["CodeCabinet"])


@router.get("")
async def lister_patients(recherche: str | None = None, limite: int = 50, inclure_inactifs: bool = False, utilisateur: dict = Depends(obtenir_utilisateur_courant)):
    """
    Liste/recherche des patients DU CABINET DE L'UTILISATEUR COURANT. La
    recherche porte sur le nom, les prénoms ou le téléphone (utilisé par
    l'autocomplétion caisse). inclure_inactifs=true (Administration) inclut
    aussi les patients désactivés.
    """
    base = obtenir_base()
    filtre: dict = {"cabinet_code": utilisateur["CodeCabinet"]}
    if not inclure_inactifs:
        filtre["Etat_En_Cours"] = 1
    if recherche:
        filtre["$or"] = [
            {"Nom": {"$regex": recherche, "$options": "i"}},
            {"Prénoms": {"$regex": recherche, "$options": "i"}},
            {"Téléphone": {"$regex": recherche, "$options": "i"}},
        ]
    curseur = base[Collections.PATIENT].find(filtre).sort("Date Création", -1).limit(limite)
    return [p async for p in curseur]


@router.get("/{numero_enreg}")
async def obtenir_patient(numero_enreg: int, utilisateur: dict = Depends(obtenir_utilisateur_courant)):
    base = obtenir_base()
    patient = await base[Collections.PATIENT].find_one({"Numéro_Enreg": numero_enreg, "cabinet_code": utilisateur["CodeCabinet"]})
    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient introuvable.")
    return patient


@router.get("/{numero_enreg}/dossiers")
async def historique_dossiers_patient(numero_enreg: int, utilisateur: dict = Depends(obtenir_utilisateur_courant)):
    """
    Historique complet des Dossier_Examen d'un patient (§4h), le plus
    récent en premier — par DERNIÈRE ACTIVITÉ (création ou modification,
    la plus récente des deux), même règle que la vue globale
    GET /dossiers-examen (§ cohérence entre les deux tableaux similaires,
    demande explicite de l'utilisateur).
    """
    base = obtenir_base()
    dossiers = [d async for d in base[Collections.DOSSIER_EXAMEN].find({"Client": numero_enreg, "cabinet_code": utilisateur["CodeCabinet"]})]
    for d in dossiers:
        creation = d.get("DateHeure_Creation")
        modification = d.get("Dateheure_modification")
        d["derniere_activite"] = max(filter(None, [creation, modification])) if (creation or modification) else None
    dossiers.sort(key=lambda d: d.get("derniere_activite") or datetime.min, reverse=True)
    return dossiers


def _statut_depuis_domaine(domaine: str | None) -> str:
    """Même heuristique domaine → statut que le composant SchemaDentaire.jsx, pour rester cohérent."""
    return {
        "PROTHE": "Couronne/Bridge",
        "SCHIRU": "Implant",
        "SPARAD": "Problème Parodontal",
    }.get(domaine, "Carie/Obturation")


@router.get("/{numero_enreg}/dernier-schema-dentaire")
async def dernier_schema_dentaire(numero_enreg: int, utilisateur: dict = Depends(obtenir_utilisateur_courant)):
    """
    Retourne l'état du schéma dentaire le plus récent pour ce patient, en
    comparant la dernière modification d'un Dossier_Examen (ContenuExams,
    enregistré par le Dentiste) et le dernier reçu de Caisse ayant des
    lignes rattachées à une dent (Pièces_Scannées_Utilisateurs) — pour que
    le Dentiste voie systématiquement les dents sélectionnées lors du
    dernier enregistrement, qu'il vienne de la Caisse ou de sa propre
    dernière visite documentée.
    """
    base = obtenir_base()
    cabinet_code = utilisateur["CodeCabinet"]

    dernier_dossier = await base[Collections.DOSSIER_EXAMEN].find_one(
        {"Client": numero_enreg, "cabinet_code": cabinet_code, "ContenuExams": {"$ne": None}},
        sort=[("Dateheure_modification", -1), ("DateHeure_Creation", -1)],
    )
    derniere_piece = await base[Collections.PIECES_SCANNEES].find_one(
        {"patient_numero_enreg": numero_enreg, "cabinet_code": cabinet_code, "lignes_schema": {"$exists": True, "$ne": []}},
        sort=[("Date_Heure", -1)],
    )

    date_dossier = dernier_dossier.get("Dateheure_modification") or dernier_dossier.get("DateHeure_Creation") if dernier_dossier else None
    date_piece = derniere_piece.get("Date_Heure") if derniere_piece else None

    if date_piece and (not date_dossier or date_piece > date_dossier):
        actes_par_dent = [
            {
                "numero_dent": l["numero_dent"],
                "code_produit": l["code_produit"],
                "libelle_acte": l["libelle"],
                "statut": _statut_depuis_domaine(l.get("domaine")),
            }
            for l in derniere_piece.get("lignes_schema", [])
        ]
        return {"source": "reçu", "reference_recu": derniere_piece.get("reference_recu"), "date": date_piece, "actes_par_dent": actes_par_dent}

    if dernier_dossier:
        contenu = dernier_dossier.get("ContenuExams") or {}
        return {"source": "dossier", "dossier_numero_enreg": dernier_dossier.get("Numéro_Enreg"), "date": date_dossier, "actes_par_dent": contenu.get("actes_par_dent", [])}

    return {"source": None, "actes_par_dent": []}


@router.post("", status_code=status.HTTP_201_CREATED)
async def creer_patient(patient: PatientCreation, utilisateur: dict = Depends(obtenir_utilisateur_courant)):
    base = obtenir_base()
    cabinet_code = utilisateur["CodeCabinet"]
    # Numéro_Enreg : clé interne, séquence globale simple (jamais affichée à
    # l'utilisateur). ID_Patient : identifiant humain (code cabinet + année + n° d'ordre) propre
    # au cabinet + année en cours (§ demande utilisateur), ex: "00010152".
    numero_enreg = await prochain_numero("Patient", valeur_depart=100000)
    id_patient = await prochain_numero_cabinet("patient", cabinet_code)
    document = patient.model_dump(by_alias=True, exclude_none=True)
    document.update({
        "Numéro_Enreg": numero_enreg,
        "ID_Patient": id_patient,
        "cabinet_code": cabinet_code,
        "Date Création": datetime.utcnow(),
        "Etat_En_Cours": 1,
        "NbVues": 0,
        "NbModifications": 0,
        "Consulteur": utilisateur["Login"],
    })
    await base[Collections.PATIENT].insert_one(document)
    return document


@router.put("/{numero_enreg}")
async def modifier_patient(numero_enreg: int, patient: PatientCreation, utilisateur: dict = Depends(obtenir_utilisateur_courant)):
    base = obtenir_base()
    mise_a_jour = patient.model_dump(by_alias=True, exclude_none=True)
    mise_a_jour.update({
        "Dateheure_dernierModification": datetime.utcnow(),
        "Modifieur": utilisateur["Login"],
    })
    resultat = await base[Collections.PATIENT].update_one(
        {"Numéro_Enreg": numero_enreg, "cabinet_code": utilisateur["CodeCabinet"]},
        {"$set": mise_a_jour, "$inc": {"NbModifications": 1}},
    )
    if resultat.matched_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient introuvable.")
    return {"statut": "modifié"}


@router.put("/{numero_enreg}/statut")
async def activer_desactiver_patient(numero_enreg: int, actif: bool, utilisateur: dict = Depends(exiger_role("Administrateur"))):
    """Active/désactive un patient (colonne « Etat_En_Cours » du legacy) — réservé à l'Administrateur (§9)."""
    base = obtenir_base()
    resultat = await base[Collections.PATIENT].update_one(
        {"Numéro_Enreg": numero_enreg, "cabinet_code": utilisateur["CodeCabinet"]}, {"$set": {"Etat_En_Cours": 1 if actif else 0}}
    )
    if resultat.matched_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient introuvable.")
    return {"statut": "actif" if actif else "désactivé"}

