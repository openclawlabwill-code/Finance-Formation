// « Pack de mise à jour » : un fichier JSON autoporteur à donner à n'importe quel assistant IA (Copilot, etc.).
// Il contient son mode d'emploi, les règles, les données actuelles et le format de réponse. La réponse (un tableau
// « propositions ») est relue par le serveur avec les mêmes règles que l'API de l'agent, puis validée par un humain dans /admin.
import { ErreurHttp } from './http.js';
import { couvertureRegion } from './couverture.js';

export const FORMAT = 'financeforma-pack/1';
const jour = () => new Date().toISOString().slice(0, 10);

const MODE_EMPLOI = [
  'À QUOI SERT CE FICHIER : il contient les données d’une application locale (FinanceForma) qui aide un conseiller à identifier les dispositifs de financement de la formation professionnelle pour la région indiquée dans « region ». Ton travail : vérifier ces données sur les sites OFFICIELS et proposer des corrections ou des compléments.',
  'CE QUE TU DOIS FAIRE : (1) lis « a_traiter » pour savoir par où commencer ; (2) pour chaque point, ouvre la page officielle correspondante (sites listés dans « acteurs_regionaux » et « domaines_autorises ») ; (3) compare avec « fiches » ; (4) écris UNIQUEMENT ce qui change dans un tableau « propositions » ajouté à la racine de ce fichier ; (5) renvoie le fichier complet (ou, à défaut, seulement l’objet JSON contenant « format » et « propositions »).',
  'NE MODIFIE PAS les autres parties du fichier (« donnees », « fiches », etc.) : elles sont ignorées au retour. Ne réécris pas les fiches entières.',
  'FORMAT DE RÉPONSE : voir « format_reponse » ci-dessous. Réponds avec du JSON valide (guillemets doubles, pas de commentaires, pas de virgule finale).',
];

const REGLES = [
  'Sources officielles uniquement : uniquement les domaines de « domaines_autorises ». Jamais de blog, presse, site de formation, forum, ni de page d’un organisme privé. Une proposition avec une source hors liste est rejetée.',
  'Aucune invention : n’écris que ce que tu as lu sur la page. Chaque proposition cite l’URL exacte, le titre de la page et un « extrait » (passage relevé, au moins 10 caractères). Si tu n’as pas pu ouvrir une page, ne propose rien pour elle et dis-le dans « compte_rendu ».',
  'N’invente jamais une URL : n’utilise que des pages que tu as réellement ouvertes.',
  'Pays de la Loire seulement (region « 52 »). Ne reprends aucune règle d’une autre région.',
  'Une source régionale ne modifie jamais le texte national d’une fiche : elle ne peut modifier que contenu.specificites_regionales["52"]. Pour changer le texte national, utilise une source nationale (région « national ») sur les champs concernés, sans toucher à specificites_regionales.',
  'Ne propose pas les champs id, historique, date_derniere_verification, date_derniere_modification : le serveur les gère.',
  'En cas de doute sur une information, mets statut « a_verifier » dans la spécificité et explique le doute dans « motif », ou n’écris rien.',
  'Un humain relit chaque proposition avant application. Il vaut mieux 3 propositions sûres que 20 douteuses.',
];

const FORMAT_REPONSE = {
  format: FORMAT,
  propositions: [
    {
      region: '52', action: 'modification', dispositif_id: '<id exact d’une fiche de « fiches »>',
      motif: 'Pourquoi cette modification, en une phrase.',
      sources: [{ url: 'https://… (page officielle réellement ouverte)', intitule: 'Titre de la page', organisme: 'Nom de l’organisme', extrait: 'Passage relevé sur la page.', date_consultation: 'AAAA-MM-JJ' }],
      contenu: { specificites_regionales: { 52: { statut: 'actif | modifie | a_verifier', resume: 'Ce qui est propre à la région (au moins 10 caractères).', montants_conditions: 'texte ou null', contact: { organisme: '…', url: 'https://…', telephone: '…' } } } },
    },
  ],
  compte_rendu: 'Texte libre : pages consultées, pages inaccessibles, points à vérifier à la main.',
  actions_possibles: {
    modification: 'contenu = uniquement les champs à changer. Région « 52 » : seulement specificites_regionales["52"]. Région « national » : champs nationaux (resume, ce_qui_est_finance, montant_ou_plafond, criteres_a_verifier, demarche, sources…).',
    creation: 'contenu = fiche complète sans id/historique/dates/statut ; depuis une source régionale : portee_geographique « regional » et regions_concernees ["52"]. dispositif_id = minuscules, chiffres, tirets.',
    suppression: 'Dispositif abrogé, avec la source qui l’atteste. Interdit à une source régionale sur une fiche nationale.',
    actualite: 'contenu = {id, titre, date, region, dispositif_id, url, organisme, resume}. contenu.region doit être égal à region.',
  },
};

const ChampsFiche = ['id', 'nom', 'sigle', 'categorie', 'resume', 'ce_qui_est_finance', 'montant_ou_plafond', 'criteres_a_verifier', 'declinaison_regionale', 'acteur_regional', 'statut', 'date_derniere_verification', 'sources'];

