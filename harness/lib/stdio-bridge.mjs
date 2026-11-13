#!/usr/bin/env node
// stdio <-> Streamable HTTP bridge for the Payload MCP endpoint (harness file, no dependencies).
//
// Why: the agent driver used for the measured runs launches its MCP server as a stdio command behind a
// recording proxy (it has no HTTP server type). Payload's plugin-mcp is only reachable over
// Streamable HTTP at /api/mcp. This bridge forwards each JSON-RPC line from stdin as one POST and
// writes every JSON-RPC message of the answer (JSON body or SSE `data:` events) back as one line.
// It adds, drops and rewrites nothing in the messages: the capture at the stdio hop is what the
// server sent. Transport errors become JSON-RPC errors for the request id (and are logged to stderr).
//
//   PAYLOAD_MCP_URL=http://127.0.0.1:3093/api/mcp MCP_KEY_FILE=~/.payload-mcp-exp/mcp-key-editor-a node lib/stdio-bridge.mjs
//
// Loopback only: any other host is refused. The key is read from the file named by MCP_KEY_FILE,
// sent as `Authorization: Bearer`, and never printed.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline';

const url = process.env.PAYLOAD_MCP_URL || 'http://127.0.0.1:3093/api/mcp';
const u = new URL(url);
if (u.protocol !== 'http:' || u.hostname !== '127.0.0.1') {
  process.stderr.write(`stdio-bridge: refused: ${u.origin} is not http://127.0.0.1\n`);
  process.exit(2);
}
const keyFile = (process.env.MCP_KEY_FILE || '').replace(/^~(?=\/)/, homedir());
if (!keyFile) {
  process.stderr.write('stdio-bridge: MCP_KEY_FILE is not set\n');
  process.exit(2);
}
const key = readFileSync(keyFile, 'utf8').split('\n')[0].trim();

let sessionId = null;
let protocolVersion = null;
const out = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');

function parseSse(text) {
  const msgs = [];
  for (const block of text.split(/\r?\n\r?\n/)) {
    const data = block.split(/\r?\n/).filter((l) => l.startsWith('data:')).map((l) => l.slice(5).replace(/^ /, '')).join('\n');
    if (data.trim()) msgs.push(JSON.parse(data));
  }
  return msgs;
}

async function forward(line) {
  let msg;
  try { msg = JSON.parse(line); } catch { process.stderr.write('stdio-bridge: dropped a non-JSON line\n'); return; }
  const headers = { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${key}` };
  if (sessionId) headers['mcp-session-id'] = sessionId;
  if (protocolVersion) headers['mcp-protocol-version'] = protocolVersion;
  try {
    const res = await fetch(url, { method: 'POST', headers, body: line });
    const sid = res.headers.get('mcp-session-id');
    if (sid) sessionId = sid;
    const text = await res.text();
    const ct = res.headers.get('content-type') || '';
    if (res.status === 202 || !text.trim()) return;
    let msgs;
    if (ct.includes('text/event-stream')) msgs = parseSse(text);
    else { const j = JSON.parse(text); msgs = Array.isArray(j) ? j : [j]; }
    for (const m of msgs) {
      if (msg.method === 'initialize' && m.result?.protocolVersion) protocolVersion = m.result.protocolVersion;
      out(m);
    }
    if (!res.ok) process.stderr.write(`stdio-bridge: HTTP ${res.status} for ${msg.method ?? 'response'}\n`);
  } catch (e) {
    process.stderr.write(`stdio-bridge: transport error for ${msg.method ?? 'message'}: ${e.message}\n`);
    if (msg.id !== undefined) out({ jsonrpc: '2.0', id: msg.id, error: { code: -32000, message: `bridge transport error: ${e.message}` } });
  }
}

const pending = new Set();
const rl = createInterface({ input: process.stdin });
rl.on('line', (line) => {
  if (!line.trim()) return;
  const p = forward(line).finally(() => pending.delete(p));
  pending.add(p);
});
rl.on('close', async () => { await Promise.allSettled([...pending]); process.exit(0); });
