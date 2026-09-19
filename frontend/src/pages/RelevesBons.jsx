// pages/RelevesBons.jsx
// ---------------------------
// § demande utilisateur : "implémente le module de production des 'Relevés
// de Bons' accessible par les rôles Comptable, Admin et super-admin (ici
// par cabinets). Les Relevés de Bons seront toujours générés en PDF [...]
// 2 modèles [...] : standard simple et détaillé par Souscripteur et
// détails des reçus." Contrôle d'accès réel côté serveur
// (exiger_role("Comptable"), qui laisse toujours passer l'Administrateur —
// donc aussi le super-admin, dont le rôle vaut toujours "Administrateur")
// — RouteProtegee ne fait que masquer/afficher le lien de menu par
// cohérence d'affichage.
//
// § demande utilisateur (numérotation + historique) : chaque génération
// porte désormais une "numérotation simple" (entier brut, réinitialisable
// par le super-admin — voir Plateforme.jsx/CompteursModal) et est
// CONSERVÉE. "Dès l'accès au module un tableau 'Historique des relevés'
// sera affiché" — donc chargé et affiché avant même la section de
// génération, avec Réimprimer/Envoyer/Régénérer par ligne.
//
// La "Maintenance des Bons" (filtrage/tri avancé avant génération, voir la
// capture WinDev fournie par l'utilisateur) est prévue pour une session
// ultérieure — cette page se limite à choisir un assureur + une période
// (+ un souscripteur pour le modèle simple) puis à générer directement le
// PDF choisi.

import { useState, useEffect, useCallback } from "react";
import { FileText, Receipt, Layers, History, RotateCw, Send, Printer, X } from "lucide-react";
import api from "../utils/api";
import VisionneusePdf from "../components/VisionneusePdf";

function formaterDate(iso) {
  return iso ? new Date(iso).toLocaleDateString("fr-FR") : "-";
}
function formaterDateHeure(iso) {
  return iso ? new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "-";
}

