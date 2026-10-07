// Petit utilitaire de création d'éléments DOM. N'utilise jamais innerHTML : le contenu reste du texte (anti-XSS).
export function el(tag, props = {}, ...enfants) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2).toLowerCase(), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of enfants.flat()) {
    if (c === null || c === undefined || c === false) continue;
    e.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return e;
}
export const vider = (n) => { while (n.firstChild) n.removeChild(n.firstChild); return n; };
export const MENTION = 'Information indicative. Vérifier auprès de l’organisme avant toute démarche.';
