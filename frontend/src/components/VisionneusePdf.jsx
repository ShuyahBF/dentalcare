// components/VisionneusePdf.jsx
// -----------------------------------
// § demande utilisateur : "Toutes impressions PDF doit être consultable et
// imprimable en lecteur PDF intégré." — remplace partout dans l'application
// le comportement précédent (ouverture en nouvel onglet via ouvrirFichier,
// impression via un iframe invisible via imprimerPdf) par une modale qui
// affiche le PDF directement DANS la page, avec ses propres boutons
// Imprimer/Télécharger/Fermer — jamais un nouvel onglet.
//
// Usage dans une page :
//   const [pdfOuvert, setPdfOuvert] = useState(null); // {chemin, titre} | null
//   <button onClick={() => setPdfOuvert({ chemin: "/caisse/ventes/R-1/pdf", titre: "Reçu R-1" })}>Consulter</button>
//   {pdfOuvert && <VisionneusePdf chemin={pdfOuvert.chemin} titre={pdfOuvert.titre} onFermer={() => setPdfOuvert(null)} />}

import { useState, useEffect, useRef } from "react";
import { X, Printer, Download, Loader2, AlertTriangle } from "lucide-react";
import api from "../utils/api";

export default function VisionneusePdf({ chemin, titre, onFermer }) {
  const [urlBlob, setUrlBlob] = useState(null);
  const [erreur, setErreur] = useState("");
  const cadreRef = useRef(null);

  useEffect(() => {
    let urlCourante = null;
    let annule = false;
    setErreur("");
    setUrlBlob(null);
    api.get(chemin, { responseType: "blob" }).then((reponse) => {
      if (annule) return;
      urlCourante = URL.createObjectURL(reponse.data);
      setUrlBlob(urlCourante);
    }).catch((err) => {
      if (annule) return;
      // § un blob d'erreur JSON (ex: 404 "Reçu introuvable") arrive ici
      // encodé en Blob à cause de responseType: "blob" — décodé pour
      // afficher le vrai message plutôt qu'une erreur générique.
      const donnees = err.response?.data;
      if (donnees instanceof Blob) {
        donnees.text().then((texte) => {
          try { setErreur(JSON.parse(texte).detail || "Impossible de charger le document."); }
          catch { setErreur("Impossible de charger le document."); }
        });
      } else {
        setErreur("Impossible de charger le document.");
      }
    });
    return () => {
      annule = true;
      if (urlCourante) URL.revokeObjectURL(urlCourante);
    };
  }, [chemin]);

  function imprimer() {
    cadreRef.current?.contentWindow?.print();
  }

  function telecharger() {
    if (!urlBlob) return;
    const lien = document.createElement("a");
    lien.href = urlBlob;
    lien.download = `${(titre || "document").replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`;
    lien.click();
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(20,30,50,0.55)", zIndex: 3000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div className="carte" style={{ width: "100%", maxWidth: 900, height: "90vh", display: "flex", flexDirection: "column", padding: 0, overflow: "hidden" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid var(--sawali-bordure)" }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{titre || "Document PDF"}</div>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="bouton-secondaire" disabled={!urlBlob} onClick={imprimer} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, padding: "5px 10px" }}><Printer size={14} /> Imprimer</button>
            <button className="bouton-secondaire" disabled={!urlBlob} onClick={telecharger} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, padding: "5px 10px" }}><Download size={14} /> Télécharger</button>
            <button onClick={onFermer} style={{ border: "none", background: "none", cursor: "pointer", display: "flex", padding: 4 }}><X size={19} /></button>
          </div>
        </div>
        <div style={{ flex: 1, position: "relative", background: "var(--sawali-gris-clair)" }}>
          {erreur ? (
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, color: "var(--sawali-rouge)", padding: 20, textAlign: "center" }}>
              <AlertTriangle size={22} />
              <div style={{ fontSize: 13.5 }}>{erreur}</div>
            </div>
          ) : !urlBlob ? (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--sawali-gris)" }}>
              <Loader2 size={22} className="lucide-tourne" />
            </div>
          ) : (
            <iframe ref={cadreRef} src={urlBlob} title={titre || "Document PDF"} style={{ width: "100%", height: "100%", border: "none" }} />
          )}
        </div>
      </div>
    </div>
  );
}
