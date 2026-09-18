"""
app/routers/auth.py
-----------------------
Route de connexion : vérifie le login/mot de passe contre UtilisateurBlg et
retourne un JWT contenant le rôle (utilisé ensuite pour le contrôle d'accès
côté serveur sur toutes les autres routes).

§ demande utilisateur : connexion en DEUX ÉTAPES quand le cabinet a activé
l'OTP WhatsApp (Cabinet.otp_whatsapp_actif) — après vérification du login/
mot de passe, un code à 6 chiffres est envoyé par WhatsApp au numéro
enregistré sur le compte ; POST /auth/connexion renvoie alors
{otp_requis: true, jeton_session_otp: ...} au lieu du JWT final, et le
frontend doit ensuite appeler POST /auth/verifier-otp avec ce code pour
obtenir le vrai jeton d'accès.
"""

import secrets
from datetime import datetime, timedelta
from uuid import uuid4

from fastapi import APIRouter, HTTPException, status

from app.core.database import obtenir_base, Collections
from app.core.security import verifier_mot_de_passe, creer_jeton_acces
from app.models.utilisateur import UtilisateurConnexion, JetonAcces, VerificationOTP, ReponseConnexion
from app.utils.audit import journaliser_action
from app.utils.whatsapp_api import envoyer_message_whatsapp_texte

router = APIRouter(prefix="/api/auth", tags=["Authentification"])

DUREE_VALIDITE_OTP_MINUTES = 5


async def _emettre_jeton_final(base, utilisateur: dict) -> JetonAcces:
    jeton = creer_jeton_acces({"sub": utilisateur["Login"], "role": utilisateur["role"]})
    # § capturé AVANT l'écrasement ci-dessous — c'est la connexion
    # PRÉCÉDENTE (celle d'avant cette session), utile pour l'affichage
    # sidebar tout au long de la session courante.
    derniere_connexion_precedente = utilisateur.get("DH_DernCnx")
    await base[Collections.UTILISATEUR_BLG].update_one(
        {"Login": utilisateur["Login"]}, {"$set": {"DH_DernCnx": datetime.utcnow()}}
    )
    await journaliser_action(utilisateur["Login"], "connexion", cabinet_code=utilisateur.get("CodeCabinet"))
    return JetonAcces(
        access_token=jeton, role=utilisateur["role"], login=utilisateur["Login"],
        nom_complet=utilisateur.get("nom_complet"), est_super_admin=utilisateur.get("EstSuperAdmin", False),
        derniere_connexion_precedente=derniere_connexion_precedente,
    )


