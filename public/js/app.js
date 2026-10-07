// Orchestration : état de l'étude, appels API, rendu de la carte, du fil d'Ariane, de la liste et du panneau.
import { el, vider } from './dom.js';
import { calculerChemin, profilDuChemin, construireVisible, reponsesLisibles } from './arbre-logique.js';
import { creerCarte } from './mindmap.js';
import { rendrePanneau } from './panneau.js';
import { rendreBandeau } from './bandeau.js';
import { rendreSynthese, rendreHistorique } from './synthese.js';

const $ = (id) => document.getElementById(id);
const etat = { arbre: null, attributs: null, regions: [], regionParDefaut: '52', region: null, departement: '', regionTravail: '',
  reponses: {}, etape: 'region', resultats: [], compteurs: null, vue: 'carte', ficheId: null, fiche: null, erreur: null,
  chemin: [], courant: null, termine: false, profil: {},
  ecran: 'etude', synthese: null, historique: [], historiqueErreur: null,
  actualites: [], actualitesOuvertes: false, actualitesErreur: null };

const memo = {
  lire: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  ecrire: (k, v) => { try { localStorage.setItem(k, v); } catch { /* stockage indisponible : ignoré */ } },
};
async function api(url, opts = {}) {
  const r = await fetch(url, { method: opts.method || 'GET', headers: { 'content-type': 'application/json' }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const j = await r.json();
  if (!r.ok) throw new Error(j.erreur + (j.details ? ` (${[].concat(j.details).join(' ; ')})` : ''));
  return j;
}

let carte;
const nomRegion = (code) => etat.regions.find((r) => r.code === code)?.nom || code;

// ---------- Actions ----------
const actions = {
  commencer({ region, departement, regionTravail }) {
    etat.region = region; etat.departement = departement; etat.regionTravail = regionTravail;
    memo.ecrire('region', region);
    etat.etape = 'arbre';
    chargerActualites();
    recalculer();
  },
  choisir(noeudId, valeur) {
    const noeud = etat.arbre.noeuds.find((n) => n.id === noeudId);
    etat.reponses[noeud.attribut] = valeur;
    etat.ficheId = null;
    recalculer();
  },
  async ouvrirFiche(id) {
    etat.ficheId = id; etat.fiche = null; rendreTout();
    try { etat.fiche = await api(`/api/dispositifs/${encodeURIComponent(id)}?region=${etat.region}`); }
    catch (e) { etat.erreur = e.message; etat.ficheId = null; }
    rendreTout();
  },
  basculerActualites() { etat.actualitesOuvertes = !etat.actualitesOuvertes; rendreBandeau($('bandeau-actualites'), etat, actions); },
  fermerFiche() { etat.ficheId = null; etat.fiche = null; rendreTout(); },

  // ----- Synthèse, enregistrement, historique, export -----
  async synthese() {
    try {
      const snap = await api('/api/etudes/apercu', { method: 'POST', body: { region: etat.region, region_travail: etat.regionTravail || undefined, departement: etat.departement || undefined, profil: etat.profil } });
      etat.synthese = { snap, mode: 'apercu', message: null, erreur: null };
      etat.ecran = 'synthese';
    } catch (e) { etat.erreur = e.message; }
    rendreTout();
  },
  async enregistrer() {
    const { snap } = etat.synthese;
    try {
      const saved = await api('/api/etudes', { method: 'POST', body: { region: etat.region, region_travail: etat.regionTravail || undefined, departement: etat.departement || undefined, profil: etat.profil, reference_dossier: snap.reference_dossier || '', notes: snap.notes || '' } });
      etat.synthese = { snap: saved, mode: 'enregistree', origine: 'etude', message: 'Étude enregistrée dans l’historique local.', erreur: null };
    } catch (e) { etat.synthese.erreur = e.message; etat.synthese.message = null; }
    rendreTout();
  },
  retourSynthese() {
    if (etat.synthese?.mode === 'enregistree' && etat.synthese.origine === 'historique') return actions.ouvrirHistorique();
    etat.ecran = 'etude'; rendreTout();
  },
  retourEtude() { etat.ecran = 'etude'; rendreTout(); },
  async exporterMarkdown() {
    const { snap, mode } = etat.synthese;
    try {
      if (mode === 'apercu') await telecharger('/api/etudes/apercu?format=md', { method: 'POST', body: { region: etat.region, region_travail: etat.regionTravail || undefined, departement: etat.departement || undefined, profil: etat.profil, reference_dossier: snap.reference_dossier || '', notes: snap.notes || '' } }, 'synthese-etude.md');
      else await actions.exporterEtude(snap.id);
    } catch (e) { etat.synthese.erreur = e.message; rendreTout(); }
  },
  async exporterEtude(id) {
    try { await telecharger(`/api/etudes/${encodeURIComponent(id)}/export.md`, {}, `synthese-${id}.md`); }
    catch (e) { etat.historiqueErreur = e.message; rendreTout(); }
  },
  reprendre() {
    const { snap } = etat.synthese;
    Object.assign(etat, { reponses: { ...snap.profil }, region: snap.region, departement: snap.departement || '', regionTravail: snap.region_travail || '', etape: 'arbre', ficheId: null, fiche: null, ecran: 'etude' });
    recalculer();
  },
  async ouvrirHistorique() {
    etat.historiqueErreur = null;
    try { etat.historique = (await api('/api/etudes')).etudes; } catch (e) { etat.historiqueErreur = e.message; etat.historique = []; }
    etat.ecran = 'historique'; rendreTout();
  },
  async ouvrirEtude(id) {
    try { etat.synthese = { snap: await api(`/api/etudes/${encodeURIComponent(id)}`), mode: 'enregistree', origine: 'historique', message: null, erreur: null }; etat.ecran = 'synthese'; }
    catch (e) { etat.historiqueErreur = e.message; }
    rendreTout();
  },
  async supprimerEtude(id) {
    if (!window.confirm('Supprimer définitivement cette étude de l’historique local ?')) return;
    try { await api(`/api/etudes/${encodeURIComponent(id)}`, { method: 'DELETE' }); await actions.ouvrirHistorique(); }
    catch (e) { etat.historiqueErreur = e.message; rendreTout(); }
  },
};

async function telecharger(url, opts, nom) {
  const r = await fetch(url, { method: opts.method || 'GET', headers: { 'content-type': 'application/json' }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  if (!r.ok) { let m = r.statusText; try { m = (await r.json()).erreur || m; } catch { /* corps non JSON */ } throw new Error(m); }
  const url2 = URL.createObjectURL(await r.blob());
  const a = el('a', { href: url2, download: nom });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url2), 1000);
}

function nouvelleEtude() {
  Object.assign(etat, { ecran: 'etude', synthese: null, reponses: {}, etape: 'region', ficheId: null, fiche: null, resultats: [], compteurs: null, departement: '', regionTravail: '' });
  etat.region = memo.lire('region') && etat.regions.some((r) => r.code === memo.lire('region')) ? memo.lire('region') : etat.regionParDefaut;
  calculerLocal(); rendreTout(); chargerActualites();
}

async function chargerActualites() {
  try { etat.actualites = (await api(`/api/actualites?region=${encodeURIComponent(etat.region || etat.regionParDefaut)}`)).actualites; etat.actualitesErreur = null; }
  catch (e) { etat.actualites = []; etat.actualitesErreur = e.message; }
  rendreBandeau($('bandeau-actualites'), etat, actions);
}

// ---------- Calcul ----------
function calculerLocal() {
  const c = calculerChemin(etat.arbre, etat.reponses);
  Object.assign(etat, { chemin: c.chemin, courant: c.courant, termine: c.termine, profil: profilDuChemin(c.chemin) });
}
let sequence = 0;
async function recalculer() {
  calculerLocal(); rendreTout();
  const n = ++sequence;
  try {
    const r = await api('/api/evaluer', { method: 'POST', body: { region: etat.region, profil: etat.profil } });
    if (n !== sequence) return;
    etat.resultats = r.resultats; etat.compteurs = r.compteurs; etat.erreur = null;
  } catch (e) { if (n === sequence) etat.erreur = e.message; }
  rendreTout();
}

// ---------- Rendu ----------
function rendreFil() {
  const nav = vider($('fil'));
  const ol = el('ol');
  ol.append(el('li', {}, el('button', { type: 'button', onClick: () => $('badge-region').click() }, `Région : ${etat.region ? nomRegion(etat.region) : '—'}`)));
  if (etat.etape === 'arbre') {
    for (const r of reponsesLisibles(etat.chemin)) {
      ol.append(el('li', {}, el('button', { type: 'button', title: `Modifier : ${r.question}`, onClick: () => { delete etat.reponses[r.attribut]; etat.ficheId = null; recalculer(); } }, r.label)));
    }
    if (etat.courant) ol.append(el('li', { class: 'courant', 'aria-current': 'step' }, 'à préciser…'));
  }
  nav.append(ol);
}

function rendreListe() {
  const zone = vider($('vue-liste'));
  if (etat.etape !== 'arbre') { zone.append(el('p', {}, 'Choisissez d’abord la région dans le panneau.')); return; }
  const f = el('div', { class: 'formulaire' }, el('h2', {}, 'Parcours sous forme de liste'));
  for (const { noeud, option } of etat.chemin) {
    const id = `liste-${noeud.id}`;
    const s = el('select', { id, onChange: (e) => e.target.value && actions.choisir(noeud.id, e.target.value) });
    if (!option) s.add(new Option('— choisir —', ''));
    noeud.options.forEach((o) => s.add(new Option(o.label, o.valeur)));
    s.value = option ? option.valeur : '';
    f.append(el('label', { for: id }, noeud.question), s);
  }
  zone.append(f);
}

function rendreTout() {
  const etude = etat.ecran === 'etude';
  document.querySelector('.mise-en-page').hidden = !etude; $('fil').hidden = !etude;
  const bandeau = $('bandeau-actualites'); if (bandeau) bandeau.hidden = !etude;
  $('ecran-synthese').hidden = etat.ecran !== 'synthese'; $('ecran-historique').hidden = etat.ecran !== 'historique';
  if (etat.ecran === 'synthese') { rendreSynthese($('ecran-synthese'), etat, actions); return; }
  if (etat.ecran === 'historique') { rendreHistorique($('ecran-historique'), etat, actions); return; }
  rendreFil();
  $('badge-region').textContent = `${etat.region ? nomRegion(etat.region) : 'Région'} (${etat.region || '—'}) ✎`;
  const racine = { id: 'racine', parent: null, depth: 0, label: 'Situation du candidat', type: 'situation', etat: 'racine' };
  const visible = etat.etape === 'arbre' ? construireVisible(etat.arbre, { chemin: etat.chemin, termine: etat.termine }, etat.resultats) : { noeuds: [racine], legendes: [] };
  const liste = etat.vue === 'liste';
  $('zone-svg').hidden = liste; $('vue-liste').hidden = !liste;
  $('btn-vue').textContent = liste ? 'Vue carte' : 'Vue liste';
  if (liste) rendreListe(); else carte.rendre(visible);
  rendrePanneau($('panneau'), etat, actions);
}

// ---------- Région modifiable à tout moment (badge) ----------
function ouvrirDialogueRegion() {
  const d = $('dialogue-region'), s = $('dlg-region');
  vider(s);
  for (const r of etat.regions) s.add(new Option(`${r.nom} (${r.code})${r.active ? '' : ' — non documentée'}`, r.code));
  s.value = etat.region || etat.regionParDefaut;
  d.showModal();
}

async function init() {
  carte = creerCarte($('carte'), { onChoisir: actions.choisir, onFiche: actions.ouvrirFiche });
  $('zoom-plus').addEventListener('click', carte.zoomPlus);
  $('zoom-moins').addEventListener('click', carte.zoomMoins);
  $('zoom-tout').addEventListener('click', carte.toutVoir);
  $('zoom-suivre').addEventListener('click', () => carte.suivreFrontiere(true));
  $('btn-nouvelle').addEventListener('click', nouvelleEtude);
  $('btn-historique').addEventListener('click', actions.ouvrirHistorique);
  $('btn-vue').addEventListener('click', () => { etat.vue = etat.vue === 'carte' ? 'liste' : 'carte'; rendreTout(); });
  $('badge-region').addEventListener('click', ouvrirDialogueRegion);
  $('dialogue-region').addEventListener('close', () => {
    const d = $('dialogue-region');
    if (d.returnValue === 'ok' && $('dlg-region').value !== etat.region) {
      etat.region = $('dlg-region').value; etat.departement = ''; memo.ecrire('region', etat.region);
      chargerActualites();
      if (etat.etape === 'arbre') recalculer(); else rendreTout();
    }
  });
  try {
    const [arbre, attributs, regs] = await Promise.all([api('/api/arbre'), api('/api/attributs'), api('/api/regions')]);
    Object.assign(etat, { arbre, attributs, regions: regs.regions, regionParDefaut: regs.region_par_defaut });
    nouvelleEtude();
  } catch (e) { $('panneau').textContent = `Impossible de charger les données : ${e.message}`; }
}
init();
