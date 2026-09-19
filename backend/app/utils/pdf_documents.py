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
import re
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
from app.utils.verification_documents import creer_jeton_verification, construire_url_verification
from reportlab.graphics.shapes import Drawing, Rect, String, Path, Group

JOURS_FR = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"]
MOIS_FR = ["", "Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"]
MOIS_FR_LONG = ["", "janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"]

# § remonté au niveau module (auparavant local à generer_pdf_recu) pour être
# réutilisé par les Relevés de Bons (generer_pdf_releve_bons_simple /
# _detaille) — même vocabulaire de "Motif"/domaine partout dans les
# documents imprimés.
NOMS_DOMAINES = {
    "CONS": "CONSULTATIONS", "CONSV": "SOINS CONSERVATEURS", "SCANAL": "ENDODONTIE",
    "SCHIRU": "CHIRURGIE", "SPARAD": "PARODONTOLOGIE", "PROTHE": "PROTHÈSES",
}


def _intitule_assurance(assurance: dict) -> str:
    """
    § demande utilisateur : "afficher les intitulés des Assurances [...]
    pas les codes" — sur les Relevés de Bons (documents officiels adressés
    à l'assureur), le nom COMPLET (`intitule`, ex: "OLEA Assurances SA")
    prime toujours sur le code interne court (`nom`, ex: "OLEA80" — utilisé
    ailleurs dans l'application pour une sélection rapide) ; si aucun
    intitulé n'a encore été renseigné pour ce cabinet, `nom` sert de repli
    pour ne jamais laisser le champ vide.
    """
    return assurance.get("intitule") or assurance.get("nom", "")


def _motif_vente(vente: dict) -> str:
    """§ demande utilisateur (Relevés de Bons) : "Motif" = le domaine des
    actes de la vente s'ils sont tous identiques, sinon un intitulé
    générique — jamais un libellé technique brut (code domaine)."""
    domaines = {l.get("domaine") for l in (vente.get("lignes") or []) if l.get("domaine")}
    if len(domaines) == 1:
        d = next(iter(domaines))
        return NOMS_DOMAINES.get(d, d)
    return "PRESTATIONS ET SERVICES"


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


# § demande utilisateur : "l'impression du reçu affiche [...] une liste des
# dents affectées [...] au lieu du schéma dentaire avec les dents
# concernées marquées" — remplace le récapitulatif texte ("Dents
# concernées : 18i, 28i, 38i") par un schéma dentaire dessiné (32 dents, 2
# arcades), avec les dents concernées par CE reçu mises en évidence.
# Même ordre de lecture que le schéma interactif du frontend
# (SchemaDentaire.jsx) — arcade du haut de gauche à droite (18→28), arcade
# du bas de gauche à droite (48→38) — pour que le document imprimé
# corresponde visuellement à ce que le caissier a vu à l'écran.
_ORDRE_DENTS_FDI = [
    [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28],
    [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38],
]
_ORDRE_DENTS_UNIVERSEL = [
    list(range(1, 17)),
    list(range(17, 33)),
]
# § équivalent FDI de chaque position universelle — utilisé UNIQUEMENT pour
# déterminer la FORME anatomique (incisive/canine/prémolaire/molaire) de
# chaque dent ; le numéro AFFICHÉ reste bien celui du référentiel choisi
# (voir _ORDRE_DENTS_UNIVERSEL ci-dessus), exactement comme le fait le
# schéma interactif du frontend (typeDent() y est toujours appelé avec le
# numéro FDI, jamais le numéro affiché).
_ORDRE_DENTS_UNIVERSEL_EQUIVALENT_FDI = [
    [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28],
    [38, 37, 36, 35, 34, 33, 32, 31, 41, 42, 43, 44, 45, 46, 47, 48],
]


def _type_dent(numero_fdi: int) -> str:
    """§ même règle que SchemaDentaire.jsx::typeDent (frontend) — la forme
    d'une dent dépend de sa position sur l'arcade, jamais du référentiel de
    numérotation choisi pour l'affichage."""
    position = numero_fdi % 10
    if position <= 2:
        return "incisive"
    if position == 3:
        return "canine"
    if position <= 5:
        return "premolaire"
    return "molaire"


