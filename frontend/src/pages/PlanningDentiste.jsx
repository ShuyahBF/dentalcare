// pages/PlanningDentiste.jsx
// -------------------------------
// § demande utilisateur : "Le médecin quand il clique dans 'Rendez-vous'
// voit son calendrier de rdv comme /portal/planning" (portail SAWALI SMART
// SYSTEMS) — planning journalier (grille horaire + ligne "maintenant") et
// panneau "Charge Nj à venir" (heat-map + statistiques). Lecture seule pour
// le Dentiste ("Consultation de votre planning" — icône Lock) : la création/
// modification des rendez-vous reste au Secrétariat Cabinet (Secretariat.jsx).

import { useState, useEffect, useMemo } from "react";
import { AlertTriangle, Calendar, Stethoscope, Lock, BarChart3, RefreshCw } from "lucide-react";
import api from "../utils/api";

const HEURE_DEBUT = 8;
const HEURE_FIN = 19;
const HAUTEUR_HEURE = 64; // px par heure sur la grille
const JOURS_CHARGE = 30;

const COULEUR_STATUT = {
  Proposé: "#94a3b8", Confirmé: "#0ea5e9", Reporté: "#f59e0b", Honoré: "#10b981", Absent: "#ef4444", Annulé: "#cbd5e1",
};

