// utils/appliquerTheme.js
// ---------------------------
// § demande utilisateur : applique le thème (couleurs) et le mode clair/
// sombre choisis par LE PROPRE CABINET de l'utilisateur connecté — en
// surchargeant les variables CSS sur <html>, sans toucher aux composants
// existants (ils lisent déjà var(--sawali-bleu) etc.).

export function appliquerTheme(cabinet) {
  if (!cabinet) return;
  const racine = document.documentElement;

  racine.dataset.theme = cabinet.mode_affichage === "sombre" ? "sombre" : "clair";

  const theme = cabinet.theme_resolu;
  if (theme) {
    if (theme.couleur_primaire) racine.style.setProperty("--sawali-bleu", theme.couleur_primaire);
    if (theme.couleur_primaire_claire) racine.style.setProperty("--sawali-bleu-clair", theme.couleur_primaire_claire);
    if (theme.couleur_accent) racine.style.setProperty("--sawali-bleu-glow", theme.couleur_accent);
  } else {
    // Thème SAWALI par défaut : efface toute surcharge précédente (utile
    // après un changement de compte/cabinet dans le même onglet).
    racine.style.removeProperty("--sawali-bleu");
    racine.style.removeProperty("--sawali-bleu-clair");
    racine.style.removeProperty("--sawali-bleu-glow");
  }
}
