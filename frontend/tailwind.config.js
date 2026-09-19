// tailwind.config.js
// ----------------------
// § correction n°2 ("stylées, souples et plus clairs") — fondation Tailwind
// pour l'application. IMPORTANT : toutes les couleurs référencent les
// variables CSS déjà définies dans styles/global.css (var(--sawali-...))
// au lieu de valeurs figées — le thème est modifié DYNAMIQUEMENT par
// cabinet (couleur primaire, rayons, ombres) via utils/appliquerTheme.js,
// qui surcharge ces variables en JS sur <html> à la connexion. Une couleur
// Tailwind codée en dur casserait ce système de thème personnalisable.
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  // § le mode sombre existant est piloté par [data-theme="sombre"] sur
  // <html> (pas par une classe .dark) — on branche Tailwind sur EXACTEMENT
  // le même sélecteur, sans changer le mécanisme déjà en place.
  darkMode: ["selector", '[data-theme="sombre"]'],
  theme: {
    extend: {
      colors: {
        "sawali-bleu": "var(--sawali-bleu)",
        "sawali-bleu-clair": "var(--sawali-bleu-clair)",
        "sawali-bleu-glow": "var(--sawali-bleu-glow)",
        "sawali-blanc": "var(--sawali-blanc)",
        "sawali-gris-clair": "var(--sawali-gris-clair)",
        "sawali-gris": "var(--sawali-gris)",
        "sawali-gris-fonce": "var(--sawali-gris-fonce)",
        "sawali-vert": "var(--sawali-vert)",
        "sawali-rouge": "var(--sawali-rouge)",
        "sawali-jaune": "var(--sawali-jaune)",
        "sawali-orange": "var(--sawali-orange)",
        "sawali-texte": "var(--sawali-texte)",
        "sawali-bordure": "var(--sawali-bordure)",
      },
      borderRadius: {
        "sawali-carte": "var(--sawali-rayon)",
        "sawali-bouton": "var(--sawali-rayon-bouton)",
        "sawali-champ": "var(--sawali-rayon-champ)",
      },
      boxShadow: {
        "sawali": "var(--sawali-ombre)",
        "sawali-legere": "var(--sawali-ombre-legere)",
      },
      fontFamily: {
        titre: ["var(--police-titre)"],
        texte: ["var(--police-texte)"],
      },
      // § transitions/animations cohérentes réutilisées par les classes de
      // composants (boutons, cartes, champs) définies dans global.css
      // @layer components — c'est CE qui rend l'interface "souple" (pas la
      // syntaxe utilitaire en elle-même).
      transitionTimingFunction: {
        "sawali-doux": "cubic-bezier(0.4, 0, 0.2, 1)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
