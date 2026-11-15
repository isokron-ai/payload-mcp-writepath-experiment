// Hand checks for research v2.2, written from hand-checks-v2-1.mjs (the checks of the 15 Nov standards run): the same
// checks, but every write carries the version its caller read, as v2.2 requires (ifUpdatedAt from the caller's own last
// find or write receipt), plus the cases the corrections are about. App: harness/app with the build swapped in, next dev
// on 127.0.0.1:4960; users editor-a and editor-b, an MCP key for editor-a. Raw JSON-RPC to /api/mcp and raw REST; no tool, no shim.
// Env: MWSV_MCP_KEY (editor-a), MWSV_JWT_A, MWSV_JWT_B. Objects are named mwsv-h22-<n>; each check deletes what it makes.
// "Session 1" and "session 2" are two MCP clients using the same key (editor-a); the transport is stateless.
const BASE = 'http://127.0.0.1:4960';
const A = { authorization: `JWT ${process.env.MWSV_JWT_A}`, 'content-type': 'application/json' };
const B = { authorization: `JWT ${process.env.MWSV_JWT_B}`, 'content-type': 'application/json' };
let rid = 1;
async function mcp(key, name, args) {
  const r = await fetch(`${BASE}/api/mcp`, { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: rid++, method: 'tools/call', params: { name, arguments: args } }) });
  const t = await r.text(); const d = t.includes('data:') ? t.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5)).join('') : t;
  const m = JSON.parse(d); const res = m.result ?? {}; return { isError: !!res.isError, text: res.content?.[0]?.text ?? JSON.stringify(m.error) };
}
const rest = async (h, method, path, body) => { const r = await fetch(`${BASE}${path}`, { method, headers: h, body: body ? JSON.stringify(body) : undefined }); let j = null; try { j = await r.json(); } catch {} return { status: r.status, body: j }; };
const KA = process.env.MWSV_MCP_KEY; const tag = `mwsv-h22-${Date.now().toString(36)}`;
const short = (s) => s.replace(/\s+/g, ' ').slice(0, 260);
const out = (...a) => console.log(...a);
const which = process.argv[2] ?? 'all';
// The version a client has: the updatedAt in a find answer (by id) or in a write receipt.
const ver = (text) => { const m = text.match(/"updatedAt":"([^"]+)"/); return m ? m[1] : undefined; };
const read = async (id, coll = 'Tasks') => ver((await mcp(KA, `find${coll}`, { id })).text);
const mkTask = async (n) => (await rest(A, 'POST', '/api/tasks', { title: `${tag}-${n}`, status: 'todo', owner: 'ann', priority: 2 })).body.doc.id;
const delTask = async (id) => rest(A, 'DELETE', `/api/tasks/${id}`);
const lockAsB = async (id) => rest(B, 'POST', '/api/payload-locked-documents', { document: { relationTo: 'tasks', value: id }, globalSlug: null, user: { relationTo: 'users', value: 2 } });
const mkPost = async (n) => (await rest(A, 'POST', '/api/posts', { title: `${tag}-${n}`, slug: `${tag}-${n}`, author: 'ann', items: [{ label: 'one', url: 'https://example.test/1' }] })).body.doc.id;

