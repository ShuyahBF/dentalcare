// pages/Dentiste.jsx
// ----------------------
// Interface du Dentiste (§4f-h) : consulte/corrige les dossiers d'examen,
// visualise le schéma dentaire prévu, rédige son rapport professionnel et
// l'envoie par WhatsApp. Accès à l'historique complet des dossiers passés
// d'un patient. Recherche par patient (plutôt qu'un numéro de dossier brut
// à connaître à l'avance) et création d'un nouveau dossier à la volée.

import { useState, useEffect, useCallback } from "react";
import { Smile, Pencil, Lock, History, Printer, Pill, Trash2, Save, FileText, AlertTriangle, CheckCircle2, ArrowLeft } from "lucide-react";
import api from "../utils/api";
import { ouvrirFichier, imprimerPdf } from "../utils/fichiers";
import { useAuth } from "../utils/authContexte";
import SchemaDentaire from "../components/SchemaDentaire";

const LIGNE_ORDONNANCE_VIDE = { designation: "", posologie: "", duree: "", quantite: "" };

export default function Dentiste() {
  const { utilisateur } = useAuth();
  const [rechercherPatient, setRecherchePatient] = useState("");
  const [resultatsPatients, setResultatsPatients] = useState([]);
  const [patientSelectionne, setPatientSelectionne] = useState(null);

  const [dossier, setDossier] = useState(null);
  const [historique, setHistorique] = useState([]);
  // § demande utilisateur : à l'ouverture de '/dentiste', afficher TOUS les
  // dossiers existants en base pour ce cabinet (pas seulement après avoir
  // recherché un patient précis) — vue par défaut de la page.
  const [dossiersGlobaux, setDossiersGlobaux] = useState([]);
  const [chargementGlobal, setChargementGlobal] = useState(true);
  // § demande utilisateur : filtre sur l'historique des dossiers — filtre
  // les lignes qui répondent au critère SANS jamais casser le tri par
  // date de création décroissante déjà appliqué côté serveur (le filtre
  // réduit la liste déjà triée, il ne la retrie jamais lui-même).
  const [filtreHistorique, setFiltreHistorique] = useState("");
  // § filtre sur la vue globale (tous les dossiers du cabinet).
  const [filtreGlobal, setFiltreGlobal] = useState("");
  // § demande utilisateur : marque visuellement le dernier dossier ouvert
  // en revenant à la liste — "toujours mettre en surbrillance la ligne
  // sélectionnée".
  const [dernierDossierOuvert, setDernierDossierOuvert] = useState(null);
  const [indication, setIndication] = useState("");
  const [resultats, setResultats] = useState("");
  const [conclusion, setConclusion] = useState("");
  const [catalogue, setCatalogue] = useState([]);
  const [messageStatut, setMessageStatut] = useState("");
  const [numerotationDentaire, setNumerotationDentaire] = useState("internationale");
  const [schemaDeReprise, setSchemaDeReprise] = useState([]);

  // § demande utilisateur : section Ordonnance.
  const [ordonnance, setOrdonnance] = useState(null);
  const [lignesOrdonnance, setLignesOrdonnance] = useState([LIGNE_ORDONNANCE_VIDE]);
  const [afficherSchemaOrdonnance, setAfficherSchemaOrdonnance] = useState(true);
  const [messageOrdonnance, setMessageOrdonnance] = useState("");
  // § remplace l'ancien marqueur "commence par ⚠️" (texte) dans le message,
  // pour choisir la couleur/icône sans emoji dans la donnée elle-même.
  const [messageOrdonnanceEstAvertissement, setMessageOrdonnanceEstAvertissement] = useState(false);

  useEffect(() => {
    api.get("/produits").then((r) => setCatalogue(r.data));
    api.get("/cabinet").then((r) => setNumerotationDentaire(r.data.numerotation_dentaire || "internationale")).catch(() => {});
    api.get("/dossiers-examen").then((r) => setDossiersGlobaux(r.data)).finally(() => setChargementGlobal(false));
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
    setDernierDossierOuvert(null);
    const h = await api.get(`/patients/${patient.Numéro_Enreg}/dossiers`);
    setHistorique(h.data);
  }

  // § ouverture depuis la vue GLOBALE (tous dossiers du cabinet) : résout
  // d'abord le patient complet, pour rester cohérent avec tout le reste de
  // la page (recherche/sélection manuelle, "+ Nouveau dossier", historique
  // du patient), qui suppose toujours `patientSelectionne` déjà chargé.
  async function ouvrirDossierDepuisVueGlobale(dossierGlobal) {
    if (dossierGlobal.Client != null) {
      const rPatient = await api.get(`/patients/${dossierGlobal.Client}`);
      await choisirPatient(rPatient.data);
    }
    ouvrirDossier(dossierGlobal.Dos_num);
  }

  async function ouvrirDossier(dosNum) {
    setDernierDossierOuvert(dosNum);
    const r = await api.get(`/dossiers-examen/${dosNum}`);
    setDossier(r.data);
    setIndication(r.data.DOS_INDICATION || "");
    setResultats(r.data.DOS_RESULTATS || "");
    setConclusion(r.data.DOS_CONCLUSION || "");
    setModificationNonEnregistree(false);

    // Si ce dossier n'a pas encore son propre schéma dentaire enregistré
    // (ex: dossier tout juste créé), on recharge le dernier enregistrement
    // connu pour ce patient (dernier reçu de Caisse ou dernier dossier
    // documenté), pour que le Dentiste voie directement les dents
    // sélectionnées lors de la dernière visite plutôt qu'un schéma vierge.
    const actesExistants = r.data.ContenuExams?.actes_par_dent || [];
    const dejaDocumente = actesExistants.length > 0;
    if (!dejaDocumente) {
      const dernier = await api.get(`/patients/${patientSelectionne.Numéro_Enreg}/dernier-schema-dentaire`);
      setSchemaDeReprise(dernier.data.actes_par_dent || []);
      setLignesPanierActuel(dernier.data.actes_par_dent || []);
    } else {
      setSchemaDeReprise([]);
      setLignesPanierActuel(actesExistants);
    }

    // § demande utilisateur : section Ordonnance — charge celle déjà
    // enregistrée pour ce dossier, ou prépare un formulaire vide.
    const rOrdonnance = await api.get(`/dossiers-examen/${dosNum}/ordonnance`);
    if (rOrdonnance.data) {
      setOrdonnance(rOrdonnance.data);
      setLignesOrdonnance(rOrdonnance.data.lignes.length ? rOrdonnance.data.lignes : [LIGNE_ORDONNANCE_VIDE]);
      setAfficherSchemaOrdonnance(rOrdonnance.data.afficher_schema_dentaire);
    } else {
      setOrdonnance(null);
      setLignesOrdonnance([LIGNE_ORDONNANCE_VIDE]);
      setAfficherSchemaOrdonnance(true);
    }
  }

  async function creerNouveauDossier() {
    const r = await api.post("/dossiers-examen", null, {
      params: { patient_numero_enreg: patientSelectionne.Numéro_Enreg, nom_specialiste: utilisateur?.nom_complet },
    });
    setHistorique((precedent) => [r.data, ...precedent]);
    setDossiersGlobaux((precedent) => [{ ...r.data, patient_affiche: `${patientSelectionne.Nom} ${patientSelectionne.Prénoms}`.trim() }, ...precedent]);
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

  function modifierLigneOrdonnance(index, champ, valeur) {
    setLignesOrdonnance((lignes) => lignes.map((l, i) => (i === index ? { ...l, [champ]: valeur } : l)));
  }
  function ajouterLigneOrdonnance() {
    setLignesOrdonnance((lignes) => [...lignes, { ...LIGNE_ORDONNANCE_VIDE }]);
  }
  function retirerLigneOrdonnance(index) {
    setLignesOrdonnance((lignes) => lignes.filter((_, i) => i !== index));
  }

  async function enregistrerOrdonnance() {
    const lignesValides = lignesOrdonnance.filter((l) => l.designation.trim());
    if (lignesValides.length === 0) { setMessageOrdonnanceEstAvertissement(true); return setMessageOrdonnance("Ajoutez au moins une désignation."); }
    const r = await api.put(`/dossiers-examen/${dossier.Dos_num}/ordonnance`, {
      lignes: lignesValides,
      afficher_schema_dentaire: afficherSchemaOrdonnance,
    });
    setOrdonnance(r.data);
    setMessageOrdonnanceEstAvertissement(false);
    setMessageOrdonnance("Ordonnance enregistrée.");
    setTimeout(() => setMessageOrdonnance(""), 3000);
  }

  // § demande utilisateur : le schéma n'est plus enregistré automatiquement
  // à chaque changement — seulement quand le Dentiste clique explicitement
  // sur "Modifier intervention". On garde ici le panier courant (visualisé
  // dans le schéma ET listé en texte juste en dessous), avec un indicateur
  // de modification non enregistrée.
  const [lignesPanierActuel, setLignesPanierActuel] = useState([]);
  const [modificationNonEnregistree, setModificationNonEnregistree] = useState(false);
  const [messageIntervention, setMessageIntervention] = useState("");

  function suivrePanier(lignesPanier) {
    setLignesPanierActuel(lignesPanier);
    setModificationNonEnregistree(true);
  }

  async function enregistrerIntervention() {
    if (!dossier) return;
    const actesParDent = {};
    lignesPanierActuel.forEach((l) => {
      if (!l.numero_dent) return;
      actesParDent[l.numero_dent] = actesParDent[l.numero_dent] || [];
      actesParDent[l.numero_dent].push({ numero_dent: l.numero_dent, code_produit: l.code_produit, libelle_acte: l.libelle, statut: "Carie/Obturation" });
    });
    const r = await api.put(`/dossiers-examen/${dossier.Dos_num}/schema-dentaire`, {
      actes_par_dent: Object.values(actesParDent).flat(),
      commentaire_general: null,
    });
    // Recharge le dossier pour récupérer l'historique de modifications à jour.
    const frais = await api.get(`/dossiers-examen/${dossier.Dos_num}`);
    setDossier(frais.data);
    setModificationNonEnregistree(false);
    setMessageIntervention("Intervention enregistrée.");
    setTimeout(() => setMessageIntervention(""), 3000);
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

      {/* § demande utilisateur : à l'ouverture de '/dentiste', tous les
          dossiers existants du cabinet — pas seulement après recherche
          d'un patient précis. Masquée dès qu'un patient est sélectionné
          (place alors à sa propre liste "Dossiers de ce patient"). */}
      {!patientSelectionne && !dossier && (
        <div className="carte" style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Tous les dossiers du cabinet</div>
          {chargementGlobal ? (
            <div style={{ color: "var(--sawali-gris)", fontSize: 14 }}>Chargement...</div>
          ) : dossiersGlobaux.length === 0 ? (
            <div style={{ color: "var(--sawali-gris)", fontSize: 14 }}>Aucun dossier n'existe encore pour ce cabinet.</div>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 10 }}>
                <input
                  className="champ-saisie" style={{ maxWidth: 320, margin: 0 }}
                  placeholder="Filtrer (patient, n° dossier, date, conclusion...)"
                  value={filtreGlobal} onChange={(e) => setFiltreGlobal(e.target.value)}
                />
                {/* § demande utilisateur : total des dossiers AFFICHÉS (donc
                    après filtre éventuel) — calculé plus bas avec dossiersFiltres. */}
              </div>
              {(() => {
                const filtre = filtreGlobal.trim().toLowerCase();
                // § "avant que l'on filtre si l'on veut" : le tri par
                // dernière activité décroissante vient du serveur et n'est
                // JAMAIS recalculé ici — le filtre réduit seulement la
                // liste déjà triée, sans en changer l'ordre.
                const dossiersFiltres = !filtre ? dossiersGlobaux : dossiersGlobaux.filter((d) => {
                  const dateTexte = d.derniere_activite ? new Date(d.derniere_activite).toLocaleDateString("fr-FR") : "";
                  return String(d.Dos_num).includes(filtre) || dateTexte.includes(filtre)
                    || (d.DOS_CONCLUSION || "").toLowerCase().includes(filtre) || (d.patient_affiche || "").toLowerCase().includes(filtre);
                });
                return (
                  <>
                    <div style={{ fontSize: 12.5, color: "var(--sawali-gris-fonce)", marginBottom: 6 }}>
                      {dossiersFiltres.length} dossier{dossiersFiltres.length > 1 ? "s" : ""} affiché{dossiersFiltres.length > 1 ? "s" : ""}
                      {filtre && ` (sur ${dossiersGlobaux.length} au total)`}
                    </div>
                    {dossiersFiltres.length === 0 ? (
                      <div style={{ color: "var(--sawali-gris)", fontSize: 13.5 }}>Aucun dossier ne correspond à ce filtre.</div>
                    ) : (
                      <table className="tableau-donnees">
                        {/* § demande utilisateur : colonne "Dernière activité"
                            (date ET heure, création OU modification — la plus
                            récente des deux), triée décroissante côté serveur. */}
                        <thead><tr><th>N° dossier</th><th>Patient</th><th>Dernière activité</th><th>Conclusion</th><th></th></tr></thead>
                        <tbody>
                          {dossiersFiltres.map((d) => (
                            <tr key={d.Dos_num} className={d.Dos_num === dernierDossierOuvert ? "ligne-selectionnee" : undefined}>
                              <td>{d.Dos_num}</td>
                              <td>{d.patient_affiche}</td>
                              <td>{d.derniere_activite ? new Date(d.derniere_activite).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "-"}</td>
                              <td>{d.DOS_CONCLUSION || "-"}</td>
                              <td><button className="bouton-secondaire" style={{ fontSize: 12, padding: "4px 10px" }} onClick={() => ouvrirDossierDepuisVueGlobale(d)}>Ouvrir</button></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </>
                );
              })()}
            </>
          )}
        </div>
      )}

      {patientSelectionne && !dossier && (
        <div className="carte" style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 10 }}>
            <div style={{ fontWeight: 700 }}>Dossiers de ce patient</div>
            <button className="bouton-primaire" onClick={creerNouveauDossier}>+ Nouveau dossier</button>
          </div>
          {historique.length === 0 ? (
            <div style={{ color: "var(--sawali-gris)", fontSize: 14 }}>Aucun dossier existant — créez-en un pour commencer l'examen.</div>
          ) : (
            <>
              <input
                className="champ-saisie" style={{ marginBottom: 10, maxWidth: 320 }}
                placeholder="Filtrer (n° dossier, date, conclusion...)"
                value={filtreHistorique} onChange={(e) => setFiltreHistorique(e.target.value)}
              />
              {(() => {
                const filtre = filtreHistorique.trim().toLowerCase();
                // § "le filtre affichera les résultats parmi les lignes qui
                // répondent aux critères" : simple filtrage sur la liste déjà
                // triée par le serveur (dernière activité décroissante) — ne
                // la retrie jamais, ne fait que la réduire.
                const historiqueFiltre = !filtre ? historique : historique.filter((d) => {
                  const dateTexte = d.derniere_activite ? new Date(d.derniere_activite).toLocaleDateString("fr-FR") : "";
                  return String(d.Dos_num).includes(filtre) || dateTexte.includes(filtre) || (d.DOS_CONCLUSION || "").toLowerCase().includes(filtre);
                });
                return (
                  <>
                    <div style={{ fontSize: 12.5, color: "var(--sawali-gris-fonce)", marginBottom: 6 }}>
                      {historiqueFiltre.length} dossier{historiqueFiltre.length > 1 ? "s" : ""} affiché{historiqueFiltre.length > 1 ? "s" : ""}
                      {filtre && ` (sur ${historique.length} au total)`}
                    </div>
                    {historiqueFiltre.length === 0 ? (
                      <div style={{ color: "var(--sawali-gris)", fontSize: 13.5 }}>Aucun dossier ne correspond à ce filtre.</div>
                    ) : (
                      <table className="tableau-donnees">
                        <thead><tr><th>N° dossier</th><th>Dernière activité</th><th>Conclusion</th><th></th></tr></thead>
                        <tbody>
                          {historiqueFiltre.map((d) => (
                            <tr key={d.Dos_num} className={d.Dos_num === dernierDossierOuvert ? "ligne-selectionnee" : undefined}>
                              <td>{d.Dos_num}</td>
                              <td>{d.derniere_activite ? new Date(d.derniere_activite).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "-"}</td>
                              <td>{d.DOS_CONCLUSION || "-"}</td>
                              <td><button className="bouton-secondaire" style={{ fontSize: 12, padding: "4px 10px" }} onClick={() => ouvrirDossier(d.Dos_num)}>Ouvrir</button></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </>
                );
              })()}
            </>
          )}
        </div>
      )}

      {dossier && (
        <>
          <div style={{ marginBottom: 12 }}>
            <button className="bouton-secondaire" style={{ fontSize: 13, display: "inline-flex", alignItems: "center", gap: 5 }} onClick={() => setDossier(null)}><ArrowLeft size={13} /> Retour aux dossiers du patient</button>
          </div>

          <SchemaDentaire
            key={dossier.Dos_num}
            numerotation={numerotationDentaire}
            actesDisponibles={catalogue.map((a) => ({ code_produit: a["Code Produit"], libelle: a["Libellé"], domaine: a["Domaine"], prix_public: a["Prix Public"] }))}
            statutsInitiaux={
              (dossier.ContenuExams?.actes_par_dent?.length ? dossier.ContenuExams.actes_par_dent : schemaDeReprise)
                .reduce((acc, a) => ({ ...acc, [a.numero_dent]: a.statut }), {})
            }
            onChangerPanier={suivrePanier}
          />

          {/* § demande utilisateur : liste des actes en texte (pas seulement
              visuel sur le schéma) + bouton explicite "Modifier intervention"
              qui enregistre et journalise l'auteur dans l'historique du dossier. */}
          <div className="carte" style={{ marginTop: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 10, display: "flex", alignItems: "center", gap: 7 }}><Smile size={17} color="var(--sawali-bleu)" /> Liste des actes de cette intervention</div>
            {lignesPanierActuel.length === 0 ? (
              <div style={{ color: "var(--sawali-gris)", fontSize: 13.5 }}>Aucun acte sélectionné sur le schéma pour l'instant.</div>
            ) : (
              <table className="tableau-donnees">
                <thead><tr><th>Dent</th><th>Acte</th></tr></thead>
                <tbody>
                  {lignesPanierActuel.map((a, i) => (
                    <tr key={i}>
                      <td style={{ fontFamily: "monospace" }}>{a.numero_dent}</td>
                      <td>{a.libelle_acte || a.libelle}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14, flexWrap: "wrap" }}>
              <button
                className="bouton-primaire"
                onClick={enregistrerIntervention}
                disabled
                title="Modification désactivée : pour éviter toute incohérence entre ce que la Caisse a facturé et le dossier du Dentiste, ce bouton reste inactif."
                style={{ opacity: 0.5, cursor: "not-allowed", display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                <Pencil size={14} /> Modifier intervention
              </button>
              <span style={{ color: "var(--sawali-gris)", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4 }}><Lock size={12} /> Verrouillé — cohérence avec la facturation de la Caisse</span>
              {messageIntervention && <span style={{ color: "var(--sawali-vert)", fontSize: 13, display: "inline-flex", alignItems: "center", gap: 5 }}><CheckCircle2 size={14} /> {messageIntervention}</span>}
            </div>

            {dossier.historique_modifications?.length > 0 && (
              <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid #eef2fa" }}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}><History size={14} /> Historique des modifications</div>
                {dossier.historique_modifications.slice().reverse().map((h, i) => (
                  <div key={i} style={{ fontSize: 12.5, color: "var(--sawali-gris-fonce)", padding: "3px 0" }}>
                    <strong>{h.nom_complet}</strong> — {new Date(h.date).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </div>
                ))}
              </div>
            )}
          </div>

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
              <button className="bouton-secondaire" onClick={() => imprimerPdf(`/dossiers-examen/${dossier.Dos_num}/rapport/pdf`)} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Printer size={14} /> Imprimer</button>
              <button className="bouton-secondaire" onClick={envoyerWhatsapp}>Envoyer par WhatsApp</button>
              {messageStatut && <span style={{ color: "var(--sawali-vert)", fontSize: 13 }}>{messageStatut}</span>}
            </div>
          </div>

          {/* § demande utilisateur : section Ordonnance — le patient l'utilise
              pour acheter les produits recommandés par son médecin traitant. */}
          <div className="carte" style={{ marginTop: 20 }}>
            <div style={{ fontWeight: 700, marginBottom: 4, display: "flex", alignItems: "center", gap: 7 }}><Pill size={16} color="var(--sawali-bleu)" /> Ordonnance{ordonnance ? ` — ${ordonnance.reference}` : ""}</div>
            <div style={{ fontSize: 12, color: "var(--sawali-gris-fonce)", marginBottom: 12 }}>Le patient l'utilisera pour acheter les produits recommandés.</div>

            {lignesOrdonnance.length > 0 && (
              <div style={{ display: "flex", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                <label className="libelle-obligatoire" style={{ fontSize: 11.5, fontWeight: 600, flex: "2 1 180px" }}>* Désignation</label>
                <label style={{ fontSize: 11.5, fontWeight: 600, flex: "2 1 180px" }}>Posologie / instructions</label>
                <label style={{ fontSize: 11.5, fontWeight: 600, flex: "1 1 100px" }}>Durée</label>
                <label style={{ fontSize: 11.5, fontWeight: 600, flex: "0 1 70px" }}>Qté</label>
                <span style={{ width: 20 }} />
              </div>
            )}
            {lignesOrdonnance.map((ligne, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center", flexWrap: "wrap" }}>
                <input className="champ-saisie" style={{ flex: "2 1 180px" }} placeholder="Désignation" value={ligne.designation} onChange={(e) => modifierLigneOrdonnance(i, "designation", e.target.value)} />
                <input className="champ-saisie" style={{ flex: "2 1 180px" }} placeholder="Posologie / instructions" value={ligne.posologie} onChange={(e) => modifierLigneOrdonnance(i, "posologie", e.target.value)} />
                <input className="champ-saisie" style={{ flex: "1 1 100px" }} placeholder="Durée" value={ligne.duree} onChange={(e) => modifierLigneOrdonnance(i, "duree", e.target.value)} />
                <input className="champ-saisie" style={{ flex: "0 1 70px" }} placeholder="Qté" value={ligne.quantite} onChange={(e) => modifierLigneOrdonnance(i, "quantite", e.target.value)} />
                <button onClick={() => retirerLigneOrdonnance(i)} title="Retirer cette ligne" style={{ border: "none", background: "none", color: "var(--sawali-rouge)", cursor: "pointer", display: "flex", padding: 2 }}><Trash2 size={16} /></button>
              </div>
            ))}
            <button className="bouton-secondaire" style={{ fontSize: 12.5, marginBottom: 14 }} onClick={ajouterLigneOrdonnance}>+ Ajouter une ligne</button>

            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 14, cursor: "pointer" }}>
              <input type="checkbox" checked={afficherSchemaOrdonnance} onChange={(e) => setAfficherSchemaOrdonnance(e.target.checked)} />
              Reproduire le schéma dentaire (dents traitées) en bas de l'ordonnance
            </label>

            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <button className="bouton-primaire" onClick={enregistrerOrdonnance} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Save size={14} /> Enregistrer l'ordonnance</button>
              {ordonnance && (
                <>
                  <button className="bouton-secondaire" onClick={() => ouvrirFichier(`/dossiers-examen/${dossier.Dos_num}/ordonnance/pdf`)} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><FileText size={14} /> Voir le PDF</button>
                  <button className="bouton-secondaire" onClick={() => imprimerPdf(`/dossiers-examen/${dossier.Dos_num}/ordonnance/pdf`)} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Printer size={14} /> Imprimer</button>
                </>
              )}
              {messageOrdonnance && (
                <span style={{ color: messageOrdonnanceEstAvertissement ? "var(--sawali-orange)" : "var(--sawali-vert)", fontSize: 13, display: "inline-flex", alignItems: "center", gap: 5 }}>
                  {messageOrdonnanceEstAvertissement ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />} {messageOrdonnance}
                </span>
              )}
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
