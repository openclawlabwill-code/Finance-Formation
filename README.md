# FinanceForma — aide à l'identification des financements de formation

Application web **locale** pour conseillers en financement de la formation professionnelle.
État actuel : **étapes (a) à (f)** — 24 fiches nationales (sources officielles consultées le 07/10/2026), socle serveur, schémas, régions (Pays de la Loire prioritaire), arbre de décision, mind map interactive, moteur d'éligibilité, filtre régional, synthèse d'étude exportable, historique local, bandeau d'actualités, API de mise à jour pour un agent externe et page d'administration.
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

## Mise à jour par un agent externe (Hermes)

1. Créer `.env` (copie de `.env.example`) et y mettre un `API_TOKEN` (voir la commande indiquée dans le fichier). Sans token, l'API de mise à jour est désactivée.
2. L'agent suit `AGENT_MAJ.md` et dépose des propositions : `POST /api/maj/proposition` avec `Authorization: Bearer <API_TOKEN>`. Région et sources officielles sont obligatoires ; une source régionale ne modifie jamais le cœur d'une fiche nationale.
3. Le conseiller relit chaque proposition dans http://localhost:3000/admin (diff avant/après, sources avec extraits) puis l'accepte ou la refuse. Avant chaque application, la version précédente est sauvegardée dans `data/backups/` ; tout est inscrit dans `data/journal-maj.log`. Onglets : propositions, couverture régionale (matrice, taux, fiches de plus de 90 jours), journal et restauration d'une sauvegarde.
4. `AUTO_PUBLISH=true` publie sans relecture humaine (déconseillé) ; les mêmes règles de validation s'appliquent.

Les actualités du bandeau (20 dernières, nationales + région choisie) arrivent par le même circuit (action `actualite`) ; les plus anciennes sont archivées dans `data/actualites-archive.json`.

Limite connue : la page `/admin` n'a pas de mot de passe. Elle n'est accessible que depuis ce poste (le serveur n'écoute que sur 127.0.0.1) et les décisions exigent une requête de navigateur (en-tête Origin) ; un programme local malveillant pourrait la forger. Ne pas exposer le serveur sur le réseau.

*(README complet — mise à jour des données, ajout d'un dispositif ou d'une région, RGPD — à l'étape finale.)*
