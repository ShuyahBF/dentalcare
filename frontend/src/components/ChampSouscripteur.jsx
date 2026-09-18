// components/ChampSouscripteur.jsx
// -------------------------------------
// § demande utilisateur : "La liste des souscripteurs doit être dynamique.
// Si un nouveau souscripteur est saisi et n'est pas en base, demander s'il
// faut mémoriser ce souscripteur." Autocomplétion simple (pas de tags,
// une seule valeur) : recherche au fil de la saisie, et à la validation
// (perte de focus), propose d'enregistrer un nom qui ne correspond à aucun
// souscripteur déjà connu.

import { useState, useEffect, useRef } from "react";
import api from "../utils/api";

export default function ChampSouscripteur({ valeur, onChanger }) {
  const [suggestions, setSuggestions] = useState([]);
  const [ouvert, setOuvert] = useState(false);
  const [dejaPropose, setDejaPropose] = useState(""); // évite de re-demander plusieurs fois pour la même saisie
  const refTimer = useRef(null);

  useEffect(() => {
    if (!valeur || valeur.trim().length < 2) { setSuggestions([]); return; }
    clearTimeout(refTimer.current);
    refTimer.current = setTimeout(() => {
      api.get("/souscripteurs", { params: { q: valeur.trim() } }).then((r) => setSuggestions(r.data)).catch(() => {});
    }, 250);
    return () => clearTimeout(refTimer.current);
  }, [valeur]);

  async function proposerMemorisation() {
    const nom = valeur.trim();
    if (!nom || nom === dejaPropose) return;
    const correspondExact = suggestions.some((s) => s.nom.toLowerCase() === nom.toLowerCase());
    if (correspondExact) return;
    setDejaPropose(nom);
    if (window.confirm(`« ${nom} » n'est pas un souscripteur déjà connu pour ce cabinet.\n\nMémoriser ce souscripteur pour la prochaine fois ?`)) {
      try {
        await api.post("/souscripteurs", { nom });
      } catch { /* non bloquant pour la saisie du reçu */ }
    }
  }

  return (
    <div style={{ position: "relative" }}>
      <input
        className="champ-saisie" value={valeur} placeholder="Nom de l'entreprise ou de la personne souscriptrice"
        onChange={(e) => { onChanger(e.target.value); setOuvert(true); }}
        onFocus={() => setOuvert(true)}
        onBlur={() => { setTimeout(() => setOuvert(false), 150); proposerMemorisation(); }}
      />
      {ouvert && suggestions.length > 0 && (
        <div className="carte" style={{ position: "absolute", zIndex: 20, top: "100%", left: 0, right: 0, marginTop: 4, padding: 6, maxHeight: 180, overflowY: "auto" }}>
          {suggestions.map((s) => (
            <div
              key={s.numero_enreg} style={{ padding: "6px 8px", cursor: "pointer", fontSize: 13, borderRadius: 6 }}
              onMouseDown={() => { onChanger(s.nom); setOuvert(false); setDejaPropose(s.nom); }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--sawali-gris-clair)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              {s.nom}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
