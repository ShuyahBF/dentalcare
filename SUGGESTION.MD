# SUGGESTION.MD — Historique des évolutions et corrections

Ce fichier trace, par ordre chronologique, toutes les discussions
d'évolutions, corrections et décisions prises sur la plateforme
**SAWALI DentalCare**. Il est tenu à jour par Claude à chaque session de
travail et sert de source pour le module `/admin/suggestions-history` de
l'application (onglet **Administration → Suggestions**).

Format de chaque entrée :

```
## AAAA-MM-JJ — Titre court
Statut: Implémentée | En cours | Proposée | Rejetée
- détail 1
- détail 2
```

---

## 2026-09-14 — Cahier des charges initial et construction complète (backend + frontend)
Statut: Implémentée
- Définition des 5 rôles (Caissier, Secrétariat Cabinet, Dentiste, Comptable, Administrateur) avec contrôle d'accès serveur.
- Reprise à l'identique des tables legacy Biolog/Windev (Patient, Dossier_Examen, ProduitClinique, VenteClinique, A_Acheté, MédecinT, UtilisateurBlg, Pièces_Scannées_Utilisateurs) pour simplifier la maintenance croisée.
- Nouvelles tables ajoutées : Cabinet, Assurance, AssurancePatient, PriseEnCharge, RendezVous, Rappel.
- Catalogue de 56 actes dentaires fournis, complété à 67 actes avec des pratiques internationales courantes (scellement de sillons, fluoration, blanchiment, panoramique, implants, facettes...).
- Reçu de caisse reproduit fidèlement le modèle "Clinique PHILADELPHIE" fourni (en-tête, QR code, montant en lettres, tableau par domaine, validité).
- État de caisse (rapport caissier) reproduit fidèlement le modèle fourni.
- Schéma dentaire interactif (SVG, 32 dents, notation FDI), code couleur par statut, panier en temps réel, persistance dans `Dossier_Examen.ContenuExams`.
- Système d'assurances (cycle demande → accord → facturation → paiement) avec calcul automatique de répartition assureur/patient et suivi du plafond annuel.
- Système de rappels patients (contrôle 6 mois, relance devis, suivi post-opératoire) via liens WhatsApp.
- Règle définitive : tout le code est écrit et vérifié dans le sandbox Claude ; Emergent ne sert qu'au déploiement final, jamais à la codification.

## 2026-09-15 — Reconstruction complète après perte du sandbox entre sessions
Statut: Implémentée
- Constat : le code généré dans le sandbox ne persiste pas d'une conversation à l'autre (seuls les fichiers du Projet Claude.ai et la mémoire texte persistent).
- Décision : utiliser le dépôt GitHub `ShuyahBF/dentalcare` comme source de vérité persistante, avec des commits réguliers au fil des sessions plutôt que de tout reconstruire à chaque fois.
- Backend reconstruit et re-vérifié (48 routes), montant-en-lettres re-testé et corrigé pour matcher exactement le format du modèle fourni ("VINGT QUATRE MILLE FCFA", sans trait d'union).
- Date de validité du reçu corrigée (calcul réel +durée de validité, format jj/mm/aaaa, au lieu du format ISO affiché par erreur).
- Frontend reconstruit intégralement (page de connexion animée, sidebar, schéma dentaire interactif, 5 interfaces par rôle) et vérifié par build de production sans erreur.
- Premier push réussi vers `https://github.com/ShuyahBF/dentalcare` (branche `main`), via token GitHub fourni par l'utilisateur pour cette session (non conservé au-delà).

## 2026-09-15 — Création du module `/admin/suggestions-history`
Statut: Implémentée
- Ce fichier `SUGGESTION.MD` devient la source de vérité, versionnée avec le code, pour l'historique des décisions produit.
- Ajout d'une collection MongoDB `SuggestionHistorique` synchronisée depuis ce fichier (route `POST /api/admin/suggestions-history/resynchroniser`), consultable dans l'onglet Administration → Suggestions de l'application.
- Le format ci-dessus (titre daté + statut + liste à puces) est celui attendu par le parseur backend (`app/utils/suggestions_md.py`).

## 2026-09-15 — Enrichissements frontend demandés
Statut: Implémentée
- Gestion de l'assurance directement depuis l'interface Caisse : sélection du lien patient-assurance et création automatique d'une demande de prise en charge lors de l'encaissement en mode "Assurance".
- Nouvel onglet "Prises en charge" côté Comptable : liste des demandes, changement de statut (Demandée → Accordée → Facturée → Payée).
- Onglet Suggestions de l'Administration connecté aux vraies données (au lieu du texte d'attente initial).

## 2026-09-15 — Hébergement temporaire sur Render
Statut: Implémentée
- Création de `render.yaml` (Blueprint Render) à la racine du dépôt, définissant 2 services séparés : `sawali-dentalcare-backend` (API FastAPI, Python) et `sawali-dentalcare-frontend` (site statique, build Vite).
- Le frontend récupère automatiquement l'URL du backend au build via une référence `fromService` (pas d'URL en dur), avec repli sur `/api` (proxy Vite) en développement local.
- `MONGODB_URI` volontairement marquée `sync: false` : jamais stockée dans le dépôt, à renseigner manuellement dans le tableau de bord Render. `JWT_SECRET_KEY` généré automatiquement par Render.
- Rappel : cet hébergement Render est temporaire, le déploiement final prévu reste Emergent.

## 2026-09-15 — Correction : contenu étranger détecté et retiré du dépôt
Statut: Implémentée
- Incident : entre deux sessions, 3 commits contenant un `render.yaml` totalement différent (projet "meetafrican-backend", intégration PawaPay Mobile Money, stockage Cloudflare R2) ont été ajoutés au dépôt `ShuyahBF/dentalcare`, sans lien avec SAWALI DentalCare.
- Utilisateur confirmé : le dépôt n'est pas censé être partagé avec un autre projet ; contenu incorrect à écraser.
- Fusion effectuée en conservant explicitement notre `render.yaml` (SAWALI DentalCare) ; vérifié via clone frais qu'aucun autre fichier étranger n'a été introduit (seul `render.yaml` était concerné, les 68 autres fichiers du dépôt correspondent bien au projet).
- Point de vigilance à garder : vérifier l'historique distant (`git fetch` + `git log origin/main`) avant tout push, au cas où le dépôt serait de nouveau touché de l'extérieur.
