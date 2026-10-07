import test from 'node:test';
import assert from 'node:assert/strict';
import { demarrer, fiche } from './helpers.js';
import { verifierCoherence } from '../server/coherence.js';

test('une fiche valide est acceptée', async () => {
  const { validateur, arreter } = await demarrer();
  assert.equal(validateur.valider('dispositif.json', fiche()).ok, true);
  await arreter();
});

test('une fiche sans source est rejetée', async () => {
  const { validateur, arreter } = await demarrer();
  const r = validateur.valider('dispositif.json', fiche({ sources: [] }));
  assert.equal(r.ok, false);
  assert.ok(r.erreurs.some((e) => e.chemin === '/sources'));
  await arreter();
});

test('champs inconnus, date invalide et code région invalide sont rejetés', async () => {
  const { validateur, arreter } = await demarrer();
  assert.equal(validateur.valider('dispositif.json', { ...fiche(), pirate: 1 }).ok, false);
  assert.equal(validateur.valider('dispositif.json', fiche({ date_derniere_verification: '2026-13-45' })).ok, false);
  assert.equal(validateur.valider('dispositif.json', fiche({ specificites_regionales: { '999': {} } })).ok, false);
  await arreter();
});

test('proposition : région obligatoire, source obligatoire, action cohérente', async () => {
  const { validateur, arreter } = await demarrer();
  const src = [{ url: 'https://www.service-public.fr/x', intitule: 'Page officielle', organisme: 'DILA', extrait: 'Extrait justificatif long.' }];
  assert.equal(validateur.valider('proposition.json', { action: 'actualite', contenu: {}, sources: src }).ok, false, 'sans région');
  assert.equal(validateur.valider('proposition.json', { region: 'national', action: 'actualite', contenu: {} }).ok, false, 'sans source');
  assert.equal(validateur.valider('proposition.json', { region: 'national', action: 'modification', contenu: {}, sources: src }).ok, false, 'sans dispositif_id');
  assert.equal(validateur.valider('proposition.json', { region: '52', action: 'modification', dispositif_id: 'cpf', contenu: {}, sources: src }).ok, true);
  await arreter();
});

test('cohérence : source non officielle et références cassées détectées', async () => {
  const { store, arreter } = await demarrer();
  const base = { regions: await store.regions(), attributs: await store.attributs(), arbre: await store.arbre(), sources: await store.sources(), actualites: [] };
  const mauvais = fiche({
    sources: [{ url: 'https://blog-formation.example.com/cpf', intitule: 'Un blog', organisme: 'Blog' }],
    criteres_eligibilite: [{ attribut: 'statut', operateur: 'in', valeurs: ['inexistant'] }],
    regions_concernees: ['99'],
  });
  const pb = verifierCoherence({ ...base, dispositifs: [mauvais] }).join('\n');
  assert.match(pb, /non officielle/);
  assert.match(pb, /valeur « inexistant » inconnue/);
  assert.match(pb, /région inconnue « 99 »/);
  await arreter();
});
