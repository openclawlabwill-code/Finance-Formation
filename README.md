# FinanceForma — aide à l'identification des financements de formation

Application web **locale** pour conseillers en financement de la formation professionnelle.
État actuel : **étapes (a), (b) et (c)** — 24 fiches nationales (sources officielles consultées le 07/10/2026), socle serveur, schémas, régions (Pays de la Loire prioritaire), arbre de décision, mind map interactive, moteur d'éligibilité, filtre régional.
OPCO prioritaires du conseiller : Mobilités, EP (Entreprises de Proximité), AKTO.

## Lancement

Prérequis : Node.js 20 ou plus récent. **Aucune dépendance à installer** (zéro dépendance externe).

```bash
npm start          # puis ouvrir http://localhost:3000
npm test           # tests automatiques
npm run valider    # valide tous les fichiers de données
```

Configuration facultative : copier `.env.example` en `.env` (port, région par défaut, token de l'API de mise à jour).

## Structure

- `server/` : serveur HTTP natif, validateur JSON Schema, accès aux données, logique régionale
- `schemas/` : schémas JSON (dispositif, arbre, attributs, régions, actualités, propositions, études, sources)
- `data/` : données (régions, attributs, arbre de décision, dispositifs, actualités, sauvegardes, journal)
- `config/sources.json` : sources officielles par région (à compléter par vérification)
- `public/` : interface (`css/theme.css` contient toutes les couleurs)
- `tests/` : tests automatiques

## Principes de fiabilité

Aucune URL, aucun montant ni aucune condition n'est écrit de mémoire : tout ajout exige une source sur un domaine officiel
(liste `domaines_autorises` dans `config/sources.json`). Une région sans information vérifiée affiche
« Déclinaison régionale non documentée : contacter … » au lieu de reprendre la règle nationale.

*(README complet — mise à jour des données, ajout d'un dispositif ou d'une région, RGPD — à l'étape finale.)*