# § tracés canoniques EXACTEMENT identiques à SchemaDentaire.jsx::formeDent
# (mêmes chaînes de commandes SVG) — pour que le reçu imprimé montre la
# MÊME silhouette de dent que ce que le caissier a vu à l'écran, jamais une
# approximation différente.
_FORMES_DENT_CANONIQUES = {
    "incisive": {
        "couronne": "M -8,2 Q -8,0 -6,0 L 6,0 Q 8,0 8,2 L 7,15 Q 0,19 -7,15 Z",
        "racines": ["M -5,15 C -6,24 -3,32 0,36 C 3,32 6,24 5,15 Z"],
    },
    "canine": {
        "couronne": "M -8,4 Q -6,0 0,-3 Q 6,0 8,4 L 7,16 Q 0,21 -7,16 Z",
        "racines": ["M -5,16 C -6,27 -3,37 0,42 C 3,37 6,27 5,16 Z"],
    },
    "premolaire": {
        "couronne": "M -10,3 Q -10,0 -7,0 L 7,0 Q 10,0 10,3 L 9,15 Q 0,19 -9,15 Z",
        "racines": [
            "M -7,15 C -9,23 -7,29 -3,33 C -1,29 -1,20 -2,15 Z",
            "M 7,15 C 9,23 7,29 3,33 C 1,29 1,20 2,15 Z",
        ],
    },
    "molaire": {
        "couronne": "M -13,4 Q -13,0 -9,0 Q -4,2 0,0 Q 4,2 9,0 Q 13,0 13,4 L 12,15 Q 0,19 -12,15 Z",
        "racines": [
            "M -10,15 C -12,22 -10,27 -6,31 C -4,27 -4,20 -5,15 Z",
            "M 0,16 C -1,23 0,28 0,32 C 1,28 1,22 1,16 Z",
            "M 10,15 C 12,22 10,27 6,31 C 4,27 4,20 5,15 Z",
        ],
    },
}
_HAUTEUR_CANONIQUE_MAX = 42  # racine la plus longue (canine) — dimensionne l'espace réservé à CHAQUE rangée


def _tracer_chemin_svg(chemin: Path, d: str, signe_y: float, echelle: float, dx: float, dy: float):
    """
    Applique une chaîne de commandes SVG (M/L/Q/C/Z, coordonnées ABSOLUES —
    la seule syntaxe utilisée par _FORMES_DENT_CANONIQUES ci-dessus) à un
    Path reportlab, avec mise à l'échelle/translation/miroir vertical
    (`signe_y` : +1 rangée du bas, -1 rangée du haut — voir
    _dessiner_schema_dentaire) au passage. Les courbes quadratiques Q sont
    converties en cubiques (seule primitive que reportlab sait tracer) par
    la formule standard CP = P0 + 2/3·(Q-P0).
    """
    jetons = re.findall(r"[MLQCZ]|-?\d*\.?\d+", d)
    i = 0
    commande = None
    point_courant = (0.0, 0.0)

    def _vers_page(x, y):
        return (dx + x * echelle, dy + signe_y * y * echelle)

    while i < len(jetons):
        if jetons[i] in "MLQCZ":
            commande = jetons[i]
            i += 1
        nb_args = {"M": 2, "L": 2, "Q": 4, "C": 6, "Z": 0}[commande]
        args = [float(jetons[i + k]) for k in range(nb_args)]
        i += nb_args
        if commande == "M":
            point_courant = (args[0], args[1])
            chemin.moveTo(*_vers_page(*point_courant))
        elif commande == "L":
            point_courant = (args[0], args[1])
            chemin.lineTo(*_vers_page(*point_courant))
        elif commande == "Q":
            cx, cy, x, y = args
            x0, y0 = point_courant
            cp1 = (x0 + 2 / 3 * (cx - x0), y0 + 2 / 3 * (cy - y0))
            cp2 = (x + 2 / 3 * (cx - x), y + 2 / 3 * (cy - y))
            chemin.curveTo(*_vers_page(*cp1), *_vers_page(*cp2), *_vers_page(x, y))
            point_courant = (x, y)
        elif commande == "C":
            x1, y1, x2, y2, x, y = args
            chemin.curveTo(*_vers_page(x1, y1), *_vers_page(x2, y2), *_vers_page(x, y))
            point_courant = (x, y)
        elif commande == "Z":
            chemin.closePath()


