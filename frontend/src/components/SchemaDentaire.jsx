// components/SchemaDentaire.jsx
// ----------------------------------
// Le composant central du §6 du cahier des charges : un schéma dentaire
// complet (32 dents, notation FDI), affiché au Caissier (sélection d'actes)
// ET au Dentiste (suivi clinique). Chaque dent est cliquable, se met en
// évidence au survol, et propose les actes du catalogue applicables.
//
// Code couleur : Bleu = carie/obturation, Vert = couronne/bridge,
// Rouge = implant, Jaune = orthodontie, Orange = problème parodontal.

import { useState, useMemo } from "react";

// Rangée du haut : quadrant 1 (18→11) puis quadrant 2 (21→28) — notation FDI standard.
const DENTS_HAUT = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
// Rangée du bas : quadrant 4 (48→41) puis quadrant 3 (31→38)
const DENTS_BAS = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];

const COULEURS_STATUT = {
  Sain: "#ffffff",
  "Carie/Obturation": "#2f6fed",
  "Couronne/Bridge": "#2fa84f",
  Implant: "#e0392b",
  Orthodontie: "#f2c40c",
  "Problème Parodontal": "#f28c0c",
  Extrait: "#c9ced6",
};

const LEGENDE = [
  { statut: "Carie/Obturation", label: "Carie / Obturation" },
  { statut: "Couronne/Bridge", label: "Couronne / Bridge" },
  { statut: "Implant", label: "Implant" },
  { statut: "Orthodontie", label: "Orthodontie" },
  { statut: "Problème Parodontal", label: "Problème parodontal" },
  { statut: "Extrait", label: "Dent extraite" },
];

/** Dessine UNE dent (couronne stylisée + racine), cliquable et survolable. */
function Dent({ numero, statut, estSelectionnee, survolee, position, estRangeeHaute, onClick, onSurvol }) {
  const couleur = COULEURS_STATUT[statut] || COULEURS_STATUT.Sain;
  const enSurbrillance = survolee || estSelectionnee;
  const texteFonce = ["Orthodontie", "Sain"].includes(statut);

  return (
    <g
      transform={`translate(${position}, 0)`}
      onMouseEnter={() => onSurvol(numero)}
      onMouseLeave={() => onSurvol(null)}
      onClick={() => onClick(numero)}
      style={{ cursor: "pointer" }}
    >
      {enSurbrillance && (
        <circle cx="0" cy={estRangeeHaute ? 28 : -28} r="26" fill="var(--sawali-bleu-glow)" opacity="0.25" />
      )}
      <line
        x1="0" y1={estRangeeHaute ? 44 : -44}
        x2="0" y2={estRangeeHaute ? 58 : -58}
        stroke="#c9ced6" strokeWidth="4" strokeLinecap="round"
      />
      <rect
        x="-16" y={estRangeeHaute ? 8 : -44}
        width="32" height="36" rx="9"
        fill={couleur}
        stroke={enSurbrillance ? "var(--sawali-bleu)" : "#9aa7b8"}
        strokeWidth={enSurbrillance ? 2.5 : 1.2}
      />
      <text
        x="0" y={estRangeeHaute ? 30 : -22}
        textAnchor="middle" fontSize="11" fontWeight="600"
        fill={texteFonce ? "#334155" : "#ffffff"}
      >
        {numero}
      </text>
    </g>
  );
}

/**
 * Props :
 *  - actesDisponibles: liste des actes du catalogue [{code_produit, libelle, prix_public, domaine}]
 *  - statutsInitiaux: objet {numeroDent: statut} pour restaurer l'état persistant (ContenuExams)
 *  - onChangerPanier(lignesPanier): callback appelé à chaque changement du panier
 */
