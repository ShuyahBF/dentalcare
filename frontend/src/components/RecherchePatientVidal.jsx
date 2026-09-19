// components/RecherchePatientVidal.jsx
// -----------------------------------------
// § demande utilisateur : "les pages Posologie et Sécurisation doivent
// permettre d'importer les données requises depuis la fiche d'un patient
// pour ne pas avoir à remplir à nouveau par le médecin les données du
// patient (évite erreurs et permet de gagner du temps)." — recherche
// (même pattern que Caisse.jsx : GET /patients?recherche=) puis import
// direct du document complet déjà renvoyé par la recherche, sans appel
// supplémentaire. Partagé entre VidalPosologie.jsx et VidalSecurisation.jsx
// pour ne jamais dupliquer cette logique.

import { useState } from "react";
import { UserSearch, X } from "lucide-react";
import api from "../utils/api";

export default function RecherchePatientVidal({ patientSelectionne, onSelectionner, onEffacer }) {
  const [recherche, setRecherche] = useState("");
  const [resultats, setResultats] = useState([]);

  async function chercher(texte) {
    setRecherche(texte);
    if (texte.length < 2) return setResultats([]);
    const r = await api.get("/patients", { params: { recherche: texte } });
    setResultats(r.data);
  }

  function selectionner(p) {
    onSelectionner(p);
    setRecherche("");
    setResultats([]);
  }

  if (patientSelectionne) {
    const nomComplet = [patientSelectionne.Nom, patientSelectionne.Prénoms].filter(Boolean).join(" ");
    return (
      <div className="carte" style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", background: "#eef6fd", border: "1px solid #c8dcf5" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <UserSearch size={16} color="var(--sawali-bleu)" />
          <div>
            <div style={{ fontWeight: 700 }}>{nomComplet}</div>
            <div style={{ fontSize: 11.5, color: "var(--sawali-gris-fonce)" }}>Dossier {patientSelectionne.ID_Patient} — données importées, toujours modifiables ci-dessous</div>
          </div>
        </div>
        <button className="bouton-secondaire" onClick={onEffacer} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5 }}><X size={12} /> Changer de patient</button>
      </div>
    );
  }

  return (
    <div className="carte" style={{ marginBottom: 16, position: "relative" }}>
      <label style={{ fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
        <UserSearch size={13} /> Importer depuis un dossier patient (facultatif)
      </label>
      <input
        className="champ-saisie" placeholder="Rechercher par nom, prénoms ou téléphone…"
        value={recherche} onChange={(e) => chercher(e.target.value)}
      />
      {resultats.length > 0 && (
        <div className="carte" style={{ position: "absolute", zIndex: 15, left: 20, right: 20, marginTop: 4, maxHeight: 240, overflowY: "auto", padding: 4 }}>
          {resultats.map((p) => (
            <div
              key={p.Numéro_Enreg} onMouseDown={(e) => { e.preventDefault(); selectionner(p); }}
              style={{ padding: 8, cursor: "pointer", borderRadius: 6, fontSize: 13 }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--sawali-gris-clair)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <strong>{p.Nom} {p.Prénoms}</strong> <span style={{ color: "var(--sawali-gris)" }}>— {p.ID_Patient}{p.Téléphone ? ` — ${p.Téléphone}` : ""}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
