# Couverture Pays de la Loire (52)

Généré le 2026-10-07 par `npm run couverture`. Ne pas modifier à la main.

- Acteurs régionaux documentés : 9/11 (82 %)
- Déclinaisons régionales documentées et vérifiées : 3/10 (30 %)
- Fiches non vérifiées depuis plus de 90 jours : 0
- Fiches au statut « à vérifier » : 3
- Site du Conseil régional renseigné : oui

## Acteurs régionaux

| Acteur | Documenté | Sources |
|---|---|---|
| conseil regional | oui | Région Pays de la Loire (Conseil régional) (2026-10-07) |
| transitions pro | oui | Transitions Pro Pays de la Loire (2026-10-07) |
| agefiph | oui | Agefiph Pays de la Loire (2026-10-07) |
| cap emploi | non | — |
| cma | oui | CMA Pays de la Loire (2026-10-07) |
| cariforef | oui | Cariforef Pays de la Loire (Carif-Oref) (2026-10-07) |
| france travail | oui | France Travail Pays de la Loire (2026-10-07) |
| missions locales | oui | Missions locales (présentation 1jeune1solution, ministère du Travail) (2026-10-07) |
| dreets | oui | DREETS Pays de la Loire (2026-10-07) |
| opco | oui | OPCO EP — délégation Pays de la Loire (2026-10-07) ; AKTO (contact national : pas de page régionale trouvée) (2026-10-07) |
| conseil departemental | non | — |

## Dispositifs

| Dispositif | Déclinaison requise | Documentée et vérifiée | Statut fiche |
|---|---|---|---|
| Action de formation préalable au recrutement | non | — | a_verifier |
| AGEFICE — formation des chefs d’entreprise commerçants, industriels et de services | non | — | actif |
| Aides de l’Agefiph pour la formation (personnes en situation de handicap) | oui | oui | modifie |
| Aide individuelle à la formation | oui | non | actif |
| Bilan de compétences | non | — | actif |
| Cap emploi (accompagnement des personnes en situation de handicap) | oui | non | actif |
| Conseil en évolution professionnelle | non | — | actif |
| Conseil de la formation (artisans) et accompagnement par les CMA | oui | non | a_verifier |
| Contrat d’apprentissage | non | — | actif |
| Contrat d’engagement jeune | oui | non | actif |
| Contrat de professionnalisation | non | — | actif |
| Abondements du CPF (employeur, France Travail, autres financeurs) | non | — | actif |
| Compte personnel de formation | non | — | actif |
| Démission-reconversion | oui | oui | modifie |
| FAFCEA — formation des chefs d’entreprise artisanale | non | — | a_verifier |
| FIF PL — formation des professionnels libéraux | non | — | actif |
| Financements des OPCO (opérateurs de compétences) | oui | non | modifie |
| Période de reconversion professionnelle (remplace la Pro-A depuis 2026) | non | — | actif |
| Plan de développement des compétences (initiative de l’employeur) | non | — | actif |
| Préparation opérationnelle à l’emploi (POEI et POEC) | oui | non | modifie |
| Programme régional de formation (formations financées par la Région) | oui | oui | modifie |
| Projet de transition professionnelle | oui | non | modifie |
| Rémunération pendant la formation d’un demandeur d’emploi (ARE-F, RFF, RFFT, RSFP) | non | — | modifie |
| Validation des acquis de l’expérience | non | — | actif |

## Points à vérifier à la main (relevé du 07/10/2026)

Ces points n'ont pas pu être confirmés depuis les sources officielles. Aucune information n'a été inventée pour les combler : l'application affiche « Déclinaison régionale non documentée : contacter … » ou « À vérifier localement ».

1. **Transitions Pro Pays de la Loire** : le site `transitionspro-pdl.fr` est utilisé et son domaine est autorisé, mais le lien depuis le site national (`transitionspro.fr/contacts-en-region/`) n'a pas pu être contrôlé (accès bloqué par robots.txt). Ouvrir cette page nationale et confirmer l'adresse. La page « Financer ma reconversion » du site régional répondait 404 : calendrier de dépôt, plafonds et priorités régionales du PTP à relever à la main.
2. **Cap emploi** : aucun site régional ou départemental officiel (44, 49, 53, 72, 85) trouvé. Acteur non documenté.
3. **Missions locales** : seule la page de présentation 1jeune1solution (ministère du Travail) est référencée. L'annuaire officiel (unml.info) n'est pas dans la liste des domaines autorisés ; décider de l'ajouter pour référencer les 25 missions locales de la région.
4. **OPCO Mobilités** : site inaccessible aux contrôles automatiques (robots.txt). Aucune page régionale vérifiée. **AKTO** : aucune délégation ou page Pays de la Loire trouvée, contact national uniquement. **OPCO EP** : document régional trouvé, sans adresse de délégation.
5. **Conseils départementaux (44, 49, 53, 72, 85)** : non documentés (fonds d'aide aux jeunes, aides sociales). Le site France Travail cite le fonds d'aide aux jeunes de la Sarthe (jusqu'à 700 €) et un fonds départemental national (jusqu'à 1 000 €), non repris faute de page officielle départementale vérifiée.
6. **CMA** : pas de pages des CMA départementales ; la page « Financer sa formation » date du 05/06/2024.
7. **CPF** : aucun abondement ou aide de la Région Pays de la Loire relevé. À confirmer auprès de la Région.
8. **Liens** : lancer `npm run verifier-liens` sur le Mac (les contrôles depuis le serveur de développement renvoient tous 403) et `npm run couverture` après chaque mise à jour.