function dateISO(d) {
  return d.toISOString().slice(0, 10);
}
function formaterDateAffichee(iso) {
  return new Date(iso + "T00:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}
function formaterJourMois(iso) {
  return new Date(iso + "T00:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}
function positionDepuisHeure(iso) {
  const d = new Date(iso);
  const minutesDepuisDebut = (d.getHours() - HEURE_DEBUT) * 60 + d.getMinutes();
  return (minutesDepuisDebut / 60) * HAUTEUR_HEURE;
}
function heureAffichee(iso) {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

// Palette d'intensité pour la heat-map "Charge 30j à venir" (du plus clair au plus soutenu).
const PALETTE_CHARGE = ["#eef1fa", "#c9d6f7", "#93aaf0", "#5a78e0", "#3348c9"];
function couleurCharge(nombre, max) {
  if (nombre === 0) return "#f4f6fb";
  if (max === 0) return PALETTE_CHARGE[0];
  const ratio = nombre / max;
  const index = Math.min(PALETTE_CHARGE.length - 1, Math.ceil(ratio * (PALETTE_CHARGE.length - 1)));
  return PALETTE_CHARGE[index];
}

export default function PlanningDentiste() {
  const [monProfil, setMonProfil] = useState(null);
  const [medecin, setMedecin] = useState(null);
  const [dateSelectionnee, setDateSelectionnee] = useState(dateISO(new Date()));
  const [rendezVous, setRendezVous] = useState([]);
  const [charge, setCharge] = useState([]);
  const [enErreur, setEnErreur] = useState(false);
  const [heureActuelle, setHeureActuelle] = useState(new Date());

  useEffect(() => {
    api.get("/utilisateurs/moi").then((r) => setMonProfil(r.data));
    const intervalle = setInterval(() => setHeureActuelle(new Date()), 60000);
    return () => clearInterval(intervalle);
  }, []);

  useEffect(() => {
    if (!monProfil?.MedecinNumeroEnreg) return;
    api.get("/medecins").then((r) => setMedecin(r.data.find((m) => m.Numéro_Enreg === monProfil.MedecinNumeroEnreg) || null));
  }, [monProfil]);

  function charger() {
    if (!monProfil?.MedecinNumeroEnreg) return;
    setEnErreur(false);
    const debut = `${dateSelectionnee}T00:00:00`;
    const fin = `${dateSelectionnee}T23:59:59`;
    Promise.all([
      api.get("/rendez-vous", { params: { dentiste_numero_enreg: monProfil.MedecinNumeroEnreg, date_debut: debut, date_fin: fin } }),
      api.get("/rendez-vous/charge-a-venir", { params: { dentiste_numero_enreg: monProfil.MedecinNumeroEnreg, jours: JOURS_CHARGE } }),
    ]).then(([r1, r2]) => { setRendezVous(r1.data); setCharge(r2.data); }).catch(() => setEnErreur(true));
  }
  useEffect(charger, [monProfil, dateSelectionnee]);

  const totalAVenir = useMemo(() => charge.reduce((s, c) => s + c.nombre, 0), [charge]);
  const maxCharge = useMemo(() => Math.max(1, ...charge.map((c) => c.nombre)), [charge]);
  const joursCharges = useMemo(() => charge.filter((c) => c.nombre > 0).length, [charge]);

  function changerJour(delta) {
    const d = new Date(dateSelectionnee + "T00:00:00");
    d.setDate(d.getDate() + delta);
    setDateSelectionnee(dateISO(d));
  }

  const estAujourdhui = dateSelectionnee === dateISO(new Date());
  const heures = [];
  for (let h = HEURE_DEBUT; h <= HEURE_FIN; h++) heures.push(h);

  if (!monProfil) return <div className="carte" style={{ color: "var(--sawali-gris)" }}>Chargement...</div>;
  if (!monProfil.MedecinNumeroEnreg) {
    return (
      <div className="carte" style={{ color: "var(--sawali-orange)", display: "flex", alignItems: "flex-start", gap: 8 }}>
        <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} /> Votre compte n'est pas encore lié à une fiche Médecin. Demandez à votre Administrateur de faire ce lien (Administration → Utilisateurs).
      </div>
    );
  }

  return (
    <div>
      <div className="carte" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ width: 42, height: 42, borderRadius: 10, background: "var(--sawali-gris-clair)", display: "flex", alignItems: "center", justifyContent: "center" }}><Calendar size={20} color="var(--sawali-bleu)" /></span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 17 }}>Planning des consultations</div>
              <div style={{ fontSize: 12, color: "var(--sawali-gris-fonce)" }}>Rendez-vous patients — mise à jour en temps réel</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <button className="bouton-secondaire" style={{ padding: "6px 10px" }} onClick={() => changerJour(-1)}>‹</button>
            <input type="date" className="champ-saisie" style={{ width: 150 }} value={dateSelectionnee} onChange={(e) => setDateSelectionnee(e.target.value)} />
            <button className="bouton-secondaire" style={{ padding: "6px 10px" }} onClick={() => changerJour(1)}>›</button>
            <button className="bouton-secondaire" onClick={() => setDateSelectionnee(dateISO(new Date()))}>Aujourd'hui</button>
            <span className="badge badge-bleu">Dès le {formaterDateAffichee(dateSelectionnee)} : {totalAVenir} RDV</span>
            <button className="bouton-secondaire" title="Actualiser" onClick={charger} style={{ display: "flex", alignItems: "center", padding: "6px 8px" }}><RefreshCw size={14} /></button>
            <span className="badge badge-vert">● Live</span>
          </div>
        </div>
      </div>

      <div className="carte" style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--sawali-gris-fonce)", display: "flex", alignItems: "center", gap: 5 }}><Stethoscope size={15} /> Médecin :</span>
        <span className="champ-saisie" style={{ flex: "1 1 240px", maxWidth: 320, background: "var(--sawali-gris-clair)", color: "var(--sawali-gris-fonce)" }}>
          {medecin ? `${medecin.Titre || "Dr"} ${medecin.Nom} ${medecin.Prénoms}` : monProfil.nom_complet}
        </span>
        <span className="badge badge-orange" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Lock size={12} /> Consultation de votre planning</span>
      </div>

      {enErreur && <div className="carte" style={{ color: "var(--sawali-rouge)", marginBottom: 16 }}>Impossible de charger le planning. <button className="bouton-secondaire" onClick={charger}>Réessayer</button></div>}

      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
        {/* --- Grille horaire du jour sélectionné --- */}
        <div className="carte" style={{ flex: "2 1 520px", minWidth: 0, padding: 0, overflow: "hidden" }}>
          <div style={{ position: "relative", padding: "10px 0" }}>
            {heures.map((h) => (
              <div key={h} style={{ position: "relative", height: HAUTEUR_HEURE, borderTop: "1px solid var(--sawali-bordure)", display: "flex" }}>
                <div style={{ width: 60, flexShrink: 0, fontSize: 11.5, color: "var(--sawali-gris)", paddingLeft: 10, paddingTop: 2 }}>
                  {String(h).padStart(2, "0")}:00
                </div>
                <div style={{ flex: 1 }} />
              </div>
            ))}

            {estAujourdhui && heureActuelle.getHours() >= HEURE_DEBUT && heureActuelle.getHours() <= HEURE_FIN && (
              <div style={{ position: "absolute", left: 60, right: 0, top: 10 + positionDepuisHeure(heureActuelle.toISOString()), borderTop: "2px solid var(--sawali-rouge)", zIndex: 3 }}>
                <span style={{ position: "absolute", left: -6, top: -5, width: 10, height: 10, borderRadius: "50%", background: "var(--sawali-rouge)" }} />
              </div>
            )}

            {rendezVous.filter((rv) => rv.statut !== "Annulé").map((rv) => {
              const top = 10 + positionDepuisHeure(rv.date_heure_debut);
              const hauteur = Math.max(24, positionDepuisHeure(rv.date_heure_fin) - positionDepuisHeure(rv.date_heure_debut));
              return (
                <div
                  key={rv.numero_enreg}
                  style={{
                    position: "absolute", left: 66, right: 10, top, height: hauteur,
                    background: `${COULEUR_STATUT[rv.statut] || "#94a3b8"}22`, borderLeft: `3px solid ${COULEUR_STATUT[rv.statut] || "#94a3b8"}`,
                    borderRadius: 6, padding: "4px 8px", fontSize: 12, overflow: "hidden", zIndex: 2,
                  }}
                  title={`${rv.statut}${rv.motif ? " — " + rv.motif : ""}`}
                >
                  <div style={{ fontWeight: 700 }}>{heureAffichee(rv.date_heure_debut)}–{heureAffichee(rv.date_heure_fin)} · {rv.patient_nom || ""} {rv.patient_prenoms || ""}</div>
                  {hauteur > 30 && <div style={{ color: "var(--sawali-gris-fonce)" }}>{medecin ? `${medecin.Titre || "Dr"} ${medecin.Nom}` : ""} {rv.patient_telephone ? `• ${rv.patient_telephone}` : ""}</div>}
                </div>
              );
            })}
          </div>
          {rendezVous.length === 0 && !enErreur && (
            <div style={{ padding: 24, textAlign: "center", color: "var(--sawali-gris)", fontSize: 13.5 }}>Aucun rendez-vous ce jour-là.</div>
          )}
        </div>

        {/* --- Panneau "Charge Nj à venir" --- */}
        <div className="carte" style={{ flex: "1 1 260px", minWidth: 260 }}>
          <div style={{ fontWeight: 700, marginBottom: 12, fontSize: 13.5, display: "flex", alignItems: "center", gap: 6 }}><BarChart3 size={15} /> Charge {JOURS_CHARGE}j à venir</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 4, marginBottom: 12 }}>
            {charge.map((c) => (
              <div
                key={c.date}
                title={`${formaterJourMois(c.date)} : ${c.nombre} RDV`}
                style={{
                  background: couleurCharge(c.nombre, maxCharge), borderRadius: 6, padding: "5px 2px", textAlign: "center",
                  color: c.nombre / maxCharge > 0.5 ? "#fff" : "var(--sawali-gris-fonce)",
                }}
              >
                <div style={{ fontSize: 9 }}>{formaterJourMois(c.date)}</div>
                <div style={{ fontWeight: 700, fontSize: 12 }}>{c.nombre}</div>
              </div>
            ))}
          </div>

          <div style={{ fontSize: 11, color: "var(--sawali-gris-fonce)", marginBottom: 4 }}>
            Jours chargés <span style={{ float: "right", fontWeight: 700 }}>{joursCharges}/{JOURS_CHARGE}</span>
          </div>
          <div style={{ fontSize: 11, color: "var(--sawali-gris-fonce)", marginBottom: 4 }}>
            Total RDV <span style={{ float: "right", fontWeight: 700 }}>{totalAVenir}</span>
          </div>
          <div style={{ fontSize: 11, color: "var(--sawali-gris-fonce)", marginBottom: 10 }}>
            Pic journalier <span style={{ float: "right", fontWeight: 700 }}>{Math.max(0, ...charge.map((c) => c.nombre))}</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: "var(--sawali-gris)" }}>
            Moins
            {PALETTE_CHARGE.map((c) => <span key={c} style={{ width: 12, height: 12, borderRadius: 3, background: c, display: "inline-block" }} />)}
            Plus
          </div>
        </div>
      </div>
    </div>
  );
}
