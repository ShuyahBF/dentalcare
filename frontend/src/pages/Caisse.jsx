// pages/Caisse.jsx
// --------------------
// Interface du Caissier (§4b-d) : recherche/sélection du patient, panier de
// prestations (via le schéma dentaire OU saisie clavier avec autocomplétion),
// puis génération d'un Reçu (payé) ou d'une Proforma (différé).

import { useState, useEffect, useCallback, useRef } from "react";
import api from "../utils/api";
import { ouvrirFichier, imprimerPdf } from "../utils/fichiers";
import { useAuth } from "../utils/authContexte";
import SchemaDentaire from "../components/SchemaDentaire";
import ModaleEncaissement from "../components/ModaleEncaissement";
import ChampSouscripteur from "../components/ChampSouscripteur";
import { suffixeNumeroDent } from "../utils/numerotationDentaire";

export default function Caisse() {
  const { utilisateur } = useAuth();
  const [rechercherPatient, setRecherchePatient] = useState("");
  const [resultatsPatients, setResultatsPatients] = useState([]);
  const [patientSelectionne, setPatientSelectionne] = useState(null);
  const [formulaireNouveauPatientOuvert, setFormulaireNouveauPatientOuvert] = useState(false);
  const [nouveauPatient, setNouveauPatient] = useState({ Nom: "", Prénoms: "", Téléphone: "", Adresse: "", "Date Naissance": "", Sexe: "" });
  const [erreurPatient, setErreurPatient] = useState("");
  const [creationPatientEnCours, setCreationPatientEnCours] = useState(false);

  const [catalogue, setCatalogue] = useState([]);
  const [numerotationDentaire, setNumerotationDentaire] = useState("internationale");
  const [rechercheActeRapide, setRechercheActeRapide] = useState("");
  const [panier, setPanier] = useState([]); // fusion : lignes venant du schéma + saisie rapide
  const [lignesSchema, setLignesSchema] = useState([]);
  const [lignesRapides, setLignesRapides] = useState([]);

  const [modeReglement, setModeReglement] = useState("Espèces");
  // § bug corrigé ("un règlement partiel règle totalement le reçu") :
  // permet de régler seulement une PARTIE du total dès la création du
  // reçu, sans devoir d'abord générer une proforma puis "Compléter
  // Paiement". "" (vide) = comportement historique (règle tout).
  const [montantRegleMaintenant, setMontantRegleMaintenant] = useState("");
  const [typesPaiement, setTypesPaiement] = useState([]);
  const [referencePaiement, setReferencePaiement] = useState("");
  const [modaleReferenceOuverte, setModaleReferenceOuverte] = useState(false);
  const [typeDocumentEnAttente, setTypeDocumentEnAttente] = useState(null);
  // Réglé "avec assurance" : un COMPLÉMENT au mode de règlement, pas une
  // alternative (§ demande utilisateur). Le type de paiement (Espèces,
  // Orange Money...) précise TOUJOURS comment le patient règle le montant
  // NET de son reçu — même quand une assurance prend en charge le reste.
  // Impossible à cocher pour le Client CASH (§ demande utilisateur : le
  // Client CASH ne peut jamais avoir d'assurance).
  const [avecAssurance, setAvecAssurance] = useState(false);
  const [assurancePatientChoisie, setAssurancePatientChoisie] = useState("");
  const [assurancesPatient, setAssurancesPatient] = useState([]);
  const [assurancesDisponibles, setAssurancesDisponibles] = useState([]);
  // § demande utilisateur : obligatoires dès qu'une prise en charge est
  // attachée — numéro de bon (toujours numérique) et souscripteur (la
  // personne physique ou morale ayant signé la convention avec l'assureur,
  // jamais le patient). Réinitialisés dès qu'une AUTRE assurance est
  // choisie (voir le onChange du select ci-dessous).
  const [numeroBon, setNumeroBon] = useState("");
  const [souscripteur, setSouscripteur] = useState("");
  const [formulaireLienAssuranceOuvert, setFormulaireLienAssuranceOuvert] = useState(false);
  const [nouveauLienAssurance, setNouveauLienAssurance] = useState({ assurance_numero_enreg: "", numero_adherent: "" });
  const [enCours, setEnCours] = useState(false);
  // Incrémentée après chaque vente créée avec succès, pour forcer un
  // remontage complet de <SchemaDentaire> (voir plus bas) : ce composant
  // garde son propre état interne (dents cochées/colorées), qui n'était
  // jusque-là jamais réinitialisé après l'encaissement — le panier et le
  // total repassaient à 0, mais le schéma restait visuellement "sale".
  const [cleSchema, setCleSchema] = useState(0);
  // § mode édition : pré-colore le schéma avec les dents du reçu chargé (voir chargerPourEdition).
  const [schemaEditionInitial, setSchemaEditionInitial] = useState({});
  const [actesEditionInitiaux, setActesEditionInitiaux] = useState({});
  const refSchema = useRef(null);
  const [dernierRecu, setDernierRecu] = useState(null);
  const [erreur, setErreur] = useState("");

  // Identité obligatoire sur tout reçu (nom, prénoms, date de naissance,
  // téléphone, sexe) — exigée par les règles d'une clinique hospitalière ou
  // dentaire, quel que soit le mode de règlement (même Assurance), même pour
  // le Client CASH. Pré-remplie depuis la fiche patient si disponible, mais
  // toujours éditable/complétable pour CE reçu précis.
  const [identiteRecu, setIdentiteRecu] = useState({ Nom: "", Prénoms: "", DateNaissance: "", Téléphone: "", Sexe: "" });
  const [enregistrementIdentiteEnCours, setEnregistrementIdentiteEnCours] = useState(false);
  const [messageIdentite, setMessageIdentite] = useState("");

  // "Changer" : recherche d'un autre patient SANS refermer le panier/schéma
  // en cours (comportement précédent, source de confusion : ça faisait
  // disparaître tout le travail en cours plutôt que de proposer une liste).
  const [modaleChangerOuverte, setModaleChangerOuverte] = useState(false);
  const [rechercheChanger, setRechercheChanger] = useState("");
  const [resultatsChanger, setResultatsChanger] = useState([]);

  useEffect(() => {
    api.get("/types-paiement").then((r) => setTypesPaiement(r.data));
  }, []);

  useEffect(() => {
    api.get("/produits").then((r) => setCatalogue(r.data));
    api.get("/cabinet").then((r) => setNumerotationDentaire(r.data.numerotation_dentaire || "internationale")).catch(() => {});
  }, []);

  useEffect(() => {
    setPanier([...lignesSchema, ...lignesRapides]);
  }, [lignesSchema, lignesRapides]);

  // Pré-remplit l'identité obligatoire du reçu depuis la fiche du patient
  // sélectionné (toujours éditable/complétable pour ce reçu précis, en
  // particulier pour le Client CASH qui n'a par définition rien à pré-remplir).
  useEffect(() => {
    if (!patientSelectionne) {
      setIdentiteRecu({ Nom: "", Prénoms: "", DateNaissance: "", Téléphone: "", Sexe: "" });
      setAvecAssurance(false);
      return;
    }
    if (patientSelectionne.EstClientCash) setAvecAssurance(false); // le Client CASH ne peut jamais avoir d'assurance
    setIdentiteRecu({
      Nom: patientSelectionne.EstClientCash ? "" : (patientSelectionne.Nom || ""),
      Prénoms: patientSelectionne.Prénoms || "",
      DateNaissance: patientSelectionne["Date Naissance"] ? String(patientSelectionne["Date Naissance"]).slice(0, 10) : "",
      Téléphone: patientSelectionne.Téléphone || "",
      Sexe: patientSelectionne.Sexe || "",
    });
  }, [patientSelectionne]);

  async function rechargerAssurancesPatient() {
    if (!patientSelectionne) return;
    const r = await api.get(`/assurances/patients/${patientSelectionne.Numéro_Enreg}`);
    setAssurancesPatient(r.data);
    // § correctif (bug rapporté : "en modification la liste de toutes les
    // assurances n'est pas chargée") — en réalité la SÉLECTION correcte,
    // chargée par chargerPourEdition depuis le reçu, était systématiquement
    // écrasée ici par "la première assurance du patient", quelle qu'elle
    // soit. On la préserve désormais si elle correspond bien à une des
    // assurances de ce patient ; on ne retombe sur la première que si rien
    // de valide n'était déjà sélectionné (comportement d'origine).
    setAssurancePatientChoisie((precedent) => {
      if (precedent && r.data.some((a) => String(a.numero_enreg) === String(precedent))) return precedent;
      return r.data.length > 0 ? r.data[0].numero_enreg : "";
    });
  }

  useEffect(() => {
    if (patientSelectionne && !patientSelectionne.EstClientCash && avecAssurance) {
      rechargerAssurancesPatient();
      api.get("/assurances").then((r) => setAssurancesDisponibles(r.data));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientSelectionne, avecAssurance]);

  async function creerLienAssurance() {
    if (!nouveauLienAssurance.assurance_numero_enreg) return setErreur("Choisissez une assurance.");
    setErreur("");
    try {
      await api.post("/assurances/patients", {
        numero_enreg: 0,
        patient_numero_enreg: patientSelectionne.Numéro_Enreg,
        assurance_numero_enreg: Number(nouveauLienAssurance.assurance_numero_enreg),
        numero_adherent: nouveauLienAssurance.numero_adherent || null,
        // Le %PC n'est jamais envoyé depuis la Caisse : le serveur le
        // reprend systématiquement depuis la configuration de l'assurance
        // elle-même (voir lier_patient_assurance côté backend).
      });
      setFormulaireLienAssuranceOuvert(false);
      setNouveauLienAssurance({ assurance_numero_enreg: "", numero_adherent: "" });
      await rechargerAssurancesPatient();
    } catch (err) {
      setErreur(err.response?.data?.detail || "Erreur lors du rattachement.");
    }
  }

  const rechercherPatientDebounce = useCallback(async (texte) => {
    setRecherchePatient(texte);
    if (texte.length < 2) return setResultatsPatients([]);
    const r = await api.get("/patients", { params: { recherche: texte } });
    setResultatsPatients(r.data);
  }, []);

  const rechercherChangerDebounce = useCallback(async (texte) => {
    setRechercheChanger(texte);
    if (texte.length < 2) return setResultatsChanger([]);
    const r = await api.get("/patients", { params: { recherche: texte } });
    setResultatsChanger(r.data);
  }, []);

  function choisirPatientDepuisChanger(p) {
    setPatientSelectionne(p);
    setModaleChangerOuverte(false);
    setRechercheChanger("");
    setResultatsChanger([]);
  }

  async function creerNouveauPatient() {
    if (!nouveauPatient.Nom.trim()) return setErreurPatient("Le nom est obligatoire.");
    setErreurPatient("");
    setCreationPatientEnCours(true);
    try {
      const r = await api.post("/patients", nouveauPatient);
      setPatientSelectionne(r.data);
      setFormulaireNouveauPatientOuvert(false);
      setNouveauPatient({ Nom: "", Prénoms: "", Téléphone: "", Adresse: "", "Date Naissance": "", Sexe: "" });
      setRecherchePatient("");
      setResultatsPatients([]);
    } catch (err) {
      setErreurPatient(err.response?.data?.detail || "Erreur lors de la création du patient.");
    } finally {
      setCreationPatientEnCours(false);
    }
  }

  async function selectionnerClientCash() {
    setErreur("");
    try {
      const r = await api.get("/patients/client-cash");
      setPatientSelectionne(r.data);
      setRecherchePatient("");
      setResultatsPatients([]);
    } catch (err) {
      setErreur(err.response?.data?.detail || "Impossible de récupérer le Client CASH. Réessayez.");
    }
  }

  function ajouterActeRapide(acte) {
    setLignesRapides((precedent) => [
      ...precedent,
      { code_produit: acte["Code Produit"], libelle: acte["Libellé"], domaine: acte["Domaine"], quantite: 1, prix_unitaire: acte["Prix Public"], pourcentage_remise: 0 },
    ]);
    setRechercheActeRapide("");
  }

  function retirerLigne(index) {
    const ligne = panier[index];
    if (index < lignesSchema.length) {
      // Ligne issue du schéma dentaire : on demande au composant de retirer
      // cet acte précis pour cette dent (met aussi à jour la couleur de la dent).
      refSchema.current?.retirerActe(ligne.numero_dent, ligne.code_produit);
    } else {
      setLignesRapides((precedent) => precedent.filter((_, i) => i !== index - lignesSchema.length));
    }
  }

  /** Augmente/diminue la quantité d'une ligne du panier (acte dentaire ou saisie rapide), minimum 1. */
  function changerQuantite(index, delta) {
    const ligne = panier[index];
    const nouvelleQuantite = ligne.quantite + delta;
    if (nouvelleQuantite < 1) return;
    if (index < lignesSchema.length) {
      refSchema.current?.changerQuantite(ligne.numero_dent, ligne.code_produit, nouvelleQuantite);
    } else {
      setLignesRapides((precedent) =>
        precedent.map((l, i) => (i === index - lignesSchema.length ? { ...l, quantite: nouvelleQuantite } : l))
      );
    }
  }

  const totalPanier = panier.reduce((somme, l) => somme + l.quantite * l.prix_unitaire * (1 - l.pourcentage_remise / 100), 0);

  // § demande utilisateur : "Nouveau reçu" réutilisé EN MODIFICATION pour
  // corriger un reçu pas encore payé (identité mal orthographiée, assurance,
  // dents/actes) — plutôt qu'une modale séparée pour ce cas précis.
  const [referenceEnEdition, setReferenceEnEdition] = useState(null);

  async function chargerPourEdition(reference) {
    const rVente = await api.get(`/caisse/ventes/${reference}`);
    const vente = rVente.data;
    const rPatient = await api.get(`/patients/${vente["Code Client"]}`);
    setPatientSelectionne(rPatient.data);
    const identite = vente.identite_recu || {};
    setIdentiteRecu({
      Nom: identite.nom || "", Prénoms: identite.prenoms || "",
      DateNaissance: identite.date_naissance ? String(identite.date_naissance).slice(0, 10) : "",
      Téléphone: identite.telephone || "", Sexe: identite.sexe || "",
    });
    setAvecAssurance(!!vente.assurance_patient_numero_enreg);
    setAssurancePatientChoisie(vente.assurance_patient_numero_enreg || "");
    setNumeroBon(vente.numero_bon != null ? String(vente.numero_bon) : "");
    setSouscripteur(vente.souscripteur || "");
    // § correctif (bug rapporté : "en modification la liste de toutes les
    // assurances n'est pas chargée") — chargées ici de façon explicite et
    // directe plutôt que de compter uniquement sur l'effet réactif
    // [patientSelectionne, avecAssurance], pour une garantie de résultat
    // quel que soit l'ordre exact de traitement des mises à jour d'état.
    if (vente.assurance_patient_numero_enreg) {
      const [rAssurancesPatient, rAssurancesDisponibles] = await Promise.all([
        api.get(`/assurances/patients/${vente["Code Client"]}`),
        api.get("/assurances"),
      ]);
      setAssurancesPatient(rAssurancesPatient.data);
      setAssurancesDisponibles(rAssurancesDisponibles.data);
    }
    setModeReglement(vente.mode_reglement || "Espèces");
    setReferencePaiement(vente.reference_paiement || "");
    // § correctif (doublon "APPLICATION DE FLUOR (13i)" constaté à l'usage) :
    // les lignes déjà rattachées à une dent doivent être injectées dans
    // l'état INTERNE du schéma (actesInitiaux ci-dessous), pas seulement
    // coloriées — sinon les cases "actes applicables" démarrent décochées
    // et cocher un acte déjà présent l'ajoute EN DOUBLE au panier plutôt que
    // de simplement le refléter. Seules les lignes SANS dent (consultations
    // générales...) restent dans le panier "saisie rapide" classique.
    const lignesAvecDent = (vente.lignes || []).filter((l) => l.numero_dent_international || l.numero_dent);
    const lignesSansDent = (vente.lignes || []).filter((l) => !(l.numero_dent_international || l.numero_dent));

    const DOMAINE_VERS_STATUT = {
      PROTHE: "Couronne/Bridge", SCHIRU: "Implant", SPARAD: "Problème Parodontal",
    };
    const actesInitiaux = {};
    const statutsParDent = {};
    for (const ligne of lignesAvecDent) {
      const numero = ligne.numero_dent_international || ligne.numero_dent;
      actesInitiaux[numero] = actesInitiaux[numero] || [];
      actesInitiaux[numero].push({
        code_produit: ligne.code_produit, libelle: ligne.libelle, domaine: ligne.domaine,
        quantite: ligne.quantite || 1, prix_public: ligne.prix_unitaire,
      });
      // Le statut affiché reprend celui du DERNIER acte de la dent (même
      // règle que SchemaDentaire.appliquerActesMisAJour, pour rester cohérent).
      statutsParDent[numero] = DOMAINE_VERS_STATUT[ligne.domaine] || "Carie/Obturation";
    }

    setLignesSchema([]); // reconstruit par le schéma lui-même via onChangerPanier, à partir d'actesInitiaux
    setLignesRapides(lignesSansDent.map((l) => ({ ...l })));
    setActesEditionInitiaux(actesInitiaux);
    setSchemaEditionInitial(statutsParDent);
    setCleSchema((c) => c + 1);
    setReferenceEnEdition(reference);
    setErreur("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function annulerEdition() {
    setReferenceEnEdition(null);
    setPatientSelectionne(null);
    setLignesSchema([]);
    setLignesRapides([]);
    setSchemaEditionInitial({});
    setActesEditionInitiaux({});
    setCleSchema((c) => c + 1);
    setAvecAssurance(false);
    setAssurancePatientChoisie("");
    setNumeroBon("");
    setSouscripteur("");
    setMontantRegleMaintenant("");
  }

  async function validerVente(typeDocument) {
    if (!patientSelectionne) return setErreur("Sélectionnez un patient.");
    if (panier.length === 0) return setErreur("Le panier est vide.");
    if (avecAssurance && !assurancePatientChoisie) return setErreur("Sélectionnez l'assurance du patient.");
    if (avecAssurance && !String(numeroBon).trim()) return setErreur("Le numéro de bon est obligatoire pour attacher une prise en charge.");
    if (avecAssurance && !/^\d+$/.test(String(numeroBon).trim())) return setErreur("Le numéro de bon doit être numérique.");
    if (avecAssurance && !souscripteur.trim()) return setErreur("Le souscripteur est obligatoire pour attacher une prise en charge.");
    if (montantRegleMaintenant !== "" && Number(montantRegleMaintenant) <= 0) return setErreur("Le montant réglé maintenant doit être positif.");
    if (montantRegleMaintenant !== "" && Number(montantRegleMaintenant) > totalPanier + 0.01) return setErreur("Le montant réglé maintenant ne peut pas dépasser le total du panier.");
    if (!identiteRecu.Nom.trim() || !identiteRecu.Prénoms.trim() || !identiteRecu.DateNaissance || !identiteRecu.Téléphone.trim() || !identiteRecu.Sexe) {
      return setErreur("L'identité complète (nom, prénoms, date de naissance, téléphone, sexe) est obligatoire sur tout reçu.");
    }

    // Si le mode de règlement choisi exige une référence de transaction
    // (paramétré depuis Administration → Paiements) et qu'elle n'a pas
    // encore été saisie, on ouvre la modale dédiée au lieu de soumettre.
    const typeChoisi = typesPaiement.find((t) => t.nom === modeReglement);
    if (typeChoisi?.exige_reference && !referencePaiement.trim()) {
      setErreur("");
      setTypeDocumentEnAttente(typeDocument);
      setModaleReferenceOuverte(true);
      return;
    }

    setErreur("");
    setEnCours(true);
    const payload = {
      patient_numero_enreg: patientSelectionne.Numéro_Enreg,
      lignes: panier.map((l) => ({
        code_produit: l.code_produit, libelle: l.libelle, domaine: l.domaine,
        quantite: l.quantite, prix_unitaire: l.prix_unitaire, pourcentage_remise: l.pourcentage_remise,
        numero_dent: l.numero_dent ?? null, sous_total: l.quantite * l.prix_unitaire * (1 - l.pourcentage_remise / 100),
      })),
      type_document: typeDocument,
      montant_regle_maintenant: typeDocument === "Reçu" && montantRegleMaintenant !== "" ? Number(montantRegleMaintenant) : null,
      mode_reglement: modeReglement,
      reference_paiement: referencePaiement.trim() || null,
      assurance_patient_numero_enreg: avecAssurance ? Number(assurancePatientChoisie) : null,
      numero_bon: avecAssurance ? Number(numeroBon) : null,
      souscripteur: avecAssurance ? souscripteur.trim() : null,
      identite_recu: {
        nom: identiteRecu.Nom.trim(),
        prenoms: identiteRecu.Prénoms.trim(),
        date_naissance: identiteRecu.DateNaissance,
        telephone: identiteRecu.Téléphone.trim(),
        sexe: identiteRecu.Sexe,
      },
    };
    try {
      // § mode édition ("Nouveau reçu" réutilisé en modification) : PUT sur
      // le reçu existant plutôt que POST d'une nouvelle vente.
      const reponse = referenceEnEdition
        ? await api.put(`/caisse/ventes/${referenceEnEdition}`, payload)
        : await api.post("/caisse/ventes", payload);
      setDernierRecu(reponse.data);
      setLignesSchema([]);
      setLignesRapides([]);
      setSchemaEditionInitial({});
      setActesEditionInitiaux({});
      setCleSchema((c) => c + 1);
      setReferencePaiement("");
      setMontantRegleMaintenant("");
      setModaleReferenceOuverte(false);
      setTypeDocumentEnAttente(null);
      setAvecAssurance(false);
      setAssurancePatientChoisie("");
      setNumeroBon("");
      setSouscripteur("");
      setReferenceEnEdition(null);
      // Si le Client CASH a été utilisé, l'identité saisie ne concerne QUE ce
      // reçu — on la vide pour éviter qu'elle soit réutilisée par erreur pour
      // le client suivant qui choisirait aussi "Vente au comptant".
      if (patientSelectionne?.EstClientCash) {
        setIdentiteRecu({ Nom: "", Prénoms: "", DateNaissance: "", Téléphone: "", Sexe: "" });
        setPatientSelectionne(null);
      }
    } catch (err) {
      setErreur(err.response?.data?.detail || "Erreur lors de l'enregistrement de la vente.");
    } finally {
      setEnCours(false);
    }
  }

  /** Enregistre l'identité saisie pour ce reçu sur la fiche patient (§ demande utilisateur) :
   *  met à jour le patient réel sélectionné, ou — pour le Client CASH — crée un vrai patient à partir de ces informations. */
  async function enregistrerIdentitePatient() {
    if (!identiteRecu.Nom.trim() || !identiteRecu.Prénoms.trim()) {
      return setMessageIdentite("Renseignez au moins le nom et les prénoms avant d'enregistrer.");
    }
    setEnregistrementIdentiteEnCours(true);
    setMessageIdentite("");
    const donnees = {
      Nom: identiteRecu.Nom.trim(),
      Prénoms: identiteRecu.Prénoms.trim(),
      "Date Naissance": identiteRecu.DateNaissance || null,
      Téléphone: identiteRecu.Téléphone.trim(),
      Sexe: identiteRecu.Sexe || null,
    };
    try {
      if (patientSelectionne.EstClientCash) {
        const r = await api.post("/patients", donnees);
        setPatientSelectionne(r.data);
        setMessageIdentite(`Nouveau patient enregistré — ID Patient ${r.data.ID_Patient}.`);
      } else {
        await api.put(`/patients/${patientSelectionne.Numéro_Enreg}`, donnees);
        setPatientSelectionne({ ...patientSelectionne, ...donnees });
        setMessageIdentite("Fiche patient mise à jour.");
      }
    } catch (err) {
      setMessageIdentite(err.response?.data?.detail || "Erreur lors de l'enregistrement.");
    } finally {
      setEnregistrementIdentiteEnCours(false);
      setTimeout(() => setMessageIdentite(""), 4000);
    }
  }

  const suggestionsActesRapides = rechercheActeRapide.length > 0
    ? catalogue.filter((a) => a["Libellé"].toLowerCase().includes(rechercheActeRapide.toLowerCase())).slice(0, 8)
    : [];

  return (
    <div>
      <div className="titre-page">Caisse de {utilisateur?.nom_complet || utilisateur?.login}</div>
      <div className="sous-titre-page">Établir un reçu ou une proforma pour un patient</div>

      {referenceEnEdition && (
        <div className="carte" style={{ marginBottom: 16, background: "#fef2e0", border: "1px solid #f2c40c55", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 13, color: "var(--sawali-orange)", fontWeight: 600 }}>
            ✏️ Modification du reçu {referenceEnEdition} — identité, assurance et actes/dents modifiables ci-dessous.
          </div>
          <button className="bouton-secondaire" onClick={annulerEdition}>✕ Quitter la modification</button>
        </div>
      )}

      {/* --- Recherche / sélection / création patient --- */}
      <div className="carte" style={{ marginBottom: 20 }}>
        {patientSelectionne ? (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
                {patientSelectionne.Nom} {patientSelectionne.Prénoms}
                {patientSelectionne.EstClientCash && <span className="badge badge-orange">Vente au comptant</span>}
              </div>
              <div style={{ fontSize: 13, color: "var(--sawali-gris-fonce)" }}>
                {patientSelectionne.EstClientCash ? "Aucun patient identifié" : `ID ${patientSelectionne.ID_Patient} — ${patientSelectionne.Téléphone || "sans téléphone"}`}
              </div>
            </div>
            <button className="bouton-secondaire" onClick={() => setModaleChangerOuverte(true)}>Changer</button>
          </div>
        ) : formulaireNouveauPatientOuvert ? (
          <div>
            <div style={{ fontWeight: 700, marginBottom: 10 }}>Nouveau patient</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
              <input className="champ-saisie" style={{ flex: "1 1 180px" }} placeholder="Nom *" value={nouveauPatient.Nom} onChange={(e) => setNouveauPatient({ ...nouveauPatient, Nom: e.target.value })} />
              <input className="champ-saisie" style={{ flex: "1 1 180px" }} placeholder="Prénoms" value={nouveauPatient.Prénoms} onChange={(e) => setNouveauPatient({ ...nouveauPatient, Prénoms: e.target.value })} />
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
              <input className="champ-saisie" style={{ flex: "1 1 180px" }} placeholder="Téléphone" value={nouveauPatient.Téléphone} onChange={(e) => setNouveauPatient({ ...nouveauPatient, Téléphone: e.target.value })} />
              <input className="champ-saisie" style={{ flex: "1 1 180px" }} placeholder="Adresse" value={nouveauPatient.Adresse} onChange={(e) => setNouveauPatient({ ...nouveauPatient, Adresse: e.target.value })} />
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
              <div style={{ flex: "1 1 180px" }}>
                <label style={{ fontSize: 12, color: "var(--sawali-gris-fonce)", display: "block", marginBottom: 2 }}>Date de naissance</label>
                <input className="champ-saisie" type="date" value={nouveauPatient["Date Naissance"]} onChange={(e) => setNouveauPatient({ ...nouveauPatient, "Date Naissance": e.target.value })} />
              </div>
              <div style={{ flex: "1 1 180px" }}>
                <label style={{ fontSize: 12, color: "var(--sawali-gris-fonce)", display: "block", marginBottom: 2 }}>Sexe</label>
                <select className="champ-saisie" value={nouveauPatient.Sexe} onChange={(e) => setNouveauPatient({ ...nouveauPatient, Sexe: e.target.value })}>
                  <option value="">—</option>
                  <option value="Masculin">Masculin</option>
                  <option value="Féminin">Féminin</option>
                </select>
              </div>
            </div>
            {erreurPatient && <div style={{ color: "var(--sawali-rouge)", fontSize: 13, marginBottom: 10 }}>{erreurPatient}</div>}
            <div style={{ display: "flex", gap: 10 }}>
              <button className="bouton-secondaire" onClick={() => { setFormulaireNouveauPatientOuvert(false); setErreurPatient(""); }}>Annuler</button>
              <button className="bouton-primaire" disabled={creationPatientEnCours} onClick={creerNouveauPatient}>
                {creationPatientEnCours ? "Création..." : "Créer et sélectionner"}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ position: "relative" }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <input
                className="champ-saisie"
                style={{ flex: "1 1 200px" }}
                placeholder="Rechercher un patient (nom, téléphone)..."
                value={rechercherPatient}
                onChange={(e) => rechercherPatientDebounce(e.target.value)}
              />
              <button className="bouton-secondaire" style={{ whiteSpace: "nowrap" }} onClick={() => setFormulaireNouveauPatientOuvert(true)}>
                + Nouveau patient
              </button>
              <button className="bouton-primaire" style={{ whiteSpace: "nowrap" }} onClick={selectionnerClientCash}>
                💵 Vente au comptant
              </button>
            </div>
            {erreur && <div style={{ color: "var(--sawali-rouge)", fontSize: 13, marginTop: 10 }}>{erreur}</div>}
            {resultatsPatients.length > 0 && (
              <div className="carte" style={{ position: "absolute", zIndex: 10, width: "100%", marginTop: 4, maxHeight: 260, overflowY: "auto" }}>
                {resultatsPatients.map((p) => (
                  <div
                    key={p.Numéro_Enreg}
                    style={{ padding: 8, cursor: "pointer", borderBottom: "1px solid #f0f2f7" }}
                    onClick={() => { setPatientSelectionne(p); setResultatsPatients([]); setRecherchePatient(""); }}
                  >
                    {p.Nom} {p.Prénoms} — {p.Téléphone || "-"}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* --- Modale "Changer de patient" : liste/recherche, sans fermer le panier en cours --- */}
      {modaleChangerOuverte && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(20,30,50,0.45)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setModaleChangerOuverte(false)}>
          <div className="carte" style={{ width: 420, maxWidth: "100%", maxHeight: "80vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontWeight: 700 }}>Sélectionner un autre patient</div>
              <button onClick={() => setModaleChangerOuverte(false)} style={{ border: "none", background: "none", fontSize: 18, cursor: "pointer", color: "var(--sawali-gris-fonce)" }}>✕</button>
            </div>
            <input
              className="champ-saisie"
              placeholder="Rechercher un patient (nom, téléphone)..."
              value={rechercheChanger}
              onChange={(e) => rechercherChangerDebounce(e.target.value)}
              autoFocus
              style={{ marginBottom: 10 }}
            />
            <button className="bouton-secondaire" style={{ width: "100%", marginBottom: 10 }} onClick={() => { selectionnerClientCash(); setModaleChangerOuverte(false); }}>
              💵 Basculer sur Vente au comptant
            </button>
            {resultatsChanger.length > 0 ? (
              <div>
                {resultatsChanger.map((p) => (
                  <div
                    key={p.Numéro_Enreg}
                    style={{ padding: 8, cursor: "pointer", borderBottom: "1px solid #f0f2f7" }}
                    onClick={() => choisirPatientDepuisChanger(p)}
                  >
                    {p.Nom} {p.Prénoms} — {p.Téléphone || "-"}
                  </div>
                ))}
              </div>
            ) : (
              rechercheChanger.length >= 2 && <div style={{ color: "var(--sawali-gris)", fontSize: 13 }}>Aucun patient trouvé.</div>
            )}
          </div>
        </div>
      )}

      {patientSelectionne && (
        <>
          {/* --- Identité obligatoire sur le reçu (nom, prénoms, date de naissance, téléphone, sexe) --- */}
          <div className="carte" style={{ marginBottom: 20, borderLeft: "4px solid var(--sawali-bleu)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
              <div style={{ fontWeight: 700 }}>Identité pour ce reçu</div>
              {!patientSelectionne.EstClientCash && (
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--sawali-bleu)" }}>ID Patient : {patientSelectionne.ID_Patient}</div>
              )}
            </div>
            <div style={{ fontSize: 12, color: "var(--sawali-gris-fonce)", marginBottom: 10 }}>
              Obligatoire sur tout reçu (règles cliniques), y compris en réglement par assurance.
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
              <input className="champ-saisie" style={{ flex: "1 1 160px" }} placeholder="Nom *" value={identiteRecu.Nom} onChange={(e) => setIdentiteRecu({ ...identiteRecu, Nom: e.target.value })} />
              <input className="champ-saisie" style={{ flex: "1 1 160px" }} placeholder="Prénoms *" value={identiteRecu.Prénoms} onChange={(e) => setIdentiteRecu({ ...identiteRecu, Prénoms: e.target.value })} />
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 160px" }}>
                <label style={{ fontSize: 12, color: "var(--sawali-gris-fonce)", display: "block", marginBottom: 2 }}>Date de naissance *</label>
                <input className="champ-saisie" type="date" value={identiteRecu.DateNaissance} onChange={(e) => setIdentiteRecu({ ...identiteRecu, DateNaissance: e.target.value })} />
              </div>
              <div style={{ flex: "1 1 160px" }}>
                <label style={{ fontSize: 12, color: "var(--sawali-gris-fonce)", display: "block", marginBottom: 2 }}>Téléphone *</label>
                <input className="champ-saisie" value={identiteRecu.Téléphone} onChange={(e) => setIdentiteRecu({ ...identiteRecu, Téléphone: e.target.value })} />
              </div>
              <div style={{ flex: "1 1 140px" }}>
                <label style={{ fontSize: 12, color: "var(--sawali-gris-fonce)", display: "block", marginBottom: 2 }}>Sexe *</label>
                <select className="champ-saisie" value={identiteRecu.Sexe} onChange={(e) => setIdentiteRecu({ ...identiteRecu, Sexe: e.target.value })}>
                  <option value="">—</option>
                  <option value="Masculin">Masculin</option>
                  <option value="Féminin">Féminin</option>
                </select>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
              <button className="bouton-secondaire" disabled={enregistrementIdentiteEnCours} onClick={enregistrerIdentitePatient}>
                {enregistrementIdentiteEnCours ? "Enregistrement..." : patientSelectionne.EstClientCash ? "Enregistrer comme nouveau patient" : "Enregistrer"}
              </button>
              {messageIdentite && <span style={{ fontSize: 13, color: messageIdentite.startsWith("Erreur") || messageIdentite.includes("Renseignez") ? "var(--sawali-rouge)" : "var(--sawali-vert)" }}>{messageIdentite}</span>}
            </div>
          </div>

          {/* --- Saisie rapide au clavier (§4b) --- */}
          <div className="carte" style={{ marginBottom: 20, position: "relative" }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Ajout rapide d'un acte</div>
            <input
              className="champ-saisie"
              placeholder="Rechercher un acte au clavier..."
              value={rechercheActeRapide}
              onChange={(e) => setRechercheActeRapide(e.target.value)}
            />
            {suggestionsActesRapides.length > 0 && (
              <div style={{ position: "absolute", zIndex: 10, width: "calc(100% - 40px)", background: "white", boxShadow: "var(--sawali-ombre)", borderRadius: 8, marginTop: 4 }}>
                {suggestionsActesRapides.map((a) => (
                  <div key={a["Code Produit"]} style={{ padding: 8, cursor: "pointer", display: "flex", justifyContent: "space-between" }} onClick={() => ajouterActeRapide(a)}>
                    <span>{a["Libellé"]}</span>
                    <span style={{ color: "var(--sawali-gris-fonce)" }}>{a["Prix Public"].toLocaleString("fr-FR")} F</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* --- Schéma dentaire interactif (§6) --- */}
          <SchemaDentaire ref={refSchema} key={cleSchema} numerotation={numerotationDentaire} actesDisponibles={catalogue.map((a) => ({ code_produit: a["Code Produit"], libelle: a["Libellé"], domaine: a["Domaine"], prix_public: a["Prix Public"] }))} statutsInitiaux={schemaEditionInitial} actesInitiaux={actesEditionInitiaux} onChangerPanier={setLignesSchema} />

          {/* --- Panier / validation --- */}
          <div className="carte" style={{ marginTop: 20 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Panier ({panier.length} ligne{panier.length > 1 ? "s" : ""})</div>
            <table className="tableau-donnees">
              <thead><tr><th>Description</th><th>Qté</th><th>Prix</th><th></th></tr></thead>
              <tbody>
                {panier.map((l, i) => (
                  <tr key={i}>
                    <td>{l.libelle}{l.numero_dent ? ` ${suffixeNumeroDent(l.numero_dent, numerotationDentaire)}` : ""}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <button onClick={() => changerQuantite(i, -1)} disabled={l.quantite <= 1} title="Diminuer" style={{ width: 22, height: 22, border: "1px solid #dde3ee", borderRadius: 6, background: "white", cursor: l.quantite <= 1 ? "default" : "pointer", color: l.quantite <= 1 ? "var(--sawali-gris)" : "var(--sawali-bleu)", lineHeight: 1, fontWeight: 700 }}>−</button>
                        <span style={{ minWidth: 18, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>{l.quantite}</span>
                        <button onClick={() => changerQuantite(i, 1)} title="Augmenter" style={{ width: 22, height: 22, border: "1px solid #dde3ee", borderRadius: 6, background: "white", cursor: "pointer", color: "var(--sawali-bleu)", lineHeight: 1, fontWeight: 700 }}>+</button>
                      </div>
                    </td>
                    <td className="chiffre">{(l.quantite * l.prix_unitaire).toLocaleString("fr-FR")} F</td>
                    <td>
                      <button onClick={() => retirerLigne(i)} title="Retirer cette ligne" style={{ border: "none", background: "none", color: "var(--sawali-rouge)", cursor: "pointer", fontSize: 15 }}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16, flexWrap: "wrap", gap: 10 }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: "var(--sawali-bleu)" }}>{totalPanier.toLocaleString("fr-FR")} FCFA</div>
              <div>
                <label style={{ fontSize: 12, color: "var(--sawali-gris-fonce)", display: "block", marginBottom: 2 }}>
                  Type de paiement {avecAssurance ? "(pour la part nette du patient)" : ""}
                </label>
                <select className="champ-saisie" style={{ width: 220 }} value={modeReglement} onChange={(e) => { setModeReglement(e.target.value); setReferencePaiement(""); }}>
                  {typesPaiement.map((t) => <option key={t.numero_enreg} value={t.nom}>{t.nom}</option>)}
                </select>
              </div>
              <div>
                {/* § bug corrigé : "un règlement partiel règle totalement
                    le reçu" — permet de préciser un montant réglé
                    maintenant INFÉRIEUR au total, pour un règlement
                    partiel dès la création (le reste devient un RAP,
                    complétable plus tard via "Compléter Paiement"). Ne
                    s'applique qu'en cliquant "Encaisser..." — laissé vide,
                    ce bouton règle le total en entier comme avant. */}
                <label style={{ fontSize: 12, color: "var(--sawali-gris-fonce)", display: "block", marginBottom: 2 }}>
                  Montant réglé maintenant (si partiel)
                </label>
                <input
                  type="number" className="champ-saisie" style={{ width: 220 }}
                  placeholder={`Vide = ${totalPanier.toLocaleString("fr-FR")} F (total)`}
                  value={montantRegleMaintenant} onChange={(e) => setMontantRegleMaintenant(e.target.value)}
                />
              </div>
            </div>

            {montantRegleMaintenant !== "" && Number(montantRegleMaintenant) > 0 && Number(montantRegleMaintenant) < totalPanier && (
              <div style={{ fontSize: 12, color: "var(--sawali-orange)", marginTop: 6 }}>
                ⚠️ Règlement partiel — il restera {(totalPanier - Number(montantRegleMaintenant)).toLocaleString("fr-FR")} F à encaisser plus tard (via "Compléter Paiement" dans l'historique).
              </div>
            )}

            {referencePaiement && (
              <div style={{ fontSize: 12.5, color: "var(--sawali-gris-fonce)", marginTop: 8 }}>
                Référence de transaction enregistrée : <strong>{referencePaiement}</strong>
                <button onClick={() => setReferencePaiement("")} style={{ border: "none", background: "none", color: "var(--sawali-bleu)", cursor: "pointer", marginLeft: 8, fontSize: 12.5 }}>modifier</button>
              </div>
            )}

            {/* --- Assurance : un COMPLÉMENT au type de paiement, jamais une alternative.
                 Section toujours visible pour tout patient qui n'est pas le Client CASH
                 (lequel ne peut jamais avoir d'assurance) — § demande utilisateur. --- */}
            {!patientSelectionne.EstClientCash && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #eef2fa" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                  <input type="checkbox" checked={avecAssurance} onChange={(e) => setAvecAssurance(e.target.checked)} />
                  Ce reçu est pris en charge (en partie) par une assurance
                </label>

                {avecAssurance && (
                  <div style={{ marginTop: 10 }}>
                    {assurancesPatient.length > 0 && !formulaireLienAssuranceOuvert ? (
                      <select
                        className="champ-saisie" value={assurancePatientChoisie}
                        onChange={(e) => {
                          // § demande utilisateur : changer d'assurance
                          // réinitialise le numéro de bon et le souscripteur
                          // (spécifiques à l'assurance PRÉCÉDENTE).
                          setAssurancePatientChoisie(e.target.value);
                          setNumeroBon("");
                          setSouscripteur("");
                        }}
                      >
                        {assurancesPatient.map((a) => (
                          <option key={a.numero_enreg} value={a.numero_enreg}>
                            {a.nom_assurance} — prise en charge {a.pourcentage_prise_en_charge}%
                          </option>
                        ))}
                      </select>
                    ) : formulaireLienAssuranceOuvert ? (
                      <div style={{ padding: 10, background: "var(--sawali-gris-clair)", borderRadius: 8 }}>
                        <select className="champ-saisie" style={{ marginBottom: 8 }} value={nouveauLienAssurance.assurance_numero_enreg} onChange={(e) => setNouveauLienAssurance({ ...nouveauLienAssurance, assurance_numero_enreg: e.target.value })}>
                          <option value="">Choisir une assurance...</option>
                          {assurancesDisponibles.map((a) => <option key={a.numero_enreg} value={a.numero_enreg}>{a.nom} ({a.pourcentage_prise_en_charge_defaut ?? 80}%)</option>)}
                        </select>
                        <input className="champ-saisie" placeholder="N° adhérent (facultatif)" value={nouveauLienAssurance.numero_adherent} onChange={(e) => setNouveauLienAssurance({ ...nouveauLienAssurance, numero_adherent: e.target.value })} style={{ marginBottom: 8 }} />
                        {nouveauLienAssurance.assurance_numero_enreg && (
                          <div style={{ fontSize: 13, color: "var(--sawali-gris-fonce)", marginBottom: 8 }}>
                            Prise en charge : <strong>{assurancesDisponibles.find((a) => a.numero_enreg === Number(nouveauLienAssurance.assurance_numero_enreg))?.pourcentage_prise_en_charge_defaut ?? 80}%</strong>
                            {" "}— définie sur cette assurance, non modifiable ici.
                          </div>
                        )}
                        <div style={{ display: "flex", gap: 8 }}>
                          <button className="bouton-secondaire" style={{ fontSize: 12, padding: "4px 10px" }} onClick={() => setFormulaireLienAssuranceOuvert(false)}>Annuler</button>
                          <button className="bouton-primaire" style={{ fontSize: 12, padding: "4px 10px" }} onClick={creerLienAssurance}>Rattacher</button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div style={{ fontSize: 13, color: "var(--sawali-rouge)", marginBottom: 6 }}>
                          Ce patient n'a aucune assurance enregistrée.
                        </div>
                        <button className="bouton-secondaire" style={{ fontSize: 12, padding: "4px 10px" }} onClick={() => { setFormulaireLienAssuranceOuvert(true); api.get("/assurances").then((r) => setAssurancesDisponibles(r.data)); }}>
                          + Rattacher une assurance
                        </button>
                      </div>
                    )}

                    {/* § demande utilisateur : numéro de bon (obligatoire,
                        toujours numérique) et souscripteur (personne
                        physique ou morale ayant signé la convention avec
                        l'assureur — jamais le patient), obligatoires dès
                        qu'une assurance est effectivement sélectionnée. */}
                    {assurancePatientChoisie && !formulaireLienAssuranceOuvert && (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10, marginTop: 10 }}>
                        <div>
                          <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 3 }}>N° de bon (obligatoire)</label>
                          <input type="number" className="champ-saisie" value={numeroBon} onChange={(e) => setNumeroBon(e.target.value)} placeholder="Toujours numérique" />
                        </div>
                        <div>
                          <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 3 }}>Souscripteur (obligatoire)</label>
                          <ChampSouscripteur valeur={souscripteur} onChanger={setSouscripteur} />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {erreur && <div style={{ color: "var(--sawali-rouge)", marginTop: 10 }}>{erreur}</div>}

            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button className="bouton-secondaire" disabled={enCours} onClick={() => validerVente("Proforma")}>{referenceEnEdition ? "💾 Enregistrer (Proforma)" : "Générer proforma"}</button>
              <button className="bouton-primaire" disabled={enCours} onClick={() => validerVente("Reçu")}>
                {referenceEnEdition
                  ? "💾 Enregistrer et encaisser"
                  : montantRegleMaintenant !== "" && Number(montantRegleMaintenant) > 0 && Number(montantRegleMaintenant) < totalPanier
                    ? `Encaisser ${Number(montantRegleMaintenant).toLocaleString("fr-FR")} F (partiel)`
                    : "Encaisser et générer le reçu"}
              </button>
              {referenceEnEdition && <button className="bouton-secondaire" disabled={enCours} onClick={annulerEdition}>✕ Annuler la modification</button>}
            </div>
          </div>
        </>
      )}

      {/* --- Modale de saisie de référence de transaction (mode de paiement l'exigeant) --- */}
      {modaleReferenceOuverte && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(20,30,50,0.45)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div className="carte" style={{ width: 380, maxWidth: "100%" }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Référence de transaction</div>
            <div style={{ fontSize: 13, color: "var(--sawali-gris-fonce)", marginBottom: 12 }}>
              Le mode de règlement « {modeReglement} » exige la référence de la transaction avant de finaliser le document.
            </div>
            <input
              className="champ-saisie"
              placeholder="Ex: numéro de transaction Orange Money..."
              value={referencePaiement}
              onChange={(e) => setReferencePaiement(e.target.value)}
              autoFocus
              style={{ marginBottom: 14 }}
            />
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button className="bouton-secondaire" onClick={() => { setModaleReferenceOuverte(false); setTypeDocumentEnAttente(null); }}>Annuler</button>
              <button
                className="bouton-primaire"
                disabled={!referencePaiement.trim()}
                onClick={() => { setModaleReferenceOuverte(false); if (typeDocumentEnAttente) validerVente(typeDocumentEnAttente); }}
              >
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}

      {dernierRecu && (
        <div className="carte" style={{ marginTop: 20, borderLeft: "4px solid var(--sawali-vert)" }}>
          <div style={{ fontWeight: 700 }}>Document créé : {dernierRecu.Référence}</div>
          {dernierRecu.prise_en_charge && (
            <div style={{ fontSize: 13, color: "var(--sawali-gris-fonce)", marginTop: 4 }}>
              Prise en charge ouverte — Assureur : {dernierRecu.prise_en_charge.part_assureur.toLocaleString("fr-FR")} F,
              Patient : {dernierRecu.prise_en_charge.part_assure.toLocaleString("fr-FR")} F
            </div>
          )}
          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
            <button className="bouton-secondaire" onClick={() => ouvrirFichier(`/caisse/ventes/${dernierRecu.Référence}/pdf`)}>Voir le PDF</button>
            <button className="bouton-primaire" onClick={() => imprimerPdf(`/caisse/ventes/${dernierRecu.Référence}/pdf`)}>🖨 Imprimer</button>
          </div>
        </div>
      )}

      {/* --- État de caisse du jour (§5) --- */}
      <EtatDeCaisseDuJour login={utilisateur?.login} />

      {/* --- Reçus récents (§ demande utilisateur : dupliquer/annuler) --- */}
      <RecusRecents login={utilisateur?.login} declencheur={cleSchema} onModifier={chargerPourEdition} />
    </div>
  );
}

/**
 * Reçus récents (§ demande utilisateur) : le caissier peut dupliquer un
 * reçu (nouvelle référence, même contenu facturé) ou l'annuler (exclu des
 * totaux de l'état de caisse, mais visible barré — droit PeutSupprimerRecu
 * ou Administrateur requis côté serveur, vérifié ici seulement pour masquer
 * le bouton, le serveur reste la seule source de vérité).
 */
function RecusRecents({ login, declencheur, onModifier }) {
  const aujourdHui = new Date().toISOString().slice(0, 10);
  const [recus, setRecus] = useState([]);
  const [monProfil, setMonProfil] = useState(null);
  const [ouvert, setOuvert] = useState(false);
  const [messageStatut, setMessageStatut] = useState("");
  // § demande utilisateur : sélecteur de période, initialisé à aujourd'hui.
  // Changer les dates ne recharge PAS automatiquement à chaque frappe (une
  // saisie de date se fait en plusieurs étapes) — un bouton "Actualiser la
  // période" explicite déclenche le rechargement une fois la période choisie.
  const [dateDebut, setDateDebut] = useState(aujourdHui);
  const [dateFin, setDateFin] = useState(aujourdHui);
  const [periodeNonAppliquee, setPeriodeNonAppliquee] = useState(false);
  // § demande utilisateur : filtre par type de paiement, liste déroulante en
  // haut du tableau — alimentée par les modes réellement configurés.
  const [typesPaiement, setTypesPaiement] = useState([]);
  const [modeReglementFiltre, setModeReglementFiltre] = useState("");

  useEffect(() => { api.get("/utilisateurs/moi").then((r) => setMonProfil(r.data)); }, []);
  useEffect(() => { api.get("/types-paiement").then((r) => setTypesPaiement(r.data)).catch(() => {}); }, []);

  function charger(debut = dateDebut, fin = dateFin) {
    // § demande utilisateur : tri par Date/Heure décroissante (le plus
    // récent en premier) — le backend trie déjà ainsi, on ne le retourne
    // plus côté client (l'ancien .reverse() inversait par erreur en ordre
    // croissant).
    api.get("/caisse/ventes", { params: { date_debut: debut, date_fin: fin, mode_reglement: modeReglementFiltre || undefined } })
      .then((r) => setRecus(r.data));
    setPeriodeNonAppliquee(false);
  }
  // § remarque utilisateur : le panneau doit montrer TOUS les reçus de la
  // période pour le cabinet — pas seulement ceux créés par le compte
  // actuellement connecté (un reçu créé par un autre caissier/Admin
  // n'apparaissait pas, d'où "aucun reçu ce matin" alors qu'il en existait).
  useEffect(() => charger(), [login, ouvert, declencheur, modeReglementFiltre]); // eslint-disable-line react-hooks/exhaustive-deps

  function changerDate(champ, valeur) {
    if (champ === "debut") setDateDebut(valeur); else setDateFin(valeur);
    setPeriodeNonAppliquee(true);
  }

  async function dupliquer(reference) {
    await api.post(`/caisse/ventes/${reference}/dupliquer`);
    setMessageStatut(`✅ Reçu dupliqué.`);
    charger();
    setTimeout(() => setMessageStatut(""), 3000);
  }
  async function annuler(reference) {
    if (!window.confirm(`Annuler le reçu ${reference} ? Son montant ne sera plus compté dans l'état de caisse.`)) return;
    try {
      await api.put(`/caisse/ventes/${reference}/annuler`);
      setMessageStatut(`✅ Reçu annulé.`);
      charger();
      setTimeout(() => setMessageStatut(""), 3000);
    } catch (err) {
      setMessageStatut(`⚠️ ${err.response?.data?.detail || "Annulation impossible."}`);
    }
  }

  // § demande utilisateur : plus d'encaissement en un clic — ouvre la
  // modale de détail (lignes, montants), qui permet de confirmer/ajuster le
  // montant avant de valider.
  const [referenceEnEncaissement, setReferenceEnEncaissement] = useState(null);

  const peutAnnuler = monProfil?.PeutSupprimerRecu || monProfil?.role === "Administrateur";

  return (
    <div className="carte" style={{ marginTop: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div style={{ fontWeight: 700 }}>🧾 Historique des reçus (tout le cabinet)</div>
        <button className="bouton-secondaire" onClick={() => setOuvert(!ouvert)}>{ouvert ? "▴ Masquer" : "▾ Afficher"}</button>
      </div>
      {ouvert && (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 3 }}>Du</label>
              <input type="date" className="champ-saisie" style={{ width: 150 }} value={dateDebut} onChange={(e) => changerDate("debut", e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 3 }}>Au</label>
              <input type="date" className="champ-saisie" style={{ width: 150 }} value={dateFin} onChange={(e) => changerDate("fin", e.target.value)} />
            </div>
            {/* § demande utilisateur : une fois la période changée, un bouton
                explicite déclenche le rechargement — pas de requête à chaque
                frappe pendant la saisie des dates. */}
            <button className={periodeNonAppliquee ? "bouton-primaire" : "bouton-secondaire"} onClick={() => charger()}>
              🔄 Actualiser la période{periodeNonAppliquee && " ●"}
            </button>
            {periodeNonAppliquee && <span style={{ fontSize: 12, color: "var(--sawali-orange)" }}>Période modifiée — cliquez pour appliquer</span>}
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 3 }}>Type de paiement</label>
              <select className="champ-saisie" style={{ width: 170 }} value={modeReglementFiltre} onChange={(e) => setModeReglementFiltre(e.target.value)}>
                <option value="">Tous les types</option>
                {typesPaiement.map((t) => <option key={t.nom} value={t.nom}>{t.nom}</option>)}
              </select>
            </div>
          </div>

          {recus.length === 0 ? (
            <div style={{ color: "var(--sawali-gris)", fontSize: 13.5 }}>Aucun reçu sur cette période.</div>
          ) : (
            <table className="tableau-donnees">
              <thead><tr><th>Référence</th><th>Patient</th><th>Type de paiement</th><th>Montant</th><th>RAP</th><th>Date</th><th>Caissier</th><th></th></tr></thead>
              <tbody>
                {recus.map((r) => {
                  // § demande utilisateur : un reçu dupliqué et non
                  // intégralement payé ne peut être ouvert que pour être
                  // encaissé — jamais consulté comme un reçu final. Le
                  // bouton "Encaisser" s'affiche pour TOUT reçu avec un RAP
                  // (pas seulement les duplicatas) et ouvre systématiquement
                  // la modale de détail — plus d'encaissement en un clic.
                  const dupliqueNonPaye = r.duplique_de && !r.Réglé;
                  const aRAP = r.reste_a_payer > 0;
                  return (
                    <tr key={r.Référence} style={r.annule ? { opacity: 0.55, textDecoration: "line-through" } : undefined}>
                      <td>
                        {r.Référence}
                        {r.annule && <span className="badge badge-rouge" style={{ marginLeft: 6, fontSize: 10, textDecoration: "none", display: "inline-block" }}>Annulé</span>}
                        {!r.annule && dupliqueNonPaye && <span className="badge badge-orange" style={{ marginLeft: 6, fontSize: 10, textDecoration: "none", display: "inline-block" }}>Dupliqué — à encaisser</span>}
                      </td>
                      <td>{r.patient_affiche || r.Libellé}</td>
                      <td>{r.mode_reglement || "-"}</td>
                      <td className="chiffre">{Number(r.Montant || 0).toLocaleString("fr-FR")}</td>
                      <td className="chiffre">{aRAP ? Number(r.reste_a_payer).toLocaleString("fr-FR") : "-"}</td>
                      <td>{r["Date Vente"] ? new Date(r["Date Vente"]).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "-"}</td>
                      <td style={{ fontSize: 12, color: "var(--sawali-gris-fonce)" }}>{r["Code Vendeur"] || "-"}</td>
                      <td style={{ whiteSpace: "nowrap", textDecoration: "none" }}>
                        {aRAP && (
                          <button className="bouton-primaire" style={{ fontSize: 11.5, padding: "3px 8px", marginRight: 6 }} onClick={() => setReferenceEnEncaissement(r.Référence)}>💰 Compléter Paiement</button>
                        )}
                        {/* § demande utilisateur : "Modifier" réutilise la page "Nouveau reçu" en
                            édition (identité, assurance, dents/actes) — réservé aux reçus sur
                            lesquels rien n'a encore été réglé (cohérent avec la restriction backend). */}
                        {aRAP && !r.MontantRéglé && (
                          <button className="bouton-secondaire" style={{ fontSize: 11.5, padding: "3px 8px", marginRight: 6 }} onClick={() => onModifier?.(r.Référence)}>✏️ Modifier</button>
                        )}
                        {!dupliqueNonPaye && (
                          <button className="bouton-secondaire" style={{ fontSize: 11.5, padding: "3px 8px", marginRight: 6 }} onClick={() => ouvrirFichier(`/caisse/ventes/${r.Référence}/pdf`)}>👁 Consulter</button>
                        )}
                        {!r.annule && (
                          <>
                            <button className="bouton-secondaire" style={{ fontSize: 11.5, padding: "3px 8px", marginRight: 6 }} onClick={() => dupliquer(r.Référence)}>📋 Dupliquer</button>
                            {peutAnnuler && (
                              <button style={{ fontSize: 11.5, padding: "3px 8px", border: "1.5px solid var(--sawali-rouge)", borderRadius: 8, background: "transparent", color: "var(--sawali-rouge)", cursor: "pointer" }} onClick={() => annuler(r.Référence)}>
                                ✕ Annuler
                              </button>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                {/* § demande utilisateur : totaux (montant et RAP) des données affichées. */}
                <tr style={{ fontWeight: 700, borderTop: "2px solid var(--sawali-bordure)" }}>
                  <td colSpan={3}>Total ({recus.filter((r) => !r.annule).length} reçu{recus.filter((r) => !r.annule).length > 1 ? "s" : ""}, hors annulés)</td>
                  <td className="chiffre">{recus.filter((r) => !r.annule).reduce((s, r) => s + (r.Montant || 0), 0).toLocaleString("fr-FR")}</td>
                  <td className="chiffre">{recus.filter((r) => !r.annule).reduce((s, r) => s + (r.reste_a_payer || 0), 0).toLocaleString("fr-FR")}</td>
                  <td colSpan={3}></td>
                </tr>
              </tfoot>
            </table>
          )}
          {messageStatut && <div style={{ marginTop: 10, fontSize: 13, color: messageStatut.startsWith("⚠️") ? "var(--sawali-rouge)" : "var(--sawali-vert)" }}>{messageStatut}</div>}
        </div>
      )}
      <ModaleEncaissement
        reference={referenceEnEncaissement}
        onFermer={() => setReferenceEnEncaissement(null)}
        onEncaisse={() => {
          setMessageStatut("✅ Reçu encaissé.");
          charger();
          setTimeout(() => setMessageStatut(""), 3000);
        }}
      />
    </div>
  );
}

/**
 * État de caisse (§5) : le caissier peut à tout moment consulter/imprimer le
 * récapitulatif de ses encaissements du jour (ou d'une période choisie),
 * fidèle au modèle "Etat des encaissements" fourni en référence.
 */
function EtatDeCaisseDuJour({ login }) {
  const aujourdHui = new Date().toISOString().slice(0, 10);
  const [dateDebut, setDateDebut] = useState(aujourdHui);
  const [dateFin, setDateFin] = useState(aujourdHui);
  const [ouvert, setOuvert] = useState(false);

  function chemin() {
    return `/caisse/etat-de-caisse/pdf?date_debut=${dateDebut}&date_fin=${dateFin}&caissier=${encodeURIComponent(login || "")}`;
  }

  return (
    <div className="carte" style={{ marginTop: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontWeight: 700 }}>Mon état de caisse</div>
        <button className="bouton-secondaire" onClick={() => setOuvert(!ouvert)}>{ouvert ? "Masquer" : "Consulter"}</button>
      </div>
      {ouvert && (
        <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>Du</label>
            <input className="champ-saisie" type="date" value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>Au</label>
            <input className="champ-saisie" type="date" value={dateFin} onChange={(e) => setDateFin(e.target.value)} />
          </div>
          <button className="bouton-secondaire" onClick={() => ouvrirFichier(chemin())}>Voir le PDF</button>
          <button className="bouton-primaire" onClick={() => imprimerPdf(chemin())}>🖨 Imprimer</button>
        </div>
      )}
    </div>
  );
}
