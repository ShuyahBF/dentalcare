"""
app/routers/messagerie.py
------------------------------
Centre de Messagerie WA (§ demande utilisateur) : configuration des
identifiants Meta (WhatsApp Business Platform) propres à CHAQUE cabinet, et
annuaire de contacts unifié — reproduction fidèle de l'interface /contacts
du portail SAWALI SMART SYSTEMS (repo ShuyahBF/Emergent, branche
Site-SawaliSmartSystems), adaptée à l'isolation stricte multi-cabinets de
cette plateforme (jamais de recherche cross-tenant, contrairement à la
référence). Réservé à l'Administrateur pour la configuration ; l'annuaire de
contacts et l'import des expéditeurs inconnus sont accessibles à
l'Administrateur ET au Secrétariat Cabinet (usage opérationnel quotidien).
"""

from datetime import datetime
import csv
import io
import json

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response

from app.core.database import obtenir_base, Collections
from app.core.dependances import obtenir_utilisateur_courant, exiger_role
from app.models.configuration_whatsapp import ConfigurationWhatsApp
from app.models.contact_messagerie import ContactMessagerieCreation
from app.utils.compteurs import prochain_numero, prochain_code_unique_contact

router = APIRouter(prefix="/api/messagerie", tags=["Messagerie WhatsApp"])

CHAMPS_SENSIBLES = ("token_acces_systeme", "app_secret", "jeton_verification_webhook")


def _masquer_champs_sensibles(document: dict) -> dict:
    """Remplace chaque champ sensible par un indicateur booléen 'renseigné', jamais la valeur elle-même."""
    document = dict(document)
    for champ in CHAMPS_SENSIBLES:
        document[f"{champ}_renseigne"] = bool(document.get(champ))
        document.pop(champ, None)
    document.pop("_id", None)
    return document


@router.get("/configuration")
async def obtenir_configuration(utilisateur: dict = Depends(exiger_role("Administrateur"))):
    """Configuration WhatsApp Business DU PROPRE cabinet de l'Administrateur — champs sensibles masqués."""
    base = obtenir_base()
    config = await base[Collections.CONFIGURATION_WHATSAPP].find_one({"cabinet_code": utilisateur["CodeCabinet"]})
    if not config:
        return _masquer_champs_sensibles(ConfigurationWhatsApp(cabinet_code=utilisateur["CodeCabinet"]).model_dump())
    return _masquer_champs_sensibles(config)


@router.put("/configuration")
async def modifier_configuration(donnees: dict, utilisateur: dict = Depends(exiger_role("Administrateur"))):
    """
    Met à jour la configuration. Un champ sensible omis (non envoyé dans la
    requête) conserve sa valeur déjà enregistrée — pour que l'Administrateur
    puisse modifier le numéro affiché sans avoir à ressaisir le token à
    chaque fois, exactement comme une réinitialisation de mot de passe
    n'est demandée que si on veut vraiment le changer.
    """
    base = obtenir_base()
    cabinet_code = utilisateur["CodeCabinet"]
    valeurs = {k: v for k, v in donnees.items() if k in ConfigurationWhatsApp.model_fields and k != "cabinet_code"}
    valeurs["cabinet_code"] = cabinet_code
    await base[Collections.CONFIGURATION_WHATSAPP].update_one(
        {"cabinet_code": cabinet_code}, {"$set": valeurs}, upsert=True
    )
    config = await base[Collections.CONFIGURATION_WHATSAPP].find_one({"cabinet_code": cabinet_code})
    return _masquer_champs_sensibles(config)


@router.delete("/configuration/champ-sensible/{champ}")
async def effacer_champ_sensible(champ: str, utilisateur: dict = Depends(exiger_role("Administrateur"))):
    """Efface un champ sensible précis (ex: révocation d'un token compromis) sans toucher au reste."""
    if champ not in CHAMPS_SENSIBLES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Champ inconnu.")
    base = obtenir_base()
    await base[Collections.CONFIGURATION_WHATSAPP].update_one(
        {"cabinet_code": utilisateur["CodeCabinet"]}, {"$unset": {champ: ""}}
    )
    return {"statut": "effacé"}


