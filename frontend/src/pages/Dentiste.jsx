// pages/Dentiste.jsx
// ----------------------
// Interface du Dentiste (§4f-h) : consulte/corrige les dossiers d'examen,
// visualise le schéma dentaire prévu, rédige son rapport professionnel et
// l'envoie par WhatsApp. Accès à l'historique complet des dossiers passés
// d'un patient.

import { useState, useEffect } from "react";
import api from "../utils/api";
import SchemaDentaire from "../components/SchemaDentaire";

export default function Dentiste() {
  const [numeroDossier, setNumeroDossier] = useState("");
  const [dossier, setDossier] = useState(null);
  const [historique, setHistorique] = useState([]);
  const [indication, setIndication] = useState("");
  const [resultats, setResultats] = useState("");
  const [conclusion, setConclusion] = useState("");
  const [catalogue, setCatalogue] = useState([]);
  const [messageStatut, setMessageStatut] = useState("");
  const [lienWhatsapp, setLienWhatsapp] = useState(null);

  useEffect(() => {
    api.get("/produits").then((r) => setCatalogue(r.data));
  }, []);

  async function ouvrirDossier() {
    if (!numeroDossier) return;
    const r = await api.get(`/dossiers-examen/${numeroDossier}`);
    setDossier(r.data);
    setIndication(r.data.DOS_INDICATION || "");
    setResultats(r.data.DOS_RESULTATS || "");
    setConclusion(r.data.DOS_CONCLUSION || "");
    setLienWhatsapp(null);

    if (r.data.Client) {
      const h = await api.get(`/patients/${r.data.Client}/dossiers`);
      setHistorique(h.data);
    }
  }

  async function enregistrerRapport() {
    await api.put(`/dossiers-examen/${dossier.Dos_num}/rapport`, null, {
      params: { dos_indication: indication, dos_resultats: resultats, dos_conclusion: conclusion },
    });
    setMessageStatut("Rapport enregistré.");
    setTimeout(() => setMessageStatut(""), 3000);
  }

  async function envoyerWhatsapp() {
    const r = await api.get(`/dossiers-examen/${dossier.Dos_num}/rapport/lien-whatsapp`);
    setLienWhatsapp(r.data.lien_whatsapp);
    window.open(r.data.lien_whatsapp, "_blank");
  }

  async function enregistrerSchema(lignesPanier) {
    if (!dossier) return;
    const actesParDent = {};
    lignesPanier.forEach((l) => {
      if (!l.numero_dent) return;
      actesParDent[l.numero_dent] = actesParDent[l.numero_dent] || [];
      actesParDent[l.numero_dent].push({ numero_dent: l.numero_dent, code_produit: l.code_produit, libelle_acte: l.libelle, statut: "Carie/Obturation" });
    });
    await api.put(`/dossiers-examen/${dossier.Dos_num}/schema-dentaire`, {
      actes_par_dent: Object.values(actesParDent).flat(),
      commentaire_general: null,
    });
  }

  return (
    <div>
      <div className="titre-page">Dossiers d'examen</div>
      <div className="sous-titre-page">Consultez, corrigez et générez le rapport professionnel</div>

      <div className="carte" style={{ marginBottom: 20, display: "flex", gap: 10 }}>
        <input className="champ-saisie" placeholder="N° de dossier (Dos_num)" value={numeroDossier} onChange={(e) => setNumeroDossier(e.target.value)} />
        <button className="bouton-primaire" onClick={ouvrirDossier}>Ouvrir</button>
      </div>

      {dossier && (
        <>
          <SchemaDentaire
            actesDisponibles={catalogue.map((a) => ({ code_produit: a["Code Produit"], libelle: a["Libellé"], domaine: a["Domaine"], prix_public: a["Prix Public"] }))}
            statutsInitiaux={
              (dossier.ContenuExams?.actes_par_dent || []).reduce((acc, a) => ({ ...acc, [a.numero_dent]: a.statut }), {})
            }
            onChangerPanier={enregistrerSchema}
          />

          <div className="carte" style={{ marginTop: 20 }}>
            <div style={{ fontWeight: 700, marginBottom: 10 }}>Rapport professionnel</div>
            <label style={{ fontSize: 13, fontWeight: 600 }}>Indication</label>
            <textarea className="champ-saisie" rows={2} value={indication} onChange={(e) => setIndication(e.target.value)} style={{ marginBottom: 10 }} />
            <label style={{ fontSize: 13, fontWeight: 600 }}>Résultats / actes réalisés</label>
            <textarea className="champ-saisie" rows={3} value={resultats} onChange={(e) => setResultats(e.target.value)} style={{ marginBottom: 10 }} />
            <label style={{ fontSize: 13, fontWeight: 600 }}>Conclusion</label>
            <textarea className="champ-saisie" rows={2} value={conclusion} onChange={(e) => setConclusion(e.target.value)} style={{ marginBottom: 10 }} />

            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button className="bouton-primaire" onClick={enregistrerRapport}>Enregistrer le rapport</button>
              <a className="bouton-secondaire" href={`/api/dossiers-examen/${dossier.Dos_num}/rapport/pdf`} target="_blank" rel="noreferrer">Voir le PDF</a>
              <button className="bouton-secondaire" onClick={envoyerWhatsapp}>Envoyer par WhatsApp</button>
              {messageStatut && <span style={{ color: "var(--sawali-vert)", fontSize: 13 }}>{messageStatut}</span>}
            </div>
          </div>

          {historique.length > 0 && (
            <div className="carte" style={{ marginTop: 20 }}>
              <div style={{ fontWeight: 700, marginBottom: 10 }}>Historique du patient ({historique.length} dossier{historique.length > 1 ? "s" : ""})</div>
              <table className="tableau-donnees">
                <thead><tr><th>N° dossier</th><th>Date</th><th>Conclusion</th></tr></thead>
                <tbody>
                  {historique.map((d) => (
                    <tr key={d.Dos_num}>
                      <td>{d.Dos_num}</td>
                      <td>{d.DateHeure_Creation ? new Date(d.DateHeure_Creation).toLocaleDateString("fr-FR") : "-"}</td>
                      <td>{d.DOS_CONCLUSION || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