def _dessiner_dent(numero_fdi: int, marquee: bool, signe_y: float, echelle: float, dx: float, dy: float, groupe: Group):
    """Ajoute une dent complète (racine(s) + couronne) au groupe, à la position (dx, dy) — voir _dessiner_schema_dentaire pour le repère."""
    forme = _FORMES_DENT_CANONIQUES[_type_dent(numero_fdi)]
    couleur_racine_remplissage = colors.HexColor("#f3ede2")
    couleur_racine_contour = colors.HexColor("#cbbfa3")
    couleur_couronne_remplissage = colors.HexColor("#1c4587") if marquee else colors.white
    couleur_couronne_contour = colors.HexColor("#1c4587") if marquee else colors.HexColor("#9aa7b8")

    for d_racine in forme["racines"]:
        chemin_racine = Path(fillColor=couleur_racine_remplissage, strokeColor=couleur_racine_contour, strokeWidth=0.25)
        _tracer_chemin_svg(chemin_racine, d_racine, signe_y, echelle, dx, dy)
        groupe.add(chemin_racine)

    chemin_couronne = Path(fillColor=couleur_couronne_remplissage, strokeColor=couleur_couronne_contour, strokeWidth=0.35)
    _tracer_chemin_svg(chemin_couronne, forme["couronne"], signe_y, echelle, dx, dy)
    groupe.add(chemin_couronne)


