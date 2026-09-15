// pages/Admin.jsx
// --------------------
// Interface Administrateur (§9) : paramétrage de la fiche Cabinet, gestion
// des comptes utilisateurs (5 rôles), gestion du catalogue ProduitClinique.
// Onglet "Suggestions" en réserve pour /admin/suggestions-history (sawali-portal),
// en attente du contenu réel de SUGGESTION.MD pour finaliser son schéma.

import { useState, useEffect } from "react";
import api from "../utils/api";

const ONGLETS = ["Cabinet", "Utilisateurs", "Catalogue", "Suggestions"];

export default function Admin() {
  const [ongletActif, setOngletActif] = useState("Cabinet");

  return (
    <div>
      <div className="titre-page">Administration</div>
      <div className="sous-titre-page">Paramétrage du cabinet, comptes et catalogue</div>

      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {ONGLETS.map((o) => (
          <button
            key={o}
            className={ongletActif === o ? "bouton-primaire" : "bouton-secondaire"}
            onClick={() => setOngletActif(o)}
          >
            {o}
          </button>
        ))}
      </div>

      {ongletActif === "Cabinet" && <OngletCabinet />}
      {ongletActif === "Utilisateurs" && <OngletUtilisateurs />}
      {ongletActif === "Catalogue" && <OngletCatalogue />}
      {ongletActif === "Suggestions" && <OngletSuggestions />}
    </div>
  );
}

function OngletCabinet() {
  const [cabinet, setCabinet] = useState(null);
  const [messageStatut, setMessageStatut] = useState("");

  useEffect(() => { api.get("/cabinet").then((r) => setCabinet(r.data)); }, []);

  async function enregistrer() {
    await api.put("/cabinet", cabinet);
    setMessageStatut("Fiche cabinet enregistrée.");
    setTimeout(() => setMessageStatut(""), 3000);
  }

  if (!cabinet) return null;
  const champ = (cle, libelle) => (
    <div style={{ marginBottom: 10 }}>
      <label style={{ fontSize: 13, fontWeight: 600, display: "block" }}>{libelle}</label>
      <input className="champ-saisie" value={cabinet[cle] || ""} onChange={(e) => setCabinet({ ...cabinet, [cle]: e.target.value })} />
    </div>
  );

  return (
    <div className="carte" style={{ maxWidth: 520 }}>
      {champ("denomination", "Dénomination")}
      {champ("adresse", "Adresse")}
      {champ("telephone", "Téléphone")}
      {champ("email", "Email")}
      {champ("devise", "Devise")}
      {champ("texte_bas_de_page", "Texte de bas de page")}
      <button className="bouton-primaire" onClick={enregistrer}>Enregistrer</button>
      {messageStatut && <span style={{ marginLeft: 10, color: "var(--sawali-vert)", fontSize: 13 }}>{messageStatut}</span>}
    </div>
  );
}

function OngletUtilisateurs() {
  const [utilisateurs, setUtilisateurs] = useState([]);
  const [nouveau, setNouveau] = useState({ login: "", mot_de_passe: "", role: "Caissier", nom_complet: "" });
  const [messageStatut, setMessageStatut] = useState("");

  function charger() { api.get("/utilisateurs").then((r) => setUtilisateurs(r.data)); }
  useEffect(charger, []);

  async function creer() {
    await api.post("/utilisateurs", nouveau);
    setNouveau({ login: "", mot_de_passe: "", role: "Caissier", nom_complet: "" });
    setMessageStatut("Compte créé.");
    charger();
    setTimeout(() => setMessageStatut(""), 3000);
  }

  return (
    <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
      <div className="carte" style={{ flex: "1 1 280px" }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Nouveau compte</div>
        <input className="champ-saisie" placeholder="Login" value={nouveau.login} onChange={(e) => setNouveau({ ...nouveau, login: e.target.value })} style={{ marginBottom: 8 }} />
        <input className="champ-saisie" placeholder="Nom complet" value={nouveau.nom_complet} onChange={(e) => setNouveau({ ...nouveau, nom_complet: e.target.value })} style={{ marginBottom: 8 }} />
        <input className="champ-saisie" placeholder="Mot de passe" type="password" value={nouveau.mot_de_passe} onChange={(e) => setNouveau({ ...nouveau, mot_de_passe: e.target.value })} style={{ marginBottom: 8 }} />
        <select className="champ-saisie" value={nouveau.role} onChange={(e) => setNouveau({ ...nouveau, role: e.target.value })} style={{ marginBottom: 12 }}>
          <option>Caissier</option>
          <option>Secrétariat Cabinet</option>
          <option>Dentiste</option>
          <option>Comptable</option>
          <option>Administrateur</option>
        </select>
        <button className="bouton-primaire" onClick={creer}>Créer le compte</button>
        {messageStatut && <div style={{ color: "var(--sawali-vert)", fontSize: 13, marginTop: 8 }}>{messageStatut}</div>}
      </div>

      <div className="carte" style={{ flex: "2 1 400px" }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Comptes existants</div>
        <table className="tableau-donnees">
          <thead><tr><th>Login</th><th>Nom</th><th>Rôle</th><th>Statut</th></tr></thead>
          <tbody>
            {utilisateurs.map((u) => (
              <tr key={u.Login}>
                <td>{u.Login}</td>
                <td>{u.nom_complet}</td>
                <td><span className="badge badge-bleu">{u.role}</span></td>
                <td>{u.actif !== false ? <span className="badge badge-vert">Actif</span> : <span className="badge badge-rouge">Désactivé</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OngletCatalogue() {
  const [catalogue, setCatalogue] = useState([]);
  const [recherche, setRecherche] = useState("");

  useEffect(() => { api.get("/produits", { params: { recherche } }).then((r) => setCatalogue(r.data)); }, [recherche]);

  return (
    <div className="carte">
      <input className="champ-saisie" placeholder="Rechercher un acte..." value={recherche} onChange={(e) => setRecherche(e.target.value)} style={{ marginBottom: 12, maxWidth: 340 }} />
      <table className="tableau-donnees">
        <thead><tr><th>Code</th><th>Libellé</th><th>Domaine</th><th>Prix</th></tr></thead>
        <tbody>
          {catalogue.map((a) => (
            <tr key={a["Code Produit"]}>
              <td>{a["Code Produit"]}</td>
              <td>{a["Libellé"]}</td>
              <td><span className="badge badge-bleu">{a["Domaine"]}</span></td>
              <td>{a["Prix Public"]?.toLocaleString("fr-FR")} F</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OngletSuggestions() {
  // Placeholder en attente du contenu réel de SUGGESTION.MD (dépôt sawali-portal)
  // pour finaliser la structure exacte de suivi (cf. discussion avec l'utilisateur).
  return (
    <div className="carte">
      <div style={{ fontWeight: 700, marginBottom: 8 }}>Historique des suggestions (sawali-portal)</div>
      <p style={{ color: "var(--sawali-gris-fonce)", fontSize: 14 }}>
        Ce module affichera l'historique des suggestions et mises à jour de sawali-portal
        (SUGGESTION.MD). En attente du contenu du fichier pour finaliser la structure de
        suivi — voir avec l'administrateur système.
      </p>
    </div>
  );
}