export default function RelevesBons() {
  const debutMois = new Date();
  debutMois.setDate(1);
  const aujourdHui = new Date().toISOString().slice(0, 10);

  const [dateDebut, setDateDebut] = useState(debutMois.toISOString().slice(0, 10));
  const [dateFin, setDateFin] = useState(aujourdHui);
  const [assurances, setAssurances] = useState([]);
  const [assuranceChoisie, setAssuranceChoisie] = useState("");
  const [souscripteurs, setSouscripteurs] = useState([]);
  const [souscripteurChoisi, setSouscripteurChoisi] = useState("");
  const [chargementSouscripteurs, setChargementSouscripteurs] = useState(false);
  const [pdfOuvert, setPdfOuvert] = useState(null); // {chemin, titre} | null
  const [erreur, setErreur] = useState("");

  const [historique, setHistorique] = useState(null); // null = chargement initial
  const [envoiOuvert, setEnvoiOuvert] = useState(null); // le relevé (ligne d'historique) en cours d'envoi
  const [enCoursRegeneration, setEnCoursRegeneration] = useState(null); // numero_enreg en cours

  // § "Dès l'accès au module un tableau 'Historique des relevés' sera
  // affiché" — chargé dès l'ouverture, indépendamment de toute génération.
  const chargerHistorique = useCallback(() => {
    api.get("/releves-bons/historique").then((r) => setHistorique(r.data)).catch(() => setHistorique([]));
  }, []);
  useEffect(chargerHistorique, [chargerHistorique]);

  useEffect(() => {
    api.get("/assurances").then((r) => {
      setAssurances(r.data);
      if (r.data.length > 0) setAssuranceChoisie((precedente) => precedente || String(r.data[0].numero_enreg));
    });
  }, []);

  // § alimente le sélecteur "Souscripteur" du modèle simple — seuls les
  // souscripteurs ayant réellement au moins un bon pour CET assureur sur
  // LA PÉRIODE choisie apparaissent (jamais une liste générique).
  useEffect(() => {
    if (!assuranceChoisie) { setSouscripteurs([]); setSouscripteurChoisi(""); return; }
    setChargementSouscripteurs(true);
    api.get("/releves-bons/souscripteurs", { params: { assurance_numero_enreg: assuranceChoisie, date_debut: dateDebut, date_fin: dateFin } })
      .then((r) => {
        setSouscripteurs(r.data);
        setSouscripteurChoisi((precedent) => r.data.some((s) => s.souscripteur === precedent) ? precedent : (r.data[0]?.souscripteur || ""));
      })
      .catch(() => setSouscripteurs([]))
      .finally(() => setChargementSouscripteurs(false));
  }, [assuranceChoisie, dateDebut, dateFin]);

  const nomAssuranceChoisie = assurances.find((a) => String(a.numero_enreg) === String(assuranceChoisie))?.nom || "";

  function genererSimple() {
    if (!assuranceChoisie || !souscripteurChoisi) return setErreur("Choisissez une assurance et un souscripteur.");
    setErreur("");
    const params = new URLSearchParams({ assurance_numero_enreg: assuranceChoisie, souscripteur: souscripteurChoisi, date_debut: dateDebut, date_fin: dateFin });
    setPdfOuvert({ chemin: `/releves-bons/simple/pdf?${params}`, titre: `Relevé simple — ${souscripteurChoisi}` });
  }

  function genererDetaille() {
    if (!assuranceChoisie) return setErreur("Choisissez une assurance.");
    setErreur("");
    const params = new URLSearchParams({ assurance_numero_enreg: assuranceChoisie, date_debut: dateDebut, date_fin: dateFin });
    setPdfOuvert({ chemin: `/releves-bons/detaille/pdf?${params}`, titre: `Relevé détaillé — ${nomAssuranceChoisie}` });
  }

  // § la génération elle-même (GET) enregistre déjà le relevé côté
  // serveur — à la fermeture de la visionneuse, l'historique est donc
  // rechargé pour refléter la nouvelle ligne sans que l'utilisateur ait à
  // rafraîchir la page lui-même.
  function fermerPdfEtRafraichir() {
    setPdfOuvert(null);
    chargerHistorique();
  }

  function reimprimer(ligne) {
    setPdfOuvert({ chemin: `/releves-bons/${ligne.numero_enreg}/pdf`, titre: `Relevé n°${ligne.numero_generation} — ${ligne.nom_assureur}` });
  }

  async function regenerer(ligne) {
    setEnCoursRegeneration(ligne.numero_enreg);
    setErreur("");
    try {
      const r = await api.post(`/releves-bons/${ligne.numero_enreg}/regenerer`);
      chargerHistorique();
      setPdfOuvert({ chemin: `/releves-bons/${r.data.numero_enreg}/pdf`, titre: `Relevé n°${r.data.numero_generation} — ${r.data.nom_assureur} (régénéré)` });
    } catch (err) {
      setErreur(err.response?.data?.detail || "Erreur lors de la régénération.");
    }
    setEnCoursRegeneration(null);
  }

  return (
    <div>
      <div className="titre-page" style={{ display: "flex", alignItems: "center", gap: 8 }}><FileText size={22} /> Relevés de Bons</div>
      <div className="sous-titre-page">Documents à adresser aux assureurs pour réclamer, par reçus et numéros de bons, les sommes dues sur une période</div>

      {erreur && <div style={{ color: "var(--sawali-rouge)", fontSize: 13, marginBottom: 14 }}>{erreur}</div>}

      {/* § "Dès l'accès au module un tableau 'Historique des relevés' sera
          affiché par date/heure décroissante des relevés déjà générés" */}
      <div className="carte" style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 700, marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}><History size={16} /> Historique des relevés</div>
        {historique === null && <div style={{ color: "var(--sawali-gris)", fontSize: 13 }}>Chargement...</div>}
        {historique && historique.length === 0 && <div style={{ color: "var(--sawali-gris)", fontSize: 13 }}>Aucun relevé généré pour l'instant.</div>}
        {historique && historique.length > 0 && (
          <table className="tableau-donnees">
            <thead><tr>
              <th>N° Génération</th><th>Assureur</th><th>Nb reçus</th><th>Date/Heure génération</th><th>Période</th><th>Statut</th><th></th>
            </tr></thead>
            <tbody>
              {historique.map((l) => (
                <tr key={l.numero_enreg}>
                  <td className="chiffre" style={{ fontWeight: 700 }}>{l.numero_generation}</td>
                  <td>{l.nom_assureur}{l.type_releve === "simple" && l.souscripteur ? ` — ${l.souscripteur}` : ""} <span className="badge" style={{ fontSize: 10, marginLeft: 4 }}>{l.type_releve === "simple" ? "Simple" : "Détaillé"}</span></td>
                  <td className="chiffre">{l.nombre_recus}</td>
                  <td>{formaterDateHeure(l.date_generation)}</td>
                  <td>{formaterDate(l.date_debut)} — {formaterDate(l.date_fin)}</td>
                  <td><span className="badge badge-vert">Déjà généré</span></td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button className="bouton-secondaire" style={{ fontSize: 11.5, padding: "3px 8px", marginRight: 6, display: "inline-flex", alignItems: "center", gap: 4 }} onClick={() => reimprimer(l)}><Printer size={11} /> Réimprimer</button>
                    <button className="bouton-secondaire" style={{ fontSize: 11.5, padding: "3px 8px", marginRight: 6, display: "inline-flex", alignItems: "center", gap: 4 }} onClick={() => setEnvoiOuvert(l)}><Send size={11} /> Envoyer</button>
                    <button className="bouton-secondaire" style={{ fontSize: 11.5, padding: "3px 8px", display: "inline-flex", alignItems: "center", gap: 4 }} disabled={enCoursRegeneration === l.numero_enreg} onClick={() => regenerer(l)}><RotateCw size={11} /> {enCoursRegeneration === l.numero_enreg ? "..." : "Régénérer"}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="carte" style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20, alignItems: "flex-end" }}>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 3 }}>Du</label>
          <input className="champ-saisie" style={{ width: 160 }} type="date" value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} />
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 3 }}>Au</label>
          <input className="champ-saisie" style={{ width: 160 }} type="date" value={dateFin} onChange={(e) => setDateFin(e.target.value)} />
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 3 }}>Assurance</label>
          <select className="champ-saisie" style={{ width: 240 }} value={assuranceChoisie} onChange={(e) => setAssuranceChoisie(e.target.value)}>
            {assurances.length === 0 && <option value="">Aucune assurance enregistrée</option>}
            {assurances.map((a) => <option key={a.numero_enreg} value={a.numero_enreg}>{a.nom}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <div className="carte" style={{ flex: "1 1 360px", minWidth: 0 }}>
          <div style={{ fontWeight: 700, marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}><Receipt size={16} /> Modèle standard simple</div>
          <div style={{ fontSize: 12.5, color: "var(--sawali-gris-fonce)", marginBottom: 12 }}>
            Une ligne par reçu (part assurée, part assureur, motif) — pour un couple assureur/souscripteur précis. Format "facture" classique.
          </div>
          <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 3 }}>Souscripteur</label>
          <select className="champ-saisie" style={{ width: "100%", marginBottom: 12 }} value={souscripteurChoisi} onChange={(e) => setSouscripteurChoisi(e.target.value)} disabled={chargementSouscripteurs}>
            {chargementSouscripteurs && <option>Chargement...</option>}
            {!chargementSouscripteurs && souscripteurs.length === 0 && <option value="">Aucun bon sur cette période</option>}
            {souscripteurs.map((s) => (
              <option key={s.souscripteur} value={s.souscripteur}>{s.souscripteur} ({s.nombre_recus} reçu{s.nombre_recus > 1 ? "s" : ""})</option>
            ))}
          </select>
          <button className="bouton-primaire" disabled={!souscripteurChoisi} onClick={genererSimple} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <FileText size={14} /> Générer le relevé simple
          </button>
        </div>

        <div className="carte" style={{ flex: "1 1 360px", minWidth: 0 }}>
          <div style={{ fontWeight: 700, marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}><Layers size={16} /> Modèle détaillé par souscripteur</div>
          <div style={{ fontSize: 12.5, color: "var(--sawali-gris-fonce)", marginBottom: 12 }}>
            Une section par souscripteur/groupe couvert par cet assureur, avec le détail acte par acte de chaque reçu et les sous-totaux — pour toute la période, tous souscripteurs confondus.
          </div>
          <button className="bouton-primaire" disabled={!assuranceChoisie} onClick={genererDetaille} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <FileText size={14} /> Générer le relevé détaillé
          </button>
        </div>
      </div>

      {pdfOuvert && <VisionneusePdf chemin={pdfOuvert.chemin} titre={pdfOuvert.titre} onFermer={fermerPdfEtRafraichir} />}
      {envoiOuvert && <EnvoiModal releve={envoiOuvert} onFermer={() => setEnvoiOuvert(null)} />}
    </div>
  );
}

