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
from app.models.ordonnance import OrdonnanceEcriture
from app.utils.compteurs import prochain_numero, prochain_code_unique
from app.utils.pdf_documents import generer_pdf_rapport_dentiste, generer_pdf_ordonnance
from app.utils.whatsapp import generer_lien_whatsapp, normaliser_numero_whatsapp
from app.utils.whatsapp_api import envoyer_media_whatsapp
from app.utils.audit import journaliser_action

router = APIRouter(prefix="/api/dossiers-examen", tags=["Dossiers d'examen (Dentiste)"])


@router.get("")
async def lister_tous_les_dossiers(utilisateur: dict = Depends(obtenir_utilisateur_courant)):
    """
    § demande utilisateur : à l'ouverture de '/dentiste', afficher TOUS les
    dossiers existants en base pour ce cabinet (pas seulement ceux d'un
    patient recherché au préalable) — triés par date/heure de DERNIÈRE
    ACTIVITÉ (création OU modification, la plus récente des deux)
    décroissante : un dossier créé il y a une semaine mais modifié
    aujourd'hui doit remonter en tête de liste, pas rester enterré à sa
    date de création d'origine. Identité du patient résolue pour
    l'affichage (le dossier ne stocke que son Numéro_Enreg, jamais son nom).
    """
    base = obtenir_base()
    cabinet_code = utilisateur["CodeCabinet"]
    dossiers = [d async for d in base[Collections.DOSSIER_EXAMEN].find({"cabinet_code": cabinet_code})]
    numeros_patients = {d.get("Client") for d in dossiers if d.get("Client") is not None}
    patients_par_numero = {}
    if numeros_patients:
        curseur = base[Collections.PATIENT].find({"Numéro_Enreg": {"$in": list(numeros_patients)}, "cabinet_code": cabinet_code})
        async for p in curseur:
            patients_par_numero[p["Numéro_Enreg"]] = f"{p.get('Nom', '')} {p.get('Prénoms', '')}".strip()
    for d in dossiers:
        d["patient_affiche"] = patients_par_numero.get(d.get("Client"), f"Patient #{d.get('Client')}" if d.get("Client") is not None else "-")
        creation = d.get("DateHeure_Creation")
        modification = d.get("Dateheure_modification")
        # § "derniere_activite" : la plus récente des deux dates — nouveau
        # champ dédié (colonne demandée), calculé une fois ici plutôt que
        # recalculé côté frontend à chaque affichage.
        d["derniere_activite"] = max(filter(None, [creation, modification])) if (creation or modification) else None
    dossiers.sort(key=lambda d: d.get("derniere_activite") or datetime.min, reverse=True)
    return dossiers


