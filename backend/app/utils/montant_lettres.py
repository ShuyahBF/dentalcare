"""
app/utils/montant_lettres.py
-------------------------------
Convertit un montant numérique en toutes lettres, en français, pour
l'affichage sur les reçus (ex: 24000 -> "VINGT QUATRE MILLE FCFA"), exactement
comme sur le modèle de reçu "Clinique PHILADELPHIE" fourni en référence
(qui sépare les mots composés par des espaces, sans trait d'union).
"""

UNITES = ["", "UN", "DEUX", "TROIS", "QUATRE", "CINQ", "SIX", "SEPT", "HUIT", "NEUF"]
DIX_A_SEIZE = ["DIX", "ONZE", "DOUZE", "TREIZE", "QUATORZE", "QUINZE", "SEIZE"]
DIZAINES = ["", "", "VINGT", "TRENTE", "QUARANTE", "CINQUANTE", "SOIXANTE", "SOIXANTE", "QUATRE VINGT", "QUATRE VINGT"]


def _trois_chiffres_en_lettres(nombre: int) -> str:
    """Convertit un nombre de 0 à 999 en lettres françaises (mots séparés par des espaces)."""
    if nombre == 0:
        return ""
    centaines, reste = divmod(nombre, 100)
    mots = []
    if centaines > 0:
        mots.append((UNITES[centaines] + " " if centaines > 1 else "") + "CENT" + ("S" if centaines > 1 and reste == 0 else ""))
    if reste > 0:
        if reste < 10:
            mots.append(UNITES[reste])
        elif reste < 17:
            mots.append(DIX_A_SEIZE[reste - 10])
        elif reste < 20:
            mots.append("DIX " + UNITES[reste - 10])
        else:
            dizaine, unite = divmod(reste, 10)
            dizaine_mot = DIZAINES[dizaine]
            # Cas particuliers français : 70 = soixante-dix, 90 = quatre-vingt-dix
            if dizaine in (7, 9):
                if unite == 0:
                    mots.append(dizaine_mot + " DIX")
                elif unite == 1 and dizaine == 7:
                    mots.append(dizaine_mot + " ET ONZE")
                else:
                    mots.append(dizaine_mot + " " + DIX_A_SEIZE[unite])
            else:
                if unite == 0:
                    mots.append(dizaine_mot + ("S" if dizaine == 8 else ""))
                elif unite == 1 and dizaine != 8:
                    mots.append(dizaine_mot + " ET " + UNITES[unite])
                else:
                    mots.append(dizaine_mot + " " + UNITES[unite])
    return " ".join(mots)


def montant_en_lettres(montant: float, devise: str = "FCFA") -> str:
    """
    Convertit un montant en toutes lettres, en majuscules, suivi de la devise.
    Exemple : montant_en_lettres(24000) -> "VINGT QUATRE MILLE FCFA"
    """
    entier = int(round(montant))
    if entier == 0:
        return f"ZÉRO {devise}"

    milliards, reste = divmod(entier, 1_000_000_000)
    millions, reste = divmod(reste, 1_000_000)
    milliers, unites = divmod(reste, 1_000)

    parties = []
    if milliards > 0:
        prefixe = "UN " if milliards == 1 else _trois_chiffres_en_lettres(milliards) + " "
        parties.append(prefixe + "MILLIARD" + ("S" if milliards > 1 else ""))
    if millions > 0:
        prefixe = "UN " if millions == 1 else _trois_chiffres_en_lettres(millions) + " "
        parties.append(prefixe + "MILLION" + ("S" if millions > 1 else ""))
    if milliers > 0:
        # "MILLE" est invariable et ne prend jamais "UN" devant lui en français.
        prefixe_mille = _trois_chiffres_en_lettres(milliers) + " " if milliers > 1 else ""
        parties.append(prefixe_mille + "MILLE")
    if unites > 0:
        parties.append(_trois_chiffres_en_lettres(unites))

    return " ".join(parties).strip() + f" {devise}"
