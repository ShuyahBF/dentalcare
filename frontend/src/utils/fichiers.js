// utils/fichiers.js
// --------------------
// Ouvre/imprime/télécharge les fichiers (PDF, Excel) générés par le backend.
//
// CORRECTIF IMPORTANT : ces routes sont protégées par JWT (en-tête
// Authorization: Bearer ...), qui ne peut PAS être attaché à un simple lien
// <a href="..."> ni à une navigation directe du navigateur (window.open avec
// une URL brute). Un lien <a> vers une route protégée échoue donc
// silencieusement en 401 — l'onglet s'ouvre quand même, mais reste vide ou
// affiche une erreur, sans que ça saute aux yeux. On récupère donc toujours
// le fichier via le client HTTP authentifié (axios, qui injecte le jeton),
// sous forme de blob, puis on l'ouvre/l'imprime/le télécharge depuis ce blob.

import api from "./api";

export async function recupererBlob(chemin) {
  const reponse = await api.get(chemin, { responseType: "blob" });
  return URL.createObjectURL(reponse.data);
}

/** Ouvre le fichier (PDF) dans un nouvel onglet du navigateur. */
export async function ouvrirFichier(chemin) {
  const urlBlob = await recupererBlob(chemin);
  window.open(urlBlob, "_blank");
}

/** Ouvre le PDF dans un cadre invisible et déclenche directement la boîte de dialogue d'impression du navigateur. */
export async function imprimerPdf(chemin) {
  const urlBlob = await recupererBlob(chemin);
  const cadre = document.createElement("iframe");
  cadre.style.position = "fixed";
  cadre.style.right = "0";
  cadre.style.bottom = "0";
  cadre.style.width = "0";
  cadre.style.height = "0";
  cadre.style.border = "0";
  cadre.src = urlBlob;
  document.body.appendChild(cadre);
  cadre.onload = () => {
    cadre.contentWindow.focus();
    cadre.contentWindow.print();
  };
}

/** Télécharge un fichier (ex: export Excel) sous le nom indiqué. */
export async function telechargerFichier(chemin, nomFichier) {
  const urlBlob = await recupererBlob(chemin);
  const lien = document.createElement("a");
  lien.href = urlBlob;
  lien.download = nomFichier;
  document.body.appendChild(lien);
  lien.click();
  lien.remove();
}
