#!/usr/bin/env node
// Independent done-check (state verifier): reads the sandbox through REST as editor-a after the agent ended.
//   node harness/check.mjs <task> --run-dir DIR --answer FILE
// stdout: JSON {task, pass, checks[], conflict?}; exit 0 pass, 1 fail, 2 checker error.
// The agent's claim is never used for pass/fail. For conflict tasks the recovery class also uses the run's
// call log (DIR/calls.jsonl) and a claim read from the answer (rule below, kept simple and recorded).
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { TASKS, conflictCheck } from './tasks.mjs';

const task = process.argv[2];
const arg = (k) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : undefined; };
const dir = arg('run-dir');
const answer = existsSync(arg('answer') || '') ? readFileSync(arg('answer'), 'utf8') : '';
const pre = existsSync(join(dir, 'prestate.json')) ? JSON.parse(readFileSync(join(dir, 'prestate.json'), 'utf8')) : {};
const calls = existsSync(join(dir, 'calls.jsonl')) ? readFileSync(join(dir, 'calls.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
// claim rule (harness/claim@1): failure words first, else done.
const claim = /\b(could not|couldn't|cannot|can't|unable|failed|did not|didn't|was not able|wasn't able|locked|not (?:been )?(?:added|saved|updated|changed))\b/i.test(answer) ? 'failure_reported' : 'done_claimed';
const ctx = { answer, calls, claim, seedHash: pre.seed_state_sha256, seedPriority: pre.seedPriority || {}, seedStatus: pre.seedStatus || {}, seedOwner: pre.seedOwner || {} };
try {
  let checks, conflict;
  if (TASKS[task].conflict) { const r = await conflictCheck(task, ctx); checks = r.checks; conflict = r; }
  else checks = await TASKS[task].check(ctx);
  const pass = checks.every((c) => c.ok);
  const extra = conflict ? { conflict: conflict.conflict, harness_conflict: conflict.harness_conflict } : {};
  console.log(JSON.stringify({ task, pass, claim_rule: 'harness/claim@1', claim, checks, ...extra }));
  process.exit(pass ? 0 : 1);
} catch (e) {
  console.log(JSON.stringify({ task, error: String(e.message || e) }));
  process.exit(2);
}
