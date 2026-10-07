// Études : calcul du « instantané » d'une étude, contrôle RGPD, sauvegarde locale, export Markdown.
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ErreurHttp } from './http.js';
import { calculerChemin, profilDuChemin } from '../public/js/arbre-logique.js';
import { dispositifsPourRegion } from './regional.js';
import { evaluerProfil, verifierProfil } from './eligibilite.js';

const LIBELLE_BLOC = { national: 'Dispositifs nationaux', regional: 'Dispositifs de la région sélectionnée', a_verifier_localement: 'À vérifier localement' };
const MENTION = 'Information indicative. Vérifier auprès de l’organisme avant toute démarche.';

/** Refuse les champs libres qui semblent contenir des données personnelles identifiantes (RGPD). */
export function verifierAnonymat(texte, champ) {
  if (!texte) return;
  const suspect =
    /[\w.+-]+@[\w-]+\.[\w.-]+/.test(texte) ||                              // adresse e-mail
    /(?:\+33|\b0)\s?[1-9](?:[\s.-]?\d{2}){4}\b/.test(texte) ||             // téléphone français
    /\b\d[\s.]?\d{2}[\s.]?\d{2}[\s.]?\d{2}[\s.]?\d{3}[\s.]?\d{3}\b/.test(texte) || // numéro de sécurité sociale
    /\d{10,}/.test(texte.replace(/[\s.-]/g, ''));                          // longue suite de chiffres
  if (suspect) throw new ErreurHttp(400, `${champ} : ne pas saisir de nom, d’adresse e-mail, de numéro de téléphone ni de numéro de sécurité sociale. Utiliser une référence anonyme.`);
}

export function creerServiceEtudes({ store }) {
  const dossier = () => path.join(store.dataDir, 'etudes');
  const fichier = (id) => path.join(dossier(), `${store.verifierId(id)}.json`);

  /** Calcule l'instantané d'une étude (sans l'enregistrer). Tout est recalculé côté serveur. */
  async function apercu(entree = {}) {
    const { region, region_travail = null, departement = null, profil = {}, reference_dossier = '', notes = '' } = entree;
    const regions = await store.regions();
    const reg = regions.find((r) => r.code === region);
    if (!reg) throw new ErreurHttp(400, 'Région inconnue ou manquante');
    const regTravail = region_travail ? regions.find((r) => r.code === region_travail) : null;
    if (region_travail && !regTravail) throw new ErreurHttp(400, 'Région de travail inconnue');
    const dep = departement ? reg.departements.find((d) => d.code === departement) : null;
    if (departement && !dep) throw new ErreurHttp(400, 'Département inconnu pour cette région');
    if (String(reference_dossier).length > 60) throw new ErreurHttp(400, 'Référence dossier : 60 caractères maximum');
    if (String(notes).length > 2000) throw new ErreurHttp(400, 'Notes : 2000 caractères maximum');
    verifierAnonymat(reference_dossier, 'Référence dossier');
    verifierAnonymat(notes, 'Notes');
    const attributs = await store.attributs();
    const pb = verifierProfil(profil, attributs);
    if (pb.length) throw new ErreurHttp(400, 'Profil invalide', pb);

    const arbre = await store.arbre();
    const parcoursBrut = calculerChemin(arbre, profil);
    const profilEffectif = profilDuChemin(parcoursBrut.chemin); // les réponses orphelines sont écartées
    const parcours = parcoursBrut.chemin.filter((c) => c.option).map((c) => ({ question: c.noeud.question, label: c.option.label, attribut: c.noeud.attribut, valeur: c.option.valeur }));
    const sources = await store.sources();
    const decores = dispositifsPourRegion(await store.listerDispositifs(), region, { sources, regions });
    const { resultats } = evaluerProfil(decores, profilEffectif, attributs);

    const contacts = [];
    for (const [acteur, liste] of Object.entries(sources.regions?.[region]?.acteurs || {})) {
      for (const s of liste) contacts.push({ acteur, organisme: s.organisme, url: s.url, date_verification: s.date_verification });
    }
    return {
      reference_dossier: String(reference_dossier || ''), region, region_nom: reg.nom,
      region_travail: regTravail?.code ?? null, region_travail_nom: regTravail?.nom ?? null,
      departement: dep?.code ?? null, departement_nom: dep?.nom ?? null,
      complet: parcoursBrut.termine, profil: profilEffectif, parcours,
      resultats: resultats.map((r) => ({
        dispositif_id: r.id, nom: r.nom, sigle: r.sigle ?? null, categorie: r.categorie, eligibilite: r.eligibilite, bloc: r.bloc,
        resume: r.resume, ce_qui_est_finance: r.ce_qui_est_finance, montant_ou_plafond: r.montant_ou_plafond,
        manquants: r.manquants.map((m) => m.label), a_confirmer: r.a_confirmer, fiche_a_verifier: r.fiche_a_verifier,
        message_regional: r.message_regional, contact_regional: r.contact_regional, specificite_regionale: r.specificite_regionale,
        verification_perimee: r.verification_perimee, date_derniere_verification: r.date_derniere_verification, sources: r.sources,
      })),
      contacts_regionaux: contacts,
      site_conseil_regional: reg.site_conseil_regional?.url ?? null,
      ...(notes ? { notes: String(notes) } : {}),
    };
  }

  async function enregistrer(entree) {
    const snap = await apercu(entree);
    const maintenant = new Date();
    const etude = { id: `${maintenant.toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomBytes(3).toString('hex')}`, date: maintenant.toISOString(), ...snap };
    const r = store.validateur.valider('etude.json', etude);
    if (!r.ok) throw new ErreurHttp(422, 'Étude invalide', r.erreurs);
    await store.ecrireAtomique(fichier(etude.id), etude);
    return etude;
  }

  async function lister() {
    let noms = [];
    try { noms = (await fs.readdir(dossier())).filter((n) => n.endsWith('.json')); } catch { /* pas encore d'étude */ }
    const etudes = await Promise.all(noms.map((n) => store.lireJson(path.join(dossier(), n))));
    return etudes.sort((a, b) => b.date.localeCompare(a.date)).map((e) => ({
      id: e.id, date: e.date, reference_dossier: e.reference_dossier || '', region: e.region, region_nom: e.region_nom, complet: e.complet, nb_resultats: e.resultats.length,
    }));
  }
  async function lire(id) {
    const e = await store.lireJson(fichier(id), null);
    if (!e) throw new ErreurHttp(404, 'Étude introuvable');
    return e;
  }
  async function supprimer(id) {
    await lire(id);
    await fs.unlink(fichier(id));
    return { supprimee: id };
  }
  return { apercu, enregistrer, lister, lire, supprimer };
}

