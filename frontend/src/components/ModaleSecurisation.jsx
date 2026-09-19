// components/ModaleSecurisation.jsx
// --------------------------------------
// § demande utilisateur : "un bouton 'Sécurisation' ouvre en modale une
// fenêtre de 'Sécurisation' avec des informations à compléter si
// nécessaire et renvoie un résultat qui permet au médecin de finaliser son
// ordonnance en la générant." — même moteur d'analyse que la page complète
// /dentiste/vidal-securisation (POST /vidal/securisation/analyze), mais
// pré-rempli depuis le patient déjà ouvert et les désignations déjà
// saisies sur l'ordonnance en cours, pour ne rien re-taper. La génération
// elle-même reste le bouton "Enregistrer l'ordonnance"/"Consulter" déjà
// existant dans Dentiste.jsx — cette modale informe le médecin AVANT qu'il
// ne finalise, elle ne produit pas le PDF elle-même.

import { useState } from "react";
import { X, ShieldCheck, Loader2, AlertTriangle } from "lucide-react";
import api from "../utils/api";

const LIBELLES_TYPES_ALERTE = {
  CONTRA_INDICATION: "Contre-indication", ALLERGY: "Allergie",
  DRUG_INTERACTION: "Interaction médicamenteuse", POSOLOGY: "Posologie",
  PRECAUTION: "Précaution", WARNING: "Mise en garde", SIDE_EFFECT: "Effet indésirable",
  PHYSICO_CHEMICAL_INTERACTION: "Interaction physico-chimique", SURVEILLANCE: "Surveillance",
  REDUNDANT_ACTIVE_INGREDIENT: "Principe actif redondant", SAME_DRUG: "Même médicament",
  FOOD_INTERACTION: "Interaction alimentaire", DISPENSING_RISK: "Risque de dispensation",
  PRESCRIPTION_CONTEXT: "Contexte patient", EXONERATION: "Exonération",
  INDICATOR: "Indicateur", FOCUS: "Point de vigilance", HAS: "Alerte HAS (SAM)",
};
const META_SEVERITE = {
  LEVEL_4: { label: "Critique", couleur: "#e11d48" },
  LEVEL_3: { label: "Élevée", couleur: "#f97316" },
  LEVEL_2: { label: "Modérée", couleur: "#f59e0b" },
  LEVEL_1: { label: "À prendre en compte", couleur: "#0ea5e9" },
  INFO: { label: "Info", couleur: "#94a3b8" },
  NO_ALERT: { label: "Aucune alerte", couleur: "#10b981" },
};
function fondSeverite(severite) {
  const c = { LEVEL_4: "#fff1f2", LEVEL_3: "#fff7ed", LEVEL_2: "#fffbeb" }[severite];
  return c || "var(--sawali-gris-clair)";
}
function mapperGenreVidal(sexe) {
  if (sexe === "Masculin") return "MALE";
  if (sexe === "Féminin") return "FEMALE";
  return "UNKNOWN";
}
function formatDateISO(dateheure) {
  return dateheure ? String(dateheure).slice(0, 10) : "";
}

