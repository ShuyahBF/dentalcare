// pages/Statistiques.jsx
// ---------------------------
// § demande utilisateur : "des graphiques de reçus payés à la caisse par
// périodes sur les montants, par actes, par dents et toutes autres choses
// que tu trouveras pertinentes." Réservé au Médecin principal, à
// l'Administrateur et au Comptable — voir
// app/core/dependances.py::exiger_acces_statistiques côté backend (source
// de vérité du contrôle d'accès) ; la sidebar (App.jsx/Sidebar.jsx) ne fait
// que masquer l'entrée de menu pour les autres rôles, par cohérence
// d'affichage — jamais la seule protection.

import { useState, useEffect, useCallback } from "react";
import { BarChart3, TrendingUp, Receipt, Wallet, Eye } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import api from "../utils/api";
import VisionneusePdf from "../components/VisionneusePdf";

const COULEURS_CAMEMBERT = ["var(--sawali-bleu)", "var(--sawali-vert)", "var(--sawali-orange)", "var(--sawali-jaune)", "var(--sawali-rouge)", "var(--sawali-bleu-clair)"];

function formaterFcfa(valeur) {
  return `${Number(valeur || 0).toLocaleString("fr-FR")} FCFA`;
}

export default function Statistiques() {
  const debutMois = new Date();
  debutMois.setDate(1);
  const aujourdHui = new Date().toISOString().slice(0, 10);

  const [dateDebut, setDateDebut] = useState(debutMois.toISOString().slice(0, 10));
  const [dateFin, setDateFin] = useState(aujourdHui);
  const [granularite, setGranularite] = useState("jour");

  const [synthese, setSynthese] = useState(null);
  const [parPeriode, setParPeriode] = useState([]);
  const [parActe, setParActe] = useState([]);
  const [parDent, setParDent] = useState([]);
  const [parModePaiement, setParModePaiement] = useState([]);
  const [parDomaine, setParDomaine] = useState([]);
  const [caissiers, setCaissiers] = useState([]);
  const [caissierChoisi, setCaissierChoisi] = useState("");
  const [pdfOuvert, setPdfOuvert] = useState(null); // {chemin, titre} | null
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState("");

  useEffect(() => {
    // § demande utilisateur : "voir les arrêts de caisse comme le
    // comptable" — liste des caissiers du cabinet, indépendante du filtre
    // de période (contrairement aux graphiques ci-dessus), chargée une
    // seule fois.
    api.get("/statistiques/caissiers").then((r) => {
      setCaissiers(r.data);
      if (r.data.length > 0) setCaissierChoisi((precedent) => precedent || r.data[0].login);
    });
  }, []);

  const charger = useCallback(async () => {
    setChargement(true);
    setErreur("");
    const params = { date_debut: dateDebut, date_fin: dateFin };
    try {
      const [rSynthese, rPeriode, rActe, rDent, rMode, rDomaine] = await Promise.all([
        api.get("/statistiques/synthese", { params }),
        api.get("/statistiques/par-periode", { params: { ...params, granularite } }),
        api.get("/statistiques/par-acte", { params }),
        api.get("/statistiques/par-dent", { params }),
        api.get("/statistiques/par-mode-paiement", { params }),
        api.get("/statistiques/par-domaine", { params }),
      ]);
      setSynthese(rSynthese.data);
      setParPeriode(rPeriode.data);
      setParActe(rActe.data);
      setParDent(rDent.data.map((d) => ({ ...d, dent: `Dent ${d.numero_dent}` })));
      setParModePaiement(rMode.data);
      setParDomaine(rDomaine.data);
    } catch (err) {
      setErreur(err.response?.data?.detail || "Impossible de charger les statistiques.");
    }
    setChargement(false);
  }, [dateDebut, dateFin, granularite]);

  useEffect(() => { charger(); }, [charger]);

  return (
    <div>
      <div className="titre-page" style={{ display: "flex", alignItems: "center", gap: 8 }}><BarChart3 size={22} /> Statistiques</div>
      <div className="sous-titre-page">Reçus effectivement réglés à la caisse — montants, actes, dents et modes de règlement</div>

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
          <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 3 }}>Granularité (période)</label>
          <select className="champ-saisie" style={{ width: 140 }} value={granularite} onChange={(e) => setGranularite(e.target.value)}>
            <option value="jour">Par jour</option>
            <option value="semaine">Par semaine</option>
            <option value="mois">Par mois</option>
          </select>
        </div>
      </div>

      {erreur && <div className="carte" style={{ color: "var(--sawali-rouge)", marginBottom: 20 }}>{erreur}</div>}

      {synthese && (
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
          <div className="carte" style={{ flex: "1 1 220px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--sawali-gris-fonce)", fontSize: 12.5, marginBottom: 6 }}><Wallet size={14} /> Total encaissé</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "var(--sawali-vert)" }}>{formaterFcfa(synthese.total_encaisse)}</div>
          </div>
          <div className="carte" style={{ flex: "1 1 220px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--sawali-gris-fonce)", fontSize: 12.5, marginBottom: 6 }}><Receipt size={14} /> Reçus réglés</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{synthese.nombre_recus}</div>
          </div>
          <div className="carte" style={{ flex: "1 1 220px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--sawali-gris-fonce)", fontSize: 12.5, marginBottom: 6 }}><TrendingUp size={14} /> Panier moyen</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{formaterFcfa(synthese.panier_moyen)}</div>
          </div>
        </div>
      )}

      <div className="carte" style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Montants encaissés par période</div>
        {parPeriode.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={parPeriode}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--sawali-bordure)" />
              <XAxis dataKey="periode" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => formaterFcfa(v)} />
              <Line type="monotone" dataKey="montant" name="Montant encaissé" stroke="var(--sawali-bleu)" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ color: "var(--sawali-gris)", fontSize: 13, padding: 20, textAlign: "center" }}>{chargement ? "Chargement..." : "Aucun reçu réglé sur cette période."}</div>
        )}
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
        <div className="carte" style={{ flex: "1 1 420px", minWidth: 0 }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Montants par acte (top 15)</div>
          {parActe.length > 0 ? (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={parActe} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--sawali-bordure)" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="libelle" width={160} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => formaterFcfa(v)} />
                <Bar dataKey="montant" name="Montant" fill="var(--sawali-bleu)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ color: "var(--sawali-gris)", fontSize: 13, padding: 20, textAlign: "center" }}>Aucune donnée.</div>
          )}
        </div>

        <div className="carte" style={{ flex: "1 1 420px", minWidth: 0 }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Montants par dent</div>
          {parDent.length > 0 ? (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={parDent}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--sawali-bordure)" />
                <XAxis dataKey="numero_dent" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => formaterFcfa(v)} labelFormatter={(l) => `Dent ${l}`} />
                <Bar dataKey="montant" name="Montant" fill="var(--sawali-vert)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ color: "var(--sawali-gris)", fontSize: 13, padding: 20, textAlign: "center" }}>Aucun acte lié à une dent précise sur cette période.</div>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <div className="carte" style={{ flex: "1 1 320px", minWidth: 0 }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Répartition par mode de règlement</div>
          {parModePaiement.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={parModePaiement} dataKey="montant" nameKey="mode" cx="50%" cy="50%" outerRadius={90} label={({ mode, percent }) => `${mode} (${(percent * 100).toFixed(0)}%)`}>
                  {parModePaiement.map((entree, i) => <Cell key={entree.mode} fill={COULEURS_CAMEMBERT[i % COULEURS_CAMEMBERT.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => formaterFcfa(v)} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ color: "var(--sawali-gris)", fontSize: 13, padding: 20, textAlign: "center" }}>Aucune donnée.</div>
          )}
        </div>

        <div className="carte" style={{ flex: "1 1 320px", minWidth: 0 }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Répartition par domaine de prestation</div>
          {parDomaine.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={parDomaine} dataKey="montant" nameKey="domaine" cx="50%" cy="50%" outerRadius={90} label={({ domaine, percent }) => `${domaine} (${(percent * 100).toFixed(0)}%)`}>
                  {parDomaine.map((entree, i) => <Cell key={entree.domaine} fill={COULEURS_CAMEMBERT[i % COULEURS_CAMEMBERT.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => formaterFcfa(v)} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ color: "var(--sawali-gris)", fontSize: 13, padding: 20, textAlign: "center" }}>Aucune donnée.</div>
          )}
        </div>
      </div>

      <div className="carte" style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}><Receipt size={15} /> États de caisse</div>
        <div style={{ fontSize: 12.5, color: "var(--sawali-gris-fonce)", marginBottom: 12 }}>
          Consultez l'arrêt de caisse détaillé d'un caissier précis, sur la période sélectionnée ci-dessus.
        </div>
        {caissiers.length > 0 ? (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 3 }}>Caissier</label>
              <select className="champ-saisie" style={{ width: 220 }} value={caissierChoisi} onChange={(e) => setCaissierChoisi(e.target.value)}>
                {caissiers.map((c) => <option key={c.login} value={c.login}>{c.nom_complet}</option>)}
              </select>
            </div>
            <button
              className="bouton-primaire"
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
              onClick={() => setPdfOuvert({ chemin: `/caisse/etat-de-caisse/pdf?date_debut=${dateDebut}&date_fin=${dateFin}&caissier=${encodeURIComponent(caissierChoisi)}`, titre: `État de caisse — ${caissierChoisi}` })}
            >
              <Eye size={14} /> Consulter
            </button>
          </div>
        ) : (
          <div style={{ color: "var(--sawali-gris)", fontSize: 13 }}>Aucun compte Caissier enregistré pour ce cabinet.</div>
        )}
      </div>

      {pdfOuvert && <VisionneusePdf chemin={pdfOuvert.chemin} titre={pdfOuvert.titre} onFermer={() => setPdfOuvert(null)} />}
    </div>
  );
}
