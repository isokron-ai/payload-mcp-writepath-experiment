#!/usr/bin/env node
// Seed (and reset) the sandbox through Payload's REST API on 127.0.0.1.
//   node sandbox/seed.mjs            reset content to the seed and print the state hash
//   node sandbox/seed.mjs --hash     print the current state hash only
// Users editor-a and editor-b, editor-a's MCP API key (posts, listings, tasks: find/create/update/delete),
// then posts (localized, drafts, array + blocks), listings (fields named locale/draft/select), tasks (20; 3 archived).
import { execFileSync } from 'node:child_process';
import { api, login, users, mcpKey, userId, sha256, stable } from './lib.mjs';

export const SEED = {
  posts: [
    { slug: 'welcome-to-the-garden-club', title: { en: 'Welcome to the garden club', es: 'Bienvenidos al club de jardinería' }, summary: { en: 'Who we are and when we meet.', es: 'Quiénes somos y cuándo nos reunimos.' }, category: 'news', tags: ['club', 'intro'], author: 'Mara', readingMinutes: 3, status: 'published',
      items: [{ label: { en: 'Meeting calendar', es: 'Calendario de reuniones' }, url: '/calendar' }, { label: { en: 'Join form', es: 'Formulario de inscripción' }, url: '/join' }],
      layout: [{ blockType: 'hero', heading: { en: 'Grow with us', es: 'Crece con nosotros' } }, { blockType: 'cta', label: 'Join', href: '/join' }] },
    { slug: 'spring-planting-guide', title: { en: 'Spring planting guide', es: 'Guía de siembra de primavera' }, summary: { en: 'What to sow in March and April.', es: 'Qué sembrar en marzo y abril.' }, category: 'guide', tags: ['spring', 'sowing'], author: 'Iqbal', readingMinutes: 9, status: 'published',
      items: [{ label: { en: 'Tomatoes', es: 'Tomates' }, url: '/plants/tomato' }, { label: { en: 'Beans', es: 'Judías' }, url: '/plants/bean' }, { label: { en: 'Courgettes', es: 'Calabacines' }, url: '/plants/courgette' }],
      layout: [{ blockType: 'hero', heading: { en: 'Sow now', es: 'Siembra ahora' } }, { blockType: 'quote', text: 'The best time to plant a tree was twenty years ago.', attribution: 'Proverb' }] },
    { slug: 'compost-basics', title: { en: 'Compost basics' }, summary: { en: 'Greens, browns and patience.' }, category: 'guide', tags: ['compost'], author: 'Mara', readingMinutes: 6, status: 'published',
      items: [{ label: { en: 'Bin types' }, url: '/compost/bins' }], layout: [{ blockType: 'quote', text: 'Waste not.', attribution: 'Club motto' }] },
    { slug: 'autumn-plant-swap', title: { en: 'Autumn plant swap' }, summary: { en: 'Bring a cutting, take a cutting.' }, category: 'news', tags: ['event'], author: 'Iqbal', readingMinutes: 2, status: 'draft',
      items: [{ label: { en: 'Venue map' }, url: '/swap/map' }], layout: [{ blockType: 'cta', label: 'RSVP', href: '/swap/rsvp' }] },
    { slug: 'watering-schedule-2027', title: { en: 'Watering schedule 2027' }, summary: { en: 'Draft rota for next year.' }, category: 'release', tags: ['rota'], author: 'Mara', readingMinutes: 4, status: 'draft',
      items: [], layout: [] },
    { slug: 'members-only-tool-library', title: { en: 'Members-only tool library', es: 'Biblioteca de herramientas para socios' }, summary: { en: 'Borrow a spade.', es: 'Pide prestada una pala.' }, category: 'news', tags: ['tools'], author: 'Ana', readingMinutes: 5, status: 'published',
      items: [{ label: { en: 'Borrowing rules', es: 'Normas de préstamo' }, url: '/tools/rules' }, { label: { en: 'Inventory', es: 'Inventario' }, url: '/tools' }], layout: [{ blockType: 'hero', heading: { en: 'Borrow, do not buy', es: 'Pide prestado, no compres' } }] },
  ],
  listings: [
    { sku: 'SEED-TOM-01', name: 'Tomato seeds, Gardener’s Delight', price: 2.5, locale: 'en-GB', draft: false, select: 'homepage-hero' },
    { sku: 'SEED-TOM-02', name: 'Tomato seeds, San Marzano', price: 2.9, locale: 'it-IT', draft: false, select: 'none' },
    { sku: 'SEED-BEA-01', name: 'Runner bean seeds', price: 1.8, locale: 'en-GB', draft: true, select: 'none' },
    { sku: 'TOOL-SPD-01', name: 'Border spade', price: 34, locale: 'en-GB', draft: false, select: 'category-top' },
    { sku: 'TOOL-TRW-01', name: 'Hand trowel', price: 9.5, locale: 'de-DE', draft: false, select: 'none' },
    { sku: 'TOOL-HOE-01', name: 'Dutch hoe', price: 21, locale: 'en-GB', draft: true, select: 'none' },
    { sku: 'COMP-BIN-01', name: 'Compost bin, 330 l', price: 45, locale: 'en-GB', draft: false, select: 'none' },
    { sku: 'COMP-BIN-02', name: 'Compost bin, 220 l', price: 38, locale: 'es-ES', draft: false, select: 'none' },
  ],
  tasks: Array.from({ length: 20 }, (_, i) => ({
    title: ['Order seed potatoes', 'Fix shed door', 'Email newsletter', 'Turn compost', 'Prune apple tree', 'Book hall', 'Print flyers', 'Mend hose', 'Count tools', 'Clear gutter',
      'Plan swap', 'Water seedlings', 'Label beds', 'Buy twine', 'Sweep paths', 'Update rota', 'Sharpen shears', 'Check pond', 'Sort donations', 'Weed herb bed'][i],
    status: i % 3 === 0 ? 'done' : i % 3 === 1 ? 'todo' : 'doing',
    owner: ['Mara', 'Iqbal', 'Ana', 'Theo'][i % 4],
    priority: (i % 5) + 1,
    archived: i === 2 || i === 9 || i === 15,
  })),
};