def _dessiner_schema_dentaire(numeros_dents_marques: set, numerotation: str = "internationale", largeur_mm: float = 128) -> Drawing:
    """
    Dessine un schéma dentaire compact (2 arcades de 16 dents, silhouettes
    anatomiques réelles — § demande utilisateur : "pourquoi ne pas
    imprimer avec l'image des dents plutôt que des carrés ? Je préfère le
    schéma.") avec les dents de `numeros_dents_marques` mises en évidence
    — chaque numéro DOIT déjà être exprimé dans le référentiel
    `numerotation` demandé (FDI ou universel), résolu par l'appelant (voir
    generer_pdf_recu).
    """
    ordre = _ORDRE_DENTS_UNIVERSEL if numerotation == "universelle" else _ORDRE_DENTS_FDI
    ordre_fdi = _ORDRE_DENTS_UNIVERSEL_EQUIVALENT_FDI if numerotation == "universelle" else _ORDRE_DENTS_FDI
    nb_par_rangee = 16
    marge_laterale = 3
    largeur_utile = largeur_mm - 2 * marge_laterale
    largeur_colonne = largeur_utile / nb_par_rangee

    echelle = 0.155  # mm par unité canonique (silhouette ~42 unités de haut -> ~6.5 mm de couronne+racine)
    hauteur_rangee = _HAUTEUR_CANONIQUE_MAX * echelle + 4  # + marge pour le numéro affiché
    hauteur_totale = 2 * hauteur_rangee + 2  # + un petit espace entre les deux arcades (ligne de contact)

    dessin = Drawing(largeur_mm * mm, hauteur_totale * mm)
    ligne_gingivale = [
        (hauteur_totale - hauteur_rangee) * mm,  # rangée du haut : ligne de contact en BAS de sa bande (racines vers le haut)
        hauteur_rangee * mm,                     # rangée du bas : ligne de contact en HAUT de sa bande (racines vers le bas)
    ]
    signes_y = [1, -1]  # rangée du haut : +1 (racine vers le haut) ; rangée du bas : -1 (racine vers le bas) — voir _tracer_chemin_svg

    for indice_rangee, (rangee, rangee_fdi) in enumerate(zip(ordre, ordre_fdi)):
        for indice_colonne, (numero_dent, numero_fdi) in enumerate(zip(rangee, rangee_fdi)):
            x_centre = (marge_laterale + (indice_colonne + 0.5) * largeur_colonne) * mm
            groupe_dent = Group()
            _dessiner_dent(numero_fdi, numero_dent in numeros_dents_marques, signes_y[indice_rangee], echelle * mm, x_centre, ligne_gingivale[indice_rangee], groupe_dent)
            dessin.add(groupe_dent)
            y_texte = ligne_gingivale[indice_rangee] + signes_y[indice_rangee] * (_HAUTEUR_CANONIQUE_MAX * echelle + 2.2) * mm
            dessin.add(String(
                x_centre, y_texte - 1.2 * mm, str(numero_dent), textAnchor="middle", fontSize=5.5,
                fillColor=colors.HexColor("#1c4587") if numero_dent in numeros_dents_marques else colors.HexColor("#7a8699"),
            ))
    return dessin


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
    # § bug corrigé ("montants en surbrillance mal calculés") : ce calcul ne
    # tenait compte QUE de l'assurance — un reçu PARTIELLEMENT réglé (sans
    # assurance) affichait en gros le montant TOTAL, jamais le reste
    # réellement dû, ce qui est la donnée actionnable pour ce document.
    montant_regle = vente.get("MontantRéglé", 0) or 0
    reste_a_payer = round(montant_total_prestations - montant_regle, 2)
    partiellement_regle = 0.01 < reste_a_payer < montant_total_prestations - 0.01
    # Si le reçu est pris en charge par une assurance, le montant à mettre
    # en avant (gros encadré, et somme réellement "reçue") est le NET dû par
    # le patient (PArtAssuré) — pas le total des prestations — le reste
    # étant exigible ultérieurement de l'assurance (§ demande utilisateur).
    part_assure = vente.get("PArtAssuré")
    part_assureur = vente.get("PArtAssureur")
    avec_assurance = part_assureur is not None and part_assureur > 0
    if avec_assurance:
        montant = part_assure
    elif partiellement_regle:
        montant = reste_a_payer  # § le reste à payer, pas le total — voir ci-dessus
    else:
        montant = montant_total_prestations

    qr_image = _generer_qr_code_image(reference, taille_mm=16)
    lignes_bloc_droit = [
        [Paragraph(f"Dossier: <b>{dossier_num}</b>", style_normal), qr_image],
        [Paragraph(f"<i>{'PROFORMA' if vente.get('type_document') == 'Proforma' else 'RECU CAISSE'}</i> {reference}", style_normal), ""],
        [Paragraph(f"<font size=16><b>{montant:,.0f} {cabinet.get('devise', 'FCFA')}</b></font>".replace(",", " ") + (" <i>(reste à payer)</i>" if partiellement_regle and not avec_assurance else ""), style_normal), ""],
    ]
    if partiellement_regle and not avec_assurance:
        # § précise le total et ce qui a déjà été réglé, pour ne jamais
        # laisser le lecteur croire que le montant en gros EST le total.
        lignes_bloc_droit.append([
            Paragraph(f"<font size=9>Total : {montant_total_prestations:,.0f} {cabinet.get('devise', 'FCFA')} — Déjà réglé : {montant_regle:,.0f} {cabinet.get('devise', 'FCFA')}</font>".replace(",", " "), style_normal),
            "",
        ])
    bloc_droite = Table(lignes_bloc_droit, colWidths=[100 * mm, 28 * mm])
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
    # § la phrase "nous avons reçu la somme de..." doit toujours décrire ce
    # qui a été RÉELLEMENT encaissé — jamais le reste à payer affiché en
    # gros ci-dessus pour un règlement partiel (deux informations
    # différentes, ne jamais les confondre).
    montant_recu_reellement = montant_regle if partiellement_regle else montant
    lettres = montant_en_lettres(montant_recu_reellement, cabinet.get("devise", "FCFA"))
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

    # § NOMS_DOMAINES est désormais une constante de module (voir en tête
    # de fichier), réutilisée aussi par les Relevés de Bons.

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
        # § bug corrigé : un libellé long ("CONSULTATION DE SUIVI /
        # CONTRÔLE POST-OPÉRATOIRE") écrasait la colonne Qté — une simple
        # chaîne ne se retourne JAMAIS à la ligne dans une cellule de
        # tableau ReportLab (elle dépasse silencieusement dans la colonne
        # suivante). Un Paragraph, lui, se retourne correctement à la
        # ligne — la hauteur de la ligne s'ajuste automatiquement.
        style_description = ParagraphStyle("Description", parent=styles["Normal"], fontSize=9, leading=11)
        data = [["Description", "Qté", "Prix Unit.", "Ss-Total", "% Rem."]]
        for ligne in lignes_par_domaine[domaine]:
            data.append([
                Paragraph(_libelle_avec_dent(ligne), style_description),
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
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
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

    # § demande utilisateur : "les dents affectées par un reçu doivent être
    # imprimées sur un reçu en bas du détail du reçu (tout en bas)" — en
    # plus du suffixe déjà présent sur chaque ligne individuelle
    # (_libelle_avec_dent), un récapitulatif dédié, numéros DÉDOUBLONNÉS et
    # triés, dans la MÊME numérotation que le reste du document (réglage du
    # cabinet). Placé après "Reçu Valable jusqu'au" — dernier élément du
    # document, donc bien "tout en bas".
    # § demande utilisateur : "l'impression du reçu affiche [...] une liste
    # des dents affectées [...] au lieu du schéma dentaire avec les dents
    # concernées marquées" — remplace le récapitulatif TEXTE par un schéma
    # dentaire DESSINÉ (32 dents, 2 arcades), dents concernées par ce reçu
    # mises en évidence — numéros DÉDOUBLONNÉS, dans la MÊME numérotation
    # que le reste du document (réglage du cabinet).
    numeros_dents: list[int] = []
    for ligne in lignes:
        num = ligne.get("numero_dent_universel") if numerotation == "universelle" else (ligne.get("numero_dent_international") or ligne.get("numero_dent"))
        if num and num not in numeros_dents:
            numeros_dents.append(num)
    if numeros_dents:
        elements.append(Spacer(1, 3 * mm))
        elements.append(Paragraph(
            "Dents concernées",
            ParagraphStyle("DentsConcerneesTitre", parent=styles["Normal"], fontSize=8.5, textColor=colors.HexColor("#4a5568")),
        ))
        elements.append(Spacer(1, 1 * mm))
        elements.append(_dessiner_schema_dentaire(set(numeros_dents), numerotation, largeur_mm=128))

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

    § demande utilisateur (QR code sécurisé) : "apposer un QR Code crypté:
    Cabinet, Caissier, Montants, nombre de lignes. Cela sécurise ce document
    de gestion." Le jeton est construit ICI, à partir des totaux réellement
    calculés par cette fonction (jamais recalculés/transmis séparément par
    l'appelant) — garantit que le QR ne peut jamais diverger de ce qui est
    imprimé. Falsifier le document (changer un montant à la main) ne change
    pas ce que le QR révèle : la fraude devient détectable en le scannant.
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
        # § cohérence des données (demande explicite de l'utilisateur) : un
        # état de CAISSE doit refléter l'argent RÉELLEMENT dans le tiroir —
        # jamais le montant facturé. Un reçu partiellement réglé (ex: 10 000
        # perçus sur 30 000 facturés) ne met que 10 000 F dans la caisse.
        montant = recu.get("MontantRéglé", 0) if not est_annule else recu.get("Montant", 0)
        montant = montant or 0

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

    # § demande utilisateur (QR code sécurisé) : construit une fois les
    # totaux réellement connus (nombre_lignes = reçus effectivement
    # comptés dans "TOTAL CAISSE", jamais les annulés). Inséré en haut du
    # document (position 0), à côté de l'en-tête.
    nombre_lignes = nb_especes + nb_autres
    jeton_verification = creer_jeton_verification("etat-caisse", {
        "cabinet_code": cabinet.get("code_cabinet"), "caissier": caissier_login,
        "montant_total": round(total_general, 2), "nombre_lignes": nombre_lignes,
    })
    qr_image = _generer_qr_code_image(construire_url_verification("etat-caisse", jeton_verification), taille_mm=22)
    entete_avec_qr = Table([[elements[:4], qr_image]], colWidths=[145 * mm, 25 * mm])
    entete_avec_qr.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    elements = [entete_avec_qr] + elements[4:]

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

    § demande utilisateur (QR code sécurisé) : "Même chose aussi pour les
    ordonnances. Ainsi le patient se rendant en pharmacie donne la
    possibilité d'ouvrir un lien permettant à l'officine de vérifier,
    servir." Le QR pointe vers une page PUBLIQUE (aucune connexion requise
    — l'officine n'a pas de compte) qui réaffiche l'ordonnance et propose à
    l'officine un formulaire de service (voir app/routers/verification.py).
    Le jeton n'encode QUE la référence + le cabinet (jamais le contenu
    médical) : la page publique va chercher le contenu EN DIRECT depuis la
    base à chaque ouverture, donc toujours à jour même si l'ordonnance a été
    modifiée après impression.
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=18 * mm, bottomMargin=18 * mm, leftMargin=18 * mm, rightMargin=18 * mm)
    styles = getSampleStyleSheet()
    elements = []

    jeton_verification = creer_jeton_verification("ordonnance", {
        "cabinet_code": cabinet.get("code_cabinet"), "ordonnance_reference": ordonnance.get("reference"),
    })
    qr_image = _generer_qr_code_image(construire_url_verification("ordonnance", jeton_verification), taille_mm=20)

    entete_texte = [Paragraph(cabinet.get("denomination", "SAWALI DentalCare"), styles["Heading1"])]
    if cabinet.get("adresse") or cabinet.get("telephone"):
        entete_texte.append(Paragraph(f"{cabinet.get('adresse', '')} — {cabinet.get('telephone', '') or ''}", ParagraphStyle("Coord", parent=styles["Normal"], fontSize=9, textColor=colors.grey)))
    entete_texte.append(Paragraph("ORDONNANCE", styles["Heading2"]))
    entete_texte.append(Paragraph(formater_date_fr(ordonnance.get("date_creation") or datetime.utcnow()), styles["Normal"]))
    entete = Table([[entete_texte, qr_image]], colWidths=[150 * mm, 22 * mm])
    entete.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    elements.append(entete)
    elements.append(Paragraph("Scannez le QR code pour la vérification en officine", ParagraphStyle("QrLegende", parent=styles["Normal"], fontSize=7.5, textColor=colors.grey, alignment=TA_RIGHT)))
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


