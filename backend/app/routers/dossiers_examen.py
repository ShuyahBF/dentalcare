"""
app/routers/dossiers_examen.py
-----------------------------------
Le Dentiste consulte/corrige les dossiers d'examen, visualise et met à jour
le schéma dentaire (persistant, champ ContenuExams), et génère le rapport
professionnel PDF envoyable par WhatsApp (§4f-h du cahier des charges).
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response

from app.core.database import obtenir_base, Collections
from app.core.dependances import obtenir_utilisateur_courant, exiger_role
from app.models.dossier_examen import ContenuExamens
from app.utils.compteurs import prochain_numero
from app.utils.pdf_documents import generer_pdf_rapport_dentiste
from app.utils.whatsapp import generer_lien_whatsapp
from app.utils.audit import journaliser_action

router = APIRouter(prefix="/api/dossiers-examen", tags=["Dossiers d'examen (Dentiste)"])


@router.get("/{dos_num}")
async def obtenir_dossier(dos_num: int, utilisateur: dict = Depends(obtenir_utilisateur_courant)):
    base = obtenir_base()
    dossier = await base[Collections.DOSSIER_EXAMEN].find_one({"Dos_num": dos_num})
    if not dossier:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dossier introuvable.")
    return dossier


@router.post("", status_code=status.HTTP_201_CREATED)
async def creer_dossier(patient_numero_enreg: int, nom_specialiste: str | None = None, utilisateur: dict = Depends(exiger_role("Secrétariat Cabinet", "Dentiste"))):
    """Ouvre un nouveau dossier d'examen pour un patient (à la réception, §4f)."""
    base = obtenir_base()
    dos_num = await prochain_numero("Dossier_Examen", valeur_depart=100000)
    document = {
        "Numéro_Enreg": dos_num,
        "Dos_num": dos_num,
        "Client": patient_numero_enreg,
        "Nom_Spécialiste": nom_specialiste,
        "Traité": 0,
        "Réglé": 0,
        "Visé": 0,
        "estArchivé": False,
        "DateHeure_Creation": datetime.utcnow(),
    }
    await base[Collections.DOSSIER_EXAMEN].insert_one(document)
    document.pop("_id", None)
    return document


@router.put("/{dos_num}/schema-dentaire")
async def mettre_a_jour_schema_dentaire(dos_num: int, schema: ContenuExamens, utilisateur: dict = Depends(exiger_role("Caissier", "Dentiste"))):
    """
    Persiste l'état du schéma dentaire interactif (couleur/statut de chaque
    dent + actes associés) dans le Dossier_Examen, visible par le Caissier ET
    le Dentiste, et rappelé à la prochaine visite (§6, dernier point).
    """
    base = obtenir_base()
    resultat = await base[Collections.DOSSIER_EXAMEN].update_one(
        {"Dos_num": dos_num},
        {"$set": {"ContenuExams": schema.model_dump(), "Dateheure_modification": datetime.utcnow()}},
    )
    if resultat.matched_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dossier introuvable.")
    return {"statut": "schéma dentaire mis à jour"}


class RapportPayload:
    """Payload minimal, défini inline pour éviter un fichier de schéma supplémentaire."""
    pass


@router.put("/{dos_num}/rapport")
async def enregistrer_rapport(
    dos_num: int,
    dos_indication: str | None = None,
    dos_resultats: str | None = None,
    dos_conclusion: str | None = None,
    utilisateur: dict = Depends(exiger_role("Dentiste")),
):
    """Le Dentiste rédige/corrige son rapport professionnel (§4g)."""
    base = obtenir_base()
    mise_a_jour = {"Dateheure_modification": datetime.utcnow(), "Traité": 1}
    if dos_indication is not None:
        mise_a_jour["DOS_INDICATION"] = dos_indication
    if dos_resultats is not None:
        mise_a_jour["DOS_RESULTATS"] = dos_resultats
    if dos_conclusion is not None:
        mise_a_jour["DOS_CONCLUSION"] = dos_conclusion

    resultat = await base[Collections.DOSSIER_EXAMEN].update_one({"Dos_num": dos_num}, {"$set": mise_a_jour})
    if resultat.matched_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dossier introuvable.")
    await journaliser_action(utilisateur["Login"], "redaction_rapport", {"dos_num": dos_num})
    return {"statut": "rapport enregistré"}


@router.get("/{dos_num}/rapport/pdf")
async def telecharger_rapport_pdf(dos_num: int, utilisateur: dict = Depends(obtenir_utilisateur_courant)):
    base = obtenir_base()
    dossier = await base[Collections.DOSSIER_EXAMEN].find_one({"Dos_num": dos_num})
    if not dossier:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dossier introuvable.")

    patient = await base[Collections.PATIENT].find_one({"Numéro_Enreg": dossier.get("Client")}) or {}
    dentiste = await base[Collections.MEDECIN_T].find_one({"Nom": dossier.get("Nom_Spécialiste")}) or {}
    cabinet = await base[Collections.CABINET].find_one({}) or {"denomination": "SAWALI DentalCare"}

    pdf_octets = generer_pdf_rapport_dentiste(dossier, patient, dentiste, cabinet)
    return Response(content=pdf_octets, media_type="application/pdf", headers={
        "Content-Disposition": f'inline; filename="rapport_{dos_num}.pdf"'
    })


@router.get("/{dos_num}/rapport/lien-whatsapp")
async def obtenir_lien_whatsapp_rapport(dos_num: int, utilisateur: dict = Depends(exiger_role("Dentiste"))):
    """
    Retourne un lien wa.me pré-rempli pour envoyer le rapport au patient
    (§4g). Le frontend ouvre ce lien dans un nouvel onglet ; le fichier PDF
    doit être joint manuellement par le dentiste dans WhatsApp Web/Desktop
    (limitation de l'API wa.me publique, qui ne permet pas la pièce jointe
    automatique sans passer par l'API WhatsApp Business payante).
    """
    base = obtenir_base()
    dossier = await base[Collections.DOSSIER_EXAMEN].find_one({"Dos_num": dos_num})
    if not dossier:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dossier introuvable.")
    patient = await base[Collections.PATIENT].find_one({"Numéro_Enreg": dossier.get("Client")})
    if not patient or not patient.get("Téléphone"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Le patient n'a pas de numéro de téléphone enregistré.")

    message = (
        f"Bonjour {patient.get('Nom', '')}, voici votre rapport de consultation dentaire "
        f"chez SAWALI DentalCare du {datetime.utcnow().strftime('%d/%m/%Y')}. "
        f"Merci de nous contacter pour toute question."
    )
    lien = generer_lien_whatsapp(patient["Téléphone"], message)

    await base[Collections.DOSSIER_EXAMEN].update_one(
        {"Dos_num": dos_num},
        {"$set": {"rapport_envoye_whatsapp": True, "date_envoi_whatsapp": datetime.utcnow()}},
    )
    return {"lien_whatsapp": lien}
