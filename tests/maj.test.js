import test from 'node:test';
import assert from 'node:assert/strict';
import { demarrer, fiche } from './helpers.js';

const TOKEN = 'jeton-de-test-0123456789';
const auth = { authorization: `Bearer ${TOKEN}` };
const navigateur = (t) => ({ origin: t.base });
const SRC = [{ url: 'https://www.transitionspro.fr/pays-de-la-loire', intitule: 'Transitions Pro Pays de la Loire', organisme: 'Transitions Pro', extrait: 'Texte relevé sur la page officielle.' }];
const spec = { statut: 'actif', resume: 'Spécificité régionale de test pour les Pays de la Loire.' };
const prop = (o = {}) => ({ agent: 'hermes', region: '52', action: 'modification', dispositif_id: 'fiche-test', motif: 'Mise à jour régionale', sources: SRC, contenu: { specificites_regionales: { 52: spec } }, ...o });

async function pret(opts = {}) {
  const t = await demarrer({ apiToken: TOKEN, ...opts });
  await t.store.ecrireDispositif(fiche());
  return t;
}
const poster = (t, corps, entetes = auth) => t.appel('/api/maj/proposition', { method: 'POST', body: JSON.stringify(corps), headers: entetes });

test('maj : token obligatoire, API désactivée sans token', async () => {
  const t = await pret();
  assert.equal((await t.appel('/api/maj/propositions')).statut, 401);
  assert.equal((await t.appel('/api/maj/propositions', { headers: { authorization: 'Bearer mauvais' } })).statut, 401);
  assert.equal((await t.appel('/api/maj/propositions', { headers: auth })).statut, 200);
  await t.arreter();
  const t2 = await demarrer();
  assert.equal((await t2.appel('/api/maj/propositions')).statut, 503);
  await t2.arreter();
});

test('maj : région, sources et domaines officiels obligatoires ; rejets journalisés', async () => {
  const t = await pret();
  const sansRegion = prop(); delete sansRegion.region;
  assert.equal((await poster(t, sansRegion)).statut, 422);
  assert.equal((await poster(t, prop({ sources: [] }))).statut, 422);
  assert.equal((await poster(t, prop({ region: '99' }))).statut, 422);
  const nonOff = await poster(t, prop({ sources: [{ ...SRC[0], url: 'https://blog-quelconque.example.com/x' }] }));
  assert.equal(nonOff.statut, 422); assert.match(nonOff.json.erreur, /non officielle/);
  const j = (await t.appel('/api/admin/journal')).json.entrees;
  assert.ok(j.filter((e) => e.resultat === 'rejete').length >= 4);
  assert.equal((await t.appel('/api/maj/propositions', { headers: auth })).json.propositions.length, 0, 'rien en file');
  await t.arreter();
});

test('maj : une source régionale ne touche pas le cœur d’une fiche nationale, et inversement', async () => {
  const t = await pret();
  const r = await poster(t, prop({ contenu: { resume: 'Résumé réécrit depuis une page régionale, interdit.' } }));
  assert.equal(r.statut, 422); assert.match(r.json.erreur, /spécificité régionale/);
  assert.equal((await poster(t, prop({ contenu: { specificites_regionales: { 44: spec } } }))).statut, 422, 'autre région');
  assert.equal((await poster(t, prop({ region: 'national', contenu: { specificites_regionales: { 52: spec } } }))).statut, 422);
  for (const k of ['id', 'historique', 'date_derniere_verification']) assert.equal((await poster(t, prop({ region: 'national', contenu: { [k]: 'x' } }))).statut, 422, k);
  await t.arreter();
});

