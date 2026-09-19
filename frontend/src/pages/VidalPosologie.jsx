// pages/VidalPosologie.jsx
// -----------------------------
// § demande utilisateur — Module VIDAL France : profil patient (chips +
// champs détaillés), sélection réelle du médicament (recherche VIDAL), voie
// d'administration réelle, et recherche de posologie via
// /product/{id}/posology-descriptors. § Diagnostic conclu le 19/09/2026 —
// Manuel d'intégration API REST VIDAL Sécurisation REV_03 (p.90-91, fourni
// par l'utilisateur) : cet appel exige un corps XML POST (dateOfBirth/
// gender/weight/height obligatoires) — jamais un GET, jamais de simples
// paramètres de requête route/indication comme tenté initialement.
// "Indication" n'existe d'ailleurs pas dans le schéma documenté de cet
// appel précis (seul "route" est prévu) — le sélecteur correspondant a
// donc été retiré. Port fidèle de /portal/vidal-posologie, corrigé sur ce
// point où le portail de référence n'avait lui-même jamais validé
// l'endpoint en réel.

import { useState } from "react";
import { Pill, Users, User, ShieldAlert, Search, Save, Loader2 } from "lucide-react";
import api from "../utils/api";
import VidalMedicationSearch from "../components/VidalMedicationSearch";
import RecherchePatientVidal from "../components/RecherchePatientVidal";
import { useAuth } from "../utils/authContexte";

// § demande utilisateur : import depuis la fiche patient — conversions
// entre le format de CETTE page (texte libre séparé par virgules, plus
// simple, cohérent avec l'existant) et le format partagé {label, ref}[]
// du profil clinique (partagé avec VidalSecurisation.jsx, qui lui garde
// des tags structurés avec référence VIDAL résolue).
function mapperGenreVidal(sexe) {
  if (sexe === "Masculin") return "MALE";
  if (sexe === "Féminin") return "FEMALE";
  return "UNKNOWN";
}
function formatDateISO(dateheure) {
  return dateheure ? String(dateheure).slice(0, 10) : "";
}
function listeVersTexte(liste) {
  return (liste || []).map((t) => t.label).join(", ");
}
function texteVersListe(texte) {
  return (texte || "").split(",").map((s) => s.trim()).filter(Boolean).map((label) => ({ label, ref: null }));
}

const PROFILS = {
  bebe: { label: "Bébé", dob: "2026-01-15", gender: "MALE", height: 68, weight: 8 },
  fille: { label: "Fille", dob: "2018-05-02", gender: "FEMALE", height: 128, weight: 25 },
  garcon: { label: "Garçon", dob: "2018-02-20", gender: "MALE", height: 130, weight: 26 },
  femme: { label: "Femme", dob: "1991-04-12", gender: "FEMALE", height: 162, weight: 62 },
  enceinte: { label: "Enceinte", dob: "1998-06-30", gender: "FEMALE", height: 165, weight: 68 },
  homme: { label: "Homme", dob: "1986-09-10", gender: "MALE", height: 178, weight: 80 },
  renal: { label: "Rénal", dob: "1966-03-01", gender: "MALE", height: 170, weight: 75 },
  age: { label: "Âgé", dob: "1944-11-08", gender: "FEMALE", height: 158, weight: 58 },
};
const PATIENT_VIDE = { dob: "", gender: "UNKNOWN", hepatic: "NONE", height: "", weight: "" };

