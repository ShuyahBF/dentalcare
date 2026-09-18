// pages/Plateforme.jsx
// ------------------------
// Réservée aux comptes super-admin (équipe SAWALI SMART SYSTEMS) — § demande
// utilisateur : "permettre à l'Admin de créer/éditer des Cabinets Dentaires
// de la plateforme". Distincte du module Administration (Admin.jsx), qui ne
// gère que le PROPRE cabinet de l'Administrateur connecté.

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

export default function Plateforme() {
  const [cabinets, setCabinets] = useState(null);
  const [enErreur, setEnErreur] = useState(false);
  const [formulaireOuvert, setFormulaireOuvert] = useState(false);
  const [nouveau, setNouveau] = useState({
    denomination: "", adresse: "Ouagadougou, Burkina Faso", telephone: "", email: "", devise: "FCFA",
    elements_a_reproduire: [], cabinet_modele_code: "", admin_login: "", admin_mot_de_passe: "", admin_nom_complet: "",
  });
  const [erreurFormulaire, setErreurFormulaire] = useState("");
  const [resultatCreation, setResultatCreation] = useState(null);

  function charger() {
    setEnErreur(false);
    api.get("/plateforme/cabinets").then((r) => setCabinets(r.data)).catch(() => setEnErreur(true));
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
        cabinet_modele_code: nouveau.cabinet_modele_code || null,
      });
      setResultatCreation(r.data);
      setFormulaireOuvert(false);
      setNouveau({
        denomination: "", adresse: "Ouagadougou, Burkina Faso", telephone: "", email: "", devise: "FCFA",
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

  return (
    <div>
      <div className="titre-page">Plateforme SAWALI DentalCare</div>
      <div className="sous-titre-page">Cabinets dentaires clients — création, état d'abonnement.</div>

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
          <table className="tableau-donnees" style={{ minWidth: 640 }}>
            <thead><tr><th>Code</th><th>Dénomination</th><th>Adresse</th><th>État</th><th>Actions</th></tr></thead>
            <tbody>
              {cabinets.map((c) => (
                <tr key={c.code_cabinet}>
                  <td>{c.code_cabinet}</td>
                  <td>{c.denomination}</td>
                  <td>{c.adresse}</td>
                  <td><span className={`badge ${COULEUR_ETAT[c.etat] || "badge-bleu"}`}>{c.etat}</span></td>
                  <td>
                    <select className="champ-saisie" style={{ fontSize: 12, padding: "4px 8px", width: 140 }} value={c.etat} onChange={(e) => changerEtat(c, e.target.value)}>
                      {ETATS.map((e) => <option key={e} value={e}>{e}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
              {cabinets.length === 0 && (
                <tr><td colSpan={5} style={{ color: "var(--sawali-gris)", textAlign: "center", padding: 20 }}>Aucun cabinet créé pour l'instant.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
