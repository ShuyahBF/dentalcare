// pages/Admin.jsx
// --------------------
// Interface Administrateur (§9) : paramétrage de la fiche Cabinet, gestion
// des comptes utilisateurs (5 rôles), gestion du catalogue ProduitClinique.
// Onglet "Suggestions" en réserve pour /admin/suggestions-history (sawali-portal),
// en attente du contenu réel de SUGGESTION.MD pour finaliser son schéma.

import { useState, useEffect } from "react";
import api from "../utils/api";
import { appliquerTheme } from "../utils/appliquerTheme";

const ONGLETS = ["Cabinet", "Utilisateurs", "Médecins", "Patients", "Catalogue", "Assurances", "Paiements", "Messagerie WA", "Suggestions"];

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
      {ongletActif === "Patients" && <OngletPatients />}
      {ongletActif === "Catalogue" && <OngletCatalogue />}
      {ongletActif === "Assurances" && <OngletAssurances />}
      {ongletActif === "Paiements" && <OngletPaiements />}
      {ongletActif === "Messagerie WA" && <OngletMessagerieWA />}
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
  const [themes, setThemes] = useState([]);
  const [enErreur, setEnErreur] = useState(false);
  const [messageStatut, setMessageStatut] = useState("");
  const [erreurLogo, setErreurLogo] = useState("");

  function charger() {
    setEnErreur(false);
    api.get("/cabinet").then((r) => setCabinet(r.data)).catch(() => setEnErreur(true));
    api.get("/medecins").then((r) => setMedecins(r.data));
    api.get("/themes").then((r) => setThemes(r.data));
  }
  useEffect(charger, []);

  async function enregistrer() {
    await api.put("/cabinet", cabinet);
    const frais = await api.get("/cabinet");
    setCabinet(frais.data);
    appliquerTheme(frais.data); // § demande utilisateur : le thème/mode choisi s'applique immédiatement, sans recharger la page
    setMessageStatut("Fiche cabinet enregistrée.");
    setTimeout(() => setMessageStatut(""), 3000);
  }

  function gererChoixLogo(e) {
    const fichier = e.target.files?.[0];
    if (!fichier) return;
    setErreurLogo("");
    if (fichier.size > 800 * 1024) {
      setErreurLogo("Image trop lourde (800 Ko max). Choisissez une image plus légère.");
      return;
    }
    const lecteur = new FileReader();
    lecteur.onload = () => setCabinet((c) => ({ ...c, logo_url: lecteur.result }));
    lecteur.readAsDataURL(fichier);
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
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>Logo du cabinet</label>
        <div style={{ fontSize: 12, color: "var(--sawali-gris-fonce)", marginBottom: 8 }}>
          Le fauteuil dentaire est le logo de la plateforme SAWALI DentalCare — ce logo-ci est celui de <strong>votre</strong> cabinet, imprimé sur les reçus.
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {cabinet.logo_url ? (
            <img src={cabinet.logo_url} alt="Logo du cabinet" style={{ width: 64, height: 64, objectFit: "contain", border: "1px solid #eef2fa", borderRadius: 8, background: "white" }} />
          ) : (
            <div style={{ width: 64, height: 64, borderRadius: 8, background: "var(--sawali-gris-clair)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "var(--sawali-gris)", textAlign: "center" }}>
              Aucun logo
            </div>
          )}
          <div>
            <input type="file" accept="image/*" onChange={gererChoixLogo} style={{ fontSize: 13 }} />
            {cabinet.logo_url && (
              <button className="bouton-secondaire" style={{ fontSize: 12, padding: "3px 10px", marginTop: 6, display: "block" }} onClick={() => setCabinet({ ...cabinet, logo_url: null })}>
                Retirer le logo
              </button>
            )}
          </div>
        </div>
        {erreurLogo && <div style={{ color: "var(--sawali-rouge)", fontSize: 12, marginTop: 6 }}>{erreurLogo}</div>}
      </div>

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

      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>🔐 Connexion sécurisée par code WhatsApp (OTP)</label>
        <div style={{ fontSize: 12, color: "var(--sawali-gris-fonce)", marginBottom: 6 }}>
          Si activé, chaque connexion d'un utilisateur de ce cabinet exige un code à 6 chiffres envoyé par WhatsApp au numéro enregistré sur son compte. Nécessite une Configuration WhatsApp active pour ce cabinet et un numéro de téléphone sur chaque compte (onglet Utilisateurs).
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          <input type="checkbox" checked={!!cabinet.otp_whatsapp_actif} onChange={(e) => setCabinet({ ...cabinet, otp_whatsapp_actif: e.target.checked })} />
          Activer le code OTP WhatsApp à la connexion
        </label>
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>🎨 Thème de l'interface</label>
        <div style={{ fontSize: 12, color: "var(--sawali-gris-fonce)", marginBottom: 6 }}>
          Choisissez parmi les thèmes proposés par SAWALI SMART SYSTEMS. Appliqué à tout le cabinet, immédiatement après enregistrement.
        </div>
        <select className="champ-saisie" style={{ marginBottom: 10 }} value={cabinet.theme_code || ""} onChange={(e) => setCabinet({ ...cabinet, theme_code: e.target.value || null })}>
          <option value="">Bleu SAWALI (défaut)</option>
          {themes.map((t) => <option key={t.code} value={t.code}>{t.nom}</option>)}
        </select>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            onClick={() => setCabinet({ ...cabinet, mode_affichage: "clair" })}
            className={cabinet.mode_affichage !== "sombre" ? "bouton-primaire" : "bouton-secondaire"}
            style={{ flex: 1, fontSize: 13 }}
          >
            ☀️ Clair
          </button>
          <button
            type="button"
            onClick={() => setCabinet({ ...cabinet, mode_affichage: "sombre" })}
            className={cabinet.mode_affichage === "sombre" ? "bouton-primaire" : "bouton-secondaire"}
            style={{ flex: 1, fontSize: 13 }}
          >
            🌙 Sombre
          </button>
        </div>
      </div>

      <button className="bouton-primaire" onClick={enregistrer}>Enregistrer</button>
      {messageStatut && <span style={{ marginLeft: 10, color: "var(--sawali-vert)", fontSize: 13 }}>{messageStatut}</span>}
    </div>
  );
}

function OngletUtilisateurs() {
  const [utilisateurs, setUtilisateurs] = useState([]);
  const [medecins, setMedecins] = useState([]);
  const [nouveau, setNouveau] = useState({ login: "", mot_de_passe: "", role: "Caissier", nom_complet: "", telephone: "" });
  const [nouveauMdpVisible, setNouveauMdpVisible] = useState(false);
  const [messageStatut, setMessageStatut] = useState("");
  const [loginEnEdition, setLoginEnEdition] = useState(null);
  const [edition, setEdition] = useState({ nom_complet: "", role: "", telephone: "", medecin_numero_enreg: "" });

  function charger() {
    api.get("/utilisateurs").then((r) => setUtilisateurs(r.data));
    api.get("/medecins").then((r) => setMedecins(r.data));
  }
  useEffect(charger, []);

  async function creer() {
    await api.post("/utilisateurs", nouveau);
    setNouveau({ login: "", mot_de_passe: "", role: "Caissier", nom_complet: "", telephone: "" });
    setMessageStatut("Compte créé.");
    charger();
    setTimeout(() => setMessageStatut(""), 3000);
  }

  function commencerEdition(u) {
    setLoginEnEdition(u.Login);
    setEdition({ nom_complet: u.nom_complet || "", role: u.role, telephone: u.Téléphone || "", medecin_numero_enreg: u.MedecinNumeroEnreg || "" });
  }

  async function enregistrerEdition(login) {
    await api.put(`/utilisateurs/${login}`, { ...edition, medecin_numero_enreg: edition.medecin_numero_enreg ? Number(edition.medecin_numero_enreg) : null });
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
        <input className="champ-saisie" placeholder="Téléphone (WhatsApp — requis si OTP activé)" value={nouveau.telephone} onChange={(e) => setNouveau({ ...nouveau, telephone: e.target.value })} style={{ marginBottom: 8 }} />
        <div style={{ position: "relative", marginBottom: 8 }}>
          <input className="champ-saisie" placeholder="Mot de passe" type={nouveauMdpVisible ? "text" : "password"} value={nouveau.mot_de_passe} onChange={(e) => setNouveau({ ...nouveau, mot_de_passe: e.target.value })} style={{ paddingRight: 36 }} />
          <button type="button" onClick={() => setNouveauMdpVisible((v) => !v)} title={nouveauMdpVisible ? "Masquer" : "Afficher"} style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", border: "none", background: "none", cursor: "pointer", fontSize: 15 }}>
            {nouveauMdpVisible ? "🙈" : "👁️"}
          </button>
        </div>
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
        <table className="tableau-donnees" style={{ minWidth: 640 }}>
          <thead><tr><th>Login</th><th>Nom</th><th>Téléphone</th><th>Rôle</th><th>Statut</th><th>Actions</th></tr></thead>
          <tbody>
            {utilisateurs.map((u) => (
              <tr key={u.Login}>
                <td>{u.Login}</td>
                {loginEnEdition === u.Login ? (
                  <>
                    <td><input className="champ-saisie" style={{ fontSize: 13, padding: "4px 8px" }} value={edition.nom_complet} onChange={(e) => setEdition({ ...edition, nom_complet: e.target.value })} /></td>
                    <td><input className="champ-saisie" style={{ fontSize: 13, padding: "4px 8px" }} value={edition.telephone} onChange={(e) => setEdition({ ...edition, telephone: e.target.value })} placeholder="WhatsApp" /></td>
                    <td>
                      <select className="champ-saisie" style={{ fontSize: 13, padding: "4px 8px" }} value={edition.role} onChange={(e) => setEdition({ ...edition, role: e.target.value })}>
                        <option>Caissier</option>
                        <option>Secrétariat Cabinet</option>
                        <option>Dentiste</option>
                        <option>Comptable</option>
                        <option>Administrateur</option>
                      </select>
                      {edition.role === "Dentiste" && (
                        <select className="champ-saisie" style={{ fontSize: 12, padding: "3px 6px", marginTop: 4 }} value={edition.medecin_numero_enreg} onChange={(e) => setEdition({ ...edition, medecin_numero_enreg: e.target.value })}>
                          <option value="">🦷 Aucune fiche liée</option>
                          {medecins.map((m) => <option key={m.Numéro_Enreg} value={m.Numéro_Enreg}>{m.Titre} {m.Nom} {m.Prénoms}</option>)}
                        </select>
                      )}
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
                    <td style={{ fontFamily: "monospace", fontSize: 12 }}>{u.Téléphone || "—"}</td>
                    <td>
                      <span className="badge badge-bleu">{u.role}</span>
                      {u.role === "Dentiste" && u.MedecinNumeroEnreg && (
                        <div style={{ fontSize: 10.5, color: "var(--sawali-gris-fonce)", marginTop: 3 }}>
                          🦷 {medecins.find((m) => m.Numéro_Enreg === u.MedecinNumeroEnreg)?.Nom || `#${u.MedecinNumeroEnreg}`}
                        </div>
                      )}
                    </td>
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
  const [numeroEnEdition, setNumeroEnEdition] = useState(null);
  const [edition, setEdition] = useState({});

  function charger() { api.get("/medecins", { params: { inclure_inactifs: true } }).then((r) => setMedecins(r.data)); }
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

  function commencerEdition(m) {
    setNumeroEnEdition(m.Numéro_Enreg);
    setEdition({ Nom: m.Nom || "", Prénoms: m.Prénoms || "", Titre: m.Titre || "Dr", Téléphone: m.Téléphone || "", Domaine: m.Domaine || "" });
  }

  async function enregistrerEdition(m) {
    await api.put(`/medecins/${m.Numéro_Enreg}`, { ...m, ...edition });
    setNumeroEnEdition(null);
    charger();
  }

  async function basculerActif(m) {
    await api.put(`/medecins/${m.Numéro_Enreg}/statut`, null, { params: { actif: m.EnActivité === false } });
    charger();
  }

  async function supprimer(m) {
    if (!window.confirm(`Supprimer définitivement « ${m.Titre} ${m.Nom} ${m.Prénoms || ""} » ?`)) return;
    try {
      await api.delete(`/medecins/${m.Numéro_Enreg}`);
      charger();
    } catch (err) {
      alert(err.response?.data?.detail || "Suppression impossible.");
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
        <table className="tableau-donnees" style={{ minWidth: 640 }}>
          <thead><tr><th>Nom</th><th>Téléphone</th><th>Domaine</th><th>Statut</th><th>Actions</th></tr></thead>
          <tbody>
            {medecins.map((m) => {
              const enEdition = numeroEnEdition === m.Numéro_Enreg;
              return (
                <tr key={m.Numéro_Enreg}>
                  {enEdition ? (
                    <>
                      <td style={{ display: "flex", gap: 6 }}>
                        <select className="champ-saisie" style={{ fontSize: 13, padding: "4px 6px", width: 70 }} value={edition.Titre} onChange={(e) => setEdition({ ...edition, Titre: e.target.value })}>
                          <option>Dr</option><option>Dre</option><option>Pr</option>
                        </select>
                        <input className="champ-saisie" style={{ fontSize: 13, padding: "4px 8px" }} value={edition.Nom} onChange={(e) => setEdition({ ...edition, Nom: e.target.value })} />
                        <input className="champ-saisie" style={{ fontSize: 13, padding: "4px 8px" }} value={edition.Prénoms} onChange={(e) => setEdition({ ...edition, Prénoms: e.target.value })} />
                      </td>
                      <td><input className="champ-saisie" style={{ fontSize: 13, padding: "4px 8px" }} value={edition.Téléphone} onChange={(e) => setEdition({ ...edition, Téléphone: e.target.value })} /></td>
                      <td><input className="champ-saisie" style={{ fontSize: 13, padding: "4px 8px" }} value={edition.Domaine} onChange={(e) => setEdition({ ...edition, Domaine: e.target.value })} /></td>
                      <td>{m.EnActivité !== false ? <span className="badge badge-vert">En activité</span> : <span className="badge badge-rouge">Inactif</span>}</td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <button className="bouton-primaire" style={{ fontSize: 12, padding: "4px 10px", marginRight: 6 }} onClick={() => enregistrerEdition(m)}>Enregistrer</button>
                        <button className="bouton-secondaire" style={{ fontSize: 12, padding: "4px 10px" }} onClick={() => setNumeroEnEdition(null)}>Annuler</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td>{m.Titre} {m.Nom} {m.Prénoms}</td>
                      <td>{m.Téléphone || "-"}</td>
                      <td>{m.Domaine || "-"}</td>
                      <td>{m.EnActivité !== false ? <span className="badge badge-vert">En activité</span> : <span className="badge badge-rouge">Inactif</span>}</td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <button className="bouton-secondaire" style={{ fontSize: 12, padding: "4px 10px", marginRight: 6 }} onClick={() => commencerEdition(m)}>Modifier</button>
                        <button className="bouton-secondaire" style={{ fontSize: 12, padding: "4px 10px", marginRight: 6 }} onClick={() => basculerActif(m)}>
                          {m.EnActivité !== false ? "Désactiver" : "Activer"}
                        </button>
                        <button style={{ fontSize: 12, padding: "4px 10px", border: "1.5px solid var(--sawali-rouge)", borderRadius: 8, background: "transparent", color: "var(--sawali-rouge)", fontWeight: 600 }} onClick={() => supprimer(m)}>
                          Supprimer
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
            {medecins.length === 0 && (
              <tr><td colSpan={5} style={{ color: "var(--sawali-gris)", textAlign: "center", padding: 20 }}>Aucun dentiste enregistré pour l'instant.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OngletPatients() {
  const [patients, setPatients] = useState([]);
  const [recherche, setRecherche] = useState("");
  const [numeroEnEdition, setNumeroEnEdition] = useState(null);
  const [edition, setEdition] = useState({});
  const [messageStatut, setMessageStatut] = useState("");

  function charger() {
    api.get("/patients", { params: { recherche, inclure_inactifs: true, limite: 100 } }).then((r) => setPatients(r.data));
  }
  useEffect(charger, [recherche]);

  function commencerEdition(p) {
    setNumeroEnEdition(p.Numéro_Enreg);
    setEdition({
      Nom: p.Nom || "", Prénoms: p.Prénoms || "", Téléphone: p.Téléphone || "",
      Adresse: p.Adresse || "", "Date Naissance": p["Date Naissance"] ? String(p["Date Naissance"]).slice(0, 10) : "", Sexe: p.Sexe || "",
    });
  }

  async function enregistrerEdition(p) {
    await api.put(`/patients/${p.Numéro_Enreg}`, edition);
    setNumeroEnEdition(null);
    setMessageStatut("Fiche patient mise à jour.");
    charger();
    setTimeout(() => setMessageStatut(""), 3000);
  }

  async function basculerActif(p) {
    await api.put(`/patients/${p.Numéro_Enreg}/statut`, null, { params: { actif: p.Etat_En_Cours !== 1 } });
    charger();
  }

  return (
    <div className="carte" style={{ overflowX: "auto" }}>
      <input className="champ-saisie" placeholder="Rechercher un patient (nom, téléphone)..." value={recherche} onChange={(e) => setRecherche(e.target.value)} style={{ marginBottom: 12, maxWidth: 340 }} />
      {messageStatut && <div style={{ color: "var(--sawali-vert)", fontSize: 13, marginBottom: 10 }}>{messageStatut}</div>}

      <table className="tableau-donnees" style={{ minWidth: 760 }}>
        <thead><tr><th>ID</th><th>Nom</th><th>Téléphone</th><th>Naissance</th><th>Sexe</th><th>Statut</th><th>Actions</th></tr></thead>
        <tbody>
          {patients.filter((p) => !p.EstClientCash).map((p) => {
            const enEdition = numeroEnEdition === p.Numéro_Enreg;
            return (
              <tr key={p.Numéro_Enreg}>
                <td>{p.ID_Patient}</td>
                {enEdition ? (
                  <>
                    <td style={{ display: "flex", gap: 6 }}>
                      <input className="champ-saisie" style={{ fontSize: 13, padding: "4px 8px" }} value={edition.Nom} onChange={(e) => setEdition({ ...edition, Nom: e.target.value })} />
                      <input className="champ-saisie" style={{ fontSize: 13, padding: "4px 8px" }} value={edition.Prénoms} onChange={(e) => setEdition({ ...edition, Prénoms: e.target.value })} />
                    </td>
                    <td><input className="champ-saisie" style={{ fontSize: 13, padding: "4px 8px" }} value={edition.Téléphone} onChange={(e) => setEdition({ ...edition, Téléphone: e.target.value })} /></td>
                    <td><input className="champ-saisie" style={{ fontSize: 13, padding: "4px 8px" }} type="date" value={edition["Date Naissance"]} onChange={(e) => setEdition({ ...edition, "Date Naissance": e.target.value })} /></td>
                    <td>
                      <select className="champ-saisie" style={{ fontSize: 13, padding: "4px 8px" }} value={edition.Sexe} onChange={(e) => setEdition({ ...edition, Sexe: e.target.value })}>
                        <option value="">—</option><option value="Masculin">M</option><option value="Féminin">F</option>
                      </select>
                    </td>
                    <td>{p.Etat_En_Cours === 1 ? <span className="badge badge-vert">Actif</span> : <span className="badge badge-rouge">Désactivé</span>}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button className="bouton-primaire" style={{ fontSize: 12, padding: "4px 10px", marginRight: 6 }} onClick={() => enregistrerEdition(p)}>Enregistrer</button>
                      <button className="bouton-secondaire" style={{ fontSize: 12, padding: "4px 10px" }} onClick={() => setNumeroEnEdition(null)}>Annuler</button>
                    </td>
                  </>
                ) : (
                  <>
                    <td>{p.Nom} {p.Prénoms}</td>
                    <td>{p.Téléphone || "-"}</td>
                    <td>{p["Date Naissance"] ? String(p["Date Naissance"]).slice(0, 10) : "-"}</td>
                    <td>{p.Sexe || "-"}</td>
                    <td>{p.Etat_En_Cours === 1 ? <span className="badge badge-vert">Actif</span> : <span className="badge badge-rouge">Désactivé</span>}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button className="bouton-secondaire" style={{ fontSize: 12, padding: "4px 10px", marginRight: 6 }} onClick={() => commencerEdition(p)}>Modifier</button>
                      <button className="bouton-secondaire" style={{ fontSize: 12, padding: "4px 10px" }} onClick={() => basculerActif(p)}>
                        {p.Etat_En_Cours === 1 ? "Désactiver" : "Activer"}
                      </button>
                    </td>
                  </>
                )}
              </tr>
            );
          })}
          {patients.length === 0 && (
            <tr><td colSpan={7} style={{ color: "var(--sawali-gris)", textAlign: "center", padding: 20 }}>Aucun patient trouvé.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function OngletCatalogue() {
  const [catalogue, setCatalogue] = useState(null);
  const [domaines, setDomaines] = useState([]);
  const [enErreur, setEnErreur] = useState(false);
  const [recherche, setRecherche] = useState("");
  const [codeEnEdition, setCodeEnEdition] = useState(null);
  const [edition, setEdition] = useState({});
  const [messageStatut, setMessageStatut] = useState("");
  const [erreurEdition, setErreurEdition] = useState("");

  function charger() {
    setEnErreur(false);
    api.get("/produits", { params: { recherche, inclure_inactifs: true } }).then((r) => setCatalogue(r.data)).catch(() => setEnErreur(true));
    api.get("/produits/domaines").then((r) => setDomaines(r.data));
  }
  useEffect(charger, [recherche]);

  function commencerEdition(a) {
    setCodeEnEdition(a["Code Produit"]);
    setErreurEdition("");
    setEdition({
      libelle: a["Libellé"] || "",
      domaine: a["Domaine"] || "",
      prixPublic: a["Prix Public"] ?? 0,
      prixAssurance: a["Prix Second"] ?? "",
    });
  }

  async function enregistrerEdition(acte) {
    const prixPublic = Number(edition.prixPublic) || 0;
    const prixAssurance = edition.prixAssurance === "" ? null : Number(edition.prixAssurance);
    // Règle : le Prix Assurance, s'il est défini, doit toujours être ≥ Prix
    // Public (§ demande utilisateur) — vérifié ici pour un retour immédiat,
    // et de toute façon imposé côté serveur (voir modele ProduitCliniqueBase).
    if (prixAssurance !== null && prixAssurance < prixPublic) {
      return setErreurEdition(`Le Prix Assurance (${prixAssurance.toLocaleString("fr-FR")} F) ne peut pas être inférieur au Prix Public (${prixPublic.toLocaleString("fr-FR")} F).`);
    }
    setErreurEdition("");
    try {
      await api.put(`/produits/${acte["Code Produit"]}`, {
        ...acte,
        Libellé: edition.libelle,
        Domaine: edition.domaine,
        "Prix Public": prixPublic,
        "Prix Second": prixAssurance,
      });
      setCodeEnEdition(null);
      setMessageStatut("Acte mis à jour.");
      charger();
      setTimeout(() => setMessageStatut(""), 3000);
    } catch (err) {
      const detail = err.response?.data?.detail;
      const message = Array.isArray(detail) ? detail.map((d) => d.msg).join(" ") : detail;
      setErreurEdition(message || "Erreur lors de l'enregistrement.");
    }
  }

  async function basculerActif(acte) {
    await api.put(`/produits/${acte["Code Produit"]}`, { ...acte, Actif: acte["Actif"] === false });
    charger();
  }

  return (
    <div className="carte" style={{ overflowX: "auto" }}>
      <input className="champ-saisie" placeholder="Rechercher un acte..." value={recherche} onChange={(e) => setRecherche(e.target.value)} style={{ marginBottom: 12, maxWidth: 340 }} />
      {messageStatut && <div style={{ color: "var(--sawali-vert)", fontSize: 13, marginBottom: 10 }}>{messageStatut}</div>}

      {enErreur && (
        <div style={{ color: "var(--sawali-rouge)", marginBottom: 12 }}>
          Impossible de charger le catalogue (le service met parfois jusqu'à une minute à se réveiller après une période d'inactivité).
          <button className="bouton-secondaire" style={{ display: "block", marginTop: 10 }} onClick={charger}>Réessayer</button>
        </div>
      )}
      {catalogue === null && !enErreur && <div style={{ color: "var(--sawali-gris)" }}>Chargement...</div>}

      {catalogue && (
        <table className="tableau-donnees" style={{ minWidth: 720 }}>
          <thead><tr><th>Code</th><th>Libellé</th><th>Domaine</th><th>Prix Public</th><th>Prix Assurance</th><th>Statut</th><th>Actions</th></tr></thead>
          <tbody>
            {catalogue.map((a) => {
              const enEdition = codeEnEdition === a["Code Produit"];
              return (
                <tr key={a["Code Produit"]}>
                  <td>{a["Code Produit"]}</td>
                  {enEdition ? (
                    <>
                      <td><input className="champ-saisie" style={{ fontSize: 13, padding: "4px 8px", minWidth: 160 }} value={edition.libelle} onChange={(e) => setEdition({ ...edition, libelle: e.target.value })} /></td>
                      <td>
                        <select className="champ-saisie" style={{ fontSize: 13, padding: "4px 8px" }} value={edition.domaine} onChange={(e) => setEdition({ ...edition, domaine: e.target.value })}>
                          <option value="">—</option>
                          {domaines.map((d) => <option key={d} value={d}>{d}</option>)}
                        </select>
                      </td>
                      <td><input className="champ-saisie" style={{ fontSize: 13, padding: "4px 8px", width: 100 }} type="number" value={edition.prixPublic} onChange={(e) => setEdition({ ...edition, prixPublic: e.target.value })} /></td>
                      <td><input className="champ-saisie" style={{ fontSize: 13, padding: "4px 8px", width: 100 }} type="number" placeholder="= Prix Public" value={edition.prixAssurance} onChange={(e) => setEdition({ ...edition, prixAssurance: e.target.value })} /></td>
                      <td>{a["Actif"] !== false ? <span className="badge badge-vert">Actif</span> : <span className="badge badge-rouge">Désactivé</span>}</td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <button className="bouton-primaire" style={{ fontSize: 12, padding: "4px 10px", marginRight: 6 }} onClick={() => enregistrerEdition(a)}>Enregistrer</button>
                        <button className="bouton-secondaire" style={{ fontSize: 12, padding: "4px 10px" }} onClick={() => setCodeEnEdition(null)}>Annuler</button>
                        {erreurEdition && <div style={{ color: "var(--sawali-rouge)", fontSize: 11.5, marginTop: 4, whiteSpace: "normal", maxWidth: 220 }}>{erreurEdition}</div>}
                      </td>
                    </>
                  ) : (
                    <>
                      <td>{a["Libellé"]}</td>
                      <td><span className="badge badge-bleu">{a["Domaine"]}</span></td>
                      <td>{a["Prix Public"]?.toLocaleString("fr-FR")} F</td>
                      <td>{a["Prix Second"] != null ? `${a["Prix Second"].toLocaleString("fr-FR")} F` : <span style={{ color: "var(--sawali-gris)" }}>= Prix Public</span>}</td>
                      <td>{a["Actif"] !== false ? <span className="badge badge-vert">Actif</span> : <span className="badge badge-rouge">Désactivé</span>}</td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <button className="bouton-secondaire" style={{ fontSize: 12, padding: "4px 10px", marginRight: 6 }} onClick={() => commencerEdition(a)}>Modifier</button>
                        <button className="bouton-secondaire" style={{ fontSize: 12, padding: "4px 10px" }} onClick={() => basculerActif(a)}>
                          {a["Actif"] !== false ? "Désactiver" : "Activer"}
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function OngletAssurances() {
  const [assurances, setAssurances] = useState([]);
  const [nouvelle, setNouvelle] = useState({ nom: "", contact: "", email: "", delai_remboursement_jours: 30, pourcentage_prise_en_charge_defaut: 80 });
  const [messageStatut, setMessageStatut] = useState("");
  const [erreur, setErreur] = useState("");
  const [numeroEnEdition, setNumeroEnEdition] = useState(null);
  const [edition, setEdition] = useState({});

  function charger() { api.get("/assurances", { params: { inclure_inactifs: true } }).then((r) => setAssurances(r.data)); }
  useEffect(charger, []);

  async function creer() {
    if (!nouvelle.nom.trim()) return setErreur("Le nom de l'assurance est obligatoire.");
    setErreur("");
    try {
      await api.post("/assurances", nouvelle);
      setNouvelle({ nom: "", contact: "", email: "", delai_remboursement_jours: 30, pourcentage_prise_en_charge_defaut: 80 });
      setMessageStatut("Assurance ajoutée.");
      charger();
      setTimeout(() => setMessageStatut(""), 3000);
    } catch (err) {
      setErreur(err.response?.data?.detail || "Erreur lors de la création.");
    }
  }

  function commencerEdition(a) {
    setNumeroEnEdition(a.numero_enreg);
    setEdition({
      nom: a.nom || "", contact: a.contact || "", email: a.email || "",
      delai_remboursement_jours: a.delai_remboursement_jours ?? 30,
      pourcentage_prise_en_charge_defaut: a.pourcentage_prise_en_charge_defaut ?? 80,
    });
  }

  async function enregistrerEdition(a) {
    await api.put(`/assurances/${a.numero_enreg}`, edition);
    setNumeroEnEdition(null);
    setMessageStatut("Assurance mise à jour.");
    charger();
    setTimeout(() => setMessageStatut(""), 3000);
  }

  async function basculerActif(a) {
    await api.put(`/assurances/${a.numero_enreg}`, { actif: a.actif === false });
    charger();
  }

  return (
    <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
      <div className="carte" style={{ flex: "1 1 280px", minWidth: 0 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Nouvelle assurance / mutuelle</div>
        <input className="champ-saisie" placeholder="Nom (ex: MCI, OLEA80, SONAR90)" value={nouvelle.nom} onChange={(e) => setNouvelle({ ...nouvelle, nom: e.target.value })} style={{ marginBottom: 8 }} />
        <input className="champ-saisie" placeholder="Contact" value={nouvelle.contact} onChange={(e) => setNouvelle({ ...nouvelle, contact: e.target.value })} style={{ marginBottom: 8 }} />
        <input className="champ-saisie" placeholder="Email" value={nouvelle.email} onChange={(e) => setNouvelle({ ...nouvelle, email: e.target.value })} style={{ marginBottom: 8 }} />
        <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>% de prise en charge par défaut</label>
        <div style={{ fontSize: 12, color: "var(--sawali-gris-fonce)", marginBottom: 4 }}>
          Ex: "OLEA80" → 80. Appliqué automatiquement à chaque rattachement patient — le caissier ne le saisit jamais lui-même.
        </div>
        <input className="champ-saisie" type="number" min="0" max="100" value={nouvelle.pourcentage_prise_en_charge_defaut} onChange={(e) => setNouvelle({ ...nouvelle, pourcentage_prise_en_charge_defaut: Number(e.target.value) })} style={{ marginBottom: 12 }} />
        <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>Délai de remboursement (jours)</label>
        <input className="champ-saisie" type="number" value={nouvelle.delai_remboursement_jours} onChange={(e) => setNouvelle({ ...nouvelle, delai_remboursement_jours: Number(e.target.value) })} style={{ marginBottom: 12 }} />
        {erreur && <div style={{ color: "var(--sawali-rouge)", fontSize: 13, marginBottom: 8 }}>{erreur}</div>}
        <button className="bouton-primaire" onClick={creer}>Ajouter</button>
        {messageStatut && <div style={{ color: "var(--sawali-vert)", fontSize: 13, marginTop: 8 }}>{messageStatut}</div>}
      </div>

      <div className="carte" style={{ flex: "2 1 500px", minWidth: 0, overflowX: "auto" }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Assurances enregistrées</div>
        <table className="tableau-donnees" style={{ minWidth: 720 }}>
          <thead><tr><th>Intitulé</th><th>%PC défaut</th><th>Contact</th><th>Email</th><th>Délai remb.</th><th>Statut</th><th>Actions</th></tr></thead>
          <tbody>
            {assurances.map((a) => {
              const enEdition = numeroEnEdition === a.numero_enreg;
              return (
                <tr key={a.numero_enreg}>
                  {enEdition ? (
                    <>
                      <td><input className="champ-saisie" style={{ fontSize: 13, padding: "4px 8px", minWidth: 120 }} value={edition.nom} onChange={(e) => setEdition({ ...edition, nom: e.target.value })} /></td>
                      <td><input className="champ-saisie" style={{ fontSize: 13, padding: "4px 8px", width: 70 }} type="number" min="0" max="100" value={edition.pourcentage_prise_en_charge_defaut} onChange={(e) => setEdition({ ...edition, pourcentage_prise_en_charge_defaut: Number(e.target.value) })} /></td>
                      <td><input className="champ-saisie" style={{ fontSize: 13, padding: "4px 8px" }} value={edition.contact} onChange={(e) => setEdition({ ...edition, contact: e.target.value })} /></td>
                      <td><input className="champ-saisie" style={{ fontSize: 13, padding: "4px 8px" }} value={edition.email} onChange={(e) => setEdition({ ...edition, email: e.target.value })} /></td>
                      <td><input className="champ-saisie" style={{ fontSize: 13, padding: "4px 8px", width: 70 }} type="number" value={edition.delai_remboursement_jours} onChange={(e) => setEdition({ ...edition, delai_remboursement_jours: Number(e.target.value) })} /></td>
                      <td>{a.actif !== false ? <span className="badge badge-vert">Actif</span> : <span className="badge badge-rouge">Désactivé</span>}</td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <button className="bouton-primaire" style={{ fontSize: 12, padding: "4px 10px", marginRight: 6 }} onClick={() => enregistrerEdition(a)}>Enregistrer</button>
                        <button className="bouton-secondaire" style={{ fontSize: 12, padding: "4px 10px" }} onClick={() => setNumeroEnEdition(null)}>Annuler</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td>{a.nom}</td>
                      <td><span className="badge badge-bleu">{a.pourcentage_prise_en_charge_defaut ?? 80}%</span></td>
                      <td>{a.contact || "-"}</td>
                      <td>{a.email || "-"}</td>
                      <td>{a.delai_remboursement_jours} j</td>
                      <td>{a.actif !== false ? <span className="badge badge-vert">Actif</span> : <span className="badge badge-rouge">Désactivé</span>}</td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <button className="bouton-secondaire" style={{ fontSize: 12, padding: "4px 10px", marginRight: 6 }} onClick={() => commencerEdition(a)}>Modifier</button>
                        <button className="bouton-secondaire" style={{ fontSize: 12, padding: "4px 10px" }} onClick={() => basculerActif(a)}>
                          {a.actif !== false ? "Désactiver" : "Activer"}
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
            {assurances.length === 0 && (
              <tr><td colSpan={7} style={{ color: "var(--sawali-gris)", textAlign: "center", padding: 20 }}>Aucune assurance enregistrée pour l'instant.</td></tr>
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

function OngletMessagerieWA() {
  const [config, setConfig] = useState(null);
  const [enErreur, setEnErreur] = useState(false);
  const [messageStatut, setMessageStatut] = useState("");
  const [champsSensibles, setChampsSensibles] = useState({ token_acces_systeme: "", app_secret: "", jeton_verification_webhook: "" });

  function charger() {
    setEnErreur(false);
    api.get("/messagerie/configuration").then((r) => setConfig(r.data)).catch(() => setEnErreur(true));
  }
  useEffect(charger, []);

  async function enregistrer() {
    // Les champs sensibles ne sont envoyés QUE s'ils ont été (re)saisis —
    // un champ laissé vide conserve la valeur déjà enregistrée côté serveur
    // (voir PUT /messagerie/configuration).
    const payload = { waba_id: config.waba_id, numero_telephone_id: config.numero_telephone_id, numero_telephone_affiche: config.numero_telephone_affiche, app_id: config.app_id, actif: config.actif };
    Object.entries(champsSensibles).forEach(([cle, valeur]) => { if (valeur.trim()) payload[cle] = valeur.trim(); });
    const r = await api.put("/messagerie/configuration", payload);
    setConfig(r.data);
    setChampsSensibles({ token_acces_systeme: "", app_secret: "", jeton_verification_webhook: "" });
    setMessageStatut("Configuration WhatsApp Business enregistrée.");
    setTimeout(() => setMessageStatut(""), 3000);
  }

  async function effacerChampSensible(champ) {
    if (!window.confirm("Effacer cette valeur enregistrée ?")) return;
    await api.delete(`/messagerie/configuration/champ-sensible/${champ}`);
    charger();
  }

  if (enErreur) return <div className="carte" style={{ color: "var(--sawali-rouge)" }}>Impossible de charger la configuration.<button className="bouton-secondaire" style={{ display: "block", marginTop: 10 }} onClick={charger}>Réessayer</button></div>;
  if (!config) return <div className="carte" style={{ color: "var(--sawali-gris)" }}>Chargement...</div>;

  const champSensible = (cle, libelle, placeholder) => (
    <div style={{ marginBottom: 12 }}>
      <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>{libelle}</label>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          className="champ-saisie"
          type="password"
          placeholder={config[`${cle}_renseigne`] ? "•••••••• (déjà enregistré — laisser vide pour conserver)" : placeholder}
          value={champsSensibles[cle]}
          onChange={(e) => setChampsSensibles({ ...champsSensibles, [cle]: e.target.value })}
        />
        {config[`${cle}_renseigne`] && (
          <button className="bouton-secondaire" style={{ fontSize: 12, padding: "6px 10px", whiteSpace: "nowrap" }} onClick={() => effacerChampSensible(cle)}>Effacer</button>
        )}
      </div>
    </div>
  );

  return (
    <div className="carte" style={{ maxWidth: 560 }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>Configuration WhatsApp Business (Meta)</div>
      <div style={{ fontSize: 12.5, color: "var(--sawali-gris-fonce)", marginBottom: 16 }}>
        Propre à ce cabinet — chaque cabinet de la plateforme utilise son propre numéro et ses propres identifiants Meta.
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, marginBottom: 16 }}>
        <input type="checkbox" checked={config.actif} onChange={(e) => setConfig({ ...config, actif: e.target.checked })} />
        Intégration WhatsApp active pour ce cabinet
      </label>

      <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>WABA ID</label>
          <input className="champ-saisie" value={config.waba_id || ""} onChange={(e) => setConfig({ ...config, waba_id: e.target.value })} placeholder="ID du compte WhatsApp Business" />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>Phone Number ID</label>
          <input className="champ-saisie" value={config.numero_telephone_id || ""} onChange={(e) => setConfig({ ...config, numero_telephone_id: e.target.value })} placeholder="ID du numéro (Meta)" />
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>Numéro affiché</label>
          <input className="champ-saisie" value={config.numero_telephone_affiche || ""} onChange={(e) => setConfig({ ...config, numero_telephone_affiche: e.target.value })} placeholder="+226 25 33 28 71" />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>App ID (Meta)</label>
          <input className="champ-saisie" value={config.app_id || ""} onChange={(e) => setConfig({ ...config, app_id: e.target.value })} placeholder="ID de l'application Meta" />
        </div>
      </div>

      <div style={{ borderTop: "1px solid #eef2fa", margin: "16px 0", paddingTop: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 13.5 }}>Identifiants sensibles</div>
        {champSensible("token_acces_systeme", "Token d'accès système (System User)", "EAAxxxxxxxxxx...")}
        {champSensible("app_secret", "App Secret")}
        {champSensible("jeton_verification_webhook", "Jeton de vérification du webhook")}
      </div>

      <button className="bouton-primaire" onClick={enregistrer}>Enregistrer</button>
      {messageStatut && <div style={{ color: "var(--sawali-vert)", fontSize: 13, marginTop: 8 }}>{messageStatut}</div>}
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
