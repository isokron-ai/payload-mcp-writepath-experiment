#!/usr/bin/env node
// During hook (run by the agent driver right after the agent's first read): editor-b's mid-run action for a conflict task.
//   node harness/during.mjs <task> <action>    reads <run dir>/prestate.json
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { TASKS } from './tasks.mjs';

const [task, action] = process.argv.slice(2);
const dir = process.env.HARNESS_RUN_DIR;
const pre = JSON.parse(readFileSync(join(dir, 'prestate.json'), 'utf8'));
const fn = TASKS[task]?.during?.[action];
if (!fn) { console.error(`no during action ${task}/${action}`); process.exit(2); }
const res = await fn(pre);
writeFileSync(join(dir, `during-${action}.json`), JSON.stringify({ at: new Date().toISOString(), trigger_seq: process.env.HARNESS_TRIGGER_SEQ ?? null, result: res }));
console.log(JSON.stringify(res));
if (res.status && res.status >= 400) process.exit(1);
