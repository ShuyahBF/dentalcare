// components/SchemaDentaire.jsx
// ----------------------------------
// Le composant central du §6 du cahier des charges : un schéma dentaire
// complet (32 dents), affiché au Caissier (sélection d'actes) ET au
// Dentiste (suivi clinique). Chaque dent est cliquable, se met en évidence
// et affiche son nom au survol, et propose les actes du catalogue
// applicables, avec une quantité modifiable par acte.
//
// DOUBLE NUMÉROTATION : la clé interne stable de chaque dent est le numéro
// FDI/international (11-48, formule position=quadrant+rang, donc facile à
// dériver le type anatomique). L'affichage (numéro écrit sur le schéma,
// nom au survol, suffixe dans le panier) peut basculer sur la numérotation
// universelle américaine (1-32 en continu) via la prop "numerotation"
// ("internationale" | "universelle"), réglée depuis Administration → Cabinet
// selon l'école de formation du dentiste. Les DEUX références sont
// toujours transmises dans le panier (numero_dent_international ET
// numero_dent_universel), pour rester exploitables quelle que soit la
// préférence d'affichage de qui consultera le reçu ensuite.
//
// Formes anatomiques distinctes par type de dent (incisive, canine,
// prémolaire, molaire — couronne + racine(s)), directement inspirées du
// modèle de référence fourni. ORIENTATION ANATOMIQUE CORRECTE (vérifiée sur
// le modèle de référence à l'aide d'une grille de coordonnées) : les dents
// du haut ont leur couronne contre la ligne gingivale et leur(s) racine(s)
// pointant vers le HAUT (à l'opposé de l'arcade basse), les dents du bas
// ont leur couronne contre la ligne gingivale et leur(s) racine(s) pointant
// vers le BAS — les deux arcades sont donc symétriques en miroir, pas dans
// la même orientation.
//
// Code couleur : Bleu = carie/obturation, Vert = couronne/bridge,
// Rouge = implant, Jaune = orthodontie, Orange = problème parodontal.

import { useState, useMemo, useEffect, forwardRef, useImperativeHandle, useCallback } from "react";
import { FDI_VERS_UNIVERSEL } from "../utils/numerotationDentaire";

// Rangée du haut : quadrant 1 (18→11) puis quadrant 2 (21→28) — notation FDI standard, clé interne stable.
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
function typeDent(numeroFdi) {
  const position = numeroFdi % 10;
  if (position <= 2) return "incisive";
  if (position === 3) return "canine";
  if (position <= 5) return "premolaire";
  return "molaire";
}

// Nom clinique complet par numéro FDI, affiché au survol de la souris.
const NOM_PAR_NUMERO_FDI = {
  18: "Troisième molaire supérieure droite (dent de sagesse)", 17: "Deuxième molaire supérieure droite", 16: "Première molaire supérieure droite",
  15: "Deuxième prémolaire supérieure droite", 14: "Première prémolaire supérieure droite", 13: "Canine supérieure droite",
  12: "Incisive latérale supérieure droite", 11: "Incisive centrale supérieure droite", 21: "Incisive centrale supérieure gauche",
  22: "Incisive latérale supérieure gauche", 23: "Canine supérieure gauche", 24: "Première prémolaire supérieure gauche",
  25: "Deuxième prémolaire supérieure gauche", 26: "Première molaire supérieure gauche", 27: "Deuxième molaire supérieure gauche",
  28: "Troisième molaire supérieure gauche (dent de sagesse)", 38: "Troisième molaire inférieure gauche (dent de sagesse)",
  37: "Deuxième molaire inférieure gauche", 36: "Première molaire inférieure gauche", 35: "Deuxième prémolaire inférieure gauche",
  34: "Première prémolaire inférieure gauche", 33: "Canine inférieure gauche", 32: "Incisive latérale inférieure gauche",
  31: "Incisive centrale inférieure gauche", 41: "Incisive centrale inférieure droite", 42: "Incisive latérale inférieure droite",
  43: "Canine inférieure droite", 44: "Première prémolaire inférieure droite", 45: "Deuxième prémolaire inférieure droite",
  46: "Première molaire inférieure droite", 47: "Deuxième molaire inférieure droite", 48: "Troisième molaire inférieure droite (dent de sagesse)",
};

/** Numéro affiché (international tel quel, ou converti en universel) selon la préférence active. */
function numeroAffiche(numeroFdi, numerotation) {
  if (numerotation === "universelle") return FDI_VERS_UNIVERSEL[numeroFdi] ?? numeroFdi;
  return numeroFdi;
}

