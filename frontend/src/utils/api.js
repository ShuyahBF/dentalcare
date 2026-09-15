// utils/api.js
// ---------------
// Client HTTP unique pour tout le frontend. Injecte automatiquement le JWT
// stocké après connexion, et redirige vers /connexion si le serveur répond
// 401 (session expirée).
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

const api = axios.create({ baseURL: urlDeBase });

api.interceptors.request.use((config) => {
  const jeton = localStorage.getItem("sawali_jeton");
  if (jeton) {
    config.headers.Authorization = `Bearer ${jeton}`;
  }
  return config;
});

api.interceptors.response.use(
  (reponse) => reponse,
  (erreur) => {
    if (erreur.response && erreur.response.status === 401) {
      localStorage.removeItem("sawali_jeton");
      localStorage.removeItem("sawali_utilisateur");
      window.location.href = "/connexion";
    }
    return Promise.reject(erreur);
  }
);

export default api;