export default function SchemaDentaire({ actesDisponibles = [], statutsInitiaux = {}, onChangerPanier }) {
  const [statutsDents, setStatutsDents] = useState(statutsInitiaux);
  const [dentSurvolee, setDentSurvolee] = useState(null);
  const [dentSelectionnee, setDentSelectionnee] = useState(null);
  const [actesParDent, setActesParDent] = useState({}); // {numeroDent: [code_produit, ...]}
  const [rechercheActe, setRechercheActe] = useState("");

  function gererClicDent(numero) {
    setDentSelectionnee(numero === dentSelectionnee ? null : numero);
    setRechercheActe("");
  }

  function basculerActe(numero, acte) {
    setActesParDent((precedent) => {
      const actesActuels = precedent[numero] || [];
      const dejaPresent = actesActuels.some((a) => a.code_produit === acte.code_produit);
      const nouveauxActes = dejaPresent
        ? actesActuels.filter((a) => a.code_produit !== acte.code_produit)
        : [...actesActuels, acte];
      const misAJour = { ...precedent, [numero]: nouveauxActes };

      // Met à jour automatiquement le statut visuel de la dent selon le
      // domaine du dernier acte ajouté (heuristique simple mais efficace).
      if (nouveauxActes.length > 0) {
        const domaine = nouveauxActes[nouveauxActes.length - 1].domaine;
        const statutSuggere =
          domaine === "PROTHE" ? "Couronne/Bridge" :
          domaine === "SCHIRU" ? "Implant" :
          domaine === "SPARAD" ? "Problème Parodontal" :
          "Carie/Obturation";
        setStatutsDents((s) => ({ ...s, [numero]: statutSuggere }));
      } else {
        setStatutsDents((s) => ({ ...s, [numero]: "Sain" }));
      }

      // Reconstruit le panier complet et prévient le parent (Caisse).
      const lignesPanier = Object.entries(misAJour).flatMap(([num, actes]) =>
        actes.map((a) => ({
          code_produit: a.code_produit,
          libelle: a.libelle,
          domaine: a.domaine,
          quantite: 1,
          prix_unitaire: a.prix_public,
          pourcentage_remise: 0,
          numero_dent: Number(num),
        }))
      );
      onChangerPanier?.(lignesPanier);
      return misAJour;
    });
  }

  const actesFiltres = useMemo(() => {
    if (!rechercheActe) return actesDisponibles.slice(0, 20);
    return actesDisponibles.filter((a) => a.libelle.toLowerCase().includes(rechercheActe.toLowerCase()));
  }, [actesDisponibles, rechercheActe]);

  const totalCumule = Object.values(actesParDent)
    .flat()
    .reduce((somme, a) => somme + (a.prix_public || 0), 0);

  return (
    <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
      <div className="carte" style={{ flex: "2 1 480px" }}>
        <svg viewBox="0 0 760 220" width="100%" height="auto" role="img" aria-label="Schéma dentaire interactif">
          {/* Rangée haute */}
          <g transform="translate(30, 90)">
            {DENTS_HAUT.map((numero, index) => (
              <Dent
                key={numero}
                numero={numero}
                statut={statutsDents[numero] || "Sain"}
                estSelectionnee={dentSelectionnee === numero}
                survolee={dentSurvolee === numero}
                position={index * 45}
                estRangeeHaute
                onClick={gererClicDent}
                onSurvol={setDentSurvolee}
              />
            ))}
          </g>
          {/* Rangée basse */}
          <g transform="translate(30, 130)">
            {DENTS_BAS.map((numero, index) => (
              <Dent
                key={numero}
                numero={numero}
                statut={statutsDents[numero] || "Sain"}
                estSelectionnee={dentSelectionnee === numero}
                survolee={dentSurvolee === numero}
                position={index * 45}
                estRangeeHaute={false}
                onClick={gererClicDent}
                onSurvol={setDentSurvolee}
              />
            ))}
          </g>
        </svg>

        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 10, fontSize: 12 }}>
          {LEGENDE.map((item) => (
            <div key={item.statut} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 12, height: 12, borderRadius: 3, background: COULEURS_STATUT[item.statut], display: "inline-block", border: "1px solid #d0d7e2" }} />
              {item.label}
            </div>
          ))}
        </div>
      </div>

      <div className="carte" style={{ flex: "1 1 280px", minWidth: 260 }}>
        {dentSelectionnee ? (
          <>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Dent n°{dentSelectionnee} — actes applicables</div>
            <input
              className="champ-saisie"
              placeholder="Rechercher un acte..."
              value={rechercheActe}
              onChange={(e) => setRechercheActe(e.target.value)}
              style={{ marginBottom: 10 }}
            />
            <div style={{ maxHeight: 260, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
              {actesFiltres.map((acte) => {
                const selectionne = (actesParDent[dentSelectionnee] || []).some((a) => a.code_produit === acte.code_produit);
                return (
                  <label key={acte.code_produit} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "4px 2px", cursor: "pointer" }}>
                    <input type="checkbox" checked={selectionne} onChange={() => basculerActe(dentSelectionnee, acte)} />
                    <span style={{ flex: 1 }}>{acte.libelle}</span>
                    <span style={{ color: "var(--sawali-gris-fonce)", fontVariantNumeric: "tabular-nums" }}>
                      {acte.prix_public.toLocaleString("fr-FR")} F
                    </span>
                  </label>
                );
              })}
            </div>
          </>
        ) : (
          <div style={{ color: "var(--sawali-gris)", fontSize: 14 }}>Cliquez sur une dent pour choisir un acte.</div>
        )}

        <div style={{ borderTop: "1px solid #eef2fa", marginTop: 14, paddingTop: 12 }}>
          <div style={{ fontSize: 13, color: "var(--sawali-gris-fonce)" }}>Total cumulé</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "var(--sawali-bleu)" }}>
            {totalCumule.toLocaleString("fr-FR")} FCFA
          </div>
        </div>
      </div>
    </div>
  );
}
