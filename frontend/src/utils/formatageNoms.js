// utils/formatageNoms.js
// ---------------------------
// § demande utilisateur : "Nom de famille toujours en majuscules et
// seulement les 1er lettres du Prénom en majuscule, tout le reste du
// prénom en minuscule." Gère les prénoms composés (espace ou tiret comme
// séparateur : "jean baptiste" -> "Jean Baptiste", "marie-claire" ->
// "Marie-Claire") — chaque "mot" du prénom prend sa propre majuscule
// initiale, pas seulement le tout premier caractère de la chaîne entière.

export function formaterNomFamille(texte) {
  return (texte || "").toUpperCase();
}

export function formaterPrenom(texte) {
  return (texte || "")
    .toLowerCase()
    .replace(/(^|[\s-])([a-zà-ÿ])/g, (correspondance, separateur, lettre) => separateur + lettre.toUpperCase());
}
