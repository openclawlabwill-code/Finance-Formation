// Point d'entrée : npm start  →  http://localhost:3000
import { chargerConfig } from './config.js';
import { creerApp } from './app.js';

const config = chargerConfig();
const { serveur } = creerApp(config);
serveur.listen(config.port, config.host, () => {
  console.log(`FinanceForma démarré : http://localhost:${config.port}  (région par défaut : ${config.regionParDefaut})`);
  if (!config.apiToken) console.log('Note : API_TOKEN absent → l\'API de mise à jour est désactivée (voir .env.example).');
});