async function ensureUsers() {
  const u = users();
  const first = await api('POST', '/api/users/first-register', { body: { email: u['editor-a'].email, password: u['editor-a'].password, confirm_password: u['editor-a'].password, name: 'Editor A' } });
  // 403 when a user exists already.
  if (![200, 201, 403].includes(first.status)) throw new Error(`first-register: HTTP ${first.status}`);
  const ta = await login('editor-a');
  const b = await api('GET', `/api/users?where[email][equals]=${encodeURIComponent(u['editor-b'].email)}`, { token: ta });
  if (b.json.totalDocs === 0) {
    const c = await api('POST', '/api/users', { token: ta, body: { email: u['editor-b'].email, password: u['editor-b'].password, name: 'Editor B' } });
    if (c.status !== 201) throw new Error(`create editor-b: HTTP ${c.status}`);
  }
}

async function ensureKey() {
  const ta = await login('editor-a');
  const label = 'audit-isokron-payload-mcp-2026-11-editor-a';
  const r = await api('GET', `/api/payload-mcp-api-keys?where[label][equals]=${label}`, { token: ta });
  const caps = { find: true, create: true, update: true, delete: true };
  const body = { label, description: 'Sandbox MCP key for the audit agent (editor-a)', posts: caps, listings: caps, tasks: caps, enableAPIKey: true, apiKey: mcpKey('editor-a') };
  if (r.json.totalDocs === 0) {
    const c = await api('POST', '/api/payload-mcp-api-keys', { token: ta, body });
    if (c.status !== 201) throw new Error(`create MCP key: HTTP ${c.status} ${c.text.slice(0, 200)}`);
  }
}

async function wipe(collection, ta) {
  // Bulk delete through REST as editor-a, overriding nothing: locks are wiped first.
  for (let i = 0; i < 5; i++) {
    const r = await api('DELETE', `/api/${collection}?where[id][exists]=true&limit=500`, { token: ta });
    if (r.status !== 200) throw new Error(`wipe ${collection}: HTTP ${r.status} ${r.text.slice(0, 200)}`);
    if ((r.json.docs ?? []).length === 0) return;
  }
}