@router.get("/{dos_num}")
async def obtenir_dossier(dos_num: int, utilisateur: dict = Depends(obtenir_utilisateur_courant)):
    base = obtenir_base()
    dossier = await base[Collections.DOSSIER_EXAMEN].find_one({"Dos_num": dos_num, "cabinet_code": utilisateur["CodeCabinet"]})
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
        "cabinet_code": utilisateur["CodeCabinet"],
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

    § demande utilisateur : appelée explicitement par le bouton "Modifier
    intervention" du Dentiste (plus d'enregistrement automatique silencieux)
    — chaque appel ajoute une entrée à l'historique des modifications du
    dossier (auteur + date), sans jamais écraser les entrées précédentes.
    """
    base = obtenir_base()
    maintenant = datetime.utcnow()
    entree_historique = {
        "login": utilisateur["Login"],
        "nom_complet": utilisateur.get("nom_complet") or utilisateur["Login"],
        "date": maintenant,
    }
    resultat = await base[Collections.DOSSIER_EXAMEN].update_one(
        {"Dos_num": dos_num, "cabinet_code": utilisateur["CodeCabinet"]},
        {
            "$set": {"ContenuExams": schema.model_dump(), "Dateheure_modification": maintenant},
            "$push": {"historique_modifications": entree_historique},
        },
    )
    if resultat.matched_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dossier introuvable.")
    await journaliser_action(utilisateur["Login"], "modification_intervention", {"dos_num": dos_num}, cabinet_code=utilisateur["CodeCabinet"])
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

    resultat = await base[Collections.DOSSIER_EXAMEN].update_one({"Dos_num": dos_num, "cabinet_code": utilisateur["CodeCabinet"]}, {"$set": mise_a_jour})
    if resultat.matched_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dossier introuvable.")
    await journaliser_action(utilisateur["Login"], "redaction_rapport", {"dos_num": dos_num})
    return {"statut": "rapport enregistré"}


@router.get("/{dos_num}/rapport/pdf")
async def telecharger_rapport_pdf(dos_num: int, utilisateur: dict = Depends(obtenir_utilisateur_courant)):
    base = obtenir_base()
    dossier = await base[Collections.DOSSIER_EXAMEN].find_one({"Dos_num": dos_num, "cabinet_code": utilisateur["CodeCabinet"]})
    if not dossier:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dossier introuvable.")

    patient = await base[Collections.PATIENT].find_one({"Numéro_Enreg": dossier.get("Client"), "cabinet_code": utilisateur["CodeCabinet"]}) or {}
    dentiste = await base[Collections.MEDECIN_T].find_one({"Nom": dossier.get("Nom_Spécialiste"), "cabinet_code": utilisateur["CodeCabinet"]}) or {}
    cabinet = await base[Collections.CABINET].find_one({"code_cabinet": utilisateur["CodeCabinet"]}) or {"denomination": "SAWALI DentalCare"}

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
    dossier = await base[Collections.DOSSIER_EXAMEN].find_one({"Dos_num": dos_num, "cabinet_code": utilisateur["CodeCabinet"]})
    if not dossier:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dossier introuvable.")
    patient = await base[Collections.PATIENT].find_one({"Numéro_Enreg": dossier.get("Client"), "cabinet_code": utilisateur["CodeCabinet"]})
    if not patient or not patient.get("Téléphone"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Le patient n'a pas de numéro de téléphone enregistré.")

    message = (
        f"Bonjour {patient.get('Nom', '')}, voici votre rapport de consultation dentaire "
        f"chez SAWALI DentalCare du {datetime.utcnow().strftime('%d/%m/%Y')}. "
        f"Merci de nous contacter pour toute question."
    )
    lien = generer_lien_whatsapp(patient["Téléphone"], message)

    await base[Collections.DOSSIER_EXAMEN].update_one(
        {"Dos_num": dos_num, "cabinet_code": utilisateur["CodeCabinet"]},
        {"$set": {"rapport_envoye_whatsapp": True, "date_envoi_whatsapp": datetime.utcnow()}},
    )
    return {"lien_whatsapp": lien}


# ============================================================================
# Ordonnance (§ demande utilisateur) — le patient l'utilise pour acheter les
# produits recommandés par son médecin traitant. 1 ordonnance par dossier,
# éditable ; réservée au Dentiste.
# ============================================================================

@router.get("/{dos_num}/ordonnance")
async def obtenir_ordonnance(dos_num: int, utilisateur: dict = Depends(exiger_role("Dentiste"))):
    base = obtenir_base()
    ordonnance = await base[Collections.ORDONNANCE].find_one({"dossier_examen_numero_enreg": dos_num, "cabinet_code": utilisateur["CodeCabinet"]})
    if ordonnance:
        # § demande utilisateur : "Le médecin qui a émis l'ordonnance peut
        # avoir le retour d'informations de ses ordonnances" — les services
        # rendus par les officines (formulaire rempli via le QR, voir
        # app/routers/verification.py) sont joints ici, pour que le
        # dentiste les voie directement sur SA fiche d'ordonnance, sans
        # écran séparé à consulter.
        services = [s async for s in base[Collections.SERVICE_OFFICINE].find(
            {"ordonnance_reference": ordonnance.get("reference"), "cabinet_code": utilisateur["CodeCabinet"]}
        ).sort("date_service", -1)]
        for s in services:
            s.pop("_id", None)
        ordonnance["services_officine"] = services
    return ordonnance  # None si pas encore créée — le frontend affiche alors un formulaire vide


@router.put("/{dos_num}/ordonnance")
async def enregistrer_ordonnance(dos_num: int, payload: OrdonnanceEcriture, utilisateur: dict = Depends(exiger_role("Dentiste"))):
    """Crée l'ordonnance de ce dossier si elle n'existe pas encore, sinon la met à jour (upsert)."""
    base = obtenir_base()
    cabinet_code = utilisateur["CodeCabinet"]
    dossier = await base[Collections.DOSSIER_EXAMEN].find_one({"Dos_num": dos_num, "cabinet_code": cabinet_code})
    if not dossier:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dossier introuvable.")

    existante = await base[Collections.ORDONNANCE].find_one({"dossier_examen_numero_enreg": dos_num, "cabinet_code": cabinet_code})
    maintenant = datetime.utcnow()
    valeurs = {
        "lignes": [l.model_dump() for l in payload.lignes],
        "afficher_schema_dentaire": payload.afficher_schema_dentaire,
        "date_derniere_modification": maintenant,
        "dentiste_login": utilisateur["Login"],
        "dentiste_nom": utilisateur.get("nom_complet"),
    }
    if existante:
        await base[Collections.ORDONNANCE].update_one({"numero_enreg": existante["numero_enreg"]}, {"$set": valeurs})
        numero_enreg = existante["numero_enreg"]
        reference = existante["reference"]
    else:
        numero_enreg = await prochain_numero("Ordonnance", valeur_depart=1)
        reference = await prochain_code_unique("ordonnance", cabinet_code)
        valeurs.update({
            "numero_enreg": numero_enreg, "cabinet_code": cabinet_code, "dossier_examen_numero_enreg": dos_num,
            "patient_numero_enreg": dossier.get("Client"), "reference": reference, "date_creation": maintenant,
        })
        await base[Collections.ORDONNANCE].insert_one(dict(valeurs))

    await journaliser_action(utilisateur["Login"], "modification_ordonnance", {"dos_num": dos_num, "reference": reference}, cabinet_code=cabinet_code)
    ordonnance = await base[Collections.ORDONNANCE].find_one({"numero_enreg": numero_enreg})
    return ordonnance


@router.get("/{dos_num}/ordonnance/pdf")
async def telecharger_ordonnance_pdf(dos_num: int, utilisateur: dict = Depends(obtenir_utilisateur_courant)):
    base = obtenir_base()
    cabinet_code = utilisateur["CodeCabinet"]
    ordonnance = await base[Collections.ORDONNANCE].find_one({"dossier_examen_numero_enreg": dos_num, "cabinet_code": cabinet_code})
    if not ordonnance:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Aucune ordonnance enregistrée pour ce dossier.")
    dossier = await base[Collections.DOSSIER_EXAMEN].find_one({"Dos_num": dos_num, "cabinet_code": cabinet_code}) or {}
    patient = await base[Collections.PATIENT].find_one({"Numéro_Enreg": ordonnance.get("patient_numero_enreg"), "cabinet_code": cabinet_code}) or {}
    dentiste = await base[Collections.MEDECIN_T].find_one({"Nom": dossier.get("Nom_Spécialiste"), "cabinet_code": cabinet_code}) or {}
    cabinet = await base[Collections.CABINET].find_one({"code_cabinet": cabinet_code}) or {"denomination": "SAWALI DentalCare"}

    ordonnance["_actes_par_dent"] = (dossier.get("ContenuExams") or {}).get("actes_par_dent", [])
    pdf_octets = generer_pdf_ordonnance(ordonnance, patient, dentiste, cabinet)
    return Response(content=pdf_octets, media_type="application/pdf", headers={
        "Content-Disposition": f'inline; filename="ordonnance_{ordonnance["reference"]}.pdf"'
    })


@router.post("/{dos_num}/ordonnance/envoyer-whatsapp")
async def envoyer_ordonnance_whatsapp(dos_num: int, utilisateur: dict = Depends(obtenir_utilisateur_courant)):
    """
    § demande utilisateur : "si le patient a un numéro WA, tout utilisateur
    ayant accès au module peut lui envoyer une ordonnance par WA" — même
    niveau d'accès que le téléchargement du PDF ci-dessus (`obtenir_utilisateur_courant`,
    déjà sans restriction de rôle particulière : "le module" n'impose
    aujourd'hui aucune restriction au-delà d'être connecté au cabinet).

    Envoi RÉEL via l'API WhatsApp Cloud (upload + envoi du document, voir
    envoyer_media_whatsapp) — pas un simple lien wa.me à ouvrir : le patient
    reçoit directement le PDF, sans étape manuelle côté utilisateur. Limite
    connue de l'API Meta, hors de notre contrôle : un envoi de média en
    dehors de la fenêtre de 24h suivant le dernier message du patient peut
    être refusé par Meta (nécessite alors un modèle approuvé, comme pour la
    Messagerie) — l'erreur réelle de Meta est renvoyée telle quelle plutôt
    que masquée, pour que l'utilisateur comprenne pourquoi si ça échoue.
    """
    base = obtenir_base()
    cabinet_code = utilisateur["CodeCabinet"]
    ordonnance = await base[Collections.ORDONNANCE].find_one({"dossier_examen_numero_enreg": dos_num, "cabinet_code": cabinet_code})
    if not ordonnance:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Aucune ordonnance enregistrée pour ce dossier.")
    patient = await base[Collections.PATIENT].find_one({"Numéro_Enreg": ordonnance.get("patient_numero_enreg"), "cabinet_code": cabinet_code})
    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient introuvable.")
    numero_brut = patient.get("Téléphone")
    if not numero_brut:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Ce patient n'a pas de numéro de téléphone enregistré.")
    numero = normaliser_numero_whatsapp(numero_brut)

    config = await base[Collections.CONFIGURATION_WHATSAPP].find_one({"cabinet_code": cabinet_code})
    dossier = await base[Collections.DOSSIER_EXAMEN].find_one({"Dos_num": dos_num, "cabinet_code": cabinet_code}) or {}
    dentiste = await base[Collections.MEDECIN_T].find_one({"Nom": dossier.get("Nom_Spécialiste"), "cabinet_code": cabinet_code}) or {}
    cabinet = await base[Collections.CABINET].find_one({"code_cabinet": cabinet_code}) or {"denomination": "SAWALI DentalCare"}

    ordonnance["_actes_par_dent"] = (dossier.get("ContenuExams") or {}).get("actes_par_dent", [])
    pdf_octets = generer_pdf_ordonnance(ordonnance, patient, dentiste, cabinet)

    succes, message, _type_media, _media_id, _wamid = await envoyer_media_whatsapp(
        config, numero, pdf_octets, "application/pdf",
        nom_fichier=f"ordonnance_{ordonnance['reference']}.pdf",
        legende=f"{cabinet.get('denomination', 'SAWALI DentalCare')} — Ordonnance {ordonnance['reference']}",
    )
    if not succes:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=message)
    await journaliser_action(utilisateur["Login"], "envoi_ordonnance_whatsapp", {"dos_num": dos_num, "reference": ordonnance["reference"], "numero": numero}, cabinet_code=cabinet_code)
    return {"envoye": True, "numero": numero}
