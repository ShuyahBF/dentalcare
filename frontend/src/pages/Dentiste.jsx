// pages/Dentiste.jsx
// ----------------------
// Interface du Dentiste (§4f-h) : consulte/corrige les dossiers d'examen,
// visualise le schéma dentaire prévu, rédige son rapport professionnel et
// l'envoie par WhatsApp. Accès à l'historique complet des dossiers passés
// d'un patient. Recherche par patient (plutôt qu'un numéro de dossier brut
// à connaître à l'avance) et création d'un nouveau dossier à la volée.

import { useState, useEffect, useCallback } from "react";
import api from "../utils/api";
import { ouvrirFichier, imprimerPdf } from "../utils/fichiers";
import { useAuth } from "../utils/authContexte";
import SchemaDentaire from "../components/SchemaDentaire";

export default function Dentiste() {
  const { utilisateur } = useAuth();
  const [rechercherPatient, setRecherchePatient] = useState("");
  const [resultatsPatients, setResultatsPatients] = useState([]);
  const [patientSelectionne, setPatientSelectionne] = useState(null);

  const [dossier, setDossier] = useState(null);
  const [historique, setHistorique] = useState([]);
  const [indication, setIndication] = useState("");
  const [resultats, setResultats] = useState("");
  const [conclusion, setConclusion] = useState("");
  const [catalogue, setCatalogue] = useState([]);
  const [messageStatut, setMessageStatut] = useState("");
  const [numerotationDentaire, setNumerotationDentaire] = useState("internationale");

  useEffect(() => {
    api.get("/produits").then((r) => setCatalogue(r.data));
    api.get("/cabinet").then((r) => setNumerotationDentaire(r.data.numerotation_dentaire || "internationale")).catch(() => {});
  }, []);

  const rechercherPatientDebounce = useCallback(async (texte) => {
    setRecherchePatient(texte);
    if (texte.length < 2) return setResultatsPatients([]);
    const r = await api.get("/patients", { params: { recherche: texte } });
    setResultatsPatients(r.data);
  }, []);

  async function choisirPatient(patient) {
    setPatientSelectionne(patient);
    setResultatsPatients([]);
    setRecherchePatient("");
    setDossier(null);
    const h = await api.get(`/patients/${patient.Numéro_Enreg}/dossiers`);
    setHistorique(h.data);
  }

  async function ouvrirDossier(dosNum) {
    const r = await api.get(`/dossiers-examen/${dosNum}`);
    setDossier(r.data);
    setIndication(r.data.DOS_INDICATION || "");
    setResultats(r.data.DOS_RESULTATS || "");
    setConclusion(r.data.DOS_CONCLUSION || "");
  }

  async function creerNouveauDossier() {
    const r = await api.post("/dossiers-examen", null, {
      params: { patient_numero_enreg: patientSelectionne.Numéro_Enreg, nom_specialiste: utilisateur?.nom_complet },
    });
    setHistorique((precedent) => [r.data, ...precedent]);
    await ouvrirDossier(r.data.Dos_num);
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

      {/* --- Recherche / sélection patient --- */}
      <div className="carte" style={{ marginBottom: 20 }}>
        {patientSelectionne ? (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 700 }}>{patientSelectionne.Nom} {patientSelectionne.Prénoms}</div>
              <div style={{ fontSize: 13, color: "var(--sawali-gris-fonce)" }}>ID {patientSelectionne.ID_Patient}</div>
            </div>
            <button className="bouton-secondaire" onClick={() => { setPatientSelectionne(null); setDossier(null); setHistorique([]); }}>Changer</button>
          </div>
        ) : (
          <div style={{ position: "relative" }}>
            <input
              className="champ-saisie"
              placeholder="Rechercher un patient (nom, téléphone)..."
              value={rechercherPatient}
              onChange={(e) => rechercherPatientDebounce(e.target.value)}
            />
            {resultatsPatients.length > 0 && (
              <div className="carte" style={{ position: "absolute", zIndex: 10, width: "100%", marginTop: 4, maxHeight: 260, overflowY: "auto" }}>
                {resultatsPatients.map((p) => (
                  <div key={p.Numéro_Enreg} style={{ padding: 8, cursor: "pointer", borderBottom: "1px solid #f0f2f7" }} onClick={() => choisirPatient(p)}>
                    {p.Nom} {p.Prénoms} — {p.Téléphone || "-"}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {patientSelectionne && !dossier && (
        <div className="carte" style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontWeight: 700 }}>Dossiers de ce patient</div>
            <button className="bouton-primaire" onClick={creerNouveauDossier}>+ Nouveau dossier</button>
          </div>
          {historique.length === 0 ? (
            <div style={{ color: "var(--sawali-gris)", fontSize: 14 }}>Aucun dossier existant — créez-en un pour commencer l'examen.</div>
          ) : (
            <table className="tableau-donnees">
              <thead><tr><th>N° dossier</th><th>Date</th><th>Conclusion</th><th></th></tr></thead>
              <tbody>
                {historique.map((d) => (
                  <tr key={d.Dos_num}>
                    <td>{d.Dos_num}</td>
                    <td>{d.DateHeure_Creation ? new Date(d.DateHeure_Creation).toLocaleDateString("fr-FR") : "-"}</td>
                    <td>{d.DOS_CONCLUSION || "-"}</td>
                    <td><button className="bouton-secondaire" style={{ fontSize: 12, padding: "4px 10px" }} onClick={() => ouvrirDossier(d.Dos_num)}>Ouvrir</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {dossier && (
        <>
          <div style={{ marginBottom: 12 }}>
            <button className="bouton-secondaire" style={{ fontSize: 13 }} onClick={() => setDossier(null)}>← Retour aux dossiers du patient</button>
          </div>

          <SchemaDentaire
            numerotation={numerotationDentaire}
            actesDisponibles={catalogue.map((a) => ({ code_produit: a["Code Produit"], libelle: a["Libellé"], domaine: a["Domaine"], prix_public: a["Prix Public"] }))}
            statutsInitiaux={
              (dossier.ContenuExams?.actes_par_dent || []).reduce((acc, a) => ({ ...acc, [a.numero_dent]: a.statut }), {})
            }
            onChangerPanier={enregistrerSchema}
          />

          <div className="carte" style={{ marginTop: 20 }}>
            <div style={{ fontWeight: 700, marginBottom: 10 }}>Rapport professionnel — dossier n°{dossier.Dos_num}</div>
            <label style={{ fontSize: 13, fontWeight: 600 }}>Indication</label>
            <textarea className="champ-saisie" rows={2} value={indication} onChange={(e) => setIndication(e.target.value)} style={{ marginBottom: 10 }} />
            <label style={{ fontSize: 13, fontWeight: 600 }}>Résultats / actes réalisés</label>
            <textarea className="champ-saisie" rows={3} value={resultats} onChange={(e) => setResultats(e.target.value)} style={{ marginBottom: 10 }} />
            <label style={{ fontSize: 13, fontWeight: 600 }}>Conclusion</label>
            <textarea className="champ-saisie" rows={2} value={conclusion} onChange={(e) => setConclusion(e.target.value)} style={{ marginBottom: 10 }} />

            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <button className="bouton-primaire" onClick={enregistrerRapport}>Enregistrer le rapport</button>
              <button className="bouton-secondaire" onClick={() => ouvrirFichier(`/dossiers-examen/${dossier.Dos_num}/rapport/pdf`)}>Voir le PDF</button>
              <button className="bouton-secondaire" onClick={() => imprimerPdf(`/dossiers-examen/${dossier.Dos_num}/rapport/pdf`)}>🖨 Imprimer</button>
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
                    <tr key={d.Dos_num} style={{ cursor: "pointer" }} onClick={() => ouvrirDossier(d.Dos_num)}>
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
