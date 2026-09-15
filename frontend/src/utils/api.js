// utils/api.js
// ---------------
// Client HTTP unique pour tout le frontend. Injecte automatiquement le JWT
// stocké après connexion, redirige vers /connexion si le serveur répond 401
// (session expirée), et réessaie automatiquement les requêtes en échec
// réseau ou passerelle indisponible (502/503) — le cas typique du service
// backend gratuit sur Render qui se met en veille après inactivité et met
// jusqu'à 50s+ à redémarrer : sans ce réessai, la toute première requête
// après une période d'inactivité échoue silencieusement et l'écran reste
// vide (observé en production : onglets Cabinet/Catalogue vides au premier
// chargement après réveil, alors que les données existent bien en base).
//
// URL de base : en développement local, "/api" passe par le proxy Vite
// (voir vite.config.js) vers http://localhost:8000. En production sur
// Render (frontend et backend déployés comme 2 services séparés, donc 2
// domaines différents), VITE_API_BASE_URL est injectée au build par
// render.yaml et pointe directement vers le service backend (URL complète,
// schéma inclus — ex: "https://sawali-dentalcare-backend.onrender.com").

import axios from "axios";

const urlDeBase = import.meta.env.VITE_API_BASE_URL
  ? `${import.meta.env.VITE_API_BASE_URL}/api`
  : "/api";

const api = axios.create({ baseURL: urlDeBase, timeout: 30000 });

const NOMBRE_MAX_REESSAIS = 4;
const attendre = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

api.interceptors.request.use((config) => {
  const jeton = localStorage.getItem("sawali_jeton");
  if (jeton) {
    config.headers.Authorization = `Bearer ${jeton}`;
  }
  return config;
});

api.interceptors.response.use(
  (reponse) => reponse,
  async (erreur) => {
    const config = erreur.config || {};
    const estErreurReseauOuPasserelle =
      !erreur.response || [502, 503, 504].includes(erreur.response.status);

    config._nombreReessais = config._nombreReessais || 0;
    if (estErreurReseauOuPasserelle && config._nombreReessais < NOMBRE_MAX_REESSAIS) {
      config._nombreReessais += 1;
      await attendre(config._nombreReessais * 4000); // 4s, 8s, 12s, 16s : laisse le temps au service de se réveiller
      return api(config);
    }

    if (erreur.response && erreur.response.status === 401) {
      localStorage.removeItem("sawali_jeton");
      localStorage.removeItem("sawali_utilisateur");
      window.location.href = "/connexion";
    }
    return Promise.reject(erreur);
  }
);

export default api;
