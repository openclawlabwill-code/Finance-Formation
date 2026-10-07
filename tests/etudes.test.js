import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { demarrer, fiche } from './helpers.js';
import { verifierAnonymat, versMarkdown } from '../server/etudes.js';

const cond = (attribut, valeurs) => ({ attribut, operateur: 'in', valeurs });
const post = (t, chemin, corps) => t.appel(chemin, { method: 'POST', body: JSON.stringify(corps) });
const PROFIL = { point_depart: 'en_activite', statut: 'salarie_cdi', anciennete: 'plus_24_mois', taille_entreprise: '11_49', initiative: 'salarie', temps_travail: 'temps_plein', age_tranche: '30_44', diplome: 'niveau_5_6', projet: 'reconversion', voie: 'formation_continue', rqth: 'non', minima_sociaux: 'non' };

async function jeu() {
  const t = await demarrer();
  await t.store.ecrireDispositif(fiche({ id: 'dispo-salaries', nom: 'Dispositif salariés', criteres_eligibilite: [cond('statut', ['salarie_cdi'])] }));
  await t.store.ecrireDispositif(fiche({ id: 'dispo-ptp', nom: 'Dispositif décliné', declinaison_regionale: true, acteur_regional: 'transitions_pro', criteres_eligibilite: [cond('statut', ['salarie_cdi'])] }));
  return t;
}

test('RGPD : e-mail, téléphone, numéro de sécurité sociale et longues suites de chiffres refusés', () => {
  for (const mauvais of ['jean.dupont@exemple.fr', '06 12 34 56 78', '+33 6 12 34 56 78', '1 85 05 78 006 084 36', '12345678901234'])
    assert.throws(() => verifierAnonymat(mauvais, 'Référence'), (e) => e.statut === 400, mauvais);
  assert.doesNotThrow(() => verifierAnonymat('DOSSIER-2026-014', 'Référence'));
  assert.doesNotThrow(() => verifierAnonymat('Candidat orienté par la mission locale en septembre', 'Notes'));
});

test('aperçu : parcours complet, résultats recalculés côté serveur, réponses orphelines écartées', async () => {
  const t = await jeu();
  const r = await post(t, '/api/etudes/apercu', { region: '52', profil: { ...PROFIL, projet_inexistant: undefined, statut: 'artisan', taille_entreprise: '11_49' } });
  assert.equal(r.statut, 200);
  assert.equal(r.json.complet, true);
  assert.equal(r.json.profil.taille_entreprise, undefined, 'question salarié ignorée pour un artisan');
  assert.deepEqual(r.json.resultats.map((x) => x.dispositif_id), [], 'artisan : aucun des dispositifs salariés');
  const salarie = (await post(t, '/api/etudes/apercu', { region: '52', profil: PROFIL })).json;
  assert.equal(salarie.resultats.length, 2);
  await t.arreter();
});

test('enregistrement, historique, relecture, export Markdown, suppression', async () => {
  const t = await jeu();
  const e = (await post(t, '/api/etudes', { region: '52', departement: '44', profil: PROFIL, reference_dossier: 'DOSSIER-014', notes: 'Orienté par un partenaire.' })).json;
  assert.match(e.id, /^\d{8}-[0-9a-f]{6}$/);
  assert.equal(e.departement_nom, 'Loire-Atlantique');
  const liste = (await t.appel('/api/etudes')).json.etudes;
  assert.equal(liste.length, 1); assert.equal(liste[0].reference_dossier, 'DOSSIER-014');
  assert.equal((await t.appel(`/api/etudes/${e.id}`)).json.resultats.length, 2);
  const md = await fetch(`${t.base}/api/etudes/${e.id}/export.md`);
  assert.match(md.headers.get('content-type'), /text\/markdown/);
  const texte = await md.text();
  assert.match(texte, /Synthèse d’étude de financement — réf\. DOSSIER-014/);
  assert.match(texte, /Pays de la Loire \(52\) — Loire-Atlantique/);
  assert.match(texte, /Déclinaison régionale non documentée : contacter/);
  assert.match(texte, /Information indicative/);
  assert.equal((await t.appel(`/api/etudes/${e.id}`, { method: 'DELETE' })).statut, 200);
  assert.equal((await t.appel(`/api/etudes/${e.id}`)).statut, 404);
  await t.arreter();
});

test('étude : une référence identifiante est refusée et rien n\'est écrit', async () => {
  const t = await jeu();
  const r = await post(t, '/api/etudes', { region: '52', profil: PROFIL, reference_dossier: 'marie.martin@exemple.fr' });
  assert.equal(r.statut, 400);
  assert.equal((await t.appel('/api/etudes')).json.etudes.length, 0);
  assert.equal((await post(t, '/api/etudes', { region: '52', departement: '75', profil: PROFIL })).statut, 400, 'département hors région');
  await t.arreter();
});

test('région non documentée (53) : l\'étude se génère avec les messages de repli, sans résultat inventé', async () => {
  const t = await jeu();
  const e = (await post(t, '/api/etudes/apercu', { region: '53', profil: PROFIL })).json;
  assert.ok(e.resultats.every((r) => r.bloc === 'national'));
  assert.ok(e.resultats.find((r) => r.dispositif_id === 'dispo-ptp').message_regional);
  assert.match(versMarkdown(e), /Contacts régionaux non encore documentés/);
  await t.arreter();
});

test('sécurité : hôte non local, origine étrangère et type de contenu non JSON refusés', async () => {
  const t = await jeu();
  const nu = (opts) => fetch(t.base + '/api/etudes', opts);
  assert.equal((await nu({ method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.example' }, body: '{}' })).status, 403);
  assert.equal((await nu({ method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' })).status, 415);
  const http = await import('node:http');
  const statut = await new Promise((ok) => http.get({ host: '127.0.0.1', port: t.serveur.address().port, path: '/api/sante', headers: { host: 'evil.example' } }, (res) => ok(res.statusCode)));
  assert.equal(statut, 403);
  await t.arreter();
});
