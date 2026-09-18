"""
app/models/theme.py
------------------------
§ demande utilisateur : chaque cabinet peut choisir individuellement un
thème d'interface, à partir d'une liste maintenue par le super-admin
(catalogue plateforme, pas une couleur libre choisie par le cabinet) — plus
un réglage clair/sombre indépendant du thème choisi.
"""

from typing import Optional
from pydantic import BaseModel


class ThemePlateforme(BaseModel):
    code: str  # identifiant unique, ex: "bleu-sawali", "vert-emeraude"
    nom: str  # nom affiché dans le sélecteur, ex: "Bleu SAWALI (défaut)"
    couleur_primaire: str  # hex — remplace --sawali-bleu
    couleur_primaire_claire: str  # hex — remplace --sawali-bleu-clair
    couleur_accent: str  # hex — remplace --sawali-bleu-glow
    # § demande utilisateur : "pas seulement les couleurs mais les styles
    # aussi" — un thème contrôle aussi la FORME des composants, pas
    # uniquement leur teinte (ex: boutons en pilule vs. légèrement
    # arrondis, traits fins vs. épais). Optionnels avec valeurs par défaut
    # identiques à l'apparence actuelle, pour ne rien changer aux thèmes
    # déjà existants qui ne les définiraient pas.
    rayon_boutons: str = "9px"  # ex: "999px" pour des boutons en pilule complète
    rayon_champs: str = "9px"  # champs de saisie ET listes déroulantes (même classe .champ-saisie)
    rayon_cartes: str = "14px"  # remplace --sawali-rayon
    epaisseur_bordure: str = "1.5px"  # épaisseur des bordures (boutons secondaires, champs)
    ombre_cartes: Optional[str] = None  # box-shadow CSS complet ; None = ombre par défaut de l'app
    actif: bool = True  # un thème désactivé disparaît du sélecteur cabinet mais reste appliqué s'il était déjà choisi


class ThemePlateformeEcriture(BaseModel):
    nom: Optional[str] = None
    couleur_primaire: Optional[str] = None
    couleur_primaire_claire: Optional[str] = None
    couleur_accent: Optional[str] = None
    rayon_boutons: Optional[str] = None
    rayon_champs: Optional[str] = None
    rayon_cartes: Optional[str] = None
    epaisseur_bordure: Optional[str] = None
    ombre_cartes: Optional[str] = None
    actif: Optional[bool] = None
