# SAWALI DentalCare

Plateforme SaaS de gestion de cabinet dentaire — SAWALI SMART SYSTEMS (Ouagadougou, Burkina Faso).

## Architecture

- **Backend** : Python / FastAPI + MongoDB Atlas (Motor), authentification JWT + bcrypt, 5 rôles
  (Caissier, Secrétariat Cabinet, Dentiste, Comptable, Administrateur), génération PDF (ReportLab),
  liens WhatsApp.
- **Frontend** : React / Vite, schéma dentaire interactif (SVG), sidebar avec fauteuil animé.

## Démarrage rapide

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env   # puis renseigner MONGODB_URI
python -m scripts.seed_donnees_initiales   # catalogue, cabinet, comptes de démo
uvicorn app.main:app --reload --port 8000
```

Documentation interactive de l'API : http://localhost:8000/docs

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Application : http://localhost:3000

### Comptes de démonstration (créés par le script de seed)

| Rôle | Login | Mot de passe |
|---|---|---|
| Administrateur | `admin` | `Admin2026!` |
| Caissier | `caissier1` | `Caisse2026!` |
| Secrétariat Cabinet | `secretariat1` | `Secret2026!` |
| Dentiste | `dentiste1` | `Dent2026!` |
| Comptable | `comptable1` | `Compt2026!` |

**À changer immédiatement en production**, depuis le module Administrateur.

## Structure des tables

Les noms de collections MongoDB reprennent ceux du système legacy Biolog/Windev :
`Patient`, `Dossier_Examen`, `ProduitClinique`, `VenteClinique`, `A_Acheté`, `MédecinT`,
`UtilisateurBlg`, plus les nouvelles tables `Cabinet`, `Assurance`, `AssurancePatient`,
`PriseEnCharge`, `RendezVous`, `Rappel`.
