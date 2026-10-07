import test from 'node:test';
import assert from 'node:assert/strict';
import { demarrer, fiche, aujourdhui } from './helpers.js';
import { calculerChemin, profilDuChemin, construireVisible, disposer } from '../public/js/arbre-logique.js';
import { verifierCoherence } from '../server/coherence.js';
import { evaluerDispositif } from '../server/eligibilite.js';

const cond = (attribut, valeurs, operateur = 'in') => ({ attribut, operateur, valeurs });

test('éligibilité : probable / à vérifier (information manquante) / écarté (critère contredit)', () => {
  const d = fiche({ criteres_eligibilite: [cond('statut', ['salarie_cdi']), cond('age_tranche', ['moins_16'], 'not_in')] });
  assert.equal(evaluerDispositif(d, { statut: 'salarie_cdi', age_tranche: '30_44' }).eligibilite, 'probable');
  const inc = evaluerDispositif(d, { statut: 'salarie_cdi' });
  assert.equal(inc.eligibilite, 'a_verifier'); assert.deepEqual(inc.manquants, ['age_tranche']);
  assert.equal(evaluerDispositif(d, { statut: 'artisan' }), null);
  assert.equal(evaluerDispositif(fiche({ statut: 'a_verifier' }), {}).eligibilite, 'a_verifier', 'fiche à vérifier : jamais « probable »');
});

test('API /api/evaluer : profil mal formé refusé, résultats triés, région obligatoire', async () => {
  const t = await demarrer();
  await t.store.ecrireDispositif(fiche({ id: 'pour-salaries', criteres_eligibilite: [cond('statut', ['salarie_cdi'])] }));
  await t.store.ecrireDispositif(fiche({ id: 'pour-artisans', criteres_eligibilite: [cond('statut', ['artisan'])] }));
  const post = (corps) => t.appel('/api/evaluer', { method: 'POST', body: JSON.stringify(corps) });
  assert.equal((await post({ profil: {} })).statut, 400);
  assert.equal((await post({ region: '52', profil: { statut: 'nimportequoi' } })).statut, 400);
  const r = (await post({ region: '52', profil: { statut: 'salarie_cdi' } })).json;
  assert.deepEqual(r.resultats.map((x) => x.id), ['pour-salaries']);
  assert.equal(r.resultats[0].eligibilite, 'probable');
  assert.equal(r.compteurs.total, 1);
  await t.arreter();
});

test('alerte « non vérifiée depuis plus de 90 jours »', async () => {
  const t = await demarrer();
  await t.store.ecrireDispositif(fiche({ id: 'vieille-fiche', date_derniere_verification: '2020-01-01' }));
  await t.store.ecrireDispositif(fiche({ id: 'fiche-fraiche', date_derniere_verification: aujourdhui }));
  const liste = (await t.appel('/api/dispositifs?region=52')).json.dispositifs;
  assert.equal(liste.find((d) => d.id === 'vieille-fiche').regional.verification_perimee, true);
  assert.equal(liste.find((d) => d.id === 'fiche-fraiche').regional.verification_perimee, false);
  await t.arreter();
});

test('arbre réel : cohérent, sans cycle, et chaque parcours se termine', async () => {
  const t = await demarrer();
  const donnees = { regions: await t.store.regions(), attributs: await t.store.attributs(), arbre: await t.store.arbre(), sources: await t.store.sources(), dispositifs: [], actualites: [] };
  assert.deepEqual(verifierCoherence(donnees), []);
  await t.arreter();
});

test('parcours : réponses orphelines ignorées, modification d\'un choix sans tout refaire', async () => {
  const t = await demarrer();
  const arbre = await t.store.arbre();
  const rep = { point_depart: 'en_activite', statut: 'salarie_cdi', anciennete: 'plus_24_mois', taille_entreprise: '11_49', initiative: 'salarie', temps_travail: 'temps_plein', age_tranche: '30_44' };
  let c = calculerChemin(arbre, rep);
  assert.equal(c.courant.id, 'diplome');
  assert.equal(profilDuChemin(c.chemin).taille_entreprise, '11_49');
  // Le candidat devient « artisan » : les questions salarié disparaissent du profil mais l'âge est conservé.
  c = calculerChemin(arbre, { ...rep, statut: 'artisan' });
  const p = profilDuChemin(c.chemin);
  assert.equal(p.taille_entreprise, undefined);
  assert.equal(p.age_tranche, '30_44');
  assert.equal(c.courant.id, 'diplome');
  // Retour à salarié : les anciennes réponses réapparaissent.
  assert.equal(profilDuChemin(calculerChemin(arbre, rep).chemin).taille_entreprise, '11_49');
  // Parcours complet
  const complet = { ...rep, diplome: 'niveau_4', projet: 'vae', voie: 'formation_continue', rqth: 'non', minima_sociaux: 'non' };
  c = calculerChemin(arbre, complet);
  assert.equal(c.termine, true);
  const vis = construireVisible(arbre, c, [{ id: 'x', nom: 'Dispositif X', sigle: 'DX', eligibilite: 'probable' }]);
  const dim = disposer(vis.noeuds);
  assert.ok(vis.noeuds.some((n) => n.type === 'dispositif') && dim.largeur > 0 && dim.hauteur > 0);
  assert.ok(vis.noeuds.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y)));
  await t.arreter();
});

test('critères alternatifs (OU) : un groupe satisfait suffit, tous contredits écartent', () => {
  const d = fiche({ criteres_eligibilite: [], criteres_ou: [[cond('age_tranche', ['moins_16', '16_25'])], [cond('rqth', ['oui'])]] });
  assert.equal(evaluerDispositif(d, { age_tranche: '30_44', rqth: 'oui' }).eligibilite, 'probable');
  assert.equal(evaluerDispositif(d, { age_tranche: '16_25' }).eligibilite, 'probable');
  assert.equal(evaluerDispositif(d, { age_tranche: '30_44', rqth: 'non' }), null);
  const inc = evaluerDispositif(d, { age_tranche: '30_44' });
  assert.equal(inc.eligibilite, 'a_verifier'); assert.deepEqual(inc.manquants, ['rqth']);
});
