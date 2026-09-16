// utils/numerotationDentaire.js
// ----------------------------------
// Table de correspondance entre les deux systèmes de numérotation dentaire
// couramment enseignés selon l'école de formation du dentiste :
//   - "internationale" (notation FDI/ISO, à deux chiffres : 11 à 48) —
//     la plus répandue en Europe et en Afrique francophone.
//   - "universelle" (système américain, un seul chiffre continu : 1 à 32).
//
// Le numéro FDI reste la clé interne stable du schéma dentaire (voir
// SchemaDentaire.jsx) ; ce module ne sert qu'à l'AFFICHAGE et à
// l'enregistrement systématique des deux références sur chaque ligne de
// reçu (numero_dent_international + numero_dent_universel), quel que soit
// le système actuellement affiché à l'écran.

export const FDI_VERS_UNIVERSEL = {
  18: 1, 17: 2, 16: 3, 15: 4, 14: 5, 13: 6, 12: 7, 11: 8,
  21: 9, 22: 10, 23: 11, 24: 12, 25: 13, 26: 14, 27: 15, 28: 16,
  38: 17, 37: 18, 36: 19, 35: 20, 34: 21, 33: 22, 32: 23, 31: 24,
  41: 25, 42: 26, 43: 27, 44: 28, 45: 29, 46: 30, 47: 31, 48: 32,
};

export const UNIVERSEL_VERS_FDI = Object.fromEntries(
  Object.entries(FDI_VERS_UNIVERSEL).map(([fdi, universel]) => [universel, Number(fdi)])
);

/** Retourne {international, universel} pour un numéro FDI donné. */
export function correspondanceDepuisFdi(numeroFdi) {
  return { international: numeroFdi, universel: FDI_VERS_UNIVERSEL[numeroFdi] ?? null };
}

/** Formate le numéro affiché dans le panier, ex: "(46i)" ou "(30u)" selon la numérotation active. */
export function suffixeNumeroDent(numeroFdi, numerotation) {
  if (numerotation === "universelle") {
    const universel = FDI_VERS_UNIVERSEL[numeroFdi];
    return universel ? `(${universel}u)` : "";
  }
  return `(${numeroFdi}i)`;
}
