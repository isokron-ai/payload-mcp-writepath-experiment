#!/usr/bin/env node
// Setup hook (run by the agent driver before each run): reset the sandbox to the seed, then the task's own pre-state.
//   node harness/setup.mjs <task>     (HARNESS_RUN_DIR set by the driver; else --out DIR)
// Writes <run dir>/prestate.json: seed hash, seed task priorities/statuses, task-specific state (editor-b's form, lock).
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { TASKS, reseed } from './tasks.mjs';
import { api, login } from '../sandbox/lib.mjs';

const task = process.argv[2];
const outIdx = process.argv.indexOf('--out');
const dir = process.env.HARNESS_RUN_DIR || (outIdx > 0 ? process.argv[outIdx + 1] : null);
if (!TASKS[task]) { console.error(`unknown task ${task}`); process.exit(2); }
if (!dir) { console.error('no run dir'); process.exit(2); }
const seeded = reseed();
const ta = await login('editor-a');
const tasks = (await api('GET', '/api/tasks?limit=100&depth=0', { token: ta })).json.docs;
const pre = { task, at: new Date().toISOString(), seed_state_sha256: seeded.state_sha256, seedPriority: Object.fromEntries(tasks.map((t) => [t.title, t.priority])), seedStatus: Object.fromEntries(tasks.map((t) => [t.title, t.status])), seedOwner: Object.fromEntries(tasks.map((t) => [t.title, t.owner])) };
if (TASKS[task].setup) await TASKS[task].setup(pre);
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'prestate.json'), JSON.stringify(pre, null, 1));
console.log(JSON.stringify({ task, seed_state_sha256: seeded.state_sha256, lock: pre.lock ?? null }));
