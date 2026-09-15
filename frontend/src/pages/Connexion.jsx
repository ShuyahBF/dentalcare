// pages/Connexion.jsx
// -----------------------
// Page de connexion. Le fauteuil dentaire s'anime à l'ouverture du site
// (légère rotation/apparition progressive + effet lumineux bleu clignotant
// sur les écrans du fauteuil), comme demandé au §7.

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../utils/authContexte";

const CHEMIN_PAR_ROLE = {
  Caissier: "/caisse",
  "Secrétariat Cabinet": "/secretariat",
  Dentiste: "/dentiste",
  Comptable: "/comptable",
  Administrateur: "/admin",
};

export default function Connexion() {
  const [login, setLogin] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [erreur, setErreur] = useState("");
  const [enCours, setEnCours] = useState(false);
  const { connecter } = useAuth();
  const navigate = useNavigate();

  async function gererSoumission(e) {
    e.preventDefault();
    setErreur("");
    setEnCours(true);
    try {
      const donnees = await connecter(login, motDePasse);
      navigate(CHEMIN_PAR_ROLE[donnees.role] || "/");
    } catch (err) {
      setErreur(err.response?.data?.detail || "Connexion impossible. Vérifiez vos identifiants.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "radial-gradient(circle at 30% 20%, #eaf1fd 0%, #f4f6fb 60%)",
        padding: 24,
      }}
    >
      <style>{`
        @keyframes apparitionFauteuil {
          from { opacity: 0; transform: translateY(20px) rotate(-4deg) scale(0.92); }
          to   { opacity: 1; transform: translateY(0) rotate(0deg) scale(1); }
        }
        @keyframes lueurBleue {
          0%, 100% { filter: drop-shadow(0 0 6px rgba(79, 195, 247, 0.35)); }
          50%      { filter: drop-shadow(0 0 22px rgba(79, 195, 247, 0.85)); }
        }
        .fauteuil-anime {
          animation: apparitionFauteuil 1.1s ease-out both, lueurBleue 2.6s ease-in-out 1.1s infinite;
        }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", gap: 48, flexWrap: "wrap", maxWidth: 900 }}>
        <img
          src="/images/fauteuil-hero.png"
          alt="Fauteuil dentaire SAWALI DentalCare"
          className="fauteuil-anime"
          style={{ width: 340, maxWidth: "90vw" }}
        />

        <form onSubmit={gererSoumission} className="carte" style={{ width: 340, maxWidth: "90vw" }}>
          <div style={{ textAlign: "center", marginBottom: 18 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: "var(--sawali-bleu)" }}>SAWALI DentalCare</div>
            <div style={{ fontSize: 13, color: "var(--sawali-gris-fonce)" }}>Gestion de cabinet dentaire</div>
          </div>

          <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, display: "block" }}>Login</label>
          <input className="champ-saisie" value={login} onChange={(e) => setLogin(e.target.value)} autoFocus required />

          <label style={{ fontSize: 13, fontWeight: 600, margin: "12px 0 4px", display: "block" }}>Mot de passe</label>
          <input className="champ-saisie" type="password" value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} required />

          {erreur && <div style={{ color: "var(--sawali-rouge)", fontSize: 13, marginTop: 10 }}>{erreur}</div>}

          <button type="submit" className="bouton-primaire" style={{ width: "100%", marginTop: 18 }} disabled={enCours}>
            {enCours ? "Connexion..." : "Se connecter"}
          </button>
        </form>
      </div>
    </div>
  );
}
