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
    // § demande utilisateur ("pas seulement les couleurs mais les styles
    // aussi") : un thème contrôle aussi la forme des composants (boutons en
    // pilule, champs plus ou moins arrondis, bordures plus ou moins
    // épaisses, ombre des cartes) — pas seulement leur teinte.
    racine.style.setProperty("--sawali-rayon-bouton", theme.rayon_boutons || "9px");
    racine.style.setProperty("--sawali-rayon-champ", theme.rayon_champs || "9px");
    racine.style.setProperty("--sawali-rayon", theme.rayon_cartes || "14px");
    racine.style.setProperty("--sawali-epaisseur-bordure", theme.epaisseur_bordure || "1.5px");
    if (theme.ombre_cartes) racine.style.setProperty("--sawali-ombre", theme.ombre_cartes);
    else racine.style.removeProperty("--sawali-ombre");
  } else {
    // Thème SAWALI par défaut : efface toute surcharge précédente (utile
    // après un changement de compte/cabinet dans le même onglet).
    racine.style.removeProperty("--sawali-bleu");
    racine.style.removeProperty("--sawali-bleu-clair");
    racine.style.removeProperty("--sawali-bleu-glow");
    racine.style.removeProperty("--sawali-rayon-bouton");
    racine.style.removeProperty("--sawali-rayon-champ");
    racine.style.removeProperty("--sawali-rayon");
    racine.style.removeProperty("--sawali-epaisseur-bordure");
    racine.style.removeProperty("--sawali-ombre");
  }
}
