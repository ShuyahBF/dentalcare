// components/Sidebar.jsx
// --------------------------
// Sidebar affichée sur toutes les pages internes : miniature du fauteuil
// dentaire à côté du logo du cabinet (§7 du cahier des charges), puis les
// liens de navigation propres au rôle connecté.
//
// Sur mobile (<=768px, voir styles/global.css), la sidebar devient un tiroir
// coulissant piloté par les props "ouverte"/"onFermer" (gérées par le
// composant parent MiseEnPageInterne dans App.jsx) : repliée par défaut pour
// libérer l'écran, elle se ferme automatiquement après un clic sur un lien.

import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../utils/authContexte";

const LIENS_PAR_ROLE = {
  Caissier: [{ chemin: "/caisse", libelle: "Caisse", icone: "💰" }],
  "Secrétariat Cabinet": [{ chemin: "/secretariat", libelle: "Rendez-vous", icone: "📅" }],
  Dentiste: [{ chemin: "/dentiste", libelle: "Dossier Patients", icone: "🦷" }],
  Comptable: [{ chemin: "/comptable", libelle: "Encaissements", icone: "📊" }],
  Administrateur: [
    { chemin: "/caisse", libelle: "Caisse", icone: "💰" },
    { chemin: "/secretariat", libelle: "Rendez-vous", icone: "📅" },
    { chemin: "/dentiste", libelle: "Dossier Patients", icone: "🦷" },
    { chemin: "/comptable", libelle: "Encaissements", icone: "📊" },
    { chemin: "/admin", libelle: "Administration", icone: "⚙️" },
  ],
};

export default function Sidebar({ ouverte = true, onFermer = () => {} }) {
  const { utilisateur, deconnecter } = useAuth();
  const navigate = useNavigate();
  const liens = LIENS_PAR_ROLE[utilisateur?.role] || [];

  function handleDeconnexion() {
    deconnecter();
    navigate("/connexion");
  }

  return (
    <aside
      className={`sidebar${ouverte ? " sidebar-ouverte" : ""}`}
      style={{
        width: 220,
        background: "var(--sawali-blanc)",
        borderRight: "1px solid #eef2fa",
        display: "flex",
        flexDirection: "column",
        padding: "20px 14px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 28 }}>
        <img src="/images/fauteuil-mini.png" alt="Fauteuil dentaire SAWALI" style={{ width: 44, height: 44, objectFit: "contain" }} />
        <div>
          <div style={{ fontFamily: "var(--police-titre)", fontWeight: 700, color: "var(--sawali-bleu)", fontSize: 15, lineHeight: 1.1 }}>SAWALI</div>
          <div style={{ fontSize: 11, color: "var(--sawali-gris-fonce)" }}>DentalCare</div>
        </div>
      </div>

      <nav style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
        {liens.map((lien) => (
          <NavLink
            key={lien.chemin}
            to={lien.chemin}
            onClick={onFermer}
            style={({ isActive }) => ({
              padding: "10px 12px",
              borderRadius: 8,
              color: isActive ? "var(--sawali-blanc)" : "var(--sawali-gris-fonce)",
              background: isActive ? "var(--sawali-bleu)" : "transparent",
              fontWeight: 600,
              fontSize: 14,
              display: "flex",
              alignItems: "center",
              gap: 10,
            })}
          >
            <span style={{ fontSize: 16 }} aria-hidden="true">{lien.icone}</span>
            {lien.libelle}
          </NavLink>
        ))}
      </nav>

      <div style={{ borderTop: "1px solid #eef2fa", paddingTop: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{utilisateur?.nom_complet || utilisateur?.login}</div>
        <div style={{ fontSize: 11, color: "var(--sawali-gris)" }}>{utilisateur?.role}</div>
        <button className="bouton-secondaire" style={{ marginTop: 10, width: "100%", fontSize: 13 }} onClick={handleDeconnexion}>
          Déconnexion
        </button>
      </div>
    </aside>
  );
}
