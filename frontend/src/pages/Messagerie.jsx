// pages/Messagerie.jsx
// --------------------------
// Centre de Messagerie (§ demande utilisateur) — reproduction fidèle de
// l'interface et des fonctionnalités de /contacts du portail SAWALI SMART
// SYSTEMS (repo ShuyahBF/Emergent, branche Site-SawaliSmartSystems),
// adaptée à l'isolation stricte multi-cabinets de cette plateforme.
//
// PHASE 1 : annuaire de contacts complet (recherche, tri, filtres Tous/
// Partagés équipe/Privés, export CSV/JSON, CRUD) + bannière d'import en un
// clic des expéditeurs WhatsApp inconnus.
// PHASE 2 : réception/envoi réel des messages WhatsApp (webhook Meta,
// conversations, médias) — onglet "💬 Conversations" + bouton "💬 WhatsApp"
// sur chaque contact, qui ouvre directement sa conversation. Backend :
// voir app/routers/messagerie_conversations.py.

import { useEffect, useMemo, useRef, useState } from "react";
import api from "../utils/api";
import { recupererBlob } from "../utils/fichiers";

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

// § Phase 2 — un message média (image/document/audio/vidéo) n'a jamais
// d'URL directe utilisable par le navigateur (le lien Meta expire vite, et
// la route de proxy GET /messagerie/media/{id} est protégée par JWT — un
// <img src="..."> brut échouerait silencieusement en 401, voir
// utils/fichiers.js). On récupère donc toujours le média via le client
// HTTP authentifié, sous forme de blob, affiché une fois prêt.
// § médias : image/vidéo/audio/document — style et icônes de statut inspirés
// de Site-SawaliSmartSystems (ConversationModal/MessageBubble), adaptés à
// cette base de code (pas de lucide-react/Tailwind ici — émojis + styles en
// ligne, cohérent avec le reste de l'application).
function MediaMessage({ message }) {
  const [urlBlob, setUrlBlob] = useState(null);
  const [enErreur, setEnErreur] = useState(false);

  useEffect(() => {
    let urlAResilier = null;
    recupererBlob(`/messagerie/media/${message.numero_enreg}`)
      .then((url) => { urlAResilier = url; setUrlBlob(url); })
      .catch(() => setEnErreur(true));
    return () => { if (urlAResilier) URL.revokeObjectURL(urlAResilier); };
  }, [message.numero_enreg]);

  if (enErreur) return <div style={{ fontSize: 11.5, fontStyle: "italic", opacity: 0.8 }}>⚠️ Média indisponible (lien Meta probablement expiré).</div>;
  if (!urlBlob) return <div style={{ fontSize: 11.5, opacity: 0.8 }}>⏳ Chargement du média…</div>;

  if (message.type_message === "image") {
    return <img src={urlBlob} alt={message.contenu_texte || "Image"} style={{ maxWidth: 240, maxHeight: 280, borderRadius: 10, display: "block", objectFit: "cover" }} />;
  }
  if (message.type_message === "video") {
    return <video src={urlBlob} controls style={{ maxWidth: 260, borderRadius: 10, display: "block" }} />;
  }
  if (message.type_message === "audio") {
    return <audio src={urlBlob} controls style={{ maxWidth: 240 }} />;
  }
  return (
    <a href={urlBlob} download={message.media_nom_fichier || "media"} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "inherit", textDecoration: "none", background: "rgba(255,255,255,0.15)", borderRadius: 8, padding: "8px 10px" }}>
      <span style={{ fontSize: 18 }}>📄</span>
      <span style={{ textDecoration: "underline" }}>{message.media_nom_fichier || "Document"}</span>
    </a>
  );
}

const ICONE_STATUT = { envoye: { symbole: "✓", couleur: "rgba(255,255,255,0.75)", libelle: "Envoyé" }, livre: { symbole: "✓✓", couleur: "rgba(255,255,255,0.75)", libelle: "Distribué" }, lu: { symbole: "✓✓", couleur: "#7dd3fc", libelle: "Lu" }, echec: { symbole: "⚠", couleur: "#fca5a5", libelle: "Échec" }, recu: null };

