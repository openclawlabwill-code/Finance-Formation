// npm run verifier-liens : détecte les liens morts dans les fiches et dans config/sources.json.
// Codes 403/429 = site protégé contre les robots (lien probablement valable, à ouvrir à la main).
import { chargerConfig } from '../server/config.js';
import { creerApp } from '../server/app.js';

const config = chargerConfig();
const { store } = creerApp(config);
const urls = new Map(); // url -> origine
const ajouter = (u, o) => { if (u && !urls.has(u)) urls.set(u, o); };
for (const d of await store.listerDispositifs()) {
  d.sources.forEach((s) => ajouter(s.url, d.id));
  for (const [r, sp] of Object.entries(d.specificites_regionales || {})) sp.sources.forEach((s) => ajouter(s.url, `${d.id}/région ${r}`));
}
const src = await store.sources();
src.nationales.forEach((s) => ajouter(s.url, 'sources.json'));
for (const [r, v] of Object.entries(src.regions)) for (const l of Object.values(v.acteurs)) l.forEach((s) => ajouter(s.url, `sources.json/région ${r}`));

async function tester(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const r = await fetch(url, { redirect: 'follow', signal: ctrl.signal, headers: { 'user-agent': 'FinanceForma-verif-liens/0.1' } });
    return r.status;
  } catch (e) { return `erreur (${e.cause?.code || e.name})`; } finally { clearTimeout(t); }
}

const file = [...urls.entries()];
const resultats = [];
await Promise.all(Array.from({ length: 4 }, async () => {
  while (file.length) { const [u, o] = file.shift(); resultats.push({ url: u, origine: o, statut: await tester(u) }); }
}));
let morts = 0, douteux = 0;
for (const r of resultats.sort((a, b) => a.url.localeCompare(b.url))) {
  const ok = typeof r.statut === 'number' && r.statut < 400;
  const protege = r.statut === 403 || r.statut === 429;
  if (!ok && !protege) morts++; else if (protege) douteux++;
  console.log(`${ok ? '✓' : protege ? '?' : '✗'} ${r.statut}  ${r.url}  (${r.origine})`);
}
console.log(`\n${resultats.length} liens : ${morts} mort(s), ${douteux} protégé(s) contre les robots (à ouvrir à la main).`);
process.exit(morts ? 1 : 0);
