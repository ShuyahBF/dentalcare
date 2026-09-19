"""
app/utils/archives_pdf.py
------------------------------
§ demande utilisateur : "TOUT PDF généré doit être archivé." Point d'entrée
UNIQUE pour archiver un PDF généré n'importe où dans l'application (point
de départ : les ordonnances, voir dossiers_examen.py — les autres types de
documents PDF pourront être branchés dessus de la même façon sans changer
ce fichier). Stocke les octets tels quels (base64) pour une relecture fidèle
plus tard, jamais recalculée.
"""

from datetime import datetime

from app.core.database import obtenir_base, Collections
from app.utils.compteurs import prochain_numero
import base64


async def archiver_pdf(cabinet_code: str, type_document: str, reference: str, pdf_octets: bytes, genere_par: str | None = None, metadonnees: dict | None = None) -> int:
    """
    Enregistre une NOUVELLE entrée d'archive (jamais un remplacement — un
    PDF réémis plusieurs fois pour la même référence, ex: une ordonnance
    modifiée puis re-générée, laisse une trace de chaque génération,
    cohérent avec le principe "historique" déjà appliqué aux Relevés de
    Bons). Retourne le numero_enreg de l'entrée créée.
    """
    base = obtenir_base()
    numero_enreg = await prochain_numero("ArchivePdf")
    document = {
        "numero_enreg": numero_enreg,
        "cabinet_code": cabinet_code,
        "type_document": type_document,  # ex: "ordonnance", "recu", "compte_rendu"
        "reference": reference,
        "date_generation": datetime.utcnow(),
        "genere_par": genere_par,
        "pdf_base64": base64.b64encode(pdf_octets).decode("ascii"),
        "metadonnees": metadonnees or {},
    }
    await base[Collections.ARCHIVE_PDF].insert_one(document)
    return numero_enreg
