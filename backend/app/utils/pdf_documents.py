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
from reportlab.lib.pagesizes import A4, A5
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_RIGHT

from app.utils.montant_lettres import montant_en_lettres
from app.utils.formatage import identite_patient_affichee

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


def _image_depuis_data_uri(data_uri: str, taille_mm: float = 18):
    """Décode un logo encodé en data URI base64 (ex: 'data:image/png;base64,...') en Image reportlab. Retourne None si invalide/absent."""
    if not data_uri or "," not in data_uri:
        return None
    try:
        import base64
        entete_donnees, donnees_b64 = data_uri.split(",", 1)
        contenu = base64.b64decode(donnees_b64)
        return Image(io.BytesIO(contenu), width=taille_mm * mm, height=taille_mm * mm)
    except Exception:
        return None


def generer_pdf_recu(vente: dict, patient: dict, cabinet: dict, caissier_login: str) -> bytes:
    """
    Reproduit le format du modèle "Clinique PHILADELPHIE" (voir pièce jointe
    de référence) adapté à l'identité du cabinet (SAWALI DentalCare par
    défaut, personnalisable depuis le module Administrateur).

    § demande utilisateur : format A5 (pas A4) — c'est le format d'impression
    réel d'un reçu de caisse, pas un document A4 classique.
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A5, topMargin=10 * mm, bottomMargin=10 * mm, leftMargin=10 * mm, rightMargin=10 * mm)
    styles = getSampleStyleSheet()
    elements = []

    style_titre = ParagraphStyle("Titre", parent=styles["Heading1"], fontSize=13, textColor=colors.HexColor("#1c4587"))
    style_normal = styles["Normal"]
    style_droite = ParagraphStyle("Droite", parent=styles["Normal"], alignment=TA_RIGHT)
    style_montant = ParagraphStyle("Montant", parent=styles["Heading1"], fontSize=22, alignment=TA_CENTER, textColor=colors.HexColor("#1c4587"))

    maintenant = vente.get("DateHeure_Création", datetime.utcnow())

    # --- En-tête : logo du cabinet (si téléchargé depuis Administration) + nom à gauche, date/heure à droite ---
    # § largeurs recalculées pour A5 (128 mm utiles = 148 - 2×10 mm de marge),
    # au prorata des proportions du gabarit A4 d'origine.
    logo_cabinet = _image_depuis_data_uri(cabinet.get("logo_url"), taille_mm=14)
    bloc_nom = Paragraph(f"<b>{cabinet.get('denomination', 'SAWALI DentalCare')}</b>", style_titre)
    if logo_cabinet:
        entete = Table(
            [[logo_cabinet, bloc_nom, Paragraph(formater_date_fr(maintenant), style_droite)]],
            colWidths=[16 * mm, 64 * mm, 48 * mm],
        )
    else:
        entete = Table(
            [[bloc_nom, Paragraph(formater_date_fr(maintenant), style_droite)]],
            colWidths=[80 * mm, 48 * mm],
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
    montant_total_prestations = vente.get("Montant", 0)
    # Si le reçu est pris en charge par une assurance, le montant à mettre
    # en avant (gros encadré, et somme réellement "reçue") est le NET dû par
    # le patient (PArtAssuré) — pas le total des prestations — le reste
    # étant exigible ultérieurement de l'assurance (§ demande utilisateur).
    part_assure = vente.get("PArtAssuré")
    part_assureur = vente.get("PArtAssureur")
    avec_assurance = part_assureur is not None and part_assureur > 0
    montant = part_assure if avec_assurance else montant_total_prestations

    qr_image = _generer_qr_code_image(reference, taille_mm=16)
    bloc_droite = Table(
        [
            [Paragraph(f"Dossier: <b>{dossier_num}</b>", style_normal), qr_image],
            [Paragraph(f"<i>{'PROFORMA' if vente.get('type_document') == 'Proforma' else 'RECU CAISSE'}</i> {reference}", style_normal), ""],
            [Paragraph(f"<font size=16><b>{montant:,.0f} {cabinet.get('devise', 'FCFA')}</b></font>".replace(",", " "), style_normal), ""],
        ],
        colWidths=[100 * mm, 28 * mm],
    )
    elements.append(bloc_droite)
    elements.append(Spacer(1, 4 * mm))

    # --- Identité complète (obligatoire sur tout reçu, §règles cliniques) ---
    identite = vente.get("identite_recu") or {}
    # Repli sur la fiche patient pour compatibilité avec d'anciens reçus
    # générés avant l'ajout de ce champ obligatoire.
    nom_patient = f"{identite.get('nom') or patient.get('Nom', '')} {identite.get('prenoms') or patient.get('Prénoms', '')}".strip()
    # § demande utilisateur : nom + ID entre parenthèses (jamais l'inverse) —
    # évite toute confusion entre homonymes. Priorité à l'ID figé sur le reçu
    # au moment de la vente (identite_recu.id_patient) ; à défaut, repli sur
    # la fiche patient actuelle (anciens reçus).
    id_patient = identite.get("id_patient") or patient.get("ID_Patient", patient.get("Numéro_Enreg", ""))
    civilite = "M." if identite.get("sexe") == "Masculin" else ("Mme" if identite.get("sexe") == "Féminin" else "Mr/Mme/Mlle")

    elements.append(Paragraph(civilite, style_normal))
    elements.append(Paragraph(f"<b>{nom_patient} ({id_patient})</b>", ParagraphStyle("Nom", parent=styles["Heading2"])))

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
    verbe = "reçu en espèces" if mode == "Espèces" else f"reçu par {mode}" if mode else "reçu"
    elements.append(Paragraph(f"Nous avons {verbe} la somme de {lettres}.", style_normal))
    if vente.get("reference_paiement"):
        elements.append(Paragraph(f"Référence de transaction : <b>{vente['reference_paiement']}</b>", ParagraphStyle("RefPaiement", parent=styles["Normal"], fontSize=9, textColor=colors.grey)))
    if avec_assurance:
        devise = cabinet.get("devise", "FCFA")
        total_fmt = f"{montant_total_prestations:,.0f}".replace(",", " ")
        assureur_fmt = f"{part_assureur:,.0f}".replace(",", " ")
        elements.append(Paragraph(
            f"Total des prestations : {total_fmt} {devise}  •  Part assurance (exigible ultérieurement) : {assureur_fmt} {devise}",
            ParagraphStyle("Repartition", parent=styles["Normal"], fontSize=9, textColor=colors.grey),
        ))
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

    # Suffixe "(46i)" / "(30u)" à la fin du libellé selon la numérotation
    # dentaire préférée du cabinet — les deux références restent de toute
    # façon enregistrées sur la ligne, quel que soit ce réglage d'affichage.
    numerotation = cabinet.get("numerotation_dentaire", "internationale")

    def _libelle_avec_dent(ligne: dict) -> str:
        libelle = ligne.get("libelle", "")
        num_intl = ligne.get("numero_dent_international") or ligne.get("numero_dent")
        num_univ = ligne.get("numero_dent_universel")
        if numerotation == "universelle" and num_univ:
            return f"{libelle} ({num_univ}u)"
        if numerotation != "universelle" and num_intl:
            return f"{libelle} ({num_intl}i)"
        return libelle

    for domaine in domaines_ordre:
        nom_domaine = NOMS_DOMAINES.get(domaine, domaine)
        elements.append(Paragraph(f"<b>■ {nom_domaine}</b>  <i>Valable qu'une seule fois.</i>", style_normal))
        data = [["Description", "Qté", "Prix Unit.", "Ss-Total", "% Rem."]]
        for ligne in lignes_par_domaine[domaine]:
            data.append([
                _libelle_avec_dent(ligne),
                str(ligne.get("quantite", 1)),
                f"{ligne.get('prix_unitaire', 0):,.0f}".replace(",", " "),
                f"{ligne.get('sous_total', 0):,.0f}".replace(",", " "),
                f"{ligne.get('pourcentage_remise', 0):g}%" if ligne.get("pourcentage_remise") else "",
            ])
        table = Table(data, colWidths=[62 * mm, 11 * mm, 20 * mm, 20 * mm, 15 * mm])
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

    § demande utilisateur : les reçus annulés apparaissent barrés dans la
    liste, mais leur montant n'entre PAS dans les totaux "Total caisse" —
    seule une ligne séparée "Total reçus annulés" les récapitule, pour la
    traçabilité sans fausser le montant réellement en caisse.
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=12 * mm, bottomMargin=12 * mm, leftMargin=12 * mm, rightMargin=12 * mm)
    styles = getSampleStyleSheet()
    style_annule = ParagraphStyle("Annule", parent=styles["Normal"], fontSize=8, textColor=colors.HexColor("#e0392b"))
    elements = []

    elements.append(Paragraph(f"Etat des encaissements pour le caissier [{caissier_login}]", styles["Heading2"]))
    elements.append(Paragraph(f"Imprimé le {formater_date_fr(datetime.utcnow())}", styles["Normal"]))
    elements.append(Paragraph(
        f"Période du {periode_debut.strftime('%d/%m/%Y')} au {periode_fin.strftime('%d/%m/%Y')}",
        styles["Normal"],
    ))
    elements.append(Spacer(1, 4 * mm))

    data = [["N° Reçu", "Patient", "Montant", "Date", "Heure", "Réglé", "Réf. Bon"]]
    total_especes = total_autres = total_bons = total_annule = 0
    nb_especes = nb_autres = nb_annules = 0

    for recu in recus:
        est_annule = bool(recu.get("annule"))
        mode = recu.get("mode_reglement", "Espèces")
        code_mode = "(e)" if mode == "Espèces" else "(c)"
        montant = recu.get("Montant", 0)

        if est_annule:
            nb_annules += 1
            total_annule += montant
        elif mode == "Espèces":
            total_especes += montant
            nb_especes += 1
        else:
            total_autres += montant
            nb_autres += 1
        if not est_annule and recu.get("RéfBon"):
            total_bons += recu.get("PArtAssureur", 0)

        date_vente = recu.get("Date Vente", datetime.utcnow())
        montant_fmt = f"{montant:,.0f}".replace(",", " ")
        patient_affiche = identite_patient_affichee(recu)
        if est_annule:
            # Ligne barrée (§ demande utilisateur) : Paragraph avec balise
            # <strike>, seule façon d'obtenir un texte barré avec reportlab
            # dans une cellule de tableau.
            data.append([
                Paragraph(f"<strike>{recu.get('Référence', '')}</strike> (ANNULÉ)", style_annule),
                Paragraph(f"<strike>{patient_affiche}</strike>", style_annule),
                Paragraph(f"<strike>{montant_fmt}</strike>", style_annule),
                Paragraph(f"<strike>{date_vente.strftime('%d/%m/%y')}</strike>", style_annule),
                Paragraph(f"<strike>{date_vente.strftime('%H:%M:%S')}</strike>", style_annule),
                code_mode, recu.get("RéfBon", ""),
            ])
        else:
            data.append([
                recu.get("Référence", ""), patient_affiche, montant_fmt,
                date_vente.strftime("%d/%m/%y"), date_vente.strftime("%H:%M:%S"),
                code_mode, recu.get("RéfBon", ""),
            ])

    table = Table(data, colWidths=[28 * mm, 45 * mm, 22 * mm, 20 * mm, 18 * mm, 12 * mm, 25 * mm])
    table.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("GRID", (0, 0), (-1, 0), 0.5, colors.grey),
        ("LINEBELOW", (0, 0), (-1, -1), 0.25, colors.lightgrey),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#eef2fa")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    elements.append(table)
    elements.append(Spacer(1, 6 * mm))

    total_general = total_especes + total_autres
    recap = Table(
        [
            ["Espèces (e)", str(nb_especes), f"{total_especes:,.0f}".replace(",", " ")],
            ["Autres (c)", str(nb_autres), f"{total_autres:,.0f}".replace(",", " ")],
            ["TOTAL PARTS ASSUREURS / BONS", "", f"{total_bons:,.0f}".replace(",", " ")],
            ["TOTAL CAISSE (reçus encaissés)", "", f"{total_general:,.0f}".replace(",", " ")],
            [f"Reçus annulés ({nb_annules})", "", f"{total_annule:,.0f}".replace(",", " ")],
        ],
        colWidths=[60 * mm, 20 * mm, 30 * mm],
    )
    recap.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("FONTNAME", (0, -2), (-1, -2), "Helvetica-Bold"),
        ("LINEABOVE", (0, -2), (-1, -2), 0.75, colors.black),
        ("TEXTCOLOR", (0, -1), (-1, -1), colors.HexColor("#e0392b")),
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
    elements.append(Paragraph(f"<b>Patient :</b> {nom_patient} ({patient.get('ID_Patient', '')})", styles["Normal"]))
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


def generer_pdf_ordonnance(ordonnance: dict, patient: dict, dentiste: dict, cabinet: dict) -> bytes:
    """
    Ordonnance dentaire (§ demande utilisateur) — le patient l'utilise pour
    acheter les produits recommandés par son médecin traitant. Reproduit en
    bas de page, à la demande (afficher_schema_dentaire, "oui" par défaut),
    la liste des dents traitées pour ce dossier — sous forme de tableau
    (numérotation FDI, telle qu'enregistrée sur le schéma interactif), plus
    lisible et fiable à l'impression qu'un schéma graphique miniature.
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=18 * mm, bottomMargin=18 * mm, leftMargin=18 * mm, rightMargin=18 * mm)
    styles = getSampleStyleSheet()
    elements = []

    elements.append(Paragraph(cabinet.get("denomination", "SAWALI DentalCare"), styles["Heading1"]))
    if cabinet.get("adresse") or cabinet.get("telephone"):
        elements.append(Paragraph(f"{cabinet.get('adresse', '')} — {cabinet.get('telephone', '') or ''}", ParagraphStyle("Coord", parent=styles["Normal"], fontSize=9, textColor=colors.grey)))
    elements.append(Paragraph("ORDONNANCE", styles["Heading2"]))
    elements.append(Paragraph(formater_date_fr(ordonnance.get("date_creation") or datetime.utcnow()), styles["Normal"]))
    elements.append(Spacer(1, 6 * mm))

    nom_patient = f"{patient.get('Nom', '')} {patient.get('Prénoms', '')}".strip()
    elements.append(Paragraph(f"<b>Patient :</b> {nom_patient} ({patient.get('ID_Patient', '')})", styles["Normal"]))
    elements.append(Paragraph(f"<b>Médecin traitant :</b> {dentiste.get('Titre', 'Dr')} {dentiste.get('Nom', '')} {dentiste.get('Prénoms', '')}", styles["Normal"]))
    elements.append(Paragraph(f"<b>Référence :</b> {ordonnance.get('reference', '')}", ParagraphStyle("Ref", parent=styles["Normal"], fontSize=9, textColor=colors.grey)))
    elements.append(Spacer(1, 8 * mm))

    lignes = ordonnance.get("lignes") or []
    if lignes:
        donnees_tableau = [["Désignation", "Posologie / Instructions", "Durée", "Qté"]]
        for ligne in lignes:
            donnees_tableau.append([
                ligne.get("designation", ""), ligne.get("posologie", "") or "-",
                ligne.get("duree", "") or "-", ligne.get("quantite", "") or "-",
            ])
        table = Table(donnees_tableau, colWidths=[65 * mm, 65 * mm, 25 * mm, 15 * mm])
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1c4587")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#dfe6f0")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f7f9fc")]),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]))
        elements.append(table)
    else:
        elements.append(Paragraph("Aucune ligne prescrite.", styles["Normal"]))
    elements.append(Spacer(1, 10 * mm))

    if ordonnance.get("afficher_schema_dentaire"):
        actes_par_dent = ordonnance.get("_actes_par_dent") or []
        elements.append(Paragraph("Dents traitées (schéma dentaire de ce dossier)", styles["Heading3"]))
        if actes_par_dent:
            donnees_dents = [["Dent (FDI)", "Acte", "Statut"]]
            for a in actes_par_dent:
                donnees_dents.append([str(a.get("numero_dent", "")), a.get("libelle_acte", ""), a.get("statut", "")])
            table_dents = Table(donnees_dents, colWidths=[25 * mm, 90 * mm, 55 * mm])
            table_dents.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#eef2fa")),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#dfe6f0")),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]))
            elements.append(table_dents)
        else:
            elements.append(Paragraph("Aucune dent renseignée sur le schéma de ce dossier.", ParagraphStyle("Vide", parent=styles["Normal"], fontSize=9, textColor=colors.grey)))

    elements.append(Spacer(1, 14 * mm))
    elements.append(Paragraph("Signature et cachet du praticien :", ParagraphStyle("Signature", parent=styles["Normal"], fontSize=9, textColor=colors.grey)))

    doc.build(elements)
    buffer.seek(0)
    return buffer.getvalue()
