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
  const [motDePasseVisible, setMotDePasseVisible] = useState(false);
  const [erreur, setErreur] = useState("");
  const [enCours, setEnCours] = useState(false);
  // § demande utilisateur — étape 2 : code OTP WhatsApp, si le cabinet l'a activé.
  const [etapeOtp, setEtapeOtp] = useState(null); // null | { jetonSessionOtp, otpEnvoye }
  const [codeOtp, setCodeOtp] = useState("");
  const { connecter, verifierOtp } = useAuth();
  const navigate = useNavigate();

  function seConnecter(donnees) {
    navigate(CHEMIN_PAR_ROLE[donnees.role] || (donnees.est_super_admin ? "/plateforme" : "/"));
  }

  async function gererSoumission(e) {
    e.preventDefault();
    setErreur("");
    setEnCours(true);
    try {
      const donnees = await connecter(login, motDePasse);
      if (donnees.otp_requis) {
        setEtapeOtp({ jetonSessionOtp: donnees.jeton_session_otp, otpEnvoye: donnees.otp_envoye });
      } else {
        seConnecter(donnees);
      }
    } catch (err) {
      setErreur(err.response?.data?.detail || "Connexion impossible. Vérifiez vos identifiants.");
    } finally {
      setEnCours(false);
    }
  }

  async function gererValidationOtp(e) {
    e.preventDefault();
    setErreur("");
    setEnCours(true);
    try {
      const donnees = await verifierOtp(etapeOtp.jetonSessionOtp, codeOtp.trim());
      seConnecter(donnees);
    } catch (err) {
      setErreur(err.response?.data?.detail || "Code incorrect.");
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

        <form onSubmit={etapeOtp ? gererValidationOtp : gererSoumission} className="carte" style={{ width: 340, maxWidth: "90vw" }}>
          <div style={{ textAlign: "center", marginBottom: 18 }}>
            <div style={{ fontFamily: "var(--police-titre)", fontSize: 23, fontWeight: 800, letterSpacing: "-0.01em", color: "var(--sawali-bleu)" }}>SAWALI DentalCare</div>
            <div style={{ fontSize: 13, color: "var(--sawali-gris-fonce)" }}>Gestion de cabinet dentaire</div>
          </div>

          {!etapeOtp ? (
            <>
              <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, display: "block" }}>Login</label>
              <input className="champ-saisie" value={login} onChange={(e) => setLogin(e.target.value)} autoFocus required />

              <label style={{ fontSize: 13, fontWeight: 600, margin: "12px 0 4px", display: "block" }}>Mot de passe</label>
              <div style={{ position: "relative" }}>
                <input
                  className="champ-saisie"
                  type={motDePasseVisible ? "text" : "password"}
                  value={motDePasse}
                  onChange={(e) => setMotDePasse(e.target.value)}
                  style={{ paddingRight: 38 }}
                  required
                />
                <button
                  type="button"
                  onClick={() => setMotDePasseVisible((v) => !v)}
                  title={motDePasseVisible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                  style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", border: "none", background: "none", cursor: "pointer", fontSize: 16, padding: 4, lineHeight: 1 }}
                >
                  {motDePasseVisible ? "🙈" : "👁️"}
                </button>
              </div>
            </>
          ) : (
            <>
              <div style={{ textAlign: "center", marginBottom: 14 }}>
                <div style={{ fontSize: 30 }}>💬🔐</div>
                <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4 }}>Code envoyé par WhatsApp</div>
                <div style={{ fontSize: 12, color: "var(--sawali-gris-fonce)", marginTop: 2 }}>
                  {etapeOtp.otpEnvoye
                    ? "Saisissez le code à 6 chiffres reçu sur votre WhatsApp."
                    : "⚠️ L'envoi WhatsApp a peut-être échoué — vérifiez votre téléphone ou contactez votre Administrateur."}
                </div>
              </div>
              <input
                className="champ-saisie"
                value={codeOtp}
                onChange={(e) => setCodeOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="• • • • • •"
                inputMode="numeric"
                style={{ textAlign: "center", fontSize: 22, letterSpacing: 6, fontWeight: 700 }}
                autoFocus
                required
              />
              <button
                type="button"
                onClick={() => { setEtapeOtp(null); setCodeOtp(""); setErreur(""); }}
                style={{ border: "none", background: "none", color: "var(--sawali-bleu)", fontSize: 12.5, cursor: "pointer", marginTop: 10 }}
              >
                ← Revenir à la connexion
              </button>
            </>
          )}

          {erreur && <div style={{ color: "var(--sawali-rouge)", fontSize: 13, marginTop: 10 }}>{erreur}</div>}

          <button type="submit" className="bouton-primaire" style={{ width: "100%", marginTop: 18 }} disabled={enCours}>
            {enCours ? "Connexion..." : etapeOtp ? "Valider le code" : "Se connecter"}
          </button>
        </form>
      </div>
    </div>
  );
}
