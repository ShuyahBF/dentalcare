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

import { useState, useEffect } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { Wallet, Calendar, Users, Smile, Link2, Pill, AlertTriangle, BarChart3, Settings, Building2 } from "lucide-react";
import { useAuth } from "../utils/authContexte";
import api from "../utils/api";

// § correction n°1 ("interfaces stylées, icônes plus claires") — icônes
// lucide-react (vraies icônes SVG, comme Site-SawaliSmartSystems) à la
// place des emoji utilisés jusqu'ici. Aucune icône "dent" n'existe dans
// lucide-react (vérifié) : Smile (sourire) est le choix le plus proche
// pour "Dossier Patients" dans un cabinet dentaire.
const LIENS_PAR_ROLE = {
  Caissier: [{ chemin: "/caisse", libelle: "Caisse", Icone: Wallet }],
  "Secrétariat Cabinet": [
    { chemin: "/secretariat", libelle: "Rendez-vous", Icone: Calendar },
    { chemin: "/messagerie", libelle: "Centre de Messagerie", Icone: Users },
  ],
  Dentiste: [
    { chemin: "/dentiste", libelle: "Dossier Patients", Icone: Smile },
    { chemin: "/dentiste/rendez-vous", libelle: "Rendez-vous", Icone: Calendar },
    { chemin: "/dentiste/vidal-fiche", libelle: "Fiche Produit VIDAL", Icone: Link2 },
    { chemin: "/dentiste/vidal-posologie", libelle: "Posologie", Icone: Pill },
    { chemin: "/dentiste/vidal-securisation", libelle: "Sécurisation", Icone: AlertTriangle },
  ],
  Comptable: [{ chemin: "/comptable", libelle: "Encaissements", Icone: BarChart3 }],
  Administrateur: [
    { chemin: "/caisse", libelle: "Caisse", Icone: Wallet },
    { chemin: "/secretariat", libelle: "Rendez-vous", Icone: Calendar },
    { chemin: "/dentiste", libelle: "Dossier Patients", Icone: Smile },
    { chemin: "/comptable", libelle: "Encaissements", Icone: BarChart3 },
    { chemin: "/messagerie", libelle: "Centre de Messagerie", Icone: Users },
    { chemin: "/admin", libelle: "Administration", Icone: Settings },
  ],
};

export default function Sidebar({ ouverte = true, onFermer = () => {} }) {
  const { utilisateur, deconnecter } = useAuth();
  const navigate = useNavigate();
  const liens = utilisateur?.est_super_admin
    ? [{ chemin: "/plateforme", libelle: "Cabinets clients", Icone: Building2 }]
    : LIENS_PAR_ROLE[utilisateur?.role] || [];
  // Nom du CABINET du praticien connecté (§ demande utilisateur — le
  // fauteuil dentaire ci-dessous reste le logo de la PLATEFORME SAWALI
  // DentalCare ; cette ligne affiche la description du cabinet de travail
  // de l'utilisateur, distincte du logo plateforme). N/A pour un super-admin
  // plateforme, qui n'a de cabinet nulle part.
  const [nomCabinet, setNomCabinet] = useState("");

  useEffect(() => {
    if (utilisateur && !utilisateur.est_super_admin) {
      api.get("/cabinet").then((r) => setNomCabinet(r.data.denomination)).catch(() => {});
    }
  }, [utilisateur]);

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
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <img src="/images/fauteuil-mini.png" alt="Fauteuil dentaire SAWALI" style={{ width: 44, height: 44, objectFit: "contain" }} />
        <div>
          <div style={{ fontFamily: "var(--police-titre)", fontWeight: 700, color: "var(--sawali-bleu)", fontSize: 15, lineHeight: 1.1 }}>SAWALI</div>
          <div style={{ fontSize: 11, color: "var(--sawali-gris-fonce)" }}>DentalCare</div>
        </div>
      </div>
      {(nomCabinet || utilisateur?.est_super_admin) && (
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--sawali-gris-fonce)", background: "var(--sawali-gris-clair)", borderRadius: 8, padding: "6px 10px", marginBottom: 20, lineHeight: 1.3 }}>
          {utilisateur?.est_super_admin ? "Administration plateforme" : nomCabinet}
        </div>
      )}

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
            <span style={{ display: "flex", alignItems: "center" }} aria-hidden="true"><lien.Icone size={17} strokeWidth={2.1} /></span>
            {lien.libelle}
          </NavLink>
        ))}
      </nav>

      <div style={{ borderTop: "1px solid #eef2fa", paddingTop: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{utilisateur?.nom_complet || utilisateur?.login}</div>
        <div style={{ fontSize: 11, color: "var(--sawali-gris)" }}>{utilisateur?.role}</div>
        {/* § demande utilisateur : date/heure de dernière connexion de
            l'utilisateur connecté. C'est la connexion PRÉCÉDENTE (avant la
            session en cours) — capturée par le serveur juste avant que
            cette session n'écrase la valeur, sinon elle afficherait
            toujours "maintenant" pendant toute la session, ce qui serait
            inutile. Absente à la toute première connexion d'un compte. */}
        {utilisateur?.derniere_connexion_precedente && (
          <div style={{ fontSize: 10.5, color: "var(--sawali-gris)", marginTop: 3 }}>
            Dernière connexion : {new Date(utilisateur.derniere_connexion_precedente).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
          </div>
        )}
        <button className="bouton-secondaire" style={{ marginTop: 10, width: "100%", fontSize: 13 }} onClick={handleDeconnexion}>
          Déconnexion
        </button>
      </div>
    </aside>
  );
}
