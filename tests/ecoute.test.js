import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { ecouter } from '../server/ecoute.js';

test('écoute : prend le port suivant si le premier est occupé', async () => {
  const a = http.createServer(), b = http.createServer();
  const pa = await ecouter(a, '127.0.0.1', 38100);
  const pb = await ecouter(b, '127.0.0.1', pa);
  assert.equal(pb, pa + 1);
  await new Promise((r) => a.close(r)); await new Promise((r) => b.close(r));
});
test('écoute : échoue clairement quand aucun port n’est libre', async () => {
  const s = http.createServer(), t = http.createServer();
  const p = await ecouter(s, '127.0.0.1', 38200);
  await assert.rejects(ecouter(t, '127.0.0.1', p, 0), { code: 'EADDRINUSE' });
  await new Promise((r) => s.close(r));
});

test('écoute : un port interdit (EACCES, plages réservées Windows) fait passer au suivant', async () => {
  const faux = { once(ev, f) { this.surErreur = f; }, removeListener() {}, listen(port, host, cb) { if (port < 3002) { const e = new Error('permission denied'); e.code = 'EACCES'; setImmediate(() => this.surErreur(e)); } else setImmediate(cb); } };
  assert.equal(await ecouter(faux, '127.0.0.1', 3000), 3002);
});