@router.post("/connexion", response_model=ReponseConnexion)
async def connexion(identifiants: UtilisateurConnexion):
    base = obtenir_base()
    utilisateur = await base[Collections.UTILISATEUR_BLG].find_one({"Login": identifiants.login})

    if not utilisateur or not verifier_mot_de_passe(identifiants.mot_de_passe, utilisateur["mot_de_passe_hache"]):
        # § demande utilisateur : le Journal doit aussi montrer les tentatives
        # de connexion échouées, pas seulement les réussies — utile au
        # super-admin pour repérer une attaque par force brute sur un cabinet.
        # cabinet_code=None si le login est inconnu (journaliser_action ne
        # peut alors pas le résoudre) — l'entrée reste visible côté
        # super-admin même sans rattachement à un cabinet précis.
        await journaliser_action(identifiants.login, "connexion_echouee", {"motif": "login ou mot de passe incorrect"})
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Login ou mot de passe incorrect.",
        )
    if not utilisateur.get("actif", True):
        await journaliser_action(identifiants.login, "connexion_echouee", {"motif": "compte désactivé"}, cabinet_code=utilisateur.get("CodeCabinet"))
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Ce compte est désactivé.")

    # § demande utilisateur (architecture SaaS multi-cabinets) : pas de
    # sélecteur de cabinet à la connexion — c'est le couple login/mot de
    # passe seul qui détermine le cabinet. Un compte super-admin plateforme
    # n'est rattaché à aucun cabinet et n'est donc pas concerné par ce
    # contrôle d'état d'abonnement ni par l'OTP WhatsApp (propre à chaque cabinet).
    cabinet = None
    if not utilisateur.get("EstSuperAdmin") and utilisateur.get("CodeCabinet"):
        cabinet = await base[Collections.CABINET].find_one({"code_cabinet": utilisateur["CodeCabinet"]})
        if not cabinet:
            await journaliser_action(identifiants.login, "connexion_echouee", {"motif": "cabinet introuvable"}, cabinet_code=utilisateur.get("CodeCabinet"))
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cabinet introuvable pour ce compte.")
        if cabinet.get("etat") != "Actif":
            await journaliser_action(identifiants.login, "connexion_echouee", {"motif": f"cabinet {cabinet.get('etat')}"}, cabinet_code=utilisateur["CodeCabinet"])
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"L'accès de votre cabinet est actuellement « {cabinet.get('etat')} ». Contactez votre administrateur ou SAWALI SMART SYSTEMS.",
            )

    # § demande utilisateur : OTP WhatsApp — second facteur optionnel, activé
    # par cabinet (Cabinet.otp_whatsapp_actif). Nécessite un numéro de
    # téléphone enregistré sur CE compte, sinon échec explicite (pas de
    # blocage silencieux).
    if cabinet and cabinet.get("otp_whatsapp_actif"):
        numero = utilisateur.get("Téléphone")
        if not numero:
            await journaliser_action(identifiants.login, "connexion_echouee", {"motif": "OTP WhatsApp activé mais aucun téléphone enregistré"}, cabinet_code=utilisateur["CodeCabinet"])
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="La connexion par code WhatsApp est activée pour votre cabinet, mais aucun numéro de téléphone n'est enregistré sur votre compte. Contactez votre Administrateur.",
            )
        code = f"{secrets.randbelow(1000000):06d}"
        jeton_session = str(uuid4())
        await base[Collections.CODE_OTP].insert_one({
            "jeton_session": jeton_session, "login": utilisateur["Login"], "code": code,
            "expire_le": datetime.utcnow() + timedelta(minutes=DUREE_VALIDITE_OTP_MINUTES), "verifie": False,
        })
        config_wa = await base[Collections.CONFIGURATION_WHATSAPP].find_one({"cabinet_code": utilisateur["CodeCabinet"]})
        envoye = await envoyer_message_whatsapp_texte(
            config_wa, numero, f"Votre code de connexion SAWALI DentalCare : {code} (valable {DUREE_VALIDITE_OTP_MINUTES} minutes)."
        )
        await journaliser_action(identifiants.login, "otp_envoye", {"envoye": envoye}, cabinet_code=utilisateur["CodeCabinet"])
        return ReponseConnexion(otp_requis=True, jeton_session_otp=jeton_session, otp_envoye=envoye)

    return ReponseConnexion(**(await _emettre_jeton_final(base, utilisateur)).model_dump())


@router.post("/verifier-otp", response_model=JetonAcces)
async def verifier_otp(payload: VerificationOTP):
    """Seconde étape de la connexion OTP WhatsApp : valide le code à 6 chiffres et émet le jeton d'accès final."""
    base = obtenir_base()
    entree = await base[Collections.CODE_OTP].find_one({"jeton_session": payload.jeton_session_otp, "verifie": False})
    if not entree or entree["expire_le"] < datetime.utcnow():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Code invalide ou expiré. Reconnectez-vous.")
    if entree["code"] != payload.code.strip():
        await journaliser_action(entree["login"], "connexion_echouee", {"motif": "code OTP incorrect"})
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Code incorrect.")

    await base[Collections.CODE_OTP].update_one({"jeton_session": payload.jeton_session_otp}, {"$set": {"verifie": True}})
    utilisateur = await base[Collections.UTILISATEUR_BLG].find_one({"Login": entree["login"]})
    if not utilisateur:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Compte introuvable.")
    return await _emettre_jeton_final(base, utilisateur)
