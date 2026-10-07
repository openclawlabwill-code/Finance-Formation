// Génère docs/COUVERTURE_PAYS_DE_LA_LOIRE.md : matrice de couverture + points à vérifier à la main.
import fs from 'node:fs';
import path from 'node:path';
import { chargerConfig, RACINE } from '../server/config.js';
import { creerApp } from '../server/app.js';
import { couvertureRegion } from '../server/couverture.js';

const region = process.argv[2] || '52';
const app = creerApp(chargerConfig());
const c = couvertureRegion({ region, regions: await app.store.regions(), sources: await app.store.sources(), dispositifs: await app.store.listerDispositifs() });
const s = c.synthese, pct = (v) => (v === null ? 'n/a' : `${v} %`);
const oui = (b) => (b ? 'oui' : 'non');
const lignes = [
  `# Couverture ${c.nom} (${c.region})`, '',
  `Généré le ${new Date().toISOString().slice(0, 10)} par \`npm run couverture\`. Ne pas modifier à la main.`, '',
  `- Acteurs régionaux documentés : ${s.acteurs_documentes}/${s.acteurs_total} (${pct(s.taux_acteurs)})`,
  `- Déclinaisons régionales documentées et vérifiées : ${s.declinaisons_documentees}/${s.declinaisons_requises} (${pct(s.taux_declinaisons)})`,
  `- Fiches non vérifiées depuis plus de 90 jours : ${s.fiches_perimees}`, `- Fiches au statut « à vérifier » : ${s.fiches_a_verifier}`,
  `- Site du Conseil régional renseigné : ${oui(s.site_conseil_regional)}`, '',
  '## Acteurs régionaux', '', '| Acteur | Documenté | Sources |', '|---|---|---|',
  ...c.acteurs.map((a) => `| ${a.acteur.replace(/_/g, ' ')} | ${oui(a.documente)} | ${a.sources.map((x) => `${x.organisme} (${x.date_verification})`).join(' ; ') || '—'} |`), '',
  '## Dispositifs', '', '| Dispositif | Déclinaison requise | Documentée et vérifiée | Statut fiche |', '|---|---|---|---|',
  ...c.fiches.map((f) => `| ${f.nom} | ${oui(f.declinaison_requise)} | ${f.declinaison_requise ? oui(f.documentee) : '—'} | ${f.statut} |`), '',
];
const extra = path.join(RACINE, 'docs', `A_VERIFIER_${region}.md`);
if (fs.existsSync(extra)) lignes.push(fs.readFileSync(extra, 'utf8').trim(), '');
fs.mkdirSync(path.join(RACINE, 'docs'), { recursive: true });
const sortie = path.join(RACINE, 'docs', `COUVERTURE_${c.nom.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9]+/g, '_')}.md`);
fs.writeFileSync(sortie, lignes.join('\n'));
console.log(`Écrit : ${path.relative(RACINE, sortie)}`);