// § demande utilisateur : "l'envoyer par WhatsApp/eMail d'un contact" —
// petite modale de choix (contact du cabinet + canal), envoi RÉEL côté
// serveur (voir POST /releves-bons/{numero_enreg}/envoyer).
function EnvoiModal({ releve, onFermer }) {
  const [contacts, setContacts] = useState(null);
  const [contactChoisi, setContactChoisi] = useState("");
  const [canal, setCanal] = useState("whatsapp");
  const [enCours, setEnCours] = useState(false);
  const [resultat, setResultat] = useState(null); // {succes, message} | null

  useEffect(() => {
    api.get("/releves-bons/contacts").then((r) => {
      setContacts(r.data);
      if (r.data.length > 0) setContactChoisi(String(r.data[0].numero_enreg));
    });
  }, []);

  const contact = contacts?.find((c) => String(c.numero_enreg) === String(contactChoisi));
  const canalIndisponible = canal === "whatsapp" ? !(contact?.whatsapp || contact?.telephone) : !contact?.email;

  async function envoyer() {
    if (!contactChoisi) return;
    setEnCours(true);
    setResultat(null);
    try {
      await api.post(`/releves-bons/${releve.numero_enreg}/envoyer`, { contact_numero_enreg: Number(contactChoisi), canal });
      setResultat({ succes: true, message: `Relevé envoyé par ${canal === "whatsapp" ? "WhatsApp" : "email"}.` });
    } catch (err) {
      setResultat({ succes: false, message: err.response?.data?.detail || "Échec de l'envoi." });
    }
    setEnCours(false);
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(20,30,50,0.45)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onFermer}>
      <div className="carte" style={{ width: 420, maxWidth: "100%" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}><Send size={15} /> Envoyer le relevé n°{releve.numero_generation}</div>
          <button onClick={onFermer} style={{ border: "none", background: "none", cursor: "pointer", display: "flex", padding: 2 }}><X size={18} /></button>
        </div>

        <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 3 }}>Contact</label>
        <select className="champ-saisie" style={{ width: "100%", marginBottom: 12 }} value={contactChoisi} onChange={(e) => setContactChoisi(e.target.value)} disabled={contacts === null}>
          {contacts === null && <option>Chargement...</option>}
          {contacts?.length === 0 && <option value="">Aucun contact avec téléphone/email</option>}
          {contacts?.map((c) => <option key={c.numero_enreg} value={c.numero_enreg}>{c.nom}</option>)}
        </select>

        <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 3 }}>Canal</label>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <button className={canal === "whatsapp" ? "bouton-primaire" : "bouton-secondaire"} style={{ fontSize: 12.5, padding: "6px 12px" }} onClick={() => setCanal("whatsapp")}>WhatsApp</button>
          <button className={canal === "email" ? "bouton-primaire" : "bouton-secondaire"} style={{ fontSize: 12.5, padding: "6px 12px" }} onClick={() => setCanal("email")}>Email</button>
        </div>
        {contact && canalIndisponible && (
          <div style={{ color: "var(--sawali-orange)", fontSize: 12, marginBottom: 12 }}>
            Ce contact n'a pas {canal === "whatsapp" ? "de numéro WhatsApp/téléphone" : "d'adresse email"} enregistré.
          </div>
        )}

        {resultat && <div style={{ color: resultat.succes ? "var(--sawali-vert)" : "var(--sawali-rouge)", fontSize: 13, marginBottom: 10 }}>{resultat.message}</div>}

        <button className="bouton-primaire" disabled={!contactChoisi || canalIndisponible || enCours} onClick={envoyer} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Send size={14} /> {enCours ? "Envoi..." : "Envoyer"}
        </button>
      </div>
    </div>
  );
}
