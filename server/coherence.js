// Contrôles de cohérence entre fichiers (au-delà de la forme JSON Schema) et règles de fiabilité.

/** Vrai si l'hôte de l'URL appartient à un domaine officiel autorisé (ou à l'un de ses sous-domaines). */
export function estSourceOfficielle(url, domaines) {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return domaines.some((d) => h === d || h.endsWith('.' + d));
  } catch { return false; }
}

export function verifierSources(sources, domaines, contexte) {
  const pb = [];
  for (const s of sources || []) {
    if (!estSourceOfficielle(s.url, domaines)) pb.push(`${contexte} : source non officielle ou domaine non autorisé (${s.url})`);
  }
  return pb;
}

/** Retourne la liste des problèmes (tableau de chaînes vide = cohérent). */
export function verifierCoherence({ regions, attributs, arbre, dispositifs, sources, actualites = [] }) {
  const pb = [];
  const codesRegions = new Set(regions.map((r) => r.code));
  const attr = new Map(attributs.attributs.map((a) => [a.id, new Set(a.valeurs.map((v) => v.id))]));
  const domaines = sources.domaines_autorises;

  // --- Arbre ---
  const noeuds = new Map();
  for (const n of arbre.noeuds) { if (noeuds.has(n.id)) pb.push(`arbre : nœud en double « ${n.id} »`); noeuds.set(n.id, n); }
  if (!noeuds.has(arbre.racine)) pb.push(`arbre : racine « ${arbre.racine} » introuvable`);
  for (const n of arbre.noeuds) {
    if (!attr.has(n.attribut)) { pb.push(`arbre/${n.id} : attribut inconnu « ${n.attribut} »`); continue; }
    for (const o of n.options) {
      if (!attr.get(n.attribut).has(o.valeur)) pb.push(`arbre/${n.id} : valeur « ${o.valeur} » inconnue pour l'attribut ${n.attribut}`);
      if (o.next !== null && !noeuds.has(o.next)) pb.push(`arbre/${n.id} : option « ${o.valeur} » pointe vers un nœud inexistant « ${o.next} »`);
    }
  }
  // Cycles (parcours en profondeur)
  const etat = new Map();
  const dfs = (id, pile) => {
    if (etat.get(id) === 2) return;
    if (etat.get(id) === 1) { pb.push(`arbre : cycle détecté (${[...pile, id].join(' → ')})`); return; }
    etat.set(id, 1);
    for (const o of noeuds.get(id)?.options || []) if (o.next && noeuds.has(o.next)) dfs(o.next, [...pile, id]);
    etat.set(id, 2);
  };
  if (noeuds.has(arbre.racine)) dfs(arbre.racine, []);

  // --- Dispositifs ---
  const ids = new Set();
  for (const d of dispositifs) {
    if (ids.has(d.id)) pb.push(`dispositif « ${d.id} » en double`);
    ids.add(d.id);
    for (const c of [...d.criteres_eligibilite, ...(d.criteres_ou || []).flat()]) {
      if (!attr.has(c.attribut)) { pb.push(`${d.id} : critère sur attribut inconnu « ${c.attribut} »`); continue; }
      for (const v of c.valeurs) if (!attr.get(c.attribut).has(v)) pb.push(`${d.id} : valeur « ${v} » inconnue pour ${c.attribut}`);
    }
    for (const r of d.regions_concernees) if (r !== '*' && !codesRegions.has(r)) pb.push(`${d.id} : région inconnue « ${r} »`);
    if (d.portee_geographique !== 'national' && (d.regions_concernees.length === 0 || d.regions_concernees.includes('*')))
      pb.push(`${d.id} : portée ${d.portee_geographique} sans région précisée`);
    if (d.declinaison_regionale && !d.acteur_regional) pb.push(`${d.id} : declinaison_regionale=true exige acteur_regional`);
    if (d.statut !== 'supprime') pb.push(...verifierSources(d.sources, domaines, d.id));
    for (const [code, spec] of Object.entries(d.specificites_regionales || {})) {
      if (!codesRegions.has(code)) pb.push(`${d.id} : spécificité pour région inconnue « ${code} »`);
      pb.push(...verifierSources(spec.sources, domaines, `${d.id}/région ${code}`));
    }
  }
  for (const a of actualites) if (!ids.has(a.dispositif_id)) pb.push(`actualité « ${a.id} » : dispositif inconnu « ${a.dispositif_id} »`);
  return pb;
}
