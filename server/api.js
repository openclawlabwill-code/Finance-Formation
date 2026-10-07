// Routes de l'API REST. Lecture ouverte (serveur lié à 127.0.0.1) ; écriture protégée par token (étape f).
import { ErreurHttp } from './http.js';
import { dispositifsPourRegion, decorerPourRegion } from './regional.js';
import { evaluerProfil, verifierProfil } from './eligibilite.js';
import { creerServiceEtudes, versMarkdown } from './etudes.js';

export function enregistrerRoutesApi(r, { store, config }) {
  const etudes = creerServiceEtudes({ store });
  const ctx = async () => ({ sources: await store.sources(), regions: await store.regions() });

  async function regionValide(code) {
    if (!code) return null;
    const regions = await store.regions();
    if (!regions.some((x) => x.code === code)) throw new ErreurHttp(400, `Région inconnue : ${code}`);
    return code;
  }

  r.get('/api/sante', async () => {
    const [d, regs] = await Promise.all([store.listerDispositifs(), store.regions()]);
    return { statut: 'ok', version: '0.1.0', region_par_defaut: config.regionParDefaut, nb_dispositifs: d.length, nb_regions: regs.length, api_maj_active: Boolean(config.apiToken) };
  });

  r.get('/api/regions', async () => ({ region_par_defaut: config.regionParDefaut, regions: await store.regions() }));
  r.get('/api/regions/:code', async (req) => {
    const reg = (await store.regions()).find((x) => x.code === req.params.code);
    if (!reg) throw new ErreurHttp(404, 'Région inconnue');
    return reg;
  });

  r.get('/api/attributs', async () => store.attributs());
  r.get('/api/arbre', async () => store.arbre());
  r.get('/api/sources', async () => store.sources());

  // GET /api/dispositifs?region=52[&statut=actif] — sans région : liste brute (pour l'agent de mise à jour).
  r.get('/api/dispositifs', async (req) => {
    const region = await regionValide(req.query.region);
    const tous = await store.listerDispositifs();
    let liste = region ? dispositifsPourRegion(tous, region, await ctx()) : tous.filter((d) => d.statut !== 'supprime' || req.query.inclure_supprimes === '1');
    if (req.query.statut) liste = liste.filter((d) => d.statut === req.query.statut);
    return { region: region || null, total: liste.length, dispositifs: liste };
  });

  r.get('/api/dispositifs/:id', async (req) => {
    const d = await store.lireDispositif(req.params.id);
    if (!d) throw new ErreurHttp(404, 'Dispositif introuvable');
    const region = await regionValide(req.query.region);
    if (!region) return d;
    const regional = decorerPourRegion(d, region, await ctx());
    if (!regional) throw new ErreurHttp(404, 'Dispositif non concerné par cette région');
    return { ...d, regional };
  });

  // Actualités : national + région choisie ; ?region=toutes pour tout voir.
  r.get('/api/actualites', async (req) => {
    const toutes = await store.actualites();
    let liste = toutes;
    if (req.query.region && req.query.region !== 'toutes') {
      const region = await regionValide(req.query.region);
      liste = toutes.filter((a) => a.region === 'national' || a.region === region);
    }
    liste = [...liste].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20);
    return { total: liste.length, actualites: liste };
  });

  // POST /api/evaluer { region, profil } → dispositifs possibles (éligibilité probable / à vérifier), triés par bloc.
  r.post('/api/evaluer', async (req) => {
    const { region, profil = {} } = req.body || {};
    if (!region) throw new ErreurHttp(400, 'Champ « region » obligatoire');
    await regionValide(region);
    const attributs = await store.attributs();
    const pb = verifierProfil(profil, attributs);
    if (pb.length) throw new ErreurHttp(400, 'Profil invalide', pb);
    const decores = dispositifsPourRegion(await store.listerDispositifs(), region, await ctx());
    return { region, ...evaluerProfil(decores, profil, attributs) };
  });

  // ---------- Études (historique local, sans donnée personnelle identifiante) ----------
  const envoyerMarkdown = (res, texte, nom) => {
    res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8', 'Content-Disposition': `attachment; filename="${nom}"`, 'Cache-Control': 'no-store' });
    res.end(texte);
  };
  r.post('/api/etudes/apercu', async (req, res) => {
    const snap = await etudes.apercu(req.body);
    if (req.query.format === 'md') return envoyerMarkdown(res, versMarkdown(snap), 'synthese-etude.md');
    return snap;
  });
  r.post('/api/etudes', async (req) => etudes.enregistrer(req.body));
  r.get('/api/etudes', async () => ({ etudes: await etudes.lister() }));
  r.get('/api/etudes/:id', async (req) => etudes.lire(req.params.id));
  r.get('/api/etudes/:id/export.md', async (req, res) => {
    const e = await etudes.lire(req.params.id);
    envoyerMarkdown(res, versMarkdown(e), `synthese-${e.id}.md`);
  });
  r.delete('/api/etudes/:id', async (req) => etudes.supprimer(req.params.id));
}
