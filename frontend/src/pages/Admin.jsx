// pages/Admin.jsx
// --------------------
// Interface Administrateur (§9) : paramétrage de la fiche Cabinet, gestion
// des comptes utilisateurs (5 rôles), gestion du catalogue ProduitClinique.
// Onglet "Suggestions" en réserve pour /admin/suggestions-history (sawali-portal),
// en attente du contenu réel de SUGGESTION.MD pour finaliser son schéma.

import { useState, useEffect } from "react";
import api from "../utils/api";

const ONGLETS = ["Cabinet", "Utilisateurs", "Médecins", "Catalogue", "Assurances", "Paiements", "Suggestions"];

export default function Admin() {
  const [ongletActif, setOngletActif] = useState("Cabinet");

  return (
    <div>
      <div className="titre-page">Administration</div>
      <div className="sous-titre-page">Paramétrage du cabinet, comptes et catalogue</div>

      <PanneauDiagnostic module={ongletActif} />

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
      {ongletActif === "Médecins" && <OngletMedecins />}
      {ongletActif === "Catalogue" && <OngletCatalogue />}
      {ongletActif === "Assurances" && <OngletAssurances />}
      {ongletActif === "Paiements" && <OngletPaiements />}
      {ongletActif === "Suggestions" && <OngletSuggestions />}
    </div>
  );
}