test('maj : dépôt → diff → acceptation (navigateur) → fiche, sauvegarde et journal', async () => {
  const t = await pret();
  const d = await poster(t, prop());
  assert.equal(d.statut, 200); assert.equal(d.json.statut, 'en_attente');
  assert.ok(d.json.diff.some((x) => x.chemin.startsWith('specificites_regionales.52')));
  assert.equal((await t.store.lireDispositif('fiche-test')).specificites_regionales['52'], undefined, 'rien d’appliqué avant décision');
  const sansOrigine = await t.appel(`/api/admin/propositions/${d.json.id}/accepter`, { method: 'POST', body: '{}' });
  assert.equal(sansOrigine.statut, 403);
  const ok = await t.appel(`/api/admin/propositions/${d.json.id}/accepter`, { method: 'POST', body: '{}', headers: navigateur(t) });
  assert.equal(ok.statut, 200, JSON.stringify(ok.json));
  const f = await t.store.lireDispositif('fiche-test');
  assert.equal(f.specificites_regionales['52'].resume, spec.resume);
  assert.equal(f.specificites_regionales['52'].sources[0].url, SRC[0].url, 'sources de la proposition recopiées');
  assert.equal(f.statut, 'modifie'); assert.equal(f.historique.at(-1).region, '52');
  assert.ok((await t.appel('/api/admin/backups')).json.backups.length >= 1);
  // double décision refusée
  assert.equal((await t.appel(`/api/admin/propositions/${d.json.id}/refuser`, { method: 'POST', body: '{}', headers: navigateur(t) })).statut, 409);
  // restauration de la version précédente
  const [b] = (await t.appel('/api/admin/backups')).json.backups.filter((n) => n.includes('fiche-test'));
  assert.equal((await t.appel('/api/admin/restaurer', { method: 'POST', body: JSON.stringify({ backup: b }), headers: navigateur(t) })).statut, 200);
  assert.equal((await t.store.lireDispositif('fiche-test')).specificites_regionales['52'], undefined);
  const actions = (await t.appel('/api/admin/journal')).json.entrees.map((e) => e.action);
  assert.ok(actions.includes('modification') && actions.includes('restauration'));
  await t.arreter();
});

test('maj : refus, proposition périmée (fiche modifiée entre-temps), création et actualité', async () => {
  const t = await pret();
  const a = (await poster(t, prop())).json.id;
  const b = (await poster(t, prop({ contenu: { specificites_regionales: { 52: { ...spec, resume: 'Autre version de la spécificité régionale.' } } } }))).json.id;
  await t.appel(`/api/admin/propositions/${a}/accepter`, { method: 'POST', body: '{}', headers: navigateur(t) });
  const perimee = await t.appel(`/api/admin/propositions/${b}/accepter`, { method: 'POST', body: '{}', headers: navigateur(t) });
  assert.equal(perimee.statut, 409);
  const ref = await t.appel(`/api/admin/propositions/${b}/refuser`, { method: 'POST', body: JSON.stringify({ motif: 'périmée' }), headers: navigateur(t) });
  assert.equal(ref.statut, 200);
  assert.equal((await t.appel('/api/admin/propositions?statut=refusee')).json.propositions.length, 1);

  // création régionale : doit être de portée régionale limitée à la région
  const base = fiche(); delete base.id; for (const k of ['historique', 'date_derniere_verification', 'date_derniere_modification', 'statut']) delete base[k];
  assert.equal((await poster(t, prop({ action: 'creation', dispositif_id: 'aide-region-52', contenu: base }))).statut, 422);
  const reg = { ...base, portee_geographique: 'regional', regions_concernees: ['52'], nom: 'Aide régionale de test' };
  const c = await poster(t, prop({ action: 'creation', dispositif_id: 'aide-region-52', contenu: reg }));
  assert.equal(c.statut, 200, JSON.stringify(c.json));
  await t.appel(`/api/admin/propositions/${c.json.id}/accepter`, { method: 'POST', body: '{}', headers: navigateur(t) });
  assert.equal((await t.store.lireDispositif('aide-region-52')).statut, 'a_verifier', 'une création d’agent reste à vérifier');

  // actualité
  const actu = { id: 'actu-test-52', titre: 'Actualité régionale de test', date: '2026-10-01', region: '52', dispositif_id: 'fiche-test', url: 'https://www.transitionspro.fr/actu', organisme: 'Transitions Pro' };
  const x = await poster(t, prop({ action: 'actualite', contenu: actu, dispositif_id: undefined }));
  assert.equal(x.statut, 200, JSON.stringify(x.json));
  await t.appel(`/api/admin/propositions/${x.json.id}/accepter`, { method: 'POST', body: '{}', headers: navigateur(t) });
  assert.ok((await t.store.actualites()).some((n) => n.id === 'actu-test-52'));
  assert.equal((await poster(t, prop({ action: 'actualite', contenu: { ...actu, region: '11' }, dispositif_id: undefined }))).statut, 422, 'région du contenu ≠ région de la proposition');
  await t.arreter();
});

