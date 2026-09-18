"""
app/utils/formatage.py
---------------------------
§ demande utilisateur : sur les reçus et dans tous les historiques,
afficher l'identité complète du patient — nom, prénoms, et son ID entre
parenthèses — car il peut y avoir des homonymes. Centralisé ici pour rester
identique partout (reçus PDF, état de caisse, Caisse.jsx, Comptable.jsx).
"""


def identite_patient_affichee(vente: dict) -> str:
    """
    "Nom Prénoms (ID)" à partir d'un document VenteClinique — priorité à
    l'ID figé sur le reçu au moment de la vente (identite_recu.id_patient,
    immuable même si la fiche patient change ensuite), repli sur `Libellé`
    seul pour les anciens reçus créés avant l'ajout de ce champ.
    """
    identite = vente.get("identite_recu") or {}
    nom = f"{identite.get('nom', '')} {identite.get('prenoms', '')}".strip() or vente.get("Libellé", "")
    id_patient = identite.get("id_patient")
    return f"{nom} ({id_patient})" if id_patient else nom