function PanneauDiagnostic({ module }) {
  const [ouvert, setOuvert] = useState(false);
  const [diagnostic, setDiagnostic] = useState(null);
  const [enErreur, setEnErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);

  async function lancerDiagnostic() {
    setEnCours(true);
    setEnErreur(null);
    try {
      const r = await api.get("/admin/diagnostic", { params: { module } });
      setDiagnostic(r.data);
    } catch (err) {
      setEnErreur(err.response?.data?.detail || err.message || "Requête de diagnostic échouée.");
    } finally {
      setEnCours(false);
    }
  }

  // Si le panneau est ouvert et qu'on change d'onglet, relance automatiquement
  // le diagnostic pour rester cohérent avec le module affiché.
  useEffect(() => {
    if (ouvert) lancerDiagnostic();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [module]);

  return (
    <div className="carte" style={{ marginBottom: 20, borderLeft: "4px solid var(--sawali-orange)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontWeight: 700 }}>Diagnostic base de données — module « {module} »</div>
          <div style={{ fontSize: 13, color: "var(--sawali-gris-fonce)" }}>
            Exécute en direct la requête MongoDB propre au module affiché et montre son résultat brut.
          </div>
        </div>
        <button className="bouton-secondaire" onClick={() => { setOuvert(!ouvert); if (!ouvert) lancerDiagnostic(); }}>
          {ouvert ? "Masquer" : "Lancer le diagnostic"}
        </button>
      </div>

      {ouvert && (
        <div style={{ marginTop: 14 }}>
          <button className="bouton-secondaire" style={{ fontSize: 12, padding: "4px 10px", marginBottom: 10 }} onClick={lancerDiagnostic} disabled={enCours}>
            {enCours ? "Exécution..." : "Relancer"}
          </button>

          {enErreur && (
            <div style={{ color: "var(--sawali-rouge)", fontSize: 13, marginBottom: 10 }}>
              La requête de diagnostic elle-même a échoué : {enErreur}
              <br />→ ceci indique un problème réseau/CORS entre le navigateur et le backend, indépendant de MongoDB.
            </div>
          )}

          {diagnostic && (
            <>
              <div style={{ fontSize: 13, marginBottom: 10 }}>
                Base de données ciblée par le backend : <strong>{diagnostic.base_de_donnees_ciblee}</strong>
              </div>
              {diagnostic.resultats.map((r) => (
                <div key={r.collection} style={{ marginBottom: 14, paddingBottom: 14, borderBottom: "1px solid #f0f2f7" }}>
                  <div style={{ fontFamily: "monospace", fontSize: 13, background: "#f4f6fb", padding: "6px 10px", borderRadius: 6, marginBottom: 6 }}>
                    {r.requete_mongo}
                  </div>
                  {r.erreur ? (
                    <div style={{ color: "var(--sawali-rouge)", fontSize: 13 }}>Erreur : {r.erreur}</div>
                  ) : (
                    <>
                      <div style={{ fontSize: 13, marginBottom: 4 }}>
                        Résultat : <strong>{r.nombre_documents} document(s)</strong> trouvé(s).
                      </div>
                      {r.echantillon && (
                        <pre style={{ fontSize: 11, background: "#f4f6fb", padding: 10, borderRadius: 6, overflowX: "auto", margin: 0 }}>
                          {JSON.stringify(r.echantillon, null, 2)}
                        </pre>
                      )}
                    </>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function OngletCabinet() {
  const [cabinet, setCabinet] = useState(null);
  const [medecins, setMedecins] = useState([]);
  const [enErreur, setEnErreur] = useState(false);
  const [messageStatut, setMessageStatut] = useState("");

  function charger() {
    setEnErreur(false);
    api.get("/cabinet").then((r) => setCabinet(r.data)).catch(() => setEnErreur(true));
    api.get("/medecins").then((r) => setMedecins(r.data));
  }
  useEffect(charger, []);

  async function enregistrer() {
    await api.put("/cabinet", cabinet);
    setMessageStatut("Fiche cabinet enregistrée.");
    setTimeout(() => setMessageStatut(""), 3000);
  }

  function basculerMembreEquipe(numeroEnreg) {
    const equipe = cabinet.equipe_dentistes || [];
    const dejaPresent = equipe.includes(numeroEnreg);
    setCabinet({ ...cabinet, equipe_dentistes: dejaPresent ? equipe.filter((n) => n !== numeroEnreg) : [...equipe, numeroEnreg] });
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

      <div style={{ marginBottom: 10 }}>
        <label style={{ fontSize: 13, fontWeight: 600, display: "block" }}>Dentiste principal</label>
        {medecins.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--sawali-gris)" }}>Aucun dentiste enregistré — ajoutez-en un dans l'onglet Médecins.</div>
        ) : (
          <select
            className="champ-saisie"
            value={cabinet.dentiste_principal_numero_enreg || ""}
            onChange={(e) => setCabinet({ ...cabinet, dentiste_principal_numero_enreg: e.target.value ? Number(e.target.value) : null })}
          >
            <option value="">— Non défini —</option>
            {medecins.map((m) => (
              <option key={m.Numéro_Enreg} value={m.Numéro_Enreg}>{m.Titre} {m.Nom} {m.Prénoms}</option>
            ))}
          </select>
        )}
      </div>

      {medecins.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>Autres dentistes de l'équipe</label>
          {medecins.filter((m) => m.Numéro_Enreg !== cabinet.dentiste_principal_numero_enreg).map((m) => (
            <label key={m.Numéro_Enreg} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "2px 0" }}>
              <input
                type="checkbox"
                checked={(cabinet.equipe_dentistes || []).includes(m.Numéro_Enreg)}
                onChange={() => basculerMembreEquipe(m.Numéro_Enreg)}
              />
              {m.Titre} {m.Nom} {m.Prénoms}
            </label>
          ))}
        </div>
      )}

      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>Numérotation du schéma dentaire</label>
        <div style={{ fontSize: 12, color: "var(--sawali-gris-fonce)", marginBottom: 6 }}>
          Dépend de l'école de formation du dentiste. Les deux références restent de toute façon toujours enregistrées sur chaque ligne de reçu.
        </div>
        <select
          className="champ-saisie"
          value={cabinet.numerotation_dentaire || "internationale"}
          onChange={(e) => setCabinet({ ...cabinet, numerotation_dentaire: e.target.value })}
        >
          <option value="internationale">Internationale (FDI — ex: 46)</option>
          <option value="universelle">Universelle (1 à 32 — ex: 30)</option>
        </select>
      </div>

      <button className="bouton-primaire" onClick={enregistrer}>Enregistrer</button>
      {messageStatut && <span style={{ marginLeft: 10, color: "var(--sawali-vert)", fontSize: 13 }}>{messageStatut}</span>}
    </div>
  );
}

function OngletUtilisateurs() {
  const [utilisateurs, setUtilisateurs] = useState([]);
  const [nouveau, setNouveau] = useState({ login: "", mot_de_passe: "", role: "Caissier", nom_complet: "" });
  const [messageStatut, setMessageStatut] = useState("");
  const [loginEnEdition, setLoginEnEdition] = useState(null);
  const [edition, setEdition] = useState({ nom_complet: "", role: "" });

  function charger() { api.get("/utilisateurs").then((r) => setUtilisateurs(r.data)); }
  useEffect(charger, []);

  async function creer() {
    await api.post("/utilisateurs", nouveau);
    setNouveau({ login: "", mot_de_passe: "", role: "Caissier", nom_complet: "" });
    setMessageStatut("Compte créé.");
    charger();
    setTimeout(() => setMessageStatut(""), 3000);
  }

  function commencerEdition(u) {
    setLoginEnEdition(u.Login);
    setEdition({ nom_complet: u.nom_complet || "", role: u.role });
  }

  async function enregistrerEdition(login) {
    await api.put(`/utilisateurs/${login}`, edition);
    setLoginEnEdition(null);
    charger();
  }

  async function basculerActif(u) {
    await api.put(`/utilisateurs/${u.Login}/statut`, null, { params: { actif: u.actif === false } });
    charger();
  }

  async function supprimer(login) {
    if (!window.confirm(`Supprimer définitivement le compte « ${login} » ? Cette action est irréversible.`)) return;
    try {
      await api.delete(`/utilisateurs/${login}`);
      charger();
    } catch (err) {
      alert(err.response?.data?.detail || "Suppression impossible.");
    }
  }

  return (
    <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
      <div className="carte" style={{ flex: "1 1 280px", minWidth: 0 }}>
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

      <div className="carte" style={{ flex: "2 1 400px", minWidth: 0, overflowX: "auto" }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Comptes existants</div>
        <table className="tableau-donnees" style={{ minWidth: 560 }}>
          <thead><tr><th>Login</th><th>Nom</th><th>Rôle</th><th>Statut</th><th>Actions</th></tr></thead>
          <tbody>
            {utilisateurs.map((u) => (
              <tr key={u.Login}>
                <td>{u.Login}</td>
                {loginEnEdition === u.Login ? (
                  <>
                    <td><input className="champ-saisie" style={{ fontSize: 13, padding: "4px 8px" }} value={edition.nom_complet} onChange={(e) => setEdition({ ...edition, nom_complet: e.target.value })} /></td>
                    <td>
                      <select className="champ-saisie" style={{ fontSize: 13, padding: "4px 8px" }} value={edition.role} onChange={(e) => setEdition({ ...edition, role: e.target.value })}>
                        <option>Caissier</option>
                        <option>Secrétariat Cabinet</option>
                        <option>Dentiste</option>
                        <option>Comptable</option>
                        <option>Administrateur</option>
                      </select>
                    </td>
                    <td>{u.actif !== false ? <span className="badge badge-vert">Actif</span> : <span className="badge badge-rouge">Désactivé</span>}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button className="bouton-primaire" style={{ fontSize: 12, padding: "4px 10px", marginRight: 6 }} onClick={() => enregistrerEdition(u.Login)}>Enregistrer</button>
                      <button className="bouton-secondaire" style={{ fontSize: 12, padding: "4px 10px" }} onClick={() => setLoginEnEdition(null)}>Annuler</button>
                    </td>
                  </>
                ) : (
                  <>
                    <td>{u.nom_complet}</td>
                    <td><span className="badge badge-bleu">{u.role}</span></td>
                    <td>{u.actif !== false ? <span className="badge badge-vert">Actif</span> : <span className="badge badge-rouge">Désactivé</span>}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button className="bouton-secondaire" style={{ fontSize: 12, padding: "4px 10px", marginRight: 6 }} onClick={() => commencerEdition(u)}>Modifier</button>
                      <button className="bouton-secondaire" style={{ fontSize: 12, padding: "4px 10px", marginRight: 6 }} onClick={() => basculerActif(u)}>
                        {u.actif !== false ? "Désactiver" : "Activer"}
                      </button>
                      <button style={{ fontSize: 12, padding: "4px 10px", border: "1.5px solid var(--sawali-rouge)", borderRadius: 8, background: "transparent", color: "var(--sawali-rouge)", fontWeight: 600 }} onClick={() => supprimer(u.Login)}>
                        Supprimer
                      </button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OngletMedecins() {
  const [medecins, setMedecins] = useState([]);
  const [nouveau, setNouveau] = useState({ Nom: "", Prénoms: "", Titre: "Dr", Téléphone: "", Domaine: "" });
  const [messageStatut, setMessageStatut] = useState("");
  const [erreur, setErreur] = useState("");

  function charger() { api.get("/medecins").then((r) => setMedecins(r.data)); }
  useEffect(charger, []);

  async function creer() {
    if (!nouveau.Nom.trim()) return setErreur("Le nom est obligatoire.");
    setErreur("");
    try {
      await api.post("/medecins", nouveau);
      setNouveau({ Nom: "", Prénoms: "", Titre: "Dr", Téléphone: "", Domaine: "" });
      setMessageStatut("Dentiste ajouté.");
      charger();
      setTimeout(() => setMessageStatut(""), 3000);
    } catch (err) {
      setErreur(err.response?.data?.detail || "Erreur lors de la création.");
    }
  }

  return (
    <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
      <div className="carte" style={{ flex: "1 1 280px", minWidth: 0 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Nouveau dentiste</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <select className="champ-saisie" style={{ width: 90 }} value={nouveau.Titre} onChange={(e) => setNouveau({ ...nouveau, Titre: e.target.value })}>
            <option>Dr</option>
            <option>Dre</option>
            <option>Pr</option>
          </select>
          <input className="champ-saisie" placeholder="Nom" value={nouveau.Nom} onChange={(e) => setNouveau({ ...nouveau, Nom: e.target.value })} />
        </div>
        <input className="champ-saisie" placeholder="Prénoms" value={nouveau.Prénoms} onChange={(e) => setNouveau({ ...nouveau, Prénoms: e.target.value })} style={{ marginBottom: 8 }} />
        <input className="champ-saisie" placeholder="Téléphone" value={nouveau.Téléphone} onChange={(e) => setNouveau({ ...nouveau, Téléphone: e.target.value })} style={{ marginBottom: 8 }} />
        <input className="champ-saisie" placeholder="Domaine / spécialité (facultatif)" value={nouveau.Domaine} onChange={(e) => setNouveau({ ...nouveau, Domaine: e.target.value })} style={{ marginBottom: 12 }} />
        {erreur && <div style={{ color: "var(--sawali-rouge)", fontSize: 13, marginBottom: 8 }}>{erreur}</div>}
        <button className="bouton-primaire" onClick={creer}>Ajouter</button>
        {messageStatut && <div style={{ color: "var(--sawali-vert)", fontSize: 13, marginTop: 8 }}>{messageStatut}</div>}
      </div>

      <div className="carte" style={{ flex: "2 1 400px", minWidth: 0, overflowX: "auto" }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Dentistes enregistrés</div>
        <table className="tableau-donnees">
          <thead><tr><th>Nom</th><th>Téléphone</th><th>Domaine</th><th>Statut</th></tr></thead>
          <tbody>
            {medecins.map((m) => (
              <tr key={m.Numéro_Enreg}>
                <td>{m.Titre} {m.Nom} {m.Prénoms}</td>
                <td>{m.Téléphone || "-"}</td>
                <td>{m.Domaine || "-"}</td>
                <td>{m.EnActivité !== false ? <span className="badge badge-vert">En activité</span> : <span className="badge badge-rouge">Inactif</span>}</td>
              </tr>
            ))}
            {medecins.length === 0 && (
              <tr><td colSpan={4} style={{ color: "var(--sawali-gris)", textAlign: "center", padding: 20 }}>Aucun dentiste enregistré pour l'instant.</td></tr>
            )}
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

function OngletAssurances() {
  const [assurances, setAssurances] = useState([]);
  const [nouvelle, setNouvelle] = useState({ nom: "", contact: "", email: "", delai_remboursement_jours: 30 });
  const [messageStatut, setMessageStatut] = useState("");
  const [erreur, setErreur] = useState("");

  function charger() { api.get("/assurances").then((r) => setAssurances(r.data)); }
  useEffect(charger, []);

  async function creer() {
    if (!nouvelle.nom.trim()) return setErreur("Le nom de l'assurance est obligatoire.");
    setErreur("");
    try {
      await api.post("/assurances", nouvelle);
      setNouvelle({ nom: "", contact: "", email: "", delai_remboursement_jours: 30 });
      setMessageStatut("Assurance ajoutée.");
      charger();
      setTimeout(() => setMessageStatut(""), 3000);
    } catch (err) {
      setErreur(err.response?.data?.detail || "Erreur lors de la création.");
    }
  }

  return (
    <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
      <div className="carte" style={{ flex: "1 1 280px", minWidth: 0 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Nouvelle assurance / mutuelle</div>
        <input className="champ-saisie" placeholder="Nom (ex: MCI, OLEA, SONAR90)" value={nouvelle.nom} onChange={(e) => setNouvelle({ ...nouvelle, nom: e.target.value })} style={{ marginBottom: 8 }} />
        <input className="champ-saisie" placeholder="Contact" value={nouvelle.contact} onChange={(e) => setNouvelle({ ...nouvelle, contact: e.target.value })} style={{ marginBottom: 8 }} />
        <input className="champ-saisie" placeholder="Email" value={nouvelle.email} onChange={(e) => setNouvelle({ ...nouvelle, email: e.target.value })} style={{ marginBottom: 8 }} />
        <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>Délai de remboursement (jours)</label>
        <input className="champ-saisie" type="number" value={nouvelle.delai_remboursement_jours} onChange={(e) => setNouvelle({ ...nouvelle, delai_remboursement_jours: Number(e.target.value) })} style={{ marginBottom: 12 }} />
        {erreur && <div style={{ color: "var(--sawali-rouge)", fontSize: 13, marginBottom: 8 }}>{erreur}</div>}
        <button className="bouton-primaire" onClick={creer}>Ajouter</button>
        {messageStatut && <div style={{ color: "var(--sawali-vert)", fontSize: 13, marginTop: 8 }}>{messageStatut}</div>}
      </div>

      <div className="carte" style={{ flex: "2 1 400px", minWidth: 0, overflowX: "auto" }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Assurances enregistrées</div>
        <table className="tableau-donnees">
          <thead><tr><th>Nom</th><th>Contact</th><th>Email</th><th>Délai remb.</th></tr></thead>
          <tbody>
            {assurances.map((a) => (
              <tr key={a.numero_enreg}>
                <td>{a.nom}</td>
                <td>{a.contact || "-"}</td>
                <td>{a.email || "-"}</td>
                <td>{a.delai_remboursement_jours} j</td>
              </tr>
            ))}
            {assurances.length === 0 && (
              <tr><td colSpan={4} style={{ color: "var(--sawali-gris)", textAlign: "center", padding: 20 }}>Aucune assurance enregistrée pour l'instant.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OngletPaiements() {
  const [types, setTypes] = useState([]);
  const [nouveau, setNouveau] = useState({ nom: "", exige_reference: false });
  const [messageStatut, setMessageStatut] = useState("");
  const [erreur, setErreur] = useState("");

  function charger() { api.get("/types-paiement", { params: { inclure_inactifs: true } }).then((r) => setTypes(r.data)); }
  useEffect(charger, []);

  async function creer() {
    if (!nouveau.nom.trim()) return setErreur("Le nom du mode de paiement est obligatoire.");
    setErreur("");
    try {
      await api.post("/types-paiement", nouveau);
      setNouveau({ nom: "", exige_reference: false });
      setMessageStatut("Mode de paiement ajouté.");
      charger();
      setTimeout(() => setMessageStatut(""), 3000);
    } catch (err) {
      setErreur(err.response?.data?.detail || "Erreur lors de la création.");
    }
  }

  async function basculerExigeReference(t) {
    await api.put(`/types-paiement/${t.numero_enreg}`, { exige_reference: !t.exige_reference });
    charger();
  }

  async function basculerActif(t) {
    await api.put(`/types-paiement/${t.numero_enreg}`, { actif: !t.actif });
    charger();
  }

  async function supprimer(t) {
    if (!window.confirm(`Supprimer le mode de paiement « ${t.nom} » ?`)) return;
    await api.delete(`/types-paiement/${t.numero_enreg}`);
    charger();
  }

  return (
    <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
      <div className="carte" style={{ flex: "1 1 280px", minWidth: 0 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Nouveau mode de paiement</div>
        <input className="champ-saisie" placeholder="Nom (ex: Wave, Carte bancaire...)" value={nouveau.nom} onChange={(e) => setNouveau({ ...nouveau, nom: e.target.value })} style={{ marginBottom: 10 }} />
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 12 }}>
          <input type="checkbox" checked={nouveau.exige_reference} onChange={(e) => setNouveau({ ...nouveau, exige_reference: e.target.checked })} />
          Le caissier doit saisir la référence de la transaction
        </label>
        {erreur && <div style={{ color: "var(--sawali-rouge)", fontSize: 13, marginBottom: 8 }}>{erreur}</div>}
        <button className="bouton-primaire" onClick={creer}>Ajouter</button>
        {messageStatut && <div style={{ color: "var(--sawali-vert)", fontSize: 13, marginTop: 8 }}>{messageStatut}</div>}
      </div>

      <div className="carte" style={{ flex: "2 1 400px", minWidth: 0, overflowX: "auto" }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Modes de paiement — apparaissent à la Caisse</div>
        <table className="tableau-donnees" style={{ minWidth: 480 }}>
          <thead><tr><th>Nom</th><th>Référence exigée</th><th>Statut</th><th>Actions</th></tr></thead>
          <tbody>
            {types.map((t) => (
              <tr key={t.numero_enreg}>
                <td>{t.nom}</td>
                <td>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                    <input type="checkbox" checked={t.exige_reference} onChange={() => basculerExigeReference(t)} />
                    {t.exige_reference ? "Oui" : "Non"}
                  </label>
                </td>
                <td>{t.actif !== false ? <span className="badge badge-vert">Actif</span> : <span className="badge badge-rouge">Désactivé</span>}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <button className="bouton-secondaire" style={{ fontSize: 12, padding: "4px 10px", marginRight: 6 }} onClick={() => basculerActif(t)}>
                    {t.actif !== false ? "Désactiver" : "Activer"}
                  </button>
                  <button style={{ fontSize: 12, padding: "4px 10px", border: "1.5px solid var(--sawali-rouge)", borderRadius: 8, background: "transparent", color: "var(--sawali-rouge)", fontWeight: 600 }} onClick={() => supprimer(t)}>
                    Supprimer
                  </button>
                </td>
              </tr>
            ))}
            {types.length === 0 && (
              <tr><td colSpan={4} style={{ color: "var(--sawali-gris)", textAlign: "center", padding: 20 }}>Aucun mode de paiement enregistré pour l'instant.</td></tr>
            )}
          </tbody>
        </table>
      </div>
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
