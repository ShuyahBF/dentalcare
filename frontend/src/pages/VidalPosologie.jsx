// pages/VidalPosologie.jsx
// -----------------------------
// § demande utilisateur — Module VIDAL France : profil patient (chips +
// champs détaillés), sélection réelle du médicament (recherche VIDAL), voie
// d'administration ET indication réelles (confirmées contre le manuel
// VIDAL), et recherche de posologie EXPÉRIMENTALE (endpoint
// /posology-descriptors jamais validé en réel côté portail de référence,
// contrairement aux deux listes ci-dessus). Port fidèle de /portal/vidal-posologie.

import { useState } from "react";
import api from "../utils/api";
import VidalMedicationSearch from "../components/VidalMedicationSearch";

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
  const [patient, setPatient] = useState(PATIENT_VIDE);
  const [allergies, setAllergies] = useState("");
  const [pathologies, setPathologies] = useState("");
  const [molecules, setMolecules] = useState("");

  const [medQuery, setMedQuery] = useState("");
  const [medicament, setMedicament] = useState(null);
  const [routes, setRoutes] = useState([]);
  const [routesEnCours, setRoutesEnCours] = useState(false);
  const [routeId, setRouteId] = useState("");
  const [indications, setIndications] = useState([]);
  const [indicationsEnCours, setIndicationsEnCours] = useState(false);
  const [indicationRef, setIndicationRef] = useState("");

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

  function reinitialiserMedicament() {
    setMedicament(null); setRoutes([]); setRouteId(""); setIndications([]); setIndicationRef("");
  }

  async function selectionnerMedicament(item) {
    setMedicament(item);
    setMedQuery("");
    setRoutes([]); setRouteId(""); setIndications([]); setIndicationRef("");
    if (!item.vidal_id) return;
    setRoutesEnCours(true); setIndicationsEnCours(true);
    try {
      const [detailRes, indicationsRes] = await Promise.all([
        api.get(`/vidal/product/${item.vidal_id}/detail`),
        api.get(`/vidal/product/${item.vidal_id}/indications`).catch(() => null),
      ]);
      setRoutes(detailRes.data?.routes || []);
      setIndications(indicationsRes?.data?.indications || []);
    } catch (err) {
      setErreur(err.response?.data?.detail || "Voies d'administration indisponibles.");
    }
    setRoutesEnCours(false); setIndicationsEnCours(false);
  }

  async function lancerRecherche() {
    if (!medicament?.vidal_id) return setErreur("Sélectionnez d'abord un médicament dans la recherche.");
    setErreur(""); setRecherche(true); setResultat(null);
    try {
      const r = await api.get(`/vidal/product/${medicament.vidal_id}/posology-descriptors`, { params: { route: routeId || undefined, indication: indicationRef || undefined } });
      setResultat(r.data);
    } catch (err) {
      setErreur(err.response?.data?.detail || "Recherche de posologie impossible.");
    }
    setRecherche(false);
  }

  return (
    <div>
      <div className="titre-page">💊 Posologie</div>
      <div className="sous-titre-page">Profil patient + médicament VIDAL réel → recherche de la posologie indiquée.</div>

      <div className="carte" style={{ marginBottom: 16, background: "#fef2e0", border: "1px solid #f2c40c55" }}>
        <div style={{ fontSize: 12.5, color: "var(--sawali-orange)", display: "flex", gap: 8 }}>
          ⚠️
          <span>
            La recherche de posologie ci-dessous appelle l'endpoint VIDAL <code>/product/{"{id}"}/posology-descriptors</code>, qui
            n'a <strong>jamais été testé</strong> contre l'API VIDAL réelle (contrairement à la recherche, la fiche produit ou les équivalences). Considérez le résultat comme expérimental.
          </span>
        </div>
      </div>

      <div className="carte" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>👥 Profil rapide</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {Object.entries(PROFILS).map(([cle, p]) => (
            <button key={cle} className="bouton-secondaire" style={{ fontSize: 12.5, padding: "5px 12px" }} onClick={() => appliquerProfil(cle)}>{p.label}</button>
          ))}
          <button className="bouton-secondaire" style={{ fontSize: 12.5, padding: "5px 12px" }} onClick={() => appliquerProfil("allergique")}>Allergique (pénicilline)</button>
        </div>
      </div>

      <div className="carte" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>🧑 Patient</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 3 }}>Date de naissance</label>
            <input type="date" className="champ-saisie" value={patient.dob} onChange={(e) => setPatient({ ...patient, dob: e.target.value })} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 3 }}>Genre</label>
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
              <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 3 }}>Taille (cm)</label>
              <input type="number" className="champ-saisie" value={patient.height} onChange={(e) => setPatient({ ...patient, height: e.target.value })} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 3 }}>Poids (kg)</label>
              <input type="number" className="champ-saisie" value={patient.weight} onChange={(e) => setPatient({ ...patient, weight: e.target.value })} />
            </div>
          </div>
        </div>
      </div>

      <div className="carte" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>🍼 Allergies, pathologies, molécules</div>
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
      </div>

      <div className="carte" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>💊 Médicament</div>
        <VidalMedicationSearch
          query={medicament?.title || medQuery}
          onQueryChange={(q) => { setMedQuery(q); reinitialiserMedicament(); }}
          onSelect={selectionnerMedicament}
          onClear={reinitialiserMedicament}
        />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 3 }}>Voie d'administration {routesEnCours && "⏳"}</label>
            <select className="champ-saisie" value={routeId} onChange={(e) => setRouteId(e.target.value)} disabled={!routes.length}>
              <option value="">{routes.length ? "Choisir…" : "Sélectionnez un médicament d'abord"}</option>
              {routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 3 }}>Indication {indicationsEnCours && "⏳"}</label>
            <select className="champ-saisie" value={indicationRef} onChange={(e) => setIndicationRef(e.target.value)} disabled={!indications.length}>
              <option value="">{indications.length ? "Choisir…" : "Sélectionnez un médicament d'abord"}</option>
              {indications.map((ind) => <option key={ind.ref} value={ind.ref}>{ind.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      {erreur && <div className="carte" style={{ color: "var(--sawali-rouge)", marginBottom: 16 }}>{erreur}</div>}

      <button className="bouton-primaire" style={{ width: "100%", background: "#9C1616" }} onClick={lancerRecherche} disabled={recherche}>
        🔎 {recherche ? "Recherche en cours..." : "Rechercher la posologie indiquée"}
      </button>

      {resultat && (
        <div className="carte" style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 700, color: "var(--sawali-orange)", marginBottom: 10 }}>Résultat (expérimental)</div>
          <pre style={{ fontSize: 11, background: "var(--sawali-gris-clair)", borderRadius: 8, padding: 12, overflow: "auto", maxHeight: 380 }}>
            {JSON.stringify(resultat.data?.raw ? { raw: resultat.data.raw } : resultat.data, null, 2).slice(0, 8000)}
          </pre>
        </div>
      )}
    </div>
  );
}
