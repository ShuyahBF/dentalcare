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
  const [enErreur, setEnErreur] = useState(false);
  const [messageStatut, setMessageStatut] = useState("");

  function charger() {
    setEnErreur(false);
    api.get("/cabinet").then((r) => setCabinet(r.data)).catch(() => setEnErreur(true));
  }
  useEffect(charger, []);

  async function enregistrer() {
    await api.put("/cabinet", cabinet);
    setMessageStatut("Fiche cabinet enregistrée.");
    setTimeout(() => setMessageStatut(""), 3000);
  }

  if (enErreur) {
    return (
      <div className="carte" style={{ color: "var(--sawali-rouge)" }}>
        Impossible de charger la fiche cabinet (le service met parfois jusqu'à une minute à se
        réveiller après une période d'inactivité).
        <button className="bouton-secondaire" style={{ display: "block", marginTop: 10 }} onClick={charger}>Réessayer</button>
      </div>
    );
  }
  if (!cabinet) return <div className="carte" style={{ color: "var(--sawali-gris)" }}>Chargement...</div>;
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
  const [catalogue, setCatalogue] = useState(null);
  const [enErreur, setEnErreur] = useState(false);
  const [recherche, setRecherche] = useState("");

  function charger() {
    setEnErreur(false);
    api.get("/produits", { params: { recherche } }).then((r) => setCatalogue(r.data)).catch(() => setEnErreur(true));
  }
  useEffect(charger, [recherche]);

  return (
    <div className="carte">
      <input className="champ-saisie" placeholder="Rechercher un acte..." value={recherche} onChange={(e) => setRecherche(e.target.value)} style={{ marginBottom: 12, maxWidth: 340 }} />

      {enErreur && (
        <div style={{ color: "var(--sawali-rouge)", marginBottom: 12 }}>
          Impossible de charger le catalogue (le service met parfois jusqu'à une minute à se réveiller après une période d'inactivité).
          <button className="bouton-secondaire" style={{ display: "block", marginTop: 10 }} onClick={charger}>Réessayer</button>
        </div>
      )}
      {catalogue === null && !enErreur && <div style={{ color: "var(--sawali-gris)" }}>Chargement...</div>}

      {catalogue && (
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
      )}
    </div>
  );
}

function OngletSuggestions() {
  const [suggestions, setSuggestions] = useState([]);
  const [enCoursSync, setEnCoursSync] = useState(false);
  const [messageStatut, setMessageStatut] = useState("");

  function charger() { api.get("/admin/suggestions-history").then((r) => setSuggestions(r.data)); }
  useEffect(charger, []);

  async function resynchroniser() {
    setEnCoursSync(true);
    try {
      const r = await api.post("/admin/suggestions-history/resynchroniser");
      setMessageStatut(`${r.data.nombre_entrees} entrée(s) synchronisée(s) depuis SUGGESTION.MD.`);
      charger();
    } finally {
      setEnCoursSync(false);
      setTimeout(() => setMessageStatut(""), 4000);
    }
  }

  const COULEUR_STATUT = {
    "Implémentée": "badge-vert",
    "En cours": "badge-orange",
    "Proposée": "badge-bleu",
    "Rejetée": "badge-rouge",
  };

  return (
    <div>
      <div className="carte" style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontWeight: 700 }}>Historique des suggestions et évolutions</div>
          <div style={{ fontSize: 13, color: "var(--sawali-gris-fonce)" }}>Source : SUGGESTION.MD, versionné avec le code du dépôt sawali-dentalcare.</div>
        </div>
        <button className="bouton-secondaire" onClick={resynchroniser} disabled={enCoursSync}>
          {enCoursSync ? "Synchronisation..." : "Resynchroniser depuis SUGGESTION.MD"}
        </button>
      </div>
      {messageStatut && <div style={{ color: "var(--sawali-vert)", fontSize: 13, marginBottom: 12 }}>{messageStatut}</div>}

      {suggestions.length === 0 && (
        <div className="carte" style={{ color: "var(--sawali-gris)" }}>
          Aucune entrée en base pour l'instant — cliquez sur « Resynchroniser » pour charger le contenu de SUGGESTION.MD.
        </div>
      )}

      {suggestions.map((s) => (
        <div key={s.numero_enreg} className="carte" style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <div style={{ fontWeight: 700 }}>{s.titre}</div>
            <span className={`badge ${COULEUR_STATUT[s.statut] || "badge-bleu"}`}>{s.statut}</span>
          </div>
          <div style={{ fontSize: 12, color: "var(--sawali-gris)", marginBottom: 8 }}>{s.date_entree}</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "var(--sawali-gris-fonce)" }}>
            {s.details.map((detail, i) => <li key={i}>{detail}</li>)}
          </ul>
        </div>
      ))}
    </div>
  );
}
