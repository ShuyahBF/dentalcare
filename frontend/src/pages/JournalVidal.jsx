// pages/JournalVidal.jsx
// -----------------------------
// § demande utilisateur : "Comptabiliser toutes requêtes à Vidal. Tracer et
// résumer dans une page pour super-admin (date/heure requête, réponse,
// utilisateur, durée)." — alimentée par app/utils/vidal_client.py
// (appeler_vidal, point de passage unique de tous les appels VIDAL réels),
// voir app/routers/vidal_journal.py. Réservée au super-admin.

import { useEffect, useState } from "react";
import { History, RefreshCw, AlertTriangle, CheckCircle2, XCircle, Timer, Users, BarChart3, Filter } from "lucide-react";
import api from "../utils/api";

const STYLE_STATUT = {
  ok: { Icone: CheckCircle2, couleur: "var(--sawali-vert)", libelle: "OK" },
  erreur: { Icone: XCircle, couleur: "var(--sawali-rouge)", libelle: "Erreur" },
  exception: { Icone: AlertTriangle, couleur: "var(--sawali-orange)", libelle: "Injoignable" },
};

function CarteStat({ Icone, libelle, valeur, indice, couleur }) {
  return (
    <div className="carte" style={{ display: "flex", alignItems: "center", gap: 12, padding: 16 }}>
      <div style={{ width: 40, height: 40, borderRadius: 10, background: "var(--sawali-gris-clair)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icone size={19} color={couleur || "var(--sawali-bleu)"} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 10.5, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--sawali-gris)" }}>{libelle}</div>
        <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.15 }}>{valeur}</div>
        {indice && <div style={{ fontSize: 11, color: "var(--sawali-gris-fonce)" }}>{indice}</div>}
      </div>
    </div>
  );
}

