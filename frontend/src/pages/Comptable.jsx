// pages/Comptable.jsx
// ------------------------
// Interface du Comptable (§8) : tableau de bord des encaissements/règlements,
// filtrable par période/caissier/mode de règlement, avec export Excel, plus
// le suivi des prises en charge assurance (cycle Demandée -> Payée).

import { useState, useEffect, useCallback } from "react";
import api from "../utils/api";
import { telechargerFichier } from "../utils/fichiers";

export default function Comptable() {
  const [ongletActif, setOngletActif] = useState("Tableau de bord");

  return (
    <div>
      <div className="titre-page">Encaissements</div>
      <div className="sous-titre-page">Suivi des règlements et des prises en charge assurance</div>

      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {["Tableau de bord", "Prises en charge"].map((o) => (
          <button key={o} className={ongletActif === o ? "bouton-primaire" : "bouton-secondaire"} onClick={() => setOngletActif(o)}>
            {o}
          </button>
        ))}
      </div>

      {ongletActif === "Tableau de bord" && <TableauDeBord />}
      {ongletActif === "Prises en charge" && <PrisesEnCharge />}
    </div>
  );
}

function TableauDeBord() {
  const aujourdHui = new Date().toISOString().slice(0, 10);
  // § demande utilisateur : sélecteur de période en haut de la section,
  // initialisé à la date du jour — reste modifiable vers des dates
  // antérieures (aucune borne minimale imposée).
  const [dateDebut, setDateDebut] = useState(aujourdHui);
  const [dateFin, setDateFin] = useState(aujourdHui);
  const [caissier, setCaissier] = useState("");
  const [modeReglement, setModeReglement] = useState("");
  const [donnees, setDonnees] = useState(null);

  const charger = useCallback(async () => {
    const params = { date_debut: dateDebut, date_fin: dateFin };
    if (caissier) params.caissier = caissier;
    if (modeReglement) params.mode_reglement = modeReglement;
    const r = await api.get("/comptable/tableau-de-bord", { params });
    setDonnees(r.data);
  }, [dateDebut, dateFin, caissier, modeReglement]);

  useEffect(() => { charger(); }, [charger]);

  function exporterExcel() {
    const params = new URLSearchParams({ date_debut: dateDebut, date_fin: dateFin });
    if (caissier) params.set("caissier", caissier);
    if (modeReglement) params.set("mode_reglement", modeReglement);
    telechargerFichier(`/comptable/export-excel?${params.toString()}`, "encaissements.xlsx");
  }

  return (
    <div>
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
          <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 3 }}>Caissier</label>
          {/* § demande utilisateur : liste déroulante des caissiers DE LA
              PÉRIODE choisie (recalculée par le serveur à chaque changement
              de date, indépendamment de ce filtre lui-même). */}
          <select className="champ-saisie" style={{ width: 200 }} value={caissier} onChange={(e) => setCaissier(e.target.value)}>
            <option value="">Tous les caissiers</option>
            {(donnees?.caissiers_disponibles || []).map((c) => <option key={c.login} value={c.login}>{c.nom_complet}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 3 }}>Mode de règlement</label>
          <select className="champ-saisie" style={{ width: 160 }} value={modeReglement} onChange={(e) => setModeReglement(e.target.value)}>
            <option value="">Tous modes</option>
            <option>Espèces</option>
            <option>Autre</option>
            <option>Assurance</option>
          </select>
        </div>
        <button className="bouton-secondaire" onClick={exporterExcel}>Exporter Excel</button>
      </div>

      {donnees && (
        <>
          <div style={{ display: "flex", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
            <div className="carte" style={{ flex: 1, minWidth: 180 }}>
              <div style={{ fontSize: 13, color: "var(--sawali-gris-fonce)" }}>Total général (encaissé)</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "var(--sawali-bleu)" }}>{donnees.total_general.toLocaleString("fr-FR")} FCFA</div>
            </div>
            <div className="carte" style={{ flex: 1, minWidth: 180 }}>
              {/* § demande utilisateur : "si il n'y a pas de cohérence entre
                  les chiffres c'est la porte ouverte à des malversations" —
                  ce nombre correspond désormais EXACTEMENT au périmètre du
                  total ci-dessus (ventes ayant réellement généré de
                  l'encaissement, hors annulés) — jamais un simple décompte
                  brut qui inclurait des proformas jamais payées. */}
              <div style={{ fontSize: 13, color: "var(--sawali-gris-fonce)" }}>Nombre de reçus encaissés</div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{donnees.nombre_ventes}</div>
              {donnees.nombre_proformas_non_reglees > 0 && (
                <div style={{ fontSize: 11.5, color: "var(--sawali-orange)", marginTop: 4 }}>
                  + {donnees.nombre_proformas_non_reglees} proforma{donnees.nombre_proformas_non_reglees > 1 ? "s" : ""} en attente (non comptée{donnees.nombre_proformas_non_reglees > 1 ? "s" : ""} ici)
                </div>
              )}
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

          <div className="carte" style={{ overflowX: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
              <div style={{ fontWeight: 700 }}>Détail des reçus</div>
              {/* § demande utilisateur : total des lignes AFFICHÉES,
                  réactualisé avec les filtres déjà appliqués ci-dessus
                  (période/caissier/mode) — jamais confondu avec les cartes
                  de synthèse au-dessus, qui portent sur TOUTE la période
                  filtrée même si le tableau n'en affiche qu'un extrait. */}
              <div style={{ fontSize: 12.5, color: "var(--sawali-gris-fonce)" }}>
                {Math.min(donnees.ventes.length, 50)} reçu{Math.min(donnees.ventes.length, 50) > 1 ? "s" : ""} affiché{Math.min(donnees.ventes.length, 50) > 1 ? "s" : ""}
                {donnees.ventes.length > 50 && ` (sur ${donnees.ventes.length} au total pour cette période)`}
              </div>
            </div>
            <table className="tableau-donnees" style={{ minWidth: 620 }}>
              <thead><tr><th>N° Reçu</th><th>Patient</th><th>Dernière modification</th><th>Caissier</th><th>Mode</th><th>Montant</th><th>RAP</th></tr></thead>
              <tbody>
                {donnees.ventes.slice(0, 50).map((v) => (
                  <tr key={v.Référence} style={v.annule ? { opacity: 0.55, textDecoration: "line-through" } : undefined}>
                    <td>{v.Référence}{v.annule && <span className="badge badge-rouge" style={{ marginLeft: 6, fontSize: 10, textDecoration: "none", display: "inline-block" }}>Annulé</span>}</td>
                    <td>{v.patient_affiche || v.Libellé}</td>
                    <td>{v.derniere_modification ? new Date(v.derniere_modification).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "-"}</td>
                    <td>{v["Code Vendeur"]}</td>
                    <td>{v.mode_reglement}</td>
                    <td className="chiffre">{v.Montant?.toLocaleString("fr-FR")} F</td>
                    <td className="chiffre">{v.reste_a_payer > 0 ? `${v.reste_a_payer.toLocaleString("fr-FR")} F` : "-"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                {/* § cohérence des totaux (demande explicite) : le total
                    porte sur EXACTEMENT ce que montre la colonne juste
                    au-dessus (Montant facturé), jamais un champ différent
                    — une ligne séparée précise en plus ce qui est
                    réellement encaissé, même modèle que la page Caisse. */}
                <tr style={{ fontWeight: 700, borderTop: "2px solid var(--sawali-bordure)" }}>
                  <td colSpan={5}>Total des reçus affichés ci-dessus (hors annulés)</td>
                  <td className="chiffre">{donnees.ventes.slice(0, 50).filter((v) => !v.annule).reduce((s, v) => s + (v.Montant || 0), 0).toLocaleString("fr-FR")} F</td>
                  <td className="chiffre">{donnees.ventes.slice(0, 50).filter((v) => !v.annule).reduce((s, v) => s + (v.reste_a_payer || 0), 0).toLocaleString("fr-FR")} F</td>
                </tr>
                <tr style={{ fontSize: 12, color: "var(--sawali-vert)" }}>
                  <td colSpan={5}>dont réellement encaissé (hors annulés)</td>
                  <td className="chiffre">{donnees.ventes.slice(0, 50).filter((v) => !v.annule).reduce((s, v) => s + (v.MontantRéglé || 0), 0).toLocaleString("fr-FR")} F</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

const ETAPES_SUIVANTES = {
  Demandée: "Accordée",
  Accordée: "Facturée",
  Facturée: "Payée",
};

const COULEUR_BADGE_STATUT = {
  Demandée: "badge-bleu",
  Accordée: "badge-orange",
  Facturée: "badge-orange",
  Payée: "badge-vert",
  Refusée: "badge-rouge",
};

function PrisesEnCharge() {
  const [filtreStatut, setFiltreStatut] = useState("");
  const [prises, setPrises] = useState([]);

  const charger = useCallback(async () => {
    const r = await api.get("/assurances/prises-en-charge", { params: filtreStatut ? { statut: filtreStatut } : {} });
    setPrises(r.data);
  }, [filtreStatut]);

  useEffect(() => { charger(); }, [charger]);

  async function avancerStatut(prise) {
    const prochainStatut = ETAPES_SUIVANTES[prise.statut];
    if (!prochainStatut) return;
    await api.put(`/assurances/prises-en-charge/${prise.numero_enreg}/statut`, null, { params: { statut: prochainStatut } });
    charger();
  }

  return (
    <div>
      <div className="carte" style={{ marginBottom: 20, display: "flex", gap: 12 }}>
        <select className="champ-saisie" style={{ width: 200 }} value={filtreStatut} onChange={(e) => setFiltreStatut(e.target.value)}>
          <option value="">Tous les statuts</option>
          <option>Demandée</option>
          <option>Accordée</option>
          <option>Facturée</option>
          <option>Payée</option>
          <option>Refusée</option>
        </select>
      </div>

      <div className="carte" style={{ overflowX: "auto" }}>
        <table className="tableau-donnees" style={{ minWidth: 560 }}>
          <thead><tr><th>N° Reçu</th><th>Montant total</th><th>Part assureur</th><th>Part patient</th><th>Statut</th><th></th></tr></thead>
          <tbody>
            {prises.map((p) => (
              <tr key={p.numero_enreg}>
                <td>{p.vente_reference}</td>
                <td className="chiffre">{p.montant_total?.toLocaleString("fr-FR")} F</td>
                <td className="chiffre">{p.part_assureur?.toLocaleString("fr-FR")} F</td>
                <td className="chiffre">{p.part_assure?.toLocaleString("fr-FR")} F</td>
                <td><span className={`badge ${COULEUR_BADGE_STATUT[p.statut] || "badge-bleu"}`}>{p.statut}</span></td>
                <td>
                  {ETAPES_SUIVANTES[p.statut] && (
                    <button className="bouton-secondaire" style={{ fontSize: 12, padding: "4px 10px" }} onClick={() => avancerStatut(p)}>
                      Passer à « {ETAPES_SUIVANTES[p.statut]} »
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {prises.length === 0 && (
              <tr><td colSpan={6} style={{ color: "var(--sawali-gris)", textAlign: "center", padding: 20 }}>Aucune prise en charge pour ce filtre.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
