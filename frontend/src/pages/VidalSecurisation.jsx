// pages/VidalSecurisation.jsx
// --------------------------------
// § demande utilisateur — Module VIDAL France : sécurisation de prescription
// (interactions, contre-indications, allergies, posologie...). Schéma de
// requête ET de réponse vérifiés contre le manuel d'intégration VIDAL
// (MI_APIREST REV_03) — voir backend/app/utils/vidal_securisation.py. Port
// fidèle de /portal/vidal-securisation, périmètre resserré : pas de suivi
// de patients VIDAL propre (redondant avec le module Patient de
// DentalCare) ni de génération d'ordonnance dédiée (DentalCare a déjà son
// propre flux Ordonnance, voir Dentiste.jsx) — impression simple du résultat.

import { useState } from "react";
import { X, AlertTriangle, User, RotateCcw, Loader2, HeartPulse, Printer, Save } from "lucide-react";
import api from "../utils/api";
import VidalMedicationSearch from "../components/VidalMedicationSearch";
import RecherchePatientVidal from "../components/RecherchePatientVidal";

// § demande utilisateur : import depuis la fiche patient — ici les
// allergies/pathologies/molécules sont DÉJÀ au format partagé
// {label, ref}[] (ChampTagsReferentiel), aucune conversion nécessaire
// (contrairement à VidalPosologie.jsx, qui utilise du texte libre).
function mapperGenreVidal(sexe) {
  if (sexe === "Masculin") return "MALE";
  if (sexe === "Féminin") return "FEMALE";
  return "UNKNOWN";
}
function formatDateISO(dateheure) {
  return dateheure ? String(dateheure).slice(0, 10) : "";
}

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
const TYPES_ALERTE_DEFAUT = ["CONTRA_INDICATION", "ALLERGY", "DRUG_INTERACTION", "POSOLOGY"];
const TOUS_CODES_ALERTE = Object.keys(LIBELLES_TYPES_ALERTE);

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

function calculerAge(dob) {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000));
}
// Cockcroft & Gault — clairance créatinine estimée (mL/min), envoyée à VIDAL (pas la créatininémie brute).
function calculerClairance(dob, gender, weight, creat) {
  const age = calculerAge(dob);
  const w = Number(weight), c = Number(creat);
  if (age == null || !w || !c || (gender !== "MALE" && gender !== "FEMALE")) return null;
  const facteur = gender === "MALE" ? 1.23 : 1.04;
  return (facteur * w * (140 - age)) / c;
}
function calculerImc(weight, height) {
  const w = Number(weight), h = Number(height);
  if (!w || !h) return null;
  const m = h / 100;
  return w / (m * m);
}
function categorieImc(imc) {
  if (imc < 18.5) return "Insuffisance pondérale";
  if (imc < 25) return "Normal";
  if (imc < 30) return "Surpoids";
  if (imc < 35) return "Obésité (classe I)";
  if (imc < 40) return "Obésité (classe II)";
  return "Obésité (classe III)";
}

function ligneVide() {
  return { vidal_id: "", label: "", query: "", dose: "", unitId: "", duration: "", durationType: "", frequencyType: "", route: "", routes: [], indication: "", indications: [] };
}

