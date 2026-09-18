// pages/Plateforme.jsx
// ------------------------
// Réservée aux comptes super-admin (équipe SAWALI SMART SYSTEMS) — § demande
// utilisateur : "permettre à l'Admin de créer/éditer des Cabinets Dentaires
// de la plateforme", + suivi des essais/licences et consultation des logs
// d'activité par cabinet. Distincte du module Administration (Admin.jsx),
// qui ne gère que le PROPRE cabinet de l'Administrateur connecté.

import { useState, useEffect } from "react";
import api from "../utils/api";

const ETATS = ["Actif", "En Attente", "Suspendu", "Expiré", "Inactif"];
const COULEUR_ETAT = {
  Actif: "badge-vert", "En Attente": "badge-orange", Suspendu: "badge-rouge", Expiré: "badge-rouge", Inactif: "badge-bleu",
};
const ELEMENTS_REPRODUCTIBLES = [
  { cle: "catalogue", libelle: "Catalogue des actes (ProduitClinique)" },
  { cle: "types_paiement", libelle: "Modes de paiement" },
  { cle: "assurances", libelle: "Assurances" },
];

function formaterDate(iso) {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}
function formaterDateHeure(iso) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function Plateforme() {
  const [cabinets, setCabinets] = useState(null);
  const [enErreur, setEnErreur] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [formulaireOuvert, setFormulaireOuvert] = useState(false);
  const [nouveau, setNouveau] = useState({
    denomination: "", adresse: "Ouagadougou, Burkina Faso", telephone: "", email: "", devise: "FCFA", duree_essai_jours: 30,
    elements_a_reproduire: [], cabinet_modele_code: "", admin_login: "", admin_mot_de_passe: "", admin_nom_complet: "",
  });
  const [erreurFormulaire, setErreurFormulaire] = useState("");
  const [mdpAdminVisible, setMdpAdminVisible] = useState(false);
  const [resultatCreation, setResultatCreation] = useState(null);

  const [cabinetLicenceOuvert, setCabinetLicenceOuvert] = useState(null);
  const [licences, setLicences] = useState([]);
  const [nouvelleLicence, setNouvelleLicence] = useState({ duree_renouvellement_jours: 30, duree_souscription_jours: 30 });
  const [erreurLicence, setErreurLicence] = useState("");
  const [cabinetJournalOuvert, setCabinetJournalOuvert] = useState(null);
  const [journal, setJournal] = useState([]);
  const [filtreJournal, setFiltreJournal] = useState("toutes"); // toutes | connexions
  // § demande utilisateur : bouton "Communication" (SMTP + WhatsApp) par
  // cabinet, après "Journal". "PLATEFORME" = configuration du super-admin
  // lui-même (voir carte dédiée en haut de page).
  const [cabinetCommunicationOuvert, setCabinetCommunicationOuvert] = useState(null);

  // § demande utilisateur : Module VIDAL France — configuration UNIQUE au
  // niveau plateforme (abonnement SAWALI SMART SYSTEMS), pas par cabinet.
  const [vidalOuvert, setVidalOuvert] = useState(false);
  const [configVidal, setConfigVidal] = useState(null);
  const [messageVidal, setMessageVidal] = useState("");

  function chargerVidal() {
    api.get("/plateforme/vidal").then((r) => setConfigVidal(r.data));
  }
  useEffect(() => { if (vidalOuvert && !configVidal) chargerVidal(); }, [vidalOuvert]);

  async function enregistrerVidal() {
    const payload = { ...configVidal };
    // Les clés masquées ne sont jamais ré-envoyées telles quelles — seules
    // les valeurs effectivement retapées (non vides) partent au serveur.
    if (!payload.test_app_key) delete payload.test_app_key;
    if (!payload.production_app_key) delete payload.production_app_key;
    delete payload.test_app_key_renseigne; delete payload.production_app_key_renseigne;
    const r = await api.put("/plateforme/vidal", payload);
    setConfigVidal(r.data);
    setMessageVidal("✅ Configuration VIDAL enregistrée.");
    setTimeout(() => setMessageVidal(""), 3000);
  }

  // § demande utilisateur : catalogue de thèmes maintenu par le super-admin,
  // proposé ensuite au choix de chaque cabinet (Administration → Cabinet).
  const [themes, setThemes] = useState([]);
  const [themeOuvert, setThemeOuvert] = useState(false);
  const [nouveauTheme, setNouveauTheme] = useState({ code: "", nom: "", couleur_primaire: "#1c4587", couleur_primaire_claire: "#2f6fed", couleur_accent: "#4fc3f7" });
  const [erreurTheme, setErreurTheme] = useState("");

  function charger() {
    setEnErreur(false);
    api.get("/plateforme/cabinets").then((r) => setCabinets(r.data)).catch(() => setEnErreur(true));
    api.get("/plateforme/notifications", { params: { non_lues_seulement: true } }).then((r) => setNotifications(r.data)).catch(() => {});
    api.get("/themes/tous").then((r) => setThemes(r.data)).catch(() => {});
  }
  useEffect(charger, []);

  async function creerTheme() {
    if (!nouveauTheme.code.trim() || !nouveauTheme.nom.trim()) return setErreurTheme("Code et nom sont obligatoires.");
    setErreurTheme("");
    try {
      await api.post("/themes", nouveauTheme);
      setNouveauTheme({ code: "", nom: "", couleur_primaire: "#1c4587", couleur_primaire_claire: "#2f6fed", couleur_accent: "#4fc3f7" });
      charger();
    } catch (err) {
      setErreurTheme(err.response?.data?.detail || "Erreur lors de la création.");
    }
  }
  async function basculerActifTheme(theme) {
    await api.put(`/themes/${theme.code}`, { actif: theme.actif === false });
    charger();
  }
  async function supprimerTheme(theme) {
    if (!window.confirm(`Supprimer le thème « ${theme.nom} » ? Les cabinets l'ayant choisi repasseront au thème par défaut.`)) return;
    await api.delete(`/themes/${theme.code}`);
    charger();
  }

  function basculerElement(cle) {
    setNouveau((n) => ({
      ...n,
      elements_a_reproduire: n.elements_a_reproduire.includes(cle)
        ? n.elements_a_reproduire.filter((e) => e !== cle)
        : [...n.elements_a_reproduire, cle],
    }));
  }

  async function creerCabinet() {
    if (!nouveau.denomination.trim()) return setErreurFormulaire("La dénomination du cabinet est obligatoire.");
    if (!nouveau.admin_login.trim() || !nouveau.admin_mot_de_passe.trim()) return setErreurFormulaire("Le login et le mot de passe du premier Administrateur sont obligatoires.");
    setErreurFormulaire("");
    try {
      const r = await api.post("/plateforme/cabinets", {
        ...nouveau,
        duree_essai_jours: Number(nouveau.duree_essai_jours) || 30,
        cabinet_modele_code: nouveau.cabinet_modele_code || null,
      });
      setResultatCreation(r.data);
      setFormulaireOuvert(false);
      setNouveau({
        denomination: "", adresse: "Ouagadougou, Burkina Faso", telephone: "", email: "", devise: "FCFA", duree_essai_jours: 30,
        elements_a_reproduire: [], cabinet_modele_code: "", admin_login: "", admin_mot_de_passe: "", admin_nom_complet: "",
      });
      charger();
    } catch (err) {
      setErreurFormulaire(err.response?.data?.detail || "Erreur lors de la création du cabinet.");
    }
  }

  async function changerEtat(cabinet, etat) {
    await api.put(`/plateforme/cabinets/${cabinet.code_cabinet}/etat`, null, { params: { etat } });
    charger();
  }

  async function marquerNotificationLue(numero) {
    await api.put(`/plateforme/notifications/${numero}/lue`);
    setNotifications((n) => n.filter((x) => x.numero_enreg !== numero));
  }

  function ouvrirLicences(codeCabinet) {
    setCabinetLicenceOuvert(codeCabinet);
    setErreurLicence("");
    api.get(`/plateforme/cabinets/${codeCabinet}/licences`).then((r) => setLicences(r.data));
  }

  async function genererLicence() {
    try {
      await api.post(`/plateforme/cabinets/${cabinetLicenceOuvert}/licences`, {
        duree_renouvellement_jours: Number(nouvelleLicence.duree_renouvellement_jours),
        duree_souscription_jours: Number(nouvelleLicence.duree_souscription_jours),
      });
      ouvrirLicences(cabinetLicenceOuvert);
      charger();
    } catch (err) {
      setErreurLicence(err.response?.data?.detail || "Erreur lors de la génération de la licence.");
    }
  }

  function ouvrirJournal(codeCabinet) {
    setCabinetJournalOuvert(codeCabinet);
    setFiltreJournal("toutes");
    api.get(`/plateforme/cabinets/${codeCabinet}/journal`).then((r) => setJournal(r.data));
  }

  const ICONE_ACTION = {
    connexion: "🟢", connexion_echouee: "🔴", creation_compte: "👤", modification_compte: "✏️",
    suppression_compte: "🗑️", creation_recu: "🧾", creation_proforma: "📄",
  };
  function iconePour(action) {
    return ICONE_ACTION[action] || (action?.startsWith("connexion") ? "🔑" : "•");
  }
  const journalFiltre = journal.filter((j) => filtreJournal === "toutes" || (j.action || "").startsWith("connexion"));

  return (
    <div>
      <div className="titre-page">Plateforme SAWALI DentalCare</div>
      <div className="sous-titre-page">Cabinets dentaires clients — création, essais/licences, état d'abonnement.</div>

      <div className="carte" style={{ marginTop: 16, marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, background: "linear-gradient(135deg, #eef2ff, #eef9ff)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 28 }}>🛰️</span>
          <div>
            <div style={{ fontWeight: 700 }}>Ma configuration — Plateforme</div>
            <div style={{ fontSize: 12, color: "var(--sawali-gris-fonce)" }}>SMTP &amp; WhatsApp du super-admin (notifications plateforme : expirations, alertes...)</div>
          </div>
        </div>
        <button className="bouton-primaire" onClick={() => setCabinetCommunicationOuvert("PLATEFORME")}>📡 Communication</button>
      </div>

      {notifications.length > 0 && (
        <div className="carte" style={{ marginBottom: 20, borderLeft: "4px solid var(--sawali-orange)" }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>🔔 Notifications ({notifications.length})</div>
          {notifications.map((n) => (
            <div key={n.numero_enreg} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: "1px solid #f0f2f7", fontSize: 13 }}>
              <span>{n.message}</span>
              <button className="bouton-secondaire" style={{ fontSize: 11, padding: "3px 8px", whiteSpace: "nowrap" }} onClick={() => marquerNotificationLue(n.numero_enreg)}>✓ Marquer lue</button>
            </div>
          ))}
        </div>
      )}

      {resultatCreation && (
        <div className="carte" style={{ marginBottom: 20, borderLeft: "4px solid var(--sawali-vert)" }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Cabinet créé — code {resultatCreation.cabinet.code_cabinet}</div>
          <div style={{ fontSize: 13, color: "var(--sawali-gris-fonce)" }}>
            Premier Administrateur : <strong>{resultatCreation.admin_login}</strong> (communiquez le mot de passe choisi séparément).
            {resultatCreation.elements_copies?.length > 0 && (
              <div style={{ marginTop: 6 }}>
                Éléments reproduits : {resultatCreation.elements_copies.map((e) => `${e.element} (${e.nombre})`).join(", ")}
              </div>
            )}
          </div>
          <button className="bouton-secondaire" style={{ marginTop: 10, fontSize: 12, padding: "4px 10px" }} onClick={() => setResultatCreation(null)}>Fermer</button>
        </div>
      )}

      <div style={{ marginBottom: 20 }}>
        <button className="bouton-primaire" onClick={() => setFormulaireOuvert(!formulaireOuvert)}>
          {formulaireOuvert ? "✕ Annuler" : "🏥 Nouveau cabinet"}
        </button>
        <button className="bouton-secondaire" style={{ marginLeft: 8 }} onClick={() => setThemeOuvert(!themeOuvert)}>
          {themeOuvert ? "✕ Fermer" : "🎨 Gérer les thèmes"}
        </button>
        <button className="bouton-secondaire" style={{ marginLeft: 8 }} onClick={() => setVidalOuvert(!vidalOuvert)}>
          {vidalOuvert ? "✕ Fermer" : "💊 Module VIDAL France"}
        </button>
      </div>

      {vidalOuvert && (
        <div className="carte" style={{ marginBottom: 20, maxWidth: 780 }}>
          {!configVidal ? (
            <div style={{ color: "var(--sawali-gris)" }}>Chargement...</div>
          ) : (
            <>
              <div style={{ fontSize: 13, color: "var(--sawali-gris-fonce)", marginBottom: 16 }}>
                💊 Module VIDAL France — recherche médicament, monographies (RCP), catalogue réglementaire et analyse de prescriptions (interactions, contre-indications, allergies). Abonnement de la plateforme, partagé par tous les cabinets actifs. Configurez 2 environnements et basculez via Mode.
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, cursor: "pointer" }}>
                  <input type="checkbox" checked={!!configVidal.module_actif} onChange={(e) => setConfigVidal({ ...configVidal, module_actif: e.target.checked })} />
                  Module VIDAL activé
                </label>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Mode actif</label>
                  <select className="champ-saisie" value={configVidal.mode_actif} onChange={(e) => setConfigVidal({ ...configVidal, mode_actif: e.target.value })}>
                    <option value="test">🧪 Test</option>
                    <option value="production">🚀 Production</option>
                  </select>
                </div>
              </div>

              {["test", "production"].map((env) => (
                <div key={env} style={{ border: `1.5px solid ${env === configVidal.mode_actif ? "var(--sawali-rouge)" : "var(--sawali-vert)"}`, borderRadius: 10, padding: 14, marginBottom: 14 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>{env === "test" ? "🧪 Environnement TEST" : "🚀 Environnement PRODUCTION"}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                    <div>
                      <label style={{ fontSize: 11.5, fontWeight: 600, display: "block", marginBottom: 3 }}>Base URL</label>
                      <input className="champ-saisie" style={{ fontSize: 12.5 }} value={configVidal[`${env}_base_url`] || ""} onChange={(e) => setConfigVidal({ ...configVidal, [`${env}_base_url`]: e.target.value })} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11.5, fontWeight: 600, display: "block", marginBottom: 3 }}>app_id</label>
                      <input className="champ-saisie" style={{ fontSize: 12.5 }} value={configVidal[`${env}_app_id`] || ""} onChange={(e) => setConfigVidal({ ...configVidal, [`${env}_app_id`]: e.target.value })} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11.5, fontWeight: 600, display: "block", marginBottom: 3 }}>app_key</label>
                      <input className="champ-saisie" style={{ fontSize: 12.5 }} type="password" placeholder={configVidal[`${env}_app_key_renseigne`] ? "••••••••" : ""} value={configVidal[`${env}_app_key`] || ""} onChange={(e) => setConfigVidal({ ...configVidal, [`${env}_app_key`]: e.target.value })} />
                      {configVidal[`${env}_app_key_renseigne`] && !configVidal[`${env}_app_key`] && (
                        <div style={{ fontSize: 10.5, color: "var(--sawali-orange)", marginTop: 2 }}>Clé masquée — écrire pour remplacer.</div>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 3 }}>TTL cache (heures)</label>
                  <input className="champ-saisie" type="number" value={configVidal.ttl_cache_heures} onChange={(e) => setConfigVidal({ ...configVidal, ttl_cache_heures: Number(e.target.value) })} />
                  <div style={{ fontSize: 10.5, color: "var(--sawali-gris)" }}>168 = 7 jours (recommandé)</div>
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 3 }}>Quota / utilisateur / jour</label>
                  <input className="champ-saisie" type="number" value={configVidal.quota_utilisateur_jour} onChange={(e) => setConfigVidal({ ...configVidal, quota_utilisateur_jour: Number(e.target.value) })} />
                  <div style={{ fontSize: 10.5, color: "var(--sawali-gris)" }}>0 = illimité</div>
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 3 }}>Timeout HTTP (secondes)</label>
                  <input className="champ-saisie" type="number" value={configVidal.timeout_http_secondes} onChange={(e) => setConfigVidal({ ...configVidal, timeout_http_secondes: Number(e.target.value) })} />
                  <div style={{ fontSize: 10.5, color: "var(--sawali-gris)" }}>2 à 60</div>
                </div>
              </div>

              <button className="bouton-primaire" onClick={enregistrerVidal}>💾 Enregistrer</button>
              {messageVidal && <span style={{ marginLeft: 10, color: "var(--sawali-vert)", fontSize: 13 }}>{messageVidal}</span>}
            </>
          )}
        </div>
      )}

      {themeOuvert && (
        <div className="carte" style={{ marginBottom: 20, maxWidth: 680 }}>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>🎨 Catalogue de thèmes (proposés à chaque cabinet)</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
            <input className="champ-saisie" style={{ flex: "1 1 120px" }} placeholder="Code (ex: vert-emeraude)" value={nouveauTheme.code} onChange={(e) => setNouveauTheme({ ...nouveauTheme, code: e.target.value })} />
            <input className="champ-saisie" style={{ flex: "1 1 160px" }} placeholder="Nom affiché" value={nouveauTheme.nom} onChange={(e) => setNouveauTheme({ ...nouveauTheme, nom: e.target.value })} />
            <input type="color" value={nouveauTheme.couleur_primaire} onChange={(e) => setNouveauTheme({ ...nouveauTheme, couleur_primaire: e.target.value })} title="Couleur primaire" style={{ width: 36, height: 36, border: "none", borderRadius: 6, cursor: "pointer" }} />
            <input type="color" value={nouveauTheme.couleur_primaire_claire} onChange={(e) => setNouveauTheme({ ...nouveauTheme, couleur_primaire_claire: e.target.value })} title="Couleur primaire claire (survol)" style={{ width: 36, height: 36, border: "none", borderRadius: 6, cursor: "pointer" }} />
            <input type="color" value={nouveauTheme.couleur_accent} onChange={(e) => setNouveauTheme({ ...nouveauTheme, couleur_accent: e.target.value })} title="Couleur accent" style={{ width: 36, height: 36, border: "none", borderRadius: 6, cursor: "pointer" }} />
            <button className="bouton-primaire" style={{ fontSize: 12.5 }} onClick={creerTheme}>+ Ajouter</button>
          </div>
          {erreurTheme && <div style={{ color: "var(--sawali-rouge)", fontSize: 13, marginBottom: 10 }}>{erreurTheme}</div>}
          {themes.map((t) => (
            <div key={t.code} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #f0f2f7" }}>
              <div style={{ display: "flex", gap: 3 }}>
                {[t.couleur_primaire, t.couleur_primaire_claire, t.couleur_accent].map((c, i) => (
                  <span key={i} style={{ width: 18, height: 18, borderRadius: "50%", background: c, display: "inline-block", boxShadow: "0 0 0 1px #e2e8f0" }} />
                ))}
              </div>
              <div style={{ flex: 1, fontSize: 13.5 }}>{t.nom} <span style={{ color: "var(--sawali-gris)", fontSize: 11.5 }}>({t.code})</span></div>
              <span className={t.actif !== false ? "badge badge-vert" : "badge badge-rouge"} style={{ fontSize: 10.5 }}>{t.actif !== false ? "Actif" : "Désactivé"}</span>
              <button className="bouton-secondaire" style={{ fontSize: 11, padding: "3px 8px" }} onClick={() => basculerActifTheme(t)}>{t.actif !== false ? "Désactiver" : "Activer"}</button>
              <button style={{ fontSize: 11, padding: "3px 8px", border: "1.5px solid var(--sawali-rouge)", borderRadius: 8, background: "transparent", color: "var(--sawali-rouge)", cursor: "pointer" }} onClick={() => supprimerTheme(t)}>Supprimer</button>
            </div>
          ))}
          {themes.length === 0 && <div style={{ color: "var(--sawali-gris)", fontSize: 13 }}>Aucun thème créé pour l'instant — les cabinets utilisent le thème SAWALI par défaut.</div>}
        </div>
      )}

      {formulaireOuvert && (
        <div className="carte" style={{ marginBottom: 20, maxWidth: 560 }}>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>Nouveau cabinet dentaire</div>
          <div style={{ display: "flex", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
            <input className="champ-saisie" style={{ flex: "1 1 240px" }} placeholder="Dénomination du cabinet" value={nouveau.denomination} onChange={(e) => setNouveau({ ...nouveau, denomination: e.target.value })} />
            <input className="champ-saisie" style={{ flex: "1 1 200px" }} placeholder="Adresse" value={nouveau.adresse} onChange={(e) => setNouveau({ ...nouveau, adresse: e.target.value })} />
          </div>
          <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
            <input className="champ-saisie" style={{ flex: "1 1 160px" }} placeholder="Téléphone" value={nouveau.telephone} onChange={(e) => setNouveau({ ...nouveau, telephone: e.target.value })} />
            <input className="champ-saisie" style={{ flex: "1 1 200px" }} placeholder="Email" value={nouveau.email} onChange={(e) => setNouveau({ ...nouveau, email: e.target.value })} />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>Durée de la période d'essai (jours)</label>
            <div style={{ fontSize: 12, color: "var(--sawali-gris-fonce)", marginBottom: 4 }}>
              Décomptée depuis la date de création du cabinet. Passé ce délai sans licence générée, le cabinet est suspendu automatiquement.
            </div>
            <input className="champ-saisie" type="number" min="0" style={{ maxWidth: 140 }} value={nouveau.duree_essai_jours} onChange={(e) => setNouveau({ ...nouveau, duree_essai_jours: e.target.value })} />
          </div>

          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Reproduire depuis un cabinet existant (facultatif)</div>
          <div style={{ fontSize: 12, color: "var(--sawali-gris-fonce)", marginBottom: 8 }}>
            Jamais les Patients, reçus, Médecins ou Rendez-vous — toujours vides pour un nouveau cabinet.
          </div>
          <select className="champ-saisie" style={{ marginBottom: 8 }} value={nouveau.cabinet_modele_code} onChange={(e) => setNouveau({ ...nouveau, cabinet_modele_code: e.target.value })}>
            <option value="">Aucun (démarrer vide)</option>
            {(cabinets || []).map((c) => <option key={c.code_cabinet} value={c.code_cabinet}>{c.code_cabinet} — {c.denomination}</option>)}
          </select>
          {nouveau.cabinet_modele_code && (
            <div style={{ marginBottom: 14 }}>
              {ELEMENTS_REPRODUCTIBLES.map((el) => (
                <label key={el.cle} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "3px 0" }}>
                  <input type="checkbox" checked={nouveau.elements_a_reproduire.includes(el.cle)} onChange={() => basculerElement(el.cle)} />
                  {el.libelle}
                </label>
              ))}
            </div>
          )}

          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Premier compte Administrateur de ce cabinet</div>
          <div style={{ display: "flex", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
            <input className="champ-saisie" style={{ flex: "1 1 160px" }} placeholder="Login" value={nouveau.admin_login} onChange={(e) => setNouveau({ ...nouveau, admin_login: e.target.value })} />
            <div style={{ position: "relative", flex: "1 1 160px" }}>
              <input className="champ-saisie" style={{ width: "100%", paddingRight: 34 }} type={mdpAdminVisible ? "text" : "password"} placeholder="Mot de passe" value={nouveau.admin_mot_de_passe} onChange={(e) => setNouveau({ ...nouveau, admin_mot_de_passe: e.target.value })} />
              <button type="button" onClick={() => setMdpAdminVisible((v) => !v)} title={mdpAdminVisible ? "Masquer" : "Afficher"} style={{ position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)", border: "none", background: "none", cursor: "pointer", fontSize: 14 }}>
                {mdpAdminVisible ? "🙈" : "👁️"}
              </button>
            </div>
          </div>
          <input className="champ-saisie" placeholder="Nom complet (facultatif)" value={nouveau.admin_nom_complet} onChange={(e) => setNouveau({ ...nouveau, admin_nom_complet: e.target.value })} style={{ marginBottom: 12 }} />

          {erreurFormulaire && <div style={{ color: "var(--sawali-rouge)", fontSize: 13, marginBottom: 10 }}>{erreurFormulaire}</div>}
          <button className="bouton-primaire" onClick={creerCabinet}>🏥 Créer le cabinet</button>
        </div>
      )}

      <div className="carte" style={{ overflowX: "auto" }}>
        {enErreur && (
          <div style={{ color: "var(--sawali-rouge)", marginBottom: 12 }}>
            Impossible de charger la liste des cabinets.
            <button className="bouton-secondaire" style={{ display: "block", marginTop: 10 }} onClick={charger}>Réessayer</button>
          </div>
        )}
        {cabinets === null && !enErreur && <div style={{ color: "var(--sawali-gris)" }}>Chargement...</div>}
        {cabinets && (
          <table className="tableau-donnees" style={{ minWidth: 1080 }}>
            <thead><tr><th>Code</th><th>Dénomination</th><th>Dentiste principal</th><th>État</th><th>Créé le</th><th>Modifié le</th><th>Essai</th><th>Licence expire le</th><th>Actions</th></tr></thead>
            <tbody>
              {cabinets.map((c) => (
                <tr key={c.code_cabinet}>
                  <td>{c.code_cabinet}</td>
                  <td>{c.denomination}</td>
                  <td>{c.dentiste_principal_nom || "—"}</td>
                  <td><span className={`badge ${COULEUR_ETAT[c.etat] || "badge-bleu"}`}>{c.etat}</span></td>
                  <td>{formaterDate(c.date_creation)}</td>
                  <td>{formaterDate(c.date_derniere_modification)}</td>
                  <td className="chiffre">{c.duree_essai_jours != null ? `${c.duree_essai_jours} j` : "-"}</td>
                  <td>{c.licence_expiration ? formaterDate(c.licence_expiration) : "—"}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <select className="champ-saisie" style={{ fontSize: 12, padding: "4px 8px", width: 120, marginRight: 6 }} value={c.etat} onChange={(e) => changerEtat(c, e.target.value)}>
                      {ETATS.map((e) => <option key={e} value={e}>{e}</option>)}
                    </select>
                    <button className="bouton-secondaire" style={{ fontSize: 12, padding: "4px 8px", marginRight: 6 }} onClick={() => ouvrirLicences(c.code_cabinet)}>🪪 Licence</button>
                    <button className="bouton-secondaire" style={{ fontSize: 12, padding: "4px 8px", marginRight: 6 }} onClick={() => ouvrirJournal(c.code_cabinet)}>📋 Journal</button>
                    <button className="bouton-secondaire" style={{ fontSize: 12, padding: "4px 8px" }} onClick={() => setCabinetCommunicationOuvert(c.code_cabinet)}>📡 Communication</button>
                  </td>
                </tr>
              ))}
              {cabinets.length === 0 && (
                <tr><td colSpan={9} style={{ color: "var(--sawali-gris)", textAlign: "center", padding: 20 }}>Aucun cabinet créé pour l'instant.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {cabinetLicenceOuvert && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(20,30,50,0.45)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setCabinetLicenceOuvert(null)}>
          <div className="carte" style={{ width: 520, maxWidth: "100%", maxHeight: "85vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontWeight: 700 }}>Licence — cabinet {cabinetLicenceOuvert}</div>
              <button onClick={() => setCabinetLicenceOuvert(null)} style={{ border: "none", background: "none", fontSize: 18, cursor: "pointer" }}>✕</button>
            </div>

            <div style={{ background: "var(--sawali-gris-clair)", borderRadius: 8, padding: 14, marginBottom: 16 }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Générer une nouvelle licence</div>
              <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12, display: "block", marginBottom: 2 }}>Durée de souscription (jours)</label>
                  <input className="champ-saisie" type="number" min="1" value={nouvelleLicence.duree_souscription_jours} onChange={(e) => setNouvelleLicence({ ...nouvelleLicence, duree_souscription_jours: e.target.value })} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12, display: "block", marginBottom: 2 }}>Cycle de renouvellement (jours)</label>
                  <input className="champ-saisie" type="number" min="1" value={nouvelleLicence.duree_renouvellement_jours} onChange={(e) => setNouvelleLicence({ ...nouvelleLicence, duree_renouvellement_jours: e.target.value })} />
                </div>
              </div>
              {erreurLicence && <div style={{ color: "var(--sawali-rouge)", fontSize: 12.5, marginBottom: 8 }}>{erreurLicence}</div>}
              <button className="bouton-primaire" style={{ fontSize: 13 }} onClick={genererLicence}>🪪 Générer la licence</button>
              <div style={{ fontSize: 11.5, color: "var(--sawali-gris-fonce)", marginTop: 6 }}>Réactive automatiquement le cabinet s'il était suspendu.</div>
            </div>

            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Historique</div>
            {licences.length === 0 && <div style={{ color: "var(--sawali-gris)", fontSize: 13 }}>Aucune licence générée pour l'instant.</div>}
            {licences.map((l) => (
              <div key={l.numero_enreg} style={{ padding: "8px 0", borderBottom: "1px solid #f0f2f7", fontSize: 12.5 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span><strong>{l.duree_souscription_jours} j</strong> — du {formaterDate(l.date_renouvellement)} au {formaterDate(l.date_expiration)}</span>
                  <span className={`badge ${l.statut === "Active" ? "badge-vert" : l.statut === "Expirée" ? "badge-rouge" : "badge-bleu"}`}>{l.statut}</span>
                </div>
                <div style={{ color: "var(--sawali-gris-fonce)" }}>Généré par {l.genere_par} le {formaterDateHeure(l.date_creation)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {cabinetJournalOuvert && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(20,30,50,0.45)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setCabinetJournalOuvert(null)}>
          <div className="carte" style={{ width: 680, maxWidth: "100%", maxHeight: "85vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontWeight: 700 }}>📋 Journal d'activité — cabinet {cabinetJournalOuvert}</div>
              <button onClick={() => setCabinetJournalOuvert(null)} style={{ border: "none", background: "none", fontSize: 18, cursor: "pointer" }}>✕</button>
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              <button onClick={() => setFiltreJournal("toutes")} className={filtreJournal === "toutes" ? "badge badge-bleu" : "badge"} style={{ border: "1px solid #e2e8f0", cursor: "pointer", padding: "6px 12px" }}>📜 Toutes les actions</button>
              <button onClick={() => setFiltreJournal("connexions")} className={filtreJournal === "connexions" ? "badge badge-bleu" : "badge"} style={{ border: "1px solid #e2e8f0", cursor: "pointer", padding: "6px 12px" }}>🔑 Connexions uniquement</button>
            </div>
            {journalFiltre.length === 0 && <div style={{ color: "var(--sawali-gris)", fontSize: 13 }}>Aucune activité enregistrée{filtreJournal === "connexions" ? " (aucune connexion)" : ""} pour ce cabinet.</div>}
            <table className="tableau-donnees">
              <thead><tr><th>Date/Heure</th><th>Utilisateur</th><th>Action</th></tr></thead>
              <tbody>
                {journalFiltre.map((j, i) => (
                  <tr key={i}>
                    <td style={{ whiteSpace: "nowrap" }}>{formaterDateHeure(j.date_heure)}</td>
                    <td>{j.login}</td>
                    <td>
                      {iconePour(j.action)} {j.action}
                      {j.action === "connexion_echouee" && j.details?.motif && <span style={{ color: "var(--sawali-gris-fonce)", fontSize: 11 }}> — {j.details.motif}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {cabinetCommunicationOuvert && (
        <CommunicationModal
          codeCabinet={cabinetCommunicationOuvert}
          autresCabinets={(cabinets || []).filter((c) => c.code_cabinet !== cabinetCommunicationOuvert)}
          onClose={() => setCabinetCommunicationOuvert(null)}
        />
      )}
    </div>
  );
}

// ============================================================================
// Modale Communication (SMTP + WhatsApp) — § demande utilisateur : bouton
// dédié par cabinet, réservé au super-admin, avec copie sécurisée entre
// cabinets (les valeurs sensibles ne transitent jamais par le navigateur).
// ============================================================================
function CommunicationModal({ codeCabinet, autresCabinets, onClose }) {
  const [onglet, setOnglet] = useState("smtp"); // smtp | whatsapp
  const [config, setConfig] = useState(null);
  const [smtp, setSmtp] = useState({});
  const [smtpMdp, setSmtpMdp] = useState("");
  const [wa, setWa] = useState({});
  const [waSensibles, setWaSensibles] = useState({ token_acces_systeme: "", app_secret: "", jeton_verification_webhook: "" });
  const [cabinetSource, setCabinetSource] = useState("");
  const [message, setMessage] = useState("");
  const [erreur, setErreur] = useState("");

  function charger() {
    api.get(`/plateforme/cabinets/${codeCabinet}/communication`).then((r) => {
      setConfig(r.data);
      setSmtp(r.data.smtp || {});
      setWa(r.data.whatsapp || {});
      setSmtpMdp("");
      setWaSensibles({ token_acces_systeme: "", app_secret: "", jeton_verification_webhook: "" });
    });
  }
  useEffect(charger, [codeCabinet]);

  async function enregistrerSmtp() {
    setErreur(""); setMessage("");
    try {
      const payload = { ...smtp };
      if (smtpMdp.trim()) payload.mot_de_passe = smtpMdp.trim();
      await api.put(`/plateforme/cabinets/${codeCabinet}/communication/smtp`, payload);
      setMessage("✅ Configuration SMTP enregistrée.");
      charger();
    } catch (err) { setErreur(err.response?.data?.detail || "Erreur lors de l'enregistrement."); }
  }

  async function enregistrerWa() {
    setErreur(""); setMessage("");
    try {
      const payload = { ...wa };
      Object.entries(waSensibles).forEach(([cle, valeur]) => { if (valeur.trim()) payload[cle] = valeur.trim(); });
      await api.put(`/plateforme/cabinets/${codeCabinet}/communication/whatsapp`, payload);
      setMessage("✅ Configuration WhatsApp enregistrée.");
      charger();
    } catch (err) { setErreur(err.response?.data?.detail || "Erreur lors de l'enregistrement."); }
  }

  async function copierDepuis() {
    if (!cabinetSource) return setErreur("Choisissez un cabinet source.");
    setErreur(""); setMessage("");
    try {
      await api.post(`/plateforme/cabinets/${codeCabinet}/communication/copier`, { code_cabinet_source: cabinetSource, elements: [onglet === "smtp" ? "smtp" : "whatsapp"] });
      setMessage(`📋 Configuration ${onglet === "smtp" ? "SMTP" : "WhatsApp"} copiée depuis ${cabinetSource}.`);
      charger();
    } catch (err) { setErreur(err.response?.data?.detail || "Erreur lors de la copie."); }
  }

  async function effacerChampSensible(type, champ) {
    if (!window.confirm("Effacer cette valeur enregistrée ?")) return;
    await api.delete(`/plateforme/cabinets/${codeCabinet}/communication/${type}/champ-sensible/${champ}`);
    charger();
  }

  const champMdp = (valeur, onChange, renseigne, placeholder) => (
    <input className="champ-saisie" type="password" value={valeur} onChange={onChange} placeholder={renseigne ? "•••••••• (déjà enregistré — laisser vide pour conserver)" : placeholder} />
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(20,30,50,0.45)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div className="carte" style={{ width: 560, maxWidth: "100%", maxHeight: "88vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontWeight: 700 }}>📡 Communication — {codeCabinet === "PLATEFORME" ? "Plateforme (super-admin)" : `cabinet ${codeCabinet}`}</div>
          <button onClick={onClose} style={{ border: "none", background: "none", fontSize: 18, cursor: "pointer" }}>✕</button>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <button onClick={() => { setOnglet("smtp"); setErreur(""); setMessage(""); }} className={onglet === "smtp" ? "bouton-primaire" : "bouton-secondaire"} style={{ flex: 1 }}>📧 SMTP</button>
          <button onClick={() => { setOnglet("whatsapp"); setErreur(""); setMessage(""); }} className={onglet === "whatsapp" ? "bouton-primaire" : "bouton-secondaire"} style={{ flex: 1 }}>💬 WhatsApp</button>
        </div>

        {autresCabinets.length > 0 && (
          <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center", background: "var(--sawali-gris-clair)", borderRadius: 8, padding: 10 }}>
            <select className="champ-saisie" style={{ flex: 1 }} value={cabinetSource} onChange={(e) => setCabinetSource(e.target.value)}>
              <option value="">Copier depuis...</option>
              {autresCabinets.map((c) => <option key={c.code_cabinet} value={c.code_cabinet}>{c.code_cabinet} — {c.denomination}</option>)}
            </select>
            <button className="bouton-secondaire" style={{ fontSize: 12, whiteSpace: "nowrap" }} onClick={copierDepuis}>📋 Copier</button>
          </div>
        )}

        {!config && <div style={{ color: "var(--sawali-gris)" }}>Chargement...</div>}

        {config && onglet === "smtp" && (
          <div>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <input className="champ-saisie" style={{ flex: 2 }} placeholder="Hôte (ex: smtp.gmail.com)" value={smtp.hote || ""} onChange={(e) => setSmtp({ ...smtp, hote: e.target.value })} />
              <input className="champ-saisie" style={{ flex: 1 }} type="number" placeholder="Port" value={smtp.port || 587} onChange={(e) => setSmtp({ ...smtp, port: Number(e.target.value) })} />
            </div>
            <input className="champ-saisie" placeholder="Utilisateur SMTP" value={smtp.utilisateur || ""} onChange={(e) => setSmtp({ ...smtp, utilisateur: e.target.value })} style={{ marginBottom: 8 }} />
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
              {champMdp(smtpMdp, (e) => setSmtpMdp(e.target.value), smtp.mot_de_passe_renseigne, "Mot de passe SMTP")}
              {smtp.mot_de_passe_renseigne && <button className="bouton-secondaire" style={{ fontSize: 11, padding: "6px 10px", whiteSpace: "nowrap" }} onClick={() => effacerChampSensible("smtp", "mot_de_passe")}>Effacer</button>}
            </div>
            <input className="champ-saisie" placeholder="Adresse expéditeur" value={smtp.adresse_expediteur || ""} onChange={(e) => setSmtp({ ...smtp, adresse_expediteur: e.target.value })} style={{ marginBottom: 8 }} />
            <input className="champ-saisie" placeholder="Nom expéditeur" value={smtp.nom_expediteur || ""} onChange={(e) => setSmtp({ ...smtp, nom_expediteur: e.target.value })} style={{ marginBottom: 10 }} />
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 6 }}>
              <input type="checkbox" checked={smtp.utiliser_tls !== false} onChange={(e) => setSmtp({ ...smtp, utiliser_tls: e.target.checked })} /> Utiliser TLS
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 16 }}>
              <input type="checkbox" checked={!!smtp.actif} onChange={(e) => setSmtp({ ...smtp, actif: e.target.checked })} /> Configuration active
            </label>
            <button className="bouton-primaire" onClick={enregistrerSmtp}>💾 Enregistrer</button>
          </div>
        )}

        {config && onglet === "whatsapp" && (
          <div>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <input className="champ-saisie" placeholder="WABA ID" value={wa.waba_id || ""} onChange={(e) => setWa({ ...wa, waba_id: e.target.value })} />
              <input className="champ-saisie" placeholder="Phone Number ID" value={wa.numero_telephone_id || ""} onChange={(e) => setWa({ ...wa, numero_telephone_id: e.target.value })} />
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <input className="champ-saisie" placeholder="Numéro affiché" value={wa.numero_telephone_affiche || ""} onChange={(e) => setWa({ ...wa, numero_telephone_affiche: e.target.value })} />
              <input className="champ-saisie" placeholder="App ID (Meta)" value={wa.app_id || ""} onChange={(e) => setWa({ ...wa, app_id: e.target.value })} />
            </div>
            {[
              ["token_acces_systeme", "Token d'accès système"],
              ["app_secret", "App Secret"],
              ["jeton_verification_webhook", "Jeton de vérification webhook"],
            ].map(([cle, libelle]) => (
              <div key={cle} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                {champMdp(waSensibles[cle], (e) => setWaSensibles({ ...waSensibles, [cle]: e.target.value }), wa[`${cle}_renseigne`], libelle)}
                {wa[`${cle}_renseigne`] && <button className="bouton-secondaire" style={{ fontSize: 11, padding: "6px 10px", whiteSpace: "nowrap" }} onClick={() => effacerChampSensible("whatsapp", cle)}>Effacer</button>}
              </div>
            ))}
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, margin: "10px 0 16px" }}>
              <input type="checkbox" checked={!!wa.actif} onChange={(e) => setWa({ ...wa, actif: e.target.checked })} /> Configuration active
            </label>
            <button className="bouton-primaire" onClick={enregistrerWa}>💾 Enregistrer</button>
          </div>
        )}

        {message && <div style={{ color: "var(--sawali-vert)", fontSize: 13, marginTop: 10 }}>{message}</div>}
        {erreur && <div style={{ color: "var(--sawali-rouge)", fontSize: 13, marginTop: 10 }}>{erreur}</div>}
      </div>
    </div>
  );
}
