// pages/RelevesBons.jsx
// ---------------------------
// § demande utilisateur : "implémente le module de production des 'Relevés
// de Bons' accessible par les rôles Comptable, Admin et super-admin (ici
// par cabinets). Les Relevés de Bons seront toujours générés en PDF [...]
// 2 modèles [...] : standard simple et détaillé par Souscripteur et
// détails des reçus." Contrôle d'accès réel côté serveur
// (exiger_role("Comptable"), qui laisse toujours passer l'Administrateur —
// donc aussi le super-admin, dont le rôle vaut toujours "Administrateur")
// — RouteProtegee ci-dessous ne fait que masquer/afficher le lien de menu
// par cohérence d'affichage.
//
// La "Maintenance des Bons" (filtrage/tri avancé avant génération, voir la
// capture WinDev fournie par l'utilisateur) est prévue pour une session
// ultérieure — cette page se limite à choisir un assureur + une période
// (+ un souscripteur pour le modèle simple) puis à générer directement le
// PDF choisi.

import { useState, useEffect } from "react";
import { FileText, Receipt, Layers } from "lucide-react";
import api from "../utils/api";
import VisionneusePdf from "../components/VisionneusePdf";

export default function RelevesBons() {
  const debutMois = new Date();
  debutMois.setDate(1);
  const aujourdHui = new Date().toISOString().slice(0, 10);

  const [dateDebut, setDateDebut] = useState(debutMois.toISOString().slice(0, 10));
  const [dateFin, setDateFin] = useState(aujourdHui);
  const [assurances, setAssurances] = useState([]);
  const [assuranceChoisie, setAssuranceChoisie] = useState("");
  const [souscripteurs, setSouscripteurs] = useState([]);
  const [souscripteurChoisi, setSouscripteurChoisi] = useState("");
  const [chargementSouscripteurs, setChargementSouscripteurs] = useState(false);
  const [pdfOuvert, setPdfOuvert] = useState(null); // {chemin, titre} | null
  const [erreur, setErreur] = useState("");

  useEffect(() => {
    api.get("/assurances").then((r) => {
      setAssurances(r.data);
      if (r.data.length > 0) setAssuranceChoisie((precedente) => precedente || String(r.data[0].numero_enreg));
    });
  }, []);

  // § alimente le sélecteur "Souscripteur" du modèle simple — seuls les
  // souscripteurs ayant réellement au moins un bon pour CET assureur sur
  // LA PÉRIODE choisie apparaissent (jamais une liste générique).
  useEffect(() => {
    if (!assuranceChoisie) { setSouscripteurs([]); setSouscripteurChoisi(""); return; }
    setChargementSouscripteurs(true);
    api.get("/releves-bons/souscripteurs", { params: { assurance_numero_enreg: assuranceChoisie, date_debut: dateDebut, date_fin: dateFin } })
      .then((r) => {
        setSouscripteurs(r.data);
        setSouscripteurChoisi((precedent) => r.data.some((s) => s.souscripteur === precedent) ? precedent : (r.data[0]?.souscripteur || ""));
      })
      .catch(() => setSouscripteurs([]))
      .finally(() => setChargementSouscripteurs(false));
  }, [assuranceChoisie, dateDebut, dateFin]);

  const nomAssuranceChoisie = assurances.find((a) => String(a.numero_enreg) === String(assuranceChoisie))?.nom || "";

  function genererSimple() {
    if (!assuranceChoisie || !souscripteurChoisi) return setErreur("Choisissez une assurance et un souscripteur.");
    setErreur("");
    const params = new URLSearchParams({ assurance_numero_enreg: assuranceChoisie, souscripteur: souscripteurChoisi, date_debut: dateDebut, date_fin: dateFin });
    setPdfOuvert({ chemin: `/releves-bons/simple/pdf?${params}`, titre: `Relevé simple — ${souscripteurChoisi}` });
  }

  function genererDetaille() {
    if (!assuranceChoisie) return setErreur("Choisissez une assurance.");
    setErreur("");
    const params = new URLSearchParams({ assurance_numero_enreg: assuranceChoisie, date_debut: dateDebut, date_fin: dateFin });
    setPdfOuvert({ chemin: `/releves-bons/detaille/pdf?${params}`, titre: `Relevé détaillé — ${nomAssuranceChoisie}` });
  }

  return (
    <div>
      <div className="titre-page" style={{ display: "flex", alignItems: "center", gap: 8 }}><FileText size={22} /> Relevés de Bons</div>
      <div className="sous-titre-page">Documents à adresser aux assureurs pour réclamer, par reçus et numéros de bons, les sommes dues sur une période</div>

      <div className="carte" style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20, alignItems: "flex-end" }}>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 3 }}>Du</label>
          <input className="champ-saisie" style={{ width: 160 }} type="date" value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} />
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 3 }}>Au</label>
          <input className="champ-saisie" style={{ width: 160 }} type="date" value={dateFin} onChange={(e) => setDateFin(e.target.value)} />
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 3 }}>Assurance</label>
          <select className="champ-saisie" style={{ width: 240 }} value={assuranceChoisie} onChange={(e) => setAssuranceChoisie(e.target.value)}>
            {assurances.length === 0 && <option value="">Aucune assurance enregistrée</option>}
            {assurances.map((a) => <option key={a.numero_enreg} value={a.numero_enreg}>{a.nom}</option>)}
          </select>
        </div>
      </div>

      {erreur && <div style={{ color: "var(--sawali-rouge)", fontSize: 13, marginBottom: 14 }}>{erreur}</div>}

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <div className="carte" style={{ flex: "1 1 360px", minWidth: 0 }}>
          <div style={{ fontWeight: 700, marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}><Receipt size={16} /> Modèle standard simple</div>
          <div style={{ fontSize: 12.5, color: "var(--sawali-gris-fonce)", marginBottom: 12 }}>
            Une ligne par reçu (part assurée, part assureur, motif) — pour un couple assureur/souscripteur précis. Format "facture" classique.
          </div>
          <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 3 }}>Souscripteur</label>
          <select className="champ-saisie" style={{ width: "100%", marginBottom: 12 }} value={souscripteurChoisi} onChange={(e) => setSouscripteurChoisi(e.target.value)} disabled={chargementSouscripteurs}>
            {chargementSouscripteurs && <option>Chargement...</option>}
            {!chargementSouscripteurs && souscripteurs.length === 0 && <option value="">Aucun bon sur cette période</option>}
            {souscripteurs.map((s) => (
              <option key={s.souscripteur} value={s.souscripteur}>{s.souscripteur} ({s.nombre_recus} reçu{s.nombre_recus > 1 ? "s" : ""})</option>
            ))}
          </select>
          <button className="bouton-primaire" disabled={!souscripteurChoisi} onClick={genererSimple} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <FileText size={14} /> Générer le relevé simple
          </button>
        </div>

        <div className="carte" style={{ flex: "1 1 360px", minWidth: 0 }}>
          <div style={{ fontWeight: 700, marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}><Layers size={16} /> Modèle détaillé par souscripteur</div>
          <div style={{ fontSize: 12.5, color: "var(--sawali-gris-fonce)", marginBottom: 12 }}>
            Une section par souscripteur/groupe couvert par cet assureur, avec le détail acte par acte de chaque reçu et les sous-totaux — pour toute la période, tous souscripteurs confondus.
          </div>
          <button className="bouton-primaire" disabled={!assuranceChoisie} onClick={genererDetaille} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <FileText size={14} /> Générer le relevé détaillé
          </button>
        </div>
      </div>

      {pdfOuvert && <VisionneusePdf chemin={pdfOuvert.chemin} titre={pdfOuvert.titre} onFermer={() => setPdfOuvert(null)} />}
    </div>
  );
}
