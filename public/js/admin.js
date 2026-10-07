// Page /admin : file de propositions (diff avant/après), couverture régionale, journal et sauvegardes. Pas d'innerHTML.
import { el, vider } from './dom.js';

const racine = document.getElementById('admin');
const fr = (iso) => (iso ? new Date(iso).toLocaleString('fr-FR') : '—');
const frj = (iso) => (iso ? new Date(iso).toLocaleDateString('fr-FR') : '—');
async function api(url, opts = {}) {
  const r = await fetch(url, { method: opts.method || 'GET', headers: { 'content-type': 'application/json' }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const j = await r.json();
  if (!r.ok) throw new Error(j.erreur + (j.details ? ` (${[].concat(j.details).map((d) => (d.message ? `${d.chemin} ${d.message}` : d)).join(' ; ')})` : ''));
  return j;
}
const add = (n, ...x) => n.append(...x.flat().filter(Boolean));
const montrer = (v) => (v === null || v === undefined ? el('em', {}, '(absent)') : el('pre', {}, typeof v === 'string' ? v : JSON.stringify(v, null, 2)));
const msg = (texte, erreur) => el('p', { class: erreur ? 'alerte-region' : 'ok-msg', role: erreur ? 'alert' : 'status' }, texte);

// ---------- Propositions ----------
let filtre = 'en_attente';
async function vuePropositions(zone, detailId) {
  vider(zone);
  if (detailId) return vueDetail(zone, detailId);
  const sel = el('select', { id: 'filtre', 'aria-label': 'Filtrer par statut', onChange: (e) => { filtre = e.target.value; vuePropositions(zone); } });
  for (const [v, l] of [['en_attente', 'En attente'], ['', 'Toutes'], ['acceptee', 'Acceptées'], ['acceptee_auto', 'Acceptées (auto)'], ['refusee', 'Refusées']]) sel.add(new Option(l, v));
  sel.value = filtre;
  add(zone, el('h2', {}, 'Propositions de mise à jour'), el('label', { for: 'filtre' }, 'Statut : '), sel);
  let liste;
  try { liste = (await api(`/api/admin/propositions${filtre ? `?statut=${filtre}` : ''}`)).propositions; } catch (e) { add(zone, msg(e.message, true)); return; }
  if (!liste.length) { add(zone, el('p', {}, 'Aucune proposition.')); return; }
  add(zone, el('table', { class: 'tableau' },
    el('thead', {}, el('tr', {}, ['Date', 'Agent', 'Région', 'Action', 'Dispositif', 'Modifications', 'Statut', ''].map((t) => el('th', { scope: 'col' }, t)))),
    el('tbody', {}, liste.map((p) => el('tr', {},
      el('td', {}, fr(p.date_depot)), el('td', {}, p.agent || '—'), el('td', {}, p.region), el('td', {}, p.action), el('td', {}, p.dispositif_id || '—'), el('td', {}, String(p.nb_modifications)),
      el('td', {}, el('span', { class: `statut-prop ${p.statut}` }, p.statut.replace('_', ' '))),
      el('td', {}, el('button', { type: 'button', class: 'secondaire', onClick: () => vuePropositions(zone, p.id) }, 'Examiner')))))));
}

async function vueDetail(zone, id, message, erreur) {
  vider(zone);
  let p;
  try { p = await api(`/api/admin/propositions/${encodeURIComponent(id)}`); } catch (e) { add(zone, msg(e.message, true)); return; }
  const decider = async (chemin, corps) => {
    try { const r = await api(`/api/admin/propositions/${encodeURIComponent(id)}/${chemin}`, { method: 'POST', body: corps || {} }); await vueDetail(zone, id, `Proposition ${r.statut === 'refusee' ? 'refusée' : 'acceptée et appliquée'}.`); }
    catch (e) { await vueDetail(zone, id, null, e.message); }
  };
  add(zone, el('button', { type: 'button', class: 'secondaire', onClick: () => vuePropositions(zone) }, '← Retour à la liste'),
    el('h2', {}, `${p.action} — ${p.dispositif_id || ''} — région ${p.region}`),
    el('p', {}, el('span', { class: `statut-prop ${p.statut}` }, p.statut.replace('_', ' ')), ` déposée le ${fr(p.date_depot)} par ${p.agent || 'agent inconnu'}`),
    p.motif ? el('p', {}, el('strong', {}, 'Motif : '), p.motif) : null, message ? msg(message) : null, erreur ? msg(erreur, true) : null);
  add(zone, el('h3', {}, 'Sources officielles fournies'), el('ul', {}, p.sources.map((s) => el('li', {},
    el('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer' }, s.intitule), ` — ${s.organisme}`, el('br'), el('em', {}, `« ${s.extrait} »`)))));
  add(zone, el('h3', {}, `Modifications (${p.diff.length})`),
    el('table', { class: 'diff' }, el('thead', {}, el('tr', {}, ['Champ', 'Avant', 'Après'].map((t) => el('th', { scope: 'col' }, t)))),
      el('tbody', {}, p.diff.map((d) => el('tr', {}, el('td', {}, d.chemin || '(objet entier)'), el('td', { class: 'avant' }, montrer(d.avant)), el('td', { class: 'apres' }, montrer(d.apres)))))));
  if (p.statut === 'en_attente') {
    const motif = el('input', { type: 'text', id: 'motif-refus', maxlength: '500', placeholder: 'Motif du refus (facultatif)' });
    add(zone, el('div', { class: 'ligne-actions' },
      el('button', { type: 'button', class: 'principal', onClick: () => decider('accepter') }, 'Accepter et appliquer'),
      el('label', { for: 'motif-refus', class: 'no-print' }, 'Refuser : '), motif,
      el('button', { type: 'button', class: 'secondaire', onClick: () => decider('refuser', { motif: motif.value }) }, 'Refuser')),
      el('p', { class: 'petit' }, 'Avant toute application, la fiche actuelle est sauvegardée et l’opération est inscrite au journal.'));
  } else if (p.motif_refus) add(zone, el('p', {}, el('strong', {}, 'Motif du refus : '), p.motif_refus));
}

// ---------- Couverture ----------
async function vueCouverture(zone) {
  vider(zone);
  add(zone, el('h2', {}, 'Couverture régionale'));
  let regs;
  try { regs = (await api('/api/regions')); } catch (e) { add(zone, msg(e.message, true)); return; }
  const sel = el('select', { id: 'sel-cov', 'aria-label': 'Région', onChange: () => charger(sel.value) });
  for (const r of regs.regions) sel.add(new Option(`${r.nom} (${r.code})${r.active ? '' : ' — non documentée'}`, r.code));
  sel.value = regs.region_par_defaut;
  const sortie = el('div', {});
  add(zone, el('label', { for: 'sel-cov' }, 'Région : '), sel, sortie);
  async function charger(code) {
    vider(sortie);
    let c; try { c = await api(`/api/admin/couverture?region=${code}`); } catch (e) { add(sortie, msg(e.message, true)); return; }
    const s = c.synthese, pct = (v) => (v === null ? 'n/a' : `${v} %`);
    add(sortie, el('div', { class: 'grille-synthese' },
      el('div', { class: 'chiffre' }, el('b', {}, pct(s.taux_acteurs)), `acteurs régionaux documentés (${s.acteurs_documentes}/${s.acteurs_total})`),
      el('div', { class: 'chiffre' }, el('b', {}, pct(s.taux_declinaisons)), `déclinaisons régionales documentées (${s.declinaisons_documentees}/${s.declinaisons_requises})`),
      el('div', { class: 'chiffre' }, el('b', {}, String(s.fiches_perimees)), 'fiches non vérifiées depuis plus de 90 jours'),
      el('div', { class: 'chiffre' }, el('b', {}, String(s.fiches_a_verifier)), 'fiches au statut « à vérifier »'),
      el('div', { class: 'chiffre' }, el('b', { class: s.site_conseil_regional ? 'oui' : 'non' }, s.site_conseil_regional ? 'oui' : 'non'), 'site du Conseil régional renseigné')));
    add(sortie, el('h3', {}, 'Acteurs régionaux'), el('table', { class: 'tableau' },
      el('thead', {}, el('tr', {}, ['Acteur', 'Documenté', 'Sources (dernière vérification)'].map((t) => el('th', { scope: 'col' }, t)))),
      el('tbody', {}, c.acteurs.map((a) => el('tr', {}, el('td', {}, a.acteur.replace(/_/g, ' ')), el('td', { class: a.documente ? 'oui' : 'non' }, a.documente ? 'oui' : 'non'),
        el('td', {}, a.sources.length ? a.sources.map((x) => el('div', {}, el('a', { href: x.url, target: '_blank', rel: 'noopener noreferrer' }, x.organisme), ` (${frj(x.date_verification)})`)) : '—'))))));
    add(sortie, el('h3', {}, 'Dispositifs concernant la région'), el('table', { class: 'tableau' },
      el('thead', {}, el('tr', {}, ['Dispositif', 'Bloc', 'Déclinaison requise', 'Documentée', 'Vérifiée depuis', 'Statut'].map((t) => el('th', { scope: 'col' }, t)))),
      el('tbody', {}, c.fiches.map((f) => el('tr', {}, el('td', {}, f.nom), el('td', {}, f.bloc.replace(/_/g, ' ')), el('td', {}, f.declinaison_requise ? 'oui' : 'non'),
        el('td', { class: !f.declinaison_requise ? '' : f.documentee ? 'oui' : 'non' }, f.declinaison_requise ? (f.documentee ? 'oui' : 'non') : '—'),
        el('td', { class: f.verification_perimee ? 'non' : '' }, f.jours_depuis_verification === null ? '—' : `${f.jours_depuis_verification} j${f.verification_perimee ? ' (périmée)' : ''}`), el('td', {}, f.statut))))));
  }
  charger(sel.value);
}

// ---------- Journal et sauvegardes ----------
async function vueJournal(zone, message, erreur) {
  vider(zone);
  add(zone, el('h2', {}, 'Journal des mises à jour'), message ? msg(message) : null, erreur ? msg(erreur, true) : null);
  try {
    const [j, b] = await Promise.all([api('/api/admin/journal?limite=100'), api('/api/admin/backups')]);
    add(zone, j.entrees.length ? el('table', { class: 'tableau' },
      el('thead', {}, el('tr', {}, ['Date', 'Source', 'Région', 'Dispositif', 'Action', 'Résultat'].map((t) => el('th', { scope: 'col' }, t)))),
      el('tbody', {}, j.entrees.map((e) => el('tr', {}, el('td', {}, fr(e.date)), el('td', {}, e.source || ''), el('td', {}, e.region || ''), el('td', {}, e.dispositif || ''), el('td', {}, e.action || ''), el('td', {}, e.resultat || '', e.motif ? ` — ${e.motif}` : ''))))) : el('p', {}, 'Journal vide.'));
    add(zone, el('h2', {}, 'Sauvegardes automatiques'), el('p', { class: 'petit' }, 'Chaque modification sauvegarde la version précédente. Restaurer remet cette version (la version actuelle est elle-même sauvegardée).'));
    add(zone, b.backups.length ? el('ul', {}, b.backups.slice(0, 60).map((n) => el('li', {}, n, ' ',
      el('button', { type: 'button', class: 'secondaire petit-bouton', onClick: async () => {
        if (!window.confirm(`Restaurer ${n} ?`)) return;
        try { await api('/api/admin/restaurer', { method: 'POST', body: { backup: n } }); await vueJournal(zone, `Sauvegarde ${n} restaurée.`); } catch (e) { await vueJournal(zone, null, e.message); }
      } }, 'Restaurer')))) : el('p', {}, 'Aucune sauvegarde.'));
  } catch (e) { add(zone, msg(e.message, true)); }
}

// ---------- Onglets ----------
const vues = { propositions: vuePropositions, couverture: vueCouverture, journal: vueJournal };
function activer(nom) {
  for (const b of document.querySelectorAll('.onglets button')) b.setAttribute('aria-selected', String(b.dataset.onglet === nom));
  vues[nom](racine);
}
for (const b of document.querySelectorAll('.onglets button')) b.addEventListener('click', () => activer(b.dataset.onglet));
activer('propositions');
