// pages/Caisse.jsx
// --------------------
// Interface du Caissier (§4b-d) : recherche/sélection du patient, panier de
// prestations (via le schéma dentaire OU saisie clavier avec autocomplétion),
// puis génération d'un Reçu (payé) ou d'une Proforma (différé).

import { useState, useEffect, useCallback } from "react";
import api from "../utils/api";
import { ouvrirFichier, imprimerPdf } from "../utils/fichiers";
import { useAuth } from "../utils/authContexte";
import SchemaDentaire from "../components/SchemaDentaire";

export default function Caisse() {
  const { utilisateur } = useAuth();
  const [rechercherPatient, setRecherchePatient] = useState("");
  const [resultatsPatients, setResultatsPatients] = useState([]);
  const [patientSelectionne, setPatientSelectionne] = useState(null);
  const [formulaireNouveauPatientOuvert, setFormulaireNouveauPatientOuvert] = useState(false);
  const [nouveauPatient, setNouveauPatient] = useState({ Nom: "", Prénoms: "", Téléphone: "", Adresse: "" });
  const [erreurPatient, setErreurPatient] = useState("");
  const [creationPatientEnCours, setCreationPatientEnCours] = useState(false);

  const [catalogue, setCatalogue] = useState([]);
  const [rechercheActeRapide, setRechercheActeRapide] = useState("");
  const [panier, setPanier] = useState([]); // fusion : lignes venant du schéma + saisie rapide
  const [lignesSchema, setLignesSchema] = useState([]);
  const [lignesRapides, setLignesRapides] = useState([]);

  const [modeReglement, setModeReglement] = useState("Espèces");
  const [assurancesPatient, setAssurancesPatient] = useState([]);
  const [assurancePatientChoisie, setAssurancePatientChoisie] = useState("");
  const [assurancesDisponibles, setAssurancesDisponibles] = useState([]);
  const [formulaireLienAssuranceOuvert, setFormulaireLienAssuranceOuvert] = useState(false);
  const [nouveauLienAssurance, setNouveauLienAssurance] = useState({ assurance_numero_enreg: "", numero_adherent: "", pourcentage_prise_en_charge: 80 });
  const [enCours, setEnCours] = useState(false);
  const [dernierRecu, setDernierRecu] = useState(null);
  const [erreur, setErreur] = useState("");

  useEffect(() => {
    api.get("/produits").then((r) => setCatalogue(r.data));
  }, []);

  useEffect(() => {
    setPanier([...lignesSchema, ...lignesRapides]);
  }, [lignesSchema, lignesRapides]);

  async function rechargerAssurancesPatient() {
    if (!patientSelectionne) return;
    const r = await api.get(`/assurances/patients/${patientSelectionne.Numéro_Enreg}`);
    setAssurancesPatient(r.data);
    if (r.data.length > 0) setAssurancePatientChoisie(r.data[0].numero_enreg);
  }

  useEffect(() => {
    if (patientSelectionne && modeReglement === "Assurance") {
      rechargerAssurancesPatient();
      api.get("/assurances").then((r) => setAssurancesDisponibles(r.data));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientSelectionne, modeReglement]);

  async function creerLienAssurance() {
    if (!nouveauLienAssurance.assurance_numero_enreg) return setErreur("Choisissez une assurance.");
    setErreur("");
    try {
      await api.post("/assurances/patients", {
        numero_enreg: 0,
        patient_numero_enreg: patientSelectionne.Numéro_Enreg,
        assurance_numero_enreg: Number(nouveauLienAssurance.assurance_numero_enreg),
        numero_adherent: nouveauLienAssurance.numero_adherent || null,
        pourcentage_prise_en_charge: Number(nouveauLienAssurance.pourcentage_prise_en_charge),
      });
      setFormulaireLienAssuranceOuvert(false);
      setNouveauLienAssurance({ assurance_numero_enreg: "", numero_adherent: "", pourcentage_prise_en_charge: 80 });
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

  async function creerNouveauPatient() {
    if (!nouveauPatient.Nom.trim()) return setErreurPatient("Le nom est obligatoire.");
    setErreurPatient("");
    setCreationPatientEnCours(true);
    try {
      const r = await api.post("/patients", nouveauPatient);
      setPatientSelectionne(r.data);
      setFormulaireNouveauPatientOuvert(false);
      setNouveauPatient({ Nom: "", Prénoms: "", Téléphone: "", Adresse: "" });
      setRecherchePatient("");
      setResultatsPatients([]);
    } catch (err) {
      setErreurPatient(err.response?.data?.detail || "Erreur lors de la création du patient.");
    } finally {
      setCreationPatientEnCours(false);
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
    setLignesRapides((precedent) => precedent.filter((_, i) => i !== index - lignesSchema.length));
  }

  const totalPanier = panier.reduce((somme, l) => somme + l.quantite * l.prix_unitaire * (1 - l.pourcentage_remise / 100), 0);

  async function validerVente(typeDocument) {
    if (!patientSelectionne) return setErreur("Sélectionnez un patient.");
    if (panier.length === 0) return setErreur("Le panier est vide.");
    if (modeReglement === "Assurance" && !assurancePatientChoisie) return setErreur("Sélectionnez l'assurance du patient.");
    setErreur("");
    setEnCours(true);
    try {
      const reponse = await api.post("/caisse/ventes", {
        patient_numero_enreg: patientSelectionne.Numéro_Enreg,
        lignes: panier.map((l) => ({
          code_produit: l.code_produit, libelle: l.libelle, domaine: l.domaine,
          quantite: l.quantite, prix_unitaire: l.prix_unitaire, pourcentage_remise: l.pourcentage_remise,
          numero_dent: l.numero_dent ?? null, sous_total: l.quantite * l.prix_unitaire * (1 - l.pourcentage_remise / 100),
        })),
        type_document: typeDocument,
        mode_reglement: modeReglement,
        assurance_patient_numero_enreg: modeReglement === "Assurance" ? Number(assurancePatientChoisie) : null,
      });
      setDernierRecu(reponse.data);
      setLignesSchema([]);
      setLignesRapides([]);
    } catch (err) {
      setErreur(err.response?.data?.detail || "Erreur lors de la création de la vente.");
    } finally {
      setEnCours(false);
    }
  }

  const suggestionsActesRapides = rechercheActeRapide.length > 0
    ? catalogue.filter((a) => a["Libellé"].toLowerCase().includes(rechercheActeRapide.toLowerCase())).slice(0, 8)
    : [];

  return (
    <div>
      <div className="titre-page">Caisse</div>
      <div className="sous-titre-page">Établir un reçu ou une proforma pour un patient</div>

      {/* --- Recherche / sélection / création patient --- */}
      <div className="carte" style={{ marginBottom: 20 }}>
        {patientSelectionne ? (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 700 }}>{patientSelectionne.Nom} {patientSelectionne.Prénoms}</div>
              <div style={{ fontSize: 13, color: "var(--sawali-gris-fonce)" }}>ID {patientSelectionne.ID_Patient} — {patientSelectionne.Téléphone || "sans téléphone"}</div>
            </div>
            <button className="bouton-secondaire" onClick={() => setPatientSelectionne(null)}>Changer</button>
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
            <div style={{ display: "flex", gap: 10 }}>
              <input
                className="champ-saisie"
                placeholder="Rechercher un patient (nom, téléphone)..."
                value={rechercherPatient}
                onChange={(e) => rechercherPatientDebounce(e.target.value)}
              />
              <button className="bouton-secondaire" style={{ whiteSpace: "nowrap" }} onClick={() => setFormulaireNouveauPatientOuvert(true)}>
                + Nouveau patient
              </button>
            </div>
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

      {patientSelectionne && (
        <>
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
          <SchemaDentaire actesDisponibles={catalogue.map((a) => ({ code_produit: a["Code Produit"], libelle: a["Libellé"], domaine: a["Domaine"], prix_public: a["Prix Public"] }))} onChangerPanier={setLignesSchema} />

          {/* --- Panier / validation --- */}
          <div className="carte" style={{ marginTop: 20 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Panier ({panier.length} ligne{panier.length > 1 ? "s" : ""})</div>
            <table className="tableau-donnees">
              <thead><tr><th>Description</th><th>Qté</th><th>Prix</th><th></th></tr></thead>
              <tbody>
                {panier.map((l, i) => (
                  <tr key={i}>
                    <td>{l.libelle}{l.numero_dent ? ` (dent ${l.numero_dent})` : ""}</td>
                    <td>{l.quantite}</td>
                    <td>{(l.quantite * l.prix_unitaire).toLocaleString("fr-FR")} F</td>
                    <td>{i >= lignesSchema.length && <button onClick={() => retirerLigne(i)} style={{ border: "none", background: "none", color: "var(--sawali-rouge)", cursor: "pointer" }}>✕</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: "var(--sawali-bleu)" }}>{totalPanier.toLocaleString("fr-FR")} FCFA</div>
              <select className="champ-saisie" style={{ width: 160 }} value={modeReglement} onChange={(e) => setModeReglement(e.target.value)}>
                <option>Espèces</option>
                <option>Autre</option>
                <option>Assurance</option>
              </select>
            </div>

            {modeReglement === "Assurance" && (
              <div style={{ marginTop: 12 }}>
                <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>Assurance du patient</label>
                {assurancesPatient.length > 0 && !formulaireLienAssuranceOuvert ? (
                  <select className="champ-saisie" value={assurancePatientChoisie} onChange={(e) => setAssurancePatientChoisie(e.target.value)}>
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
                      {assurancesDisponibles.map((a) => <option key={a.numero_enreg} value={a.numero_enreg}>{a.nom}</option>)}
                    </select>
                    <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                      <input className="champ-saisie" placeholder="N° adhérent (facultatif)" value={nouveauLienAssurance.numero_adherent} onChange={(e) => setNouveauLienAssurance({ ...nouveauLienAssurance, numero_adherent: e.target.value })} />
                      <input className="champ-saisie" style={{ width: 140 }} type="number" placeholder="% pris en charge" value={nouveauLienAssurance.pourcentage_prise_en_charge} onChange={(e) => setNouveauLienAssurance({ ...nouveauLienAssurance, pourcentage_prise_en_charge: e.target.value })} />
                    </div>
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
              </div>
            )}

            {erreur && <div style={{ color: "var(--sawali-rouge)", marginTop: 10 }}>{erreur}</div>}

            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button className="bouton-secondaire" disabled={enCours} onClick={() => validerVente("Proforma")}>Générer proforma</button>
              <button className="bouton-primaire" disabled={enCours} onClick={() => validerVente("Reçu")}>Encaisser et générer le reçu</button>
            </div>
          </div>
        </>
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
