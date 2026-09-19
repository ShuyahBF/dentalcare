// pages/VerificationOrdonnance.jsx
// -------------------------------------
// § demande utilisateur : "Même chose aussi pour les ordonnances. Ainsi le
// patient se rendant en pharmacie donne la possibilité d'ouvrir un lien
// permettant à l'officine de vérifier, servir (en fonction des quantités
// disponibles chez eux)." — page PUBLIQUE (aucune connexion requise) ouverte
// en scannant le QR imprimé sur une ordonnance. Affiche le contenu (relu EN
// DIRECT depuis la base à chaque ouverture, voir
// app/routers/verification.py) et propose à l'officine un formulaire pour
// indiquer ce qu'elle a effectivement délivré.

import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { ShieldCheck, ShieldAlert, Loader2, CheckCircle2, Pill } from "lucide-react";
import api from "../utils/api";

export default function VerificationOrdonnance() {
  const { jeton } = useParams();
  const [donnees, setDonnees] = useState(null);
  const [erreur, setErreur] = useState("");
  const [chargement, setChargement] = useState(true);

  const [afficherFormulaire, setAfficherFormulaire] = useState(false);
  const [nomOfficine, setNomOfficine] = useState("");
  const [ville, setVille] = useState("");
  const [lignesServies, setLignesServies] = useState([]);
  const [commentaire, setCommentaire] = useState("");
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [erreurEnvoi, setErreurEnvoi] = useState("");
  const [envoye, setEnvoye] = useState(false);

  useEffect(() => {
    api.get(`/verification/ordonnance/${jeton}`)
      .then((r) => {
        setDonnees(r.data);
        // § pré-remplit une ligne par désignation prescrite, disponible
        // par défaut — l'officine ajuste ce qui manque plutôt que de tout
        // ressaisir depuis zéro.
        setLignesServies((r.data.lignes || []).map((l) => ({ designation: l.designation, disponible: true, quantite_servie: "" })));
      })
      .catch((err) => setErreur(err.response?.data?.detail || "Ce lien de vérification est invalide."))
      .finally(() => setChargement(false));
  }, [jeton]);

  function modifierLigne(index, champ, valeur) {
    setLignesServies((lignes) => lignes.map((l, i) => (i === index ? { ...l, [champ]: valeur } : l)));
  }

  async function soumettre() {
    if (!nomOfficine.trim()) { setErreurEnvoi("Le nom de l'officine est obligatoire."); return; }
    setEnvoiEnCours(true);
    setErreurEnvoi("");
    try {
      await api.post(`/verification/ordonnance/${jeton}/servir`, {
        nom_officine: nomOfficine.trim(), ville: ville.trim() || null,
        lignes_servies: lignesServies, commentaire: commentaire.trim() || null,
      });
      setEnvoye(true);
    } catch (err) {
      setErreurEnvoi(err.response?.data?.detail || "Échec de l'envoi. Réessayez.");
    }
    setEnvoiEnCours(false);
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--sawali-gris-clair, #f4f6fb)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div className="carte" style={{ maxWidth: 480, width: "100%" }}>
        <div style={{ textAlign: "center", marginBottom: 18 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: "var(--sawali-bleu, #1c4587)" }}>SAWALI DentalCare</div>
          <div style={{ fontSize: 12.5, color: "var(--sawali-gris-fonce, #4a5568)" }}>Vérification de document — Ordonnance</div>
        </div>

        {chargement && (
          <div style={{ display: "flex", justifyContent: "center", padding: 30 }}><Loader2 size={26} className="lucide-tourne" color="var(--sawali-gris)" /></div>
        )}

        {!chargement && erreur && (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <ShieldAlert size={40} color="var(--sawali-rouge, #e0392b)" style={{ marginBottom: 10 }} />
            <div style={{ fontWeight: 700, color: "var(--sawali-rouge, #e0392b)", marginBottom: 6 }}>Document non vérifiable</div>
            <div style={{ fontSize: 13.5, color: "var(--sawali-gris-fonce, #4a5568)" }}>{erreur}</div>
          </div>
        )}

        {!chargement && donnees && (
          <div>
            <div style={{ textAlign: "center", marginBottom: 16 }}>
              <ShieldCheck size={36} color="var(--sawali-vert, #2fa84f)" style={{ marginBottom: 6 }} />
              <div style={{ fontWeight: 700, color: "var(--sawali-vert, #2fa84f)", fontSize: 14 }}>Ordonnance authentique</div>
            </div>

            <table style={{ width: "100%", fontSize: 13.5, borderCollapse: "collapse", marginBottom: 14 }}>
              <tbody>
                <tr><td style={{ padding: "4px 0", color: "var(--sawali-gris-fonce, #4a5568)" }}>Cabinet</td><td style={{ padding: "4px 0", textAlign: "right", fontWeight: 600 }}>{donnees.cabinet_denomination}</td></tr>
                <tr><td style={{ padding: "4px 0", color: "var(--sawali-gris-fonce, #4a5568)" }}>Référence</td><td style={{ padding: "4px 0", textAlign: "right", fontWeight: 600 }}>{donnees.reference}</td></tr>
                {donnees.patient_affiche && <tr><td style={{ padding: "4px 0", color: "var(--sawali-gris-fonce, #4a5568)" }}>Patient</td><td style={{ padding: "4px 0", textAlign: "right", fontWeight: 600 }}>{donnees.patient_affiche}</td></tr>}
                <tr><td style={{ padding: "4px 0", color: "var(--sawali-gris-fonce, #4a5568)" }}>Date</td><td style={{ padding: "4px 0", textAlign: "right", fontWeight: 600 }}>{new Date(donnees.date_creation).toLocaleDateString("fr-FR")}</td></tr>
              </tbody>
            </table>

            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}><Pill size={14} /> Prescription</div>
            <ul style={{ margin: "0 0 16px", paddingLeft: 18, fontSize: 13.5 }}>
              {(donnees.lignes || []).map((l, i) => (
                <li key={i}>
                  <b>{l.designation}</b>{l.posologie ? ` — ${l.posologie}` : ""}{l.duree ? ` (${l.duree})` : ""}{l.quantite ? `, qté ${l.quantite}` : ""}
                </li>
              ))}
            </ul>

            {donnees.services_deja_rendus?.length > 0 && (
              <div style={{ marginBottom: 16, padding: 10, background: "var(--sawali-gris-clair, #f4f6fb)", borderRadius: 6, fontSize: 12.5 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Déjà servie par :</div>
                {donnees.services_deja_rendus.map((s, i) => (
                  <div key={i}>{s.nom_officine} — {new Date(s.date_service).toLocaleDateString("fr-FR")}</div>
                ))}
              </div>
            )}

            {envoye ? (
              <div style={{ textAlign: "center", padding: "16px 0", color: "var(--sawali-vert, #2fa84f)" }}>
                <CheckCircle2 size={30} style={{ marginBottom: 6 }} />
                <div style={{ fontWeight: 600 }}>Merci, votre retour a bien été enregistré.</div>
                <div style={{ fontSize: 12.5, color: "var(--sawali-gris-fonce, #4a5568)", marginTop: 4 }}>Le médecin prescripteur en est informé.</div>
              </div>
            ) : !afficherFormulaire ? (
              <button className="bouton-primaire" style={{ width: "100%" }} onClick={() => setAfficherFormulaire(true)}>Je suis une officine — Enregistrer le service</button>
            ) : (
              <div style={{ borderTop: "1px solid var(--sawali-bordure, #eef2fa)", paddingTop: 14 }}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Formulaire de service officine</div>
                <label className="libelle-obligatoire" style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 3 }}>* Nom de l'officine</label>
                <input className="champ-saisie" value={nomOfficine} onChange={(e) => setNomOfficine(e.target.value)} style={{ marginBottom: 8, width: "100%" }} />
                <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 3 }}>Ville</label>
                <input className="champ-saisie" value={ville} onChange={(e) => setVille(e.target.value)} style={{ marginBottom: 12, width: "100%" }} />

                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Pour chaque produit, en fonction de vos quantités disponibles :</div>
                {lignesServies.map((l, i) => (
                  <div key={i} style={{ marginBottom: 10, padding: 8, background: "var(--sawali-gris-clair, #f4f6fb)", borderRadius: 6 }}>
                    <div style={{ fontWeight: 600, fontSize: 12.5, marginBottom: 4 }}>{l.designation}</div>
                    <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                      <input type="checkbox" checked={l.disponible} onChange={(e) => modifierLigne(i, "disponible", e.target.checked)} /> Disponible / servi
                    </label>
                    {l.disponible && (
                      <input className="champ-saisie" placeholder="Quantité servie (ex: 1 boîte de 20)" value={l.quantite_servie} onChange={(e) => modifierLigne(i, "quantite_servie", e.target.value)} style={{ width: "100%", fontSize: 12.5 }} />
                    )}
                  </div>
                ))}

                <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 3 }}>Commentaire (facultatif)</label>
                <textarea className="champ-saisie" rows={2} value={commentaire} onChange={(e) => setCommentaire(e.target.value)} style={{ marginBottom: 12, width: "100%" }} />

                {erreurEnvoi && <div style={{ color: "var(--sawali-rouge, #e0392b)", fontSize: 12.5, marginBottom: 8 }}>{erreurEnvoi}</div>}
                <button className="bouton-primaire" style={{ width: "100%" }} disabled={envoiEnCours} onClick={soumettre}>
                  {envoiEnCours ? "Envoi..." : "Confirmer le service"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
