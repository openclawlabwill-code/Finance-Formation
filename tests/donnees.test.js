// Contrôles sur le jeu de données réel (data/ et config/) : cohérence, fiabilité, scénarios de parcours.
import test from 'node:test';
import assert from 'node:assert/strict';
import { chargerConfig } from '../server/config.js';
import { creerApp } from '../server/app.js';
import { verifierCoherence } from '../server/coherence.js';
import { dispositifsPourRegion } from '../server/regional.js';
import { evaluerProfil } from '../server/eligibilite.js';

const config = chargerConfig();
const { store, validateur } = creerApp(config);
const dispositifs = await store.listerDispositifs();
const ids = (profil, region = '52') => store.sources().then(async (sources) => {
  const decores = dispositifsPourRegion(dispositifs, region, { sources, regions: await store.regions() });
  return evaluerProfil(decores, profil, await store.attributs()).resultats;
});

test('jeu de données réel : schémas valides et cohérence complète', async () => {
  for (const d of dispositifs) assert.equal(validateur.valider('dispositif.json', d).ok, true, d.id);
  const pb = verifierCoherence({ regions: await store.regions(), attributs: await store.attributs(), arbre: await store.arbre(), dispositifs, sources: await store.sources(), actualites: await store.actualites() });
  assert.deepEqual(pb, []);
});

test('fiabilité : toute fiche a une source officielle et des dates ; une fiche « à vérifier » n\'est jamais « probable »', async () => {
  assert.ok(dispositifs.length >= 20);
  for (const d of dispositifs) {
    assert.ok(d.sources.length >= 1, d.id);
    assert.match(d.date_derniere_verification, /^\d{4}-\d{2}-\d{2}$/);
  }
  const res = await ids({ point_depart: 'en_activite', statut: 'artisan' });
  for (const r of res.filter((x) => x.statut === 'a_verifier')) assert.equal(r.eligibilite, 'a_verifier');
});

test('scénario : salarié CDI en reconversion → PTP probable, pas d\'AIF ni de POE', async () => {
  const res = await ids({ point_depart: 'en_activite', statut: 'salarie_cdi', anciennete: 'plus_24_mois', projet: 'reconversion' });
  const par = Object.fromEntries(res.map((r) => [r.id, r.eligibilite]));
  assert.equal(par.ptp, 'probable');
  assert.equal(par['demission-reconversion'], 'probable');
  assert.ok(!('aif' in par) && !('poe' in par));
  assert.ok(par.cpf);
});

test('scénario : demandeur d\'emploi indemnisé → AIF, POE, rémunération, formations Région ; pas de PTP', async () => {
  const res = await ids({ point_depart: 'demandeur_emploi', statut: 'de_indemnise' });
  const idsRes = res.map((r) => r.id);
  for (const attendu of ['aif', 'poe', 'remuneration-formation-demandeur-emploi', 'programme-regional-formation', 'cpf-abondements']) assert.ok(idsRes.includes(attendu), attendu);
  assert.ok(!idsRes.includes('ptp'));
});

test('scénario : apprentissage à 45 ans sans exception → écarté ; avec RQTH → conservé', async () => {
  const base = { point_depart: 'demandeur_emploi', statut: 'de_indemnise', age_tranche: '45_plus', voie: 'apprentissage', projet: 'certification_diplome' };
  assert.ok(!(await ids({ ...base, rqth: 'non' })).some((r) => r.id === 'contrat-apprentissage'));
  assert.ok((await ids({ ...base, rqth: 'oui' })).some((r) => r.id === 'contrat-apprentissage'));
});

test('région non documentée : les dispositifs à déclinaison régionale affichent le message de repli', async () => {
  const res = await ids({ point_depart: 'en_activite', statut: 'salarie_cdi', anciennete: 'plus_24_mois', projet: 'reconversion' }, '53');
  const ptp = res.find((r) => r.id === 'ptp');
  assert.equal(ptp.region_documentee, false);
  assert.match(ptp.message_regional, /Déclinaison régionale non documentée : contacter/);
});

test('Pays de la Loire : spécificités documentées affichées, reste « non documenté », aucune extrapolation vers une autre région', async () => {
  const sources = await store.sources(), regions = await store.regions();
  const pdl = dispositifsPourRegion(dispositifs, '52', { sources, regions });
  const get = (id, l = pdl) => l.find((d) => d.id === id).regional;
  assert.equal(get('demission-reconversion').documentee, true);
  assert.match(get('demission-reconversion').specificite.resume, /Transitions Pro Pays de la Loire/);
  assert.equal(get('programme-regional-formation').documentee, true);
  assert.equal(get('ptp').documentee, false, 'spécificité à vérifier : pas présentée comme confirmée');
  assert.match(get('ptp').message, /contacter Transitions Pro Pays de la Loire/);
  assert.equal(get('ptp').contact.url, 'https://www.transitionspro-pdl.fr/');
  assert.equal(get('cap-emploi').documentee, false);
  const idf = dispositifsPourRegion(dispositifs, '11', { sources, regions });
  assert.equal(get('demission-reconversion', idf).documentee, false, 'jamais reprise pour une autre région');
  assert.equal(get('demission-reconversion', idf).specificite, null);
  const pb = (await store.regions()).find((r) => r.code === '52');
  assert.equal(pb.site_conseil_regional.url, 'https://www.paysdelaloire.fr/');
});
