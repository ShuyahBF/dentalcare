// pages/Secretariat.jsx
// --------------------------
// Interface du Secrétariat Cabinet (§4e) : confirme ou modifie les
// rendez-vous à partir du reçu/proforma établi par le Caissier, en
// s'appuyant sur les créneaux libres de l'agenda du dentiste.

import { useState, useEffect } from "react";
import api from "../utils/api";

export default function Secretariat() {
  const [medecins, setMedecins] = useState([]);
  const [medecinChoisi, setMedecinChoisi] = useState("");
  const [dateChoisie, setDateChoisie] = useState(new Date().toISOString().slice(0, 10));
  const [creneaux, setCreneaux] = useState([]);
  const [rendezVousJour, setRendezVousJour] = useState([]);

  const [patientNumero, setPatientNumero] = useState("");
  const [motif, setMotif] = useState("");
  const [creneauChoisi, setCreneauChoisi] = useState(null);
  const [messageStatut, setMessageStatut] = useState("");

  useEffect(() => {
    api.get("/medecins").then((r) => {
      setMedecins(r.data);
      if (r.data.length > 0) setMedecinChoisi(r.data[0].Numéro_Enreg);
    });
  }, []);

  useEffect(() => {
    if (!medecinChoisi || !dateChoisie) return;
    api.get(`/medecins/${medecinChoisi}/creneaux-disponibles`, { params: { date_cible: dateChoisie } }).then((r) => setCreneaux(r.data));
    api.get("/rendez-vous", { params: { dentiste_numero_enreg: medecinChoisi, date_debut: `${dateChoisie}T00:00:00`, date_fin: `${dateChoisie}T23:59:59` } }).then((r) => setRendezVousJour(r.data));
  }, [medecinChoisi, dateChoisie]);

  async function creerRendezVous() {
    if (!creneauChoisi || !patientNumero) return;
    await api.post("/rendez-vous", {
      numero_enreg: 0, // ignoré côté serveur, régénéré par le compteur
      patient_numero_enreg: Number(patientNumero),
      dentiste_numero_enreg: Number(medecinChoisi),
      date_heure_debut: creneauChoisi.debut,
      date_heure_fin: creneauChoisi.fin,
      motif,
      statut: "Confirmé",
    });
    setMessageStatut("Rendez-vous confirmé.");
    setPatientNumero("");
    setMotif("");
    setCreneauChoisi(null);
    const r = await api.get("/rendez-vous", { params: { dentiste_numero_enreg: medecinChoisi, date_debut: `${dateChoisie}T00:00:00`, date_fin: `${dateChoisie}T23:59:59` } });
    setRendezVousJour(r.data);
    setTimeout(() => setMessageStatut(""), 3000);
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
        </select>
        <input className="champ-saisie" style={{ width: 180 }} type="date" value={dateChoisie} onChange={(e) => setDateChoisie(e.target.value)} />
      </div>

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
        <div className="carte" style={{ flex: "1 1 320px" }}>
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
              <label style={{ fontSize: 13, fontWeight: 600 }}>N° patient (Numéro_Enreg)</label>
              <input className="champ-saisie" value={patientNumero} onChange={(e) => setPatientNumero(e.target.value)} style={{ marginBottom: 8 }} />
              <label style={{ fontSize: 13, fontWeight: 600 }}>Motif</label>
              <input className="champ-saisie" value={motif} onChange={(e) => setMotif(e.target.value)} style={{ marginBottom: 12 }} />
              <button className="bouton-primaire" onClick={creerRendezVous}>Confirmer le rendez-vous</button>
              {messageStatut && <div style={{ color: "var(--sawali-vert)", marginTop: 8, fontSize: 13 }}>{messageStatut}</div>}
            </div>
          )}
        </div>

        <div className="carte" style={{ flex: "1 1 320px" }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Rendez-vous du jour</div>
          <table className="tableau-donnees">
            <thead><tr><th>Heure</th><th>Patient</th><th>Statut</th></tr></thead>
            <tbody>
              {rendezVousJour.map((rv) => (
                <tr key={rv.numero_enreg}>
                  <td>{new Date(rv.date_heure_debut).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</td>
                  <td>{rv.patient_numero_enreg}</td>
                  <td><span className="badge badge-bleu">{rv.statut}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
