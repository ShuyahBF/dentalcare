"""
app/routers/messagerie.py
------------------------------
Centre de Messagerie WA (§ demande utilisateur) : configuration des
identifiants Meta (WhatsApp Business Platform) propres à CHAQUE cabinet.
Réservé à l'Administrateur du cabinet — jamais accessible à un autre
cabinet (isolation stricte, comme le reste de l'architecture SaaS).

Les champs sensibles (token_acces_systeme, app_secret,
jeton_verification_webhook) ne sont JAMAIS retournés en clair une fois
enregistrés : la lecture renvoie un indicateur "renseigné: true/false"
à la place, exactement comme le mot de passe d'un compte utilisateur.
"""

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.database import obtenir_base, Collections
from app.core.dependances import obtenir_utilisateur_courant, exiger_role
from app.models.configuration_whatsapp import ConfigurationWhatsApp

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
