// Utilitaires de test : copie des données dans un dossier temporaire + serveur éphémère.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chargerConfig, RACINE } from '../server/config.js';
import { creerApp } from '../server/app.js';

export const aujourdhui = new Date().toISOString().slice(0, 10);

/** Fiche de test valide (sources sur domaines officiels autorisés). */
export function fiche(surcharge = {}) {
  return {
    id: 'fiche-test', nom: 'Fiche de test', sigle: null, categorie: 'autre',
    publics_concernes: ['Tout public'], criteres_eligibilite: [], criteres_a_verifier: [],
    resume: 'Résumé de test suffisamment long pour passer la validation du schéma.',
    ce_qui_est_finance: null, montant_ou_plafond: null, demarche: ['Étape un'],
    sources: [{ url: 'https://www.service-public.fr/test', intitule: 'Source de test', organisme: 'Service-Public.fr' }],
    date_derniere_verification: aujourdhui, date_derniere_modification: aujourdhui, statut: 'actif',
    historique: [{ date: aujourdhui, action: 'creation', resume: 'Création (test)' }],
    portee_geographique: 'national', regions_concernees: [], declinaison_regionale: false, acteur_regional: null,
    specificites_regionales: {},
    ...surcharge,
  };
}

export async function demarrer({ apiToken = '' } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ff-'));
  fs.cpSync(path.join(RACINE, 'data'), path.join(tmp, 'data'), { recursive: true });
  fs.cpSync(path.join(RACINE, 'config'), path.join(tmp, 'config'), { recursive: true });
  for (const f of fs.readdirSync(path.join(tmp, 'data/dispositifs'))) if (f.endsWith('.json')) fs.rmSync(path.join(tmp, 'data/dispositifs', f));
  const config = chargerConfig({ dataDir: path.join(tmp, 'data'), configDir: path.join(tmp, 'config'), apiToken });
  const app = creerApp(config);
  await new Promise((ok) => app.serveur.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${app.serveur.address().port}`;
  const appel = async (chemin, opts = {}) => {
    const r = await fetch(base + chemin, { ...opts, headers: { 'content-type': 'application/json', ...(opts.headers || {}) } });
    const txt = await r.text();
    let json; try { json = JSON.parse(txt); } catch { json = txt; }
    return { statut: r.status, json, entetes: r.headers };
  };
  return { ...app, base, appel, tmp, arreter: () => new Promise((ok) => app.serveur.close(ok)) };
}
