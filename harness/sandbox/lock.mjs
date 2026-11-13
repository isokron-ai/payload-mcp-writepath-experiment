#!/usr/bin/env node
// Hold or release a document lock as a sandbox user, the way the admin panel does when a user opens a
// document (a payload-locked-documents row naming the document and the user; the admin refreshes its
// updatedAt while the form is open; locks older than the collection's lock duration, 300 s by default, expire).
//   node sandbox/lock.mjs hold    --as editor-b --collection posts --id 12
//   node sandbox/lock.mjs hold    --as editor-b --collection posts --slug spring-planting-guide
//   node sandbox/lock.mjs refresh --as editor-b --collection posts --id 12     (heartbeat: touch updatedAt)
//   node sandbox/lock.mjs release --collection posts --id 12
//   node sandbox/lock.mjs list
import { api, login, userId, findOne } from './lib.mjs';

export async function locksFor(collection, id) {
  const ta = await login('editor-a');
  const q = new URLSearchParams({ 'where[document.relationTo][equals]': collection, 'where[document.value][equals]': String(id), depth: '0', limit: '10' });
  const r = await api('GET', `/api/payload-locked-documents?${q}`, { token: ta });
  return r.json?.docs ?? [];
}

export async function hold(who, collection, id) {
  const t = await login(who);
  const uid = await userId(who);
  const existing = await locksFor(collection, id);
  if (existing.length) {
    const r = await api('PATCH', `/api/payload-locked-documents/${existing[0].id}`, { token: t, body: { user: { relationTo: 'users', value: uid } } });
    return { lock: existing[0].id, refreshed: r.status };
  }
  const r = await api('POST', '/api/payload-locked-documents', { token: t, body: { document: { relationTo: collection, value: Number(id) }, user: { relationTo: 'users', value: uid } } });
  if (r.status !== 201) throw new Error(`hold lock: HTTP ${r.status} ${r.text.slice(0, 200)}`);
  return { lock: r.json.doc.id, created: 201 };
}

export async function release(collection, id) {
  const ta = await login('editor-a');
  let n = 0;
  for (const l of await locksFor(collection, id)) { await api('DELETE', `/api/payload-locked-documents/${l.id}`, { token: ta }); n++; }
  return { released: n };
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const arg = (k) => { const i = rest.indexOf(`--${k}`); return i >= 0 ? rest[i + 1] : undefined; };
  const collection = arg('collection') || 'posts';
  let id = arg('id');
  if (!id && arg('slug')) id = (await findOne(collection, 'slug', arg('slug'))).id;
  let out;
  if (cmd === 'hold' || cmd === 'refresh') out = await hold(arg('as') || 'editor-b', collection, id);
  else if (cmd === 'release') out = await release(collection, id);
  else if (cmd === 'list') { const ta = await login('editor-a'); out = (await api('GET', '/api/payload-locked-documents?depth=0&limit=100', { token: ta })).json.docs; }
  else throw new Error('usage: lock.mjs hold|refresh|release|list ...');
  console.log(JSON.stringify(out));
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
