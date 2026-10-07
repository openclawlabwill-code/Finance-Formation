// Moteur d'éligibilité : compare le profil du candidat aux critères structurés de chaque dispositif.
//   - un critère contredit      → dispositif écarté
//   - un critère non renseigné  → « à vérifier » (avec la liste des informations manquantes)
//   - tous critères satisfaits  → « éligibilité probable » (jamais une certitude)
const ORDRE_BLOC = { national: 0, regional: 1, a_verifier_localement: 2 };

export function evaluerCondition(cond, profil) {
  const v = profil[cond.attribut];
  if (v === undefined) return 'inconnu';
  const dedans = cond.valeurs.includes(v);
  return (cond.operateur === 'in') === dedans ? 'ok' : 'contredit';
}

/** Un groupe = ensemble de conditions toutes requises (ET). */
function evaluerGroupe(conds, profil) {
  const manquants = [];
  let contredit = false;
  for (const c of conds) {
    const r = evaluerCondition(c, profil);
    if (r === 'contredit') contredit = true;
    else if (r === 'inconnu' && !manquants.includes(c.attribut)) manquants.push(c.attribut);
  }
  return { etat: contredit ? 'contredit' : manquants.length ? 'inconnu' : 'ok', manquants };
}

/**
 * criteres_eligibilite : tous requis (ET).
 * criteres_ou (facultatif) : liste de groupes alternatifs ; il suffit qu'un groupe soit satisfait (OU).
 */
export function evaluerDispositif(d, profil) {
  const base = evaluerGroupe(d.criteres_eligibilite, profil);
  if (base.etat === 'contredit') return null;
  const manquants = [...base.manquants];
  if (d.criteres_ou?.length) {
    const groupes = d.criteres_ou.map((g) => evaluerGroupe(g, profil));
    if (groupes.every((g) => g.etat === 'contredit')) return null;
    if (!groupes.some((g) => g.etat === 'ok')) {
      for (const g of groupes) if (g.etat === 'inconnu') for (const m of g.manquants) if (!manquants.includes(m)) manquants.push(m);
    }
  }
  const fichePasVerifiee = d.statut === 'a_verifier';
  return {
    eligibilite: manquants.length || fichePasVerifiee ? 'a_verifier' : 'probable',
    manquants,
    fiche_a_verifier: fichePasVerifiee,
  };
}

/** `decores` = sortie de dispositifsPourRegion ; retourne la liste triée + compteurs. */
export function evaluerProfil(decores, profil, attributs) {
  const labels = new Map(attributs.attributs.map((a) => [a.id, a.label]));
  const resultats = [];
  for (const d of decores) {
    const e = evaluerDispositif(d, profil);
    if (!e) continue;
    resultats.push({
      id: d.id, nom: d.nom, sigle: d.sigle, categorie: d.categorie, resume: d.resume, statut: d.statut,
      bloc: d.regional.bloc, eligibilite: e.eligibilite,
      manquants: e.manquants.map((id) => ({ attribut: id, label: labels.get(id) || id })),
      fiche_a_verifier: e.fiche_a_verifier,
      a_confirmer: d.criteres_a_verifier || [],
      verification_perimee: d.regional.verification_perimee,
      jours_depuis_verification: d.regional.jours_depuis_verification,
      ce_qui_est_finance: d.ce_qui_est_finance ?? null, montant_ou_plafond: d.montant_ou_plafond ?? null,
      date_derniere_verification: d.date_derniere_verification, sources: d.sources,
      specificite_regionale: d.regional.specificite?.resume ?? null,
      region_documentee: d.regional.documentee, message_regional: d.regional.message, contact_regional: d.regional.contact,
    });
  }
  resultats.sort((a, b) => ORDRE_BLOC[a.bloc] - ORDRE_BLOC[b.bloc] || (a.eligibilite === b.eligibilite ? 0 : a.eligibilite === 'probable' ? -1 : 1) || a.nom.localeCompare(b.nom, 'fr'));
  const compte = (f) => resultats.filter(f).length;
  return {
    resultats,
    compteurs: { total: resultats.length, probable: compte((r) => r.eligibilite === 'probable'), a_verifier: compte((r) => r.eligibilite === 'a_verifier'),
      national: compte((r) => r.bloc === 'national'), regional: compte((r) => r.bloc === 'regional'), a_verifier_localement: compte((r) => r.bloc === 'a_verifier_localement') },
  };
}

/** Valide un profil : attributs et valeurs connus. Retourne la liste d'erreurs. */
export function verifierProfil(profil, attributs) {
  const pb = [];
  if (!profil || typeof profil !== 'object' || Array.isArray(profil)) return ['profil : objet attendu'];
  const idx = new Map(attributs.attributs.map((a) => [a.id, new Set(a.valeurs.map((v) => v.id))]));
  for (const [k, v] of Object.entries(profil)) {
    if (!idx.has(k)) pb.push(`attribut inconnu « ${k} »`);
    else if (!idx.get(k).has(v)) pb.push(`valeur « ${v} » inconnue pour ${k}`);
  }
  return pb;
}
