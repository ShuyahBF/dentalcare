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
