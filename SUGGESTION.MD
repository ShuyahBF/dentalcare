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

## 2026-09-15 — Base de données de démo initialisée directement sur Atlas
Statut: Implémentée
- Exécution manuelle du contenu du script de seed contre le cluster Atlas réel de l'utilisateur (via le connecteur MongoDB Atlas), la base `sawali_dentalcare` n'existant pas encore : 67 actes du catalogue, fiche Cabinet par défaut, 5 comptes de démonstration (mots de passe hachés bcrypt calculés localement, jamais transmis en clair), 6 entrées SUGGESTION.MD.
- Création d'un utilisateur de base de données dédié `sawali-render` (droits `readWrite` limités à `sawali_dentalcare` uniquement, mot de passe généré) pour l'hébergement Render, plutôt que de réutiliser un identifiant existant à portée plus large.
- Accès réseau du cluster ouvert à `0.0.0.0/0` (nécessaire pour les IP dynamiques de Render).

## 2026-09-15 — Correction CORS après échec de connexion en production
Statut: Implémentée
- Symptôme : le frontend déployé sur Render affichait un message d'erreur générique à la connexion, signe que la réponse du backend n'avait pas la forme JSON attendue (probable blocage CORS plutôt qu'un simple 401).
- Cause probable : `allow_origins=["*"]` combiné à `allow_credentials=True` dans la configuration CORS du backend — une combinaison que les navigateurs peuvent bloquer silencieusement selon la spec CORS.
- Correction : liste explicite de domaines autorisés (`CORS_ORIGINS`, nouvelle variable d'environnement), avec une valeur par défaut cohérente incluant `https://sawali-dentalcare-frontend.onrender.com` et `http://localhost:3000` pour le développement local.
- `render.yaml` mis à jour avec cette variable pour le service backend.

## 2026-09-15 — Correction bug de démarrage : mauvais typage de CORS_ORIGINS
Statut: Implémentée
- Régression introduite par la correction CORS précédente : le champ `cors_origins` était typé `list[str]` dans `Settings` (pydantic-settings), qui tente alors de décoder la variable d'environnement comme du JSON. Une valeur simple type "https://...onrender.com" n'est pas du JSON valide → l'application plantait au démarrage.
- Confirmé en observant les déploiements Render : le déploi contenant la correction CORS passait en statut "Failed" juste après avoir renseigné la variable `CORS_ORIGINS`.
- Correction : champ renommé `cors_origins_csv` et typé `str` (pas de parsing JSON automatique), avec une propriété Python `cors_origins` qui fait le découpage par virgule à la volée. Reproduit exactement le scénario Render en local avant correction pour confirmer le correctif.

## 2026-09-15 — Correction : VITE_API_BASE_URL mal résolue (fromService défaillant)
Statut: Implémentée
- Symptôme observé dans la console navigateur : `net::ERR_NAME_NOT_RESOLVED` sur `https://sawali-dentalcare-backend/api/auth/connexion` — il manquait `.onrender.com`, le navigateur tentait de résoudre un nom de domaine inexistant.
- Cause : la référence `fromService: property: host` dans `render.yaml` (censée injecter le nom d'hôte public du service backend au build du frontend) ne renvoyait pas la valeur attendue.
- Correction : URL complète fixée explicitement (`https://sawali-dentalcare-backend.onrender.com`) dans `render.yaml`, et `api.js` simplifié pour utiliser cette URL telle quelle (plus de préfixe `https://` ajouté en dur côté code, la variable la contient déjà).
- Build reproduit en local avec exactement la même variable d'environnement que Render pour confirmer que l'URL correcte est bien injectée dans le bundle avant de pousser.
- **Confirmé par l'utilisateur : connexion fonctionnelle en production** (`https://sawali-dentalcare-frontend.onrender.com`), catalogue et sidebar chargés correctement après ce correctif.

## 2026-09-15 — Correction robustesse : réveil à froid du backend gratuit Render
Statut: Implémentée
- Symptôme : après connexion, certains onglets (Cabinet, Catalogue dans Administration) restaient vides alors que les données existent bien en base — seul l'onglet consulté quelques secondes plus tard (Utilisateurs) affichait des données.
- Cause : le plan gratuit Render met le service backend en veille après inactivité et peut prendre 50s+ à redémarrer ; les toutes premières requêtes de la page échouaient silencieusement pendant ce réveil, sans réessai automatique côté frontend.
- Correction systémique dans `utils/api.js` (client HTTP central, donc effective sur tout l'écran, pas seulement Administration) : réessai automatique jusqu'à 4 fois avec délai croissant (4s, 8s, 12s, 16s) sur toute erreur réseau ou de passerelle (502/503/504).
- Ajout d'états de chargement/erreur explicites avec bouton « Réessayer » sur les onglets Cabinet et Catalogue, pour ne plus jamais laisser un écran silencieusement vide en cas d'échec malgré les réessais.

## 2026-09-15 — Panneau de diagnostic base de données (module Administration)
Statut: Implémentée
- Demande utilisateur : malgré la confirmation que les données existent en base (vérifié manuellement dans MongoDB Atlas), rien ne s'affichait dans l'application. Besoin de voir directement la requête exécutée et son résultat plutôt que de deviner à distance.
- Nouvelle route backend `GET /api/admin/diagnostic` (Administrateur uniquement) : exécute en direct un `count_documents` + `find_one` sur ProduitClinique, Cabinet, UtilisateurBlg et SuggestionHistorique, et retourne pour chacune la requête Mongo utilisée, le nombre de documents trouvés et un échantillon (sans jamais exposer de hash de mot de passe).
- Nouveau panneau dépliable en haut du module Administration (au-dessus des onglets) affichant ces résultats de façon lisible, avec un bouton "Relancer".
- Objectif : distinguer précisément un problème de connexion backend↔MongoDB (visible dans ce panneau) d'un problème de cache/déploiement frontend (le panneau utilisant le même client HTTP que le reste de l'app, un échec de la requête de diagnostic elle-même pointerait plutôt vers un souci réseau/CORS).

## 2026-09-15 — Sidebar repliable sur mobile
Statut: Implémentée
- Remarque utilisateur : la sidebar fixe (220px) rend l'écran difficile à lire sur téléphone.
- Sidebar transformée en tiroir coulissant sous 768px de large (media query CSS) : repliée par défaut, ouverte via un bouton "☰" flottant en haut à gauche, avec fond assombri cliquable pour refermer et fermeture automatique après un clic sur un lien de navigation.
- Comportement desktop inchangé (sidebar fixe toujours visible, aucune media query appliquée au-delà de 768px).

## 2026-09-15 — Correction majeure : ObjectId non sérialisable (onglets vides malgré données en base)
Statut: Implémentée
- Cause racine trouvée du problème "Cabinet/Catalogue vides malgré des données confirmées en base" : chaque document MongoDB brut contient un champ interne `_id` de type `bson.ObjectId`, que FastAPI ne sait pas sérialiser en JSON nativement. Toute route retournant une liste ou un document Mongo sans l'avoir nettoyé à la main provoquait une erreur 500 avec un corps de réponse en texte brut (pas de JSON `detail`) — d'où le message de secours générique côté frontend, après plusieurs tentatives de réessai automatique inutiles (l'erreur n'étant pas réseau/passerelle mais bien une 500 applicative).
- Ce bug touchait la quasi-totalité des routeurs (patients, produits, cabinet, caisse, dossiers_examen, medecins, assurances, rendez_vous, rappels, suggestions, utilisateurs) — pas seulement Catalogue.
- Diagnostic mené avec des tests reproductibles : confirmation expérimentale du crash (`jsonable_encoder` puis `TestClient` avec `raise_server_exceptions=False`), avant de valider la correction.
- Correction : une seule ligne dans `app/main.py`, `ENCODERS_BY_TYPE[ObjectId] = str`, qui enregistre `ObjectId` dans la table globale d'encodeurs JSON de FastAPI — corrige toutes les routes existantes ET futures d'un coup, sans avoir à nettoyer chaque routeur individuellement.
- Validé par un test d'intégration bout-en-bout sur la vraie route `/api/produits` de l'application (avec base simulée renvoyant un document contenant un vrai `ObjectId`) avant de pousser : statut 200 confirmé.

## 2026-09-15 — Diagnostic ciblé au module affiché
Statut: Implémentée
- Remarque utilisateur : le panneau de diagnostic ne doit apparaître qu'en tant qu'Administrateur (déjà le cas structurellement, la page /admin entière étant protégée par rôle) et doit se limiter à la requête du module actuellement affiché plutôt que de systématiquement tout tester.
- Route `GET /api/admin/diagnostic` acceptant désormais un paramètre `module` (Cabinet, Utilisateurs, Catalogue, Suggestions) qui restreint la ou les collections interrogées à celle(s) pertinente(s) pour cet onglet.
- Le panneau frontend relance automatiquement le diagnostic à chaque changement d'onglet (s'il est ouvert), et affiche désormais "module « X »" dans son titre pour lever toute ambiguïté sur ce qui est testé.

## 2026-09-15 — Création de patient depuis la Caisse + table Actions Administration
Statut: Implémentée
- Le Caissier peut désormais créer un nouveau patient directement depuis l'interface Caisse (bouton "+ Nouveau patient" à côté de la recherche), sans devoir passer par un autre module. Le patient créé est automatiquement sélectionné pour la vente en cours.
- Onglet Utilisateurs de l'Administration : ajout d'une colonne "Actions" avec Modifier (édition en ligne du nom complet et du rôle), Activer/Désactiver, et Supprimer (suppression définitive, avec confirmation).
- Nouvelles routes backend `PUT /api/utilisateurs/{login}` (modification) et `DELETE /api/utilisateurs/{login}` (suppression), toutes deux réservées à l'Administrateur.
- Garde-fous sur la suppression : impossible de supprimer son propre compte, impossible de supprimer le dernier compte Administrateur restant (pour ne jamais perdre l'accès admin).

## 2026-09-15 — Complétion des modules Secrétariat, Dentiste et Administration
Statut: Implémentée
- Constat en auditant chaque module pour un test de bout en bout : la collection MédecinT (registre des dentistes) était vide, ce qui rendait le module Secrétariat totalement inutilisable (aucun dentiste à sélectionner pour un rendez-vous).
- Nouvel onglet **Médecins** dans Administration : création et liste des dentistes (Nom, Prénoms, Titre, Téléphone, Domaine).
- **Secrétariat** : remplacement de la saisie d'un numéro patient brut par une vraie recherche/sélection de patient (même composant que la Caisse) ; les rendez-vous du jour affichent désormais le nom du patient (résolu via cache local) au lieu de son seul numéro.
- **Dentiste** : refonte complète du point d'entrée — recherche de patient, liste de ses dossiers existants avec bouton "Ouvrir", et bouton "+ Nouveau dossier" pour en créer un à la volée (auparavant il fallait connaître à l'avance le numéro exact d'un dossier, ce qui rendait le module inutilisable en pratique sans accès direct à la base).
- **Cabinet** (Administration) : ajout de la sélection du dentiste principal et de l'équipe (cases à cocher), champs déjà prévus dans le modèle mais jusque-là jamais éditables depuis l'interface.
- Un dentiste de démonstration (« Dr DÉMO Dentiste ») inséré directement en base pour que le module Rendez-vous soit testable immédiatement, sans attendre une première création manuelle.

## 2026-09-15 — Module Assurances complété (création + rattachement patient)
Statut: Implémentée
- Les routes backend de gestion des assurances existaient déjà, mais aucune interface ne permettait de créer une compagnie d'assurance ni de rattacher un patient — la Caisse se contentait d'un message renvoyant vers "le module Administrateur", qui n'avait en réalité rien pour ça.
- Nouvel onglet **Assurances** dans Administration : création et liste des compagnies (nom, contact, email, délai de remboursement).
- **Caisse** : quand un patient n'a aucune assurance enregistrée et que le mode "Assurance" est choisi, un formulaire de rattachement apparaît directement (choix de la compagnie, n° adhérent facultatif, % de prise en charge), sans quitter l'écran de vente.

## 2026-09-15 — Correctif majeur : liens PDF/Excel non authentifiés (401 silencieux)
Statut: Implémentée
- Bug trouvé en complétant le flux "Caissier encaisse et imprime" : tous les liens vers des PDF/Excel de l'application (`<a href="/api/.../pdf">`, `window.open(...)`) échouaient silencieusement, car un lien HTML classique ne peut pas transporter l'en-tête `Authorization: Bearer ...` exigé par ces routes — l'onglet s'ouvrait quand même, vide ou en erreur, sans que ce soit évident.
- Ce bug touchait : le reçu de caisse, le rapport dentiste, et l'export Excel du Comptable.
- Correctif générique dans `utils/fichiers.js` : le fichier est toujours récupéré via le client HTTP authentifié (axios, qui injecte le jeton) sous forme de blob, puis ouvert/imprimé/téléchargé depuis ce blob. Appliqué partout où un fichier protégé est ouvert.
- Ajout d'un vrai bouton **« 🖨 Imprimer »** (déclenche directement la boîte de dialogue d'impression du navigateur via un cadre invisible), en plus de « Voir le PDF », sur le reçu de caisse et le rapport dentiste.
- Ajout d'une section **« Mon état de caisse »** dans l'interface Caisse (§5), avec sélection de période et impression directe — jusque-là cette route backend existait mais n'était exposée nulle part côté frontend.

## 2026-09-15 — Correctif mobile : tableaux qui forçaient le défilement de toute la page
Statut: Implémentée
- Remarque utilisateur : le tableau Utilisateurs (et d'autres) restait invisible sur téléphone.
- Cause : bug flexbox classique — un enfant flex avec une largeur de base fixe (`flex: "2 1 400px"`) refuse de rétrécir sous son contenu minimal tant qu'un `min-width: 0` explicite n'est pas fourni, ce qui pousse toute la page en défilement horizontal au lieu de confiner le défilement à l'intérieur de la carte contenant le tableau.
- Correctif appliqué systématiquement : `minWidth: 0` sur tous les conteneurs flex contenant un tableau (Administration : Utilisateurs, Médecins, Assurances ; Secrétariat ; Comptable), plus `overflow-x: hidden` défensif sur `body` pour empêcher tout débordement horizontal résiduel de la page elle-même.

## 2026-09-15 — Patient générique "Client CASH" pour les ventes au comptoir
Statut: Implémentée
- Demande utilisateur : un client par défaut "Client CASH" doit exister en permanence (vérifié/recréé automatiquement au démarrage du serveur), pour que le Caissier puisse toujours établir un reçu même sans patient identifié.
- Nouveau champ `EstClientCash` sur le modèle Patient, utilisé pour retrouver ce patient générique de façon robuste (indépendamment de son nom, au cas où il serait renommé).
- `app/utils/client_cash.py` : fonction idempotente appelée au démarrage (`lifespan` de FastAPI) — recherche le patient marqué `EstClientCash`, le crée s'il est absent. Testé explicitement pour confirmer qu'aucun doublon n'est créé sur des démarrages/appels répétés.
- Nouvelle route `GET /api/patients/client-cash` (recrée à la volée si besoin, défense en profondeur si le document a été supprimé après le démarrage).
- Caisse : bouton **"💵 Vente au comptant"** à côté de la recherche patient, sélectionne directement le Client CASH. Un badge "Vente au comptant" s'affiche pour que le caissier voie clairement qu'aucun patient n'est identifié ; l'option "Assurance" est masquée dans ce cas (un client anonyme ne peut pas avoir d'assurance).

## 2026-09-15 — Correction : identité obligatoire sur tout reçu (règles cliniques)
Statut: Implémentée
- Correction demandée par l'utilisateur sur deux points de la fonctionnalité Client CASH précédente : (1) un client cash PEUT avoir une assurance (l'option Assurance ne doit pas être masquée pour lui) ; (2) un reçu de clinique (hospitalière ou dentaire) doit TOUJOURS porter une identité complète — nom, prénoms, date de naissance, téléphone, sexe —, y compris en règlement par assurance, y compris pour le Client CASH.
- Nouveau champ `Sexe` sur le modèle Patient (Masculin/Féminin).
- Nouveau bloc `IdentiteRecu` (nom, prénoms, date de naissance, téléphone, sexe) rendu obligatoire par validation Pydantic sur `POST /api/caisse/ventes`, quel que soit le mode de règlement. Testé bout en bout : requête sans identité rejetée (422), avec identité complète acceptée (201) y compris en mode Assurance.
- Caisse : nouveau bloc "Identité pour ce reçu" toujours affiché et à remplir dès qu'un patient (réel ou Client CASH) est sélectionné, pré-rempli depuis la fiche patient quand elle existe, mais toujours éditable pour ce reçu précis. Restriction sur l'option Assurance retirée.
- Formulaire "+ Nouveau patient" complété avec Date de naissance et Sexe (facultatifs à l'enregistrement du patient, mais capturés à coup sûr au moment du reçu).
- Le PDF du reçu imprime désormais la ligne d'identité complète (civilité déduite du sexe, date de naissance, téléphone), testé visuellement avec un cas Client CASH + règlement Assurance.
- Bug cosmétique corrigé au passage : "Dossier: None" s'affichait littéralement sur les reçus non rattachés à un dossier d'examen.

## 2026-09-15 — Refonte du schéma dentaire + finition visuelle générale
Statut: Implémentée
- Remarque utilisateur : le schéma dentaire était trop petit et trop différent du modèle de référence fourni (dents stylisées en simples rectangles arrondis, sans distinction anatomique).
- Schéma dentaire entièrement redessiné : formes distinctes par type de dent (incisive, canine — pointe caractéristique et racine la plus longue —, prémolaire — racine bifurquée —, molaire — couronne large, 2-3 racines), déterminées automatiquement à partir du numéro FDI. Numéros repositionnés à l'extérieur de l'arcade (au-dessus de la rangée haute, en dessous de la rangée basse), comme sur le modèle fourni.
- Rendu vérifié visuellement avant livraison : génération d'un aperçu PNG haute résolution (cairosvg) reproduisant fidèlement la logique du composant React, avec tous les statuts de couleur testés (carie, couronne, implant, orthodontie, parodontal, dent extraite).
- Finition visuelle générale : ajout d'une police de titres distinctive (Plus Jakarta Sans) au-dessus d'Inter pour le texte courant, ombres et rayons de bordure affinés, transitions douces sur les boutons/champs, anneau de focus visible (accessibilité clavier), survol de lignes de tableau.

## 2026-09-15 — Corrections : menu Dentiste introuvable + schéma dentaire non réinitialisé après encaissement
Statut: Implémentée
- Menu "Dentiste" : ce n'était pas un bug de permission — le module existait bien pour le rôle Dentiste et l'Administrateur, mais était étiqueté "Dossiers patients" dans la sidebar plutôt que "Dentiste". Renommé directement en "Dentiste" pour lever l'ambiguïté.
- Bug réel trouvé et corrigé : après un encaissement réussi, le panier (lignes saisies au clavier + lignes issues du schéma dentaire) était bien vidé côté Caisse, mais le composant `SchemaDentaire` gardait son propre état interne (dents cochées/colorées) — d'où le décalage observé : le montant total repasse à 0 mais le schéma reste visuellement "sale" avec les dents de la vente précédente encore marquées.
- Correctif : le composant `SchemaDentaire` est maintenant remonté intégralement (`key` incrémentée) après chaque vente créée avec succès, ce qui réinitialise proprement tout son état interne.
- Effet de bord corrigé en même temps : si le Client CASH est réutilisé pour un client suivant, l'identité précédemment saisie (nom, prénoms, etc.) est maintenant vidée après la vente au lieu de rester pré-remplie par erreur pour la personne suivante.

## 2026-09-15 — Correction majeure : orientation anatomique du schéma dentaire + taille
Statut: Implémentée
- Remarque utilisateur (persistante après la première refonte) : le schéma restait trop petit et trop différent du modèle de référence fourni.
- Analyse approfondie du modèle de référence (superposition d'une grille de coordonnées sur l'image haute résolution fournie) : elle a révélé que l'orientation anatomique de ma reconstruction était inversée pour l'arcade supérieure — les racines des dents du haut doivent pointer vers le HAUT (à l'opposé de l'arcade basse), la couronne restant contre la ligne gingivale ; ma version précédente dessinait les deux arcades dans la même orientation (racines vers le bas partout), ce qui explique en grande partie l'écart visuel signalé.
- Correction : chaque dent utilise un tracé "canonique" unique (couronne en haut, racine en bas), mis à l'échelle et retourné verticalement (`scale(ECHELLE, -ECHELLE)`) pour l'arcade supérieure uniquement — un seul jeu de formes pour les deux arcades, orientation garantie correcte par construction plutôt que par duplication de code.
- Taille quasiment doublée (échelle ×1.9, espacement horizontal 52→96px), numéros repositionnés en conséquence à l'extérieur de l'arcade.
- Rendu vérifié par génération d'un aperçu PNG haute résolution reproduisant exactement la logique du composant (mêmes formules, même échelle) avant livraison, avec tous les statuts de couleur testés.

## 2026-09-15 — Corrections : bouton "Vente au comptant" muet + libellé "Dossier Patients" restauré
Statut: Implémentée
- Libellé de la sidebar pour le module Dentiste restauré à "Dossier Patients" (le terme "Dentiste" jugé pas assez adapté au contexte par l'utilisateur).
- Bug trouvé sur "Vente au comptant" : la fonction `selectionnerClientCash` n'avait aucune gestion d'erreur, et surtout, la zone d'affichage des erreurs de la page n'existait que dans le bloc affiché UNE FOIS un patient déjà sélectionné — un échec avant toute sélection n'avait donc littéralement nulle part où s'afficher, d'où l'absence totale de réaction visible au clic.
- Correction : gestion d'erreur ajoutée à `selectionnerClientCash`, et le message d'erreur est maintenant aussi affiché directement dans la carte de recherche/sélection patient (avant qu'un patient ne soit choisi), pas seulement après.

## 2026-09-15 — Suppression de ligne du panier/reçu, y compris pour les actes issus du schéma dentaire
Statut: Implémentée
- Remarque utilisateur : impossible de retirer une ligne d'une facture/reçu en cours — en réalité seules les lignes de saisie rapide au clavier étaient supprimables depuis le tableau du panier ; les lignes issues du schéma dentaire ne l'étaient pas (il fallait revenir décocher la dent correspondante, ce qui n'était pas évident).
- `SchemaDentaire` transformé en composant `forwardRef` exposant une méthode `retirerActe(numeroDent, codeProduit)`, appelable depuis la Caisse pour retirer un acte précis (et remettre la dent en statut "Sain" si c'était son seul acte), sans passer par le clic sur la dent elle-même.
- Le bouton "✕" du tableau du panier fonctionne maintenant uniformément sur toutes les lignes, qu'elles viennent de la saisie rapide ou du schéma dentaire.

## 2026-09-16 — Numérotation universelle, nom au survol, modes de paiement paramétrables, correctifs Caisse
Statut: Implémentée
- Numérotation du schéma dentaire basculée de la FDI (11-48) vers la numérotation universelle américaine (1-32 en continu), fidèle au modèle de référence fourni — la FDI "saute" de 8 à 11, donnant l'impression de numéros manquants.
- Nom clinique complet de chaque dent affiché au survol de la souris (infobulle SVG native + panneau latéral), ex: "Troisième molaire supérieure droite (dent de sagesse)".
- Nouvelle table `TypePaiement` paramétrable depuis Administration (nouvel onglet "Paiements") : nom du mode de règlement + case "le caissier doit saisir la référence de la transaction". Modes par défaut créés : Espèces (sans référence), Orange Money, Moov Money (avec référence obligatoire).
- Caisse : sélecteur de mode de règlement alimenté dynamiquement depuis cette table ; quand le mode choisi exige une référence, une modale bloque la validation tant que la référence n'est pas saisie. Validation dupliquée côté serveur (jamais confiance au seul contrôle frontend) — testée : requête sans référence → 400, avec référence → 201.
- Référence de transaction imprimée sur le reçu PDF.
- Bouton "Changer" de patient corrigé : ouvre désormais une modale de recherche/sélection au lieu de fermer tout le panier/schéma en cours.
- Bloc "Identité pour ce reçu" : ajout d'un bouton "Enregistrer" (met à jour la fiche du patient réel, ou crée un nouveau patient à partir de l'identité saisie si c'était le Client CASH) + affichage de l'ID Patient au-dessus du bloc.

## 2026-09-16 — Quantité modifiable, double numérotation dentaire (internationale/universelle), pictogrammes sidebar
Statut: Implémentée
- Panier : quantité de chaque ligne (acte dentaire ou saisie rapide) modifiable directement via des boutons +/-, y compris pour les actes issus du schéma dentaire (`SchemaDentaire` expose désormais aussi `changerQuantite` via sa ref).
- Nouveau réglage Administration → Cabinet : "Numérotation du schéma dentaire" (Internationale/FDI ou Universelle), reflète la préférence du dentiste selon son école de formation. Le schéma dentaire redevient interne en FDI (clé stable, formule simple pour déduire le type anatomique) et n'affiche la numérotation universelle qu'en surface (conversion via une table de correspondance bijective dédiée `utils/numerotationDentaire.js`, vérifiée programmatiquement : 32 entrées, bijective).
- Chaque ligne de panier/reçu enregistre désormais SYSTÉMATIQUEMENT les deux références (`numero_dent_international` ET `numero_dent_universel`), quelle que soit la numérotation affichée au moment de la saisie — colonnes ajoutées sur `VenteClinique.lignes` et `A_Acheté`.
- Le panier affiche un suffixe "(46i)" (internationale) ou "(30u)" (universelle) à la fin de l'intitulé de l'acte, selon le réglage actif ; même suffixe imprimé sur le reçu PDF. Vérifié par génération d'un reçu de test (quantité 2, suffixe "(46i)", mode Orange Money + référence de transaction imprimée).
- Icônes (pictogrammes) ajoutées devant chaque lien de la sidebar : 💰 Caisse, 📅 Rendez-vous, 🦷 Dossier Patients, 📊 Encaissements, ⚙️ Administration.

## 2026-09-16 — Prix Assurance, catalogue éditable, médecins/patients CRUD, logo cabinet, archivage schéma dans Pièces Scannées
Statut: Implémentée
- Nouveau champ "Prix Second" (Prix Assurance) sur ProduitClinique, utilisé à la place du Prix Public quand le règlement se fait par assurance. Recalcul TOUJOURS effectué côté serveur (jamais confiance au prix envoyé par le client) : testé bout en bout (acte à 100 000 F public / 80 000 F assurance, assurance à 75% → part assureur 60 000 F, part patient 20 000 F, montant facturé 80 000 F et non 100 000 F).
- Catalogue (Admin) entièrement éditable en ligne : libellé, domaine (liste déroulante alimentée par `/produits/domaines`, le code est ce qui est enregistré), Prix Public, Prix Assurance, activer/désactiver. Nouveau champ `Actif` sur ProduitClinique ; seuls les actes actifs apparaissent désormais à la Caisse (`GET /produits` filtre par défaut, `inclure_inactifs=true` réservé à l'Administration) — testé avec rétrocompatibilité (un acte sans le champ `Actif` reste considéré actif).
- Médecins (Admin) : édition de l'identité, activer/désactiver, suppression protégée — refusée si le dentiste est impliqué dans au moins un rendez-vous/acte (testé : 400 avec rendez-vous existant, 200 sans).
- Nouvel onglet Administration → Patients : recherche, édition de l'identité (nom, prénoms, téléphone, adresse, date de naissance, sexe), activer/désactiver.
- Logo du cabinet téléchargeable (Admin → Cabinet), stocké en data URI base64 (pas d'infrastructure de stockage de fichiers séparée nécessaire), imprimé dans l'en-tête du reçu PDF si renseigné. Clarification actée : le fauteuil dentaire reste le logo de la plateforme SAWALI DentalCare (sidebar/connexion), ce nouveau logo est celui du cabinet client, distinct.
- Schéma dentaire archivé dans `Pièces_Scannées_Utilisateurs` à chaque reçu ayant des lignes rattachées à une dent, avec le numéro de reçu en référence. Nouvelle route `GET /patients/{numero}/dernier-schema-dentaire` : compare la dernière modification d'un Dossier_Examen et le dernier reçu archivé pour ce patient, retourne le plus récent des deux. Le Dentiste s'en sert désormais pour pré-charger le schéma d'un dossier tout juste ouvert/créé qui n'a pas encore son propre enregistrement.
- Bug latent corrigé au passage (même famille que le bug Caisse de la session précédente) : le schéma dentaire du Dentiste ne se réinitialisait pas en changeant de dossier (composant non remonté) — `key={dossier.Dos_num}` ajoutée.

## 2026-09-16 — Correction : le %PC appartient à l'assurance, le caissier ne le saisit jamais
Statut: Implémentée
- Correction demandée par l'utilisateur sur une mauvaise compréhension de ma part : le %PC (prise en charge) n'est PAS un paramètre que le caissier ajuste par reçu ou par rattachement — c'est une propriété de l'assurance elle-même (ex: "OLEA80" → 80% par défaut, déjà dans sa configuration).
- Nouveau champ `pourcentage_prise_en_charge_defaut` sur le modèle `Assurance`, réglable depuis Administration → Assurances à la création (ex: en créant "OLEA80", on saisit 80 une seule fois).
- `POST /api/assurances/patients` (rattachement patient-assurance) ignore désormais TOUJOURS toute valeur de %PC envoyée par le client et reprend systématiquement `Assurance.pourcentage_prise_en_charge_defaut` — testé bout en bout : une tentative d'envoyer 100% est bien ignorée, 80% (celui de l'assurance) est appliqué.
- Caisse : le champ de saisie libre du %PC lors du rattachement à la volée a été retiré, remplacé par un affichage en lecture seule ("Prise en charge : 80% — définie sur cette assurance, non modifiable ici").
- La répartition part assureur/part assuré au moment du reçu (déjà correcte) continue de s'appuyer sur ce %PC ainsi verrouillé à la source.

## 2026-09-16 — Restructuration règlement : assurance = complément au type de paiement, jamais une alternative
Statut: Implémentée
- Corrections apportées suite au document "Nouvelles implémentations Sawali Dental" (Word) fourni par l'utilisateur, avec clarifications orales complémentaires :
- **Client CASH sans assurance (retour en arrière assumé)** : contrairement à ce qui avait été implémenté deux sessions plus tôt ("un client cash peut avoir une assurance"), l'utilisateur a précisé que ce n'est pas le cas — le Client CASH ne peut jamais avoir d'assurance rattachée. Vérifié côté serveur (400 si tenté), pas seulement côté interface.
- **Le type de paiement n'est plus remplacé par "Assurance"** : "Assurance" est retirée du sélecteur de mode de règlement et devient une case à cocher séparée ("Ce reçu est pris en charge (en partie) par une assurance"), toujours visible pour tout patient qui n'est pas le Client CASH. Le type de paiement (Espèces, Orange Money, Moov Money...) reste TOUJOURS obligatoire et précise comment le patient règle le montant NET de son reçu, même quand une assurance couvre le reste — testé bout en bout (les deux cohabitent sur un même reçu, la référence de transaction exigée par le type de paiement s'applique normalement).
- **Reçu PDF corrigé en conséquence** : le montant mis en avant (gros encadré + somme en lettres) est désormais le montant NET réellement encaissé du patient (PArtAssuré), plus une ligne de répartition "Total des prestations : X • Part assurance (exigible ultérieurement) : Y" quand une assurance s'applique — auparavant le reçu affichait à tort le montant total des prestations, pas ce qui a été réellement perçu à la caisse. Vérifié visuellement.
- Badge affiché en haut à droite du schéma dentaire indiquant la numérotation active ("Numérotation internationale (FDI)" ou "Numérotation universelle (1-32)"), à l'emplacement demandé (image de référence fournie avec la zone marquée en jaune).

## 2026-09-16 — Assurances entièrement éditables depuis le tableau (Administration)
Statut: Implémentée
- Nouvelle route `PUT /api/assurances/{numero_enreg}` : intitulé, %PC par défaut, contact, email, délai de remboursement et statut actif/inactif tous modifiables.
- Onglet Administration → Assurances passé en édition en ligne (même schéma que Catalogue/Médecins/Patients) : bouton "Modifier" par ligne, plus bouton Activer/Désactiver. Les assurances désactivées restent visibles et modifiables en Administration mais disparaissent du sélecteur à la Caisse.
- Testé bout en bout : modification de l'intitulé et du %PC vérifiée.

## 2026-09-16 — Règle : le Prix Assurance ne peut jamais être inférieur au Prix Public
Statut: Implémentée
- Nouvelle contrainte de validation sur `ProduitCliniqueBase` (modèle unique utilisé par la création ET la modification d'un acte) : si le Prix Assurance (Prix Second) est renseigné, il doit toujours être ≥ Prix Public — sinon rejet avec message explicite. Testé bout en bout : 422 en création comme en modification si la règle est violée, 200 si respectée.
- Catalogue (Admin) : vérification identique côté interface pour un retour immédiat sans aller-retour serveur, plus affichage propre du message d'erreur renvoyé par le serveur (extraction du message Pydantic) si jamais la garde serveur est celle qui intercepte.

## 2026-09-17 — Architecture SaaS multi-cabinets (isolation stricte des données)
Statut: Implémentée
- Transformation majeure : l'application passe d'un cabinet unique à une véritable plateforme SaaS multi-tenant. Nouveau modèle `Cabinet` : code unique à 4 chiffres (séquence plateforme), état d'abonnement (Actif/En Attente/Suspendu/Expiré/Inactif).
- Isolation stricte : `cabinet_code` propagé et filtré systématiquement sur TOUTES les collections métier (Patient, MédecinT, RendezVous, ProduitClinique, VenteClinique, A_Acheté, Assurance, AssurancePatient, PriseEnCharge, TypePaiement, Dossier_Examen, Pièces_Scannées_Utilisateurs, Rappel, UtilisateurBlg) — dans absolument toutes les routes de tous les routeurs. SuggestionHistorique reste volontairement une collection plateforme globale (journal de développement, pas une donnée métier d'un cabinet).
- Connexion sans sélecteur de cabinet (§ demande utilisateur) : le login est unique sur toute la plateforme, et seul le couple login/mot de passe détermine le cabinet. La connexion est bloquée si le cabinet n'est pas à l'état "Actif" (message explicite).
- Nouveau rôle transverse "super-admin plateforme" (`EstSuperAdmin`, distinct de l'Administrateur d'un cabinet) : nouveau routeur `plateforme.py` et page frontend dédiée pour créer/éditer les cabinets, choisir les éléments à reproduire à la création (catalogue, modes de paiement, assurances — jamais Patients/reçus/Médecins/RendezVous, toujours vides pour un nouveau cabinet) et changer leur état d'abonnement.
- Nouvelle numérotation à 8 caractères pour patients et rendez-vous (code cabinet 4 chiffres + numéro d'ordre 4 chiffres, la séquence redémarrant chaque année pour chaque cabinet), ex: "00010152". Les reçus suivent le même principe avec le préfixe "R-" conservé.
- Sidebar : affiche désormais la dénomination du cabinet de travail de l'utilisateur connecté, sous le logo de la plateforme (le fauteuil dentaire) — les deux sont bien distincts, comme précisé.
- Migration effectuée sur la base Atlas existante : le cabinet SAWALI DentalCare devient le cabinet "0001" (état Actif), toutes les données existantes rattachées, compte super-admin créé.
- **Testé bout en bout avant publication** : isolation totale vérifiée entre deux cabinets simulés (patients invisibles d'un cabinet à l'autre, accès direct par ID refusé avec 404 même en devinant le numéro), numérotation correcte ("00010001", "00020001"), connexion bloquée pour un cabinet Suspendu, connexion acceptée pour un cabinet Actif et pour le super-admin.

## 2026-09-17 — Correctif : reproduction de cabinet sécurisée (copie indépendante)
Statut: Implémentée
- Bug trouvé en retestant la reproduction d'éléments (catalogue/modes de paiement/assurances) à la création d'un cabinet : le code mutait en place les documents récupérés du cabinet modèle avant de les dupliquer, risquant de corrompre les données du cabinet source selon le comportement du driver Mongo. Corrigé : construction de copies neuves et indépendantes avant insertion, jamais de mutation des documents source. Retesté : le cabinet modèle reste intact après reproduction, le nouveau cabinet reçoit bien sa propre copie.

## 2026-09-17 — Centre de Messagerie WA : identifiants Meta paramétrables par cabinet
Statut: En cours
- Nouveau modèle `ConfigurationWhatsApp` (WABA ID, Phone Number ID, numéro affiché, App ID, token d'accès système, App Secret, jeton de vérification webhook, actif), un document par cabinet — cohérent avec l'isolation stricte de l'architecture SaaS.
- Nouveau routeur `messagerie.py` : `GET/PUT /api/messagerie/configuration` (Administrateur uniquement, scope automatique au propre cabinet). Les champs sensibles (token, app secret, jeton webhook) ne sont JAMAIS retournés en clair après enregistrement — la lecture renvoie un indicateur `<champ>_renseigne: true/false` à la place, sur le même principe que le mot de passe d'un compte utilisateur. Testé bout en bout : token jamais exposé après écriture ni en relecture, isolation confirmée entre deux cabinets (le cabinet B ne voit aucune donnée du cabinet A).
- Nouvel onglet Administration → "Messagerie WA" : formulaire de configuration, champs sensibles en saisie masquée (vide = conserver la valeur déjà enregistrée), bouton "Effacer" dédié par champ sensible (ex: révocation d'un token compromis).
- **En attente** : accès au repo `ShuyahBF/Emergent` (privé, non accessible avec le token actuel) pour reproduire fidèlement l'interface et les fonctionnalités de `/contacts` — le reste du Centre de Messagerie (conversations, envoi/réception texte/vocal/image/vidéo) est à construire une fois cette référence obtenue.

## 2026-09-18 — Gouvernance plateforme : journal par cabinet, essais, licences, suspension automatique
Statut: Implémentée (envoi email/WA en attente d'identifiants)
- **Journal d'activité par cabinet** : chaque entrée du journal d'audit (déjà existant) porte désormais le `cabinet_code` de son auteur. Nouvelle route `GET /plateforme/cabinets/{code}/journal` (super-admin) + modale dédiée dans `/plateforme`.
- **Durée d'essai + dates affichées** : nouveau champ `duree_essai_jours` sur le Cabinet (décompté depuis `date_creation`, réglable à la création), et `date_derniere_modification` désormais suivie et affichée aux côtés de `date_creation` dans le tableau des cabinets.
- **Licences d'utilisation** : nouveau modèle `Licence` (code cabinet, date de renouvellement, durée de renouvellement, durée de souscription, date d'expiration calculée côté serveur). Seul le super-admin peut en générer (`POST /plateforme/cabinets/{code}/licences`) — la génération réactive automatiquement un cabinet suspendu et archive toute licence active précédente comme "Remplacée". Historique consultable par cabinet.
- **Suspension automatique** : nouvelle tâche planifiée quotidienne (APScheduler, exécutée aussi une fois au démarrage du serveur) qui, pour chaque cabinet Actif, calcule son échéance effective (licence active la plus récente, sinon fin de période d'essai) : notifie le super-admin 3 jours avant l'échéance, et suspend automatiquement le cabinet si l'échéance est dépassée sans renouvellement. Testé bout en bout avec 4 cas simultanés (essai proche fin → notifié sans suspension, essai expiré → suspendu, licence valide longtemps → inchangé, déjà suspendu → ignoré) — tous corrects.
- Notifications visibles dès l'ouverture de `/plateforme` (bandeau, "marquer comme lue").
- **Portée actuelle assumée** : la détection et la création des notifications sont réelles et testées ; l'envoi EFFECTIF par email et par WhatsApp nécessite des identifiants d'envoi non configurés à ce stade (compte SMTP pour l'email ; numéro WhatsApp Business propre à la PLATEFORME — distinct de ceux de chaque cabinet — pour le WhatsApp). Les champs `email_envoye`/`whatsapp_envoye` sur `NotificationPlateforme` restent à `False` en attendant ce branchement.

## 2026-09-18 — Centre de Messagerie WA (2/2) : annuaire de contacts, phase 1
Statut: Implémentée (envoi/réception WhatsApp = phase 2, à venir)
- Reproduction fidèle de l'interface `/contacts` du portail de référence (repo `ShuyahBF/Emergent`, branche `Site-SawaliSmartSystems`, rendu public temporairement pour l'implémentation) : en-tête "Centre de Messagerie" avec badge cabinet, recherche + tri (interaction/nom), pastilles de filtre Tous/Partagés équipe/Privés/Non-lus avec compteurs en direct, export CSV/JSON, bannière jaune d'import en un clic des expéditeurs WhatsApp inconnus, tableau de contacts avec avatar coloré à initiales, code unique inaltérable, tags, badge de partage — traduit dans le kit de style déjà utilisé par le reste de l'application (l'original utilise Tailwind, absent de ce projet).
- Nouveaux modèles `ContactMessagerie` et `ContactEnAttente`, scopés par cabinet (isolation stricte). Nouvelles routes `GET/POST/PUT/DELETE /messagerie/contacts`, `GET /messagerie/contacts/export.csv|.json`, `GET /messagerie/contacts-en-attente`, `POST .../importer`, `DELETE .../{numero}` (ignorer) — réservées à l'Administrateur et au Secrétariat Cabinet. Nouvelle page `/messagerie`, lien Sidebar ajouté pour ces deux rôles.
- Testé bout en bout : création/liste/isolation entre cabinets, import d'un expéditeur en attente → contact créé avec le bon numéro + suppression de la liste d'attente, export CSV.
- **Délibérément NON reproduit** : la recherche cross-tenant de la référence (contredirait l'isolation stricte multi-cabinets de cette plateforme), SMS, planification de messages, liens de paiement, historique Liluvine (IA) — fonctionnalités hors du périmètre WhatsApp demandé ou nécessitant une infrastructure tierce non présente ici.
- **Phase 2 restant à construire** : réception/envoi réel des messages WhatsApp (récepteur de webhook Meta pour peupler `ContactEnAttente` et l'historique de conversation, envoi de templates/texte/vocal/image/vidéo via la Configuration WhatsApp déjà en place) — le bouton "WhatsApp" de chaque contact est pour l'instant désactivé avec une info-bulle explicite à ce sujet plutôt que simulé.

## 2026-09-18 — Bouton "Communication" par cabinet (SMTP + WA), copie sécurisée, journal enrichi
Statut: Implémentée
- Nouveau bouton "📡 Communication" à côté de chaque cabinet dans `/plateforme` (après "🪪 Licence" et "📋 Journal"), réservé au super-admin : modale à onglets 📧 SMTP / 💬 WhatsApp, un jeu de paramètres complet par cabinet.
- Nouveau modèle `ConfigurationSMTP` (hôte, port, utilisateur, mot de passe, expéditeur, TLS, actif), scopé par cabinet — mêmes principes de confidentialité que `ConfigurationWhatsApp` (champs sensibles jamais retournés en clair, indicateur `_renseigne` à la place).
- **Super-admin doté des deux mêmes réglages** : carte dédiée "🛰️ Ma configuration — Plateforme" en haut de `/plateforme`, utilisant le code réservé `PLATEFORME` (jamais un vrai code cabinet à 4 chiffres) — pour les futures notifications plateforme (email/WA lors d'une expiration de licence).
- **Bouton "Copier"** : copie la configuration SMTP et/ou WhatsApp d'un cabinet vers un autre, entièrement côté serveur — les valeurs sensibles (mot de passe SMTP, token WhatsApp...) ne transitent JAMAIS par le navigateur du super-admin, contrairement à un copier-coller de formulaire classique. Testé bout en bout : la valeur réelle est bien dupliquée en base sans jamais apparaître dans une réponse API.
- **Journal enrichi** : les tentatives de connexion (réussies ET échouées, avec motif — mauvais mot de passe, compte désactivé, cabinet non-Actif) sont désormais toutes journalisées avec le bon `cabinet_code`. La modale Journal propose un filtre "📜 Toutes les actions" / "🔑 Connexions uniquement", avec une icône distincte par type d'action.
- Passe de polish visuel demandée (interfaces "très graphiques") : pictogrammes sur l'ensemble des boutons de `/plateforme` (🏥 cabinet, 🪪 licence, 📋 journal, 📡 communication, 🔑 connexions, ✓ notifications...).

## 2026-09-18 — Afficher/masquer mot de passe + connexion OTP WhatsApp (par cabinet)
Statut: Implémentée (envoi WhatsApp réel non testable en direct ici — aucun identifiant Meta réel disponible)
- Pictogramme 👁️/🙈 afficher/masquer sur tous les champs mot de passe saisis par un humain : connexion (Connexion.jsx), création de compte et création du premier Administrateur d'un cabinet (Plateforme.jsx).
- **Connexion en 2 étapes, activable par cabinet** : nouveau réglage "🔐 Connexion sécurisée par code WhatsApp (OTP)" dans Administration → Cabinet. Si activé : après vérification login/mot de passe, un code à 6 chiffres est envoyé par WhatsApp au numéro enregistré sur le compte (`POST /auth/connexion` renvoie `otp_requis: true` au lieu du jeton), à valider via `POST /auth/verifier-otp` (code expire après 5 minutes, usage unique). Nouveau champ téléphone sur chaque compte utilisateur (Administration → Utilisateurs), nécessaire pour recevoir le code.
- Nouvel utilitaire `whatsapp_api.py` : envoi réel via l'API Cloud Meta avec les identifiants du cabinet (`ConfigurationWhatsApp`) déjà en place. Gestion propre de tous les cas d'échec (config absente, erreur réseau) sans jamais faire planter la connexion.
- **Testé bout en bout** (6 scénarios) : connexion normale sans OTP, connexion avec OTP (code envoyé, pas de jeton avant validation), mauvais code rejeté, bon code accepté, réutilisation d'une session OTP déjà validée refusée, échec explicite si OTP activé mais aucun téléphone enregistré sur le compte.
- **Non testable ici** : l'envoi effectif du message via l'API Meta (aucun identifiant WhatsApp Business réel dans cet environnement) — le code d'appel est correct et prêt, à valider en conditions réelles avec une vraie Configuration WhatsApp.

## 2026-09-18 — Workflow Dentiste : intervention explicite + historique, section Ordonnance
Statut: Implémentée
- **Fin de l'enregistrement automatique et silencieux du schéma** : le Dentiste voit désormais une liste texte des actes de l'intervention sous le schéma, et doit cliquer explicitement sur "✏️ Modifier intervention" pour enregistrer (indicateur "● Modifications non enregistrées" tant que ce n'est pas fait).
- **Historique de modifications du dossier** : chaque clic sur "Modifier intervention" ajoute une entrée (nom du médecin + date) à `Dossier_Examen.historique_modifications` — jamais écrasée, affichée sous la liste des actes. Testé bout en bout : deux médecins différents modifiant le même dossier apparaissent bien l'un après l'autre dans l'historique.
- **Nouvelle section Ordonnance** : le Dentiste rédige/édite une ordonnance (désignation, posologie/instructions, durée, quantité par ligne) que le patient utilise pour acheter les produits recommandés. Référence unique générée à la création (ex: "0001-0007"), réutilisée à chaque modification (upsert). Génération PDF avec reproduction optionnelle (activée par défaut, comme demandé) des dents traitées de ce dossier sous forme de tableau en bas de page — plus fiable à l'impression qu'une reproduction graphique miniature du schéma.
- Testé bout en bout (7 scénarios) : historique multi-auteurs, création/relecture/modification d'ordonnance avec référence stable, génération PDF. Aperçu visuel du PDF vérifié.

## 2026-09-19 — Cabinets enrichis (dentiste principal, licence) + thèmes par cabinet + mode sombre
Statut: Implémentée
- Tableau des cabinets (`/plateforme`) : deux colonnes ajoutées — dentiste principal (résolu depuis MédecinT) et date d'expiration de la licence active la plus récente. Testé bout en bout.
- **Thèmes d'interface** : nouveau catalogue `ThemePlateforme` (code, nom, 3 couleurs) maintenu par le super-admin (`/plateforme` → "🎨 Gérer les thèmes", CRUD complet). Chaque cabinet choisit son thème dans Administration → Cabinet, parmi la liste des thèmes actifs (jamais une couleur libre) — testé bout en bout, y compris la suppression sécurisée d'un thème (les cabinets qui l'avaient choisi retombent automatiquement sur le thème par défaut, sans casse).
- **Mode clair/sombre** indépendant du thème, également par cabinet. Variables CSS étendues (`--sawali-texte`, `--sawali-bordure`) et redéfinies sous `[data-theme="sombre"]` — la plupart des composants s'adaptent automatiquement puisqu'ils utilisent déjà ces variables (cartes, champs, tableaux, boutons secondaires). Appliqué au chargement de l'app et immédiatement après enregistrement, sans rechargement de page.
- **Portée assumée** : quelques bordures/survols encore codés en couleur fixe dans des styles en ligne (composants Caisse/Dentiste/Admin) peuvent rester peu contrastés en mode sombre — non repris systématiquement faute de temps ; le cœur de l'interface (cartes, tableaux, boutons, champs) est correctement pris en charge.

## 2026-09-19 — Planning du Dentiste (son propre calendrier de RDV)
Statut: Implémentée
- § demande utilisateur : "Le médecin quand il clique dans 'Rendez-vous' voit son calendrier de rdv" — reproduction inspirée de /portal/planning (portail SAWALI SMART SYSTEMS) et de la capture d'écran fournie.
- Nouveau lien compte Dentiste ↔ fiche MédecinT (`UtilisateurBlg.MedecinNumeroEnreg`), réglable dans Administration → Utilisateurs (sélecteur affiché uniquement pour un compte de rôle Dentiste). Nouvelle route `GET /utilisateurs/moi` (tout utilisateur connecté) pour que chacun connaisse son propre profil, y compris ce lien.
- `GET /rendez-vous` enrichit désormais chaque rendez-vous avec le nom/prénoms/téléphone du patient (résolu côté serveur). Nouvelle route `GET /rendez-vous/charge-a-venir` : nombre de RDV par jour sur une fenêtre glissante (30 jours par défaut), pour un dentiste donné — les statuts Annulé/Absent ne comptent pas dans la charge.
- Nouvelle page `/dentiste/rendez-vous` : en-tête avec navigation de date (◀ date ▶, "Aujourd'hui"), badge "Dès le JJ/MM/AA : N RDV", bandeau "🔒 Consultation de votre planning" (lecture seule — la création/modification des RDV reste au Secrétariat Cabinet), grille horaire du jour avec ligne rouge "maintenant" et blocs de rendez-vous colorés par statut, et panneau "Charge 30j à venir" (heat-map 6 colonnes + légende Moins→Plus + statistiques Jours chargés/Total RDV/Pic journalier). Lien ajouté dans la Sidebar du Dentiste.
- Testé bout en bout : enrichissement patient sur la liste, calcul de charge sur plusieurs jours avec exclusion correcte des RDV annulés, résolution du lien médecin via "mon profil".

## 2026-09-19 — Vérification numérotation + correctif RDV orphelin ; bouton "Modifier intervention" verrouillé ; duplication/annulation de reçus
Statut: Implémentée / vérifiée
- **Numérotation** : vérifiée directement en base Atlas de production — fonctionne correctement (dernier patient "00010001", dernier reçu "R-00010001"). Un rendez-vous orphelin (créé juste avant l'ajout du rattachement cabinet à cette route) a été corrigé manuellement en base (cabinet_code + référence rétro-remplis).
- **Dentiste — bouton "Modifier intervention"** : reste construit et visible, mais définitivement grisé/désactivé (§ demande utilisateur : éviter toute incohérence entre ce que la Caisse a facturé et ce que le Dentiste pourrait modifier). Tooltip explicatif + mention "🔒 Verrouillé — cohérence avec la facturation de la Caisse".
- **Caisse — dupliquer/annuler un reçu** : nouvelles routes `POST /caisse/ventes/{reference}/dupliquer` (nouvelle référence, contenu facturé identique, jamais recalculé) et `PUT /caisse/ventes/{reference}/annuler` (réservée au droit PeutSupprimerRecu ou à l'Administrateur). Nouvelle section "Mes reçus du jour" dans Caisse.jsx avec ces deux actions, reçus annulés barrés visuellement.
- **État de caisse** : les reçus annulés apparaissent barrés (rouge, `<strike>`) dans le PDF, mais leur montant est exclu de "TOTAL CAISSE" — une ligne séparée "Reçus annulés (N)" récapitule leur somme, pour la traçabilité sans fausser le montant réel en caisse. Aperçu visuel vérifié.
- Testé bout en bout : duplication (référence + montant conservés), annulation (droits refusés/acceptés, ré-annulation bloquée, duplication d'un reçu annulé bloquée), calcul des totaux PDF.

## 2026-09-19 — Module VIDAL France (recherche médicament, fiche produit, posologie, sécurisation de prescription)
Statut: Implémentée
§ demande utilisateur : "Les médecins doivent pouvoir avoir des informations sur les produits qu'ils prescrivent ainsi que sécuriser leurs ordonnances." Port fidèle du portail SAWALI SMART SYSTEMS de référence (déjà testé en réel contre l'API VIDAL et le manuel d'intégration MI_APIREST REV_03), abonnement de la PLATEFORME (SAWALI SMART SYSTEMS), partagé par tous les cabinets actifs — pas configuré cabinet par cabinet.

**Backend** :
- `app/utils/vidal_client.py` — client VIDAL complet : configuration (test/production), cache Mongo (TTL configurable), quota journalier par utilisateur, appel HTTP authentifié (`app_id`/`app_key`), parsing Atom/XML (recherche, fiche produit agrégée voies+documents)
- `app/utils/vidal_securisation.py` — construction du XML de prescription (`/alerts/full`) et parsing des alertes, schéma vérifié contre le manuel VIDAL
- `app/routers/vidal.py` — recherche médicament, fiche produit, indications, équivalents VMP, proxy documents (RCP), posologie (endpoint marqué expérimental, comme dans l'original), recherche référentielle allergies/pathologies/molécules, analyse de sécurisation + historique. Réservé au Dentiste et à l'Administrateur.
- `app/routers/plateforme.py` — GET/PUT configuration VIDAL (super-admin uniquement), clés `app_key` jamais retournées en clair (masquage, comme WhatsApp/SMTP)
- **Simplifications assumées** (disclosed) : pas de webhook-proxy (n8n/Zapier), pas de mode référentiel hors-ligne synchronisé, pas de suivi de patients VIDAL propre (redondant avec le module Patient de DentalCare), pas de génération d'ordonnance VIDAL dédiée ni d'envoi WhatsApp depuis ces pages (DentalCare a déjà son propre flux Ordonnance, voir Dentiste.jsx)

**Frontend** (sidebar Dentiste : 🔗 Fiche Produit VIDAL, 💊 Posologie, ⚠️ Sécurisation) :
- `components/VidalMedicationSearch.jsx` — recherche médicament autocomplétée (garde-fous anti-course de requêtes portés fidèlement)
- `pages/VidalFicheProduit.jsx` — voies d'administration, documents (RCP...), équivalents (regroupement VMP)
- `pages/VidalPosologie.jsx` — profils patients rapides, médicament réel, voie/indication réelles, recherche de posologie (bandeau "expérimental" conservé)
- `pages/VidalSecurisation.jsx` — profil patient (IMC + clairance de Cockcroft & Gault calculés côté client), tags référentiels allergies/pathologies/molécules, traitements en cours + nouvelle prescription (ligne par ligne avec voie/indication), 18 types d'alerte réels (bascule tout cocher/décocher), résultat en cartes triées par gravité avec code couleur
- Section "💊 Module VIDAL France" dans `/plateforme` (super-admin), fidèle à la capture d'écran fournie : activation, mode test/production, 2 environnements, TTL cache, quota/utilisateur/jour, timeout HTTP

**Testé bout en bout** : parsing XML/Atom (recherche, fiche produit, réponse d'alertes — 4 scénarios), droits d'accès (Caissier refusé 403, Dentiste/Admin autorisés), cache (2e appel identique ne renvoie pas de requête VIDAL), quota journalier (dépassement → 429, cohérent avec le comportement du portail de référence : consommé même sur un hit de cache), module désactivé → 503, analyse de sécurisation complète avec historique par praticien, configuration super-admin (masquage des clés + mise à jour partielle sans écraser les autres champs).

**Non testable dans cet environnement** : les appels réels à l'API VIDAL elle-même (domaine `api.vidal.fr` hors liste blanche réseau du bac à sable) — toute la logique côté SAWALI DentalCare (parsing, cache, quota, XML, droits) est validée ; seul l'aller-retour réseau final vers VIDAL reste à confirmer en conditions réelles avec les identifiants renseignés dans `/plateforme`.

## 2026-09-18 — Correction Caisse : bouton "Consulter" par reçu + historique du jour élargi à tout le cabinet
Statut: Corrigée
- **Bug identifié et confirmé en base réelle** : le panneau "Mes reçus du jour" ne montrait que les reçus créés par le compte actuellement connecté (`Code Vendeur` = login exact) — un reçu créé par un autre compte (ex: `admin`) le même jour restait invisible, d'où "aucun reçu ce matin" alors que le reçu R-00010001 (SARL SAWALI, 85 000 FCFA, 11h16) existait bel et bien.
- **Corrigé** : le panneau, renommé "🧾 Historique des reçus du jour (tout le cabinet)", affiche désormais tous les reçus émis ce jour pour le cabinet, quel que soit le compte qui les a créés — avec une colonne "Caissier" ajoutée pour identifier qui a émis chaque reçu.
- **Confusion de libellé corrigée** : le bouton "Consulter" ouvrait/masquait tout le panneau (pas un reçu précis) — renommé "▾ Afficher"/"▴ Masquer". Un vrai bouton "👁 Consulter" par ligne a été ajouté, ouvrant le PDF du reçu correspondant.
- Vérifié directement contre les données réelles en base Atlas (le reçu du matin remonte bien avec la requête corrigée, sans filtre caissier).

## 2026-09-18 — Diagnostic médecins, convention chiffres à droite, Messagerie WA super-admin, titre Caisse
Statut: Corrigée / Implémentée
- **"Aucun médecin" en Rendez-vous** : vérifié directement en base Atlas — les 4 médecins existent, actifs, bon cabinet ; logique backend saine. Cause concrète trouvée et corrigée : le compte de démo `dentiste1` n'était pas lié à sa fiche MédecinT (lien fait en base). Ajout d'un bouton "↻ Réessayer" au message d'erreur de Secrétariat, au cas où un réveil lent du serveur Render en soit la cause.
- **Convention retenue** : tous les nombres sont désormais toujours alignés à droite. Nouvelle classe CSS `.chiffre` (alignement + `tabular-nums`), appliquée aux colonnes numériques déjà en place (Caisse, Comptable, catalogue Admin, durée d'essai Plateforme) — à appliquer systématiquement à tout nouveau tableau.
- **Messagerie WA réservée au super-admin** : onglet "Messagerie WA" retiré de l'Administration de cabinet (frontend). Côté backend, la route `GET /messagerie/configuration` ne renvoie plus qu'un statut actif/inactif (aucune donnée sensible), `PUT`/`DELETE` supprimées (405). La configuration réelle reste exclusivement dans `/plateforme` → "📡 Communication" (super-admin). Testé bout en bout.
- **Titre Caisse** : "Caisse" → "Caisse de [nom complet du caissier connecté]".

## 2026-09-18 — Comptable/Administrateur : tableau de bord des encaissements enrichi
Statut: Implémentée
§ demande utilisateur : "Les utilisateurs avec rôle 'Administrateur' et 'Comptable' peuvent voir tous les reçus des caissiers dans l'Historique et disposer d'une liste déroulante pour filtrer les caissiers de la période. Sélecteur de période en haut de la section initialisé à la date du jour."
- Le tableau de bord Comptable (déjà accessible à l'Administrateur, qui a par construction tous les droits) affichait déjà tous les reçus de tous les caissiers — la case manquante était l'ergonomie du filtrage.
- **Sélecteur de période** : initialisé à la date du jour (Du/Au), modifiable librement vers des dates antérieures.
- **Filtre caissier** : passé d'un champ texte libre (login à deviner) à une **liste déroulante** peuplée par le serveur avec les noms complets des caissiers ayant émis au moins un reçu sur la période choisie — recalculée à chaque changement de date, et qui reste TOUJOURS complète même quand un caissier est déjà sélectionné (pour pouvoir changer de sélection sans devoir d'abord revenir à "Tous").
- Testé bout en bout : liste des caissiers correcte sur une période, filtre appliqué sans réduire la liste déroulante elle-même, résolution des noms complets.

## 2026-09-20 — Numérotation revue (reçus/patients/RDV), duplication sécurisée, identité complète, RAP visible
Statut: Implémentée
- **Numérotation redessinée** : reçus au format `R-{année}{n° ordre 5 chiffres}` (ex: "R-202600042"), sans code cabinet dans la référence visible (l'unicité en base reste garantie par le couple référence+cabinet_code). Patients et rendez-vous au format `{code cabinet}{année}{n° ordre 4 chiffres}` (ex: "000120260152"). Séquences propres à chaque cabinet ET à l'année en cours, repartent de 1 chaque nouvelle année. Testé bout en bout (séquences indépendantes par cabinet confirmées).
- **Duplication de reçu sécurisée** : un reçu dupliqué ne porte plus AUCUNE information de paiement (Réglé=0, MontantRéglé=0, redevient une Proforma). Tant qu'il n'est pas intégralement payé, sa consultation/impression est bloquée (409) — seul l'encaissement est possible ("💰 Encaisser" remplace "👁 Consulter" dans l'historique). Une fois payé, la consultation redevient disponible normalement. Testé bout en bout (cycle complet dupliquer → blocage → encaisser → déblocage).
- **Identité complète du patient partout** : "Nom Prénoms (ID)" — sur le reçu PDF, le rapport dentiste, l'ordonnance, l'état de caisse, et les deux tableaux d'historique (Caisse et Comptable) — pour éviter toute confusion entre homonymes. L'ID est figé sur le reçu au moment de la vente (`identite_recu.id_patient`), donc jamais affecté par une modification ultérieure de la fiche patient. Nouveau module partagé `app/utils/formatage.py`. Aperçu visuel du reçu vérifié.
- **RAP (Reste à Payer)** ajouté comme colonne dans l'historique Caisse ET le tableau de bord Comptable (+ export Excel), calculé côté serveur (Montant − MontantRéglé), aligné à droite.

## 2026-09-20 — Historique des reçus (Caisse) : sélecteur de période + actualisation manuelle
Statut: Implémentée
§ demande utilisateur : "Après avoir changé la période dans l'historique des reçus, permettre d'actualiser manuellement sur la période est validé ou présenter un bouton 'actualiser période'."
- Le panneau "Historique des reçus" de la Caisse (auparavant limité au jour même, sans sélecteur) dispose maintenant d'une période Du/Au, initialisée à aujourd'hui.
- Changer les dates ne déclenche PAS de rechargement à chaque frappe (une saisie de date se fait en plusieurs étapes) — un bouton **"🔄 Actualiser la période"** explicite déclenche la requête, avec un indicateur visuel ("●" + message orange "Période modifiée — cliquez pour appliquer") tant que la période affichée ne correspond pas à ce qui est sélectionné.

## 2026-09-20 — Test API VIDAL (limitation d'environnement) + réinitialisation de mot de passe utilisateur
Statut: Correctif backend en attente de votre confirmation / Fonctionnalité implémentée

**Sur le test de l'API VIDAL** : ni `api.vidal.fr` ni même le backend déployé (`onrender.com`) ne sont accessibles depuis ce bac à sable (restriction réseau de l'environnement de développement, pas de votre configuration) — impossible de tester moi-même en conditions réelles. J'ai vérifié que la requête atteint bien un pare-feu (pas une vraie erreur VIDAL) pour confirmer cette limite avant de le signaler. **Action requise de votre part** : testez une recherche (ex: "Doliprane") sur la page "Fiche Produit VIDAL" et dites-moi si ça fonctionne — je retirerai alors les mentions "non testé" des interfaces concernées (Posologie reste marquée "expérimentale" quoi qu'il arrive, car cet endpoit VIDAL précis n'a jamais été validé même dans le portail de référence).

**Réinitialisation de mot de passe (Administration → Utilisateurs)** : la route backend existait déjà mais n'était jamais utilisée côté interface — corrigé. Nouveau bouton "🔑 Mot de passe" par compte, ouvrant un champ dédié (afficher/masquer, génération aléatoire en un clic, minimum 6 caractères) séparé du formulaire de modification nom/rôle. Testé bout en bout : ancien mot de passe rejeté après changement, nouveau accepté, isolation multi-cabinets vérifiée (404 sur un login d'un autre cabinet).

## 2026-09-20 — VIDAL confirmé fonctionnel + documents HTML intégrés à la page
Statut: Confirmée / Corrigée
- **Recherche VIDAL confirmée fonctionnelle** par l'utilisateur (test réel : "Doliprane" → DOLIPRANE 1000 mg gél, équivalents, voies d'administration, documents). Vérification faite : aucune mention "non testé" ne figurait dans l'interface pour la recherche/fiche produit/équivalents — seule la page Posologie porte un avertissement, volontairement conservé car il concerne un endpoint VIDAL différent (`/posology-descriptors`), jamais validé même dans le portail de référence, indépendamment du fait que la connexion VIDAL elle-même fonctionne.
- **Documents HTML VIDAL intégrés à la page** (§ demande utilisateur : "L'impression de documents ne doit pas se faire dans une page externe") : un document "VIDAL (intégré)" ouvrait auparavant un nouvel onglet pointant directement vers vidal.fr. Remplacé par une nouvelle visionneuse intégrée (`components/VisionneuseDocumentVidal.jsx`) — le HTML est récupéré via notre propre proxy authentifié (même origine, contourne le CORS VIDAL), affiché dans un `<iframe>` sandboxé (bon rendu, styles VIDAL isolés du reste de l'app), avec un bouton "🖨 Imprimer" qui déclenche l'impression du contenu sans quitter l'application. Les documents PDF restent ouverts par le visualiseur natif du navigateur (déjà satisfaisant, pas de navigation vers un site externe non plus). Rendu vérifié visuellement (structure modale + iframe confirmée correcte).

## 2026-09-20 — Reçus en A5, date dans l'historique, correctif numérotation dupliquée, encaissement avec détail obligatoire
Statut: Implémentée / Corrigée
- **Format A5** : le reçu de caisse s'imprime désormais en A5 (au lieu d'A4) — toutes les largeurs de tableaux (en-tête, bloc montant/QR, prestations) recalculées au prorata pour tenir dans la largeur utile d'A5. Aperçu visuel vérifié, rien ne déborde.
- **Date dans l'historique Caisse** : la colonne "Heure" (qui n'affichait que l'heure) devient "Date" et affiche désormais date + heure — nécessaire depuis l'ajout du sélecteur de période (qui peut couvrir plusieurs jours).
- **Bug de numérotation "R-202600004" dupliquée — cause trouvée et corrigée** : le compteur de reçus au format année (introduit précédemment) avait redémarré à 1 sans tenir compte de 4 reçus légataires déjà présents en base sous ce même format (créés avant l'introduction du compteur dédié), provoquant une collision. Corrigé en base (référence du duplicata concerné renommée, compteur resynchronisé) ET dans le code : `prochain_numero_recu` vérifie maintenant que chaque référence générée est réellement libre avant de la retourner, et saute automatiquement au numéro suivant en cas de collision — ce type de bug ne peut plus se reproduire, même dans un scénario similaire à l'avenir. Testé en reproduisant exactement le bug d'origine (4 reçus légataires + compteur à 0) : la 5ᵉ référence est correctement générée sans collision.
- **Encaissement d'un reçu avec RAP** (§ demande utilisateur : "On ne peut faire un encaissement sur une facture avec RAP sans l'ouvrir et compléter le montant à payer") : fini l'encaissement en un clic. Nouvelle route `GET /caisse/ventes/{référence}` (détail complet) et nouvelle modale `ModaleEncaissement.jsx` — affiche les lignes, le montant total, le déjà réglé et le reste à payer, avec un champ de montant modifiable (encaissement partiel/échelonné possible) et le mode de règlement. La route `POST /encaisser` accepte désormais un montant partiel, cumulé sur les encaissements précédents ; le reçu reste "Proforma" tant qu'il n'est pas intégralement réglé. Bouton "💰 Encaisser" étendu à TOUT reçu avec RAP (pas seulement les duplicatas). Testé bout en bout : encaissement partiel → reste Proforma → dépassement refusé → solde → devient un vrai Reçu → re-encaissement refusé.

## 2026-09-20 — Modification de reçu (identité/assurance/actes) réutilisant "Nouveau reçu" + monnaie à rendre
Statut: Implémentée
§ demande utilisateur : "Il est plus simple [...] d'utiliser la page de création de 'Nouveaux reçus' mais en modification [...] identité du Patient mal orthographiée, rattachement à une Assurance, dents affectées/liste des actes. On garde la modale [d'encaissement] mais on pourra l'ouvrir depuis l'historique par un bouton 'Compléter Paiement'. Avant de confirmer le paiement afficher [...] la monnaie à rendre."

**Modification de reçu** (bouton "✏️ Modifier", réservé aux reçus sur lesquels rien n'a encore été réglé) :
- Nouvelle route `PUT /caisse/ventes/{référence}` — recalcule le montant (repricing assurance inclus), remplace les lignes, corrige l'identité, et gère le rattachement à une assurance (annule proprement l'ancienne prise en charge — restitution de la consommation — avant d'en recréer une nouvelle si besoin). Refusée si un encaissement a déjà été enregistré (`MontantRéglé > 0`) — évite toute réconciliation hasardeuse après un paiement partiel.
- Le formulaire "Nouveau reçu" de la Caisse gagne un **mode édition** : charge le patient, l'identité, l'assurance et les lignes d'origine (éditables une à une, comme n'importe quelle ligne de panier), pré-colore le schéma dentaire avec les dents concernées (visuel + permet d'en ajouter d'autres), bannière orange explicite, boutons renommés en conséquence.
- Testé bout en bout : correction d'identité + ajout d'assurance avec recalcul et prise en charge créée, blocage confirmé après un encaissement partiel.

**Modale de paiement, renommée "Compléter Paiement"** :
- Bouton "💰 Encaisser" → "💰 Compléter Paiement" (libellé exact demandé), ouvrable depuis l'historique pour tout reçu avec RAP.
- Modes de règlement réellement configurés (Administration → Paiements), plus de liste figée — récupérés via `GET /types-paiement`, avec obligation de référence de transaction si paramétrée.
- **Monnaie à rendre toujours affichée** avant confirmation : nouveau champ "Montant reçu du patient" (peut excéder le montant réellement crédité sur ce reçu — cas d'un billet plus gros), calcul automatique de la monnaie à rendre, bloc visuellement distinct.

**Clarification "Thèmes"** : les deux captures jointes (kits UI génériques, boutons/formulaires stylés) confirmées comme référence de ce qu'un "thème" doit représenter pour les prochains thèmes créés par le super-admin — notée pour référence future, le mécanisme actuel (couleurs + mode clair/sombre) reste en place tel que déjà implémenté et validé.

## 2026-09-20 — Historique des reçus : tri décroissant, filtre type de paiement, colonne et totaux
Statut: Implémentée
- **Tri par Date/Heure décroissante** : corrigé — un `.reverse()` côté frontend inversait par erreur le tri déjà décroissant renvoyé par le serveur (le plus récent apparaissait en dernier). Testé bout en bout.
- **Filtre par type de paiement** : nouvelle liste déroulante en haut du tableau (alimentée par les modes réellement configurés, Administration → Paiements), appliquée côté serveur.
- **Colonne "Type de paiement"** ajoutée au tableau.
- **Totaux des données affichées** (montant et RAP) en pied de tableau, hors reçus annulés — cohérent avec le traitement déjà appliqué à l'état de caisse.

## 2026-09-20 — Correctif bloquant : paiement partiel refusé à tort ("montant reçu inférieur au montant encaissé")
Statut: Corrigée
- **Bug confirmé** : réduire "Montant à encaisser maintenant" pour un paiement partiel (ex: RAP 30 000 → règlement de 10 000) laissait "Montant reçu du patient" figé sur l'ancienne valeur (30 000), ce qui semblait alors exiger un montant reçu supérieur — le paiement partiel était refusé avec "Le montant reçu du patient ne peut pas être inférieur au montant encaissé."
- **Cause** : la logique de synchronisation entre les deux champs reposait sur une comparaison de chaînes fragile, en plus d'une règle qui empêchait "Montant reçu" de redescendre — utile pour protéger un montant déjà saisi manuellement (gros billet), mais qui bloquait justement le cas d'un paiement partiel à la baisse.
- **Corrigé** : "Montant reçu du patient" suit désormais automatiquement "Montant à encaisser" (à la hausse ET à la baisse) tant que le caissier ne l'a pas lui-même modifié manuellement ; dès qu'il le fait (cas d'un billet plus gros que le solde dû), le suivi automatique s'arrête pour ce reçu. Un garde-fou non bloquant a aussi été ajouté (correction silencieuse plutôt que refus en cas d'écart résiduel).
- Vérifié en simulant précisément le scénario rapporté (RAP 30 000 → 10 000 : accepté, 0 F de monnaie à rendre) ainsi que le paiement intégral et le cas du gros billet (monnaie à rendre correctement calculée).

## 2026-09-20 — Correctif bloquant : doublon d'acte en mode modification (ex. "APPLICATION DE FLUOR (13i)" x2)
Statut: Corrigée
- **Bug confirmé sur capture** : en modification d'un reçu, le schéma dentaire était pré-coloré (dent visuellement marquée) mais son état INTERNE de sélection par acte restait vide — le panneau "actes applicables" affichait toutes les cases décochées même pour une dent déjà concernée. Cocher un acte déjà présent sur le reçu l'AJOUTAIT donc en double au panier plutôt que de simplement le confirmer/refléter.
- **Corrigé** — § demande utilisateur : "charger dans la liste à côté du schéma tous les actes déjà concernés qui sont dans le détail de chaque reçu."
  - `SchemaDentaire.jsx` accepte une nouvelle prop `actesInitiaux` (les actes RÉELS déjà sélectionnés, par dent) — pas seulement une couleur. Les cases du panneau reflètent maintenant correctement l'état déjà coché, et cliquer dessus RETIRE l'acte (comportement attendu) au lieu de le dupliquer.
  - `Caisse.jsx` (mode édition) construit cette liste depuis les lignes du reçu déjà rattachées à une dent ; les lignes SANS dent (consultations générales...) restent dans le panier "saisie rapide" classique — plus aucune ligne n'existe désormais à deux endroits différents en même temps.
  - Correctif complémentaire trouvé en cours de route : si l'utilisateur n'interagissait pas du tout avec le schéma avant d'enregistrer, les actes préchargés restaient uniquement dans l'état interne du composant et n'atteignaient jamais le panier du parent (perte silencieuse) — un effet de montage les signale désormais explicitement dès le chargement.
- Vérifié en simulant précisément le scénario du bug (dent 13, "APPLICATION DE FLUOR") : la case apparaît bien déjà cochée après chargement, et cliquer dessus retire l'acte au lieu de le dupliquer.

## 2026-09-20 — Règle assurance : numéro de bon + souscripteur obligatoires, référentiel dynamique, correctif chargement en édition
Statut: Implémentée
§ demande utilisateur : "pour pouvoir attacher une prise en charge il faut renseigner un numéro de bon (obligatoire, toujours numérique) et faire référence au souscripteur [...] la liste des souscripteurs doit être dynamique [...] si un nouveau souscripteur est saisi et n'est pas en base, demander s'il faut le mémoriser."

- **Nouveau référentiel Souscripteur** (personne physique ou morale ayant signé la convention avec l'assureur — jamais le patient) : `GET /souscripteurs?q=...` (recherche dynamique), `POST /souscripteurs` (création idempotente, appelée uniquement après confirmation explicite de l'utilisateur — jamais automatiquement).
- **Numéro de bon (toujours numérique) et souscripteur obligatoires** dès qu'une prise en charge est attachée à un reçu — validés côté serveur (création ET modification), rejet explicite si absents, rejet automatique si le numéro n'est pas numérique. Stockés sur la `PriseEnCharge` et sur le reçu (`RéfBon`, `souscripteur`).
- **Changer d'assurance réinitialise numéro de bon et souscripteur** (spécifiques à l'assurance précédente) — comportement du sélecteur corrigé en conséquence.
- **Nouveau composant `ChampSouscripteur.jsx`** : autocomplétion au fil de la saisie, et à la validation (perte de focus), propose "Mémoriser ce souscripteur ?" si le nom ne correspond à aucun souscripteur déjà connu pour le cabinet.
- **Bug corrigé** ("en modification la liste de toutes les assurances n'est pas chargée") : cause trouvée — `rechargerAssurancesPatient()` écrasait systématiquement la sélection avec "la première assurance du patient", même quand la bonne assurance venait d'être chargée pour la modification. Corrigé pour préserver une sélection déjà valide ; chargement des deux listes (assurances du patient + catalogue complet) rendu explicite et direct dans le chargement du mode édition, plutôt que de compter uniquement sur un effet réactif.
- Testé bout en bout : validations (bon manquant, bon non numérique, souscripteur manquant), stockage et relecture, et le cycle complet changement d'assurance (l'ancienne prise en charge est proprement annulée — consommation restituée — avant que la nouvelle soit créée avec son propre bon/souscripteur).

## 2026-09-20 — Deux nouveaux thèmes ajoutés au catalogue plateforme (Corail Dynamique, Turquoise SAWALI)
Statut: Implémentée
§ demande utilisateur : implémenter les 2 thèmes envoyés précédemment (captures de référence), y compris les listes déroulantes.

- **Couleurs extraites précisément** des deux images de référence par échantillonnage de pixels (palette dominante + couleurs de contour), puis ajustées pour un contraste texte lisible (ratio ≥3:1 vérifié — les tons pastel bruts des captures sont trop clairs pour du texte blanc sur bouton, une version plus soutenue de chaque teinte a donc été retenue tout en restant fidèle à l'esprit de la référence) :
  - **Corail Dynamique** : primaire `#E74D43`, primaire claire `#EA5F55`, accent `#409BEC` (le bleu de la 1ère capture, repris comme couleur d'accent/glow).
  - **Turquoise SAWALI** : primaire `#0E8A96` (version soutenue du cyan de la 2ᵉ capture, le ton brut `#70E9F4` étant trop clair pour porter du texte), primaire claire `#109FAE`, accent `#70E9F4` (le cyan brut, parfait comme couleur de glow/surbrillance).
- **Listes déroulantes déjà couvertes** : `<select>` utilise la même classe `.champ-saisie` que les champs texte dans toute l'application — elles héritent donc automatiquement des couleurs du thème (bordure au focus notamment) sans code supplémentaire.
- Les deux thèmes sont **directement insérés dans le catalogue réel** (collection ThemePlateforme, base de production) — immédiatement disponibles dans le sélecteur de chaque cabinet (Administration → Cabinet), aucune action supplémentaire nécessaire.
- **Aperçu visuel généré et vérifié** sur les vrais composants de l'application (bouton primaire, bouton secondaire, liste déroulante, champ de recherche, badge) — rendu propre et lisible pour les deux thèmes.

## 2026-09-20 — Système de thèmes étendu aux STYLES (pas seulement les couleurs)
Statut: Implémentée
§ demande utilisateur : "Je ne veux pas seulement les couleurs mais les styles aussi."

- **`ThemePlateforme` étendu** avec 5 nouveaux champs (optionnels, valeurs par défaut = apparence actuelle inchangée pour tout thème existant) : `rayon_boutons`, `rayon_champs` (champs de saisie ET listes déroulantes, même classe), `rayon_cartes`, `epaisseur_bordure`, `ombre_cartes`.
- **CSS global** : les boutons et champs utilisaient jusqu'ici un `border-radius`/`border` figés — remplacés par de nouvelles variables (`--sawali-rayon-bouton`, `--sawali-rayon-champ`, `--sawali-epaisseur-bordure`), surchargées par `appliquerTheme.js` depuis le thème résolu du cabinet.
- **Les deux thèmes mis à jour avec des formes fidèles aux captures** (pas seulement recolorés) :
  - **Corail Dynamique** : boutons en **pilule complète** (`999px`), champs moyennement arrondis (`10px`), cartes `14px`, bordures `2px` — reproduit exactement la forme des boutons de la 1ère capture (pilule), pas seulement sa couleur.
  - **Turquoise SAWALI** : coins nettement plus carrés partout (`8px`), bordures plus épaisses (`2.5px`), ombre aplatie (`0 1px 3px`) — reproduit le style "flat design à traits épais" de la 2ᵉ capture (icônes en ligne, coins peu arrondis), pas seulement sa teinte cyan.
- Aperçu visuel régénéré et vérifié sur les vrais composants (bouton primaire/secondaire, liste déroulante, badge) — la différence de FORME entre les deux thèmes est maintenant immédiatement visible, pas seulement la couleur.

## 2026-09-20 — Correctif bloquant : le thème (et toute modification de la fiche cabinet) ne s'enregistrait pas
Statut: Corrigée
- **Bug confirmé en base réelle** : reproduit avec la commande MongoDB exacte contre Atlas — `Performing an update on the path '_id' would modify the immutable field '_id'`.
- **Cause** : `GET /cabinet` renvoyait le document brut incluant `_id` (jamais retiré) ; la page Administration → Cabinet renvoie ensuite cet objet TEL QUEL à `PUT /cabinet` lors de l'enregistrement. MongoDB refuse catégoriquement tout `$set` touchant `_id` ("champ immuable") — ce qui faisait échouer l'écriture **en entier**, y compris le changement de thème, sans qu'aucune erreur ne soit visible côté interface (la sauvegarde échouait silencieusement, aucun `try/catch` ne l'interceptait).
- **Corrigé à deux niveaux** : `GET /cabinet` ne renvoie plus jamais `_id` (ni `theme_resolu`, un champ dérivé qui ne doit jamais être renvoyé à l'enregistrement) ; `PUT /cabinet` les exclut aussi explicitement par sécurité, même si un ancien onglet déjà chargé les renvoyait encore. Un message d'erreur visible (rouge) a été ajouté côté interface en cas d'échec futur, pour qu'un tel problème ne reste plus jamais silencieux.
- Testé bout en bout en reproduisant exactement le scénario rapporté (payload avec `_id` inclus, comme l'aurait envoyé un onglet déjà ouvert avant ce correctif) : l'enregistrement réussit désormais et le thème est effectivement persisté.

## 2026-09-20 — Correctif : intitulé d'acte long écrasait la colonne Qté sur le reçu PDF
Statut: Corrigée
- **Cause** : la cellule "Description" du tableau des prestations utilisait une chaîne de texte brute — dans un tableau ReportLab, une chaîne ne se retourne JAMAIS à la ligne automatiquement, elle dépasse silencieusement dans la colonne suivante quand elle est trop longue (ex: "CONSULTATION DE SUIVI / CONTRÔLE POST-OPÉRATOIRE").
- **Corrigé** : la description est désormais un `Paragraph` (au lieu d'une chaîne brute), qui se retourne correctement sur plusieurs lignes selon la largeur de la colonne — la hauteur de la ligne s'ajuste automatiquement, sans jamais chevaucher "Qté"/"Prix Unit.".
- Aperçu visuel généré et vérifié avec l'intitulé exact signalé — retour à la ligne propre sur deux lignes, colonnes suivantes correctement alignées.

## 2026-09-20 — Correctif : un règlement partiel réglait totalement le reçu
Statut: Corrigée
- **Cause trouvée** : la logique d'encaissement PARTIEL sur un reçu déjà existant ("Compléter Paiement") était déjà correcte et testée. Le vrai trou : à la CRÉATION d'un reçu, il n'existait que deux choix binaires — "Générer proforma" (0 réglé) ou "Encaisser et générer le reçu" (marquait TOUJOURS le montant total comme réglé, sans aucun moyen de préciser qu'une PARTIE seulement était payée immédiatement).
- **Corrigé** : nouveau champ "Montant réglé maintenant (si partiel)" dans le formulaire de reçu — laissé vide, le bouton "Encaisser..." règle le total comme avant (rétrocompatible) ; renseigné avec un montant inférieur au total, le reçu créé est correctement marqué PARTIELLEMENT réglé (Proforma avec un `MontantRéglé` > 0, RAP calculé en conséquence, complétable plus tard via "Compléter Paiement" dans l'historique). Le statut réel (Réglé/type_document) est désormais TOUJOURS dérivé du montant effectivement réglé, jamais du simple bouton cliqué.
- Testé bout en bout : sans le champ (comportement historique inchangé), avec un montant partiel (Proforma avec RAP correct), complétude ultérieure du solde, montant égal au total (traité comme intégral), et le champ correctement ignoré si "Proforma" est choisi.

## 2026-09-20 — N° de dossier sur le reçu, filtre/tri historique dossiers, surbrillance globale des tableaux, boutons Enregistrer/Encaisser distincts
Statut: Implémentée

- **N° de dossier absent du reçu** : le champ existait déjà côté backend/PDF mais n'était jamais renseigné par la Caisse — aucun moyen de le choisir. Nouveau sélecteur "Dossier d'examen concerné" dans le formulaire (présélectionne automatiquement le plus récent, modifiable), pris en compte en création ET en modification. Testé bout en bout.
- **Historique des dossiers (Dentiste) par date décroissante** : déjà correct côté serveur (vérifié) — un filtre était en revanche totalement absent. Ajouté : champ de recherche (n° dossier, date, conclusion) qui réduit la liste déjà triée sans jamais la retrier.
- **Surbrillance globale (survol + ligne sélectionnée)** : le survol s'applique désormais automatiquement à **tous** les tableaux de la plateforme (renforcé, une seule règle CSS globale). Nouvelle classe réutilisable `.ligne-selectionnee` (couleur nettement distincte du survol, avec sa propre teinte de survol) — appliquée concrètement sur l'historique des dossiers du Dentiste (le dernier dossier ouvert reste visuellement marqué en revenant à la liste), disponible pour tout autre tableau de l'app.
- **Boutons "Enregistrer" et "Encaisser" distincts** : l'ancien libellé composé ("Enregistrer et encaisser") est remplacé par deux actions clairement séparées — "📝 Enregistrer" (toujours en proforma) et "💰 Encaisser" (règle maintenant, montant partiel affiché dynamiquement le cas échéant) — cohérent en création comme en modification.

## 2026-09-20 — Correctif majeur : réessai réseau automatique rejouait les paiements/actions non idempotentes (cause probable de plusieurs bugs précédents)
Statut: Corrigée — root cause probable identifiée
- **Bug rapporté** : un règlement partiel de 10 000 F sur R-202600006 (RAP 30 000) a abouti à un reçu intégralement réglé (30 000) au lieu d'un RAP de 20 000. Donnée corrigée manuellement en base (MontantRéglé 10 000, Proforma).
- **Cause racine trouvée** : le client HTTP (`api.js`) réessaie automatiquement TOUTE requête en cas de coupure réseau ou de 502/503/504 (le service Render gratuit met du temps à se réveiller après inactivité) — mécanisme sûr pour une lecture (GET), mais dangereux pour une action qui MODIFIE des données de façon cumulative comme "encaisser un montant" : si la réponse du serveur est retardée/perdue APRÈS que celui-ci a déjà traité la requête (cas typique du réveil Render), le réessai rejouait l'encaissement une deuxième, voire une troisième fois — 10 000 + 10 000 + 10 000 = 30 000, correspondant exactement au comportement observé.
- **Corrigé** : seules les requêtes de lecture (GET) sont désormais rejouées automatiquement ; toute action qui modifie des données (POST/PUT/DELETE — encaissement, duplication, création/modification de reçu, etc.) remonte l'erreur telle quelle en cas d'échec, sans jamais être rejouée silencieusement — à l'utilisateur de relancer consciemment l'action si besoin.
- **Explique très probablement aussi** le bug de numérotation dupliquée corrigé le 20 septembre (le compteur avait avancé de plusieurs crans sans explication claire) — la duplication de reçu (`POST /dupliquer`) n'était pas non plus idempotente et pouvait être rejouée par ce même mécanisme.

## 2026-09-20 — Correctif : montant en surbrillance du reçu mal calculé pour un règlement partiel
Statut: Corrigée
- **Bug confirmé** : à l'ouverture (simple consultation) d'un reçu, le grand montant en surbrillance ("24 000 FCFA") ne tenait compte QUE de la prise en charge assurance — jamais d'un règlement partiel. Un reçu partiellement réglé (ex: R-202600006 — total 30 000, déjà réglé 10 000) affichait le montant TOTAL en gros, sans aucune indication qu'il restait un reste à payer.
- **Corrigé** : pour un reçu partiellement réglé (sans assurance), le montant mis en avant est désormais le **reste à payer** (avec la mention explicite "(reste à payer)"), accompagné d'une ligne de détail "Total : X — Déjà réglé : Y" pour ne jamais laisser croire que le gros montant est le total. La phrase "Nous avons reçu la somme de..." a aussi été corrigée pour toujours refléter le montant RÉELLEMENT encaissé (et non le reste à payer) — les deux informations étaient auparavant mélangées.
- Vérifié visuellement en reproduisant exactement R-202600006 (30 000 / 10 000 réglé / 20 000 RAP) : "20 000 FCFA (reste à payer)", "Total : 30 000 FCFA — Déjà réglé : 10 000 FCFA", et "Nous avons reçu... DIX MILLE FCFA" — cohérent de bout en bout.
