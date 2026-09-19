// components/ModaleHistoriquePaiements.jsx
// -------------------------------------------
// § demande utilisateur : "Permettre lorsqu'on clique sur un reçu
// partiellement réglé et totalement l'historique de paiement (date/heure,
// montant règlement et type de paiement) dans une modale." Affiche chaque
// règlement enregistré sur `historique_paiements` (alimenté par
// POST .../ventes puis .../encaisser côté backend — voir caisse.py), du
// plus ancien au plus récent, avec un total de contrôle.

import { useState, useEffect } from "react";
import { Receipt, X, CheckCircle2 } from "lucide-react";
import api from "../utils/api";

export default function ModaleHistoriquePaiements({ reference, onFermer }) {
  const [vente, setVente] = useState(null);
  const [enErreur, setEnErreur] = useState(false);

  useEffect(() => {
    if (!reference) return;
    setVente(null);
    setEnErreur(false);
    api.get(`/caisse/ventes/${reference}`).then((r) => setVente(r.data)).catch(() => setEnErreur(true));
  }, [reference]);

  if (!reference) return null;

  const historique = vente?.historique_paiements || [];
  const totalHistorique = historique.reduce((s, e) => s + (e.montant || 0), 0);

  return (
    <div role="dialog" aria-modal="true" style={{ position: "fixed", inset: 0, background: "rgba(15,20,30,0.55)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onFermer}>
      <div className="carte" style={{ width: "min(520px, 100%)", maxHeight: "85vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 7 }}><Receipt size={17} color="var(--sawali-bleu)" /> Historique de paiement — {reference}</div>
          <button onClick={onFermer} style={{ border: "none", background: "none", cursor: "pointer", display: "flex", padding: 2 }}><X size={19} /></button>
        </div>

        {enErreur && <div style={{ color: "var(--sawali-rouge)" }}>Impossible de charger l'historique de ce reçu.</div>}
        {!vente && !enErreur && <div style={{ color: "var(--sawali-gris)" }}>Chargement…</div>}

        {vente && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
              <span>Montant total du reçu</span><span className="chiffre">{Number(vente.Montant || 0).toLocaleString("fr-FR")} F</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
              <span>Déjà réglé</span><span className="chiffre">{Number(vente.MontantRéglé || 0).toLocaleString("fr-FR")} F</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 14, fontWeight: 700, color: vente.reste_a_payer > 0 ? "var(--sawali-orange)" : "var(--sawali-vert)" }}>
              <span>{vente.reste_a_payer > 0 ? "Reste à payer" : "Statut"}</span>
              <span className="chiffre">
                {vente.reste_a_payer > 0
                  ? `${Number(vente.reste_a_payer).toLocaleString("fr-FR")} F`
                  : <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><CheckCircle2 size={14} /> Intégralement réglé</span>}
              </span>
            </div>

            {historique.length === 0 ? (
              <div style={{ color: "var(--sawali-gris)", fontSize: 13.5, textAlign: "center", padding: "16px 0" }}>
                Aucun règlement enregistré individuellement pour ce reçu {/* § reçus créés avant l'ajout de cet historique */}
                (reçu antérieur à l'historisation des paiements, ou proforma non encore réglée).
              </div>
            ) : (
              <table className="tableau-donnees">
                <thead><tr><th>Date/Heure</th><th>Montant</th><th>Type de paiement</th></tr></thead>
                <tbody>
                  {historique.map((e, i) => (
                    <tr key={i}>
                      <td style={{ whiteSpace: "nowrap" }}>{e.date_heure ? new Date(e.date_heure).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-"}</td>
                      <td className="chiffre">{Number(e.montant || 0).toLocaleString("fr-FR")} F</td>
                      <td>
                        {e.mode_reglement || "-"}
                        {e.reference_paiement && <span style={{ color: "var(--sawali-gris)", fontSize: 11 }}> (réf: {e.reference_paiement})</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ fontWeight: 700, borderTop: "2px solid var(--sawali-bordure)" }}>
                    <td>Total ({historique.length} règlement{historique.length > 1 ? "s" : ""})</td>
                    <td className="chiffre">{totalHistorique.toLocaleString("fr-FR")} F</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            )}
          </>
        )}
      </div>
    </div>
  );
}