/** Tags allergies/pathologies/molécules — un résultat choisi porte une vraie référence VIDAL (transmise à l'analyse), un tag libre reste informatif. */
function ChampTagsReferentiel({ label, kind, values, onChange }) {
  const [brouillon, setBrouillon] = useState("");
  const [resultats, setResultats] = useState([]);
  const [ouvert, setOuvert] = useState(false);
  const [rechercheDesactivee, setRechercheDesactivee] = useState(false);
  const [timer, setTimer] = useState(null);

  function surChangement(v) {
    setBrouillon(v);
    if (timer) clearTimeout(timer);
    const q = v.trim();
    if (rechercheDesactivee || q.length < 2) { setResultats([]); return; }
    setTimer(setTimeout(async () => {
      try {
        const r = await api.get("/vidal/referential/search", { params: { kind, q } });
        setResultats(r.data?.results || []);
        setOuvert(true);
      } catch {
        setRechercheDesactivee(true);
        setResultats([]);
      }
    }, 350));
  }
  function ajouterLibre() {
    const v = brouillon.trim();
    if (!v) return;
    onChange([...values, { label: v, ref: null }]);
    setBrouillon(""); setOuvert(false); setResultats([]);
  }
  function ajouterResultat(item) {
    onChange([...values, { label: item.label, ref: item.ref }]);
    setBrouillon(""); setOuvert(false); setResultats([]);
  }

  return (
    <div style={{ position: "relative" }}>
      <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 3 }}>{label}</label>
      <div className="champ-saisie" style={{ display: "flex", flexWrap: "wrap", gap: 5, minHeight: 40, alignItems: "center" }}>
        {values.map((v, i) => (
          <span key={i} title={v.ref ? "Référence VIDAL résolue — transmise à l'analyse" : "Texte libre — informatif, non transmis à VIDAL"}
            className={`badge ${v.ref ? "badge-bleu" : "badge-vert"}`} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            {v.label}
            <span onClick={() => onChange(values.filter((_, j) => j !== i))} style={{ cursor: "pointer", display: "inline-flex" }}><X size={11} /></span>
          </span>
        ))}
        <input
          value={brouillon} onChange={(e) => surChangement(e.target.value)}
          onFocus={() => resultats.length > 0 && setOuvert(true)}
          onBlur={() => setTimeout(() => setOuvert(false), 150)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); ajouterLibre(); } }}
          placeholder="Rechercher ou ajouter en texte libre… (Entrée)"
          style={{ flex: 1, minWidth: 100, border: "none", outline: "none", fontSize: 13, background: "transparent" }}
        />
      </div>
      {ouvert && resultats.length > 0 && (
        <div className="carte" style={{ position: "absolute", zIndex: 20, width: "100%", marginTop: 4, maxHeight: 160, overflowY: "auto", padding: 4 }}>
          {resultats.map((r, i) => (
            <div key={i} onMouseDown={(e) => { e.preventDefault(); ajouterResultat(r); }} style={{ padding: "6px 9px", cursor: "pointer", fontSize: 12.5, borderRadius: 6 }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--sawali-gris-clair)")} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
              {r.label}
            </div>
          ))}
        </div>
      )}
      <div style={{ fontSize: 10, color: "var(--sawali-gris)", marginTop: 3 }}>
        {rechercheDesactivee ? "Recherche référentielle indisponible — saisie libre uniquement." : "Un résultat choisi porte une vraie référence VIDAL ; sinon reste informatif."}
      </div>
    </div>
  );
}