# ============================================================================
# Annuaire de contacts (§ demande utilisateur — reproduction de /contacts)
# ============================================================================

ROLES_MESSAGERIE = ("Administrateur", "Secrétariat Cabinet")


def _est_masque_anon(valeur) -> bool:
    return isinstance(valeur, str) and "**" in valeur


@router.get("/contacts")
async def lister_contacts(utilisateur: dict = Depends(exiger_role(*ROLES_MESSAGERIE))):
    """
    Liste TOUS les contacts DU CABINET de l'utilisateur (§ reproduction
    fidèle de la référence : modèle collaboratif, tout contact créé par
    n'importe quel utilisateur du cabinet est visible par toute l'équipe —
    le champ `partage` distingue seulement l'affichage "Partagés
    équipe"/"Privé", il ne restreint jamais la visibilité elle-même, exactement
    comme dans la référence).
    """
    base = obtenir_base()
    curseur = base[Collections.CONTACT_MESSAGERIE].find({"cabinet_code": utilisateur["CodeCabinet"]}).sort("nom", 1)
    return [c async for c in curseur]


@router.post("/contacts", status_code=status.HTTP_201_CREATED)
async def creer_contact(contact: ContactMessagerieCreation, utilisateur: dict = Depends(exiger_role(*ROLES_MESSAGERIE))):
    base = obtenir_base()
    cabinet_code = utilisateur["CodeCabinet"]
    numero_enreg = await prochain_numero("ContactMessagerie", valeur_depart=1)
    code_unique = await prochain_code_unique_contact(cabinet_code)
    document = contact.model_dump()
    document.update({
        "numero_enreg": numero_enreg, "cabinet_code": cabinet_code, "code_unique": code_unique,
        "proprietaire_login": utilisateur["Login"], "proprietaire_nom": utilisateur.get("nom_complet"),
        "date_creation": datetime.utcnow(),
    })
    await base[Collections.CONTACT_MESSAGERIE].insert_one(document)
    document.pop("_id", None)
    return document


@router.put("/contacts/{numero_enreg}")
async def modifier_contact(numero_enreg: int, donnees: dict, utilisateur: dict = Depends(exiger_role(*ROLES_MESSAGERIE))):
    base = obtenir_base()
    champs_autorises = ("nom", "telephone", "whatsapp", "email", "societe", "notes", "tags", "partage", "photo_url")
    valeurs = {k: v for k, v in donnees.items() if k in champs_autorises}
    # RGPD/anti-écrasement (§ reproduction de la référence) : si un champ
    # affiché anonymisé (contient "**") est renvoyé tel quel par erreur
    # (l'utilisateur n'a pas retouché le champ), on ne l'enregistre jamais.
    for champ in ("nom", "societe", "email", "telephone", "whatsapp"):
        if champ in valeurs and _est_masque_anon(valeurs[champ]):
            valeurs.pop(champ)
    valeurs["date_derniere_modification"] = datetime.utcnow()
    resultat = await base[Collections.CONTACT_MESSAGERIE].update_one(
        {"numero_enreg": numero_enreg, "cabinet_code": utilisateur["CodeCabinet"]}, {"$set": valeurs}
    )
    if resultat.matched_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contact introuvable.")
    return {"statut": "modifié"}


@router.delete("/contacts/{numero_enreg}")
async def supprimer_contact(numero_enreg: int, utilisateur: dict = Depends(exiger_role(*ROLES_MESSAGERIE))):
    base = obtenir_base()
    resultat = await base[Collections.CONTACT_MESSAGERIE].delete_one(
        {"numero_enreg": numero_enreg, "cabinet_code": utilisateur["CodeCabinet"]}
    )
    if resultat.deleted_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contact introuvable.")
    return {"statut": "supprimé"}


