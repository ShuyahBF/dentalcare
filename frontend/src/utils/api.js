// utils/api.js
// ---------------
// Client HTTP unique pour tout le frontend. Injecte automatiquement le JWT
// stocké après connexion, et redirige vers /connexion si le serveur répond
// 401 (session expirée).

import axios from "axios";

const api = axios.create({ baseURL: "/api" });

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
