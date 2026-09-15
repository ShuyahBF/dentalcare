// pages/Comptable.jsx
// ------------------------
// Interface du Comptable (§8) : tableau de bord des encaissements/règlements,
// filtrable par période/caissier/mode de règlement, avec export Excel.

import { useState, useEffect, useCallback } from "react";
import api from "../utils/api";

export default function Comptable() {
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");
  const [caissier, setCaissier] = useState("");
  const [modeReglement, setModeReglement] = useState("");
  const [donnees, setDonnees] = useState(null);

  const charger = useCallback(async () => {
    const params = {};
    if (dateDebut) params.date_debut = dateDebut;
    if (dateFin) params.date_fin = dateFin;
    if (caissier) params.caissier = caissier;
    if (modeReglement) params.mode_reglement = modeReglement;
    const r = await api.get("/comptable/tableau-de-bord", { params });
    setDonnees(r.data);
  }, [dateDebut, dateFin, caissier, modeReglement]);

  useEffect(() => { charger(); }, [charger]);

  function exporterExcel() {
    const params = new URLSearchParams();
    if (dateDebut) params.set("date_debut", dateDebut);
    if (dateFin) params.set("date_fin", dateFin);
    if (caissier) params.set("caissier", caissier);
    if (modeReglement) params.set("mode_reglement", modeReglement);
    window.open(`/api/comptable/export-excel?${params.toString()}`, "_blank");
  }

  return (
    <div>
      <div className="titre-page">Encaissements</div>
      <div className="sous-titre-page">Tableau de bord des règlements du cabinet</div>

      <div className="carte" style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        <input className="champ-saisie" style={{ width: 160 }} type="date" value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} />
        <input className="champ-saisie" style={{ width: 160 }} type="date" value={dateFin} onChange={(e) => setDateFin(e.target.value)} />
        <input className="champ-saisie" style={{ width: 160 }} placeholder="Caissier (login)" value={caissier} onChange={(e) => setCaissier(e.target.value)} />
        <select className="champ-saisie" style={{ width: 160 }} value={modeReglement} onChange={(e) => setModeReglement(e.target.value)}>
          <option value="">Tous modes</option>
          <option>Espèces</option>
          <option>Autre</option>
          <option>Assurance</option>
        </select>
        <button className="bouton-secondaire" onClick={exporterExcel}>Exporter Excel</button>
      </div>

      {donnees && (
        <>
          <div style={{ display: "flex", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
            <div className="carte" style={{ flex: 1, minWidth: 180 }}>
              <div style={{ fontSize: 13, color: "var(--sawali-gris-fonce)" }}>Total général</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "var(--sawali-bleu)" }}>{donnees.total_general.toLocaleString("fr-FR")} FCFA</div>
            </div>
            <div className="carte" style={{ flex: 1, minWidth: 180 }}>
              <div style={{ fontSize: 13, color: "var(--sawali-gris-fonce)" }}>Nombre de ventes</div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{donnees.nombre_ventes}</div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
            <div className="carte" style={{ flex: 1, minWidth: 260 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Par mode de règlement</div>
              {Object.entries(donnees.repartition_par_mode_reglement).map(([mode, montant]) => (
                <div key={mode} style={{ display: "flex", justifyContent: "space-between", fontSize: 14, padding: "4px 0" }}>
                  <span>{mode}</span><span>{montant.toLocaleString("fr-FR")} F</span>
                </div>
              ))}
            </div>
            <div className="carte" style={{ flex: 1, minWidth: 260 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Par domaine</div>
              {Object.entries(donnees.repartition_par_domaine).map(([domaine, montant]) => (
                <div key={domaine} style={{ display: "flex", justifyContent: "space-between", fontSize: 14, padding: "4px 0" }}>
                  <span>{domaine}</span><span>{montant.toLocaleString("fr-FR")} F</span>
                </div>
              ))}
            </div>
          </div>

          <div className="carte">
            <div style={{ fontWeight: 700, marginBottom: 10 }}>Détail des reçus</div>
            <table className="tableau-donnees">
              <thead><tr><th>N° Reçu</th><th>Patient</th><th>Date</th><th>Caissier</th><th>Mode</th><th>Montant</th></tr></thead>
              <tbody>
                {donnees.ventes.slice(0, 50).map((v) => (
                  <tr key={v.Référence}>
                    <td>{v.Référence}</td>
                    <td>{v.Libellé}</td>
                    <td>{v["Date Vente"] ? new Date(v["Date Vente"]).toLocaleDateString("fr-FR") : "-"}</td>
                    <td>{v["Code Vendeur"]}</td>
                    <td>{v.mode_reglement}</td>
                    <td>{v.Montant?.toLocaleString("fr-FR")} F</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
