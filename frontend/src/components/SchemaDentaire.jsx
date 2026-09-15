// components/SchemaDentaire.jsx
// ----------------------------------
// Le composant central du §6 du cahier des charges : un schéma dentaire
// complet (32 dents, notation FDI), affiché au Caissier (sélection d'actes)
// ET au Dentiste (suivi clinique). Chaque dent est cliquable, se met en
// évidence au survol, et propose les actes du catalogue applicables.
//
// Formes anatomiques distinctes par type de dent (incisive, canine,
// prémolaire, molaire — couronne + racine(s)), directement inspirées du
// modèle de référence fourni (numéros à l'extérieur de l'arcade, racines
// visibles, légende couleur en bas à droite).
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

/** Détermine le type anatomique de la dent à partir de son numéro FDI (dernier chiffre du quadrant). */
function typeDent(numero) {
  const position = numero % 10;
  if (position <= 2) return "incisive";
  if (position === 3) return "canine";
  if (position <= 5) return "premolaire";
  return "molaire";
}

/**
 * Génère les chemins SVG (couronne + racine(s)) pour un type de dent donné.
 * Repère local : x centré sur 0, y=0 à la ligne gingivale (haut de couronne),
 * y croissant vers le bas (racine). Même orientation pour les deux arcades
 * (comme sur le modèle de référence) — seule la position verticale du
 * groupe change entre rangée haute et rangée basse.
 */
function formeDent(type) {
  switch (type) {
    case "incisive":
      return {
        couronne: "M -8,2 Q -8,0 -6,0 L 6,0 Q 8,0 8,2 L 7,15 Q 0,19 -7,15 Z",
        racines: ["M -5,15 C -6,24 -3,32 0,36 C 3,32 6,24 5,15 Z"],
      };
    case "canine":
      return {
        couronne: "M -8,4 Q -6,0 0,-3 Q 6,0 8,4 L 7,16 Q 0,21 -7,16 Z",
        racines: ["M -5,16 C -6,27 -3,37 0,42 C 3,37 6,27 5,16 Z"],
      };
    case "premolaire":
      return {
        couronne: "M -10,3 Q -10,0 -7,0 L 7,0 Q 10,0 10,3 L 9,15 Q 0,19 -9,15 Z",
        racines: [
          "M -7,15 C -9,23 -7,29 -3,33 C -1,29 -1,20 -2,15 Z",
          "M 7,15 C 9,23 7,29 3,33 C 1,29 1,20 2,15 Z",
        ],
      };
    case "molaire":
    default:
      return {
        couronne: "M -13,4 Q -13,0 -9,0 Q -4,2 0,0 Q 4,2 9,0 Q 13,0 13,4 L 12,15 Q 0,19 -12,15 Z",
        racines: [
          "M -10,15 C -12,22 -10,27 -6,31 C -4,27 -4,20 -5,15 Z",
          "M 0,16 C -1,23 0,28 0,32 C 1,28 1,22 1,16 Z",
          "M 10,15 C 12,22 10,27 6,31 C 4,27 4,20 5,15 Z",
        ],
      };
  }
}

/** Dessine UNE dent complète (couronne + racine(s)), cliquable et survolable, avec son numéro à l'extérieur de l'arcade. */
function Dent({ numero, statut, estSelectionnee, survolee, position, estRangeeHaute, onClick, onSurvol }) {
  const couleur = COULEURS_STATUT[statut] || COULEURS_STATUT.Sain;
  const enSurbrillance = survolee || estSelectionnee;
  const type = typeDent(numero);
  const { couronne, racines } = useMemo(() => formeDent(type), [type]);
  const estExtraite = statut === "Extrait";

  // Hauteur totale approximative de la dent (couronne + racine), pour placer le numéro à l'extérieur.
  const hauteurDent = type === "canine" ? 42 : type === "molaire" ? 31 : type === "premolaire" ? 33 : 36;
  const yNumero = estRangeeHaute ? -10 : hauteurDent + 14;

  return (
    <g
      transform={`translate(${position}, 0)`}
      onMouseEnter={() => onSurvol(numero)}
      onMouseLeave={() => onSurvol(null)}
      onClick={() => onClick(numero)}
      style={{ cursor: "pointer" }}
    >
      {enSurbrillance && (
        <ellipse cx="0" cy={hauteurDent / 2} rx="17" ry={hauteurDent / 2 + 8} fill="var(--sawali-bleu-glow)" opacity="0.22" />
      )}

      <text x="0" y={yNumero} textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--sawali-gris-fonce)">
        {numero}
      </text>

      <g opacity={estExtraite ? 0.35 : 1}>
        {racines.map((d, i) => (
          <path key={i} d={d} fill="#f3ede2" stroke={enSurbrillance ? "var(--sawali-bleu)" : "#cbbfa3"} strokeWidth={enSurbrillance ? 1.4 : 1} />
        ))}
        <path
          d={couronne}
          fill={estExtraite ? "#ffffff" : couleur}
          stroke={enSurbrillance ? "var(--sawali-bleu)" : "#9aa7b8"}
          strokeWidth={enSurbrillance ? 2 : 1.2}
          strokeDasharray={estExtraite ? "3 2" : undefined}
        />
      </g>
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

  const PAS_HORIZONTAL = 52;
  const LARGEUR_SVG = PAS_HORIZONTAL * DENTS_HAUT.length + 40;

  return (
    <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
      <div className="carte" style={{ flex: "2 1 560px", minWidth: 0 }}>
        <div style={{ overflowX: "auto" }}>
          <svg viewBox={`0 0 ${LARGEUR_SVG} 260`} width="100%" style={{ minWidth: 640, height: "auto", display: "block" }} role="img" aria-label="Schéma dentaire interactif">
            {/* Ligne gingivale (repère visuel discret entre les deux arcades) */}
            <line x1="10" y1="130" x2={LARGEUR_SVG - 10} y2="130" stroke="#eef2fa" strokeWidth="2" />

            {/* Rangée haute */}
            <g transform="translate(30, 68)">
              {DENTS_HAUT.map((numero, index) => (
                <Dent
                  key={numero}
                  numero={numero}
                  statut={statutsDents[numero] || "Sain"}
                  estSelectionnee={dentSelectionnee === numero}
                  survolee={dentSurvolee === numero}
                  position={index * PAS_HORIZONTAL}
                  estRangeeHaute
                  onClick={gererClicDent}
                  onSurvol={setDentSurvolee}
                />
              ))}
            </g>
            {/* Rangée basse */}
            <g transform="translate(30, 155)">
              {DENTS_BAS.map((numero, index) => (
                <Dent
                  key={numero}
                  numero={numero}
                  statut={statutsDents[numero] || "Sain"}
                  estSelectionnee={dentSelectionnee === numero}
                  survolee={dentSurvolee === numero}
                  position={index * PAS_HORIZONTAL}
                  estRangeeHaute={false}
                  onClick={gererClicDent}
                  onSurvol={setDentSurvolee}
                />
              ))}
            </g>
          </svg>
        </div>

        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 14, paddingTop: 14, borderTop: "1px solid #eef2fa", fontSize: 12.5 }}>
          {LEGENDE.map((item) => (
            <div key={item.statut} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 13, height: 13, borderRadius: 3, background: COULEURS_STATUT[item.statut], display: "inline-block", border: "1px solid #d0d7e2" }} />
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
