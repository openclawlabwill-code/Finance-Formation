// Logique pure de l'arbre de décision (sans DOM) : parcours, arbre visible pour la mind map, mise en page.
// Utilisable dans le navigateur ET dans les tests Node.

/** Parcourt l'arbre depuis la racine en suivant les réponses. Les réponses « orphelines » (branche abandonnée) sont ignorées. */
export function calculerChemin(arbre, reponses) {
  const index = new Map(arbre.noeuds.map((n) => [n.id, n]));
  const chemin = [];
  const vus = new Set();
  let id = arbre.racine;
  while (id && !vus.has(id)) {
    vus.add(id);
    const noeud = index.get(id);
    if (!noeud) break;
    const option = noeud.options.find((o) => o.valeur === reponses[noeud.attribut]) || null;
    chemin.push({ noeud, option });
    if (!option) return { chemin, courant: noeud, termine: false };
    id = option.next;
  }
  return { chemin, courant: null, termine: true };
}

/** Profil effectif = uniquement les réponses situées sur le chemin actif. */
export function profilDuChemin(chemin) {
  const profil = {};
  for (const { noeud, option } of chemin) if (option) profil[noeud.attribut] = option.valeur;
  return profil;
}

/**
 * Construit l'arbre affiché : racine → options de chaque question du chemin (l'option choisie porte la suite),
 * puis, si le parcours est terminé, des feuilles « dispositif ».
 */
export function construireVisible(arbre, { chemin, termine }, resultats = [], maxDispositifs = 8) {
  const noeuds = [{ id: 'racine', parent: null, depth: 0, label: 'Situation du candidat', type: 'situation', etat: 'racine' }];
  const legendes = []; // question affichée en tête de chaque colonne
  let parent = 'racine';
  chemin.forEach(({ noeud, option }, i) => {
    legendes[i + 1] = noeud.question;
    let suivant = null;
    for (const o of noeud.options) {
      const id = `${noeud.id}:${o.valeur}`;
      const choisi = option && option.valeur === o.valeur;
      noeuds.push({ id, parent, depth: i + 1, label: o.label, type: noeud.type, etat: choisi ? 'choisi' : option ? 'alternative' : 'a-repondre',
        noeudId: noeud.id, valeur: o.valeur, question: noeud.question });
      if (choisi) suivant = id;
    }
    parent = suivant;
  });
  if (termine && parent) {
    const depth = chemin.length + 1;
    legendes[depth] = 'Dispositifs possibles';
    for (const r of resultats.slice(0, maxDispositifs)) {
      noeuds.push({ id: `d:${r.id}`, parent, depth, label: r.sigle || r.nom, type: 'dispositif', etat: r.eligibilite === 'probable' ? 'probable' : 'a-verifier', dispositifId: r.id, titre: r.nom });
    }
    if (resultats.length > maxDispositifs) {
      noeuds.push({ id: 'd:tous', parent, depth, label: `+ ${resultats.length - maxDispositifs} autre(s)`, type: 'dispositif', etat: 'suite', dispositifId: null });
    }
    if (!resultats.length) noeuds.push({ id: 'd:aucun', parent, depth, label: 'Aucun dispositif', type: 'dispositif', etat: 'vide', dispositifId: null });
  }
  return { noeuds, legendes };
}

/** Mise en page horizontale « arbre tidy » : x = colonne, y = feuilles empilées, parent centré sur ses enfants. */
export function disposer(noeuds, { largeurColonne = 250, pas = 46 } = {}) {
  const enfants = new Map(noeuds.map((n) => [n.id, []]));
  for (const n of noeuds) if (n.parent) enfants.get(n.parent).push(n);
  let ligne = 0;
  const placer = (n) => {
    const ch = enfants.get(n.id);
    if (!ch.length) { n.y = ligne * pas; ligne += 1; }
    else { ch.forEach(placer); n.y = (ch[0].y + ch[ch.length - 1].y) / 2; }
    n.x = n.depth * largeurColonne;
  };
  placer(noeuds[0]);
  const profondeur = Math.max(...noeuds.map((n) => n.depth));
  return { largeur: (profondeur + 1) * largeurColonne, hauteur: Math.max(ligne, 1) * pas };
}

/** Libellé lisible d'une réponse (pour le fil d'Ariane et la synthèse). */
export function reponsesLisibles(chemin) {
  return chemin.filter((c) => c.option).map((c) => ({ question: c.noeud.question, attribut: c.noeud.attribut, valeur: c.option.valeur, label: c.option.label, noeudId: c.noeud.id }));
}
