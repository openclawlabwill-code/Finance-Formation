// Panneau latéral : choix de la région, question en cours, liste des dispositifs, fiche détaillée.
import { el, vider, MENTION } from './dom.js';

const CATEGORIES = { CPF: 'CPF', abondement: 'Abondement', alternance: 'Alternance', financement_region: 'Financement Région', france_travail: 'France Travail',
  opco: 'OPCO', faf_independants: 'Fonds de formation', transitions_pro: 'Transitions Pro', agefiph_handicap: 'Handicap', accompagnement: 'Accompagnement',
  certification: 'Certification', employeur: 'Employeur', jeunes: 'Jeunes', autre: 'Autre' };
const fr = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR');

function selectRegion(etat, id, valeur, { vide } = {}) {
  const s = el('select', { id });
  if (vide) s.add(new Option(vide, ''));
  const g1 = el('optgroup', { label: 'Régions documentées' }), g2 = el('optgroup', { label: 'Régions non documentées (aucune donnée régionale)' });
  for (const r of etat.regions) (r.active ? g1 : g2).append(new Option(`${r.nom} (${r.code})`, r.code));
  if (g1.children.length) s.append(g1);
  s.append(g2);
  s.value = valeur || '';
  return s;
}

function carteRegion(etat, a) {
  const reg = etat.regions.find((r) => r.code === etat.region);
  const sRegion = selectRegion(etat, 'sel-region', etat.region);
  const sDep = el('select', { id: 'sel-dep' });
  const remplirDep = () => {
    const r = etat.regions.find((x) => x.code === sRegion.value);
    vider(sDep); sDep.add(new Option('— non précisé —', ''));
    (r?.departements || []).forEach((d) => sDep.add(new Option(`${d.nom} (${d.code})`, d.code)));
    sDep.disabled = !r?.departements.length;
    sDep.value = etat.departement && r?.departements.some((d) => d.code === etat.departement) ? etat.departement : '';
  };
  sRegion.addEventListener('change', remplirDep); remplirDep();
  const sTravail = selectRegion(etat, 'sel-travail', etat.regionTravail, { vide: '— identique à la région de résidence —' });
  return el('section', { class: 'carte-q formulaire', 'aria-labelledby': 'q-region' },
    el('h2', { id: 'q-region' }, 'Première question : région'),
    el('p', { class: 'aide' }, 'La région filtre l’ensemble des résultats. Elle reste modifiable à tout moment sans perdre le parcours.'),
    el('label', { for: 'sel-region' }, 'Région de résidence ou de formation du candidat'), sRegion,
    el('label', { for: 'sel-dep' }, 'Département (facultatif)'), sDep,
    el('label', { for: 'sel-travail' }, 'Région du lieu de travail / siège de l’employeur (salarié, si différente)'), sTravail,
    reg && !reg.active ? el('p', { class: 'alerte-region' }, 'Région non documentée : seuls les dispositifs nationaux seront présentés, sans déclinaison régionale.') : null,
    el('button', { class: 'principal', type: 'button', onClick: () => a.commencer({ region: sRegion.value, departement: sDep.value, regionTravail: sTravail.value }) }, 'Commencer l’étude'));
}

function carteQuestion(etat, a, courant) {
  return el('section', { class: 'carte-q', 'aria-labelledby': 'q-titre' },
    el('p', { class: 'petit' }, `Question ${etat.chemin.length}`),
    el('h2', { id: 'q-titre' }, courant.question),
    courant.aide ? el('p', { class: 'aide' }, courant.aide) : null,
    el('div', { class: 'choix' }, courant.options.map((o) => el('button', { type: 'button', onClick: () => a.choisir(courant.id, o.valeur) }, o.label))));
}

const BLOCS = [['national', 'Dispositifs nationaux'], ['regional', null], ['a_verifier_localement', 'À vérifier localement']];

function carteDispositif(r, a) {
  const badges = el('div', { class: 'badges' },
    el('span', { class: `badge ${r.eligibilite === 'probable' ? 'ok' : 'verif'}` }, r.eligibilite === 'probable' ? 'Éligibilité probable' : 'À vérifier'),
    el('span', { class: 'badge' }, CATEGORIES[r.categorie] || r.categorie),
    r.fiche_a_verifier ? el('span', { class: 'badge verif' }, 'Fiche à vérifier') : null,
    r.verification_perimee ? el('span', { class: 'badge alerte', title: `Dernière vérification il y a ${r.jours_depuis_verification} jours` }, 'Non vérifiée depuis plus de 90 jours') : null);
  return el('article', { class: 'fiche-carte' },
    el('h4', {}, el('button', { type: 'button', onClick: () => a.ouvrirFiche(r.id) }, r.nom + (r.sigle ? ` (${r.sigle})` : ''))),
    badges,
    el('p', {}, r.resume.length > 190 ? r.resume.slice(0, 187) + '…' : r.resume),
    r.manquants.length ? el('p', { class: 'petit' }, 'Informations manquantes : ' + r.manquants.map((m) => m.label).join(', ') + '.') : null,
    r.message_regional ? el('p', { class: 'alerte-region' }, r.message_regional + (r.contact_regional?.url ? ' — ' : ''), r.contact_regional?.url ? el('a', { href: r.contact_regional.url, target: '_blank', rel: 'noopener noreferrer' }, 'site officiel') : null) : null);
}

