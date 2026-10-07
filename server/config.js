// Chargement de la configuration : fichier .env (facultatif) puis variables d'environnement.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Analyse très simple d'un fichier .env (CLE=valeur, # = commentaire). */
function lireEnv(fichier) {
  const sortie = {};
  if (!fs.existsSync(fichier)) return sortie;
  for (const ligne of fs.readFileSync(fichier, 'utf8').split(/\r?\n/)) {
    const m = ligne.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !ligne.trim().startsWith('#')) sortie[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return sortie;
}

export function chargerConfig(surcharges = {}) {
  const env = { ...lireEnv(path.join(RACINE, '.env')), ...process.env };
  return {
    racine: RACINE,
    port: Number(env.PORT || 3000),
    host: env.HOST || '127.0.0.1',
    regionParDefaut: env.REGION_PAR_DEFAUT || '52',
    apiToken: env.API_TOKEN || '',
    autoPublish: String(env.AUTO_PUBLISH || '').toLowerCase() === 'true',
    hotesAutorises: ['localhost', '127.0.0.1', '[::1]', ...String(env.HOTES_AUTORISES || '').split(',').map((s) => s.trim()).filter(Boolean)],
    dataDir: path.resolve(RACINE, env.DATA_DIR || 'data'),
    configDir: path.resolve(RACINE, env.CONFIG_DIR || 'config'),
    schemasDir: path.join(RACINE, 'schemas'),
    publicDir: path.join(RACINE, 'public'),
    ...surcharges,
  };
}