test('maj : AUTO_PUBLISH applique directement (règles identiques)', async () => {
  const t = await pret({ autoPublish: true });
  const r = await poster(t, prop());
  assert.equal(r.json.statut, 'acceptee_auto');
  assert.ok((await t.store.lireDispositif('fiche-test')).specificites_regionales['52']);
  assert.equal((await poster(t, prop({ contenu: { resume: 'Réécriture interdite depuis une source régionale.' } }))).statut, 422);
  await t.arreter();
});

test('admin : matrice de couverture régionale', async () => {
  const t = await pret();
  const c = (await t.appel('/api/admin/couverture?region=52')).json;
  assert.equal(c.region, '52'); assert.equal(c.acteurs.length, 11);
  assert.ok(c.synthese.acteurs_total === 11 && Array.isArray(c.fiches));
  assert.equal((await t.appel('/api/admin/couverture?region=99')).statut, 400);
  await t.arreter();
});

test('pack LLM : export autoporteur, import tolérant, mêmes règles que l’API', async () => {
  const t = await pret();
  const r = await fetch(`${t.base}/api/admin/pack`);
  assert.equal(r.status, 200); assert.match(r.headers.get('content-disposition'), /financeforma-pack-52-/);
  const pack = await r.json();
  assert.equal(pack.format, 'financeforma-pack/1'); assert.equal(pack.region, '52');
  assert.ok(pack._lisez_moi.length >= 3 && pack.regles.length >= 5 && pack.format_reponse.propositions.length === 1);
  assert.ok(pack.fiches.some((f) => f.id === 'fiche-test') && Array.isArray(pack.a_traiter) && pack.acteurs_regionaux);
  assert.deepEqual(pack.propositions, []);

  const bonne = prop({ agent: undefined });
  const mauvaise = prop({ contenu: { resume: 'Réécriture nationale interdite depuis une source régionale.' } });
  const horsListe = prop({ sources: [{ ...SRC[0], url: 'https://blog.example.com/x' }] });
  // réponse d'assistant : prose + bloc ```json
  const reponse = `Voici mon travail.\n\`\`\`json\n${JSON.stringify({ ...pack, propositions: [bonne, mauvaise, horsListe], compte_rendu: 'Une page inaccessible.' })}\n\`\`\`\nBonne journée.`;
  const imp = await t.appel('/api/admin/pack/importer', { method: 'POST', body: JSON.stringify({ texte: reponse }), headers: navigateur(t) });
  assert.equal(imp.statut, 200, JSON.stringify(imp.json));
  assert.equal(imp.json.deposees.length, 1); assert.equal(imp.json.rejetees.length, 2);
  assert.equal(imp.json.compte_rendu, 'Une page inaccessible.');
  assert.equal((await t.store.lireDispositif('fiche-test')).specificites_regionales['52'], undefined, 'rien d’appliqué sans validation');
  assert.equal((await t.appel('/api/admin/propositions?statut=en_attente')).json.propositions[0].agent, 'pack-llm');
  // garde-fous
  const sansOrigine = await t.appel('/api/admin/pack/importer', { method: 'POST', body: JSON.stringify({ texte: reponse }) });
  assert.equal(sansOrigine.statut, 403);
  const post = (texte) => t.appel('/api/admin/pack/importer', { method: 'POST', body: JSON.stringify({ texte }), headers: navigateur(t) });
  assert.equal((await post('pas du json')).statut, 422);
  assert.equal((await post(JSON.stringify({ format: 'autre', propositions: [] }))).statut, 422);
  assert.equal((await post(JSON.stringify({ format: 'financeforma-pack/1', region: '11', propositions: [] }))).statut, 422);
  await t.arreter();
});
