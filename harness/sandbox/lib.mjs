// Shared helpers for the sandbox scripts. Loopback only: every request goes to PAYLOAD_URL, which
// must be http://127.0.0.1:<port>. Credentials are read from ~/.payload-mcp-exp/ (mode 600) and never printed.
import { readFileSync, existsSync, writeFileSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, createHash } from 'node:crypto';

export const SECRETS = join(homedir(), '.payload-mcp-exp');
export const BASE = process.env.PAYLOAD_URL || 'http://127.0.0.1:3093';
{
  const u = new URL(BASE);
  if (u.hostname !== '127.0.0.1' || u.protocol !== 'http:') throw new Error(`refused: PAYLOAD_URL must be http://127.0.0.1:<port>, got ${BASE}`);
}

export function users() {
  return JSON.parse(readFileSync(join(SECRETS, 'users.json'), 'utf8'));
}

/** The MCP API key for a user (generated once, mode 600). Returned to the caller, never printed. */
export function mcpKey(who = 'editor-a') {
  const f = join(SECRETS, `mcp-key-${who}`);
  if (!existsSync(f)) {
    writeFileSync(f, randomBytes(24).toString('hex') + '\n', { mode: 0o600 });
    chmodSync(f, 0o600);
  }
  return readFileSync(f, 'utf8').trim();
}

export async function api(method, path, { token, body, headers = {} } = {}) {
  const h = { 'content-type': 'application/json', ...headers };
  if (token) h.authorization = `JWT ${token}`;
  let res;
  for (let attempt = 1; ; attempt++) {
    try {
      res = await fetch(BASE + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
      break;
    } catch (e) {
      // next dev closes idle keep-alive sockets; a request on a socket it just closed fails with ECONNRESET before
      // the server reads it. Retry once, and say so on stderr (the seed hash check catches any double write).
      if (attempt >= 2 || e?.cause?.code !== 'ECONNRESET') throw e;
      process.stderr.write(`lib.api: ECONNRESET on ${method} ${path.split('?')[0]}, retrying once\n`);
    }
  }
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, json, text };
}

const tokens = {};
export async function login(who) {
  if (tokens[who]) return tokens[who];
  const u = users()[who];
  const r = await api('POST', '/api/users/login', { body: { email: u.email, password: u.password } });
  if (r.status !== 200 || !r.json?.token) throw new Error(`login ${who} failed: HTTP ${r.status} ${r.json?.errors?.[0]?.message ?? ''}`);
  tokens[who] = r.json.token;
  return r.json.token;
}

export async function userId(who) {
  const t = await login(who);
  const r = await api('GET', '/api/users/me', { token: t });
  return r.json.user.id;
}

/** Find one document by a unique field through REST (as editor-a). */
export async function findOne(collection, field, value, { who = 'editor-a', draft = true, locale } = {}) {
  const t = await login(who);
  const q = new URLSearchParams({ [`where[${field}][equals]`]: String(value), depth: '0', limit: '2' });
  if (draft) q.set('draft', 'true');
  if (locale) q.set('locale', locale);
  const r = await api('GET', `/api/${collection}?${q}`, { token: t });
  if (r.status !== 200) throw new Error(`find ${collection} ${field}=${value}: HTTP ${r.status}`);
  return r.json.docs[0] ?? null;
}

export function sha256(s) {
  return createHash('sha256').update(s).digest('hex');
}

/** A stable JSON form (sorted keys) for hashing state. */
export function stable(v) {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',')}}`;
  return JSON.stringify(v);
}
