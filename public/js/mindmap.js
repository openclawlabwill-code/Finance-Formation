// Mind map SVG maison : arbre horizontal, zoom (molette / pincement), déplacement (souris / tactile), navigation clavier.
import { disposer } from './arbre-logique.js';

const NS = 'http://www.w3.org/2000/svg';
const L = 214, H = 34, MARGE_HAUT = 46, MARGE = 24;
const svgEl = (tag, attrs = {}, texte) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (texte !== undefined) e.textContent = texte;
  return e;
};
const coupe = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

export function creerCarte(svg, { onChoisir, onFiche }) {
  const vue = { x: MARGE, y: MARGE, k: 1 };
  const monde = svgEl('g', { class: 'monde' });
  svg.append(monde);
  let derniere = null;

  const appliquer = (anime = false) => {
    monde.style.transition = anime ? 'transform .35s ease' : 'none';
    monde.style.transform = `translate(${vue.x}px, ${vue.y}px) scale(${vue.k})`;
  };

  function zoomer(facteur, cx, cy) {
    const k = Math.min(2.5, Math.max(0.25, vue.k * facteur));
    const r = k / vue.k;
    vue.x = cx - (cx - vue.x) * r; vue.y = cy - (cy - vue.y) * r; vue.k = k;
    appliquer();
  }
  const centre = () => { const b = svg.getBoundingClientRect(); return [b.width / 2, b.height / 2]; };

  // --- Interactions souris + tactile (pointer events) ---
  const pointeurs = new Map();
  let deplace = false, pincement = null;
  svg.addEventListener('pointerdown', (e) => {
    pointeurs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    deplace = false;
    if (pointeurs.size === 2) { const [a, b] = [...pointeurs.values()]; pincement = Math.hypot(a.x - b.x, a.y - b.y); }
  });
  window.addEventListener('pointermove', (e) => {
    const p = pointeurs.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    if (pointeurs.size === 1) {
      if (Math.abs(dx) + Math.abs(dy) > 3) deplace = true;
      if (deplace) { vue.x += dx; vue.y += dy; appliquer(); svg.classList.add('glisse'); }
    } else if (pointeurs.size === 2) {
      pointeurs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const [a, b] = [...pointeurs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const bb = svg.getBoundingClientRect();
      if (pincement) zoomer(d / pincement, (a.x + b.x) / 2 - bb.left, (a.y + b.y) / 2 - bb.top);
      pincement = d; deplace = true; return;
    }
    pointeurs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  });
  const fin = (e) => { pointeurs.delete(e.pointerId); pincement = null; svg.classList.remove('glisse'); };
  window.addEventListener('pointerup', fin);
  window.addEventListener('pointercancel', fin);
  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    const b = svg.getBoundingClientRect();
    zoomer(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX - b.left, e.clientY - b.top);
  }, { passive: false });
  svg.addEventListener('click', (e) => { if (deplace) { e.stopPropagation(); deplace = false; } }, true);

  /** Place la dernière colonne (là où se joue la question en cours) bien visible. */
  function suivreFrontiere(anime = true) {
    if (!derniere) return;
    const b = svg.getBoundingClientRect();
    const { noeuds } = derniere;
    const prof = Math.max(...noeuds.map((n) => n.depth));
    const colonne = noeuds.filter((n) => n.depth === prof);
    const yMoy = colonne.reduce((s, n) => s + n.y, 0) / colonne.length + MARGE_HAUT;
    vue.k = Math.min(vue.k, 1) || 1;
    vue.x = Math.min(MARGE, b.width * 0.6 - (prof * 250 + L / 2) * vue.k);
    vue.y = b.height / 2 - yMoy * vue.k;
    appliquer(anime);
  }
  function toutVoir() {
    if (!derniere) return;
    const b = svg.getBoundingClientRect();
    const k = Math.min(1, (b.width - 2 * MARGE) / derniere.dim.largeur, (b.height - 2 * MARGE) / (derniere.dim.hauteur + MARGE_HAUT));
    vue.k = Math.max(0.25, k); vue.x = MARGE; vue.y = MARGE; appliquer(true);
  }

  function rendre({ noeuds, legendes }) {
    const dim = disposer(noeuds, { largeurColonne: 250, pas: 46 });
    derniere = { noeuds, dim };
    monde.replaceChildren();
    const index = new Map(noeuds.map((n) => [n.id, n]));
    // En-têtes de colonnes (question)
    legendes.forEach((q, i) => { if (q) { const t = svgEl('text', { class: 'legende', x: i * 250, y: 16 }, coupe(q, 38)); t.append(svgEl('title', {}, q)); monde.append(t); } });
    // Liens
    for (const n of noeuds) {
      if (!n.parent) continue;
      const p = index.get(n.parent);
      const x1 = p.x + L, y1 = p.y + H / 2 + MARGE_HAUT, x2 = n.x, y2 = n.y + H / 2 + MARGE_HAUT, xm = (x1 + x2) / 2;
      const actif = ['choisi', 'probable', 'a-verifier', 'suite', 'vide'].includes(n.etat);
      monde.append(svgEl('path', { class: 'lien' + (actif ? ' lien--actif' : ''), d: `M${x1},${y1} C${xm},${y1} ${xm},${y2} ${x2},${y2}` }));
    }
    // Nœuds
    for (const n of noeuds) {
      const interactif = n.etat !== 'racine' && n.etat !== 'vide' && !(n.etat === 'suite');
      const g = svgEl('g', {
        class: `noeud noeud--${n.type} etat--${n.etat}`, transform: `translate(${n.x},${n.y + MARGE_HAUT})`,
        role: interactif ? 'button' : 'img', tabindex: interactif ? '0' : '-1',
        'aria-label': n.dispositifId ? `Ouvrir la fiche : ${n.titre}` : n.question ? `${n.question} ${n.label}${n.etat === 'choisi' ? ' (réponse retenue)' : ''}` : n.label,
        ...(n.etat === 'choisi' ? { 'aria-pressed': 'true' } : {}),
      });
      g.append(svgEl('rect', { width: L, height: H, rx: H / 2, ry: H / 2 }));
      g.append(svgEl('text', { x: L / 2, y: H / 2 + 4, 'text-anchor': 'middle' }, coupe(n.label, 27)));
      g.append(svgEl('title', {}, n.titre || n.label));
      if (interactif) {
        const agir = () => (n.dispositifId ? onFiche(n.dispositifId) : n.etat !== 'choisi' && onChoisir(n.noeudId, n.valeur));
        g.addEventListener('click', agir);
        g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); agir(); } });
      }
      monde.append(g);
    }
    suivreFrontiere(true);
  }

  return {
    rendre,
    zoomPlus: () => { const [x, y] = centre(); zoomer(1.25, x, y); },
    zoomMoins: () => { const [x, y] = centre(); zoomer(0.8, x, y); },
    suivreFrontiere, toutVoir,
  };
}
