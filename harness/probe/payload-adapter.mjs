// Target adapter for the Payload sandbox, used by IsoKron's probe runner (not public; `adapter: ./payload-adapter.mjs`).
//
// The system behind the MCP server is the loopback Payload app. The adapter:
//   - api():      REST at the target's api_url as editor-a (the control identity); the probe's proxy injects the
//                 JWT, which is obtained here once from ~/.payload-mcp-exp/users.json and never printed;
//   - seed/reset: sandbox/seed.mjs (TRUNCATE ... RESTART IDENTITY, so ids are the same in every run: posts 1-6,
//                 listings 1-8, tasks 1-20), then the target's `hold_locks` as editor-b (sandbox/lock.mjs);
//   - stateHash:  the seed snapshot hash (sandbox/seed.mjs snapshot(), lock count included);
//   - snapshot:   one document by key (`objects` in the target options) through REST, with its lock rows;
//   - protected:  users and MCP API keys (ids, emails, labels), hashed before and after the run;
//   - collect:    Payload keeps no audit log: none (stated in the summary).
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const sha = (s) => createHash('sha256').update(s).digest('hex');
const W = new URL('..', import.meta.url).pathname;

export default function payloadAdapter(config, baseDir) {
  const o = config?.options ?? config ?? {}; // the probe passes the target's `options` block itself
  const apiUrl = o.api_url ?? 'http://127.0.0.1:3093';
  const u = new URL(apiUrl);
  if (u.hostname !== '127.0.0.1') throw new Error(`payload adapter: api_url must be on 127.0.0.1 (got ${u.host})`);
  const objects = o.objects ?? {}; // key -> {collection, id}
  const holdLocks = o.hold_locks ?? []; // [{collection, id, as}]
  const expectedFile = o.seed_expected ? join(baseDir, o.seed_expected) : null;
  const env = { ...process.env, PAYLOAD_URL: apiUrl };
  const nodeOut = (args) => execFileSync('node', args, { encoding: 'utf8', env, cwd: W });
  // The control identity's JWT (editor-a): one login, kept in memory, handed to the probe's proxy only.
  const users = JSON.parse(readFileSync(join(homedir(), '.payload-mcp-exp', 'users.json'), 'utf8'));
  const login = JSON.parse(execFileSync('curl', ['-s', '-X', 'POST', `${apiUrl}/api/users/login`, '-H', 'content-type: application/json', '--data-binary', '@-'], { input: JSON.stringify(users['editor-a']), encoding: 'utf8' }));
  const token = login.token;
  if (!token) throw new Error('payload adapter: editor-a login failed');
  const rest = async (method, path, body) => {
    let r;
    for (let attempt = 1; ; attempt++) {
      try {
        r = await fetch(`${apiUrl}${path}`, { method, headers: { authorization: `JWT ${token}`, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
        break;
      } catch (e) {
        // next dev closes idle keep-alive sockets (ECONNRESET before the request is read): retry once
        if (attempt >= 2 || e?.cause?.code !== 'ECONNRESET') throw e;
      }
    }
    const t = await r.text();
    let j = t;
    try { j = JSON.parse(t); } catch { /* text */ }
    return { status: r.status, body: j };
  };
  const hashState = async () => {
    const out = nodeOut(['-e', `import('${W}sandbox/seed.mjs').then(async (m) => console.log(JSON.stringify(await m.snapshot())))`]);
    const state = JSON.parse(out);
    return { sha256: sha(stableJson(state)), objects: Object.values(state).reduce((n, v) => n + (typeof v === 'object' && v ? Object.values(v).reduce((a, b) => a + (Array.isArray(b) ? b.length : 0), 0) : 0), 0), state };
  };
  const reseed = () => {
    nodeOut([join(W, 'sandbox/seed.mjs')]);
    for (const l of holdLocks) nodeOut([join(W, 'sandbox/lock.mjs'), 'hold', '--as', l.as ?? 'editor-b', '--collection', l.collection, '--id', String(l.id)]);
  };

  return {
    name: 'payload',
    describe: () => ({ adapter: 'payload', api_url: apiUrl, objects, hold_locks: holdLocks, note: 'loopback Payload sandbox; control identity editor-a (REST JWT); lock holder editor-b' }),
    api: () => ({ upstream: apiUrl, authorization: `JWT ${token}`, secrets: [token] }),
    serverEnv: () => ({ PAYLOAD_MCP_URL: `${apiUrl}/api/mcp`, MCP_KEY_FILE: join(homedir(), '.payload-mcp-exp', 'mcp-key-editor-a') }),
    vars: () => Object.fromEntries(Object.entries(objects).map(([k, v]) => [`ID_${k.toUpperCase()}`, String(v.id)])),
    objects: () => Object.fromEntries(Object.entries(objects).map(([k, v]) => [k, { key: k, kind: v.collection, apiVersion: 'payload/v3', name: String(v.id) }])),
    apiPath: (_s, key) => (objects[key] ? `/api/${objects[key].collection}/${objects[key].id}` : null),
    platformError: (text) => /currently locked|Missing 'where'|ValidationError|The following field is invalid/i.test(text),
    ignorePaths: () => ['updatedAt', 'createdAt'],
    versionField: () => 'updatedAt',
    throttleMs: () => 0,
    async preflight() {
      const r = await rest('GET', '/api/users/me');
      const ok = r.status === 200 && r.body?.user?.email === users['editor-a'].email;
      return { ok, foreign: [], problems: ok ? [] : [`control identity check failed: HTTP ${r.status}`], detail: { api_url: apiUrl, control: 'editor-a' } };
    },
    async seed() { reseed(); },
    stateHash: async () => hashState(),
    async checkSeed(_s, _scope, phase) {
      const h = await hashState();
      let expected = null;
      if (expectedFile) expected = JSON.parse(readFileSync(expectedFile, 'utf8')).sha256;
      return { phase, expected_sha256: expected, expected_source: o.seed_expected ?? null, actual_sha256: h.sha256, objects: h.objects, match: expected === null || expected === h.sha256 };
    },
    async reset() { reseed(); },
    async snapshot(_s, _scope, key) {
      const ob = objects[key];
      const r = await rest('GET', `/api/${ob.collection}/${ob.id}?depth=0&draft=true&locale=all`);
      const locks = await rest('GET', `/api/payload-locked-documents?depth=0&where[document.relationTo][equals]=${ob.collection}&where[document.value][equals]=${ob.id}`);
      const ls = (locks.body?.docs ?? []).map((l) => ({ user: l.user?.value ?? l.user }));
      return { status: r.status, obj: { exists: r.status === 200, doc: r.status === 200 ? r.body : null, lock_count: ls.length, locks: ls } };
    },
    async snapshotRef(_s, _scope, ref) {
      if (!ref.path || !ref.path.startsWith('/api/') || /payload-mcp-api-keys|\/users/.test(ref.path)) throw new Error('payload adapter: read {path} must be a GET under /api/ (not users or keys)');
      const r = await rest('GET', ref.path);
      return { status: r.status, obj: r.body, object: ref.path, path: ref.path };
    },
    async protectedState() {
      const us = await rest('GET', '/api/users?depth=0&limit=50');
      const ks = await rest('GET', '/api/payload-mcp-api-keys?depth=0&limit=50');
      const state = { users: (us.body?.docs ?? []).map((x) => [x.id, x.email]), keys: (ks.body?.docs ?? []).map((x) => [x.id, x.label, x.user]) };
      return { sha256: sha(JSON.stringify(state)), objects: state.users.length + state.keys.length, state };
    },
    async cleanup() { return { removed: [], kept: [], problems: [] }; },
    async apiGet(s, scope, key) { return this.snapshot(s, scope, key); },
    async apiReplace(_s, _scope, key, obj) { const ob = objects[key]; return rest('PATCH', `/api/${ob.collection}/${ob.id}`, obj); },
    async apiPatch(_s, _scope, key, patch) { const ob = objects[key]; return rest('PATCH', `/api/${ob.collection}/${ob.id}`, patch); },
    async collect() { return { attachments: [], problems: [], summary: { note: 'Payload keeps no request audit log; target-side evidence is the per-step REST snapshots' } }; },
  };
}

function stableJson(v) {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stableJson(v[k])).join(',')}}`;
  return JSON.stringify(v);
}
