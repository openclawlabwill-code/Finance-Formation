// Assemblage de l'application : validateur, store, routes, serveur HTTP.
import fs from 'node:fs';
import path from 'node:path';
import { creerValidateur } from './validateur.js';
import { creerStore } from './store.js';
import { creerRouteur, creerServeur } from './http.js';
import { enregistrerRoutesApi } from './api.js';

export function chargerSchemas(schemasDir) {
  const registre = {};
  for (const f of fs.readdirSync(schemasDir).filter((n) => n.endsWith('.schema.json'))) {
    const s = JSON.parse(fs.readFileSync(path.join(schemasDir, f), 'utf8'));
    registre[s.$id] = s;
  }
  return registre;
}

export function creerApp(config) {
  const validateur = creerValidateur(chargerSchemas(config.schemasDir));
  const store = creerStore({ dataDir: config.dataDir, configDir: config.configDir, validateur });
  const routeur = creerRouteur();
  enregistrerRoutesApi(routeur, { store, config });
  const serveur = creerServeur({ routeur, publicDir: config.publicDir, hotesAutorises: config.hotesAutorises });
  return { serveur, store, validateur, routeur, config };
}
