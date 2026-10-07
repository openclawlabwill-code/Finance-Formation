// Accès aux données JSON : lecture, écriture atomique, sauvegarde automatique avant modification, journal.
import fs from 'node:fs/promises';
import path from 'node:path';
import { ErreurHttp } from './http.js';

const ID_RE = /^[a-z0-9][a-z0-9-]{1,80}$/;
const horodatage = () => new Date().toISOString().replace(/[:.]/g, '-');

const LIMITE_ACTUALITES = 20;

export function creerStore({ dataDir, configDir, validateur }) {
  const p = (...segs) => path.join(dataDir, ...segs);

  async function lireJson(fichier, defaut) {
    try { return JSON.parse(await fs.readFile(fichier, 'utf8')); }
    catch (e) { if (e.code === 'ENOENT' && defaut !== undefined) return defaut; throw e; }
  }

  async function journaliser(entree) {
    const ligne = JSON.stringify({ date: new Date().toISOString(), ...entree }) + '\n';
    await fs.appendFile(p('journal-maj.log'), ligne);
  }

  /** Copie le fichier existant dans data/backups avant toute modification. */
  async function sauvegarder(fichier) {
    try { await fs.access(fichier); } catch { return null; }
    await fs.mkdir(p('backups'), { recursive: true });
    const rel = path.relative(dataDir, fichier).split(path.sep).join('__');
    const nom = `${horodatage()}__${rel}`;
    await fs.copyFile(fichier, p('backups', nom));
    return nom;
  }

  async function ecrireAtomique(fichier, objet) {
    await fs.mkdir(path.dirname(fichier), { recursive: true });
    const tmp = `${fichier}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(objet, null, 2) + '\n');
    await fs.rename(tmp, fichier);
  }

  const verifierId = (id) => { if (!ID_RE.test(String(id))) throw new ErreurHttp(400, `Identifiant invalide : ${id}`); return id; };

  return {
    dataDir, configDir, validateur, lireJson, journaliser, sauvegarder, ecrireAtomique, verifierId,

    regions: async () => (await lireJson(p('regions.json'))).regions,
    attributs: async () => lireJson(p('attributs.json')),
    arbre: async () => lireJson(p('arbre.json')),
    sources: async () => lireJson(path.join(configDir, 'sources.json')),
    actualites: async () => lireJson(p('actualites.json'), []),

    async listerDispositifs() {
      let noms = [];
      try { noms = (await fs.readdir(p('dispositifs'))).filter((n) => n.endsWith('.json')); } catch { /* dossier absent */ }
      const liste = await Promise.all(noms.sort().map((n) => lireJson(p('dispositifs', n))));
      return liste;
    },
    async lireDispositif(id) {
      verifierId(id);
      return lireJson(p('dispositifs', `${id}.json`), null);
    },

    /** Écrit une fiche après validation stricte ; sauvegarde l'ancienne version ; journalise. */
    async ecrireDispositif(fiche, meta = {}) {
      const r = validateur.valider('dispositif.json', fiche);
      if (!r.ok) throw new ErreurHttp(422, 'Fiche dispositif invalide', r.erreurs);
      const fichier = p('dispositifs', `${verifierId(fiche.id)}.json`);
      const existait = await fs.access(fichier).then(() => true, () => false);
      const backup = await sauvegarder(fichier);
      await ecrireAtomique(fichier, fiche);
      await journaliser({ source: meta.source || 'local', region: meta.region || 'national', dispositif: fiche.id, action: existait ? 'modification' : 'creation', resultat: 'ok', backup });
      return fiche;
    },

    /** Ajoute une actualité (validée) ; au-delà de 20, les plus anciennes passent dans actualites-archive.json. */
    async ajouterActualite(actu, meta = {}) {
      const r = validateur.valider('actualite.json', actu);
      if (!r.ok) throw new ErreurHttp(422, 'Actualité invalide', r.erreurs);
      const fichier = p('actualites.json');
      const courantes = (await lireJson(fichier, [])).filter((a) => a.id !== actu.id);
      courantes.push(actu);
      courantes.sort((a, b) => b.date.localeCompare(a.date));
      const gardees = courantes.slice(0, LIMITE_ACTUALITES), anciennes = courantes.slice(LIMITE_ACTUALITES);
      const backup = await sauvegarder(fichier);
      await ecrireAtomique(fichier, gardees);
      if (anciennes.length) {
        const arch = p('actualites-archive.json');
        const deja = await lireJson(arch, []);
        await ecrireAtomique(arch, [...anciennes, ...deja.filter((a) => !anciennes.some((x) => x.id === a.id))]);
      }
      await journaliser({ source: meta.source || 'local', region: actu.region, dispositif: actu.dispositif_id, action: 'actualite', resultat: 'ok', backup });
      return { actualite: actu, archivees: anciennes.length };
    },

    async listerBackups() {
      try { return (await fs.readdir(p('backups'))).filter((n) => n.includes('__')).sort().reverse(); } catch { return []; }
    },

    /** Restaure un fichier depuis data/backups (l'état courant est lui-même sauvegardé avant). */
    async restaurerBackup(nom) {
      if (!/^[0-9TZ-]+__[a-zA-Z0-9_.-]+$/.test(nom)) throw new ErreurHttp(400, 'Nom de sauvegarde invalide');
      const source = p('backups', nom);
      const contenu = await fs.readFile(source, 'utf8').catch(() => { throw new ErreurHttp(404, 'Sauvegarde introuvable'); });
      JSON.parse(contenu);
      const rel = nom.split('__').slice(1).join('/');
      const cible = path.normalize(p(rel));
      if (!cible.startsWith(dataDir + path.sep) || rel.startsWith('backups')) throw new ErreurHttp(400, 'Cible de restauration interdite');
      await sauvegarder(cible);
      await fs.writeFile(cible, contenu);
      await journaliser({ source: 'local', region: 'national', dispositif: path.basename(rel, '.json'), action: 'restauration', resultat: 'ok', backup: nom });
      return { restaure: rel };
    },
  };
}
