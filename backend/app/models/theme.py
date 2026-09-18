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
    actif: bool = True  # un thème désactivé disparaît du sélecteur cabinet mais reste appliqué s'il était déjà choisi


class ThemePlateformeEcriture(BaseModel):
    nom: Optional[str] = None
    couleur_primaire: Optional[str] = None
    couleur_primaire_claire: Optional[str] = None
    couleur_accent: Optional[str] = None
    actif: Optional[bool] = None
