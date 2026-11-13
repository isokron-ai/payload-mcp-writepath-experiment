#!/usr/bin/env node
// Phase 0 boundary check (the local form of "sandbox 200, production 403, one sandbox read 200").
// There is no production here: the target is a loopback-only app. What must hold:
//   1. the app and Postgres listen on 127.0.0.1 only;
//   2. MCP without a key -> 401; with a wrong key -> 401; with editor-a's key -> tools/list of 12 tools;
//   3. the key reaches only the collections it was granted (no users / api-keys / locks tools);
//   4. one sandbox read through MCP (findPosts) and through REST -> 200;
//   5. both users exist and are distinct.
import { execFileSync } from 'node:child_process';
import { api, BASE, login, mcpKey, userId } from './lib.mjs';

const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); };

async function mcp(body, key) {
  const headers = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' };
  if (key !== undefined) headers.authorization = `Bearer ${key}`;
  const r = await fetch(`${BASE}/api/mcp`, { method: 'POST', headers, body: JSON.stringify(body) });
  const t = await r.text();
  let j = null;
  try { j = JSON.parse(t.includes('data:') ? t.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5)).join('') : t); } catch { /* */ }
  return { status: r.status, json: j };
}

const listen = (port) => { try { return execFileSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' }).split('\n').slice(1).filter(Boolean).map((l) => l.trim().split(/\s+/).at(-2)); } catch { return []; } };
const appL = listen(3093), pgL = listen(55493);
check('app listens on loopback only', appL.length > 0 && appL.every((a) => a.startsWith('127.0.0.1:')), appL);
check('postgres listens on loopback only', pgL.length > 0 && pgL.every((a) => a.startsWith('127.0.0.1:')), pgL);

const list = { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} };
const none = await mcp(list);
check('MCP without a key is refused (401)', none.status === 401, none.status);
const wrong = await mcp(list, 'not-a-real-key-000000000000');
check('MCP with a wrong key is refused (401)', wrong.status === 401, wrong.status);
const ok = await mcp(list, mcpKey('editor-a'));
const names = (ok.json?.result?.tools ?? []).map((t) => t.name).sort();
check("MCP with editor-a's key lists 12 tools", ok.status === 200 && names.length === 12, { status: ok.status, tools: names });
check('no tool reaches users, API keys or locks', !names.some((n) => /user|apikey|api-key|lock/i.test(n)), names.filter((n) => /user|key|lock/i.test(n)));
const read = await mcp({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'findPosts', arguments: { limit: 1 } } }, mcpKey('editor-a'));
check('one MCP read (findPosts) -> 200, no error', read.status === 200 && !read.json?.result?.isError && /Total: \d+ documents/.test(read.json?.result?.content?.[0]?.text ?? ''), read.status);
const ta = await login('editor-a');
const rest = await api('GET', '/api/posts?limit=1&depth=0', { token: ta });
check('one REST read -> 200', rest.status === 200, rest.status);
const a = await userId('editor-a'), b = await userId('editor-b');
check('editor-a and editor-b are distinct users', a !== b, { a, b });

console.log(JSON.stringify({ checked_at: new Date().toISOString(), base: BASE, pass: results.every((r) => r.ok), results }, null, 2));
process.exit(results.every((r) => r.ok) ? 0 : 1);
