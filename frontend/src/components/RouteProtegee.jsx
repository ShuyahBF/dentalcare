// components/RouteProtegee.jsx
// --------------------------------
// Redirige vers /connexion si non connecté, ou affiche un message d'accès
// refusé si le rôle de l'utilisateur ne fait pas partie de "rolesAutorises".
// L'Administrateur a toujours accès à tout (cohérent avec le contrôle côté
// serveur dans app/core/dependances.py).

import { Navigate } from "react-router-dom";
import { useAuth } from "../utils/authContexte";

export default function RouteProtegee({ rolesAutorises, children }) {
  const { utilisateur } = useAuth();

  if (!utilisateur) {
    return <Navigate to="/connexion" replace />;
  }

  const estAutorise = utilisateur.role === "Administrateur" || rolesAutorises.includes(utilisateur.role);
  if (!estAutorise) {
    return (
      <div className="carte" style={{ margin: 40 }}>
        <h2>Accès refusé</h2>
        <p>Votre rôle ({utilisateur.role}) n'a pas accès à cette page.</p>
      </div>
    );
  }

  return children;
}