export default function JournalVidal() {
  const [entrees, setEntrees] = useState(null);
  const [resume, setResume] = useState(null);
  const [depuis, setDepuis] = useState("");
  const [jusqua, setJusqua] = useState("");
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState("");

  async function charger() {
    setChargement(true);
    setErreur("");
    try {
      const params = {};
      if (depuis) params.depuis = new Date(depuis).toISOString();
      if (jusqua) params.jusqua = new Date(jusqua).toISOString();
      const [rListe, rResume] = await Promise.all([
        api.get("/vidal/admin/vidal-journal", { params }),
        api.get("/vidal/admin/vidal-journal/resume", { params }),
      ]);
      setEntrees(rListe.data.entrees);
      setResume(rResume.data);
    } catch (err) {
      setErreur(err.response?.data?.detail || "Chargement du journal VIDAL impossible.");
    }
    setChargement(false);
  }

  useEffect(() => { charger(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const totalErreurs = resume ? (resume.par_statut.erreur || 0) + (resume.par_statut.exception || 0) : 0;
  const tauxErreur = resume && resume.total_appels > 0 ? Math.round((totalErreurs / resume.total_appels) * 100) : 0;

  return (
    <div>
      <div className="titre-page" style={{ display: "flex", alignItems: "center", gap: 8 }}><History size={22} /> Journal des appels VIDAL</div>
      <div className="sous-titre-page">Chaque requête réelle vers l'API VIDAL (recherche, fiche produit, posologie, sécurisation) — date/heure, réponse, utilisateur, durée.</div>

      <div className="carte" style={{ marginBottom: 16, display: "flex", alignItems: "flex-end", gap: 10, flexWrap: "wrap" }}>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Depuis</label>
          <input type="datetime-local" className="champ-saisie" style={{ width: 200 }} value={depuis} onChange={(e) => setDepuis(e.target.value)} />
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Jusqu'à</label>
          <input type="datetime-local" className="champ-saisie" style={{ width: 200 }} value={jusqua} onChange={(e) => setJusqua(e.target.value)} />
        </div>
        <button className="bouton-primaire" onClick={charger} disabled={chargement} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          {chargement ? <RefreshCw size={13} className="lucide-tourne" /> : <Filter size={13} />} {chargement ? "Chargement…" : "Filtrer"}
        </button>
      </div>

      {erreur && <div className="carte" style={{ color: "var(--sawali-rouge)", marginBottom: 16 }}>{erreur}</div>}

      {resume && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 16 }}>
            <CarteStat Icone={History} libelle="Appels sur la période" valeur={resume.total_appels.toLocaleString("fr-FR")} />
            <CarteStat Icone={Timer} libelle="Durée moyenne" valeur={resume.duree_moyenne_ms != null ? `${resume.duree_moyenne_ms} ms` : "—"} />
            <CarteStat
              Icone={tauxErreur > 0 ? AlertTriangle : CheckCircle2}
              libelle="Taux d'erreur"
              valeur={`${tauxErreur} %`}
              indice={`${totalErreurs} sur ${resume.total_appels}`}
              couleur={tauxErreur > 10 ? "var(--sawali-rouge)" : tauxErreur > 0 ? "var(--sawali-orange)" : "var(--sawali-vert)"}
            />
            <CarteStat Icone={Users} libelle="Utilisateurs actifs" valeur={resume.par_utilisateur.length} indice={resume.par_utilisateur[0] ? `1er : ${resume.par_utilisateur[0].login} (${resume.par_utilisateur[0].total})` : undefined} />
          </div>

          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
            <div className="carte" style={{ flex: "1 1 320px" }}>
              <div style={{ fontWeight: 700, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}><Users size={15} /> Par utilisateur</div>
              {resume.par_utilisateur.length === 0 ? (
                <div style={{ color: "var(--sawali-gris)", fontSize: 13 }}>Aucun appel sur cette période.</div>
              ) : (
                <table className="tableau-donnees">
                  <thead><tr><th>Utilisateur</th><th>Appels</th><th>Durée moy.</th></tr></thead>
                  <tbody>
                    {resume.par_utilisateur.map((u) => (
                      <tr key={u.login}>
                        <td>{u.login}</td>
                        <td className="chiffre">{u.total}</td>
                        <td className="chiffre">{u.duree_moyenne_ms != null ? `${u.duree_moyenne_ms} ms` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="carte" style={{ flex: "1 1 240px" }}>
              <div style={{ fontWeight: 700, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}><BarChart3 size={15} /> Répartition</div>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--sawali-gris-fonce)", marginBottom: 4 }}>Par statut</div>
              {Object.entries(resume.par_statut).map(([statut, total]) => {
                const style = STYLE_STATUT[statut] || { Icone: History, couleur: "var(--sawali-gris)", libelle: statut };
                return (
                  <div key={statut} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 5, color: style.couleur }}><style.Icone size={13} /> {style.libelle}</span>
                    <span className="chiffre">{total}</span>
                  </div>
                );
              })}
              <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--sawali-gris-fonce)", marginTop: 10, marginBottom: 4 }}>Par mode VIDAL</div>
              {Object.entries(resume.par_mode).map(([mode, total]) => (
                <div key={mode} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                  <span className={`badge ${mode === "production" ? "badge-rouge" : "badge-orange"}`}>{mode === "production" ? "Production" : "Test"}</span>
                  <span className="chiffre">{total}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="carte">
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Détail des appels ({entrees?.length ?? 0})</div>
        <div style={{ overflowX: "auto" }}>
          <table className="tableau-donnees">
            <thead>
              <tr>
                <th>Date/heure</th>
                <th>Méthode</th>
                <th>Endpoint</th>
                <th>Réponse</th>
                <th>Durée</th>
                <th>Utilisateur</th>
                <th>Cabinet</th>
              </tr>
            </thead>
            <tbody>
              {entrees === null && <tr><td colSpan={7} style={{ color: "var(--sawali-gris)" }}>Chargement...</td></tr>}
              {entrees?.length === 0 && <tr><td colSpan={7} style={{ color: "var(--sawali-gris)", fontStyle: "italic" }}>Aucun appel journalisé sur cette période.</td></tr>}
              {entrees?.map((e, i) => {
                const style = STYLE_STATUT[e.statut] || { Icone: History, couleur: "var(--sawali-gris)", libelle: e.statut };
                return (
                  <tr key={i} title={e.erreur || undefined}>
                    <td style={{ whiteSpace: "nowrap" }}>{new Date(e.date_heure).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" })}</td>
                    <td style={{ fontFamily: "monospace", fontSize: 12 }}>{e.methode}</td>
                    <td style={{ fontFamily: "monospace", fontSize: 12 }}>{e.chemin}</td>
                    <td>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: style.couleur, fontWeight: 600 }}>
                        <style.Icone size={13} /> {style.libelle}
                      </span>
                    </td>
                    <td className="chiffre">{e.duree_ms} ms</td>
                    <td>{e.login || "—"}</td>
                    <td>{e.cabinet_nom || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
