// npm run valider : valide tous les fichiers de données (schémas + cohérence + sources officielles).
import fs from 'node:fs';
import { chargerConfig } from '../server/config.js';
import { creerApp } from '../server/app.js';
import { verifierCoherence } from '../server/coherence.js';

const config = chargerConfig();
const { store, validateur } = creerApp(config);
const erreurs = [];
const regles = [
  ['region.json', 'regions.json', async () => store.lireJson(`${config.dataDir}/regions.json`)],
  ['attributs.json', 'attributs.json', () => store.attributs()],
  ['arbre.json', 'arbre.json', () => store.arbre()],
  ['sources.json', 'config/sources.json', () => store.sources()],
];
for (const [schema, nom, lire] of regles) {
  const r = validateur.valider(schema, await lire());
  if (!r.ok) r.erreurs.forEach((e) => erreurs.push(`${nom}${e.chemin} : ${e.message}`));
}
const dispositifs = await store.listerDispositifs();
for (const d of dispositifs) {
  const r = validateur.valider('dispositif.json', d);
  if (!r.ok) r.erreurs.forEach((e) => erreurs.push(`dispositifs/${d.id}${e.chemin} : ${e.message}`));
}
const actualites = await store.actualites();
for (const a of actualites) {
  const r = validateur.valider('actualite.json', a);
  if (!r.ok) r.erreurs.forEach((e) => erreurs.push(`actualites/${a.id}${e.chemin} : ${e.message}`));
}
if (!erreurs.length) {
  erreurs.push(...verifierCoherence({
    regions: await store.regions(), attributs: await store.attributs(), arbre: await store.arbre(),
    dispositifs, sources: await store.sources(), actualites,
  }));
}
if (erreurs.length) { console.error(`✗ ${erreurs.length} problème(s) :\n- ` + erreurs.join('\n- ')); process.exit(1); }
console.log(`✓ Données valides (${dispositifs.length} dispositif(s), ${actualites.length} actualité(s)).`);
