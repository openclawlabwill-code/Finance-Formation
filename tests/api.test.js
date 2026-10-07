import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { demarrer, fiche } from './helpers.js';

test('API : santé, régions (18 dont les 5 départements des Pays de la Loire), arbre, attributs', async () => {
  const t = await demarrer();
  assert.equal((await t.appel('/api/sante')).json.statut, 'ok');
  const { regions } = (await t.appel('/api/regions')).json;
  assert.equal(regions.length, 18);
  assert.deepEqual(regions.find((r) => r.code === '52').departements.map((d) => d.code), ['44', '49', '53', '72', '85']);
  assert.equal((await t.appel('/api/arbre')).statut, 200);
  assert.equal((await t.appel('/api/attributs')).statut, 200);
  await t.arreter();
});

test('API : 404 JSON, en-têtes de sécurité, pas de traversée de répertoire', async () => {
  const t = await demarrer();
  assert.equal((await t.appel('/api/inconnu')).statut, 404);
  const accueil = await t.appel('/');
  assert.equal(accueil.statut, 200);
  assert.equal(accueil.entetes.get('x-content-type-options'), 'nosniff');
  assert.equal((await t.appel('/..%2f..%2fpackage.json')).statut, 404);
  assert.equal((await t.appel('/api/dispositifs/..%2f..%2fregions')).statut, 400);
  await t.arreter();
});

test('écriture : fiche invalide refusée (422) ; sauvegarde + journal à chaque modification ; restauration', async () => {
  const t = await demarrer();
  await assert.rejects(() => t.store.ecrireDispositif(fiche({ sources: [] })), (e) => e.statut === 422);
  await t.store.ecrireDispositif(fiche({ nom: 'Version 1' }));
  await t.store.ecrireDispositif(fiche({ nom: 'Version 2' }));
  const backups = await t.store.listerBackups();
  assert.equal(backups.length, 1, 'la V1 a été sauvegardée avant d\'être remplacée');
  assert.equal((await t.store.lireDispositif('fiche-test')).nom, 'Version 2');
  await t.store.restaurerBackup(backups[0]);
  assert.equal((await t.store.lireDispositif('fiche-test')).nom, 'Version 1');
  const journal = fs.readFileSync(path.join(t.store.dataDir, 'journal-maj.log'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(journal.map((j) => j.action), ['creation', 'modification', 'restauration']);
  await t.arreter();
});

test('restauration : noms de sauvegarde malveillants refusés', async () => {
  const t = await demarrer();
  await assert.rejects(() => t.store.restaurerBackup('../../etc/passwd'), (e) => e.statut === 400);
  await t.arreter();
});

test('actualités : filtre région, tri, limite de 20 et archivage', async () => {
  const t = await demarrer();
  const base = (i, region) => ({ id: `actu-${String(i).padStart(2, '0')}`, titre: `Actualité numéro ${i}`, date: `2026-09-${String(i % 28 + 1).padStart(2, '0')}`, region, dispositif_id: 'cpf', url: 'https://www.service-public.gouv.fr/x', organisme: 'Test' });
  for (let i = 0; i < 22; i++) await t.store.ajouterActualite(base(i, i % 2 ? '52' : 'national'));
  assert.equal((await t.store.actualites()).length, 20);
  assert.equal((await t.store.lireJson(t.store.dataDir + '/actualites-archive.json', [])).length, 3, '22 ajoutées + 1 existante - 20 gardées');
  const r52 = await (await fetch(`${t.base}/api/actualites?region=52`)).json();
  assert.ok(r52.actualites.length <= 20 && r52.actualites.every((a) => ['national', '52'].includes(a.region)));
  const r11 = await (await fetch(`${t.base}/api/actualites?region=11`)).json();
  assert.ok(r11.actualites.every((a) => a.region === 'national'));
  await assert.rejects(t.store.ajouterActualite({ ...base(1, '52'), url: 'pas-une-url' }));
  await t.arreter();
});
