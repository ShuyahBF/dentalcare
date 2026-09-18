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
  const [resultatCreation, setResultatCreation] = useState(null);

  const [cabinetLicenceOuvert, setCabinetLicenceOuvert] = useState(null);
  const [licences, setLicences] = useState([]);
  const [nouvelleLicence, setNouvelleLicence] = useState({ duree_renouvellement_jours: 30, duree_souscription_jours: 30 });
  const [erreurLicence, setErreurLicence] = useState("");
  const [cabinetJournalOuvert, setCabinetJournalOuvert] = useState(null);
  const [journal, setJournal] = useState([]);

  function charger() {
    setEnErreur(false);
    api.get("/plateforme/cabinets").then((r) => setCabinets(r.data)).catch(() => setEnErreur(true));
    api.get("/plateforme/notifications", { params: { non_lues_seulement: true } }).then((r) => setNotifications(r.data)).catch(() => {});
  }
  useEffect(charger, []);

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
    api.get(`/plateforme/cabinets/${codeCabinet}/journal`).then((r) => setJournal(r.data));
  }

  return (
    <div>
      <div className="titre-page">Plateforme SAWALI DentalCare</div>
      <div className="sous-titre-page">Cabinets dentaires clients — création, essais/licences, état d'abonnement.</div>

      {notifications.length > 0 && (
        <div className="carte" style={{ marginBottom: 20, borderLeft: "4px solid var(--sawali-orange)" }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>🔔 Notifications ({notifications.length})</div>
          {notifications.map((n) => (
            <div key={n.numero_enreg} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: "1px solid #f0f2f7", fontSize: 13 }}>
              <span>{n.message}</span>
              <button className="bouton-secondaire" style={{ fontSize: 11, padding: "3px 8px", whiteSpace: "nowrap" }} onClick={() => marquerNotificationLue(n.numero_enreg)}>Marquer lue</button>
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
          {formulaireOuvert ? "Annuler" : "+ Nouveau cabinet"}
        </button>
      </div>

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
            <input className="champ-saisie" style={{ flex: "1 1 160px" }} type="password" placeholder="Mot de passe" value={nouveau.admin_mot_de_passe} onChange={(e) => setNouveau({ ...nouveau, admin_mot_de_passe: e.target.value })} />
          </div>
          <input className="champ-saisie" placeholder="Nom complet (facultatif)" value={nouveau.admin_nom_complet} onChange={(e) => setNouveau({ ...nouveau, admin_nom_complet: e.target.value })} style={{ marginBottom: 12 }} />

          {erreurFormulaire && <div style={{ color: "var(--sawali-rouge)", fontSize: 13, marginBottom: 10 }}>{erreurFormulaire}</div>}
          <button className="bouton-primaire" onClick={creerCabinet}>Créer le cabinet</button>
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
          <table className="tableau-donnees" style={{ minWidth: 920 }}>
            <thead><tr><th>Code</th><th>Dénomination</th><th>État</th><th>Créé le</th><th>Modifié le</th><th>Essai</th><th>Actions</th></tr></thead>
            <tbody>
              {cabinets.map((c) => (
                <tr key={c.code_cabinet}>
                  <td>{c.code_cabinet}</td>
                  <td>{c.denomination}</td>
                  <td><span className={`badge ${COULEUR_ETAT[c.etat] || "badge-bleu"}`}>{c.etat}</span></td>
                  <td>{formaterDate(c.date_creation)}</td>
                  <td>{formaterDate(c.date_derniere_modification)}</td>
                  <td>{c.duree_essai_jours != null ? `${c.duree_essai_jours} j` : "-"}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <select className="champ-saisie" style={{ fontSize: 12, padding: "4px 8px", width: 120, marginRight: 6 }} value={c.etat} onChange={(e) => changerEtat(c, e.target.value)}>
                      {ETATS.map((e) => <option key={e} value={e}>{e}</option>)}
                    </select>
                    <button className="bouton-secondaire" style={{ fontSize: 12, padding: "4px 8px", marginRight: 6 }} onClick={() => ouvrirLicences(c.code_cabinet)}>Licence</button>
                    <button className="bouton-secondaire" style={{ fontSize: 12, padding: "4px 8px" }} onClick={() => ouvrirJournal(c.code_cabinet)}>Journal</button>
                  </td>
                </tr>
              ))}
              {cabinets.length === 0 && (
                <tr><td colSpan={7} style={{ color: "var(--sawali-gris)", textAlign: "center", padding: 20 }}>Aucun cabinet créé pour l'instant.</td></tr>
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
              <button className="bouton-primaire" style={{ fontSize: 13 }} onClick={genererLicence}>Générer la licence</button>
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
          <div className="carte" style={{ width: 640, maxWidth: "100%", maxHeight: "85vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontWeight: 700 }}>Journal d'activité — cabinet {cabinetJournalOuvert}</div>
              <button onClick={() => setCabinetJournalOuvert(null)} style={{ border: "none", background: "none", fontSize: 18, cursor: "pointer" }}>✕</button>
            </div>
            {journal.length === 0 && <div style={{ color: "var(--sawali-gris)", fontSize: 13 }}>Aucune activité enregistrée pour ce cabinet.</div>}
            <table className="tableau-donnees">
              <thead><tr><th>Date/Heure</th><th>Utilisateur</th><th>Action</th></tr></thead>
              <tbody>
                {journal.map((j, i) => (
                  <tr key={i}>
                    <td style={{ whiteSpace: "nowrap" }}>{formaterDateHeure(j.date_heure)}</td>
                    <td>{j.login}</td>
                    <td>{j.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
