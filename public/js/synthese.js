// Écrans « Synthèse de l'étude » (aperçu ou étude enregistrée) et « Historique ». Tout est construit avec du texte (pas d'innerHTML).
import { el, vider, MENTION } from './dom.js';

const fr = (iso) => new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const BLOCS = [['national', 'Dispositifs nationaux'], ['regional', null], ['a_verifier_localement', 'À vérifier localement']];
const LABEL_ACTEUR = (a) => a.replace(/_/g, ' ');

function carteSynthese(r) {
  return el('article', { class: 'fiche-synthese' },
    el('h4', {}, r.nom + (r.sigle ? ` (${r.sigle})` : ''),
      ' ', el('span', { class: `badge ${r.eligibilite === 'probable' ? 'ok' : 'verif'}` }, r.eligibilite === 'probable' ? 'Éligibilité probable' : 'À vérifier')),
    el('p', {}, r.resume),
    r.ce_qui_est_finance ? el('p', {}, el('strong', {}, 'Ce qui est financé : '), r.ce_qui_est_finance) : null,
    r.montant_ou_plafond ? el('p', {}, el('strong', {}, 'Montant ou plafond : '), r.montant_ou_plafond) : null,
    r.manquants?.length ? el('p', {}, el('strong', {}, 'Informations manquantes pour conclure : '), r.manquants.join(', ')) : null,
    r.a_confirmer?.length ? el('p', {}, el('strong', {}, 'Points à confirmer : '), r.a_confirmer.join(' ; ')) : null,
    r.specificite_regionale ? el('p', {}, el('strong', {}, 'Spécificité régionale vérifiée : '), r.specificite_regionale) : null,
    r.message_regional ? el('p', { class: 'alerte-region' }, r.message_regional, r.contact_regional?.url ? [' — ', el('a', { href: r.contact_regional.url, target: '_blank', rel: 'noopener noreferrer' }, r.contact_regional.url)] : null) : null,
    r.fiche_a_verifier ? el('p', { class: 'alerte-region' }, 'Fiche à vérifier : contenu non entièrement confirmé par les sources.') : null,
    r.verification_perimee ? el('p', { class: 'alerte-region' }, 'Alerte : fiche non vérifiée depuis plus de 90 jours.') : null,
    el('p', { class: 'petit' }, `Sources officielles (vérifiées le ${fr(r.date_derniere_verification)}) :`),
    el('ul', { class: 'petit' }, r.sources.map((s) => el('li', {}, el('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer' }, s.intitule), ` — ${s.organisme}`))));
}

/** Document de synthèse imprimable. */
export function documentSynthese(e) {
  const doc = el('article', { class: 'document-synthese', id: 'document-synthese', 'aria-label': 'Synthèse de l’étude' });
  doc.append(el('h1', {}, 'Synthèse d’étude de financement', el('span', { id: 'ref-titre' }, e.reference_dossier ? ` — réf. ${e.reference_dossier}` : '')));
  doc.append(el('ul', { class: 'meta' },
    el('li', {}, el('strong', {}, 'Date : '), fr(e.date || new Date().toISOString())),
    el('li', {}, el('strong', {}, 'Région de résidence ou de formation : '), `${e.region_nom} (${e.region})`, e.departement_nom ? ` — ${e.departement_nom}` : ''),
    e.region_travail_nom ? el('li', {}, el('strong', {}, 'Région du lieu de travail / siège employeur : '), e.region_travail_nom) : null,
    el('li', {}, el('strong', {}, 'Étude : '), e.complet ? 'parcours complet' : 'parcours incomplet (informations manquantes, résultats provisoires)')));
  doc.append(el('h2', {}, 'Situation du candidat'),
    e.parcours.length ? el('ul', {}, e.parcours.map((p) => el('li', {}, `${p.question} `, el('strong', {}, p.label)))) : el('p', { class: 'petit' }, 'Aucune réponse renseignée.'));
  doc.append(el('h2', {}, `Dispositifs possibles (${e.resultats.length})`));
  if (!e.resultats.length) doc.append(el('p', { class: 'petit' }, 'Aucun dispositif ne correspond à ce profil dans les données chargées.'));
  for (const [bloc, titre] of BLOCS) {
    const items = e.resultats.filter((r) => r.bloc === bloc);
    if (items.length) doc.append(el('h3', {}, titre || `Dispositifs de la région ${e.region_nom}`), ...items.map(carteSynthese));
  }
  doc.append(el('h2', {}, `Contacts et sources régionaux — ${e.region_nom}`));
  const contacts = el('ul', {});
  if (e.site_conseil_regional) contacts.append(el('li', {}, 'Conseil régional : ', el('a', { href: e.site_conseil_regional, target: '_blank', rel: 'noopener noreferrer' }, e.site_conseil_regional)));
  for (const c of e.contacts_regionaux || []) contacts.append(el('li', {}, `${c.organisme} (${LABEL_ACTEUR(c.acteur)}) : `, el('a', { href: c.url, target: '_blank', rel: 'noopener noreferrer' }, c.url)));
  doc.append(contacts.children.length ? contacts : el('p', { class: 'petit' }, 'Contacts régionaux non encore documentés pour cette région.'));
  doc.append(el('div', { id: 'notes-doc' }, e.notes ? [el('h2', {}, 'Notes'), el('p', {}, e.notes)] : null));
  doc.append(el('p', { class: 'mention' }, MENTION));
  return doc;
}