/**
 * Génère les chemins SVG (couronne + racine(s)) pour un type de dent donné.
 * Repère local "canonique" : x centré sur 0, y=0 au bord libre de la
 * couronne, y croissant vers la racine. Ce repère est ensuite mis à
 * l'échelle et, pour la rangée haute, retourné verticalement (voir Dent
 * ci-dessous) pour obtenir l'orientation anatomique correcte des deux
 * arcades sans dupliquer les tracés.
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

// Échelle appliquée aux tracés canoniques ci-dessus.
const ECHELLE = 1.9;
const HAUTEUR_CANONIQUE = { incisive: 36, canine: 42, premolaire: 33, molaire: 31 };

/** Dessine UNE dent complète (couronne + racine(s)), cliquable et survolable, avec son numéro à l'extérieur de l'arcade. */
function Dent({ numero, numerotation, statut, estSelectionnee, survolee, position, ligneGingivale, estRangeeHaute, onClick, onSurvol }) {
  const couleur = COULEURS_STATUT[statut] || COULEURS_STATUT.Sain;
  const enSurbrillance = survolee || estSelectionnee;
  const type = typeDent(numero);
  const { couronne, racines } = useMemo(() => formeDent(type), [type]);
  const estExtraite = statut === "Extrait";
  const libelleAffiche = numeroAffiche(numero, numerotation);

  const porteeDent = HAUTEUR_CANONIQUE[type] * ECHELLE;
  const yNumero = estRangeeHaute ? ligneGingivale - porteeDent - 16 : ligneGingivale + porteeDent + 20;
  const transformForme = `translate(${position}, ${ligneGingivale}) scale(${ECHELLE}, ${estRangeeHaute ? -ECHELLE : ECHELLE})`;

  return (
    <g onClick={() => onClick(numero)} onMouseEnter={() => onSurvol(numero)} onMouseLeave={() => onSurvol(null)} style={{ cursor: "pointer" }}>
      <title>{`Dent n°${libelleAffiche} — ${NOM_PAR_NUMERO_FDI[numero] || ""}${statut !== "Sain" ? ` (${statut})` : ""}`}</title>

      {enSurbrillance && (
        <ellipse
          cx={position}
          cy={estRangeeHaute ? ligneGingivale - porteeDent / 2 : ligneGingivale + porteeDent / 2}
          rx={20}
          ry={porteeDent / 2 + 12}
          fill="var(--sawali-bleu-glow)"
          opacity="0.22"
        />
      )}

      <text x={position} y={yNumero} textAnchor="middle" fontSize="15" fontWeight="700" fill="var(--sawali-gris-fonce)">
        {libelleAffiche}
      </text>

      <g transform={transformForme} opacity={estExtraite ? 0.35 : 1}>
        {racines.map((d, i) => (
          <path key={i} d={d} fill="#f3ede2" stroke={enSurbrillance ? "var(--sawali-bleu)" : "#cbbfa3"} strokeWidth={(enSurbrillance ? 1.4 : 1) / ECHELLE} />
        ))}
        <path
          d={couronne}
          fill={estExtraite ? "#ffffff" : couleur}
          stroke={enSurbrillance ? "var(--sawali-bleu)" : "#9aa7b8"}
          strokeWidth={(enSurbrillance ? 2 : 1.2) / ECHELLE}
          strokeDasharray={estExtraite ? `${4 / ECHELLE} ${3 / ECHELLE}` : undefined}
        />
      </g>
    </g>
  );
}

/**
 * Props :
 *  - actesDisponibles: liste des actes du catalogue [{code_produit, libelle, prix_public, domaine}]
 *  - statutsInitiaux: objet {numeroDentFdi: statut} pour restaurer l'état persistant (ContenuExams)
 *  - actesInitiaux: objet {numeroDentFdi: [{code_produit, libelle, domaine, quantite, prix_public}]}
 *    pour restaurer les actes RÉELLEMENT déjà sélectionnés par dent (§ demande
 *    utilisateur : sans ceci, les cases "actes applicables" démarrent toutes
 *    décochées même pour une dent déjà colorée — cocher un acte déjà présent
 *    l'AJOUTE en double dans le panier plutôt que de simplement le confirmer).
 *  - numerotation: "internationale" (par défaut) | "universelle" — n'affecte que l'affichage
 *  - totalAutresLignes: montant des lignes du panier SANS dent (saisie
 *    rapide — consultations générales...), géré par le composant PARENT.
 *    § bug rapporté ("montant en surbrillance mal calculé", 25 000 affiché
 *    au lieu de 30 000) : "Total cumulé" ne somme QUE les actes rattachés à
 *    une dent — un montant juste pour ce qu'il représente, mais dont
 *    l'étiquette prêtait à confusion avec le total RÉEL du reçu. Ce prop
 *    permet d'afficher clairement les deux composantes ET le total général,
 *    pour ne plus jamais laisser croire que "Total cumulé" est LE total.
 *  - onChangerPanier(lignesPanier): callback appelé à chaque changement du panier
 *
 * Exposé via ref (forwardRef) :
 *  - retirerActe(numeroDentFdi, codeProduit)
 *  - changerQuantite(numeroDentFdi, codeProduit, nouvelleQuantite)
 */
