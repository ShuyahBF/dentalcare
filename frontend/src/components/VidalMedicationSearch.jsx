// components/VidalMedicationSearch.jsx
// -----------------------------------------
// § demande utilisateur — Module VIDAL France : recherche médicament
// réutilisable (Fiche produit / Posologie / Sécurisation), branchée sur
// GET /api/vidal/search/parsed. Port fidèle de la logique du portail SAWALI
// de référence (debounce + garde-fous anti-course : une réponse en vol
// arrivant APRÈS une sélection ne doit jamais rouvrir la liste par-dessus
// le choix déjà fait), adapté au style CSS de DentalCare (pas de shadcn/Tailwind).

import { useState, useEffect, useRef } from "react";
import { Loader2, X } from "lucide-react";
import api from "../utils/api";

const DEBOUNCE_MS = 350;

export default function VidalMedicationSearch({ query, onQueryChange, onSelect, onClear, placeholder = "Nom du médicament (ex : Doliprane 1000)…", disabled = false }) {
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
      try {
        const r = await api.get("/vidal/search/parsed", { params: { q } });
        if (idRequeteRef.current !== monId) return; // reponse obsolete
        setResultats(r.data?.results || []);
        setOuvert(true);
      } catch {
        if (idRequeteRef.current === monId) setResultats([]);
      }
      if (idRequeteRef.current === monId) setEnCours(false);
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
        value={query || ""}
        disabled={disabled}
        onChange={(e) => onQueryChange?.(e.target.value)}
        onFocus={() => resultats.length > 0 && setOuvert(true)}
        onBlur={() => setTimeout(() => setOuvert(false), 150)}
        placeholder={placeholder}
        style={{ paddingRight: 30 }}
      />
      {enCours && <span style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", display: "flex" }}><Loader2 size={14} className="lucide-tourne" /></span>}
      {!enCours && query && (
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onClear?.(); setResultats([]); setOuvert(false); }}
          style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", border: "none", background: "none", cursor: "pointer", color: "var(--sawali-gris)", display: "flex" }}><X size={14} /></button>
      )}
      {ouvert && resultats.length > 0 && (
        <div className="carte" style={{ position: "absolute", zIndex: 20, width: "100%", marginTop: 4, maxHeight: 220, overflowY: "auto", padding: 4 }}>
          {resultats.map((item, i) => (
            <div key={`${item.vidal_id || i}-${i}`} onMouseDown={(e) => { e.preventDefault(); choisir(item); }}
              style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "7px 9px", cursor: "pointer", borderRadius: 6, fontSize: 13 }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--sawali-gris-clair)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
              <span>{item.title}</span>
              {item.vidal_id && <span style={{ fontFamily: "monospace", fontSize: 11, color: "var(--sawali-gris)" }}>#{item.vidal_id}</span>}
            </div>
          ))}
        </div>
      )}
      {ouvert && !enCours && (query || "").trim().length >= 2 && resultats.length === 0 && (
        <div className="carte" style={{ position: "absolute", zIndex: 20, width: "100%", marginTop: 4, padding: "8px 10px", fontSize: 12.5, color: "var(--sawali-gris)" }}>
          Aucun médicament VIDAL trouvé.
        </div>
      )}
    </div>
  );
}