/** Une ligne de traitement — recherche médicament + dose/fréquence/durée + voie/indication réelles. */
function LigneMedicament({ ligne, onChange, onRetirer }) {
  async function selectionnerMedicament(item) {
    onChange({ vidal_id: item.vidal_id || "", label: item.title || "", query: "", route: "", routes: [], indication: "", indications: [] });
    if (!item.vidal_id) return;
    try {
      const [detailRes, indicationsRes] = await Promise.all([
        api.get(`/vidal/product/${item.vidal_id}/detail`),
        api.get(`/vidal/product/${item.vidal_id}/indications`).catch(() => null),
      ]);
      onChange({ routes: detailRes.data?.routes || [], indications: indicationsRes?.data?.indications || [] });
    } catch { /* les listes restent vides — la ligne reste utilisable sans voie/indication */ }
  }

  return (
    <div style={{ border: "1px solid var(--sawali-bordure)", borderRadius: 10, padding: 12, marginBottom: 8 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 8 }}>
        <div style={{ flex: 1 }}>
          <VidalMedicationSearch
            query={ligne.label || ligne.query}
            onQueryChange={(q) => onChange({ query: q, label: "", vidal_id: "", routes: [], route: "" })}
            onSelect={selectionnerMedicament}
            onClear={() => onChange({ query: "", label: "", vidal_id: "", routes: [], route: "" })}
          />
        </div>
        <button onClick={onRetirer} title="Retirer cette ligne" style={{ border: "none", background: "none", color: "var(--sawali-rouge)", cursor: "pointer", display: "flex", padding: "8px 4px" }}><X size={16} /></button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
        <input className="champ-saisie" style={{ fontSize: 12.5 }} placeholder="Dose" value={ligne.dose} onChange={(e) => onChange({ dose: e.target.value })} />
        <input className="champ-saisie" style={{ fontSize: 12.5 }} placeholder="Fréquence" value={ligne.frequencyType} onChange={(e) => onChange({ frequencyType: e.target.value })} />
        <input className="champ-saisie" style={{ fontSize: 12.5 }} placeholder="Durée" value={ligne.duration} onChange={(e) => onChange({ duration: e.target.value })} />
        <select className="champ-saisie" style={{ fontSize: 12.5 }} value={ligne.route} onChange={(e) => onChange({ route: e.target.value })} disabled={!ligne.routes.length}>
          <option value="">{ligne.routes.length ? "Voie…" : "—"}</option>
          {ligne.routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <select className="champ-saisie" style={{ fontSize: 12.5, gridColumn: "span 2" }} value={ligne.indication} onChange={(e) => onChange({ indication: e.target.value })} disabled={!ligne.indications?.length}>
          <option value="">{ligne.indications?.length ? "Indication…" : "—"}</option>
          {(ligne.indications || []).map((ind) => <option key={ind.ref} value={ind.ref}>{ind.label}</option>)}
        </select>
      </div>
    </div>
  );
}

export default function VidalSecurisation() {
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState("FEMALE");
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");
  const [creatinine, setCreatinine] = useState("");
  const [hepatic, setHepatic] = useState("NONE");
  const [allergies, setAllergies] = useState([]);
  const [pathologies, setPathologies] = useState([]);
  const [molecules, setMolecules] = useState([]);
  const [patientSelectionne, setPatientSelectionne] = useState(null);
  const [enregistrementProfilEnCours, setEnregistrementProfilEnCours] = useState(false);
  const [messageProfil, setMessageProfil] = useState("");
  const [messageProfilEstErreur, setMessageProfilEstErreur] = useState(false);

  const [traitementsEnCours, setTraitementsEnCours] = useState([]);
  const [nouvellesLignes, setNouvellesLignes] = useState([ligneVide()]);
  const [typesAlerte, setTypesAlerte] = useState(TYPES_ALERTE_DEFAUT);

  const [enCours, setEnCours] = useState(false);
  const [resultat, setResultat] = useState(null);
  const [erreur, setErreur] = useState(null);

  const clairance = calculerClairance(dob, gender, weight, creatinine);
  const imc = calculerImc(weight, height);

  function majLigne(setListe, idx, patch) {
    setListe((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }
  function basculerTypeAlerte(t) {
    setTypesAlerte((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }
  function basculerTousTypesAlerte() {
    setTypesAlerte((prev) => (prev.length === TOUS_CODES_ALERTE.length ? [] : TOUS_CODES_ALERTE));
  }
  function versPayloadLigne(l) {
    return {
      drugRef: l.vidal_id || null, label: l.label || null, dose: l.dose || null,
      durationType: l.durationType || null, duration: l.duration || null,
      frequencyType: l.frequencyType || null, route: l.route || null, indication: l.indication || null,
    };
  }

  function reinitialiser() {
    setDob(""); setGender("FEMALE"); setWeight(""); setHeight(""); setCreatinine(""); setHepatic("NONE");
    setAllergies([]); setPathologies([]); setMolecules([]);
    setTraitementsEnCours([]); setNouvellesLignes([ligneVide()]); setTypesAlerte(TYPES_ALERTE_DEFAUT);
    setResultat(null); setErreur(null);
    setPatientSelectionne(null); setMessageProfil("");
  }

  // § demande utilisateur : importe date de naissance, sexe, et le profil
  // clinique VIDAL déjà enregistré sur ce patient (poids/taille/
  // créatininémie dernière connue/insuffisance hépatique/allergies/
  // pathologies/molécules à éviter) — jamais de re-saisie pour un patient
  // déjà consulté.
  function importerDepuisPatient(p) {
    setPatientSelectionne(p);
    setDob(formatDateISO(p["Date Naissance"]));
    setGender(mapperGenreVidal(p.Sexe));
    setWeight(p.PoidsKg != null ? String(p.PoidsKg) : "");
    setHeight(p.TailleCm != null ? String(p.TailleCm) : "");
    setCreatinine(p.DerniereCreatininemieUmolL != null ? String(p.DerniereCreatininemieUmolL) : "");
    setHepatic(p.InsuffisanceHepatique || "NONE");
    setAllergies(p.AllergiesVidal || []);
    setPathologies(p.PathologiesVidal || []);
    setMolecules(p.MoleculesAEviterVidal || []);
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
        poids_kg: weight ? Number(weight) : null,
        taille_cm: height ? Number(height) : null,
        insuffisance_hepatique: hepatic,
        derniere_creatininemie_umol_l: creatinine ? Number(creatinine) : null,
        allergies, pathologies, molecules_a_eviter: molecules,
      });
      setMessageProfilEstErreur(false);
      setMessageProfil("Profil enregistré sur la fiche patient — importé automatiquement la prochaine fois.");
    } catch (err) {
      setMessageProfilEstErreur(true);
      setMessageProfil(err.response?.data?.detail || "Échec de l'enregistrement sur la fiche patient.");
    }
    setEnregistrementProfilEnCours(false);
  }

  async function lancerAnalyse() {
    const aUneLigne = [...traitementsEnCours, ...nouvellesLignes].some((l) => l.vidal_id);
    if (!aUneLigne) return setErreur("Ajoutez au moins un médicament (recherche VIDAL) avant de sécuriser.");
    setEnCours(true); setErreur(null); setResultat(null);
    try {
      const r = await api.post("/vidal/securisation/analyze", {
        patient: { dateOfBirth: dob || null, gender, weight: weight || null, height: height || null, clairance, hepaticInsufficiency: hepatic, allergies, pathologies, molecules },
        current_treatments: traitementsEnCours.filter((l) => l.vidal_id).map(versPayloadLigne),
        new_prescription_lines: nouvellesLignes.filter((l) => l.vidal_id).map(versPayloadLigne),
        alert_types: typesAlerte,
        // § le nom du patient n'était jusqu'ici JAMAIS transmis (champ
        // backend existant mais jamais renseigné côté frontend) — l'import
        // depuis la fiche patient le rend disponible naturellement,
        // corrigeant au passage l'historique de sécurisation qui
        // n'affichait aucun nom de patient jusqu'à présent.
        patient_nom: patientSelectionne ? [patientSelectionne.Nom, patientSelectionne.Prénoms].filter(Boolean).join(" ") : null,
      });
      setResultat(r.data);
    } catch (err) {
      setErreur(err.response?.data?.detail || err.message || "Erreur inconnue.");
    }
    setEnCours(false);
  }

  const alertes = resultat?.analyse?.alerts || [];
  const resume = resultat?.analyse?.summary || [];

  return (
    <div>
      <div className="titre-page" style={{ display: "flex", alignItems: "center", gap: 8 }}><AlertTriangle size={22} /> Sécurisation</div>
      <div className="sous-titre-page">Analyse VIDAL — interactions, contre-indications, posologie, allergies.</div>

      <RecherchePatientVidal patientSelectionne={patientSelectionne} onSelectionner={importerDepuisPatient} onEffacer={effacerPatientSelectionne} />

      <div className="carte" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}><User size={15} /> Profil du patient</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 10 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 3 }}>Date de naissance</label>
            <input type="date" className="champ-saisie" value={dob} onChange={(e) => setDob(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 3 }}>Sexe</label>
            <select className="champ-saisie" value={gender} onChange={(e) => setGender(e.target.value)}>
              <option value="MALE">Homme</option><option value="FEMALE">Femme</option><option value="UNKNOWN">Indéterminé</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 3 }}>Poids (kg)</label>
            <input type="number" className="champ-saisie" value={weight} onChange={(e) => setWeight(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 3 }}>Taille (cm)</label>
            <input type="number" className="champ-saisie" value={height} onChange={(e) => setHeight(e.target.value)} />
          </div>
        </div>
        {imc != null && (
          <div style={{ fontSize: 12.5, color: "var(--sawali-gris-fonce)", marginBottom: 10 }}>
            IMC (indicatif, non transmis à VIDAL) : <strong>{imc.toFixed(2)} kg/m²</strong> — <strong>{categorieImc(imc)}</strong> (seuils OMS)
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 3 }}>Créatininémie (µmol/L)</label>
            <input type="number" className="champ-saisie" value={creatinine} onChange={(e) => setCreatinine(e.target.value)} placeholder="ex : 70" />
            {clairance != null && <div style={{ fontSize: 10.5, color: "var(--sawali-gris)", marginTop: 3 }}>Clairance estimée (Cockcroft &amp; Gault), envoyée à VIDAL : <strong>{clairance.toFixed(1)} mL/min</strong></div>}
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 3 }}>Insuffisance hépatique</label>
            <select className="champ-saisie" value={hepatic} onChange={(e) => setHepatic(e.target.value)}>
              <option value="NONE">Aucune</option><option value="MODERATE">Modérée</option><option value="SEVERE">Sévère</option>
            </select>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          <ChampTagsReferentiel label="Allergies connues" kind="allergy" values={allergies} onChange={setAllergies} />
          <ChampTagsReferentiel label="Pathologies connues" kind="pathology" values={pathologies} onChange={setPathologies} />
          <ChampTagsReferentiel label="Molécules à éviter" kind="molecule" values={molecules} onChange={setMolecules} />
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
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Traitements en cours</div>
        {traitementsEnCours.map((ligne, idx) => (
          <LigneMedicament key={idx} ligne={ligne} onChange={(patch) => majLigne(setTraitementsEnCours, idx, patch)} onRetirer={() => setTraitementsEnCours(traitementsEnCours.filter((_, i) => i !== idx))} />
        ))}
        <button className="bouton-secondaire" style={{ fontSize: 12.5 }} onClick={() => setTraitementsEnCours([...traitementsEnCours, ligneVide()])}>+ Ajouter un traitement en cours</button>
      </div>

      <div className="carte" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Nouvelle prescription</div>
        {nouvellesLignes.map((ligne, idx) => (
          <LigneMedicament key={idx} ligne={ligne} onChange={(patch) => majLigne(setNouvellesLignes, idx, patch)} onRetirer={() => nouvellesLignes.length > 1 && setNouvellesLignes(nouvellesLignes.filter((_, i) => i !== idx))} />
        ))}
        <button className="bouton-secondaire" style={{ fontSize: 12.5 }} onClick={() => setNouvellesLignes([...nouvellesLignes, ligneVide()])}>+ Ajouter un médicament</button>
      </div>

      <div className="carte" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontWeight: 700 }}>Alertes à vérifier</div>
          <button onClick={basculerTousTypesAlerte} style={{ border: "none", background: "none", color: "#9C1616", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>
            {typesAlerte.length === TOUS_CODES_ALERTE.length ? "Tout décocher" : "Tout cocher"}
          </button>
        </div>
        <div style={{ fontSize: 12, color: "var(--sawali-gris)", marginBottom: 10 }}>{typesAlerte.length} sélectionnée{typesAlerte.length > 1 ? "s" : ""} sur {TOUS_CODES_ALERTE.length}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {Object.entries(LIBELLES_TYPES_ALERTE).map(([code, label]) => (
            <button key={code} onClick={() => basculerTypeAlerte(code)}
              style={{
                fontSize: 12, padding: "5px 12px", borderRadius: 999, cursor: "pointer",
                border: typesAlerte.includes(code) ? "1px solid #9C1616" : "1px solid var(--sawali-bordure)",
                background: typesAlerte.includes(code) ? "#9C1616" : "transparent",
                color: typesAlerte.includes(code) ? "white" : "var(--sawali-gris-fonce)",
              }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <button className="bouton-secondaire" onClick={reinitialiser} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><RotateCcw size={13} /> Réinitialiser</button>
        <button className="bouton-primaire" style={{ background: "#9C1616", display: "inline-flex", alignItems: "center", gap: 6 }} onClick={lancerAnalyse} disabled={enCours}>
          {enCours ? <><Loader2 size={14} className="lucide-tourne" /> Analyse en cours...</> : <><HeartPulse size={14} /> Sécuriser</>}
        </button>
        {resultat && <button className="bouton-secondaire" onClick={() => window.print()} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Printer size={13} /> Imprimer le résultat</button>}
      </div>

      {erreur && <div className="carte" style={{ color: "var(--sawali-orange)", marginBottom: 16, display: "flex", alignItems: "center", gap: 6 }}><AlertTriangle size={14} /> {erreur}</div>}

      {resultat && (
        <div className="carte">
          <div style={{ fontWeight: 700, marginBottom: 12 }}>Résultat de l'analyse VIDAL</div>
          {resume.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
              {resume.filter((s) => s.severity && s.severity !== "NO_ALERT").map((s, i) => {
                const meta = META_SEVERITE[s.severity] || { label: s.severity, couleur: "#94a3b8" };
                return <span key={i} style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999, color: "white", background: meta.couleur }}>{s.label || s.category} — {meta.label}</span>;
              })}
              {resume.every((s) => !s.severity || s.severity === "NO_ALERT") && <span className="badge badge-vert">Aucune alerte détectée</span>}
            </div>
          )}
          {alertes.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--sawali-gris)" }}>Aucune alerte détaillée dans la réponse.</div>
          ) : (
            alertes.map((a, i) => {
              const meta = META_SEVERITE[a.severity] || { label: a.severity || "—", couleur: "#94a3b8" };
              return (
                <div key={i} style={{ border: "1px solid var(--sawali-bordure)", background: fondSeverite(a.severity), borderRadius: 10, padding: 12, marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
                    <div style={{ fontWeight: 700, fontSize: 13.5 }}>{a.title}</div>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 9px", borderRadius: 999, color: "white", background: meta.couleur, whiteSpace: "nowrap", height: "fit-content" }} title={a.alert_type_label}>
                      {a.alert_type_label ? `${a.alert_type_label} — ${meta.label}` : meta.label}
                    </span>
                  </div>
                  {a.content && <div style={{ fontSize: 12.5 }}>{a.content}</div>}
                  {a.detail && <div style={{ fontSize: 12, color: "var(--sawali-gris-fonce)", marginTop: 4 }}>{a.detail}</div>}
                  {a.source_label && <div style={{ fontSize: 10.5, color: "var(--sawali-gris)", marginTop: 6 }}>Source : {a.source_label}</div>}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
