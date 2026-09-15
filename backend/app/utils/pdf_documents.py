"""
app/utils/pdf_documents.py
------------------------------
Génération des documents PDF côté serveur avec ReportLab (§5 du cahier des
charges) :
  - generer_pdf_recu()        : reçu/proforma, fidèle au modèle "Clinique
                                 PHILADELPHIE" fourni (en-tête, n° Dossier,
                                 n° Reçu R-2026......, QR code, montant en
                                 lettres, tableau des prestations groupé par
                                 domaine, validité, caissier/poste)
  - generer_pdf_etat_de_caisse() : état de caisse (rapport caissier), fidèle
                                 au modèle fourni (liste chronologique des
                                 reçus, totaux par mode de règlement)
  - generer_pdf_rapport_dentiste() : rapport professionnel du dentiste (§4g)

NOTE dates : toutes les dates sont formatées manuellement en français
(jours/mois abrégés) plutôt que de dépendre de la locale du serveur (bug
identifié et corrigé lors du développement initial : la locale "fr_FR" n'est
pas toujours installée sur le serveur de déploiement).
"""

import io
from datetime import datetime

import qrcode
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_RIGHT

from app.utils.montant_lettres import montant_en_lettres

JOURS_FR = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"]
MOIS_FR = ["", "Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"]
MOIS_FR_LONG = ["", "janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"]


def formater_date_fr(dt: datetime, avec_heure: bool = True) -> str:
    """Formate une date en français sans dépendre de la locale du serveur (ex: 'Mar 24 Mar 2026 13:53')."""
    chaine = f"{JOURS_FR[dt.weekday()][:3]} {dt.day:02d} {MOIS_FR[dt.month]} {dt.year}"
    if avec_heure:
        chaine += f" {dt.hour:02d}:{dt.minute:02d}"
    return chaine


def formater_date_longue_fr(dt: datetime) -> str:
    """Ex: 'Mardi 24 Mars 2026' (utilisé sur la ligne 'ce jour' du reçu)."""
    return f"{JOURS_FR[dt.weekday()]} {dt.day} {MOIS_FR_LONG[dt.month].capitalize()} {dt.year}"


def _generer_qr_code_image(contenu: str, taille_mm: float = 20) -> Image:
    qr = qrcode.QRCode(box_size=4, border=1)
    qr.add_data(contenu)
    qr.make(fit=True)
    img_qr = qr.make_image(fill_color="black", back_color="white")
    buffer = io.BytesIO()
    img_qr.save(buffer, format="PNG")
    buffer.seek(0)
    return Image(buffer, width=taille_mm * mm, height=taille_mm * mm)