function listeResultats(etat, a) {
  const reg = etat.regions.find((r) => r.code === etat.region);
  const c = etat.compteurs;
  const racine = el('section', { 'aria-labelledby': 'res-titre' },
    el('h2', { id: 'res-titre', class: 'petit' }, c ? `${c.total} dispositif(s) possible(s) — ${c.probable} probable(s), ${c.a_verifier} à vérifier` : 'Dispositifs possibles'));
  if (etat.erreur) racine.append(el('p', { class: 'alerte-region', role: 'alert' }, `Erreur : ${etat.erreur}`));
  if (!etat.resultats.length) {
    racine.append(el('p', { class: 'petit' }, c && c.total === 0 ? 'Aucun dispositif ne correspond pour l’instant à ce profil dans les données chargées.' : 'Chargement…'));
  }
  for (const [bloc, titre] of BLOCS) {
    const items = etat.resultats.filter((r) => r.bloc === bloc);
    if (!items.length) continue;
    racine.append(el('div', { class: 'groupe-resultats' }, el('h3', {}, titre || `Dispositifs de la région ${reg?.nom || etat.region}`), items.map((r) => carteDispositif(r, a))));
  }
  return racine;
}

function noteSalarie(etat) {
  const salarie = ['salarie_cdi', 'salarie_cdd', 'interim', 'agent_public'].includes(etat.profil.statut);
  if (!salarie) return null;
  if (etat.regionTravail && etat.regionTravail !== etat.region) {
    const rt = etat.regions.find((r) => r.code === etat.regionTravail);
    return el('p', { class: 'alerte-region' }, `Région de résidence (${etat.regions.find((r) => r.code === etat.region)?.nom}) différente de la région de travail (${rt?.nom}) : les résultats ci-dessous suivent la région sélectionnée. Vérifier aussi les dispositifs dépendant de la région du siège ou du lieu de travail.`);
  }
  return el('p', { class: 'petit' }, 'Salarié : certains dispositifs dépendent de la région du lieu de travail ou du siège de l’employeur. Précisez-la via « Nouvelle étude » si elle diffère.');
}

function ficheDetail(etat, a) {
  const f = etat.fiche;
  const bouton = el('button', { class: 'secondaire', type: 'button', onClick: a.fermerFiche }, '← Retour aux résultats');
  if (!f) return el('div', {}, bouton, el('p', {}, 'Chargement de la fiche…'));
  const reg = f.regional;
  const sp = reg?.specificite;
  const sec = (titre, contenu) => (contenu ? [el('h3', {}, titre), contenu] : []);
  const liste = (t, ordonnee) => (t && t.length ? el(ordonnee ? 'ol' : 'ul', {}, t.map((x) => el('li', {}, x))) : null);
  const lien = (s) => el('li', {}, el('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer' }, s.intitule), ` — ${s.organisme}`);
  return el('article', { class: 'detail' }, bouton,
    el('h2', {}, f.nom + (f.sigle ? ` (${f.sigle})` : '')),
    el('div', { class: 'badges' },
      el('span', { class: 'badge' }, CATEGORIES[f.categorie] || f.categorie),
      el('span', { class: 'badge' }, f.portee_geographique),
      f.statut !== 'actif' ? el('span', { class: 'badge verif' }, f.statut === 'a_verifier' ? 'À vérifier' : f.statut) : null,
      reg?.verification_perimee ? el('span', { class: 'badge alerte' }, 'Non vérifiée depuis plus de 90 jours') : null),
    el('p', {}, f.resume),
    sec('Publics concernés', liste(f.publics_concernes)),
    sec('Ce qui est financé', f.ce_qui_est_finance ? el('p', {}, f.ce_qui_est_finance) : null),
    sec('Montant ou plafond', f.montant_ou_plafond ? el('p', {}, f.montant_ou_plafond) : null),
    sec('Points à confirmer', liste(f.criteres_a_verifier)),
    sec('Démarche', liste(f.demarche, true)),
    reg ? [el('h3', {}, `Région sélectionnée`),
      sp ? el('div', {}, el('p', {}, sp.resume), sp.montants_conditions ? el('p', {}, sp.montants_conditions) : null,
        sp.contact ? el('p', { class: 'petit' }, 'Contact : ', sp.contact.url ? el('a', { href: sp.contact.url, target: '_blank', rel: 'noopener noreferrer' }, sp.contact.organisme) : sp.contact.organisme, sp.contact.telephone ? ` — ${sp.contact.telephone}` : '') : null,
        el('ul', {}, sp.sources.map(lien)))
        : (reg.message ? el('p', { class: 'alerte-region' }, reg.message, reg.contact?.url ? [' — ', el('a', { href: reg.contact.url, target: '_blank', rel: 'noopener noreferrer' }, 'site officiel')] : null) : el('p', { class: 'petit' }, 'Pas de particularité régionale connue pour ce dispositif.'))] : null,
    sec('Sources officielles', el('ul', {}, f.sources.map(lien))),
    el('p', { class: 'petit' }, `Dernière vérification : ${fr(f.date_derniere_verification)} · dernière modification : ${fr(f.date_derniere_modification)}`),
    el('p', { class: 'mention' }, MENTION));
}

export function rendrePanneau(racine, etat, a) {
  vider(racine);
  if (etat.ficheId) { racine.append(ficheDetail(etat, a)); return; }
  if (etat.etape === 'region') { racine.append(carteRegion(etat, a)); return; }
  if (etat.courant) racine.append(carteQuestion(etat, a, etat.courant));
  else racine.append(el('p', { class: 'carte-q' }, 'Parcours terminé. Vous pouvez modifier une réponse dans le fil d’Ariane ou sur la carte.'));
  racine.append(el('button', { class: 'principal', type: 'button', onClick: a.synthese }, etat.termine ? 'Générer la synthèse de l’étude' : 'Synthèse provisoire de l’étude'));
  const note = noteSalarie(etat);
  if (note) racine.append(note);
  racine.append(listeResultats(etat, a), el('p', { class: 'mention' }, MENTION));
}
