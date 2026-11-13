#!/usr/bin/env node
// Write probe/seed-expected*.json: the state hash after the adapter's seed, per target (the probe never writes it).
//   node probe/make-seed-expected.mjs
import { writeFileSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import factory from './payload-adapter.mjs';

const base = new URL('./targets/', import.meta.url).pathname;
for (const [target, out] of [['payload.yaml', 'seed-expected.json'], ['payload-locked.yaml', 'seed-expected-locked.json']]) {
  // the target files are small YAML; read the options we need by hand (no YAML dependency here)
  const t = readFileSync(base + target, 'utf8');
  const locked = /hold_locks/.test(t);
  const a = factory({ options: { api_url: 'http://127.0.0.1:3093', ...(locked ? { hold_locks: [{ collection: 'posts', id: 2, as: 'editor-b' }] } : {}) } }, base);
  await a.seed();
  const h = await a.stateHash();
  writeFileSync(new URL(`./${out}`, import.meta.url), JSON.stringify({ sha256: h.sha256, objects: h.objects, target, note: 'state hash after the adapter seed (sandbox/seed.mjs + hold_locks)' }, null, 1) + '\n');
  console.log(out, h.sha256);
}
