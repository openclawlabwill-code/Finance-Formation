// Mini-framework HTTP : routeur à paramètres, corps JSON, fichiers statiques, en-têtes de sécurité.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};

export class ErreurHttp extends Error {
  constructor(statut, message, details) { super(message); this.statut = statut; this.details = details; }
}

export function creerRouteur() {
  const routes = [];
  const ajouter = (methode) => (motif, ...handlers) => {
    const cles = [];
    const re = new RegExp('^' + motif.replace(/:([a-zA-Z_]+)/g, (_, k) => { cles.push(k); return '([^/]+)'; }) + '/?$');
    routes.push({ methode, re, cles, handlers });
  };
  return {
    get: ajouter('GET'), post: ajouter('POST'), put: ajouter('PUT'), delete: ajouter('DELETE'),
    trouver(methode, chemin) {
      for (const r of routes) {
        if (r.methode !== methode) continue;
        const m = r.re.exec(chemin);
        if (m) return { handlers: r.handlers, params: Object.fromEntries(r.cles.map((k, i) => [k, decodeURIComponent(m[i + 1])])) };
      }
      return null;
    },
    cheminExiste(chemin) { return routes.some((r) => r.re.test(chemin)); },
  };
}

/** Middleware : exige "Authorization: Bearer <API_TOKEN>". Désactive la route si aucun token n'est configuré. */
export function exigerToken(config) {
  return async (req) => {
    if (!config.apiToken) throw new ErreurHttp(503, "API de mise à jour désactivée : définir API_TOKEN dans .env");
    const recu = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const a = Buffer.from(recu), b = Buffer.from(config.apiToken);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new ErreurHttp(401, 'Token invalide ou manquant');
  };
}

const ENTETES = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'none'",
};

function lireCorps(req, limite = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const morceaux = []; let taille = 0;
    req.on('data', (c) => { taille += c.length; if (taille > limite) { reject(new ErreurHttp(413, 'Corps de requête trop volumineux')); req.destroy(); } else morceaux.push(c); });
    req.on('end', () => {
      if (!morceaux.length) return resolve(undefined);
      try { resolve(JSON.parse(Buffer.concat(morceaux).toString('utf8'))); }
      catch { reject(new ErreurHttp(400, 'JSON invalide')); }
    });
    req.on('error', reject);
  });
}

function envoyerJson(res, statut, objet) {
  const corps = JSON.stringify(objet);
  res.writeHead(statut, { ...ENTETES, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(corps) });
  res.end(corps);
}

function servirStatique(publicDir, chemin, res) {
  let rel = chemin === '/' ? '/index.html' : chemin === '/admin' ? '/admin.html' : chemin;
  const fichier = path.normalize(path.join(publicDir, rel));
  if (!fichier.startsWith(publicDir + path.sep)) return false;           // anti path-traversal
  if (!fs.existsSync(fichier) || !fs.statSync(fichier).isFile()) return false;
  const type = MIME[path.extname(fichier).toLowerCase()] || 'application/octet-stream';
  res.writeHead(200, { ...ENTETES, 'Content-Type': type, 'Cache-Control': 'no-cache' });
  fs.createReadStream(fichier).pipe(res);
  return true;
}

export function creerServeur({ routeur, publicDir, hotesAutorises = ['localhost', '127.0.0.1', '[::1]'] }) {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const chemin = url.pathname;
      // Protection contre le « DNS rebinding » : seuls les noms d'hôte locaux sont acceptés.
      const hote = (req.headers.host || '').replace(/:\d+$/, '').toLowerCase();
      if (!hotesAutorises.includes(hote)) throw new ErreurHttp(403, 'Hôte non autorisé');
      if (chemin.startsWith('/api/')) {
        const route = routeur.trouver(req.method, chemin);
        if (!route) {
          if (routeur.cheminExiste(chemin)) throw new ErreurHttp(405, 'Méthode non autorisée');
          throw new ErreurHttp(404, 'Route inconnue');
        }
        // Protection CSRF : les écritures exigent une origine identique et un corps JSON (déclenche un contrôle CORS du navigateur).
        if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
          const origine = req.headers.origin;
          if (origine && new URL(origine).host !== req.headers.host) throw new ErreurHttp(403, 'Origine non autorisée');
          if (req.method !== 'DELETE' && !(req.headers['content-type'] || '').startsWith('application/json')) throw new ErreurHttp(415, 'Content-Type application/json requis');
        }
        req.params = route.params;
        req.query = Object.fromEntries(url.searchParams);
        if (['POST', 'PUT'].includes(req.method)) req.body = await lireCorps(req);
        for (const h of route.handlers) {
          const r = await h(req, res);
          if (res.writableEnded || res.headersSent) return;   // le handler a répondu lui-même (export fichier)
          if (r !== undefined) return envoyerJson(res, 200, r);
        }
        throw new Error('Handler sans réponse');
      }
      if (req.method === 'GET' || req.method === 'HEAD') {
        if (servirStatique(publicDir, chemin, res)) return;
      }
      throw new ErreurHttp(404, 'Page introuvable');
    } catch (e) {
      const statut = e.statut || 500;
      if (statut === 500) console.error(e);
      if (!res.headersSent) envoyerJson(res, statut, { erreur: statut === 500 ? 'Erreur interne du serveur' : e.message, details: e.details });
    }
  });
}
