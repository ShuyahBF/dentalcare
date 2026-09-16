"""
app/models/type_paiement.py
-------------------------------
NOUVELLE table "TypePaiement" (introduite pour ce projet) : les modes de
règlement paramétrables depuis le module Administrateur (Espèces, Orange
Money, Moov Money, etc.), avec un indicateur "exige_reference" — quand actif,
la Caisse doit obligatoirement collecter la référence de la transaction
(numéro de transaction mobile money, par exemple) avant de finaliser le reçu.

"Assurance" reste un mode de règlement distinct géré par son propre système
(app/models/assurance.py) et n'apparaît pas dans cette liste paramétrable.
"""

from pydantic import BaseModel


class TypePaiement(BaseModel):
    numero_enreg: int
    nom: str  # ex: "Espèces", "Orange Money", "Moov Money"
    exige_reference: bool = False
    actif: bool = True