# § demande utilisateur : "implémente le module de production des 'Relevés
# de Bons' [...] 2 modèles [...] : standard simple et détaillé par
# Souscripteur et détails des reçus." Les deux réutilisent les mêmes
# fonctions utilitaires que le reçu (dates, montant en lettres, QR code,
# libellés de domaine) pour une cohérence visuelle avec le reste des
# documents imprimés.

def generer_pdf_releve_bons_simple(
    cabinet: dict, assurance: dict, souscripteur: str,
    periode_debut: datetime, periode_fin: datetime,
    lignes: list[dict], reference_releve: str,
) -> bytes:
    """
    Modèle "standard simple" : UN reçu = UNE ligne du tableau (part assurée,
    part assureur, motif), pour UN couple (assureur, souscripteur) donné —
    fidèle au modèle "FACTURE" fourni par l'utilisateur.

    `lignes` : liste de dicts {"date": datetime, "nom_assure": str,
    "numero_bon": int|str, "matricule": str|None, "part_assure": float,
    "part_assureur": float, "motif": str} — déjà résolues/calculées par
    l'appelant (voir app/routers/releves_bons.py), cette fonction ne fait
    QUE la mise en page.
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=15 * mm, bottomMargin=15 * mm, leftMargin=15 * mm, rightMargin=15 * mm)
    styles = getSampleStyleSheet()
    elements = []

    style_titre = ParagraphStyle("Titre", parent=styles["Heading1"], fontSize=15, textColor=colors.HexColor("#1c4587"))
    style_normal = styles["Normal"]
    style_droite = ParagraphStyle("Droite", parent=styles["Normal"], alignment=TA_RIGHT)
    style_centre_titre = ParagraphStyle("CentreTitre", parent=styles["Heading3"], alignment=TA_CENTER, fontSize=11)

    aujourdhui = datetime.utcnow()
    logo_cabinet = _image_depuis_data_uri(cabinet.get("logo_url"), taille_mm=16)
    bloc_nom = Paragraph(f"<b>{cabinet.get('denomination', 'SAWALI DentalCare')}</b>", style_titre)
    qr_image = _generer_qr_code_image(reference_releve, taille_mm=18)
    if logo_cabinet:
        entete = Table([[logo_cabinet, bloc_nom, qr_image]], colWidths=[20 * mm, 110 * mm, 20 * mm])
    else:
        entete = Table([[bloc_nom, qr_image]], colWidths=[130 * mm, 20 * mm])
    elements.append(entete)
    elements.append(Paragraph(
        f"{cabinet.get('adresse', '')}<br/>Tel: {cabinet.get('telephone', '')}<br/>E-mail: {cabinet.get('email', '')}<br/>Burkina Faso (+226)",
        style_normal,
    ))
    elements.append(Paragraph(f"<i>Ouagadougou, le {aujourdhui.strftime('%d/%m/%Y')}</i>", style_droite))
    elements.append(Spacer(1, 4 * mm))
    elements.append(Paragraph("FACTURE", ParagraphStyle("FactureTitre", parent=styles["Heading1"], fontSize=18, alignment=TA_RIGHT)))
    elements.append(Spacer(1, 4 * mm))

    elements.append(Paragraph(f"Référence : <b>{reference_releve}</b>", style_normal))
    elements.append(Paragraph(f"Période du Relevé : <b>{periode_debut.strftime('%Y%m')}</b>", style_normal))
    elements.append(Paragraph("Date Echéance : ____/____/________", style_normal))
    elements.append(Paragraph(f"DOIT (Assureur) : <b>{_intitule_assurance(assurance)}</b>", style_normal))
    elements.append(Spacer(1, 2 * mm))
    elements.append(Paragraph(f"pour le compte de : <b>{souscripteur}</b>", style_normal))
    elements.append(Spacer(1, 4 * mm))

    nom_mois = MOIS_FR_LONG[periode_debut.month].upper()
    elements.append(Paragraph(
        f"RELEVE RECAPITULATIF POUR FRAIS DE SOINS MEDICAUX DU PERSONNEL DE {souscripteur.upper()} "
        f"POUR LE MOIS DE {nom_mois} {periode_debut.year}",
        style_centre_titre,
    ))
    elements.append(Spacer(1, 4 * mm))

    entetes = ["#", "Date", "Assuré", "N° BON", "Matricule", "Part Assuré", "Part Assureur", "Motif"]
    donnees = [entetes]
    style_cellule = ParagraphStyle("Cellule", parent=styles["Normal"], fontSize=8, leading=9.5)
    total_assure = 0.0
    total_assureur = 0.0
    for i, l in enumerate(lignes, start=1):
        donnees.append([
            str(i), l["date"].strftime("%d/%m"), Paragraph(l["nom_assure"], style_cellule), str(l["numero_bon"]),
            l.get("matricule") or "", f"{l['part_assure']:,.0f}".replace(",", " "),
            f"{l['part_assureur']:,.0f}".replace(",", " "), Paragraph(l["motif"], style_cellule),
        ])
        total_assure += l["part_assure"]
        total_assureur += l["part_assureur"]
    donnees.append(["", "", "", "", "TOTAL", f"{total_assure:,.0f}".replace(",", " "), f"{total_assureur:,.0f}".replace(",", " "), ""])

    table = Table(donnees, colWidths=[8 * mm, 14 * mm, 35 * mm, 17 * mm, 18 * mm, 22 * mm, 24 * mm, 32 * mm], repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#eef2fa")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("GRID", (0, 0), (-1, -2), 0.3, colors.HexColor("#dfe6f0")),
        ("LINEABOVE", (0, -1), (-1, -1), 0.8, colors.black),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("ALIGN", (5, 0), (6, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    elements.append(table)
    elements.append(Spacer(1, 6 * mm))

    elements.append(Paragraph(
        f"Arrêté la présente a un montant total de {montant_en_lettres(total_assureur, cabinet.get('devise', 'FCFA'))}.",
        style_normal,
    ))
    elements.append(Spacer(1, 20 * mm))
    elements.append(Paragraph("LE DIRECTEUR GÉNÉRAL", ParagraphStyle("Signature", parent=styles["Normal"], alignment=TA_RIGHT)))

    doc.build(elements)
    buffer.seek(0)
    return buffer.getvalue()


def generer_pdf_releve_bons_detaille(
    cabinet: dict, assurance: dict,
    periode_debut: datetime, periode_fin: datetime,
    groupes: list[dict], reference_releve: str,
) -> bytes:
    """
    Modèle "détaillé par souscripteur" : UNE section par souscripteur/groupe
    (avec son %PC), puis dans chaque section, UNE sous-table par reçu
    (numéro de bon, assuré, détail acte par acte, sous-total du reçu) —
    fidèle au modèle "RELEVÉ DE VOS BONS" fourni par l'utilisateur.

    `groupes` : liste de dicts {"souscripteur": str, "pourcentage": float,
    "lignes": [...]} — chaque élément de "lignes" est un dict {"numero_bon",
    "date", "nom_assure", "reference_recu", "details": [(libelle, montant)],
    "part_assureur_recu": float} — déjà calculés par l'appelant.
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=15 * mm, bottomMargin=15 * mm, leftMargin=15 * mm, rightMargin=15 * mm)
    styles = getSampleStyleSheet()
    elements = []

    style_titre = ParagraphStyle("Titre", parent=styles["Heading1"], fontSize=14, textColor=colors.HexColor("#1c4587"))
    style_normal = styles["Normal"]
    style_petit = ParagraphStyle("Petit", parent=styles["Normal"], fontSize=8.5, textColor=colors.HexColor("#4a5568"))
    style_groupe = ParagraphStyle("Groupe", parent=styles["Normal"], fontSize=10.5, fontName="Helvetica-Bold", textColor=colors.HexColor("#1c4587"))

    aujourdhui = datetime.utcnow()
    qr_image = _generer_qr_code_image(reference_releve, taille_mm=18)
    logo_cabinet = _image_depuis_data_uri(cabinet.get("logo_url"), taille_mm=16)
    bloc_nom = Paragraph(f"<b>{cabinet.get('denomination', 'SAWALI DentalCare')}</b>", style_titre)
    if logo_cabinet:
        entete = Table([[logo_cabinet, bloc_nom, qr_image]], colWidths=[20 * mm, 130 * mm, 20 * mm])
    else:
        entete = Table([[bloc_nom, qr_image]], colWidths=[150 * mm, 20 * mm])
    elements.append(entete)
    elements.append(Paragraph(
        f"{cabinet.get('adresse', '')}<br/>Tel: {cabinet.get('telephone', '')}<br/>E-mail: {cabinet.get('email', '')}<br/>Burkina Faso (+226)",
        style_normal,
    ))
    elements.append(Paragraph(aujourdhui.strftime("%d/%m/%Y"), ParagraphStyle("Droite", parent=styles["Normal"], alignment=TA_RIGHT)))
    elements.append(Spacer(1, 3 * mm))
    elements.append(Paragraph("RELEVÉ DE VOS BONS DE LA PÉRIODE", ParagraphStyle("SousTitre", parent=styles["Heading2"], fontSize=13)))
    elements.append(Spacer(1, 2 * mm))
    elements.append(Paragraph(f"CLIENT : <b>{_intitule_assurance(assurance)}</b>", style_normal))
    if assurance.get("contact"):
        elements.append(Paragraph(f"ADRESSE/CONTACT : {assurance['contact']}", style_normal))
    elements.append(Spacer(1, 2 * mm))
    elements.append(Paragraph(f"FACTURE N° : <b>{reference_releve}</b>", style_normal))
    elements.append(Spacer(1, 5 * mm))

    total_general = 0.0
    for groupe in groupes:
        elements.append(Paragraph(
            f"■ SOUSCRIPTEUR/GROUPE&nbsp;&nbsp;<font color='#1c4587'>{groupe['souscripteur']}</font>"
            f"&nbsp;&nbsp;&nbsp;&nbsp;% PC/TICK. MODÉRA. : <b>{groupe['pourcentage']:.0f} %</b>",
            style_groupe,
        ))
        entetes = ["N° Bon", "Date", "Assuré", "Détail(s)", "Part Assureur"]
        donnees = [entetes]
        style_cellule_det = ParagraphStyle("CelluleDet", parent=styles["Normal"], fontSize=8, leading=9.5)
        sous_total_groupe = 0.0
        for l in groupe["lignes"]:
            premiere_ligne_detail = True
            for libelle, montant in l["details"]:
                if premiere_ligne_detail:
                    donnees.append([str(l["numero_bon"]), l["date"].strftime("%d/%m/%y"), Paragraph(l["nom_assure"], style_cellule_det), Paragraph(libelle, style_cellule_det), f"{montant:,.0f}".replace(",", " ")])
                    premiere_ligne_detail = False
                else:
                    donnees.append(["", "", "", Paragraph(libelle, style_cellule_det), f"{montant:,.0f}".replace(",", " ")])
            donnees.append(["", "", "", Paragraph(f"<i>S/Total du reçu n° {l['reference_recu']}</i>", style_petit), f"{l['part_assureur_recu']:,.0f}".replace(",", " ")])
            sous_total_groupe += l["part_assureur_recu"]
        table = Table(donnees, colWidths=[18 * mm, 20 * mm, 40 * mm, 65 * mm, 25 * mm], repeatRows=1)
        style_table = [
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#eef2fa")),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#dfe6f0")),
            ("ALIGN", (4, 0), (4, -1), "RIGHT"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 2),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ]
        table.setStyle(TableStyle(style_table))
        elements.append(table)
        elements.append(Paragraph(
            f"Nombre de reçus : {len(groupe['lignes'])} &nbsp;&nbsp;&nbsp;&nbsp; <b>Sous-total : {sous_total_groupe:,.0f} {cabinet.get('devise', 'FCFA')}</b>".replace(",", " "),
            ParagraphStyle("SousTotalGroupe", parent=styles["Normal"], fontSize=9, alignment=TA_RIGHT),
        ))
        elements.append(Spacer(1, 5 * mm))
        total_general += sous_total_groupe

    elements.append(Spacer(1, 4 * mm))
    elements.append(Paragraph(
        f"ARRÊTÉ LA PRÉSENTE FACTURE DE VOS RELEVÉS DE LA PÉRIODE À LA SOMME DE "
        f"{total_general:,.0f} ".replace(",", " ") + f"({montant_en_lettres(total_general, cabinet.get('devise', 'FCFA'))}).",
        ParagraphStyle("TotalGeneral", parent=styles["Normal"], fontSize=10, fontName="Helvetica-Bold"),
    ))

    doc.build(elements)
    buffer.seek(0)
    return buffer.getvalue()
