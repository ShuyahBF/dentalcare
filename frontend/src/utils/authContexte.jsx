// utils/authContexte.jsx
// --------------------------
// Contexte React global pour la session utilisateur : login, rôle, jeton.
// Persisté dans localStorage pour survivre à un rafraîchissement de page.

import { createContext, useContext, useState } from "react";
import api from "./api";

const ContexteAuth = createContext(null);

export function FournisseurAuth({ children }) {
  const [utilisateur, setUtilisateur] = useState(() => {
    const stocke = localStorage.getItem("sawali_utilisateur");
    return stocke ? JSON.parse(stocke) : null;
  });

  async function connecter(login, motDePasse) {
    const reponse = await api.post("/auth/connexion", { login, mot_de_passe: motDePasse });
    const donnees = reponse.data;
    // § demande utilisateur : si le cabinet a activé l'OTP WhatsApp, cette
    // première étape ne renvoie PAS de jeton final — juste une confirmation
    // qu'un code a été envoyé, à valider via verifierOtp().
    if (donnees.otp_requis) return donnees;
    localStorage.setItem("sawali_jeton", donnees.access_token);
    localStorage.setItem("sawali_utilisateur", JSON.stringify(donnees));
    setUtilisateur(donnees);
    return donnees;
  }

  async function verifierOtp(jetonSessionOtp, code) {
    const reponse = await api.post("/auth/verifier-otp", { jeton_session_otp: jetonSessionOtp, code });
    const donnees = reponse.data;
    localStorage.setItem("sawali_jeton", donnees.access_token);
    localStorage.setItem("sawali_utilisateur", JSON.stringify(donnees));
    setUtilisateur(donnees);
    return donnees;
  }

  function deconnecter() {
    localStorage.removeItem("sawali_jeton");
    localStorage.removeItem("sawali_utilisateur");
    setUtilisateur(null);
  }

  return (
    <ContexteAuth.Provider value={{ utilisateur, connecter, verifierOtp, deconnecter }}>
      {children}
    </ContexteAuth.Provider>
  );
}

export function useAuth() {
  const contexte = useContext(ContexteAuth);
  if (!contexte) throw new Error("useAuth doit être utilisé à l'intérieur de <FournisseurAuth>");
  return contexte;
}
