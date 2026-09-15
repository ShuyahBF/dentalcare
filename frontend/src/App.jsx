// App.jsx
// ---------
// Assemble le routage de toute l'application : page de connexion publique,
// puis une mise en page avec sidebar pour les 5 interfaces par rôle,
// chacune protégée par RouteProtegee.

import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./utils/authContexte";
import Sidebar from "./components/Sidebar";
import RouteProtegee from "./components/RouteProtegee";

import Connexion from "./pages/Connexion";
import Caisse from "./pages/Caisse";
import Dentiste from "./pages/Dentiste";
import Secretariat from "./pages/Secretariat";
import Comptable from "./pages/Comptable";
import Admin from "./pages/Admin";

function MiseEnPageInterne({ children }) {
  return (
    <div className="app-mise-en-page">
      <Sidebar />
      <main className="contenu-principal">{children}</main>
    </div>
  );
}

export default function App() {
  const { utilisateur } = useAuth();

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

      <Route path="/" element={
        utilisateur ? <Navigate to={`/${cheminParRole(utilisateur.role)}`} replace /> : <Navigate to="/connexion" replace />
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
