// Bandeau d'actualités : national + région choisie. Un clic ouvre la fiche du dispositif concerné.
import { el, vider } from './dom.js';

const fr = (iso) => new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const NB_VISIBLES = 3;

export function rendreBandeau(racine, etat, a) {
  vider(racine);
  racine.classList.toggle('ouvert', !!etat.actualitesOuvertes);
  if (etat.actualitesErreur) { racine.append(el('span', {}, 'Actualités indisponibles.')); return; }
  const liste = etat.actualites;
  if (!liste.length) { racine.append(el('strong', {}, 'Actualités : '), 'aucune actualité pour cette région pour le moment.'); return; }
  const nomRegion = (code) => (code === 'national' ? 'National' : etat.regions.find((r) => r.code === code)?.nom || code);
  const item = (n) => el('li', {},
    el('span', { class: `etiquette-actu ${n.region === 'national' ? '' : 'regionale'}` }, nomRegion(n.region)),
    el('time', { datetime: n.date }, fr(n.date)), ' ',
    el('button', { type: 'button', class: 'lien-actu', title: n.resume || n.titre, onClick: () => a.ouvrirFiche(n.dispositif_id) }, n.titre),
    ' ', el('a', { href: n.url, target: '_blank', rel: 'noopener noreferrer', 'aria-label': `Source : ${n.organisme}` }, 'source ↗'));
  const visibles = etat.actualitesOuvertes ? liste : liste.slice(0, NB_VISIBLES);
  racine.append(el('strong', {}, 'Actualités'), el('ul', { class: 'liste-actus' }, visibles.map(item)));
  if (liste.length > NB_VISIBLES) {
    racine.append(el('button', { type: 'button', class: 'secondaire petit-bouton', 'aria-expanded': String(!!etat.actualitesOuvertes), onClick: a.basculerActualites },
      etat.actualitesOuvertes ? 'Réduire' : `Toutes (${liste.length})`));
  }
}