// § une bulle de message — étiquette "↗ Envoyé"/"↙ Reçu", coche de statut
// pour les messages sortants (envoyé/distribué/lu — mis à jour par les
// accusés de réception du webhook Meta, voir _traiter_accuse_reception
// côté backend), style directement inspiré de la référence (bulle bleue
// arrondie pour le sortant, carte blanche pour l'entrant).
function BulleMessage({ m }) {
  const sortant = m.direction === "sortant";
  const statut = sortant ? ICONE_STATUT[m.statut] : null;
  return (
    <div style={{ display: "flex", justifyContent: sortant ? "flex-end" : "flex-start" }}>
      <div style={{
        maxWidth: "76%", borderRadius: 14, padding: "9px 13px", fontSize: 13.5,
        background: sortant ? "var(--sawali-bleu)" : "#fff",
        color: sortant ? "#fff" : "inherit",
        boxShadow: sortant ? "0 1px 3px rgba(28,69,135,0.25)" : "0 1px 2px rgba(20,35,70,0.08)",
        border: sortant ? "none" : "1px solid #eef2fa",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10.5, opacity: 0.75, marginBottom: 3, fontWeight: 600 }}>
          <span>{sortant ? "↗" : "↙"}</span>
          <span>{sortant ? "Envoyé" : "Reçu"}</span>
        </div>
        {m.type_message === "texte" ? (
          <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.contenu_texte}</div>
        ) : (
          <>
            <MediaMessage message={m} />
            {m.contenu_texte && <div style={{ marginTop: 5, whiteSpace: "pre-wrap" }}>{m.contenu_texte}</div>}
          </>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 4, fontSize: 10, opacity: 0.75, marginTop: 4 }}>
          <span>{formaterDateHeure(m.date_heure)}</span>
          {statut && <span style={{ color: statut.couleur, fontWeight: 700 }} title={statut.libelle}>{statut.symbole}</span>}
        </div>
      </div>
    </div>
  );
}