export async function genererPack({ store, region }) {
  const [regions, sources, dispositifs] = await Promise.all([store.regions(), store.sources(), store.listerDispositifs()]);
  const reg = regions.find((r) => r.code === region);
  if (!reg) throw new ErreurHttp(400, `Région inconnue : ${region}`);
  const cov = couvertureRegion({ region, regions, sources, dispositifs });
  const a_traiter = [
    ...cov.acteurs.filter((a) => !a.documente).map((a) => ({ type: 'acteur_regional_manquant', acteur: a.acteur.replace(/_/g, ' '), consigne: 'Trouver le site officiel de cet acteur pour la région et le signaler dans « compte_rendu » (l’ajout se fait à la main par le conseiller dans config/sources.json).' })),
    ...cov.fiches.filter((f) => f.declinaison_requise && !f.documentee).map((f) => ({ type: 'declinaison_regionale_non_documentee', dispositif_id: f.id, nom: f.nom, consigne: `Chercher sur le site officiel de l’acteur régional (${dispositifs.find((d) => d.id === f.id).acteur_regional}) ce qui est propre à la région et le proposer dans specificites_regionales["${region}"].` })),
    ...cov.fiches.filter((f) => f.verification_perimee).map((f) => ({ type: 'fiche_perimee', dispositif_id: f.id, nom: f.nom, consigne: 'Re-vérifier la fiche sur ses sources (non vérifiée depuis plus de 90 jours).' })),
  ];
  const fiches = dispositifs.filter((d) => d.statut !== 'supprime').map((d) => {
    const f = Object.fromEntries(ChampsFiche.map((k) => [k, d[k]]));
    f.specificite_regionale_actuelle = d.specificites_regionales?.[region] || null;
    return f;
  });
  return {
    format: FORMAT,
    genere_le: jour(),
    region, nom_region: reg.nom,
    _lisez_moi: MODE_EMPLOI,
    regles: REGLES,
    format_reponse: FORMAT_REPONSE,
    domaines_autorises: sources.domaines_autorises,
    acteurs_regionaux: Object.fromEntries(Object.entries(sources.regions?.[region]?.acteurs || {}).map(([k, v]) => [k, v.map((x) => ({ organisme: x.organisme, url: x.url, verifie_le: x.date_verification }))])),
    opco_prioritaires: sources.opco_prioritaires || [],
    synthese_couverture: cov.synthese,
    a_traiter,
    fiches,
    propositions: [],
  };
}

/** Extrait l'objet JSON d'une réponse d'assistant : fichier complet, bloc ```json, ou texte avec prose autour. */
export function extraireJson(texte) {
  const brut = String(texte || '').replace(/^﻿/, '').trim();
  const essais = [brut];
  const bloc = /```(?:json)?\s*([\s\S]*?)```/i.exec(brut);
  if (bloc) essais.push(bloc[1].trim());
  const d = brut.indexOf('{'), f = brut.lastIndexOf('}');
  if (d >= 0 && f > d) essais.push(brut.slice(d, f + 1));
  for (const e of essais) { try { const j = JSON.parse(e); if (j && typeof j === 'object' && !Array.isArray(j)) return j; } catch { /* essai suivant */ } }
  throw new ErreurHttp(422, 'Fichier illisible : JSON invalide. Demandez à l’assistant de renvoyer le fichier au format JSON strict (guillemets doubles, sans commentaire ni virgule finale).');
}

/** Dépose chaque proposition du pack via le service de mise à jour ; rapporte le sort de chacune. */
export async function importerPack({ maj, texte, region }) {
  const pack = extraireJson(texte);
  if (pack.format !== FORMAT) throw new ErreurHttp(422, `Format inattendu (« ${pack.format ?? 'absent'} », attendu « ${FORMAT} ») : renvoyer le fichier tel que fourni par l’application, avec le tableau « propositions » rempli.`);
  if (pack.region && pack.region !== region) throw new ErreurHttp(422, `Ce pack concerne la région ${pack.region}, pas ${region}.`);
  if (!Array.isArray(pack.propositions)) throw new ErreurHttp(422, 'Le tableau « propositions » est absent.');
  if (pack.propositions.length > 100) throw new ErreurHttp(422, 'Trop de propositions (100 maximum par fichier).');
  const deposees = [], rejetees = [];
  for (const [i, p] of pack.propositions.entries()) {
    try {
      const r = await maj.deposer({ ...p, agent: 'pack-llm', region: p?.region });
      deposees.push({ rang: i + 1, id: r.id, statut: r.statut, dispositif_id: p.dispositif_id || p.contenu?.dispositif_id || null, action: p.action });
    } catch (e) {
      rejetees.push({ rang: i + 1, dispositif_id: p?.dispositif_id || null, action: p?.action || null, erreur: e.message, details: e.details });
    }
  }
  return { nb_propositions: pack.propositions.length, deposees, rejetees, compte_rendu: typeof pack.compte_rendu === 'string' ? pack.compte_rendu.slice(0, 4000) : null };
}
