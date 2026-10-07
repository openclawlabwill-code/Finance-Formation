// Matrice de couverture d'une région : acteurs régionaux documentés, fiches nationales avec déclinaison régionale,
// fiches périmées (> 90 jours). Sert au tableau de bord /admin et au rapport de l'étape (g).
import { dispositifsPourRegion } from './regional.js';

const ACTEURS = ['conseil_regional', 'transitions_pro', 'agefiph', 'cap_emploi', 'cma', 'cariforef', 'france_travail', 'missions_locales', 'dreets', 'opco', 'conseil_departemental'];

export function couvertureRegion({ region, regions, sources, dispositifs }) {
  const reg = regions.find((r) => r.code === region);
  const entrees = sources.regions?.[region]?.acteurs || {};
  const acteurs = ACTEURS.map((a) => ({ acteur: a, nb_sources: (entrees[a] || []).length, sources: entrees[a] || [], documente: (entrees[a] || []).length > 0 }));
  const decores = dispositifsPourRegion(dispositifs.filter((d) => d.statut !== 'supprime'), region, { sources, regions });
  const fiches = decores.map((d) => ({
    id: d.id, nom: d.nom, bloc: d.regional.bloc, declinaison_requise: Boolean(d.declinaison_regionale),
    documentee: d.regional.documentee, jours_depuis_verification: d.regional.jours_depuis_verification, verification_perimee: d.regional.verification_perimee, statut: d.statut,
  }));
  const requises = fiches.filter((f) => f.declinaison_requise);
  const taux = (n, d) => (d ? Math.round((100 * n) / d) : null);
  return {
    region, nom: reg?.nom || region, active: Boolean(reg?.active),
    acteurs, fiches,
    synthese: {
      acteurs_documentes: acteurs.filter((a) => a.documente).length, acteurs_total: acteurs.length,
      taux_acteurs: taux(acteurs.filter((a) => a.documente).length, acteurs.length),
      declinaisons_documentees: requises.filter((f) => f.documentee).length, declinaisons_requises: requises.length,
      taux_declinaisons: taux(requises.filter((f) => f.documentee).length, requises.length),
      fiches_perimees: fiches.filter((f) => f.verification_perimee).length,
      fiches_a_verifier: fiches.filter((f) => f.statut === 'a_verifier').length,
      site_conseil_regional: Boolean(reg?.site_conseil_regional),
    },
  };
}
