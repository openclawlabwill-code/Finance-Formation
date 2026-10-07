// Mise à jour des données par un agent externe (Hermes) : dépôt de propositions, validation humaine, application.
// Règles : région obligatoire, sources officielles obligatoires, une source régionale ne modifie jamais le cœur d'une
// fiche nationale (seulement sa spécificité régionale), l'agent ne fixe ni identifiant, ni historique, ni dates.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { ErreurHttp } from './http.js';
import { verifierSources } from './coherence.js';

const aujourdhui = () => new Date().toISOString().slice(0, 10);
const INTERDITS_AGENT = ['id', 'historique', 'date_derniere_verification', 'date_derniere_modification'];
const clone = (x) => JSON.parse(JSON.stringify(x));

/** Différences à plat entre deux objets JSON : [{chemin, avant, apres}]. */
export function calculerDiff(avant, apres) {
  const out = [];
  const marcher = (a, b, chemin) => {
    const objA = a && typeof a === 'object' && !Array.isArray(a), objB = b && typeof b === 'object' && !Array.isArray(b);
    if (objA && objB) {
      for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) marcher(a[k], b[k], chemin ? `${chemin}.${k}` : k);
    } else if (JSON.stringify(a) !== JSON.stringify(b)) out.push({ chemin, avant: a === undefined ? null : a, apres: b === undefined ? null : b });
  };
  marcher(avant ?? {}, apres ?? {}, '');
  return out;
}

