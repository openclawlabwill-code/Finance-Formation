// Point d'entrée : npm start  →  http://127.0.0.1:3000 (ou le premier port libre suivant)
import { spawn } from 'node:child_process';
import { chargerConfig } from './config.js';
import { creerApp } from './app.js';
import { ecouter } from './ecoute.js';

const config = chargerConfig();
const { serveur } = creerApp(config);

try {
  const port = await ecouter(serveur, config.host, config.port);
  const url = `http://127.0.0.1:${port}`;
  console.log(`FinanceForma démarré : ${url}  (région par défaut : ${config.regionParDefaut})`);
  if (port !== config.port) console.log(`Le port ${config.port} était indisponible (utilisé ou réservé par Windows) : le port ${port} est utilisé à la place.`);
  console.log(`Ouvrez exactement cette adresse dans le navigateur : ${url}`);
  console.log('(Évitez « localhost » : sous Windows il peut pointer vers un autre programme.)');
  if (!config.apiToken) console.log('Note : API_TOKEN absent → l\'API de mise à jour est désactivée (voir .env.example).');
  if (process.env.OUVRIR_NAVIGATEUR === '1') {
    const [cmd, args] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
    try { spawn(cmd, args, { detached: true, stdio: 'ignore' }).on('error', () => {}).unref(); } catch { /* ouverture manuelle */ }
  }
} catch (e) {
  console.error(`Impossible de démarrer FinanceForma : ${(e.code === 'EADDRINUSE' || e.code === 'EACCES') ? 'aucun port utilisable entre ' + config.port + ' et ' + (config.port + 200) : e.message}`);
  process.exit(1);
}
