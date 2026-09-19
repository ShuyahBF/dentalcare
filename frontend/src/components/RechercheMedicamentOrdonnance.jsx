// components/RechercheMedicamentOrdonnance.jsx
// --------------------------------------------------
// § demande utilisateur (saisie des ordonnances) : "la saisie des
// désignations des médicaments est tout en majuscules, permettre de
// retrouver des produits dans la liste des produits Vidal, ou absents de
// la liste Vidal. Un tag rouge s'affiche en face des produits existants
// dans le vidal[,] dans le cas contraire 'nouveau' s'affiche." — recherche
// combinée VIDAL (/vidal/search/parsed) + référentiel local du cabinet
// (/medicaments-locaux/rechercher, produits déjà utilisés hors VIDAL),
// résultats fusionnés et étiquetés par origine. Distinct de
// VidalMedicationSearch (réservé aux pages Fiche produit/Posologie/
// Sécurisation, où un médicament hors VIDAL n'a pas de sens) : ici
// l'ordonnance doit accepter les deux.

import { useState, useEffect, useRef } from "react";
import { Loader2, X } from "lucide-react";
import api from "../utils/api";

const DEBOUNCE_MS = 350;

export default function RechercheMedicamentOrdonnance({ query, onQueryChange, onSelect, onClear, disabled = false }) {
  const [resultats, setResultats] = useState([]);
  const [ouvert, setOuvert] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const debounceRef = useRef(null);
  const vientDeSelectionnerRef = useRef(false);
  const idRequeteRef = useRef(0);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (vientDeSelectionnerRef.current) {
      vientDeSelectionnerRef.current = false;
      idRequeteRef.current += 1;
      setResultats([]);
      return;
    }
    const q = (query || "").trim();
    if (q.length < 2) {
      idRequeteRef.current += 1;
      setResultats([]);
      return;
    }
    const monId = ++idRequeteRef.current;
    debounceRef.current = setTimeout(async () => {
      setEnCours(true);
      const [vidalRes, localRes] = await Promise.allSettled([
        api.get("/vidal/search/parsed", { params: { q } }),
        api.get("/medicaments-locaux/rechercher", { params: { q } }),
      ]);
      if (idRequeteRef.current !== monId) return; // réponse obsolète
      const vidal = (vidalRes.status === "fulfilled" ? vidalRes.value.data?.results || [] : []).map((r) => ({ title: r.title, vidal_id: r.vidal_id, source: "vidal" }));
      const local = (localRes.status === "fulfilled" ? localRes.value.data?.results || [] : []).map((r) => ({ title: r.title, local_id: r.local_id, source: "local" }));
      setResultats([...vidal, ...local]);
      setOuvert(true);
      setEnCours(false);
    }, DEBOUNCE_MS);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  function choisir(item) {
    vientDeSelectionnerRef.current = true;
    idRequeteRef.current += 1;
    onSelect?.(item);
    setOuvert(false);
    setResultats([]);
  }

  return (
    <div style={{ position: "relative" }}>
      <input
        className="champ-saisie"
        style={{ textTransform: "uppercase" }}
        value={query || ""}
        disabled={disabled}
        // § "la saisie des désignations [...] est tout en majuscules" — la
        // VALEUR stockée est forcée en majuscules (pas seulement l'affichage
        // CSS), pour que le PDF de l'ordonnance soit lui aussi en majuscules.
        onChange={(e) => onQueryChange?.(e.target.value.toUpperCase())}
        onFocus={() => resultats.length > 0 && setOuvert(true)}
        onBlur={() => setTimeout(() => setOuvert(false), 150)}
        placeholder="Désignation (ex : DOLIPRANE 1000)"
      />
      {enCours && <span style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", display: "flex" }}><Loader2 size={14} className="lucide-tourne" /></span>}
      {!enCours && query && (
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onClear?.(); setResultats([]); setOuvert(false); }}
          style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", border: "none", background: "none", cursor: "pointer", color: "var(--sawali-gris)", display: "flex" }}><X size={14} /></button>
      )}
      {ouvert && resultats.length > 0 && (
        <div className="carte" style={{ position: "absolute", zIndex: 20, width: "100%", marginTop: 4, maxHeight: 240, overflowY: "auto", padding: 4 }}>
          {resultats.map((item, i) => (
            <div key={`${item.vidal_id || item.local_id || i}-${i}`} onMouseDown={(e) => { e.preventDefault(); choisir(item); }}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "7px 9px", cursor: "pointer", borderRadius: 6, fontSize: 13 }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--sawali-gris-clair)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
              <span>{item.title}</span>
              <TagOrigine source={item.source} />
            </div>
          ))}
        </div>
      )}
      {ouvert && !enCours && (query || "").trim().length >= 2 && resultats.length === 0 && (
        <div className="carte" style={{ position: "absolute", zIndex: 20, width: "100%", marginTop: 4, padding: "8px 10px", fontSize: 12.5, color: "var(--sawali-gris)" }}>
          Aucun résultat — cette désignation sera enregistrée comme nouvelle référence.
        </div>
      )}
    </div>
  );
}

// § "Un tag rouge s'affiche en face des produits existants dans le vidal[,]
// dans le cas contraire 'nouveau' s'affiche" — appliqué littéralement :
// rouge = trouvé dans VIDAL ; sinon "Nouveau" (référence locale déjà
// connue, ou jamais rapprochée — les deux comptent comme "hors VIDAL").
export function TagOrigine({ source }) {
  if (source === "vidal") {
    return <span className="badge badge-rouge" style={{ fontSize: 10, flexShrink: 0 }}>VIDAL</span>;
  }
  return <span className="badge" style={{ fontSize: 10, flexShrink: 0, background: "var(--sawali-gris-clair)", color: "var(--sawali-gris-fonce)" }}>Nouveau</span>;
}
