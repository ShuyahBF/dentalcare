// pages/VidalFicheProduit.jsx
// --------------------------------
// § demande utilisateur — Module VIDAL France : recherche un médicament pour
// voir ses voies d'administration, ses documents (RCP...) et ses équivalents
// (regroupement VMP officiel VIDAL). Port fidèle de /portal/vidal-fiche —
// aucune donnée simulée, tout provient de l'API VIDAL réelle.

import { useState } from "react";
import { Pill, Package, Route, FileText, Eye, ExternalLink, Loader2 } from "lucide-react";
import api from "../utils/api";
import VidalMedicationSearch from "../components/VidalMedicationSearch";
import VisionneuseDocumentVidal from "../components/VisionneuseDocumentVidal";

export default function VidalFicheProduit() {
  const [query, setQuery] = useState("");
  const [produit, setProduit] = useState(null);
  const [detail, setDetail] = useState(null);
  const [chargementDetail, setChargementDetail] = useState(false);
  const [equivalents, setEquivalents] = useState(null);
  const [chargementEquivalents, setChargementEquivalents] = useState(false);
  const [erreur, setErreur] = useState("");
  const [documentAffiche, setDocumentAffiche] = useState(null);

  async function selectionnerProduit(item) {
    setProduit(item);
    setQuery("");
    setDetail(null);
    setEquivalents(null);
    setErreur("");
    if (!item.vidal_id) return;
    setChargementDetail(true);
    try {
      const r = await api.get(`/vidal/product/${item.vidal_id}/detail`);
      setDetail(r.data);
    } catch (err) {
      setErreur(err.response?.data?.detail || "Fiche produit indisponible.");
    }
    setChargementDetail(false);
  }

  async function chargerEquivalents() {
    if (!detail?.vmp_id) return;
    setChargementEquivalents(true);
    try {
      const r = await api.get(`/vidal/vmp/${detail.vmp_id}/equivalents`, { params: { exclude_product_id: produit?.vidal_id } });
      setEquivalents(r.data?.equivalents || []);
    } catch (err) {
      setErreur(err.response?.data?.detail || "Équivalences indisponibles.");
    }
    setChargementEquivalents(false);
  }

  async function ouvrirDocument(doc) {
    // § demande utilisateur : plus d'ouverture dans une page/onglet externe
    // — le HTML VIDAL (rendu "intégré") s'affiche désormais dans une
    // visionneuse intégrée à la page (voir VisionneuseDocumentVidal),
    // impression comprise sans quitter l'application. Les PDF restent
    // ouverts par le navigateur (blob local, pas de navigation externe non
    // plus, mais son visualiseur natif est déjà satisfaisant pour un PDF).
    if (doc.is_html) {
      setDocumentAffiche({ titre: doc.title || doc.item_type, chargement: true });
      try {
        const r = await api.get("/vidal/documents/proxy", { params: { url: doc.url }, responseType: "text" });
        setDocumentAffiche({ titre: doc.title || doc.item_type, html: r.data });
      } catch (err) {
        setDocumentAffiche(null);
        setErreur(err.response?.data?.detail || "Document indisponible.");
      }
      return;
    }
    try {
      const r = await api.get("/vidal/documents/proxy", { params: { url: doc.url }, responseType: "blob" });
      const blobUrl = URL.createObjectURL(r.data);
      window.open(blobUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      setErreur(err.response?.data?.detail || "Document indisponible.");
    }
  }

  return (
    <div>
      <div className="titre-page" style={{ display: "flex", alignItems: "center", gap: 8 }}><Pill size={22} /> Fiche Produit VIDAL</div>
      <div className="sous-titre-page">Recherchez un médicament pour voir ses voies d'administration, ses documents et ses équivalents.</div>

      <div className="carte" style={{ marginBottom: 20 }}>
        <VidalMedicationSearch query={query} onQueryChange={setQuery} onSelect={selectionnerProduit} onClear={() => setQuery("")} placeholder="Rechercher un produit (ex : Efferalgan 500)…" />
      </div>

      {erreur && <div className="carte" style={{ color: "var(--sawali-rouge)", marginBottom: 20 }}>{erreur}</div>}
      {chargementDetail && <div className="carte" style={{ color: "var(--sawali-gris)" }}>Chargement de la fiche produit…</div>}

      {detail && !chargementDetail && (
        <>
          <div className="carte" style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, marginBottom: 10 }}>
              <Pill size={15} /> {detail.name || produit?.title}
              {produit?.vidal_id && <span style={{ fontFamily: "monospace", fontSize: 12, color: "var(--sawali-gris)" }}>#{produit.vidal_id}</span>}
            </div>
            {detail.vmp_id ? (
              <button className="bouton-secondaire" onClick={chargerEquivalents} disabled={chargementEquivalents} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                {chargementEquivalents ? <Loader2 size={13} className="lucide-tourne" /> : <Package size={13} />} Voir les équivalents (même DCI + dosage)
              </button>
            ) : (
              <div style={{ fontSize: 13, color: "var(--sawali-gris)" }}>Aucun regroupement VMP renvoyé pour ce produit.</div>
            )}
            {equivalents && (
              <div style={{ marginTop: 12 }}>
                {equivalents.length === 0 ? (
                  <div style={{ fontSize: 13, color: "var(--sawali-gris)" }}>Aucun produit équivalent trouvé.</div>
                ) : (
                  equivalents.map((eq, i) => (
                    <div key={eq.vidal_id || i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "6px 10px", border: "1px solid var(--sawali-bordure)", borderRadius: 8, marginBottom: 4 }}>
                      <span>{eq.title}</span>
                      {eq.vidal_id && <span style={{ fontFamily: "monospace", color: "var(--sawali-gris)" }}>#{eq.vidal_id}</span>}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <div className="carte" style={{ flex: "1 1 280px" }}>
              <div style={{ fontWeight: 700, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}><Route size={15} /> Voies d'administration</div>
              {detail.routes?.length ? (
                detail.routes.map((r) => <span key={r.id} className="badge badge-bleu" style={{ marginRight: 6, marginBottom: 6, display: "inline-block" }}>{r.name}</span>)
              ) : (
                <div style={{ fontSize: 13, color: "var(--sawali-gris)" }}>Aucune voie d'administration renvoyée par VIDAL.</div>
              )}
            </div>

            <div className="carte" style={{ flex: "1 1 280px" }}>
              <div style={{ fontWeight: 700, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}><FileText size={15} /> Documents</div>
              {detail.documents?.length ? (
                detail.documents.map((doc) => (
                  <div key={doc.item_type} style={{ marginBottom: 8, fontSize: 13 }}>
                    <button onClick={() => ouvrirDocument(doc)} style={{ border: "none", background: "none", color: "var(--sawali-bleu)", cursor: "pointer", padding: 0, textDecoration: "underline", display: "inline-flex", alignItems: "center", gap: 4 }}>
                      {doc.title || doc.item_type} {doc.is_html ? <Eye size={12} /> : <ExternalLink size={12} />}
                    </button>
                    <span className={`badge ${doc.is_html ? "badge-bleu" : "badge-orange"}`} style={{ marginLeft: 8, fontSize: 10 }}>
                      {doc.is_html ? "VIDAL (intégré)" : "Document (PDF)"}
                    </span>
                  </div>
                ))
              ) : (
                <div style={{ fontSize: 13, color: "var(--sawali-gris)" }}>Aucun document renvoyé par VIDAL pour ce produit.</div>
              )}
            </div>
          </div>
        </>
      )}

      <VisionneuseDocumentVidal document={documentAffiche} onFermer={() => setDocumentAffiche(null)} />
    </div>
  );
}