export default function VidalPosologie() {
  const { utilisateur } = useAuth();
  const [patient, setPatient] = useState(PATIENT_VIDE);
  const [allergies, setAllergies] = useState("");
  const [pathologies, setPathologies] = useState("");
  const [molecules, setMolecules] = useState("");
  const [patientSelectionne, setPatientSelectionne] = useState(null);
  const [enregistrementProfilEnCours, setEnregistrementProfilEnCours] = useState(false);
  const [messageProfil, setMessageProfil] = useState("");
  const [messageProfilEstErreur, setMessageProfilEstErreur] = useState(false);

  const [medQuery, setMedQuery] = useState("");
  const [medicament, setMedicament] = useState(null);
  const [routes, setRoutes] = useState([]);
  const [routesEnCours, setRoutesEnCours] = useState(false);
  const [routeId, setRouteId] = useState("");

  const [recherche, setRecherche] = useState(false);
  const [resultat, setResultat] = useState(null);
  const [erreur, setErreur] = useState("");

  function appliquerProfil(cle) {
    if (cle === "allergique") {
      setAllergies((prev) => (prev.trim() ? `${prev}, Pénicilline` : "Pénicilline"));
      return;
    }
    const p = PROFILS[cle];
    if (!p) return;
    setPatient({ dob: p.dob, gender: p.gender, hepatic: "NONE", height: String(p.height), weight: String(p.weight) });
  }

  // § demande utilisateur : importe automatiquement date de naissance,
  // genre, et le profil clinique VIDAL (poids/taille/insuffisance
  // hépatique/allergies/pathologies/molécules) déjà enregistré sur CE
  // patient lors d'une consultation précédente — jamais de re-saisie
  // pour un profil déjà connu.
  function importerDepuisPatient(p) {
    setPatientSelectionne(p);
    setPatient({
      dob: formatDateISO(p["Date Naissance"]),
      gender: mapperGenreVidal(p.Sexe),
      hepatic: p.InsuffisanceHepatique || "NONE",
      height: p.TailleCm != null ? String(p.TailleCm) : "",
      weight: p.PoidsKg != null ? String(p.PoidsKg) : "",
    });
    setAllergies(listeVersTexte(p.AllergiesVidal));
    setPathologies(listeVersTexte(p.PathologiesVidal));
    setMolecules(listeVersTexte(p.MoleculesAEviterVidal));
    setMessageProfil("");
  }

  function effacerPatientSelectionne() {
    setPatientSelectionne(null);
    setMessageProfil("");
  }

  async function enregistrerProfilSurPatient() {
    if (!patientSelectionne) return;
    setEnregistrementProfilEnCours(true);
    setMessageProfil("");
    try {
      await api.put(`/patients/${patientSelectionne.Numéro_Enreg}/profil-clinique`, {
        poids_kg: patient.weight ? Number(patient.weight) : null,
        taille_cm: patient.height ? Number(patient.height) : null,
        insuffisance_hepatique: patient.hepatic,
        allergies: texteVersListe(allergies),
        pathologies: texteVersListe(pathologies),
        molecules_a_eviter: texteVersListe(molecules),
      });
      setMessageProfilEstErreur(false);
      setMessageProfil("Profil enregistré sur la fiche patient — importé automatiquement la prochaine fois.");
    } catch (err) {
      setMessageProfilEstErreur(true);
      setMessageProfil(err.response?.data?.detail || "Échec de l'enregistrement sur la fiche patient.");
    }
    setEnregistrementProfilEnCours(false);
  }

  function reinitialiserMedicament() {
    setMedicament(null); setRoutes([]); setRouteId("");
  }

  async function selectionnerMedicament(item) {
    setMedicament(item);
    setMedQuery("");
    setRoutes([]); setRouteId("");
    if (!item.vidal_id) return;
    setRoutesEnCours(true);
    try {
      const detailRes = await api.get(`/vidal/product/${item.vidal_id}/detail`);
      setRoutes(detailRes.data?.routes || []);
    } catch (err) {
      setErreur(err.response?.data?.detail || "Voies d'administration indisponibles.");
    }
    setRoutesEnCours(false);
  }

  async function lancerRecherche() {
    if (!medicament?.vidal_id) return setErreur("Sélectionnez d'abord un médicament dans la recherche.");
    // § Diagnostic 19/09/2026 (Manuel VIDAL REV_03 p.90-91) : dateOfBirth/
    // gender/weight/height sont obligatoires pour CET appel précis — on les
    // vérifie ici pour un retour immédiat, avant même d'appeler l'API.
    if (!patient.dob || !patient.gender || patient.gender === "UNKNOWN" || !patient.weight || !patient.height) {
      return setErreur("Date de naissance, sexe, poids et taille du patient sont obligatoires pour cette recherche (exigence VIDAL).");
    }
    setErreur(""); setRecherche(true); setResultat(null);
    try {
      const corpsPatient = {
        dateOfBirth: patient.dob, gender: patient.gender,
        weight: Number(patient.weight), height: Number(patient.height),
        hepaticInsufficiency: patient.hepatic || "NONE",
      };
      const r = await api.post(`/vidal/product/${medicament.vidal_id}/posology-descriptors`, corpsPatient, { params: { route: routeId || undefined } });
      setResultat(r.data);
    } catch (err) {
      setErreur(err.response?.data?.detail || "Recherche de posologie impossible.");
    }
    setRecherche(false);
  }

  return (
    <div>
      <div className="titre-page" style={{ display: "flex", alignItems: "center", gap: 8 }}><Pill size={22} /> Posologie</div>
      <div className="sous-titre-page">Profil patient + médicament VIDAL réel → recherche de la posologie indiquée.</div>

      <div className="carte" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}><Users size={15} /> Profil rapide</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {Object.entries(PROFILS).map(([cle, p]) => (
            <button key={cle} className="bouton-secondaire" style={{ fontSize: 12.5, padding: "5px 12px" }} onClick={() => appliquerProfil(cle)}>{p.label}</button>
          ))}
          <button className="bouton-secondaire" style={{ fontSize: 12.5, padding: "5px 12px" }} onClick={() => appliquerProfil("allergique")}>Allergique (pénicilline)</button>
        </div>
      </div>

      <RecherchePatientVidal patientSelectionne={patientSelectionne} onSelectionner={importerDepuisPatient} onEffacer={effacerPatientSelectionne} />

      <div className="carte" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}><User size={15} /> Patient</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
          <div>
            <label className="libelle-obligatoire" style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 3 }}>* Date de naissance</label>
            <input type="date" className="champ-saisie" value={patient.dob} onChange={(e) => setPatient({ ...patient, dob: e.target.value })} />
          </div>
          <div>
            <label className="libelle-obligatoire" style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 3 }}>* Genre</label>
            <select className="champ-saisie" value={patient.gender} onChange={(e) => setPatient({ ...patient, gender: e.target.value })}>
              <option value="MALE">Masculin</option><option value="FEMALE">Féminin</option><option value="UNKNOWN">Non précisé</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 3 }}>Insuffisance hépatique</label>
            <select className="champ-saisie" value={patient.hepatic} onChange={(e) => setPatient({ ...patient, hepatic: e.target.value })}>
              <option value="NONE">Aucune</option><option value="MODERATE">Modérée</option><option value="SEVERE">Sévère</option>
            </select>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            <div>
              <label className="libelle-obligatoire" style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 3 }}>* Taille (cm)</label>
              <input type="number" className="champ-saisie" value={patient.height} onChange={(e) => setPatient({ ...patient, height: e.target.value })} />
            </div>
            <div>
              <label className="libelle-obligatoire" style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 3 }}>* Poids (kg)</label>
              <input type="number" className="champ-saisie" value={patient.weight} onChange={(e) => setPatient({ ...patient, weight: e.target.value })} />
            </div>
          </div>
        </div>
      </div>

      <div className="carte" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}><ShieldAlert size={15} /> Allergies, pathologies, molécules</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 3 }}>Allergies</label>
            <input className="champ-saisie" value={allergies} onChange={(e) => setAllergies(e.target.value)} placeholder="pénicilline, arachide…" />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 3 }}>Pathologies (CIM10)</label>
            <input className="champ-saisie" value={pathologies} onChange={(e) => setPathologies(e.target.value)} placeholder="diabète, insuffisance rénale…" />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 3 }}>Autres molécules en cours</label>
            <input className="champ-saisie" value={molecules} onChange={(e) => setMolecules(e.target.value)} placeholder="warfarine…" />
          </div>
        </div>
        {patientSelectionne && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--sawali-bordure)", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <button className="bouton-secondaire" onClick={enregistrerProfilSurPatient} disabled={enregistrementProfilEnCours} style={{ fontSize: 12.5, display: "inline-flex", alignItems: "center", gap: 6 }}>
              {enregistrementProfilEnCours ? <Loader2 size={13} className="lucide-tourne" /> : <Save size={13} />} Enregistrer ce profil sur la fiche patient
            </button>
            {messageProfil && <span style={{ fontSize: 12, color: messageProfilEstErreur ? "var(--sawali-rouge)" : "var(--sawali-vert)" }}>{messageProfil}</span>}
          </div>
        )}
      </div>

      <div className="carte" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}><Pill size={15} /> Médicament</div>
        <VidalMedicationSearch
          query={medicament?.title || medQuery}
          onQueryChange={(q) => { setMedQuery(q); reinitialiserMedicament(); }}
          onSelect={selectionnerMedicament}
          onClear={reinitialiserMedicament}
        />
        <div style={{ marginTop: 10 }}>
          <label style={{ fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 4, marginBottom: 3 }}>Voie d'administration (facultatif) {routesEnCours && <Loader2 size={11} className="lucide-tourne" />}</label>
          <select className="champ-saisie" value={routeId} onChange={(e) => setRouteId(e.target.value)} disabled={!routes.length}>
            <option value="">{routes.length ? "Choisir…" : "Sélectionnez un médicament d'abord"}</option>
            {routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
      </div>

      {erreur && <div className="carte" style={{ color: "var(--sawali-rouge)", marginBottom: 16 }}>{erreur}</div>}

      <button className="bouton-primaire" style={{ width: "100%", background: "#9C1616" }} onClick={lancerRecherche} disabled={recherche}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Search size={14} /> {recherche ? "Recherche en cours..." : "Rechercher la posologie indiquée"}</span>
      </button>

      {resultat && (
        <div className="carte" style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Résultat</div>
          {resultat.descripteurs?.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {resultat.descripteurs.map((d, i) => (
                <div key={i} style={{ border: "1px solid var(--sawali-bordure)", borderRadius: 8, padding: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6, flexWrap: "wrap", gap: 6 }}>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>{d.indication || "Indication non précisée"}</span>
                    {d.route && <span className="badge" style={{ background: "var(--sawali-gris-clair)" }}>Voie {d.route}</span>}
                  </div>
                  <ul style={{ margin: "0 0 6px", paddingLeft: 18, fontSize: 13.5 }}>
                    {d.doses.map((dose, j) => <li key={j}>{dose}</li>)}
                  </ul>
                  {d.frequence && <div style={{ fontSize: 12.5, color: "var(--sawali-gris-fonce)" }}>Fréquence : {d.frequence}</div>}
                </div>
              ))}
            </div>
          ) : (
            <>
              <div style={{ fontSize: 12.5, color: "var(--sawali-gris-fonce)", marginBottom: 8 }}>
                Aucun descripteur posologique structuré n'a pu être extrait{utilisateur?.est_super_admin ? " — réponse brute ci-dessous." : "."}
              </div>
              {utilisateur?.est_super_admin && (
                <pre style={{ fontSize: 11, background: "var(--sawali-gris-clair)", borderRadius: 8, padding: 12, overflow: "auto", maxHeight: 380 }}>
                  {JSON.stringify(resultat.data?.raw ? { raw: resultat.data.raw } : resultat.data, null, 2).slice(0, 8000)}
                </pre>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