/** Écran synthèse : mode 'apercu' (modifiable, enregistrable) ou 'enregistree' (lecture seule). */
export function rendreSynthese(racine, etat, a) {
  vider(racine);
  const { snap, mode, message, erreur } = etat.synthese;
  const bar = el('div', { class: 'barre-synthese no-print' },
    el('button', { class: 'secondaire', type: 'button', onClick: a.retourSynthese }, mode === 'apercu' ? '← Retour à l’étude' : '← Retour à l’historique'),
    mode === 'apercu' ? el('button', { class: 'principal', type: 'button', onClick: a.enregistrer }, 'Enregistrer l’étude') : el('button', { class: 'principal', type: 'button', onClick: a.reprendre }, 'Reprendre cette étude'),
    el('button', { class: 'secondaire', type: 'button', onClick: () => window.print() }, 'Imprimer / PDF'),
    el('button', { class: 'secondaire', type: 'button', onClick: a.exporterMarkdown }, 'Exporter en Markdown'));
  racine.append(bar);
  if (message) racine.append(el('p', { class: 'ok-msg no-print', role: 'status' }, message));
  if (erreur) racine.append(el('p', { class: 'alerte-region no-print', role: 'alert' }, erreur));
  if (mode === 'apercu') {
    const ref = el('input', { id: 'ref-dossier', type: 'text', maxlength: '60', autocomplete: 'off', value: snap.reference_dossier || '', placeholder: 'ex. DOSSIER-2026-014',
      onInput: (e) => { snap.reference_dossier = e.target.value; document.getElementById('ref-titre').textContent = e.target.value ? ` — réf. ${e.target.value}` : ''; } });
    const notes = el('textarea', { id: 'notes-etude', rows: '3', maxlength: '2000', onInput: (e) => {
      snap.notes = e.target.value;
      const n = document.getElementById('notes-doc'); vider(n);
      if (e.target.value) n.append(el('h2', {}, 'Notes'), el('p', {}, e.target.value));
    } }, snap.notes || '');
    racine.append(el('div', { class: 'formulaire no-print carte' },
      el('label', { for: 'ref-dossier' }, 'Référence dossier (champ libre)'), ref,
      el('p', { class: 'petit' }, 'Aucune donnée identifiante : pas de nom, prénom, e-mail, téléphone ni numéro de sécurité sociale. Utilisez une référence anonyme.'),
      el('label', { for: 'notes-etude' }, 'Notes (facultatif, sans donnée identifiante)'), notes));
  } else {
    racine.append(el('p', { class: 'petit no-print' }, `Étude enregistrée le ${fr(snap.date)} — contenu figé à cette date (les fiches ont pu évoluer depuis).`));
  }
  racine.append(documentSynthese(snap));
}

export function rendreHistorique(racine, etat, a) {
  vider(racine);
  racine.append(el('div', { class: 'barre-synthese no-print' }, el('button', { class: 'secondaire', type: 'button', onClick: a.retourEtude }, '← Retour à l’étude')),
    el('h1', {}, 'Historique des études'),
    el('p', { class: 'petit' }, 'Études enregistrées sur ce poste, sans donnée personnelle identifiante (référence dossier libre).'));
  if (etat.historiqueErreur) racine.append(el('p', { class: 'alerte-region', role: 'alert' }, etat.historiqueErreur));
  if (!etat.historique.length) { racine.append(el('p', {}, 'Aucune étude enregistrée pour le moment.')); return; }
  const table = el('table', { class: 'tableau' },
    el('thead', {}, el('tr', {}, ['Date', 'Référence', 'Région', 'Résultats', 'Parcours', 'Actions'].map((t) => el('th', { scope: 'col' }, t)))),
    el('tbody', {}, etat.historique.map((h) => el('tr', {},
      el('td', {}, fr(h.date)), el('td', {}, h.reference_dossier || '—'), el('td', {}, h.region_nom), el('td', {}, String(h.nb_resultats)), el('td', {}, h.complet ? 'complet' : 'incomplet'),
      el('td', { class: 'actions-tableau' },
        el('button', { class: 'secondaire', type: 'button', onClick: () => a.ouvrirEtude(h.id) }, 'Ouvrir'),
        el('button', { class: 'secondaire', type: 'button', onClick: () => a.exporterEtude(h.id) }, 'Markdown'),
        el('button', { class: 'secondaire', type: 'button', onClick: () => a.supprimerEtude(h.id) }, 'Supprimer'))))));
  racine.append(table);
}