export default function ModaleSecurisation({ patient, designations, onFermer }) {
  // § "des informations à compléter si nécessaire" — pré-rempli depuis le
  // patient (poids/taille/créatininémie/insuffisance hépatique/allergies/
  // pathologies déjà enregistrés), modifiable ponctuellement pour CETTE
  // analyse sans réécrire la fiche patient.
  const [poids, setPoids] = useState(patient?.PoidsKg ?? "");
  const [taille, setTaille] = useState(patient?.TailleCm ?? "");
  const [creatinine, setCreatinine] = useState(patient?.DerniereCreatininemieUmolL ?? "");
  const [insuffisanceHepatique, setInsuffisanceHepatique] = useState(patient?.InsuffisanceHepatique || "NONE");
  const [enCours, setEnCours] = useState(false);
  const [resultat, setResultat] = useState(null);
  const [erreur, setErreur] = useState(null);

  async function lancerAnalyse() {
    setEnCours(true);
    setErreur(null);
    setResultat(null);
    try {
      const payloadPatient = {
        dob: formatDateISO(patient?.["Date Naissance"]),
        gender: mapperGenreVidal(patient?.Sexe),
        weight: poids || undefined,
        height: taille || undefined,
        creatinine: creatinine || undefined,
        hepaticInsufficiency: insuffisanceHepatique !== "NONE" ? insuffisanceHepatique : undefined,
        allergies: (patient?.AllergiesVidal || []).map((a) => a.ref).filter(Boolean),
        pathologies: (patient?.PathologiesVidal || []).map((p) => p.ref).filter(Boolean),
      };
      const lignes = designations.map((d) => ({ drugRef: d.vidal_id || null, label: d.label || null }));
      const r = await api.post("/vidal/securisation/analyze", {
        patient: payloadPatient,
        new_prescription_lines: lignes,
        patient_nom: patient ? `${patient.Nom || ""} ${patient.Prénoms || ""}`.trim() : undefined,
      });
      setResultat(r.data.analyse);
    } catch (err) {
      setErreur(err.response?.data?.detail || "Erreur lors de l'analyse de sécurisation.");
    }
    setEnCours(false);
  }

  const resume = resultat?.summary || [];

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(20,30,50,0.45)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onFermer}>
      <div className="carte" style={{ width: 680, maxWidth: "100%", maxHeight: "88vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}><ShieldCheck size={16} /> Sécurisation de l'ordonnance</div>
          <button onClick={onFermer} style={{ border: "none", background: "none", cursor: "pointer", display: "flex", padding: 2 }}><X size={18} /></button>
        </div>
        <div className="sous-titre-page" style={{ marginBottom: 14 }}>
          Vérifie interactions, contre-indications et alertes VIDAL sur les {designations.length} désignation{designations.length > 1 ? "s" : ""} de cette ordonnance — certaines spécialités propres à un pays peuvent ne pas être reconnues.
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, marginBottom: 14 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 3 }}>Poids (kg)</label>
            <input className="champ-saisie" type="number" value={poids} onChange={(e) => setPoids(e.target.value)} placeholder="Non renseigné" />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 3 }}>Taille (cm)</label>
            <input className="champ-saisie" type="number" value={taille} onChange={(e) => setTaille(e.target.value)} placeholder="Non renseigné" />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 3 }}>Créatininémie (µmol/L)</label>
            <input className="champ-saisie" type="number" value={creatinine} onChange={(e) => setCreatinine(e.target.value)} placeholder="Non renseignée" />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 3 }}>Insuffisance hépatique</label>
            <select className="champ-saisie" value={insuffisanceHepatique} onChange={(e) => setInsuffisanceHepatique(e.target.value)}>
              <option value="NONE">Aucune</option>
              <option value="MODERATE">Modérée</option>
              <option value="SEVERE">Sévère</option>
            </select>
          </div>
        </div>

        <div style={{ fontSize: 12.5, color: "var(--sawali-gris-fonce)", marginBottom: 14 }}>
          <strong>Médicaments analysés :</strong> {designations.map((d) => d.label).join(", ") || "aucun"}
        </div>

        <button className="bouton-primaire" disabled={enCours} onClick={lancerAnalyse} style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 14 }}>
          {enCours ? <Loader2 size={14} className="lucide-tourne" /> : <ShieldCheck size={14} />} {enCours ? "Analyse en cours..." : "Lancer l'analyse"}
        </button>

        {erreur && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--sawali-rouge)", fontSize: 13, marginBottom: 14 }}>
            <AlertTriangle size={14} /> {erreur}
          </div>
        )}

        {resultat && (
          <div>
            {resume.length === 0 && (
              <div style={{ padding: "10px 12px", borderRadius: 8, background: fondSeverite("NO_ALERT"), color: META_SEVERITE.NO_ALERT.couleur, fontWeight: 600, fontSize: 13, marginBottom: 10 }}>
                Aucune alerte détectée.
              </div>
            )}
            {resume.map((s, i) => {
              const meta = META_SEVERITE[s.severity] || { label: s.severity, couleur: "#64748b" };
              return (
                <div key={i} style={{ padding: "10px 12px", borderRadius: 8, background: fondSeverite(s.severity), marginBottom: 8, borderLeft: `3px solid ${meta.couleur}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, fontWeight: 700, color: meta.couleur, marginBottom: 3 }}>
                    <span>{LIBELLES_TYPES_ALERTE[s.type] || s.type}</span>
                    <span>{meta.label}</span>
                  </div>
                  {s.message && <div style={{ fontSize: 12.5 }}>{s.message}</div>}
                </div>
              );
            })}
            <div style={{ fontSize: 12.5, color: "var(--sawali-gris-fonce)", marginTop: 10, display: "flex", alignItems: "center", gap: 6 }}>
              <ShieldCheck size={13} /> Résultat pris en compte — vous pouvez maintenant enregistrer et générer l'ordonnance.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
