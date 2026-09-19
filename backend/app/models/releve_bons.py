"""
app/models/releve_bons.py
-----------------------------
§ demande utilisateur : chaque Relevé de Bons généré (modèle simple OU
détaillé) est désormais conservé — numéro de génération "simple" (entier
brut, séquence propre à chaque cabinet ET à chaque modèle, réinitialisable
par le super-admin), le PDF produit (pour "Réimprimer" à l'identique plus
tard, sans recalcul), et les métadonnées affichées dans le tableau
"Historique des relevés" du module.
"""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class ReleveBons(BaseModel):
    numero_enreg: int
    cabinet_code: str
    numero_generation: int  # § "numérotation simple" demandée — entier brut, jamais de préfixe
    type_releve: str  # "simple" | "detaille"
    assurance_numero_enreg: int
    nom_assureur: str
    souscripteur: Optional[str] = None  # uniquement pour le modèle "simple"
    nombre_recus: int
    montant_total: float = 0
    date_debut: datetime
    date_fin: datetime
    date_generation: datetime
    genere_par: str
    pdf_base64: str
    # § "régénérer" crée un NOUVEAU relevé (nouveau numéro) à partir des
    # données ACTUELLES, plutôt que d'écraser un relevé déjà transmis à
    # l'assureur — celui-ci reste un document historique à part entière.
    regenere_depuis: Optional[int] = None
