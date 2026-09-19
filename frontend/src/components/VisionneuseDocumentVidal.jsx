// components/VisionneuseDocumentVidal.jsx
// ---------------------------------------------
// § demande utilisateur : "L'impression de documents ne doit pas se faire
// dans une page externe. Utilise un composant qui permet de faire un bon
// rendu du résultat HTML intégré à la page." — remplace l'ouverture en
// nouvel onglet (window.open sur l'URL VIDAL) par une modale intégrée :
// le HTML est récupéré via notre propre proxy (même origine, contourne le
// CORS VIDAL) puis rendu dans un <iframe srcDoc>, qui isole proprement le
// CSS/HTML tiers du reste de l'application. Impression déclenchée depuis
// cette même page (contentWindow.print()), sans navigation externe.

import { useRef } from "react";
import { FileText, Printer, X } from "lucide-react";

export default function VisionneuseDocumentVidal({ document, onFermer }) {
  const refIframe = useRef(null);
  if (!document) return null;

  function imprimer() {
    refIframe.current?.contentWindow?.print();
  }

  return (
    <div
      role="dialog" aria-modal="true"
      style={{ position: "fixed", inset: 0, background: "rgba(15,20,30,0.55)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      onClick={onFermer}
    >
      <div
        className="carte"
        style={{ width: "min(920px, 100%)", height: "min(85vh, 920px)", display: "flex", flexDirection: "column", padding: 0, overflow: "hidden" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid var(--sawali-bordure)", flexShrink: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", gap: 6 }}><FileText size={15} /> {document.titre}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="bouton-secondaire" style={{ fontSize: 12.5, display: "inline-flex", alignItems: "center", gap: 5 }} onClick={imprimer}><Printer size={13} /> Imprimer</button>
            <button className="bouton-secondaire" style={{ fontSize: 12.5, display: "inline-flex", alignItems: "center", gap: 5 }} onClick={onFermer}><X size={13} /> Fermer</button>
          </div>
        </div>
        {document.chargement ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--sawali-gris)" }}>Chargement du document…</div>
        ) : (
          <iframe
            ref={refIframe}
            title={document.titre}
            srcDoc={document.html}
            style={{ flex: 1, border: "none", width: "100%", background: "white" }}
            sandbox="allow-same-origin"
          />
        )}
      </div>
    </div>
  );
}