export function creerServiceMaj({ store, config }) {
  const dossier = () => path.join(store.dataDir, 'propositions');
  const fichier = (id) => path.join(dossier(), `${store.verifierId(id)}.json`);

  async function rejeter(prop, message, details) {
    await store.journaliser({ source: `agent:${prop?.agent || 'inconnu'}`, region: prop?.region || 'inconnue', dispositif: prop?.dispositif_id || null, action: prop?.action || 'inconnue', resultat: 'rejete', motif: message });
    throw new ErreurHttp(422, message, details);
  }

  const sourcesFiche = (sources) => sources.map(({ url, intitule, organisme, date_consultation }) => ({ url, intitule, organisme, date_consultation: date_consultation || aujourdhui() }));

  /** Construit l'état « après » d'une proposition. Lève ErreurHttp si une règle est violée. */
  async function construire(prop, regions, domaines) {
    const { region, action, dispositif_id: id, contenu = {} } = prop;
    const regionOk = region === 'national' || regions.some((r) => r.code === region);
    if (!regionOk) throw new ErreurHttp(422, `Région inconnue : ${region}`);
    const pbSources = verifierSources(prop.sources, domaines, 'proposition');
    if (pbSources.length) throw new ErreurHttp(422, 'Source non officielle refusée', pbSources);

    if (action === 'actualite') {
      if (contenu.region !== region) throw new ErreurHttp(422, 'Actualité : la région du contenu doit être celle de la proposition');
      const actu = { ...contenu };
      const v = store.validateur.valider('actualite.json', actu);
      if (!v.ok) throw new ErreurHttp(422, 'Actualité invalide', v.erreurs);
      const pb = verifierSources([{ url: actu.url }], domaines, 'actualité');
      if (pb.length) throw new ErreurHttp(422, 'Source non officielle refusée', pb);
      if (!(await store.lireDispositif(actu.dispositif_id))) throw new ErreurHttp(422, `Dispositif inconnu : ${actu.dispositif_id}`);
      return { avant: null, apres: actu, type: 'actualite' };
    }

    const existante = await store.lireDispositif(id);
    for (const k of INTERDITS_AGENT) if (k in contenu) throw new ErreurHttp(422, `Le champ « ${k} » est géré par le serveur et ne peut pas être proposé`);
    const nationale = existante?.portee_geographique === 'national';
    const jour = aujourdhui();

    if (action === 'creation') {
      if (existante) throw new ErreurHttp(422, `Le dispositif « ${id} » existe déjà : proposer une modification`);
      const fiche = { specificites_regionales: {}, criteres_eligibilite: [], criteres_a_verifier: [], declinaison_regionale: false, acteur_regional: null, regions_concernees: [], ...clone(contenu), id,
        sources: contenu.sources || sourcesFiche(prop.sources), statut: 'a_verifier', date_derniere_verification: jour, date_derniere_modification: jour,
        historique: [{ date: jour, action: 'creation', resume: prop.motif || 'Création proposée par un agent', auteur: prop.agent || 'agent', region }] };
      if (region !== 'national' && !(fiche.portee_geographique !== 'national' && fiche.regions_concernees.length === 1 && fiche.regions_concernees[0] === region)) {
        throw new ErreurHttp(422, 'Création depuis une source régionale : la fiche doit être de portée régionale, limitée à cette seule région');
      }
      return { avant: null, apres: fiche, type: 'dispositif' };
    }

    if (!existante) throw new ErreurHttp(422, `Dispositif inconnu : ${id}`);
    if (action === 'suppression') {
      if (nationale && region !== 'national') throw new ErreurHttp(422, 'Une source régionale ne peut pas supprimer une fiche nationale');
      const apres = { ...clone(existante), statut: 'supprime', date_derniere_modification: jour, historique: [...existante.historique, { date: jour, action: 'suppression', resume: prop.motif || 'Suppression proposée', auteur: prop.agent || 'agent', region }] };
      return { avant: existante, apres, type: 'dispositif' };
    }

    // modification
    const cles = Object.keys(contenu);
    if (!cles.length) throw new ErreurHttp(422, 'Modification vide');
    if (nationale && region !== 'national') {
      const hors = cles.filter((k) => k !== 'specificites_regionales');
      const autres = Object.keys(contenu.specificites_regionales || {}).filter((c) => c !== region);
      if (hors.length || autres.length) throw new ErreurHttp(422, `Règle : une source régionale (${region}) ne peut modifier que la spécificité régionale ${region} d'une fiche nationale (champs refusés : ${[...hors, ...autres.map((c) => 'specificites_regionales.' + c)].join(', ')})`);
    }
    if (region === 'national' && 'specificites_regionales' in contenu) throw new ErreurHttp(422, 'Une source nationale ne peut pas modifier les spécificités régionales : les proposer région par région');
    if (!nationale && region !== 'national' && existante.portee_geographique !== 'national' && !existante.regions_concernees.includes(region) && !existante.regions_concernees.includes('*')) {
      throw new ErreurHttp(422, `La fiche « ${id} » ne concerne pas la région ${region}`);
    }
    const apres = clone(existante);
    for (const [k, v] of Object.entries(contenu)) {
      if (k === 'specificites_regionales') {
        for (const [code, spec] of Object.entries(v)) {
          apres.specificites_regionales[code] = { statut: 'a_verifier', sources: sourcesFiche(prop.sources), ...spec, date_derniere_verification: jour };
        }
      } else apres[k] = v;
    }
    apres.date_derniere_modification = jour;
    apres.date_derniere_verification = jour;
    if (apres.statut === 'supprime') throw new ErreurHttp(422, 'Fiche supprimée : restaurer une sauvegarde plutôt que la modifier');
    if (apres.statut === 'actif') apres.statut = 'modifie';
    apres.historique = [...existante.historique, { date: jour, action: 'modification', resume: prop.motif || 'Modification proposée par un agent', auteur: prop.agent || 'agent', region }];
    return { avant: existante, apres, type: 'dispositif' };
  }

  async function deposer(corps) {
    const prop = corps && typeof corps === 'object' ? corps : {};
    const v = store.validateur.valider('proposition.json', prop);
    if (!v.ok) await rejeter(prop, 'Proposition invalide (région, action, sources officielles avec extrait : tous obligatoires)', v.erreurs);
    const [regions, sources] = await Promise.all([store.regions(), store.sources()]);
    let r;
    try { r = await construire(prop, regions, sources.domaines_autorises); }
    catch (e) { if (e.statut === 422) await rejeter(prop, e.message, e.details); throw e; }
    if (r.type === 'dispositif') {
      const val = store.validateur.valider('dispositif.json', r.apres);
      if (!val.ok) await rejeter(prop, 'La fiche obtenue serait invalide', val.erreurs);
      const pb = verifierSources(r.apres.sources, sources.domaines_autorises, r.apres.id)
        .concat(...Object.entries(r.apres.specificites_regionales || {}).map(([c, s]) => verifierSources(s.sources, sources.domaines_autorises, `région ${c}`)));
      if (pb.length) await rejeter(prop, 'Source non officielle dans la fiche', pb);
    }
    const id = `${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${crypto.randomBytes(3).toString('hex')}`;
    const enreg = { id, statut: 'en_attente', date_depot: new Date().toISOString(), agent: prop.agent || null, region: prop.region, action: prop.action,
      dispositif_id: prop.dispositif_id || r.apres.dispositif_id || null, motif: prop.motif || null, sources: prop.sources, type: r.type, avant: r.avant, apres: r.apres, diff: calculerDiff(r.avant, r.apres) };
    await fs.mkdir(dossier(), { recursive: true });
    await store.ecrireAtomique(fichier(id), enreg);
    await store.journaliser({ source: `agent:${prop.agent || 'inconnu'}`, region: prop.region, dispositif: enreg.dispositif_id, action: `proposition:${prop.action}`, resultat: 'en_attente', proposition: id });
    if (config.autoPublish) return accepter(id, { auto: true });
    return { id, statut: 'en_attente', diff: enreg.diff };
  }

  async function lire(id) {
    try { return JSON.parse(await fs.readFile(fichier(id), 'utf8')); }
    catch (e) { if (e instanceof ErreurHttp) throw e; throw new ErreurHttp(404, 'Proposition introuvable'); }
  }

  async function lister(statut) {
    let noms = [];
    try { noms = (await fs.readdir(dossier())).filter((n) => n.endsWith('.json')); } catch { /* aucune */ }
    const toutes = await Promise.all(noms.map((n) => lire(n.replace(/\.json$/, ''))));
    return toutes.filter((p) => !statut || p.statut === statut).sort((a, b) => b.date_depot.localeCompare(a.date_depot))
      .map(({ id, statut: s, date_depot, agent, region, action, dispositif_id, motif, diff }) => ({ id, statut: s, date_depot, agent, region, action, dispositif_id, motif, nb_modifications: diff.length }));
  }

  async function accepter(id, { auto = false } = {}) {
    const p = await lire(id);
    if (p.statut !== 'en_attente') throw new ErreurHttp(409, `Proposition déjà traitée (${p.statut})`);
    const meta = { source: `agent:${p.agent || 'inconnu'}${auto ? ' (publication auto)' : ' (validée)'}`, region: p.region };
    if (p.type === 'actualite') await store.ajouterActualite(p.apres, meta);
    else {
      const courante = await store.lireDispositif(p.dispositif_id);
      if (JSON.stringify(courante ?? null) !== JSON.stringify(p.avant ?? null)) throw new ErreurHttp(409, 'La fiche a été modifiée depuis le dépôt de cette proposition : la refuser et en redemander une');
      await store.ecrireDispositif(p.apres, meta);
    }
    p.statut = auto ? 'acceptee_auto' : 'acceptee'; p.date_decision = new Date().toISOString();
    await store.ecrireAtomique(fichier(id), p);
    return { id, statut: p.statut };
  }

  async function refuser(id, motif = '') {
    const p = await lire(id);
    if (p.statut !== 'en_attente') throw new ErreurHttp(409, `Proposition déjà traitée (${p.statut})`);
    p.statut = 'refusee'; p.date_decision = new Date().toISOString(); p.motif_refus = String(motif).slice(0, 500);
    await store.ecrireAtomique(fichier(id), p);
    await store.journaliser({ source: 'local', region: p.region, dispositif: p.dispositif_id, action: `proposition:${p.action}`, resultat: 'refusee', proposition: id });
    return { id, statut: p.statut };
  }

  return { deposer, lister, lire, accepter, refuser };
}
