"""
app/utils/smtp_api.py
-----------------------
§ demande utilisateur : envoi réel d'email via SMTP, en utilisant les
identifiants propres à un cabinet OU de la plateforme (voir
app/models/configuration_smtp.py, CODE_PLATEFORME pour le super-admin).

Utilise `smtplib` (bibliothèque standard, aucune nouvelle dépendance à
installer/déployer) plutôt qu'un client SMTP asynchrone tiers. `smtplib`
étant synchrone/bloquant, l'envoi est délégué à un thread
(`asyncio.to_thread`) pour ne jamais bloquer la boucle d'événements FastAPI
pendant la connexion/authentification au serveur SMTP distant.

Chaque fonction retourne (succès, message) — jamais un simple booléen —
pour que le bouton "Tester" (Administration/Plateforme → Communication)
puisse afficher au super-admin/administrateur la RAISON précise d'un échec
(authentification refusée, hôte injoignable, config incomplète...), pas
seulement "ça ne marche pas".
"""

import asyncio
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.application import MIMEApplication


async def envoyer_email(
    config: dict | None,
    destinataire: str,
    sujet: str,
    corps: str,
    corps_html: str | None = None,
    piece_jointe: bytes | None = None,
    nom_piece_jointe: str | None = None,
) -> tuple[bool, str]:
    """
    Envoie un email au destinataire donné, avec les identifiants de
    `config` (document ConfigurationSMTP). Retourne (succès, message).

    § demande utilisateur (Relevés de Bons — "l'envoyer par WhatsApp/eMail
    d'un contact") : `piece_jointe`/`nom_piece_jointe` optionnels, ajoutés
    ici plutôt que dans une fonction séparée pour que TOUS les appelants
    existants (sans pièce jointe) restent inchangés — un seul point
    d'envoi SMTP dans toute l'application.
    """
    if not config or not config.get("hote") or not config.get("utilisateur") or not config.get("mot_de_passe"):
        return False, "Configuration SMTP incomplète (hôte, utilisateur ou mot de passe manquant)."
    if not destinataire or "@" not in destinataire:
        return False, "Adresse email destinataire manquante ou invalide."

    adresse_expediteur = config.get("adresse_expediteur") or config["utilisateur"]
    nom_expediteur = config.get("nom_expediteur")

    def _envoyer_sync():
        message = MIMEMultipart("mixed" if piece_jointe else "alternative")
        message["Subject"] = sujet
        message["From"] = f"{nom_expediteur} <{adresse_expediteur}>" if nom_expediteur else adresse_expediteur
        message["To"] = destinataire
        corps_alternatif = MIMEMultipart("alternative") if piece_jointe else message
        corps_alternatif.attach(MIMEText(corps, "plain", "utf-8"))
        if corps_html:
            corps_alternatif.attach(MIMEText(corps_html, "html", "utf-8"))
        if piece_jointe:
            message.attach(corps_alternatif)
            piece = MIMEApplication(piece_jointe, _subtype="pdf")
            piece.add_header("Content-Disposition", "attachment", filename=nom_piece_jointe or "document.pdf")
            message.attach(piece)
        with smtplib.SMTP(config["hote"], int(config.get("port") or 587), timeout=12) as serveur:
            if config.get("utiliser_tls", True):
                serveur.starttls()
            serveur.login(config["utilisateur"], config["mot_de_passe"])
            serveur.sendmail(adresse_expediteur, [destinataire], message.as_string())

    try:
        await asyncio.to_thread(_envoyer_sync)
        return True, f"Email envoyé avec succès à {destinataire}."
    except smtplib.SMTPAuthenticationError:
        return False, "Authentification SMTP refusée — vérifiez l'utilisateur et le mot de passe."
    except smtplib.SMTPConnectError as exc:
        return False, f"Connexion au serveur SMTP refusée : {exc}"
    except smtplib.SMTPRecipientsRefused:
        return False, f"Le serveur SMTP a refusé l'adresse destinataire ({destinataire})."
    except smtplib.SMTPException as exc:
        return False, f"Erreur SMTP : {exc}"
    except (OSError, TimeoutError) as exc:
        return False, f"Connexion au serveur SMTP impossible (hôte/port incorrect ou injoignable) : {exc}"