def generer_pdf_recu(vente: dict, patient: dict, cabinet: dict, caissier_login: str) -> bytes:
    """
    Reproduit le format du modèle "Clinique PHILADELPHIE" (voir pièce jointe
    de référence) adapté à l'identité du cabinet (SAWALI DentalCare par
    défaut, personnalisable depuis le module Administrateur).
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=15 * mm, bottomMargin=15 * mm, leftMargin=15 * mm, rightMargin=15 * mm)
    styles = getSampleStyleSheet()
    elements = []

    style_titre = ParagraphStyle("Titre", parent=styles["Heading1"], fontSize=16, textColor=colors.HexColor("#1c4587"))
    style_normal = styles["Normal"]
    style_droite = ParagraphStyle("Droite", parent=styles["Normal"], alignment=TA_RIGHT)
    style_montant = ParagraphStyle("Montant", parent=styles["Heading1"], fontSize=22, alignment=TA_CENTER, textColor=colors.HexColor("#1c4587"))

    maintenant = vente.get("DateHeure_Création", datetime.utcnow())

    # --- En-tête : logo/nom cabinet à gauche, date/heure à droite ---
    entete = Table(
        [[
            Paragraph(f"<b>{cabinet.get('denomination', 'SAWALI DentalCare')}</b>", style_titre),
            Paragraph(formater_date_fr(maintenant), style_droite),
        ]],
        colWidths=[110 * mm, 65 * mm],
    )
    elements.append(entete)
    coordonnees = (
        f"{cabinet.get('adresse', '')}<br/>"
        f"Tel: {cabinet.get('telephone', '')}<br/>"
        f"E-mail: {cabinet.get('email', '')}<br/>"
        f"Burkina Faso (+226)"
    )
    elements.append(Paragraph(coordonnees, style_normal))
    elements.append(Spacer(1, 8 * mm))

    # --- N° Dossier / N° Reçu / Montant + QR code ---
    dossier_num = vente.get("Dossier") or ""
    reference = vente.get("Référence", "")
    montant = vente.get("Montant", 0)

    qr_image = _generer_qr_code_image(reference)
    bloc_droite = Table(
        [
            [Paragraph(f"Dossier: <b>{dossier_num}</b>", style_normal), qr_image],
            [Paragraph(f"<i>{'PROFORMA' if vente.get('type_document') == 'Proforma' else 'RECU CAISSE'}</i> {reference}", style_normal), ""],
            [Paragraph(f"<font size=20><b>{montant:,.0f} {cabinet.get('devise', 'FCFA')}</b></font>".replace(",", " "), style_normal), ""],
        ],
        colWidths=[110 * mm, 25 * mm],
    )
    elements.append(bloc_droite)
    elements.append(Spacer(1, 4 * mm))

    # --- Identité complète (obligatoire sur tout reçu, §règles cliniques) ---
    identite = vente.get("identite_recu") or {}
    # Repli sur la fiche patient pour compatibilité avec d'anciens reçus
    # générés avant l'ajout de ce champ obligatoire.
    nom_patient = f"{identite.get('nom') or patient.get('Nom', '')} {identite.get('prenoms') or patient.get('Prénoms', '')}".strip()
    id_patient = patient.get("ID_Patient", patient.get("Numéro_Enreg", ""))
    civilite = "M." if identite.get("sexe") == "Masculin" else ("Mme" if identite.get("sexe") == "Féminin" else "Mr/Mme/Mlle")

    elements.append(Paragraph(civilite, style_normal))
    elements.append(Paragraph(f"<b>{id_patient}  {nom_patient}</b>", ParagraphStyle("Nom", parent=styles["Heading2"])))

    date_naissance_texte = ""
    if identite.get("date_naissance"):
        dn = identite["date_naissance"]
        if isinstance(dn, str):
            dn = datetime.fromisoformat(dn.replace("Z", "+00:00"))
        date_naissance_texte = dn.strftime("%d/%m/%Y")
    ligne_identite = "  •  ".join(filter(None, [
        f"Né(e) le {date_naissance_texte}" if date_naissance_texte else "",
        f"Tél: {identite.get('telephone')}" if identite.get("telephone") else "",
        identite.get("sexe") or "",
    ]))
    if ligne_identite:
        elements.append(Paragraph(ligne_identite, ParagraphStyle("Identite", parent=styles["Normal"], fontSize=9, textColor=colors.grey)))
    elements.append(Spacer(1, 2 * mm))

    mode = vente.get("mode_reglement", "Espèces")
    lettres = montant_en_lettres(montant, cabinet.get("devise", "FCFA"))
    verbe = "reçu en espèces" if mode == "Espèces" else "reçu"
    elements.append(Paragraph(f"Nous avons {verbe} la somme de {lettres}.", style_normal))
    elements.append(Spacer(1, 3 * mm))
    elements.append(Paragraph(f"ce jour  {formater_date_longue_fr(maintenant)}", style_normal))
    elements.append(Paragraph(
        f"<i>Pour élément(s) suivant(s):</i>  Caisse &nbsp;&nbsp;&nbsp; <b>{vente.get('Code Vendeur', caissier_login)}</b>  @{vente.get('Caisse', 'CAISSE1')}",
        style_normal,
    ))
    elements.append(Spacer(1, 5 * mm))

    # --- Tableau des prestations, groupé par domaine (comme le modèle fourni) ---
    lignes = vente.get("lignes", [])
    domaines_ordre: list[str] = []
    lignes_par_domaine: dict[str, list] = {}
    for ligne in lignes:
        d = ligne.get("domaine") or "PRESTATIONS ET SERVICES"
        if d not in lignes_par_domaine:
            lignes_par_domaine[d] = []
            domaines_ordre.append(d)
        lignes_par_domaine[d].append(ligne)

    NOMS_DOMAINES = {
        "CONS": "CONSULTATIONS", "CONSV": "SOINS CONSERVATEURS", "SCANAL": "ENDODONTIE",
        "SCHIRU": "CHIRURGIE", "SPARAD": "PARODONTOLOGIE", "PROTHE": "PROTHÈSES",
    }

    for domaine in domaines_ordre:
        nom_domaine = NOMS_DOMAINES.get(domaine, domaine)
        elements.append(Paragraph(f"<b>■ {nom_domaine}</b>  <i>Valable qu'une seule fois.</i>", style_normal))
        data = [["Description", "Qté", "Prix Unit.", "Ss-Total", "% Rem."]]
        for ligne in lignes_par_domaine[domaine]:
            data.append([
                ligne.get("libelle", ""),
                str(ligne.get("quantite", 1)),
                f"{ligne.get('prix_unitaire', 0):,.0f}".replace(",", " "),
                f"{ligne.get('sous_total', 0):,.0f}".replace(",", " "),
                f"{ligne.get('pourcentage_remise', 0):g}%" if ligne.get("pourcentage_remise") else "",
            ])
        table = Table(data, colWidths=[90 * mm, 15 * mm, 25 * mm, 25 * mm, 20 * mm])
        table.setStyle(TableStyle([
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("LINEBELOW", (0, 0), (-1, 0), 0.5, colors.grey),
            ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
            ("TOPPADDING", (0, 0), (-1, -1), 2),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ]))
        elements.append(table)
        elements.append(Spacer(1, 3 * mm))

    elements.append(Spacer(1, 3 * mm))
    from datetime import timedelta
    duree_validite = vente.get("DuréeValidité", 15)
    date_validite = (maintenant + timedelta(days=duree_validite)).replace(hour=23, minute=59, second=59)
    elements.append(Paragraph(
        f"Reçu Valable jusqu'au: <b>{date_validite.strftime('%d/%m/%Y %H:%M:%S')}</b>",
        ParagraphStyle("Petit", parent=styles["Normal"], fontSize=8, textColor=colors.grey),
    ))

    doc.build(elements)
    buffer.seek(0)
    return buffer.getvalue()


def generer_pdf_etat_de_caisse(caissier_login: str, periode_debut: datetime, periode_fin: datetime, recus: list[dict], cabinet: dict) -> bytes:
    """
    Reproduit le format de l'état de caisse fourni en exemple : liste
    chronologique des reçus de la période, totaux par mode de règlement.
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=12 * mm, bottomMargin=12 * mm, leftMargin=12 * mm, rightMargin=12 * mm)
    styles = getSampleStyleSheet()
    elements = []

    elements.append(Paragraph(f"Etat des encaissements pour le caissier [{caissier_login}]", styles["Heading2"]))
    elements.append(Paragraph(f"Imprimé le {formater_date_fr(datetime.utcnow())}", styles["Normal"]))
    elements.append(Paragraph(
        f"Période du {periode_debut.strftime('%d/%m/%Y')} au {periode_fin.strftime('%d/%m/%Y')}",
        styles["Normal"],
    ))
    elements.append(Spacer(1, 4 * mm))

    data = [["N° Reçu", "Patient", "Montant", "Date", "Heure", "Réglé", "Réf. Bon"]]
    total_especes = total_autres = total_bons = 0
    nb_especes = nb_autres = 0

    for recu in recus:
        mode = recu.get("mode_reglement", "Espèces")
        code_mode = "(e)" if mode == "Espèces" else "(c)"
        if mode == "Espèces":
            total_especes += recu.get("Montant", 0)
            nb_especes += 1
        else:
            total_autres += recu.get("Montant", 0)
            nb_autres += 1
        if recu.get("RéfBon"):
            total_bons += recu.get("PArtAssureur", 0)

        date_vente = recu.get("Date Vente", datetime.utcnow())
        data.append([
            recu.get("Référence", ""),
            recu.get("Libellé", ""),
            f"{recu.get('Montant', 0):,.0f}".replace(",", " "),
            date_vente.strftime("%d/%m/%y"),
            date_vente.strftime("%H:%M:%S"),
            code_mode,
            recu.get("RéfBon", ""),
        ])

    table = Table(data, colWidths=[28 * mm, 45 * mm, 22 * mm, 20 * mm, 18 * mm, 12 * mm, 25 * mm])
    table.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("GRID", (0, 0), (-1, 0), 0.5, colors.grey),
        ("LINEBELOW", (0, 0), (-1, -1), 0.25, colors.lightgrey),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#eef2fa")),
    ]))
    elements.append(table)
    elements.append(Spacer(1, 6 * mm))

    total_general = total_especes + total_autres
    recap = Table(
        [
            ["Espèces (e)", str(nb_especes), f"{total_especes:,.0f}".replace(",", " ")],
            ["Autres (c)", str(nb_autres), f"{total_autres:,.0f}".replace(",", " ")],
            ["TOTAL PARTS ASSUREURS / BONS", "", f"{total_bons:,.0f}".replace(",", " ")],
            ["TOTAL CAISSE", "", f"{total_general:,.0f}".replace(",", " ")],
        ],
        colWidths=[60 * mm, 20 * mm, 30 * mm],
    )
    recap.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("LINEABOVE", (0, -1), (-1, -1), 0.75, colors.black),
    ]))
    elements.append(recap)

    doc.build(elements)
    buffer.seek(0)
    return buffer.getvalue()