async function createPost(p, ta) {
  const loc = (o, l) => (o && o[l] !== undefined ? o[l] : undefined);
  const base = (l) => ({
    title: loc(p.title, l), summary: loc(p.summary, l),
    items: p.items.map((it) => ({ label: loc(it.label, l), url: it.url })),
    layout: p.layout.map((b) => (b.blockType === 'hero' ? { blockType: 'hero', heading: loc(b.heading, l) } : b)),
  });
  const draft = p.status === 'draft';
  const c = await api('POST', `/api/posts?locale=en${draft ? '&draft=true' : ''}`, { token: ta, body: { ...base('en'), slug: p.slug, category: p.category, tags: p.tags, author: p.author, readingMinutes: p.readingMinutes, _status: p.status } });
  if (c.status !== 201) throw new Error(`create post ${p.slug}: HTTP ${c.status} ${c.text.slice(0, 300)}`);
  const doc = c.json.doc;
  if (p.title.es) {
    // Second locale: keep the row ids so the localized rows line up.
    const es = base('es');
    es.items = es.items.map((it, i) => ({ ...it, id: doc.items[i].id }));
    es.layout = es.layout.map((b, i) => ({ ...b, id: doc.layout[i].id }));
    const u = await api('PATCH', `/api/posts/${doc.id}?locale=es${draft ? '&draft=true' : ''}`, { token: ta, body: { ...es, _status: p.status } });
    if (u.status !== 200) throw new Error(`es post ${p.slug}: HTTP ${u.status} ${u.text.slice(0, 300)}`);
  }
}

export async function snapshot() {
  const ta = await login('editor-a');
  const out = {};
  for (const col of ['posts', 'listings', 'tasks']) {
    const per = {};
    for (const locale of col === 'posts' ? ['en', 'es'] : ['en']) {
      const r = await api('GET', `/api/${col}?limit=500&depth=0&draft=true&locale=${locale}&sort=createdAt`, { token: ta });
      per[locale] = r.json.docs.map(({ id, createdAt, updatedAt, ...rest }) => {
        const strip = (a) => (Array.isArray(a) ? a.map(({ id: _i, ...x }) => x) : a);
        return { ...rest, items: strip(rest.items), layout: strip(rest.layout) };
      });
    }
    out[col] = per;
  }
  const locks = await api('GET', '/api/payload-locked-documents?limit=100&depth=0', { token: ta });
  out.locks = locks.json?.totalDocs ?? null;
  return out;
}

export async function stateHash() {
  return sha256(stable(await snapshot()));
}

async function main() {
  if (process.argv.includes('--hash')) { console.log(await stateHash()); return; }
  await ensureUsers();
  await ensureKey();
  const ta = await login('editor-a');
  // Wipe content and locks in the database and restart the id sequences, so every seed has the same ids
  // (posts 1-6, listings 1-8, tasks 1-20): probe experiments and checkers can name documents by id.
  execFileSync('docker', ['exec', '-e', 'PGOPTIONS=-c client_min_messages=warning', 'isokron-payload-mcp-2026-11-pg', 'psql', '-U', 'payload', '-d', 'payload', '-q', '-c',
    'TRUNCATE posts, _posts_v, listings, tasks, payload_locked_documents RESTART IDENTITY CASCADE'], { stdio: ['ignore', 'ignore', 'inherit'] });
  for (const p of SEED.posts) await createPost(p, ta);
  for (const l of SEED.listings) { const r = await api('POST', '/api/listings', { token: ta, body: l }); if (r.status !== 201) throw new Error(`listing ${l.sku}: ${r.status} ${r.text.slice(0, 200)}`); }
  for (const t of SEED.tasks) { const r = await api('POST', '/api/tasks', { token: ta, body: t }); if (r.status !== 201) throw new Error(`task ${t.title}: ${r.status}`); }
  console.log(JSON.stringify({ seeded: true, editor_a: await userId('editor-a'), editor_b: await userId('editor-b'), state_sha256: await stateHash() }));
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
