// Hand checks on the Payload research build (raw JSON-RPC to /api/mcp and raw REST; no tool, no shim).
// Env: MWSV_MCP_KEY (editor-a), MWSV_JWT_A, MWSV_JWT_B. Objects are named mwsv-h-<n>; each check deletes what it makes.
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
const KA = process.env.MWSV_MCP_KEY; const tag = `mwsv-h-${Date.now().toString(36)}`;
const short = (s) => s.replace(/\s+/g, ' ').slice(0, 260);
const out = (...a) => console.log(...a);
const which = process.argv[2] ?? 'all';
const mkTask = async (n) => (await rest(A, 'POST', '/api/tasks', { title: `${tag}-${n}`, status: 'todo', owner: 'ann', priority: 2 })).body.doc.id;
const delTask = async (id) => rest(A, 'DELETE', `/api/tasks/${id}`);
const lockAsB = async (id) => rest(B, 'POST', '/api/payload-locked-documents', { document: { relationTo: 'tasks', value: id }, globalSlug: null, user: { relationTo: 'users', value: 2 } });

if (which === 'all' || which === 'lock') { // PAY-01 / PAY-02 (F1, F2)
  for (let i = 0; i < 5; i++) {
    const id = await mkTask(`lock${i}`); const l = await lockAsB(id);
    const u = await mcp(KA, 'updateTasks', { id, owner: 'x' }); const after = (await rest(A, 'GET', `/api/tasks/${id}`)).body;
    const d = await mcp(KA, 'deleteTasks', { id }); const still = (await rest(A, 'GET', `/api/tasks/${id}`)).status;
    const locks = (await rest(A, 'GET', `/api/payload-locked-documents?where[document.value][equals]=${id}`)).body?.totalDocs;
    out(`lock rep ${i}: lock POST ${l.status}; update isError=${u.isError} owner now ${after.owner}; delete isError=${d.isError} GET after delete ${still}; lock rows ${locks} | ${short(u.text)}`);
    await rest(A, 'DELETE', `/api/payload-locked-documents?where[document.value][equals]=${id}`); await delTask(id);
  }
}
if (which === 'all' || which === 'where') { // PAY-03 (F3)
  const ids = [await mkTask('w1'), await mkTask('w2')];
  const u = await mcp(KA, 'updateTasks', { where: '{}', owner: 'everyone' }); const d = await mcp(KA, 'deleteTasks', { where: '{}' }); const d2 = await mcp(KA, 'deleteTasks', { where: '[]' });
  const n = (await rest(A, 'GET', '/api/tasks?limit=500&depth=0')).body.docs; const changed = n.filter((x) => x.owner === 'everyone').length;
  out(`where {}: update isError=${u.isError} | ${short(u.text)}\n  delete {} isError=${d.isError} | ${short(d.text)}\n  delete [] isError=${d2.isError} | ${short(d2.text)}\n  tasks now ${n.length}, owner=everyone ${changed}`);
  for (const id of ids) await delTask(id);
}
if (which === 'all' || which === 'stale') { // PAY-09 (F9): other writer = another user through REST, then the same user through MCP
  for (let i = 0; i < 3; i++) {
    const id = (await rest(A, 'POST', '/api/posts', { title: `${tag}-s${i}`, slug: `${tag}-s${i}`, author: 'ann', items: [{ label: 'one', url: 'https://example.test/1' }] })).body.doc.id;
    await mcp(KA, 'findPosts', { id }); // A reads through MCP
    await rest(B, 'PATCH', `/api/posts/${id}`, { author: 'bob' }); // editor-b changes it through REST
    const w = await mcp(KA, 'updatePosts', { id, items: [{ label: 'one', url: 'https://example.test/a' }] });
    const after = (await rest(A, 'GET', `/api/posts/${id}`)).body;
    out(`stale, other = editor-b REST, rep ${i}: write isError=${w.isError} author ${after.author} | ${short(w.text)}`);
    await mcp(KA, 'findPosts', { id }); // A reads again
    await mcp(KA, 'findPosts', { id }); const o = await mcp(KA, 'updatePosts', { id, author: 'carol' }); // a second MCP client of the same user reads and writes
    const w2 = await mcp(KA, 'updatePosts', { id, items: [{ label: 'one', url: 'https://example.test/b' }] });
    const after2 = (await rest(A, 'GET', `/api/posts/${id}`)).body;
    out(`stale, other = same user via MCP, rep ${i}: other isError=${o.isError}; stale write isError=${w2.isError}; author ${after2.author} (other wrote carol) | ${short(w2.text)}`);
    await rest(A, 'DELETE', `/api/posts/${id}`);
  }
}
if (which === 'all' || which === 'idem') { // MWS-ANN-3 on updatePosts (research declares idempotentHint: true)
  for (let i = 0; i < 3; i++) {
    const id = (await rest(A, 'POST', '/api/posts', { title: `${tag}-i${i}`, slug: `${tag}-i${i}`, author: 'ann', items: [{ label: 'one', url: 'https://example.test/1' }] })).body.doc.id;
    await mcp(KA, 'findPosts', { id });
    const args = { id, items: [{ label: 'one', url: 'https://example.test/x' }] };
    const c1 = await mcp(KA, 'updatePosts', args); const r1 = (await rest(A, 'GET', `/api/posts/${id}`)).body;
    const c2 = await mcp(KA, 'updatePosts', args); const r2 = (await rest(A, 'GET', `/api/posts/${id}`)).body;
    out(`idempotent rep ${i}: call1 isError=${c1.isError} row id ${r1.items[0].id}; call2 isError=${c2.isError} row id ${r2.items[0].id}; same=${r1.items[0].id === r2.items[0].id}; updatedAt changed=${r1.updatedAt !== r2.updatedAt}`);
    await rest(A, 'DELETE', `/api/posts/${id}`);
  }
}
if (which === 'all' || which === 'unknown') { // PAY-11 (F11)
  const id = await mkTask('u'); await mcp(KA, 'findTasks', { id });
  const a = await mcp(KA, 'updateTasks', { id, ttle: 'x' }); const b = await mcp(KA, 'updateTasks', { id, owner: 'zed', ttle: 'y' });
  const c = await mcp(KA, 'createTasks', { title: `${tag}-u2`, status: 'todo', owner: 'ann', priority: 2, ttle: 'z' });
  const f = await mcp(KA, 'findTasks', { id, dpth: 1 });
  out(`misspelled only: isError=${a.isError} | ${short(a.text)}\nmisspelled + owner: isError=${b.isError} | ${short(b.text)}\ncreate + misspelled: isError=${c.isError} | ${short(c.text)}\nfind + misspelled: isError=${f.isError} | ${short(f.text).slice(0, 120)}`);
  await delTask(id); const g = (await rest(A, 'GET', `/api/tasks?where[title][equals]=${tag}-u2`)).body.docs; for (const x of g) await delTask(x.id);
}
if (which === 'all' || which === 'refusal') { // PAY-13 (F13), PAY-12 (F12)
  const id = await mkTask('r'); await mcp(KA, 'findTasks', { id });
  const a = await mcp(KA, 'updateTasks', { id, priority: 9 }); const r = await rest(A, 'PATCH', `/api/tasks/${id}`, { priority: 9 });
  out(`priority 9: isError=${a.isError} | ${short(a.text)}\n  REST ${r.status} ${short(JSON.stringify(r.body))}`);
  const lt = await mcp(KA, 'findTasks', { limit: 1 }); out('(schema of priority shown in tools/list is checked separately)'); await delTask(id);
}
if (which === 'all' || which === 'bulkdel') { // PAY-05 bulk delete half (F5)
  const ids = [await mkTask('b1'), await mkTask('b2')]; await rest(A, 'PATCH', `/api/tasks/2`, {}); // task 2 is archived: hook refuses update; delete is not refused by the hook
  await mcp(KA, 'findTasks', { where: JSON.stringify({ id: { in: ids } }) });
  const d = await mcp(KA, 'deleteTasks', { where: JSON.stringify({ id: { in: [...ids, 999999999] } }) });
  out(`bulk delete with a missing id: isError=${d.isError} | ${short(d.text)}`);
  for (const id of ids) await delTask(id);
}
