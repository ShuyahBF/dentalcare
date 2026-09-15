"""
app/utils/suggestions_md.py
--------------------------------
Lit et parse le fichier SUGGESTION.MD (à la racine du dépôt) pour en extraire
des entrées structurées, utilisées pour synchroniser la collection
"SuggestionHistorique" consultée depuis le module Administrateur.

Format attendu de chaque entrée (voir SUGGESTION.MD) :

    ## AAAA-MM-JJ — Titre court
    Statut: Implémentée | En cours | Proposée | Rejetée
    - détail 1
    - détail 2
"""

import re
from datetime import date
from pathlib import Path

from app.models.suggestion import SuggestionHistorique

# SUGGESTION.MD vit à la racine du dépôt, deux niveaux au-dessus de
# backend/app/utils/ (backend/ et app/ inclus).
CHEMIN_SUGGESTION_MD = Path(__file__).resolve().parents[3] / "SUGGESTION.MD"

MOTIF_ENTREE = re.compile(
    r"^## (\d{4}-\d{2}-\d{2}) — (.+)$\nStatut: (.+)$\n((?:- .+\n?)*)",
    re.MULTILINE,
)


def parser_suggestion_md(chemin: Path = CHEMIN_SUGGESTION_MD) -> list[SuggestionHistorique]:
    """Lit le fichier et retourne la liste des entrées trouvées, la plus récente en dernier dans le fichier."""
    if not chemin.exists():
        return []

    contenu = chemin.read_text(encoding="utf-8")
    entrees = []
    for numero, correspondance in enumerate(MOTIF_ENTREE.finditer(contenu), start=1):
        date_texte, titre, statut, bloc_details = correspondance.groups()
        details = [ligne.strip("- ").strip() for ligne in bloc_details.strip().splitlines() if ligne.strip()]
        entrees.append(SuggestionHistorique(
            numero_enreg=numero,
            date_entree=date.fromisoformat(date_texte),
            titre=titre.strip(),
            statut=statut.strip(),
            details=details,
        ))
    return entrees