// § Phase 2 — liste des conversations (regroupées par numéro de téléphone)
// + fil de discussion + zone d'envoi (texte, pièce jointe, note vocale).
// Style et fonctionnalités inspirés de Site-SawaliSmartSystems
// (ConversationModal, backend/routes déjà portées) : en-tête avec avatar,
// bannière de fenêtre 24h Meta, composer avec pièce jointe/micro/envoi.
function PanneauConversations({ conversationInitiale }) {
  const [conversations, setConversations] = useState(null);
  const [enErreur, setEnErreur] = useState(false);
  const [selectionnee, setSelectionnee] = useState(conversationInitiale || null);
  const [messages, setMessages] = useState(null);
  const [fenetreOuverte, setFenetreOuverte] = useState(false);
  const [fenetreExpireLe, setFenetreExpireLe] = useState(null);
  const [texte, setTexte] = useState("");
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [erreurEnvoi, setErreurEnvoi] = useState("");
  const [rechercheConv, setRechercheConv] = useState("");

  // § pièce jointe en attente (choisie mais pas encore envoyée) — l'utilisateur
  // peut ajouter une légende avant de valider l'envoi, comme la référence.
  const [fichierEnAttente, setFichierEnAttente] = useState(null); // { file, type, apercuUrl }
  const refInputFichier = useRef(null);

  // § enregistrement vocal (API MediaRecorder du navigateur) — capture,
  // puis mise en attente comme un fichier audio classique prêt à envoyer.
  // Simplifié par rapport à la référence : pas d'option "transcrire" (pas
  // d'IA de transcription connectée ici), directement "envoyer comme note
  // vocale".
  const [etatEnregistrement, setEtatEnregistrement] = useState("repos"); // repos | enregistrement
  const [dureeEnregistree, setDureeEnregistree] = useState(0);
  const refEnregistrement = useRef(null); // { mediaRecorder, morceaux, flux, minuteur }

  function chargerConversations() {
    api.get("/messagerie/conversations").then((r) => {
      setConversations(r.data);
      if (conversationInitiale) setSelectionnee(conversationInitiale);
    }).catch(() => setEnErreur(true));
  }
  useEffect(chargerConversations, []);

  function chargerMessages(numero) {
    if (!numero) return;
    api.get(`/messagerie/conversations/${encodeURIComponent(numero)}/messages`).then((r) => {
      setMessages(r.data.messages || []);
      setFenetreOuverte(!!r.data.can_send_text);
      setFenetreExpireLe(r.data.window_expires_at || null);
    }).catch(() => setMessages([]));
  }
  useEffect(() => { setMessages(null); chargerMessages(selectionnee); }, [selectionnee]);

  async function envoyer() {
    if (!selectionnee) return;
    const valeur = texte.trim();
    if (!valeur && !fichierEnAttente) return;
    setEnvoiEnCours(true); setErreurEnvoi("");
    try {
      if (fichierEnAttente) {
        const formulaire = new FormData();
        formulaire.append("fichier", fichierEnAttente.file);
        if (valeur) formulaire.append("legende", valeur);
        await api.post(`/messagerie/conversations/${encodeURIComponent(selectionnee)}/envoyer-media`, formulaire, { headers: { "Content-Type": "multipart/form-data" } });
      } else {
        await api.post(`/messagerie/conversations/${encodeURIComponent(selectionnee)}/envoyer`, { texte: valeur });
      }
      setTexte("");
      retirerFichierEnAttente();
      chargerMessages(selectionnee);
      chargerConversations();
    } catch (err) {
      setErreurEnvoi(err.response?.data?.detail || "Échec de l'envoi.");
    }
    setEnvoiEnCours(false);
  }

  // --- Pièce jointe (image, vidéo, audio, document) ---
  function choisirFichier(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 16 * 1024 * 1024) { setErreurEnvoi("Fichier trop volumineux (max 16 Mo)."); e.target.value = ""; return; }
    const ct = (f.type || "").toLowerCase();
    let type = "document";
    if (ct.startsWith("image/")) type = "image";
    else if (ct.startsWith("video/")) type = "video";
    else if (ct.startsWith("audio/")) type = "audio";
    setFichierEnAttente({ file: f, type, apercuUrl: type === "image" ? URL.createObjectURL(f) : null });
    setErreurEnvoi("");
    e.target.value = "";
  }
  function retirerFichierEnAttente() {
    if (fichierEnAttente?.apercuUrl) URL.revokeObjectURL(fichierEnAttente.apercuUrl);
    setFichierEnAttente(null);
  }
  useEffect(() => () => { if (fichierEnAttente?.apercuUrl) URL.revokeObjectURL(fichierEnAttente.apercuUrl); }, [fichierEnAttente?.apercuUrl]);

  // --- Note vocale ---
  async function demarrerEnregistrement() {
    if (etatEnregistrement !== "repos") return;
    try {
      const flux = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(flux);
      const morceaux = [];
      mr.ondataavailable = (e) => { if (e.data?.size > 0) morceaux.push(e.data); };
      mr.start();
      setEtatEnregistrement("enregistrement");
      setDureeEnregistree(0);
      const t0 = Date.now();
      const minuteur = setInterval(() => setDureeEnregistree(Math.floor((Date.now() - t0) / 1000)), 250);
      refEnregistrement.current = { mediaRecorder: mr, morceaux, flux, minuteur };
    } catch {
      setErreurEnvoi("Microphone refusé ou indisponible sur ce navigateur.");
    }
  }
  async function arreterEnregistrement() {
    const ref = refEnregistrement.current;
    if (!ref || etatEnregistrement !== "enregistrement") return;
    clearInterval(ref.minuteur);
    await new Promise((resolve) => { ref.mediaRecorder.onstop = resolve; try { ref.mediaRecorder.stop(); } catch { resolve(); } });
    try { ref.flux.getTracks().forEach((t) => t.stop()); } catch { /* rien */ }
    const blob = new Blob(ref.morceaux, { type: ref.mediaRecorder.mimeType || "audio/webm" });
    refEnregistrement.current = null;
    setEtatEnregistrement("repos");
    if (blob.size < 500) { setErreurEnvoi("Note vocale trop courte."); return; }
    const fichier = new File([blob], `note-vocale-${Date.now()}.webm`, { type: blob.type });
    setFichierEnAttente({ file: fichier, type: "audio", apercuUrl: null });
  }
  function annulerEnregistrement() {
    const ref = refEnregistrement.current;
    if (ref) {
      try { ref.mediaRecorder.stop(); } catch { /* rien */ }
      try { ref.flux.getTracks().forEach((t) => t.stop()); } catch { /* rien */ }
      clearInterval(ref.minuteur);
      refEnregistrement.current = null;
    }
    setEtatEnregistrement("repos");
    setDureeEnregistree(0);
  }

  const conversationsFiltrees = (conversations || []).filter((c) => {
    if (!rechercheConv.trim()) return true;
    const q = rechercheConv.trim().toLowerCase();
    return (c.contact_nom || "").toLowerCase().includes(q) || c.numero_telephone.includes(q);
  });
  const conversationAffichee = (conversations || []).find((c) => c.numero_telephone === selectionnee) || (selectionnee ? { numero_telephone: selectionnee, contact_nom: null } : null);

  return (
    <div className="carte" style={{ marginTop: 16, padding: 0, overflow: "hidden", display: "flex", minHeight: 520, maxHeight: 680, border: "1px solid #e2e8f0" }}>
      {/* Colonne gauche : liste des conversations */}
      <div style={{ width: 300, borderRight: "1px solid #eef2fa", overflowY: "auto", flexShrink: 0, background: "#fafbfd" }}>
        <div style={{ padding: "14px 14px 10px" }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>💬 Conversations</div>
          <input className="champ-saisie" style={{ fontSize: 12.5, padding: "7px 10px" }} placeholder="Rechercher..." value={rechercheConv} onChange={(e) => setRechercheConv(e.target.value)} />
        </div>
        {enErreur && <div style={{ padding: 14, color: "var(--sawali-rouge)", fontSize: 12.5 }}>Impossible de charger les conversations.</div>}
        {conversations === null && !enErreur && <div style={{ padding: 14, color: "var(--sawali-gris)", fontSize: 12.5 }}>Chargement...</div>}
        {conversations && conversations.length === 0 && !selectionnee && (
          <div style={{ padding: 14, color: "var(--sawali-gris)", fontSize: 12.5 }}>Aucun message échangé pour l'instant. Utilisez le bouton « 💬 WhatsApp » d'un contact pour démarrer une conversation.</div>
        )}
        {conversationsFiltrees.map((c) => (
          <div
            key={c.numero_telephone}
            onClick={() => setSelectionnee(c.numero_telephone)}
            style={{
              display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 14px", cursor: "pointer",
              borderLeft: selectionnee === c.numero_telephone ? "3px solid var(--sawali-bleu)" : "3px solid transparent",
              background: selectionnee === c.numero_telephone ? "#eef4fc" : "transparent",
            }}
          >
            <Avatar contact={{ nom: c.contact_nom, whatsapp: c.numero_telephone }} taille={34} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{c.contact_nom || `+${c.numero_telephone}`}</div>
              <div style={{ fontSize: 11, color: "var(--sawali-gris-fonce)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {c.dernier_message_direction === "sortant" ? "Vous : " : ""}{c.dernier_message}
              </div>
              <div style={{ fontSize: 10, color: "var(--sawali-gris)" }}>{formaterDateHeure(c.dernier_message_le)}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Colonne droite : fil de discussion */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, background: "#f8fafc" }}>
        {!conversationAffichee ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--sawali-gris)", fontSize: 13 }}>
            Sélectionnez une conversation à gauche.
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: "1px solid #eef2fa", background: "#fff" }}>
              <Avatar contact={{ nom: conversationAffichee.contact_nom, whatsapp: conversationAffichee.numero_telephone }} taille={38} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{conversationAffichee.contact_nom || "Contact inconnu"}</div>
                <div style={{ fontSize: 11.5, color: "var(--sawali-gris-fonce)", fontFamily: "monospace" }}>+{conversationAffichee.numero_telephone}</div>
              </div>
              <button className="bouton-secondaire" style={{ fontSize: 11.5, padding: "5px 10px" }} onClick={() => { chargerMessages(selectionnee); chargerConversations(); }}>↻ Actualiser</button>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
              {messages === null && <div style={{ color: "var(--sawali-gris)", fontSize: 12.5, textAlign: "center" }}>Chargement...</div>}
              {messages && messages.length === 0 && <div style={{ color: "var(--sawali-gris)", fontSize: 12.5, fontStyle: "italic", textAlign: "center", padding: "24px 0" }}>Aucun message échangé pour l'instant.</div>}
              {messages && messages.map((m) => <BulleMessage key={m.numero_enreg} m={m} />)}
            </div>

            <div style={{ borderTop: "1px solid #eef2fa", background: "#fff" }}>
              {fenetreOuverte ? (
                <div style={{ padding: "10px 16px 14px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 8 }}>
                    <span style={{ color: "var(--sawali-vert)", fontWeight: 600 }}>✓ Fenêtre 24h ouverte — réponse libre autorisée</span>
                    {fenetreExpireLe && <span style={{ color: "var(--sawali-gris)" }}>Expire le {formaterDateHeure(fenetreExpireLe)}</span>}
                  </div>

                  {etatEnregistrement === "enregistrement" && (
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, background: "#fdecea", border: "1px solid #f5b5b0", borderRadius: 8, padding: "8px 12px" }}>
                      <span style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--sawali-rouge)", display: "inline-block" }} />
                      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--sawali-rouge)" }}>
                        Enregistrement… {String(Math.floor(dureeEnregistree / 60)).padStart(2, "0")}:{String(dureeEnregistree % 60).padStart(2, "0")}
                      </span>
                      <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                        <button className="bouton-primaire" style={{ fontSize: 11.5, padding: "5px 10px" }} onClick={arreterEnregistrement}>✓ Terminer</button>
                        <button className="bouton-secondaire" style={{ fontSize: 11.5, padding: "5px 10px" }} onClick={annulerEnregistrement}>Annuler</button>
                      </div>
                    </div>
                  )}

                  {fichierEnAttente && (
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, background: "#eafaf1", border: "1px solid #b7e4c7", borderRadius: 8, padding: 8 }}>
                      {fichierEnAttente.type === "image" && fichierEnAttente.apercuUrl ? (
                        <img src={fichierEnAttente.apercuUrl} alt="" style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 6 }} />
                      ) : (
                        <span style={{ fontSize: 26 }}>{{ audio: "🎤", video: "🎬", document: "📄" }[fichierEnAttente.type]}</span>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{fichierEnAttente.file.name}</div>
                        <div style={{ fontSize: 10.5, color: "var(--sawali-gris-fonce)" }}>{(fichierEnAttente.file.size / 1024).toFixed(0)} Ko · {fichierEnAttente.type}</div>
                      </div>
                      <button className="bouton-secondaire" style={{ fontSize: 11, padding: "4px 8px" }} onClick={retirerFichierEnAttente}>Retirer</button>
                    </div>
                  )}

                  {erreurEnvoi && <div style={{ color: "var(--sawali-rouge)", fontSize: 12, marginBottom: 6 }}>{erreurEnvoi}</div>}

                  <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                    <input ref={refInputFichier} type="file" accept="image/*,video/*,audio/*,application/pdf" onChange={choisirFichier} style={{ display: "none" }} />
                    <button
                      className="bouton-secondaire" style={{ padding: "9px 11px", fontSize: 15, flexShrink: 0 }}
                      title="Joindre un fichier (image, vidéo, audio, PDF — 16 Mo max)"
                      onClick={() => refInputFichier.current?.click()}
                      disabled={envoiEnCours || !!fichierEnAttente || etatEnregistrement !== "repos"}
                    >📎</button>
                    <button
                      className="bouton-secondaire" style={{ padding: "9px 11px", fontSize: 15, flexShrink: 0, borderColor: "var(--sawali-rouge)", color: "var(--sawali-rouge)" }}
                      title="Enregistrer une note vocale"
                      onClick={demarrerEnregistrement}
                      disabled={envoiEnCours || !!fichierEnAttente || etatEnregistrement !== "repos"}
                    >🎤</button>
                    <input
                      className="champ-saisie" style={{ flex: 1 }}
                      placeholder={fichierEnAttente ? "Légende (facultative)..." : "Tapez votre réponse... (Entrée pour envoyer)"}
                      value={texte} maxLength={4096}
                      onChange={(e) => setTexte(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); envoyer(); } }}
                    />
                    <button className="bouton-primaire" style={{ flexShrink: 0 }} onClick={envoyer} disabled={envoiEnCours || (!texte.trim() && !fichierEnAttente)}>{envoiEnCours ? "…" : "➤ Envoyer"}</button>
                  </div>
                  <div style={{ fontSize: 10, color: "var(--sawali-gris)", textAlign: "right", marginTop: 3 }}>{texte.length} / 4096</div>
                </div>
              ) : (
                <div style={{ padding: "14px 16px", background: "#fff7e6" }}>
                  <div style={{ fontSize: 12.5, color: "#92400e", fontWeight: 600 }}>⚠️ Fenêtre 24h fermée</div>
                  <div style={{ fontSize: 11.5, color: "#92400e", marginTop: 2 }}>
                    Aucun message reçu de ce contact dans les dernières 24h — Meta n'autorise plus de réponse libre. Seul un template pré-approuvé peut être envoyé (non pris en charge ici pour l'instant). Attendez que le contact vous réécrive.
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

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

      {/* § Phase 2 : bascule Contacts / Conversations au niveau de la page. */}
      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button onClick={() => setOngletPage("contacts")} className={ongletPage === "contacts" ? "bouton-primaire" : "bouton-secondaire"} style={{ fontSize: 13 }}>👥 Contacts</button>
        <button onClick={() => setOngletPage("conversations")} className={ongletPage === "conversations" ? "bouton-primaire" : "bouton-secondaire"} style={{ fontSize: 13 }}>💬 Conversations</button>
      </div>

      {ongletPage === "contacts" && (
      <>
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
                    {/* § Phase 2 activée : ouvre directement la conversation
                        de ce contact (whatsapp en priorité, sinon téléphone). */}
                    <button
                      disabled={!(c.whatsapp || c.telephone)}
                      title={(c.whatsapp || c.telephone) ? "Ouvrir la conversation WhatsApp" : "Aucun numéro renseigné pour ce contact"}
                      className="bouton-secondaire"
                      style={{ fontSize: 11, padding: "4px 8px", marginRight: 4, opacity: (c.whatsapp || c.telephone) ? 1 : 0.5, cursor: (c.whatsapp || c.telephone) ? "pointer" : "not-allowed" }}
                      onClick={() => ouvrirConversation(c.whatsapp || c.telephone)}
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
      </>
      )}

      {ongletPage === "conversations" && (
        <PanneauConversations conversationInitiale={conversationOuverte} />
      )}

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
