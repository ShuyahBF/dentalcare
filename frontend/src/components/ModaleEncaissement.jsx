// components/ModaleEncaissement.jsx
// --------------------------------------
// § demande utilisateur : "On ne peut faire un encaissement sur une facture
// avec RAP sans l'ouvrir (voir les détails) et compléter le montant à
// payer." Remplace le simple clic "Encaisser" par une modale montrant le
// détail du reçu (lignes, montants) et un champ de montant à encaisser
// (pré-rempli avec le reste à payer, mais modifiable pour un règlement
// partiel/échelonné).

import { useState, useEffect } from "react";
import { Wallet, X, Copy, Banknote, AlertTriangle, CheckCircle2 } from "lucide-react";
import api from "../utils/api";

export default function ModaleEncaissement({ reference, onFermer, onEncaisse }) {
  const [vente, setVente] = useState(null);
  const [typesPaiement, setTypesPaiement] = useState([]);
  const [montant, setMontant] = useState("");
  // § demande utilisateur : "Avant de confirmer le paiement afficher aussi
  // et toujours la monnaie à rendre" — le patient peut remettre plus que le
  // montant réellement crédité sur CE reçu (ex: gros billet en espèces).
  const [montantRecu, setMontantRecu] = useState("");
  // § correctif : tant que le caissier n'a pas lui-même modifié "Montant
  // reçu du patient", ce champ SUIT TOUJOURS "Montant à encaisser" —
  // aussi bien à la hausse qu'à la baisse (un paiement partiel de 30 000 →
  // 10 000 doit ramener "reçu" à 10 000 également, sans monnaie à rendre).
  // L'ancienne règle ("ne redescend jamais") bloquait justement ce cas :
  // elle laissait "reçu" figé à l'ancien RAP, ce qui semblait exiger un
  // montant reçu supérieur au montant encaissé et refusait le paiement.
  // Dès que le caissier saisit lui-même une valeur dans "reçu" (ex: gros
  // billet), ce suivi automatique s'arrête pour ce reçu précis.
  const [montantRecuTouche, setMontantRecuTouche] = useState(false);
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
      setMontantRecuTouche(false);
      setModeReglement(r.data.mode_reglement || "Espèces");
    });
  }, [reference]);

  useEffect(() => {
    if (!montantRecuTouche) setMontantRecu(montant);
  }, [montant, montantRecuTouche]);

  // § BUG RAPPORTÉ (reçu R-202600008) : un caissier qui saisit UNIQUEMENT
  // "Montant reçu du patient" (ex: 10 000, pensant faire un paiement
  // partiel) sans toucher "Montant à encaisser maintenant" (resté à 30 000,
  // le reste à payer complet) voyait le reçu marqué RÉGLÉ EN TOTALITÉ — le
  // journal d'audit confirme que 30 000 a été envoyé au serveur, pas
  // 10 000. Cause : rien ne faisait redescendre "Montant à encaisser"
  // quand le montant PHYSIQUEMENT reçu était inférieur — pire, l'ancienne
  // logique dans confirmer() faisait l'INVERSE (remontait "reçu" pour
  // qu'il couvre "à encaisser", au lieu de l'inverse). On ne peut
  // logiquement pas encaisser PLUS que ce que le patient a physiquement
  // donné (en l'absence d'un autre moyen de paiement) : dès que le
  // caissier réduit "Montant reçu" sous "Montant à encaisser", ce dernier
  // est ramené au même niveau automatiquement.
  useEffect(() => {
    if (montantRecuTouche && Number(montantRecu) < Number(montant || 0)) {
      setMontant(montantRecu);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [montantRecu, montantRecuTouche]);

  if (!reference) return null;

  const monnaieARendre = Math.max(0, Number(montantRecu || 0) - Number(montant || 0));

  async function confirmer() {
    const valeur = Number(montant);
    if (!valeur || valeur <= 0) return setErreur("Le montant doit être positif.");
    if (valeur > vente.reste_a_payer + 0.01) return setErreur(`Le montant ne peut pas dépasser le reste à payer (${vente.reste_a_payer.toLocaleString("fr-FR")} F).`);
    // § le garde-fou est désormais géré EN AMONT par l'effet ci-dessus (qui
    // ramène "montant" au niveau de "montantRecu" dès la saisie, jamais
    // l'inverse) — ici, une dernière vérification défensive suffit : si
    // pour une raison quelconque "montant reçu" est encore inférieur au
    // montant à encaisser au moment de confirmer, on REFUSE plutôt que de
    // gonfler silencieusement "reçu" comme le faisait l'ancien code (c'est
    // exactement ce qui avait provoqué le bug rapporté).
    if (Number(montantRecu) < valeur - 0.01) return setErreur("Le montant reçu du patient est inférieur au montant à encaisser.");
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
              <div style={{ fontWeight: 700, fontSize: 15, display: "flex", alignItems: "center", gap: 7 }}><Wallet size={18} color="var(--sawali-bleu)" /> Encaisser {vente.Référence}</div>
              <button onClick={onFermer} style={{ border: "none", background: "none", cursor: "pointer", display: "flex", padding: 2 }}><X size={18} /></button>
            </div>

            <div style={{ fontSize: 13, marginBottom: 4 }}><strong>Patient :</strong> {vente.patient_affiche}</div>
            {vente.duplique_de && (
              <div style={{ fontSize: 11.5, color: "var(--sawali-orange)", marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
                <Copy size={12} /> Dupliqué depuis {vente.duplique_de}
              </div>
            )}

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
                <input type="number" className="champ-saisie" value={montant} onChange={(e) => setMontant(e.target.value)} />
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
              <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 3 }}>Montant reçu du patient (espèces physiquement remises)</label>
              <input type="number" className="champ-saisie" value={montantRecu} onChange={(e) => { setMontantRecu(e.target.value); setMontantRecuTouche(true); }} style={{ marginBottom: 4 }} />
              {/* § clarification (bug rapporté) : ce champ sert UNIQUEMENT à
                  calculer la monnaie à rendre — s'il est réduit sous le
                  montant à encaisser, ce dernier est automatiquement ramené
                  au même niveau (voir l'effet plus haut), pour ne jamais
                  encaisser plus que ce qui a été réellement reçu. */}
              <div style={{ fontSize: 10.5, color: "var(--sawali-gris-fonce)", marginBottom: 10 }}>
                Si inférieur au montant à encaisser, ce dernier est automatiquement réduit pour correspondre — c'est le montant réellement enregistré sur le reçu.
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 14 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}><Banknote size={16} /> Monnaie à rendre</span>
                <span className="chiffre" style={{ color: monnaieARendre > 0 ? "var(--sawali-vert)" : "var(--sawali-gris)" }}>{monnaieARendre.toLocaleString("fr-FR")} F</span>
              </div>
            </div>

            {Number(montant) > 0 && Number(montant) < vente.reste_a_payer && (
              <div style={{ fontSize: 12, color: "var(--sawali-orange)", marginBottom: 10, display: "flex", alignItems: "flex-start", gap: 5 }}>
                <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} /> Règlement partiel — il restera {(vente.reste_a_payer - Number(montant)).toLocaleString("fr-FR")} F à encaisser plus tard.
              </div>
            )}
            {erreur && <div style={{ color: "var(--sawali-rouge)", fontSize: 13, marginBottom: 10 }}>{erreur}</div>}

            <div style={{ display: "flex", gap: 10 }}>
              <button className="bouton-primaire" onClick={confirmer} disabled={enCours} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {enCours ? "Encaissement..." : <><CheckCircle2 size={16} /> Confirmer l'encaissement</>}
              </button>
              <button className="bouton-secondaire" onClick={onFermer}>Annuler</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
