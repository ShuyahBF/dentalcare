// pages/VerificationEtatCaisse.jsx
// -------------------------------------
// § demande utilisateur : "apposer un QR Code crypté: Cabinet, Caissier,
// Montants, nombre de lignes. Cela sécurise ce document de gestion." — page
// PUBLIQUE (aucune connexion requise, voir App.jsx : rendue hors de
// RouteProtegee) ouverte en scannant le QR imprimé sur un état de caisse.
// La signature du jeton (vérifiée côté serveur, voir
// app/routers/verification.py) est ce qui prouve l'authenticité — cette
// page ne fait qu'afficher ce que le serveur confirme avoir signé.

import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { ShieldCheck, ShieldAlert, Loader2 } from "lucide-react";
import api from "../utils/api";

export default function VerificationEtatCaisse() {
  const { jeton } = useParams();
  const [donnees, setDonnees] = useState(null);
  const [erreur, setErreur] = useState("");
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    api.get(`/verification/etat-caisse/${jeton}`)
      .then((r) => setDonnees(r.data))
      .catch((err) => setErreur(err.response?.data?.detail || "Ce lien de vérification est invalide."))
      .finally(() => setChargement(false));
  }, [jeton]);

  return (
    <div style={{ minHeight: "100vh", background: "var(--sawali-gris-clair, #f4f6fb)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div className="carte" style={{ maxWidth: 420, width: "100%" }}>
        <div style={{ textAlign: "center", marginBottom: 18 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: "var(--sawali-bleu, #1c4587)" }}>SAWALI DentalCare</div>
          <div style={{ fontSize: 12.5, color: "var(--sawali-gris-fonce, #4a5568)" }}>Vérification de document — État de caisse</div>
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
            <div style={{ textAlign: "center", marginBottom: 18 }}>
              <ShieldCheck size={40} color="var(--sawali-vert, #2fa84f)" style={{ marginBottom: 8 }} />
              <div style={{ fontWeight: 700, color: "var(--sawali-vert, #2fa84f)" }}>Document authentique</div>
              <div style={{ fontSize: 12, color: "var(--sawali-gris-fonce, #4a5568)" }}>Signature vérifiée par le serveur SAWALI DentalCare</div>
            </div>
            <table style={{ width: "100%", fontSize: 14, borderCollapse: "collapse" }}>
              <tbody>
                <tr><td style={{ padding: "6px 0", color: "var(--sawali-gris-fonce, #4a5568)" }}>Cabinet</td><td style={{ padding: "6px 0", textAlign: "right", fontWeight: 600 }}>{donnees.cabinet_denomination}</td></tr>
                <tr><td style={{ padding: "6px 0", color: "var(--sawali-gris-fonce, #4a5568)" }}>Caissier</td><td style={{ padding: "6px 0", textAlign: "right", fontWeight: 600 }}>{donnees.caissier}</td></tr>
                <tr><td style={{ padding: "6px 0", color: "var(--sawali-gris-fonce, #4a5568)" }}>Montant total</td><td style={{ padding: "6px 0", textAlign: "right", fontWeight: 600 }}>{Number(donnees.montant_total).toLocaleString("fr-FR")} FCFA</td></tr>
                <tr><td style={{ padding: "6px 0", color: "var(--sawali-gris-fonce, #4a5568)" }}>Nombre de lignes</td><td style={{ padding: "6px 0", textAlign: "right", fontWeight: 600 }}>{donnees.nombre_lignes}</td></tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