if (which === 'all' || which === 'lock') { // PAY-01 / PAY-02, with the version sent
  for (let i = 0; i < 5; i++) {
    const id = await mkTask(`lock${i}`); const v = await read(id); const l = await lockAsB(id);
    const u = await mcp(KA, 'updateTasks', { id, owner: 'x', ifUpdatedAt: v }); const after = (await rest(A, 'GET', `/api/tasks/${id}`)).body;
    const d = await mcp(KA, 'deleteTasks', { id, ifUpdatedAt: v }); const still = (await rest(A, 'GET', `/api/tasks/${id}`)).status;
    const locks = (await rest(A, 'GET', `/api/payload-locked-documents?where[document.value][equals]=${id}`)).body?.totalDocs;
    out(`lock rep ${i}: lock POST ${l.status}; update isError=${u.isError} owner now ${after.owner}; delete isError=${d.isError} GET after delete ${still}; lock rows ${locks} | ${short(u.text)}`);
    await rest(A, 'DELETE', `/api/payload-locked-documents?where[document.value][equals]=${id}`); await delTask(id);
  }
}
if (which === 'all' || which === 'where') { // PAY-03, with a version map for the two documents it made
  const ids = [await mkTask('w1'), await mkTask('w2')]; const map = {}; for (const id of ids) map[id] = await read(id);
  const u = await mcp(KA, 'updateTasks', { where: '{}', owner: 'everyone', ifUpdatedAt: map }); const d = await mcp(KA, 'deleteTasks', { where: '{}', ifUpdatedAt: map }); const d2 = await mcp(KA, 'deleteTasks', { where: '[]', ifUpdatedAt: map });
  const n = (await rest(A, 'GET', '/api/tasks?limit=500&depth=0')).body.docs; const changed = n.filter((x) => x.owner === 'everyone').length;
  out(`where {}: update isError=${u.isError} | ${short(u.text)}\n  delete {} isError=${d.isError} | ${short(d.text)}\n  delete [] isError=${d2.isError} | ${short(d2.text)}\n  tasks now ${n.length}, owner=everyone ${changed}`);
  for (const id of ids) await delTask(id);
}
if (which === 'all' || which === 'stale') { // PAY-09: the other writer is editor-b via REST, then session 2 of the same key
  for (let i = 0; i < 3; i++) {
    const id = await mkPost(`s${i}`);
    const v1 = await read(id, 'Posts'); // session 1 reads
    await rest(B, 'PATCH', `/api/posts/${id}`, { author: 'bob' }); // editor-b changes it through REST
    const w = await mcp(KA, 'updatePosts', { id, ifUpdatedAt: v1, items: [{ label: 'one', url: 'https://example.test/a' }] });
    const after = (await rest(A, 'GET', `/api/posts/${id}`)).body;
    out(`stale, other = editor-b REST, rep ${i}: write isError=${w.isError} author ${after.author} items[0].url ${after.items[0].url} | ${short(w.text)}`);
    const v2 = await read(id, 'Posts'); // session 1 reads again
    const vOther = await read(id, 'Posts'); const o = await mcp(KA, 'updatePosts', { id, author: 'carol', ifUpdatedAt: vOther }); // session 2 reads and writes
    const w2 = await mcp(KA, 'updatePosts', { id, ifUpdatedAt: v2, items: [{ label: 'one', url: 'https://example.test/b' }] }); // session 1's write, based on v2
    const w3 = await mcp(KA, 'updatePosts', { id, items: [{ label: 'one', url: 'https://example.test/c' }] }); // the same write with no version
    const after2 = (await rest(A, 'GET', `/api/posts/${id}`)).body;
    out(`stale, other = same key, session 2, rep ${i}: other isError=${o.isError}; stale write (version sent) isError=${w2.isError}; no version isError=${w3.isError}; author ${after2.author} (session 2 wrote carol), items[0].url ${after2.items[0].url} | ${short(w2.text)} || ${short(w3.text)}`);
    await rest(A, 'DELETE', `/api/posts/${id}`);
  }
}
if (which === 'all' || which === 'idem') { // MWS-ANN-3 on updatePosts (idempotentHint: true)
  for (let i = 0; i < 3; i++) {
    const id = await mkPost(`i${i}`);
    const v0 = await read(id, 'Posts');
    const items = [{ label: 'one', url: 'https://example.test/x' }];
    const c1 = await mcp(KA, 'updatePosts', { id, ifUpdatedAt: v0, items }); const r1 = (await rest(A, 'GET', `/api/posts/${id}`)).body;
    const c2 = await mcp(KA, 'updatePosts', { id, ifUpdatedAt: v0, items }); const r2 = (await rest(A, 'GET', `/api/posts/${id}`)).body; // the same call again
    const c3 = await mcp(KA, 'updatePosts', { id, ifUpdatedAt: ver(c1.text), items }); const r3 = (await rest(A, 'GET', `/api/posts/${id}`)).body; // the same rows, new version
    out(`idempotent rep ${i}: call1 isError=${c1.isError} row id ${r1.items[0].id}; same call again isError=${c2.isError} row id ${r2.items[0].id} updatedAt changed=${r1.updatedAt !== r2.updatedAt}; same rows with the new version isError=${c3.isError} row id ${r3.items[0].id}; row id kept=${r1.items[0].id === r3.items[0].id}`);
    await rest(A, 'DELETE', `/api/posts/${id}`);
  }
}
if (which === 'all' || which === 'unknown') { // PAY-11
  const id = await mkTask('u'); const v = await read(id);
  const a = await mcp(KA, 'updateTasks', { id, ttle: 'x', ifUpdatedAt: v }); const b = await mcp(KA, 'updateTasks', { id, owner: 'zed', ttle: 'y', ifUpdatedAt: v });
  const c = await mcp(KA, 'createTasks', { title: `${tag}-u2`, status: 'todo', owner: 'ann', priority: 2, ttle: 'z' });
  const f = await mcp(KA, 'findTasks', { id, dpth: 1 });
  const d = await mcp(KA, 'deleteTasks', { id, ifUpdatedAt: v, force: true });
  const now = (await rest(A, 'GET', `/api/tasks/${id}`)); const made = (await rest(A, 'GET', `/api/tasks?where[title][equals]=${tag}-u2`)).body.docs;
  out(`misspelled only: isError=${a.isError} | ${short(a.text)}\nmisspelled + owner: isError=${b.isError} | ${short(b.text)}\ncreate + misspelled: isError=${c.isError} | ${short(c.text)}\nfind + misspelled: isError=${f.isError} | ${short(f.text)}\ndelete + unknown: isError=${d.isError} | ${short(d.text)}\n  after: task ${now.status === 200 ? `kept, owner ${now.body.owner}` : `gone (${now.status})`}; created by the create call: ${made.length}`);
  await delTask(id); for (const x of made) await delTask(x.id);
}
if (which === 'all' || which === 'refusal') { // PAY-13
  const id = await mkTask('r'); const v = await read(id);
  const a = await mcp(KA, 'updateTasks', { id, priority: 9, ifUpdatedAt: v }); const r = await rest(A, 'PATCH', `/api/tasks/${id}`, { priority: 9 });
  const c = await mcp(KA, 'createTasks', { title: `${tag}-r2`, status: 'todo', owner: 'ann', priority: 9 });
  out(`priority 9 (update): isError=${a.isError} | ${short(a.text)}\npriority 9 (create): isError=${c.isError} | ${short(c.text)}\n  REST ${r.status} ${short(JSON.stringify(r.body))}`);
  await delTask(id);
}
if (which === 'all' || which === 'bulkdel') { // PAY-05 bulk delete half, with a version map naming a missing id too
  const ids = [await mkTask('b1'), await mkTask('b2')]; const map = {}; for (const id of ids) map[id] = await read(id);
  const d = await mcp(KA, 'deleteTasks', { where: JSON.stringify({ id: { in: [...ids, 999999999] } }), ifUpdatedAt: { ...map, 999999999: '2026-01-01T00:00:00.000Z' } });
  out(`bulk delete with a missing id: isError=${d.isError} | ${short(d.text)}`);
  for (const id of ids) await delTask(id);
}
if (which === 'all' || which === 'schema') { // the advertised schemas, and an unknown key inside an array row
  const r = await fetch(`${BASE}/api/mcp`, { method: 'POST', headers: { authorization: `Bearer ${KA}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: rid++, method: 'tools/list', params: {} }) });
  const t = await r.text(); const d = t.includes('data:') ? t.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5)).join('') : t;
  for (const tool of JSON.parse(d).result.tools.filter((x) => /^(create|find|update|delete)(Tasks|Posts|Listings)$/.test(x.name))) {
    out(`tools/list ${tool.name}: additionalProperties=${tool.inputSchema.additionalProperties} required=${JSON.stringify(tool.inputSchema.required ?? [])} idempotentHint=${tool.annotations?.idempotentHint}`);
  }
  const id = await mkPost('n'); const v = await read(id, 'Posts');
  const n = await mcp(KA, 'updatePosts', { id, ifUpdatedAt: v, items: [{ lable: 'two', url: 'https://example.test/2' }] });
  out(`unknown key in an array row: isError=${n.isError} | ${short(n.text)}`);
  await rest(A, 'DELETE', `/api/posts/${id}`);
}
if (which === 'all' || which === 'locale') { // a row re-sent unchanged without its id keeps its id and its other-locale value
  for (let i = 0; i < 3; i++) {
    const id = await mkPost(`l${i}`); const doc = (await rest(A, 'GET', `/api/posts/${id}?locale=en`)).body; const rowId = doc.items[0].id;
    const p = await rest(A, 'PATCH', `/api/posts/${id}?locale=es`, { title: `${tag}-l${i}-es`, items: [{ id: rowId, label: 'uno', url: 'https://example.test/1' }] }); // the es title is required too
    const esBefore = (await rest(A, 'GET', `/api/posts/${id}?locale=es&fallbackLocale=none`)).body.items[0]?.label;
    const v = await read(id, 'Posts');
    const w = await mcp(KA, 'updatePosts', { id, ifUpdatedAt: v, items: [{ label: 'one', url: 'https://example.test/1' }], author: 'dora' });
    const en = (await rest(A, 'GET', `/api/posts/${id}?locale=en`)).body; const es = (await rest(A, 'GET', `/api/posts/${id}?locale=es&fallbackLocale=none`)).body;
    out(`locale rep ${i}: es PATCH ${p.status}, es label before ${esBefore}; MCP write (en, row sent without id) isError=${w.isError}; row id kept=${en.items[0].id === rowId}; es label after ${es.items[0]?.label}; author ${en.author}`);
    await rest(A, 'DELETE', `/api/posts/${id}`);
  }
}