const SchemaDentaire = forwardRef(function SchemaDentaire({ actesDisponibles = [], statutsInitiaux = {}, actesInitiaux = {}, numerotation = "internationale", totalAutresLignes = 0, onChangerPanier }, ref) {
  const [statutsDents, setStatutsDents] = useState(statutsInitiaux);
  const [dentSurvolee, setDentSurvolee] = useState(null);
  const [dentSelectionnee, setDentSelectionnee] = useState(null);
  const [actesParDent, setActesParDent] = useState(actesInitiaux);
  const [rechercheActe, setRechercheActe] = useState("");

  function gererClicDent(numero) {
    setDentSelectionnee(numero === dentSelectionnee ? null : numero);
    setRechercheActe("");
  }

  const appliquerActesMisAJour = useCallback((misAJour) => {
    setActesParDent(misAJour);

    for (const [numero, actes] of Object.entries(misAJour)) {
      if (actes.length > 0) {
        const domaine = actes[actes.length - 1].domaine;
        const statutSuggere =
          domaine === "PROTHE" ? "Couronne/Bridge" :
          domaine === "SCHIRU" ? "Implant" :
          domaine === "SPARAD" ? "Problème Parodontal" :
          "Carie/Obturation";
        setStatutsDents((s) => ({ ...s, [numero]: statutSuggere }));
      } else {
        setStatutsDents((s) => ({ ...s, [numero]: "Sain" }));
      }
    }

    const lignesPanier = Object.entries(misAJour).flatMap(([num, actes]) => {
      const numeroFdi = Number(num);
      return actes.map((a) => ({
        code_produit: a.code_produit,
        libelle: a.libelle,
        domaine: a.domaine,
        quantite: a.quantite || 1,
        prix_unitaire: a.prix_public,
        pourcentage_remise: 0,
        numero_dent: numeroFdi,
        numero_dent_international: numeroFdi,
        numero_dent_universel: FDI_VERS_UNIVERSEL[numeroFdi] ?? null,
      }));
    });
    onChangerPanier?.(lignesPanier);
  }, [onChangerPanier]);

  // § correctif : les actes préchargés via `actesInitiaux` (mode édition
  // d'un reçu) ne vivaient QUE dans l'état interne tant que l'utilisateur
  // n'interagissait pas avec le schéma — si l'on enregistrait sans y
  // toucher, ils n'atteignaient jamais le panier du composant parent et
  // étaient silencieusement perdus. On les signale donc explicitement une
  // fois, au montage (ce composant est remonté à chaque chargement d'un
  // reçu différent grâce à sa `key`).
  useEffect(() => {
    if (Object.keys(actesInitiaux).length > 0) appliquerActesMisAJour(actesInitiaux);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function basculerActe(numero, acte) {
    const actesActuels = actesParDent[numero] || [];
    const dejaPresent = actesActuels.some((a) => a.code_produit === acte.code_produit);
    const nouveauxActes = dejaPresent
      ? actesActuels.filter((a) => a.code_produit !== acte.code_produit)
      : [...actesActuels, { ...acte, quantite: 1 }];
    appliquerActesMisAJour({ ...actesParDent, [numero]: nouveauxActes });
  }

  useImperativeHandle(ref, () => ({
    retirerActe(numeroDent, codeProduit) {
      const actesActuels = actesParDent[numeroDent] || [];
      const nouveauxActes = actesActuels.filter((a) => a.code_produit !== codeProduit);
      appliquerActesMisAJour({ ...actesParDent, [numeroDent]: nouveauxActes });
    },
    changerQuantite(numeroDent, codeProduit, nouvelleQuantite) {
      if (nouvelleQuantite < 1) return;
      const actesActuels = actesParDent[numeroDent] || [];
      const nouveauxActes = actesActuels.map((a) => (a.code_produit === codeProduit ? { ...a, quantite: nouvelleQuantite } : a));
      appliquerActesMisAJour({ ...actesParDent, [numeroDent]: nouveauxActes });
    },
  }), [actesParDent, appliquerActesMisAJour]);

  const actesFiltres = useMemo(() => {
    if (!rechercheActe) return actesDisponibles.slice(0, 20);
    return actesDisponibles.filter((a) => a.libelle.toLowerCase().includes(rechercheActe.toLowerCase()));
  }, [actesDisponibles, rechercheActe]);

  const totalCumule = Object.values(actesParDent)
    .flat()
    .reduce((somme, a) => somme + (a.prix_public || 0) * (a.quantite || 1), 0);

  const PAS_HORIZONTAL = 96;
  const MARGE = 40;
  const LARGEUR_SVG = PAS_HORIZONTAL * (DENTS_HAUT.length - 1) + MARGE * 2;
  const LIGNE_HAUTE = 175;
  const LIGNE_BASSE = 205;
  const HAUTEUR_SVG = 420;
  const dentSelectionneeAffichee = dentSelectionnee ? numeroAffiche(dentSelectionnee, numerotation) : null;

  return (
    <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
      <div className="carte" style={{ flex: "2 1 680px", minWidth: 0, position: "relative" }}>
        <div style={{ position: "absolute", top: 16, right: 20, fontSize: 11.5, fontWeight: 600, color: "var(--sawali-bleu)", background: "#eef2fa", padding: "3px 10px", borderRadius: 999 }}>
          {numerotation === "universelle" ? "Numérotation universelle (1-32)" : "Numérotation internationale (FDI)"}
        </div>
        <div style={{ overflowX: "auto" }}>
          <svg viewBox={`0 0 ${LARGEUR_SVG} ${HAUTEUR_SVG}`} width="100%" style={{ minWidth: 760, height: "auto", display: "block" }} role="img" aria-label="Schéma dentaire interactif">
            <line x1={MARGE - 20} y1={(LIGNE_HAUTE + LIGNE_BASSE) / 2} x2={LARGEUR_SVG - MARGE + 20} y2={(LIGNE_HAUTE + LIGNE_BASSE) / 2} stroke="#eef2fa" strokeWidth="3" />

            {DENTS_HAUT.map((numero, index) => (
              <Dent
                key={numero}
                numero={numero}
                numerotation={numerotation}
                statut={statutsDents[numero] || "Sain"}
                estSelectionnee={dentSelectionnee === numero}
                survolee={dentSurvolee === numero}
                position={MARGE + index * PAS_HORIZONTAL}
                ligneGingivale={LIGNE_HAUTE}
                estRangeeHaute
                onClick={gererClicDent}
                onSurvol={setDentSurvolee}
              />
            ))}
            {DENTS_BAS.map((numero, index) => (
              <Dent
                key={numero}
                numero={numero}
                numerotation={numerotation}
                statut={statutsDents[numero] || "Sain"}
                estSelectionnee={dentSelectionnee === numero}
                survolee={dentSurvolee === numero}
                position={MARGE + index * PAS_HORIZONTAL}
                ligneGingivale={LIGNE_BASSE}
                estRangeeHaute={false}
                onClick={gererClicDent}
                onSurvol={setDentSurvolee}
              />
            ))}
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
            <div style={{ fontWeight: 700, marginBottom: 2 }}>Dent n°{dentSelectionneeAffichee} — actes applicables</div>
            <div style={{ fontSize: 12.5, color: "var(--sawali-gris-fonce)", marginBottom: 8 }}>{NOM_PAR_NUMERO_FDI[dentSelectionnee]}</div>
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
          {/* § bug rapporté : ce total ne représente QUE les actes rattachés
              à une dent (via ce schéma) — jamais les lignes "saisie rapide"
              sans dent, gérées par le composant parent. Étiquette
              explicite + détail des deux composantes, pour ne plus jamais
              laisser croire que ce chiffre est le total du reçu entier. */}
          <div style={{ fontSize: 13, color: "var(--sawali-gris-fonce)" }}>Total du schéma (actes liés à une dent)</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "var(--sawali-bleu)" }}>
            {totalCumule.toLocaleString("fr-FR")} FCFA
          </div>
          {totalAutresLignes > 0 && (
            <>
              <div style={{ fontSize: 12.5, color: "var(--sawali-gris-fonce)", marginTop: 6 }}>
                + Autres actes sans dent (saisie rapide) : {totalAutresLignes.toLocaleString("fr-FR")} FCFA
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--sawali-vert)", marginTop: 2 }}>
                Total général du reçu : {(totalCumule + totalAutresLignes).toLocaleString("fr-FR")} FCFA
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
});

export default SchemaDentaire;
