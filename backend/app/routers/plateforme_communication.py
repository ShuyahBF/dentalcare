"""
app/routers/plateforme_communication.py
--------------------------------------------
§ demande utilisateur : bouton "Communication" à côté de chaque cabinet
dans /plateforme (après "Journal"), réservé au super-admin, pour paramétrer
SMTP et WhatsApp DE CHAQUE CABINET — plus les siens propres (identifiés par
le code réservé CODE_PLATEFORME). Un "Copier" permet de dupliquer la
configuration d'un cabinet vers un autre SANS jamais exposer les champs
sensibles (mot de passe SMTP, token WhatsApp...) au navigateur du
super-admin : la copie est effectuée entièrement côté serveur.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.core.database import obtenir_base, Collections
from app.core.dependances import exiger_super_admin
from app.models.configuration_smtp import CODE_PLATEFORME

router = APIRouter(prefix="/api/plateforme/cabinets/{code_cabinet}/communication", tags=["Plateforme — Communication (super-admin)"])

CHAMPS_SENSIBLES_SMTP = ("mot_de_passe",)
CHAMPS_SENSIBLES_WA = ("token_acces_systeme", "app_secret", "jeton_verification_webhook")


def _masquer(document: dict | None, champs_sensibles: tuple) -> dict:
    document = dict(document) if document else {}
    for champ in champs_sensibles:
        document[f"{champ}_renseigne"] = bool(document.get(champ))
        document.pop(champ, None)
    document.pop("_id", None)
    return document


async def _verifier_cabinet_existe(base, code_cabinet: str):
    if code_cabinet == CODE_PLATEFORME:
        return  # pas un vrai cabinet — toujours valide, c'est la configuration du super-admin lui-même
    if not await base[Collections.CABINET].find_one({"code_cabinet": code_cabinet}):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cabinet introuvable.")


@router.get("")
async def obtenir_communication(code_cabinet: str, super_admin: dict = Depends(exiger_super_admin)):
    """Configuration SMTP + WhatsApp de ce cabinet (ou de la plateforme si code_cabinet == PLATEFORME) — champs sensibles masqués."""
    base = obtenir_base()
    await _verifier_cabinet_existe(base, code_cabinet)
    smtp = await base[Collections.CONFIGURATION_SMTP].find_one({"cabinet_code": code_cabinet})
    whatsapp = await base[Collections.CONFIGURATION_WHATSAPP].find_one({"cabinet_code": code_cabinet})
    return {
        "smtp": _masquer(smtp, CHAMPS_SENSIBLES_SMTP),
        "whatsapp": _masquer(whatsapp, CHAMPS_SENSIBLES_WA),
    }


@router.put("/smtp")
async def modifier_smtp(code_cabinet: str, donnees: dict, super_admin: dict = Depends(exiger_super_admin)):
    """Un champ sensible (mot_de_passe) omis conserve sa valeur déjà enregistrée — même principe qu'ailleurs sur la plateforme."""
    base = obtenir_base()
    await _verifier_cabinet_existe(base, code_cabinet)
    champs_autorises = ("hote", "port", "utilisateur", "mot_de_passe", "adresse_expediteur", "nom_expediteur", "utiliser_tls", "actif")
    valeurs = {k: v for k, v in donnees.items() if k in champs_autorises}
    valeurs["cabinet_code"] = code_cabinet
    await base[Collections.CONFIGURATION_SMTP].update_one({"cabinet_code": code_cabinet}, {"$set": valeurs}, upsert=True)
    config = await base[Collections.CONFIGURATION_SMTP].find_one({"cabinet_code": code_cabinet})
    return _masquer(config, CHAMPS_SENSIBLES_SMTP)


@router.put("/whatsapp")
async def modifier_whatsapp(code_cabinet: str, donnees: dict, super_admin: dict = Depends(exiger_super_admin)):
    base = obtenir_base()
    await _verifier_cabinet_existe(base, code_cabinet)
    champs_autorises = ("waba_id", "numero_telephone_id", "numero_telephone_affiche", "app_id", "token_acces_systeme", "app_secret", "jeton_verification_webhook", "actif")
    valeurs = {k: v for k, v in donnees.items() if k in champs_autorises}
    valeurs["cabinet_code"] = code_cabinet
    await base[Collections.CONFIGURATION_WHATSAPP].update_one({"cabinet_code": code_cabinet}, {"$set": valeurs}, upsert=True)
    config = await base[Collections.CONFIGURATION_WHATSAPP].find_one({"cabinet_code": code_cabinet})
    return _masquer(config, CHAMPS_SENSIBLES_WA)


class CopieCommunicationRequete(BaseModel):
    code_cabinet_source: str
    elements: list[str]  # sous-ensemble de ["smtp", "whatsapp"]


@router.post("/copier")
async def copier_communication(code_cabinet: str, requete: CopieCommunicationRequete, super_admin: dict = Depends(exiger_super_admin)):
    """
    Copie la configuration SMTP et/ou WhatsApp d'un AUTRE cabinet vers celui-ci
    (§ demande utilisateur — bouton "Copier"). Entièrement côté serveur : les
    valeurs sensibles (mot de passe SMTP, token WhatsApp...) transitent de
    document à document SANS JAMAIS être exposées au navigateur du
    super-admin, contrairement à un simple copier-coller de formulaire.
    """
    base = obtenir_base()
    await _verifier_cabinet_existe(base, code_cabinet)
    await _verifier_cabinet_existe(base, requete.code_cabinet_source)
    if code_cabinet == requete.code_cabinet_source:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Le cabinet source doit être différent du cabinet cible.")

    resultat = {}
    if "smtp" in requete.elements:
        source = await base[Collections.CONFIGURATION_SMTP].find_one({"cabinet_code": requete.code_cabinet_source})
        if source:
            copie = {k: v for k, v in source.items() if k not in ("_id", "cabinet_code")}
            copie["cabinet_code"] = code_cabinet
            await base[Collections.CONFIGURATION_SMTP].update_one({"cabinet_code": code_cabinet}, {"$set": copie}, upsert=True)
        resultat["smtp"] = bool(source)
    if "whatsapp" in requete.elements:
        source = await base[Collections.CONFIGURATION_WHATSAPP].find_one({"cabinet_code": requete.code_cabinet_source})
        if source:
            copie = {k: v for k, v in source.items() if k not in ("_id", "cabinet_code")}
            copie["cabinet_code"] = code_cabinet
            await base[Collections.CONFIGURATION_WHATSAPP].update_one({"cabinet_code": code_cabinet}, {"$set": copie}, upsert=True)
        resultat["whatsapp"] = bool(source)
    return {"statut": "copié", "elements_copies": resultat}


@router.delete("/{type_config}/champ-sensible/{champ}")
async def effacer_champ_sensible(code_cabinet: str, type_config: str, champ: str, super_admin: dict = Depends(exiger_super_admin)):
    """Efface un champ sensible précis (ex: révocation d'un mot de passe ou token compromis)."""
    if type_config == "smtp":
        collection, champs_valides = Collections.CONFIGURATION_SMTP, CHAMPS_SENSIBLES_SMTP
    elif type_config == "whatsapp":
        collection, champs_valides = Collections.CONFIGURATION_WHATSAPP, CHAMPS_SENSIBLES_WA
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Type de configuration inconnu.")
    if champ not in champs_valides:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Champ inconnu.")
    base = obtenir_base()
    await base[collection].update_one({"cabinet_code": code_cabinet}, {"$unset": {champ: ""}})
    return {"statut": "effacé"}
