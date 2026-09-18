// components/ModaleEncaissement.jsx
// --------------------------------------
// § demande utilisateur : "On ne peut faire un encaissement sur une facture
// avec RAP sans l'ouvrir (voir les détails) et compléter le montant à
// payer." Remplace le simple clic "Encaisser" par une modale montrant le
// détail du reçu (lignes, montants) et un champ de montant à encaisser
// (pré-rempli avec le reste à payer, mais modifiable pour un règlement
// partiel/échelonné).

import { useState, useEffect } from "react";
import api from "../utils/api";

export default function ModaleEncaissement({ reference, onFermer, onEncaisse }) {
  const [vente, setVente] = useState(null);
  const [typesPaiement, setTypesPaiement] = useState([]);
  const [montant, setMontant] = useState("");
  // § demande utilisateur : "Avant de confirmer le paiement afficher aussi
  // et toujours la monnaie à rendre" — le patient peut remettre plus que le
  // montant réellement crédité sur CE reçu (ex: gros billet en espèces).
  const [montantRecu, setMontantRecu] = useState("");
  const [modeReglement, setModeReglement] = useState("Espèces");
  const [referencePaiement, setReferencePaiement] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState("");

  useEffect(() => {
    api.get("/types-paiement").then((r) => setTypesPaiement(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!reference) return;
    api.get(`/caisse/ventes/${reference}`).then((r) => {
      setVente(r.data);
      setMontant(String(r.data.reste_a_payer));
      setMontantRecu(String(r.data.reste_a_payer));
      setModeReglement(r.data.mode_reglement || "Espèces");
    });
  }, [reference]);

  if (!reference) return null;

  // Le montant reçu suit le montant à encaisser tant que le caissier ne l'a
  // pas explicitement modifié (cas du billet plus gros que le solde dû).
  function changerMontant(valeur) {
    const ancienEgal = montant === montantRecu;
    setMontant(valeur);
    if (ancienEgal) setMontantRecu(valeur);
  }

  const monnaieARendre = Math.max(0, Number(montantRecu || 0) - Number(montant || 0));

  async function confirmer() {
    const valeur = Number(montant);
    if (!valeur || valeur <= 0) return setErreur("Le montant doit être positif.");
    if (valeur > vente.reste_a_payer + 0.01) return setErreur(`Le montant ne peut pas dépasser le reste à payer (${vente.reste_a_payer.toLocaleString("fr-FR")} F).`);
    if (Number(montantRecu) < valeur) return setErreur("Le montant reçu du patient ne peut pas être inférieur au montant encaissé.");
    const typeChoisi = typesPaiement.find((t) => t.nom === modeReglement);
    if (typeChoisi?.exige_reference && !referencePaiement.trim()) return setErreur(`La référence de transaction est obligatoire pour le mode de règlement « ${modeReglement} ».`);
    setEnCours(true);
    setErreur("");
    try {
      await api.post(`/caisse/ventes/${reference}/encaisser`, null, {
        params: { montant: valeur, mode_reglement: modeReglement, reference_paiement: referencePaiement || undefined },
      });
      onEncaisse?.();
      onFermer();
    } catch (err) {
      setErreur(err.response?.data?.detail || "Encaissement impossible.");
    }
    setEnCours(false);
  }

  return (
    <div role="dialog" aria-modal="true" style={{ position: "fixed", inset: 0, background: "rgba(15,20,30,0.55)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onFermer}>
      <div className="carte" style={{ width: "min(560px, 100%)", maxHeight: "85vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        {!vente ? (
          <div style={{ color: "var(--sawali-gris)" }}>Chargement du détail du reçu…</div>
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>💰 Encaisser {vente.Référence}</div>
              <button onClick={onFermer} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 16 }}>✕</button>
            </div>

            <div style={{ fontSize: 13, marginBottom: 4 }}><strong>Patient :</strong> {vente.patient_affiche}</div>
            {vente.duplique_de && <div style={{ fontSize: 11.5, color: "var(--sawali-orange)", marginBottom: 4 }}>📋 Dupliqué depuis {vente.duplique_de}</div>}

            {vente.lignes?.length > 0 && (
              <table className="tableau-donnees" style={{ marginTop: 10, marginBottom: 10 }}>
                <thead><tr><th>Description</th><th>Qté</th><th>Sous-total</th></tr></thead>
                <tbody>
                  {vente.lignes.map((l, i) => (
                    <tr key={i}>
                      <td>{l.libelle}</td>
                      <td className="chiffre">{l.quantite}</td>
                      <td className="chiffre">{Number(l.sous_total || 0).toLocaleString("fr-FR")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "8px 0", borderTop: "1px solid var(--sawali-bordure)" }}>
              <span>Montant total</span><span className="chiffre" style={{ fontWeight: 600 }}>{Number(vente.Montant || 0).toLocaleString("fr-FR")} F</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, paddingBottom: 8 }}>
              <span>Déjà réglé</span><span className="chiffre">{Number(vente.MontantRéglé || 0).toLocaleString("fr-FR")} F</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, paddingBottom: 14, fontWeight: 700, color: "var(--sawali-orange)" }}>
              <span>Reste à payer</span><span className="chiffre">{Number(vente.reste_a_payer || 0).toLocaleString("fr-FR")} F</span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 3 }}>Montant à encaisser maintenant</label>
                <input type="number" className="champ-saisie" value={montant} onChange={(e) => changerMontant(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 3 }}>Mode de règlement</label>
                <select className="champ-saisie" value={modeReglement} onChange={(e) => setModeReglement(e.target.value)}>
                  {typesPaiement.length === 0 && <option>Espèces</option>}
                  {typesPaiement.map((t) => <option key={t.nom} value={t.nom}>{t.nom}</option>)}
                </select>
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 3 }}>Référence de transaction {typesPaiement.find((t) => t.nom === modeReglement)?.exige_reference ? "(obligatoire)" : "(optionnel)"}</label>
              <input className="champ-saisie" value={referencePaiement} onChange={(e) => setReferencePaiement(e.target.value)} />
            </div>

            {/* § demande utilisateur : toujours afficher la monnaie à rendre avant de confirmer. */}
            <div style={{ border: "1.5px solid var(--sawali-bordure)", borderRadius: 10, padding: 12, marginBottom: 14, background: "var(--sawali-gris-clair)" }}>
              <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 3 }}>Montant reçu du patient</label>
              <input type="number" className="champ-saisie" value={montantRecu} onChange={(e) => setMontantRecu(e.target.value)} style={{ marginBottom: 10 }} />
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 14 }}>
                <span>💵 Monnaie à rendre</span>
                <span className="chiffre" style={{ color: monnaieARendre > 0 ? "var(--sawali-vert)" : "var(--sawali-gris)" }}>{monnaieARendre.toLocaleString("fr-FR")} F</span>
              </div>
            </div>

            {Number(montant) > 0 && Number(montant) < vente.reste_a_payer && (
              <div style={{ fontSize: 12, color: "var(--sawali-orange)", marginBottom: 10 }}>
                ⚠️ Règlement partiel — il restera {(vente.reste_a_payer - Number(montant)).toLocaleString("fr-FR")} F à encaisser plus tard.
              </div>
            )}
            {erreur && <div style={{ color: "var(--sawali-rouge)", fontSize: 13, marginBottom: 10 }}>{erreur}</div>}

            <div style={{ display: "flex", gap: 10 }}>
              <button className="bouton-primaire" onClick={confirmer} disabled={enCours}>{enCours ? "Encaissement..." : "✅ Confirmer l'encaissement"}</button>
              <button className="bouton-secondaire" onClick={onFermer}>Annuler</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
