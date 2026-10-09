# FinanceForma — aide à l'identification des financements de formation

Application web **locale** pour un conseiller en financement de la formation professionnelle, dédiée à la région **Pays de la Loire**.
Elle guide l'étude d'une situation (arbre de décision en mind map), affiche les dispositifs possibles avec leurs sources officielles et leurs dates de vérification, produit une synthèse exportable et garde un historique local sans donnée personnelle.
OPCO prioritaires : Mobilités, EP (Entreprises de Proximité), AKTO.

Toutes les informations sont **indicatives** : chaque fiche rappelle « Information indicative. Vérifier auprès de l'organisme avant toute démarche. »

## Installation et lancement

Prérequis : **Node.js 20 ou plus récent** (https://nodejs.org, version LTS). Aucune dépendance à installer : pas de `npm install`.

- **Windows** : décompresser le dossier, puis double-cliquer sur `demarrer.bat`. Le navigateur s’ouvre sur http://127.0.0.1:3000 (ou le port libre suivant si 3000 est pris ; l’adresse exacte est affichée dans la fenêtre). Laisser la fenêtre noire ouverte ; la fermer arrête le serveur.
- **Mac / Linux** : dans un terminal, dans le dossier : `npm start`, puis ouvrir http://127.0.0.1:3000.

Autres commandes : `npm test` (tests automatiques), `npm run valider` (valide tous les fichiers de données), `npm run verifier-liens` (teste les URL des sources), `npm run couverture` (régénère `docs/COUVERTURE_PAYS_DE_LA_LOIRE.md`).

Configuration facultative : copier `.env.example` en `.env` (port, région par défaut, jeton de l'API de mise à jour, publication automatique).

## Utilisation

1. **Nouvelle étude** : région (Pays de la Loire par défaut), département facultatif, puis les questions de l'arbre. La carte et la liste des résultats se mettent à jour à chaque réponse ; on peut modifier une réponse précédente depuis le fil d'Ariane.
2. **Fiche** : clic sur un dispositif. Sources officielles, date de dernière vérification, alerte au-delà de 90 jours, mention « Déclinaison régionale non documentée : contacter … » quand rien n'est vérifié pour la région.
3. **Synthèse** : bouton « Générer la synthèse de l'étude ». Référence dossier anonyme et notes, puis « Enregistrer », « Imprimer / PDF » (mise en page d'impression du navigateur) ou « Exporter en Markdown ».
4. **Historique** : études enregistrées dans `data/etudes/` (ouvrir, reprendre, exporter, supprimer).
5. **Bandeau d'actualités** : les 20 dernières, nationales + Pays de la Loire. Un clic ouvre la fiche concernée.

## Mettre à jour les données

Les données sont des fichiers JSON dans `data/` (fiches dans `data/dispositifs/`) et `config/sources.json` (acteurs et sites officiels). Trois façons de les mettre à jour, la deuxième et la troisième passant par une **validation humaine** dans http://127.0.0.1:3000/admin :

1. **À la main** : modifier le JSON, puis `npm run valider`. Une fiche exige des sources sur les domaines officiels listés dans `config/sources.json` (`domaines_autorises`).
2. **Avec un assistant IA (Copilot ou autre), par fichier** : `/admin` → onglet « Pack pour assistant IA ». Télécharger le pack (un fichier JSON autoporteur : mode d'emploi, règles, données actuelles, liste de ce qui reste à documenter), le donner à l'assistant avec la consigne proposée, puis importer sa réponse (fichier ou texte collé). Les propositions arrivent dans la file de validation.
3. **Avec un agent externe (API)** : mettre un `API_TOKEN` dans `.env`. L'agent suit `AGENT_MAJ.md` et dépose ses propositions via `POST /api/maj/proposition` (`Authorization: Bearer <API_TOKEN>`).

Dans `/admin` : relire chaque proposition (tableau avant/après, sources avec extraits), l'accepter ou la refuser ; consulter la couverture régionale (matrice, taux, fiches de plus de 90 jours) ; consulter le journal ; restaurer une sauvegarde. Avant chaque application, la version précédente est sauvegardée dans `data/backups/` et l'opération est inscrite dans `data/journal-maj.log`. `AUTO_PUBLISH=true` supprime la relecture humaine (déconseillé) ; les mêmes contrôles s'appliquent.

Règles appliquées par le serveur à toute proposition (pack ou API) : région obligatoire, au moins une source officielle avec extrait, une source régionale ne modifie jamais le texte d'une fiche nationale (seulement sa spécificité régionale), aucun identifiant, historique ni date fixé par l'auteur, fiche obtenue valide au schéma. Une proposition invalide est refusée et inscrite au journal.

## Ajouter un dispositif

Créer `data/dispositifs/<id>.json` (id : minuscules, chiffres, tirets) en copiant une fiche existante, avec sources officielles et dates ; régler `criteres_eligibilite` pour que l'arbre le propose, puis `npm run valider` et `npm test`. Ou le faire proposer par l'assistant (action `creation`) et valider dans `/admin`.

## Données personnelles (RGPD)

Les études enregistrées ne contiennent ni nom, ni prénom, ni e-mail, ni téléphone, ni numéro de sécurité sociale : le serveur refuse ces éléments dans la référence dossier et les notes. Utiliser une référence anonyme. Aucune donnée n'est envoyée hors de ce poste (le serveur n'écoute que sur 127.0.0.1) ; les fichiers sont sous `data/etudes/` et peuvent être supprimés depuis l'Historique.
Attention : le pack pour assistant IA ne contient que des données publiques de dispositifs, jamais d'étude de candidat.

## Structure

- `server/` : serveur HTTP natif, validateur JSON Schema, accès aux données, logique régionale et d'éligibilité, mises à jour, pack IA
- `schemas/` : schémas JSON (dispositif, arbre, attributs, régions, actualités, propositions, études, sources)
- `data/` : régions, attributs, arbre de décision, dispositifs, actualités, sauvegardes, journal, études
- `config/sources.json` : acteurs et sites officiels par région, domaines autorisés
- `public/` : interface (`css/theme.css` contient toutes les couleurs)
- `docs/` : couverture Pays de la Loire (générée) et points à vérifier à la main
- `AGENT_MAJ.md` : instructions de l'agent externe ; `demarrer.bat` : lanceur Windows ; `tests/`

## Limites connues

- Application dédiée aux Pays de la Loire : les 17 autres régions existent dans les listes mais ne sont pas documentées (message « non documentée » affiché).
- Couverture régionale partielle (voir `docs/COUVERTURE_PAYS_DE_LA_LOIRE.md`) : plusieurs acteurs et déclinaisons restent à vérifier à la main (`docs/A_VERIFIER_52.md`).
- La région du lieu de travail est saisie et conservée dans l'étude mais n'influence pas encore l'évaluation.
- Formation initiale hors apprentissage non couverte.
- La carte s'organise de gauche à droite (pas de disposition centrée en étoile).
- Aucune dépendance externe : serveur Node natif, validateur JSON Schema et carte SVG écrits sur mesure (au lieu d'Express, Ajv et D3).
- `/admin` n'a pas de mot de passe : accessible depuis ce poste uniquement, les décisions exigent une requête de navigateur (en-tête Origin) qu'un programme local malveillant pourrait forger. Ne pas exposer le serveur sur un réseau.
- L'export PDF passe par l'impression du navigateur (pas de bibliothèque PDF).
- Les contrôles de liens (`npm run verifier-liens`) sont à lancer sur le poste de l'utilisateur.
- Testé sous Linux et macOS ; sous Windows, lancer `npm test` une première fois pour confirmer.
