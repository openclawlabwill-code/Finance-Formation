// Logique régionale : quels dispositifs pour quelle région, dans quel bloc, avec quel message de repli.
// Règle d'or : ne jamais extrapoler d'une région à l'autre ni appliquer la règle nationale par défaut
// quand la déclinaison régionale n'est pas documentée.

const estNational = (d) => d.portee_geographique === 'national';
const concerne = (d, region) => estNational(d) || d.regions_concernees.includes('*') || d.regions_concernees.includes(region);

/** Contact de repli : premier site officiel connu de l'acteur régional, sinon site du Conseil régional. */
export function contactRepli(dispositif, region, sources, regions) {
  const acteur = dispositif.acteur_regional;
  const entrees = sources?.regions?.[region]?.acteurs?.[acteur] || [];
  if (entrees.length) return { organisme: entrees[0].organisme, url: entrees[0].url };
  const r = regions.find((x) => x.code === region);
  if (r?.site_conseil_regional) return { organisme: `Conseil régional ${r.nom}`, url: r.site_conseil_regional.url };
  return { organisme: acteur ? acteur.replace(/_/g, ' ') : 'organisme régional compétent', url: null };
}

/**
 * Décore un dispositif pour une région donnée. Retourne null s'il n'est pas concerné.
 * bloc : 'national' | 'regional' | 'a_verifier_localement'
 */
export function decorerPourRegion(dispositif, region, { sources, regions, maintenant = Date.now() }) {
  if (!concerne(dispositif, region)) return null;
  const spec = dispositif.specificites_regionales?.[region] || null;
  const specVerifiee = spec && spec.statut !== 'a_verifier';
  let bloc;
  let documentee = true;
  let message = null;
  let contact = null;

  if (estNational(dispositif)) {
    bloc = 'national';
    if (dispositif.declinaison_regionale && !specVerifiee) {
      documentee = false;
      contact = contactRepli(dispositif, region, sources, regions);
      message = `Déclinaison régionale non documentée : contacter ${contact.organisme}`;
    }
  } else if (specVerifiee && dispositif.portee_geographique === 'regional') {
    bloc = 'regional';
  } else {
    bloc = 'a_verifier_localement';
    documentee = false;
    contact = spec?.contact || contactRepli(dispositif, region, sources, regions);
    message = `À vérifier localement : contacter ${contact.organisme}`;
  }
  // Alerte si la fiche n'a pas été vérifiée depuis plus de 90 jours.
  const jours = Math.floor((maintenant - Date.parse(dispositif.date_derniere_verification + 'T00:00:00Z')) / 86400000);
  return { bloc, documentee, message, contact, specificite: specVerifiee ? spec : null,
    jours_depuis_verification: jours, verification_perimee: jours > 90 };
}

export function dispositifsPourRegion(dispositifs, region, ctx, { inclureSupprimes = false } = {}) {
  const sortie = [];
  for (const d of dispositifs) {
    if (!inclureSupprimes && d.statut === 'supprime') continue;
    const r = decorerPourRegion(d, region, ctx);
    if (r) sortie.push({ ...d, regional: r });
  }
  return sortie;
}
