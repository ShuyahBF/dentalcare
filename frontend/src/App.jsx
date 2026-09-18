// App.jsx
// ---------
// Assemble le routage de toute l'application : page de connexion publique,
// puis une mise en page avec sidebar pour les 5 interfaces par rôle,
// chacune protégée par RouteProtegee.

import { Routes, Route, Navigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { useAuth } from "./utils/authContexte";
import { appliquerTheme } from "./utils/appliquerTheme";
import api from "./utils/api";
import Sidebar from "./components/Sidebar";
import RouteProtegee from "./components/RouteProtegee";

import Connexion from "./pages/Connexion";
import Caisse from "./pages/Caisse";
import Dentiste from "./pages/Dentiste";
import Secretariat from "./pages/Secretariat";
import Comptable from "./pages/Comptable";
import Admin from "./pages/Admin";
import Plateforme from "./pages/Plateforme";
import Messagerie from "./pages/Messagerie";
import PlanningDentiste from "./pages/PlanningDentiste";
import VidalFicheProduit from "./pages/VidalFicheProduit";
import VidalPosologie from "./pages/VidalPosologie";
import VidalSecurisation from "./pages/VidalSecurisation";

function MiseEnPageInterne({ children }) {
  // Sidebar repliée par défaut : sur desktop la CSS l'affiche toujours
  // (voir styles/global.css), donc cet état ne change que le comportement
  // mobile (tiroir coulissant, bouton menu en haut à gauche).
  const [menuOuvert, setMenuOuvert] = useState(false);

  return (
    <div className="app-mise-en-page">
      <button className="bouton-menu-mobile" onClick={() => setMenuOuvert(true)} aria-label="Ouvrir le menu">
        ☰
      </button>
      <div className={`fond-assombri-mobile${menuOuvert ? " visible" : ""}`} onClick={() => setMenuOuvert(false)} />
      <Sidebar ouverte={menuOuvert} onFermer={() => setMenuOuvert(false)} />
      <main className="contenu-principal">{children}</main>
    </div>
  );
}

export default function App() {
  const { utilisateur } = useAuth();

  // § demande utilisateur : applique le thème/mode d'affichage DU CABINET de
  // l'utilisateur connecté, dès qu'on le connaît — pas pour le super-admin,
  // qui n'a pas de cabinet propre (reste sur le thème SAWALI par défaut).
  useEffect(() => {
    if (!utilisateur || utilisateur.est_super_admin) return;
    api.get("/cabinet").then((r) => appliquerTheme(r.data)).catch(() => {});
  }, [utilisateur]);

  return (
    <Routes>
      <Route path="/connexion" element={<Connexion />} />

      <Route path="/caisse" element={
        <RouteProtegee rolesAutorises={["Caissier"]}>
          <MiseEnPageInterne><Caisse /></MiseEnPageInterne>
        </RouteProtegee>
      } />

      <Route path="/dentiste" element={
        <RouteProtegee rolesAutorises={["Dentiste"]}>
          <MiseEnPageInterne><Dentiste /></MiseEnPageInterne>
        </RouteProtegee>
      } />

      <Route path="/dentiste/rendez-vous" element={
        <RouteProtegee rolesAutorises={["Dentiste"]}>
          <MiseEnPageInterne><PlanningDentiste /></MiseEnPageInterne>
        </RouteProtegee>
      } />

      <Route path="/dentiste/vidal-fiche" element={
        <RouteProtegee rolesAutorises={["Dentiste"]}>
          <MiseEnPageInterne><VidalFicheProduit /></MiseEnPageInterne>
        </RouteProtegee>
      } />

      <Route path="/dentiste/vidal-posologie" element={
        <RouteProtegee rolesAutorises={["Dentiste"]}>
          <MiseEnPageInterne><VidalPosologie /></MiseEnPageInterne>
        </RouteProtegee>
      } />

      <Route path="/dentiste/vidal-securisation" element={
        <RouteProtegee rolesAutorises={["Dentiste"]}>
          <MiseEnPageInterne><VidalSecurisation /></MiseEnPageInterne>
        </RouteProtegee>
      } />

      <Route path="/secretariat" element={
        <RouteProtegee rolesAutorises={["Secrétariat Cabinet"]}>
          <MiseEnPageInterne><Secretariat /></MiseEnPageInterne>
        </RouteProtegee>
      } />

      <Route path="/comptable" element={
        <RouteProtegee rolesAutorises={["Comptable"]}>
          <MiseEnPageInterne><Comptable /></MiseEnPageInterne>
        </RouteProtegee>
      } />

      <Route path="/admin" element={
        <RouteProtegee rolesAutorises={["Administrateur"]}>
          <MiseEnPageInterne><Admin /></MiseEnPageInterne>
        </RouteProtegee>
      } />

      <Route path="/messagerie" element={
        <RouteProtegee rolesAutorises={["Administrateur", "Secrétariat Cabinet"]}>
          <MiseEnPageInterne><Messagerie /></MiseEnPageInterne>
        </RouteProtegee>
      } />

      <Route path="/plateforme" element={
        <RouteProtegee reserveSuperAdmin>
          <MiseEnPageInterne><Plateforme /></MiseEnPageInterne>
        </RouteProtegee>
      } />

      <Route path="/" element={
        utilisateur ? <Navigate to={utilisateur.est_super_admin ? "/plateforme" : `/${cheminParRole(utilisateur.role)}`} replace /> : <Navigate to="/connexion" replace />
      } />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function cheminParRole(role) {
  const table = {
    Caissier: "caisse",
    "Secrétariat Cabinet": "secretariat",
    Dentiste: "dentiste",
    Comptable: "comptable",
    Administrateur: "admin",
  };
  return table[role] || "connexion";
}