@router.get("/contacts/export.csv")
async def exporter_contacts_csv(utilisateur: dict = Depends(exiger_role(*ROLES_MESSAGERIE))):
    base = obtenir_base()
    contacts = [c async for c in base[Collections.CONTACT_MESSAGERIE].find({"cabinet_code": utilisateur["CodeCabinet"]}).sort("nom", 1)]
    tampon = io.StringIO()
    ecrivain = csv.writer(tampon)
    ecrivain.writerow(["Code unique", "Nom", "Téléphone", "WhatsApp", "Email", "Société", "Tags", "Partage"])
    for c in contacts:
        ecrivain.writerow([
            c.get("code_unique", ""), c.get("nom", ""), c.get("telephone", ""), c.get("whatsapp", ""),
            c.get("email", ""), c.get("societe", ""), ", ".join(c.get("tags", [])),
            "Équipe" if c.get("partage") else "Privé",
        ])
    return Response(
        content=tampon.getvalue(), media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=contacts.csv"},
    )


@router.get("/contacts/export.json")
async def exporter_contacts_json(utilisateur: dict = Depends(exiger_role(*ROLES_MESSAGERIE))):
    base = obtenir_base()
    contacts = [c async for c in base[Collections.CONTACT_MESSAGERIE].find({"cabinet_code": utilisateur["CodeCabinet"]}, {"_id": 0}).sort("nom", 1)]
    return Response(
        content=json.dumps(contacts, default=str, ensure_ascii=False, indent=2), media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=contacts.json"},
    )


@router.get("/contacts-en-attente")
async def lister_contacts_en_attente(utilisateur: dict = Depends(exiger_role(*ROLES_MESSAGERIE))):
    """
    Numéros WhatsApp inconnus ayant écrit au cabinet, pas encore promus en
    contact (bannière d'import de la référence). Alimenté par le récepteur
    de webhook WhatsApp — pas encore construit à ce stade (Phase 2 du
    Centre de Messagerie) : cette liste reste vide tant qu'il ne l'est pas.
    """
    base = obtenir_base()
    curseur = base[Collections.CONTACT_EN_ATTENTE].find({"cabinet_code": utilisateur["CodeCabinet"]}).sort("dernier_vu_le", -1).limit(50)
    return [c async for c in curseur]


@router.post("/contacts-en-attente/{numero_enreg}/importer", status_code=status.HTTP_201_CREATED)
async def importer_contact_en_attente(numero_enreg: int, donnees: dict, utilisateur: dict = Depends(exiger_role(*ROLES_MESSAGERIE))):
    """Promeut un expéditeur WhatsApp inconnu en contact de l'annuaire, en un clic."""
    base = obtenir_base()
    cabinet_code = utilisateur["CodeCabinet"]
    en_attente = await base[Collections.CONTACT_EN_ATTENTE].find_one({"numero_enreg": numero_enreg, "cabinet_code": cabinet_code})
    if not en_attente:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Introuvable.")
    nom = (donnees.get("nom") or en_attente.get("nom_profil_wa") or en_attente.get("depuis") or "").strip()
    if not nom:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nom requis.")

    numero_contact = await prochain_numero("ContactMessagerie", valeur_depart=1)
    code_unique = await prochain_code_unique_contact(cabinet_code)
    contact = {
        "numero_enreg": numero_contact, "cabinet_code": cabinet_code, "code_unique": code_unique,
        "nom": nom, "telephone": en_attente["depuis"], "whatsapp": en_attente["depuis"],
        "email": "", "societe": "", "notes": "Importé depuis les expéditeurs WhatsApp inconnus",
        "tags": ["wa-import"], "partage": True, "photo_url": None,
        "proprietaire_login": utilisateur["Login"], "proprietaire_nom": utilisateur.get("nom_complet"),
        "date_creation": datetime.utcnow(),
    }
    await base[Collections.CONTACT_MESSAGERIE].insert_one(contact)
    await base[Collections.CONTACT_EN_ATTENTE].delete_one({"numero_enreg": numero_enreg, "cabinet_code": cabinet_code})
    contact.pop("_id", None)
    return contact


@router.delete("/contacts-en-attente/{numero_enreg}")
async def ignorer_contact_en_attente(numero_enreg: int, utilisateur: dict = Depends(exiger_role(*ROLES_MESSAGERIE))):
    base = obtenir_base()
    resultat = await base[Collections.CONTACT_EN_ATTENTE].delete_one(
        {"numero_enreg": numero_enreg, "cabinet_code": utilisateur["CodeCabinet"]}
    )
    if resultat.deleted_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Introuvable.")
    return {"statut": "ignoré"}