/** Synthèse au format Markdown (aussi utilisée pour l'export). */
export function versMarkdown(e) {
  const fr = (iso) => new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const L = [];
  L.push(`# Synthèse d’étude de financement${e.reference_dossier ? ` — réf. ${e.reference_dossier}` : ''}`, '');
  L.push(`- **Date de l’étude** : ${fr(e.date || new Date().toISOString())}`);
  L.push(`- **Région de résidence ou de formation** : ${e.region_nom} (${e.region})${e.departement_nom ? ` — ${e.departement_nom}` : ''}`);
  if (e.region_travail_nom) L.push(`- **Région du lieu de travail / siège employeur** : ${e.region_travail_nom}`);
  L.push(`- **Étude** : ${e.complet ? 'parcours complet' : 'parcours incomplet (informations manquantes)'}`, '');
  L.push('## Situation du candidat', '');
  if (!e.parcours.length) L.push('_Aucune réponse renseignée._');
  for (const p of e.parcours) L.push(`- ${p.question} **${p.label}**`);
  L.push('', `## Dispositifs possibles (${e.resultats.length})`, '');
  if (!e.resultats.length) L.push('_Aucun dispositif ne correspond à ce profil dans les données chargées._', '');
  for (const bloc of ['national', 'regional', 'a_verifier_localement']) {
    const items = e.resultats.filter((r) => r.bloc === bloc);
    if (!items.length) continue;
    L.push(`### ${bloc === 'regional' ? `Dispositifs de la région ${e.region_nom}` : LIBELLE_BLOC[bloc]}`, '');
    for (const r of items) {
      L.push(`#### ${r.nom}${r.sigle ? ` (${r.sigle})` : ''} — ${r.eligibilite === 'probable' ? 'éligibilité probable' : 'à vérifier'}`, '');
      L.push(r.resume, '');
      if (r.ce_qui_est_finance) L.push(`- **Ce qui est financé** : ${r.ce_qui_est_finance}`);
      if (r.montant_ou_plafond) L.push(`- **Montant ou plafond** : ${r.montant_ou_plafond}`);
      if (r.manquants?.length) L.push(`- **Informations manquantes pour conclure** : ${r.manquants.join(', ')}`);
      if (r.a_confirmer?.length) L.push(`- **Points à confirmer** : ${r.a_confirmer.join(' ; ')}`);
      if (r.specificite_regionale) L.push(`- **Spécificité régionale vérifiée** : ${r.specificite_regionale}`);
      if (r.message_regional) L.push(`- **Région** : ${r.message_regional}${r.contact_regional?.url ? ` — ${r.contact_regional.url}` : ''}`);
      if (r.fiche_a_verifier) L.push('- **Fiche à vérifier** : contenu non entièrement confirmé par les sources.');
      if (r.verification_perimee) L.push('- **Alerte** : fiche non vérifiée depuis plus de 90 jours.');
      L.push(`- **Sources officielles** (vérifiées le ${fr(r.date_derniere_verification)}) :`);
      for (const s of r.sources) L.push(`  - [${s.intitule}](${s.url}) — ${s.organisme}`);
      L.push('');
    }
  }
  L.push(`## Contacts et sources régionaux — ${e.region_nom}`, '');
  if (e.site_conseil_regional) L.push(`- Conseil régional : ${e.site_conseil_regional}`);
  for (const c of e.contacts_regionaux || []) L.push(`- ${c.organisme} (${c.acteur.replace(/_/g, ' ')}) : ${c.url}`);
  if (!e.site_conseil_regional && !(e.contacts_regionaux || []).length) L.push('_Contacts régionaux non encore documentés pour cette région._');
  if (e.notes) L.push('', '## Notes', '', e.notes);
  L.push('', '---', `*${MENTION}*`, '');
  return L.join('\n');
}
