"""
app/routers/plateforme.py
------------------------------
§ demande utilisateur — architecture SaaS multi-cabinets. Réservé aux
comptes super-admin (équipe SAWALI SMART SYSTEMS), distincts des
Administrateurs de chaque cabinet : création/édition des cabinets clients de
la plateforme, gestion de leur état d'abonnement, et bootstrap du premier
compte Administrateur de chaque nouveau cabinet.

Éléments reproductibles à la création d'un cabinet (choisis par le
super-admin) : catalogue (ProduitClinique), modes de paiement (TypePaiement),
assurances (Assurance) — JAMAIS les Patients, reçus/détails de reçus,
Médecins ou RendezVous, qui démarrent toujours vides pour un nouveau cabinet.
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.core.database import obtenir_base, Collections
from app.core.dependances import exiger_super_admin
from app.core.security import hacher_mot_de_passe
from app.models.cabinet import Cabinet
from app.utils.compteurs import prochain_code_cabinet, prochain_numero

router = APIRouter(prefix="/api/plateforme", tags=["Plateforme (super-admin)"])

# Collections reproductibles depuis un cabinet modèle, et leur clé d'unicité
# au sein d'un même cabinet (pour éviter les doublons si reproduit plusieurs fois).
COLLECTIONS_REPRODUCTIBLES = {
    "catalogue": (Collections.PRODUIT_CLINIQUE, "Code Produit"),
    "types_paiement": (Collections.TYPE_PAIEMENT, "nom"),
    "assurances": (Collections.ASSURANCE, "nom"),
}


@router.get("/cabinets")
async def lister_cabinets(super_admin: dict = Depends(exiger_super_admin)):
    base = obtenir_base()
    curseur = base[Collections.CABINET].find({}).sort("date_creation", -1)
    return [c async for c in curseur]


class CreationCabinetRequete(BaseModel):
    denomination: str
    adresse: str = "Ouagadougou, Burkina Faso"
    telephone: str | None = None
    email: str | None = None
    devise: str = "FCFA"
    # Éléments à reproduire depuis un cabinet modèle (sous-ensemble de
    # COLLECTIONS_REPRODUCTIBLES) — jamais Patients/reçus/Médecins/RendezVous.
    elements_a_reproduire: list[str] = []
    cabinet_modele_code: str | None = None
    # Bootstrap : premier compte Administrateur du nouveau cabinet.
    admin_login: str
    admin_mot_de_passe: str
    admin_nom_complet: str | None = None


@router.post("/cabinets", status_code=status.HTTP_201_CREATED)
async def creer_cabinet(requete: CreationCabinetRequete, super_admin: dict = Depends(exiger_super_admin)):
    base = obtenir_base()

    # Le Login est unique sur TOUTE la plateforme (§ demande utilisateur :
    # pas de sélecteur de cabinet à la connexion).
    if await base[Collections.UTILISATEUR_BLG].find_one({"Login": requete.admin_login}):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Ce login est déjà utilisé sur la plateforme.")

    if requete.elements_a_reproduire and not requete.cabinet_modele_code:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Précisez le cabinet modèle à reproduire.")
    if requete.cabinet_modele_code:
        modele = await base[Collections.CABINET].find_one({"code_cabinet": requete.cabinet_modele_code})
        if not modele:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cabinet modèle introuvable.")

    code_cabinet = await prochain_code_cabinet()
    cabinet = Cabinet(
        code_cabinet=code_cabinet, denomination=requete.denomination, adresse=requete.adresse,
        telephone=requete.telephone, email=requete.email, devise=requete.devise,
        annee_creation=datetime.utcnow().year, etat="En Attente",
        elements_reproduits_a_la_creation=requete.elements_a_reproduire,
        cabinet_modele_code=requete.cabinet_modele_code,
    )
    await base[Collections.CABINET].insert_one(cabinet.model_dump())

    # Reproduction sélective depuis le cabinet modèle (jamais Patients/
    # reçus/Médecins/RendezVous — voir COLLECTIONS_REPRODUCTIBLES ci-dessus).
    elements_copies = []
    for element in requete.elements_a_reproduire:
        if element not in COLLECTIONS_REPRODUCTIBLES:
            continue
        nom_collection, _ = COLLECTIONS_REPRODUCTIBLES[element]
        documents = [doc async for doc in base[nom_collection].find({"cabinet_code": requete.cabinet_modele_code})]
        if documents:
            for doc in documents:
                doc.pop("_id", None)
                doc["cabinet_code"] = code_cabinet
            await base[nom_collection].insert_many(documents)
        elements_copies.append({"element": element, "nombre": len(documents)})

    # Bootstrap du premier compte Administrateur de ce cabinet.
    numero_enreg_admin = await prochain_numero("UtilisateurBlg", valeur_depart=1)
    utilisateur_admin = {
        "Numéro_Enreg": numero_enreg_admin, "Login": requete.admin_login,
        "mot_de_passe_hache": hacher_mot_de_passe(requete.admin_mot_de_passe),
        "nom_complet": requete.admin_nom_complet or requete.admin_login,
        "role": "Administrateur", "actif": True, "CodeCabinet": code_cabinet, "EstSuperAdmin": False,
    }
    await base[Collections.UTILISATEUR_BLG].insert_one(utilisateur_admin)

    return {"cabinet": cabinet.model_dump(), "elements_copies": elements_copies, "admin_login": requete.admin_login}


@router.put("/cabinets/{code_cabinet}")
async def modifier_cabinet(code_cabinet: str, donnees: dict, super_admin: dict = Depends(exiger_super_admin)):
    base = obtenir_base()
    valeurs = {k: v for k, v in donnees.items() if k not in ("code_cabinet", "date_creation")}
    resultat = await base[Collections.CABINET].update_one({"code_cabinet": code_cabinet}, {"$set": valeurs})
    if resultat.matched_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cabinet introuvable.")
    return {"statut": "modifié"}


@router.put("/cabinets/{code_cabinet}/etat")
async def changer_etat_cabinet(code_cabinet: str, etat: str, super_admin: dict = Depends(exiger_super_admin)):
    if etat not in ("Actif", "En Attente", "Suspendu", "Expiré", "Inactif"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="État invalide.")
    base = obtenir_base()
    resultat = await base[Collections.CABINET].update_one({"code_cabinet": code_cabinet}, {"$set": {"etat": etat}})
    if resultat.matched_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cabinet introuvable.")
    return {"statut": etat}
