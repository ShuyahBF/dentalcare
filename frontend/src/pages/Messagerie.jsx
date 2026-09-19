// pages/Messagerie.jsx
// --------------------------
// Centre de Messagerie (§ demande utilisateur) — reproduction fidèle de
// l'interface et des fonctionnalités de /contacts du portail SAWALI SMART
// SYSTEMS (repo ShuyahBF/Emergent, branche Site-SawaliSmartSystems),
// adaptée à l'isolation stricte multi-cabinets de cette plateforme.
//
// PHASE 1 (cette livraison) : annuaire de contacts complet (recherche, tri,
// filtres Tous/Partagés équipe/Privés, export CSV/JSON, CRUD) + bannière
// d'import en un clic des expéditeurs WhatsApp inconnus.
// PHASE 2 (à venir) : réception/envoi réel des messages WhatsApp (webhook
// Meta, conversation, médias) — le bouton "WhatsApp" de chaque contact est
// pour l'instant désactivé avec une info-bulle explicite à ce sujet.

import { useEffect, useMemo, useState } from "react";
import api from "../utils/api";

const PALETTE_AVATAR = ["#10b981", "#0ea5e9", "#8b5cf6", "#f43f5e", "#f59e0b", "#d946ef", "#14b8a6", "#6366f1"];
function couleurPour(seed) {
  let h = 0;
  for (let i = 0; i < (seed || "").length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE_AVATAR[h % PALETTE_AVATAR.length];
}
function initiales(contact) {
  const source = (contact.nom || contact.whatsapp || "?").trim();
  const parts = source.replace(/[._-]+/g, " ").split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return "?";
}
function Avatar({ contact, taille = 36 }) {
  return (
    <span style={{
      width: taille, height: taille, borderRadius: "50%", background: couleurPour((contact.nom || contact.whatsapp || "?").toLowerCase()),
      color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 700,
      fontSize: Math.max(10, taille * 0.38), flexShrink: 0, boxShadow: "0 0 0 2px #fff",
    }}>
      {initiales(contact)}
    </span>
  );
}
function formaterDateHeure(iso) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const CONTACT_VIDE = { nom: "", telephone: "", whatsapp: "", email: "", societe: "", notes: "", tags: "", partage: true };

export default function Messagerie() {
  const [contacts, setContacts] = useState(null);
  const [enErreur, setEnErreur] = useState(false);
  const [enAttente, setEnAttente] = useState([]);
  const [recherche, setRecherche] = useState("");
  const [filtrePartage, setFiltrePartage] = useState("tous");
  const [tri, setTri] = useState("interaction");
  const [modaleOuverte, setModaleOuverte] = useState(false);
  const [contactEnEdition, setContactEnEdition] = useState(null);
  const [formulaire, setFormulaire] = useState(CONTACT_VIDE);
  const [erreurFormulaire, setErreurFormulaire] = useState("");
  const [enCoursActualisation, setEnCoursActualisation] = useState(false);
  const [exportOuvert, setExportOuvert] = useState(false);
  // § Phase 2 : bascule Contacts / Conversations au niveau de la page.
  // conversationOuverte pré-sélectionne un numéro (venant du bouton
  // "💬 WhatsApp" d'un contact) à l'ouverture de l'onglet Conversations.
  const [ongletPage, setOngletPage] = useState("contacts");
  const [conversationOuverte, setConversationOuverte] = useState(null);

  function ouvrirConversation(numeroTelephone) {
    setConversationOuverte(numeroTelephone);
    setOngletPage("conversations");
  }

  function charger() {
    setEnErreur(false);
    setEnCoursActualisation(true);
    Promise.all([
      api.get("/messagerie/contacts"),
      api.get("/messagerie/contacts-en-attente"),
    ]).then(([r1, r2]) => { setContacts(r1.data); setEnAttente(r2.data); })
      .catch(() => setEnErreur(true))
      .finally(() => setEnCoursActualisation(false));
  }
  useEffect(charger, []);

  const filtres = useMemo(() => {
    let liste = contacts || [];
    if (filtrePartage === "partages") liste = liste.filter((c) => c.partage);
    if (filtrePartage === "prives") liste = liste.filter((c) => !c.partage);
    if (filtrePartage === "non-lus") liste = [];
    if (recherche.trim()) {
      const q = recherche.toLowerCase();
      liste = liste.filter((c) => [c.nom, c.telephone, c.whatsapp, c.email, c.societe, (c.tags || []).join(" ")].some((v) => (v || "").toLowerCase().includes(q)));
    }
    return liste;
  }, [contacts, filtrePartage, recherche]);

  const tries = useMemo(() => {
    const arr = filtres.slice();
    if (tri === "nom_asc") arr.sort((a, b) => (a.nom || "").localeCompare(b.nom || "", "fr"));
    else if (tri === "nom_desc") arr.sort((a, b) => (b.nom || "").localeCompare(a.nom || "", "fr"));
    else arr.sort((a, b) => (b.derniere_interaction_le || "").localeCompare(a.derniere_interaction_le || "") || (a.nom || "").localeCompare(b.nom || "", "fr"));
    return arr;
  }, [filtres, tri]);

  const compteurs = useMemo(() => {
    const base = contacts || [];
    return { tous: base.length, partages: base.filter((c) => c.partage).length, prives: base.filter((c) => !c.partage).length, "non-lus": 0 };
  }, [contacts]);

  function ouvrirCreation() {
    setContactEnEdition(null);
    setFormulaire(CONTACT_VIDE);
    setErreurFormulaire("");
    setModaleOuverte(true);
  }
  function ouvrirEdition(c) {
    setContactEnEdition(c);
    setFormulaire({ nom: c.nom || "", telephone: c.telephone || "", whatsapp: c.whatsapp || "", email: c.email || "", societe: c.societe || "", notes: c.notes || "", tags: (c.tags || []).join(", "), partage: c.partage !== false });
    setErreurFormulaire("");
    setModaleOuverte(true);
  }

  async function enregistrerContact() {
    if (!formulaire.nom.trim()) return setErreurFormulaire("Le nom est obligatoire.");
    setErreurFormulaire("");
    const payload = { ...formulaire, tags: formulaire.tags.split(",").map((t) => t.trim()).filter(Boolean) };
    try {
      if (contactEnEdition) await api.put(`/messagerie/contacts/${contactEnEdition.numero_enreg}`, payload);
      else await api.post("/messagerie/contacts", payload);
      setModaleOuverte(false);
      charger();
    } catch (err) {
      setErreurFormulaire(err.response?.data?.detail || "Erreur lors de l'enregistrement.");
    }
  }

  async function supprimerContact(c) {
    if (!window.confirm(`Supprimer le contact « ${c.nom} » ?`)) return;
    await api.delete(`/messagerie/contacts/${c.numero_enreg}`);
    charger();
  }

  async function importerEnAttente(item) {
    await api.post(`/messagerie/contacts-en-attente/${item.numero_enreg}/importer`, {});
    charger();
  }
  async function ignorerEnAttente(item) {
    if (!window.confirm("Ignorer ce numéro ? Il ne réapparaîtra que s'il écrit à nouveau.")) return;
    await api.delete(`/messagerie/contacts-en-attente/${item.numero_enreg}`);
    charger();
  }

  async function exporter(format) {
    try {
      const r = await api.get(`/messagerie/contacts/export.${format}`, { responseType: "blob" });
      const blob = new Blob([r.data], { type: r.headers["content-type"] || "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `contacts.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      window.alert("Erreur lors de l'export.");
    } finally {
      setExportOuvert(false);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 14 }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: 3, color: "var(--sawali-gris)", textTransform: "uppercase" }}>Communication</div>
          <div className="titre-page" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            👥 Centre de Messagerie
            <span className="badge badge-bleu" style={{ fontSize: 11 }}>SAWALI</span>
          </div>
          <div className="sous-titre-page">Répertoire de contacts unifié — WhatsApp (SMS &amp; planification à venir)</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="bouton-secondaire" onClick={charger} disabled={enCoursActualisation}>↻ Actualiser</button>
          <div style={{ position: "relative" }}>
            <button className="bouton-secondaire" onClick={() => setExportOuvert(!exportOuvert)}>⭳ Exporter</button>
            {exportOuvert && (
              <div style={{ position: "absolute", right: 0, top: "110%", background: "#fff", boxShadow: "0 4px 16px rgba(0,0,0,0.12)", borderRadius: 8, padding: 4, zIndex: 20, minWidth: 140 }}>
                <button onClick={() => exporter("csv")} style={{ display: "block", width: "100%", textAlign: "left", padding: "6px 10px", border: "none", background: "none", cursor: "pointer", fontSize: 13 }}>CSV (Excel)</button>
                <button onClick={() => exporter("json")} style={{ display: "block", width: "100%", textAlign: "left", padding: "6px 10px", border: "none", background: "none", cursor: "pointer", fontSize: 13 }}>JSON</button>
              </div>
            )}
          </div>
          <button className="bouton-primaire" onClick={ouvrirCreation}>+ Nouveau contact</button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 18 }}>
        <input className="champ-saisie" style={{ flex: "1 1 260px" }} placeholder="Rechercher nom, tél, email, société, tag..." value={recherche} onChange={(e) => setRecherche(e.target.value)} />
        <select className="champ-saisie" style={{ width: 220 }} value={tri} onChange={(e) => setTri(e.target.value)}>
          <option value="interaction">Interaction (plus récente)</option>
          <option value="nom_asc">Nom A → Z</option>
          <option value="nom_desc">Nom Z → A</option>
        </select>
        <span style={{ fontSize: 12.5, color: "var(--sawali-gris-fonce)" }}>{tries.length} contact(s)</span>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
        {[
          { id: "tous", libelle: "Tous" }, { id: "partages", libelle: "Partagés équipe" },
          { id: "prives", libelle: "Privés" }, { id: "non-lus", libelle: "Non-lus" },
        ].map((p) => (
          <button
            key={p.id}
            onClick={() => setFiltrePartage(p.id)}
            className={filtrePartage === p.id ? "badge badge-bleu" : "badge"}
            style={{ border: "1px solid #e2e8f0", cursor: "pointer", fontSize: 12, padding: "6px 12px" }}
          >
            {p.libelle} <span style={{ opacity: 0.7 }}>{compteurs[p.id]}</span>
          </button>
        ))}
      </div>

      {enAttente.length > 0 && (
        <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 12, padding: 14, marginTop: 16 }}>
          <div style={{ fontWeight: 700, color: "#92400e", fontSize: 13.5 }}>📥 {enAttente.length} contact(s) inconnu(s) vous ont écrit sur WhatsApp</div>
          <div style={{ fontSize: 11.5, color: "#92400e", marginTop: 2, marginBottom: 10 }}>Importez-les en un clic pour démarrer la conversation depuis le portail.</div>
          {enAttente.map((it) => (
            <div key={it.numero_enreg} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, background: "#fff", border: "1px solid #fde68a", borderRadius: 8, padding: "8px 12px", marginBottom: 6 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13.5 }}>{it.nom_profil_wa || "Sans nom WhatsApp"}</div>
                <div style={{ fontSize: 11, color: "var(--sawali-gris-fonce)", fontFamily: "monospace" }}>+{it.depuis}</div>
                {it.dernier_message && <div style={{ fontSize: 11.5, fontStyle: "italic", color: "var(--sawali-gris-fonce)" }}>« {it.dernier_message} »</div>}
                <div style={{ fontSize: 10.5, color: "var(--sawali-gris)" }}>{it.nombre_messages} message(s) • dernier {formaterDateHeure(it.dernier_vu_le)}</div>
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <button className="bouton-primaire" style={{ fontSize: 11.5, padding: "5px 10px" }} onClick={() => importerEnAttente(it)}>+ Importer</button>
                <button className="bouton-secondaire" style={{ fontSize: 11.5, padding: "5px 10px" }} onClick={() => ignorerEnAttente(it)}>✕ Ignorer</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="carte" style={{ marginTop: 16, overflowX: "auto" }}>
        {enErreur && <div style={{ color: "var(--sawali-rouge)" }}>Impossible de charger les contacts. <button className="bouton-secondaire" onClick={charger}>Réessayer</button></div>}
        {contacts === null && !enErreur && <div style={{ color: "var(--sawali-gris)" }}>Chargement...</div>}
        {contacts && (
          <table className="tableau-donnees" style={{ minWidth: 860 }}>
            <thead><tr><th>Contact</th><th>Société</th><th>Téléphone</th><th>WhatsApp</th><th>Email</th><th>Dernière activité</th><th>Partage</th><th>Actions</th></tr></thead>
            <tbody>
              {tries.map((c) => (
                <tr key={c.numero_enreg}>
                  <td>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                      <Avatar contact={c} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700 }}>{c.nom}</div>
                        <div style={{ fontSize: 10.5, color: "var(--sawali-bleu)", fontFamily: "monospace", fontWeight: 700 }}>🔒 {c.code_unique}</div>
                        {c.tags?.length > 0 && (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 3 }}>
                            {c.tags.map((t) => <span key={t} style={{ fontSize: 9.5, background: "var(--sawali-gris-clair)", padding: "1px 6px", borderRadius: 4 }}>🏷 {t}</span>)}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td>{c.societe || "—"}</td>
                  <td style={{ fontFamily: "monospace", fontSize: 12, color: "var(--sawali-bleu)" }}>{c.telephone || "—"}</td>
                  <td style={{ fontFamily: "monospace", fontSize: 12, color: "var(--sawali-bleu)" }}>{c.whatsapp || "—"}</td>
                  <td style={{ fontSize: 12 }}>{c.email || "—"}</td>
                  <td>{c.derniere_activite ? new Date(c.derniere_activite).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "-"}</td>
                  <td>
                    <span className={c.partage ? "badge badge-vert" : "badge badge-orange"} style={{ fontSize: 10.5 }}>
                      {c.partage ? "👥 Équipe" : "🔒 Privé"}
                    </span>
                    {c.proprietaire_nom && <div style={{ fontSize: 9.5, color: "var(--sawali-gris)", marginTop: 2 }}>par {c.proprietaire_nom}</div>}
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button
                      disabled
                      title="Envoi WhatsApp : arrive en phase 2 du Centre de Messagerie (réception/envoi réel des messages)"
                      className="bouton-secondaire"
                      style={{ fontSize: 11, padding: "4px 8px", marginRight: 4, opacity: 0.5, cursor: "not-allowed" }}
                    >
                      💬 WhatsApp
                    </button>
                    <button className="bouton-secondaire" style={{ fontSize: 11, padding: "4px 8px", marginRight: 4 }} onClick={() => ouvrirEdition(c)}>Éditer</button>
                    <button className="bouton-secondaire" style={{ fontSize: 11, padding: "4px 8px", color: "var(--sawali-rouge)" }} onClick={() => supprimerContact(c)}>🗑</button>
                  </td>
                </tr>
              ))}
              {tries.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign: "center", color: "var(--sawali-gris)", padding: 24 }}>Aucun contact pour l'instant.</td></tr>
              )}
            </tbody>
          </table>
        )}
        {/* § demande utilisateur : total des lignes affichées, réactualisé par les filtres (recherche/onglets tous-partagés-privés) déjà appliqués dans `tries`. */}
        {contacts && (
          <div style={{ fontSize: 12.5, color: "var(--sawali-gris-fonce)", marginTop: 8 }}>
            {tries.length} contact{tries.length > 1 ? "s" : ""} affiché{tries.length > 1 ? "s" : ""}
          </div>
        )}
      </div>

      {modaleOuverte && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(20,30,50,0.45)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setModaleOuverte(false)}>
          <div className="carte" style={{ width: 480, maxWidth: "100%", maxHeight: "88vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontWeight: 700 }}>{contactEnEdition ? "Modifier le contact" : "Nouveau contact"}</div>
              <button onClick={() => setModaleOuverte(false)} style={{ border: "none", background: "none", fontSize: 18, cursor: "pointer" }}>✕</button>
            </div>
            <input className="champ-saisie" placeholder="Nom complet" value={formulaire.nom} onChange={(e) => setFormulaire({ ...formulaire, nom: e.target.value })} style={{ marginBottom: 8 }} />
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <input className="champ-saisie" placeholder="Téléphone" value={formulaire.telephone} onChange={(e) => setFormulaire({ ...formulaire, telephone: e.target.value })} />
              <input className="champ-saisie" placeholder="WhatsApp" value={formulaire.whatsapp} onChange={(e) => setFormulaire({ ...formulaire, whatsapp: e.target.value })} />
            </div>
            <input className="champ-saisie" placeholder="Email" value={formulaire.email} onChange={(e) => setFormulaire({ ...formulaire, email: e.target.value })} style={{ marginBottom: 8 }} />
            <input className="champ-saisie" placeholder="Société (facultatif)" value={formulaire.societe} onChange={(e) => setFormulaire({ ...formulaire, societe: e.target.value })} style={{ marginBottom: 8 }} />
            <input className="champ-saisie" placeholder="Tags (séparés par des virgules)" value={formulaire.tags} onChange={(e) => setFormulaire({ ...formulaire, tags: e.target.value })} style={{ marginBottom: 8 }} />
            <textarea className="champ-saisie" placeholder="Notes" value={formulaire.notes} onChange={(e) => setFormulaire({ ...formulaire, notes: e.target.value })} style={{ marginBottom: 8, minHeight: 60, resize: "vertical" }} />
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 14 }}>
              <input type="checkbox" checked={formulaire.partage} onChange={(e) => setFormulaire({ ...formulaire, partage: e.target.checked })} />
              Partagé avec toute l'équipe du cabinet
            </label>
            {erreurFormulaire && <div style={{ color: "var(--sawali-rouge)", fontSize: 13, marginBottom: 10 }}>{erreurFormulaire}</div>}
            <div style={{ display: "flex", gap: 8 }}>
              <button className="bouton-secondaire" onClick={() => setModaleOuverte(false)}>Annuler</button>
              <button className="bouton-primaire" onClick={enregistrerContact}>Enregistrer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
