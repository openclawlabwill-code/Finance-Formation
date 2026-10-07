import test from 'node:test';
import assert from 'node:assert/strict';
import { demarrer, fiche, aujourdhui } from './helpers.js';

const src = [{ url: 'https://www.service-public.fr/x', intitule: 'Page officielle', organisme: 'DILA' }];

async function jeu() {
  const t = await demarrer();
  await t.store.ecrireDispositif(fiche({ id: 'dispositif-national' }));
  await t.store.ecrireDispositif(fiche({
    id: 'dispositif-decline', declinaison_regionale: true, acteur_regional: 'transitions_pro',
    specificites_regionales: { '52': { statut: 'actif', resume: 'Particularité vérifiée pour la région 52.', sources: src, date_derniere_verification: aujourdhui } },
  }));
  await t.store.ecrireDispositif(fiche({ id: 'aide-region-52', portee_geographique: 'regional', regions_concernees: ['52'],
    specificites_regionales: { '52': { statut: 'actif', resume: 'Aide régionale vérifiée 52.', sources: src, date_derniere_verification: aujourdhui } } }));
  await t.store.ecrireDispositif(fiche({ id: 'aide-locale-53', portee_geographique: 'local', regions_concernees: ['53'] }));
  return t;
}

test('un même catalogue donne des résultats différents selon la région', async () => {
  const t = await jeu();
  const r52 = (await t.appel('/api/dispositifs?region=52')).json.dispositifs.map((d) => d.id);
  const r53 = (await t.appel('/api/dispositifs?region=53')).json.dispositifs.map((d) => d.id);
  assert.ok(r52.includes('aide-region-52') && !r53.includes('aide-region-52'));
  assert.ok(r53.includes('aide-locale-53') && !r52.includes('aide-locale-53'));
  await t.arreter();
});

test('région documentée : spécificité affichée ; région non documentée : message explicite, aucune règle inventée', async () => {
  const t = await jeu();
  const d52 = (await t.appel('/api/dispositifs/dispositif-decline?region=52')).json.regional;
  assert.equal(d52.documentee, true);
  assert.equal(d52.bloc, 'national');
  assert.match(d52.specificite.resume, /région 52/);
  const d53 = (await t.appel('/api/dispositifs/dispositif-decline?region=53')).json.regional;
  assert.equal(d53.documentee, false);
  assert.equal(d53.specificite, null);
  assert.match(d53.message, /Déclinaison régionale non documentée : contacter/);
  await t.arreter();
});

test('blocs : national / régional / à vérifier localement', async () => {
  const t = await jeu();
  const blocs = Object.fromEntries((await t.appel('/api/dispositifs?region=52')).json.dispositifs.map((d) => [d.id, d.regional.bloc]));
  assert.equal(blocs['dispositif-national'], 'national');
  assert.equal(blocs['aide-region-52'], 'regional');
  const b53 = Object.fromEntries((await t.appel('/api/dispositifs?region=53')).json.dispositifs.map((d) => [d.id, d.regional.bloc]));
  assert.equal(b53['aide-locale-53'], 'a_verifier_localement');
  await t.arreter();
});

test('région inconnue : 400', async () => {
  const t = await jeu();
  assert.equal((await t.appel('/api/dispositifs?region=99')).statut, 400);
  await t.arreter();
});