def generer_pdf_rapport_dentiste(dossier: dict, patient: dict, dentiste: dict, cabinet: dict) -> bytes:
    """Rapport professionnel du dentiste après intervention (§4g), archivable et envoyable par WhatsApp."""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=18 * mm, bottomMargin=18 * mm, leftMargin=18 * mm, rightMargin=18 * mm)
    styles = getSampleStyleSheet()
    elements = []

    elements.append(Paragraph(cabinet.get("denomination", "SAWALI DentalCare"), styles["Heading1"]))
    elements.append(Paragraph("Rapport professionnel dentaire", styles["Heading2"]))
    elements.append(Paragraph(formater_date_fr(datetime.utcnow()), styles["Normal"]))
    elements.append(Spacer(1, 6 * mm))

    nom_patient = f"{patient.get('Nom', '')} {patient.get('Prénoms', '')}".strip()
    elements.append(Paragraph(f"<b>Patient :</b> {nom_patient} (ID {patient.get('ID_Patient', '')})", styles["Normal"]))
    elements.append(Paragraph(f"<b>Praticien :</b> {dentiste.get('Titre', 'Dr')} {dentiste.get('Nom', '')} {dentiste.get('Prénoms', '')}", styles["Normal"]))
    elements.append(Spacer(1, 6 * mm))

    for titre, champ in [
        ("Indication", "DOS_INDICATION"),
        ("Résultats / actes réalisés", "DOS_RESULTATS"),
        ("Conclusion", "DOS_CONCLUSION"),
    ]:
        if dossier.get(champ):
            elements.append(Paragraph(f"<b>{titre}</b>", styles["Heading3"]))
            elements.append(Paragraph(dossier[champ], styles["Normal"]))
            elements.append(Spacer(1, 4 * mm))

    doc.build(elements)
    buffer.seek(0)
    return buffer.getvalue()
