// pages/Secretariat.jsx
// --------------------------
// Interface du Secrétariat Cabinet (§4e) : confirme ou modifie les
// rendez-vous à partir du reçu/proforma établi par le Caissier, en
// s'appuyant sur les créneaux libres de l'agenda du dentiste.

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, CheckCircle2, XCircle, PlayCircle, CalendarClock, X } from "lucide-react";
import api from "../utils/api";

// § demande utilisateur : couleur du badge de statut — table plutôt que
// comparaisons de chaînes en cascade dans le rendu (cohérent avec la
// convention retenue pour toute l'application après la Correction 1).
const COULEUR_STATUT_RDV = {
  "Confirmé": "badge-vert", "En cours": "badge-bleu", "Honoré": "badge-vert",
  "Reporté": "badge-orange", "Annulé": "badge-rouge", "Absent": "badge-rouge",
  "Proposé": "badge-bleu",
};

export default function Secretariat() {
  const [medecins, setMedecins] = useState([]);
  const [medecinChoisi, setMedecinChoisi] = useState("");
  const [dateChoisie, setDateChoisie] = useState(new Date().toISOString().slice(0, 10));
  const [creneaux, setCreneaux] = useState([]);
  const [rendezVousJour, setRendezVousJour] = useState([]);
  const [nomsPatients, setNomsPatients] = useState({}); // cache {numero_enreg: "Nom Prénoms"}

  const [rechercherPatient, setRecherchePatient] = useState("");
  const [resultatsPatients, setResultatsPatients] = useState([]);
  const [patientChoisi, setPatientChoisi] = useState(null);
  const [motif, setMotif] = useState("");
  const [creneauChoisi, setCreneauChoisi] = useState(null);
  const [messageStatut, setMessageStatut] = useState("");
  const [messageStatutEstErreur, setMessageStatutEstErreur] = useState(false);
  const [rdvEnReport, setRdvEnReport] = useState(null); // {numero_enreg, ...} du RDV en cours de report, ou null
  const [reportDateHeure, setReportDateHeure] = useState("");
  const [reportVenteReference, setReportVenteReference] = useState("");
  const [actionEnCours, setActionEnCours] = useState(null); // numero_enreg du RDV dont une action est en vol (désactive ses boutons)

  useEffect(() => {
    chargerMedecins();
  }, []);

  function chargerMedecins() {
    api.get("/medecins").then((r) => {
      setMedecins(r.data);
      if (r.data.length > 0) setMedecinChoisi((precedent) => precedent || r.data[0].Numéro_Enreg);
    });
  }

  async function chargerRendezVousJour() {
    const r = await api.get("/rendez-vous", { params: { dentiste_numero_enreg: medecinChoisi, date_debut: `${dateChoisie}T00:00:00`, date_fin: `${dateChoisie}T23:59:59` } });
    setRendezVousJour(r.data);
    // Résout les noms des patients pas encore en cache (petits volumes : un RDV par jour reste raisonnable).
    const numerosManquants = [...new Set(r.data.map((rv) => rv.patient_numero_enreg))].filter((n) => !nomsPatients[n]);
    if (numerosManquants.length > 0) {
      const resultats = await Promise.all(numerosManquants.map((n) => api.get(`/patients/${n}`).then((res) => [n, `${res.data.Nom} ${res.data.Prénoms || ""}`.trim()]).catch(() => [n, `Patient #${n}`])));
      setNomsPatients((precedent) => ({ ...precedent, ...Object.fromEntries(resultats) }));
    }
  }

  useEffect(() => {
    if (!medecinChoisi || !dateChoisie) return;
    api.get(`/medecins/${medecinChoisi}/creneaux-disponibles`, { params: { date_cible: dateChoisie } }).then((r) => setCreneaux(r.data));
    chargerRendezVousJour();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [medecinChoisi, dateChoisie]);

  const rechercherPatientDebounce = useCallback(async (texte) => {
    setRecherchePatient(texte);
    if (texte.length < 2) return setResultatsPatients([]);
    const r = await api.get("/patients", { params: { recherche: texte } });
    setResultatsPatients(r.data);
  }, []);

  async function creerRendezVous() {
    if (!creneauChoisi || !patientChoisi) return;
    await api.post("/rendez-vous", {
      numero_enreg: 0, // ignoré côté serveur, régénéré par le compteur
      patient_numero_enreg: patientChoisi.Numéro_Enreg,
      dentiste_numero_enreg: Number(medecinChoisi),
      date_heure_debut: creneauChoisi.debut,
      date_heure_fin: creneauChoisi.fin,
      motif,
      statut: "Confirmé",
    });
    setMessageStatut("Rendez-vous confirmé.");
    setPatientChoisi(null);
    setRecherchePatient("");
    setMotif("");
    setCreneauChoisi(null);
    await chargerRendezVousJour();
    setTimeout(() => setMessageStatut(""), 3000);
  }

  async function changerStatutSimple(rv, statut) {
    setActionEnCours(rv.numero_enreg);
    try {
      await api.put(`/rendez-vous/${rv.numero_enreg}/statut`, { statut });
      await chargerRendezVousJour();
      setMessageStatutEstErreur(false);
      setMessageStatut(`Rendez-vous marqué « ${statut} ».`);
      setTimeout(() => setMessageStatut(""), 3000);
    } catch (err) {
      setMessageStatutEstErreur(true);
      setMessageStatut(err.response?.data?.detail || "Échec de la mise à jour du statut.");
    }
    setActionEnCours(null);
  }

  function ouvrirModaleReport(rv) {
    setRdvEnReport(rv);
    // Pré-remplit avec la date/heure actuelle du RDV, convertie au format
    // attendu par <input type="datetime-local">.
    setReportDateHeure(new Date(rv.date_heure_debut).toISOString().slice(0, 16));
    setReportVenteReference(rv.vente_reference || "");
  }

  async function confirmerReport() {
    if (!rdvEnReport || !reportDateHeure) return;
    const debut = new Date(reportDateHeure);
    // § demande utilisateur : "dans le cas de report on reprécise la vente"
    // — durée du RDV conservée à l'identique, seul le créneau se déplace.
    const dureeMs = new Date(rdvEnReport.date_heure_fin) - new Date(rdvEnReport.date_heure_debut);
    const fin = new Date(debut.getTime() + (dureeMs > 0 ? dureeMs : 30 * 60000));
    setActionEnCours(rdvEnReport.numero_enreg);
    try {
      await api.put(`/rendez-vous/${rdvEnReport.numero_enreg}/statut`, {
        statut: "Reporté", nouvelle_date_heure_debut: debut.toISOString(), nouvelle_date_heure_fin: fin.toISOString(),
        vente_reference: reportVenteReference.trim(),
      });
      setRdvEnReport(null);
      await chargerRendezVousJour();
      setMessageStatutEstErreur(false);
      setMessageStatut("Rendez-vous reporté.");
      setTimeout(() => setMessageStatut(""), 3000);
    } catch (err) {
      setMessageStatutEstErreur(true);
      setMessageStatut(err.response?.data?.detail || "Échec du report.");
    }
    setActionEnCours(null);
  }

  return (
    <div>
      <div className="titre-page">Rendez-vous</div>
      <div className="sous-titre-page">Agenda des dentistes et confirmation des rendez-vous</div>

      <div className="carte" style={{ display: "flex", gap: 14, marginBottom: 20, flexWrap: "wrap" }}>
        <select className="champ-saisie" style={{ width: 240 }} value={medecinChoisi} onChange={(e) => setMedecinChoisi(e.target.value)}>
          {medecins.map((m) => (
            <option key={m.Numéro_Enreg} value={m.Numéro_Enreg}>{m.Titre} {m.Nom} {m.Prénoms}</option>
          ))}
          {medecins.length === 0 && <option value="">Aucun dentiste enregistré</option>}
        </select>
        <input className="champ-saisie" style={{ width: 180 }} type="date" value={dateChoisie} onChange={(e) => setDateChoisie(e.target.value)} />
      </div>

      {medecins.length === 0 && (
        <div className="carte" style={{ marginBottom: 20, color: "var(--sawali-rouge)" }}>
          Aucun dentiste n'est encore enregistré. Demandez à un Administrateur d'en ajouter un depuis le module Administration → onglet Médecins.
          {" "}
          <button className="bouton-secondaire" style={{ fontSize: 12, padding: "3px 10px", marginLeft: 6, display: "inline-flex", alignItems: "center", gap: 4 }} onClick={chargerMedecins}><RefreshCw size={11} /> Réessayer</button>
        </div>
      )}

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
        <div className="carte" style={{ flex: "1 1 320px", minWidth: 0 }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Créneaux libres</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {creneaux.map((c) => (
              <button
                key={c.debut}
                onClick={() => setCreneauChoisi(c)}
                className={creneauChoisi?.debut === c.debut ? "bouton-primaire" : "bouton-secondaire"}
                style={{ fontSize: 12, padding: "6px 10px" }}
              >
                {new Date(c.debut).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
              </button>
            ))}
            {creneaux.length === 0 && <div style={{ color: "var(--sawali-gris)", fontSize: 13 }}>Aucun créneau libre pour cette date.</div>}
          </div>

          {creneauChoisi && (
            <div style={{ marginTop: 16, borderTop: "1px solid #eef2fa", paddingTop: 14 }}>
              <label className="libelle-obligatoire" style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>* Patient</label>
              {patientChoisi ? (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, padding: 8, background: "var(--sawali-gris-clair)", borderRadius: 8 }}>
                  <span style={{ fontSize: 13 }}>{patientChoisi.Nom} {patientChoisi.Prénoms}</span>
                  <button className="bouton-secondaire" style={{ fontSize: 11, padding: "2px 8px" }} onClick={() => setPatientChoisi(null)}>Changer</button>
                </div>
              ) : (
                <div style={{ position: "relative", marginBottom: 10 }}>
                  <input className="champ-saisie" placeholder="Rechercher un patient..." value={rechercherPatient} onChange={(e) => rechercherPatientDebounce(e.target.value)} />
                  {resultatsPatients.length > 0 && (
                    <div className="carte" style={{ position: "absolute", zIndex: 10, width: "100%", marginTop: 4, maxHeight: 200, overflowY: "auto" }}>
                      {resultatsPatients.map((p) => (
                        <div key={p.Numéro_Enreg} style={{ padding: 8, cursor: "pointer", borderBottom: "1px solid #f0f2f7", fontSize: 13 }} onClick={() => { setPatientChoisi(p); setResultatsPatients([]); setRecherchePatient(""); }}>
                          {p.Nom} {p.Prénoms} — {p.Téléphone || "-"}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <label style={{ fontSize: 13, fontWeight: 600 }}>Motif</label>
              <input className="champ-saisie" value={motif} onChange={(e) => setMotif(e.target.value)} style={{ marginBottom: 12 }} />
              <button className="bouton-primaire" disabled={!patientChoisi} onClick={creerRendezVous}>Confirmer le rendez-vous</button>
              {messageStatut && <div style={{ color: messageStatutEstErreur ? "var(--sawali-rouge)" : "var(--sawali-vert)", marginTop: 8, fontSize: 13 }}>{messageStatut}</div>}
            </div>
          )}
        </div>

        <div className="carte" style={{ flex: "1 1 320px", minWidth: 0 }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Rendez-vous du jour</div>
          <table className="tableau-donnees">
            <thead><tr><th>Heure</th><th>Patient</th><th>Statut</th><th>Actions</th></tr></thead>
            <tbody>
              {rendezVousJour.map((rv) => (
                <tr key={rv.numero_enreg}>
                  <td>{new Date(rv.date_heure_debut).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</td>
                  <td>{nomsPatients[rv.patient_numero_enreg] || `Patient #${rv.patient_numero_enreg}`}</td>
                  <td><span className={`badge ${COULEUR_STATUT_RDV[rv.statut] || "badge-bleu"}`}>{rv.statut}</span></td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button title="Confirmer" disabled={actionEnCours === rv.numero_enreg} onClick={() => changerStatutSimple(rv, "Confirmé")} style={{ border: "none", background: "none", color: "var(--sawali-vert)", cursor: "pointer", display: "flex", padding: 3 }}>
                        <CheckCircle2 size={16} />
                      </button>
                      <button title="En cours" disabled={actionEnCours === rv.numero_enreg} onClick={() => changerStatutSimple(rv, "En cours")} style={{ border: "none", background: "none", color: "var(--sawali-bleu)", cursor: "pointer", display: "flex", padding: 3 }}>
                        <PlayCircle size={16} />
                      </button>
                      <button title="Reporter" disabled={actionEnCours === rv.numero_enreg} onClick={() => ouvrirModaleReport(rv)} style={{ border: "none", background: "none", color: "var(--sawali-orange)", cursor: "pointer", display: "flex", padding: 3 }}>
                        <CalendarClock size={16} />
                      </button>
                      <button title="Annuler" disabled={actionEnCours === rv.numero_enreg} onClick={() => changerStatutSimple(rv, "Annulé")} style={{ border: "none", background: "none", color: "var(--sawali-rouge)", cursor: "pointer", display: "flex", padding: 3 }}>
                        <XCircle size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {rendezVousJour.length === 0 && (
                <tr><td colSpan={4} style={{ color: "var(--sawali-gris)", textAlign: "center", padding: 16 }}>Aucun rendez-vous pour cette date.</td></tr>
              )}
            </tbody>
          </table>
          {/* § demande utilisateur : total des lignes affichées. */}
          {rendezVousJour.length > 0 && (
            <div style={{ fontSize: 12.5, color: "var(--sawali-gris-fonce)", marginTop: 8 }}>
              {rendezVousJour.length} rendez-vous affiché{rendezVousJour.length > 1 ? "s" : ""}
            </div>
          )}
        </div>
      </div>

      {rdvEnReport && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(20,30,50,0.45)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div className="carte" style={{ width: 400, maxWidth: "100%" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontWeight: 700 }}>Reporter le rendez-vous</div>
              <button onClick={() => setRdvEnReport(null)} style={{ border: "none", background: "none", cursor: "pointer", display: "flex", padding: 2 }}><X size={19} /></button>
            </div>
            <div style={{ fontSize: 13, color: "var(--sawali-gris-fonce)", marginBottom: 12 }}>
              {nomsPatients[rdvEnReport.patient_numero_enreg] || `Patient #${rdvEnReport.patient_numero_enreg}`}
            </div>
            <label className="libelle-obligatoire" style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 3 }}>* Nouvelle date et heure</label>
            <input type="datetime-local" className="champ-saisie" value={reportDateHeure} onChange={(e) => setReportDateHeure(e.target.value)} style={{ marginBottom: 10 }} />
            <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 3 }}>Référence de vente / proforma</label>
            <input className="champ-saisie" placeholder="Ex: R-202613786" value={reportVenteReference} onChange={(e) => setReportVenteReference(e.target.value)} style={{ marginBottom: 14 }} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="bouton-secondaire" onClick={() => setRdvEnReport(null)}>Annuler</button>
              <button className="bouton-primaire" disabled={!reportDateHeure || actionEnCours === rdvEnReport.numero_enreg} onClick={confirmerReport}>Confirmer le report</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
