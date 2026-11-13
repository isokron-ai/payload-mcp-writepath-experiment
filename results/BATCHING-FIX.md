# Batching fix: research builds v2 and v2.1

Audit `isokron-payload-mcp-2026-11`, 13 November 2026, evening, after the main benchmark
([BENCHMARK.md](BENCHMARK.md)). Two more commits on top of research build v1: patch
[`0006`](../patches/0006-feat-plugin-mcp-batch-friendly-preconditions-per-doc.patch) (v2, tag `research-v2-v3.93.0`) and
patch [`0007`](../patches/0007-fix-plugin-mcp-read-version-memory-survives-a-find-w.patch) (v2.1, tag
`research-v2.1-v3.93.0`).

**Where each build stands:**

- **v2 restored batching, and it is not safe.** Opus batched every opportunity it met, but in **6 of 9 conflict-guard
  runs v2 lost the other writer's change** with no signal. Do not use v2.
- **v2.1 keeps v2's batching and holds the other writer's change, in probes and in agent runs.** It closes the hole v2
  opened in the scripted probes (5 of 5), every earlier probe still holds, and in its own agent series (section 10,
  60 of 60 runs) it batched every opportunity (U11 10/10, A5 5/5) and **kept the other editor's change in 15 of 15
  conflict-guard runs** (A4, U9, U8), the same as v1. Batching cuts calls and model turns, not tokens.

## 1. The regression in v1

On the friction-derived task U11 (delete 3 scratch tasks and 3 `TMP-` listings), Opus handled the batch opportunities in
one call 8 of 10 times on the vendor build and **0 of 10** on research v1, with 10 calls per run instead of 4. The likely
cause, recorded at the time as an inference, was v1's own default server instruction:

> Editing what you read: pass ifUpdatedAt (the updatedAt you read) to update/delete

`ifUpdatedAt` is one document's version, so a `where`-based bulk call cannot carry it, and an agent that follows the
instruction deletes one document at a time.

Reading the v1 source for this fix found a second, worse problem. v1's implicit read-version check (the version this
user last read, scoped by `createdAt`) ran **only on writes by id**. A bulk update or delete by `where` had no
precondition at all, so simply telling agents to batch on v1 would have reopened the lost update that the research build
exists to close. Probes E9 and E10 below measure it: on v1, a document changed after the agent's read is deleted or
overwritten by the bulk call in every valid repetition.

## 2. The change (v2, patch 0006)

Files: `mcp/getMcpHandler.ts`, `mcp/helpers/writeSafety.ts`, `mcp/tools/resource/update.ts`,
`mcp/tools/resource/delete.ts`.

1. **Instructions.** The `ifUpdatedAt` line is replaced by two lines, and the bulk line now says best-effort:
   - "Several documents getting the same change or deletion: use ONE update/delete call with where (e.g.
     {"id":{"in":[1,2,3]}}), not one call per document."
   - "Every update/delete, bulk included, is checked per document against the version you last read; a "Conflict"
     means that document was NOT written: re-apply only your change to the current version it carries, retry. Pass
     ifUpdatedAt only to pin a specific version (a string with id; {"<id>":"<updatedAt>"} with where)."
   - "Bulk writes are best-effort and report per document; "PARTIAL" means some were refused or failed and NOT changed
     while the rest were applied. An empty where is refused unless all: true."
2. **Per-document version map.** `ifUpdatedAt` accepts a string (with `id`, as before) or a map
   `{"<id>": "<updatedAt>"}` (with `where`; a map alone selects the documents it names). A single string with a `where`
   call is refused and nothing is written.
3. **Per-document check in bulk calls.** Before a bulk update or delete, every matching document is checked against the
   version pinned for it in the map or, when none is pinned, the version this user last read (the same key as the by-id
   check: user, collection, id, `createdAt`). Stale documents are refused with their current state; the write then runs
   on the rest (`where: {and: [<where>, {id: {in: allowed}}]}`).
4. **The answer states the semantics.** Always `mode: "best_effort"` with `applied`, `not_changed` and per-document
   `results`; refused items carry `conflict: "stale"`, the expected and current `updatedAt`, which precondition applied,
   and `currentDocument`. Headline: plain when all applied; `PARTIAL:` when some applied (nothing is rolled back), with a
   ready retry map; `Conflict:` when none applied. `isError` whenever any document was not changed.

Limits, unchanged from v1 and stated in the answers: best-effort read-then-write, not compare-and-set; the read memory
is per server process and per user; no all-or-nothing mode (Payload's bulk operations are per document).

Checks: strict `tsc` inside a Payload v3.93.0 monorepo checkout, 0 errors; `harness/build/build.sh` reproduces the
measured v2 files byte-identical ([builds/research-v2-files.txt](builds/research-v2-files.txt)).

## 3. Method

Two frozen series on the same sandbox as the main benchmark (one Postgres, every run reseeded), the same checkers
(`harness/harness/check.mjs`), and the same client: the Claude Agent SDK with only the MCP server's tools.

| Series | Frozen | What |
|---|---|---|
| batching series | 13 Nov 2026, 19:07 UTC | 10 probe runs, then Claude Opus 5.5 (`claude-opus-5-5`), 5 runs per task per build on U11, A5, A3 (batching) and A4, U9 (conflict guards), research v2 against research v1 as a same-day control, order shuffled with a fixed seed |
| v2.1 probes | 13 Nov 2026, 19:34 UTC | probes only, no model (section 6) |
| v2.1 agent series | 13 Nov 2026, 21:18 UTC | Claude Opus 5.5, 5 runs per task per build on U11, A5, A3 (batching) and A4, U9, U8 (conflict guards), research v2.1 against research v1 as a same-day control, order shuffled with a fixed seed, plan and expected results written before any run (section 10) |

- **Prompt check** before the freeze ([batching/prompt-check.md](batching/prompt-check.md)): the five prompt files are
  unchanged since the main benchmark, match their pre-registered texts, and contain no word that steers towards or away
  from one bulk call.
- **Batching:** an opportunity is one collection getting the same operation on several documents (U11: tasks delete ×3
  and listings delete ×3, two per run; A5: tasks delete ×2; A3: tasks update ×6); captured = done in one write call.
- **Conflict class:** IsoKron's conflict rules `conflict-rules@3`, applied to each run's recorded calls.
- Per-run data: [batching/runs.csv](batching/runs.csv); tables and probe counts:
  [batching/tables.md](batching/tables.md).

## 4. Results

### 4.1 Probes (no model)

| Probe | Build | Verdict | Counts |
|---|---|---|---|
| E1 lock, update (regression) | v2 | not reproduced (the fix holds) | written 0/10, `isError` 10/10; REST 423 10/10 |
| E2 lock, delete (regression) | v2 | not reproduced (holds) | deleted 0/10, `isError` 10/10 |
| E3 empty where, update (regression) | v2 | not reproduced (holds) | changed 0/5, `isError` 5/5 |
| E4 empty where, delete (regression) | v2 | not reproduced (holds) | deleted 0/5, `isError` 5/5 |
| E6 bulk partial failure (regression) | v2 | not reproduced (holds) | 4 committed, `isError` 5/5, archived task named 5/5 |
| **E9 stale document inside a bulk delete** | v2 | **not reproduced (holds)** | stale task kept 5/5, the other four deleted 5/5, `isError` and "stale" 5/5; control (no other writer) deleted all five, no `isError`, 5/5 |
| E9 (contrast) | v1 | **reproduced** | stale task deleted 5/5, no signal |
| E10 stale document inside a bulk update | v2 | not reproduced (holds) | stale task not written 5/5, other four updated 5/5, `isError` and "stale" 5/5; control 5/5 updated |
| E10 (contrast) | v1 | reproduced | stale task written 4/4 valid (one repetition lost to a client connection reset) |
| E11 version map pins one wrong version | v2 | not reproduced (holds) | pinned task kept 5/5, other four deleted 5/5, `isError`, "stale", `best_effort` 5/5; control (no map) deleted all five |

### 4.2 Agent runs: v1 against v2 (Opus)

The series stopped at 40 of 50 planned runs (section 7). Runs per cell are shown; the run refused by the provider is
left out.

| Task | Build | Runs | Checker pass | Batching (one pass) | Tool calls p50 | Write calls p50 | Tokens p50 | Runs passing ifUpdatedAt |
|---|---|---|---|---|---|---|---|---|
| U11 | v1 (control) | 2 | 2/2 | **0/4** | 8 (8, 10) | 6 | 43,056 (43,056, 58,976) | 2 |
| U11 | **v2** | 4 | 4/4 | **8/8** | **4** | 2 | 43,272 | 0 |
| A5 | v1 (control) | 4 | 4/4 | 0/4 | 3 | 2 | 40,447 | 4 |
| A5 | **v2** | 5 | 5/5 | **5/5** | **2** | 1 | 42,044 | 0 |
| A3 | v1 (control) | 5 | 5/5 | 5/5 | 2 | 1 | 40,422 | 0 |
| A3 | v2 | 3 | 3/3 | 3/3 | 2 | 1 | 42,268 | 0 |

- **Batching came back, further than on the vendor build.** U11: 0/4 on v1 (every run six by-id deletes, each with
  `ifUpdatedAt`) to 8/8 on v2 (one `deleteTasks` and one `deleteListings` with `where id in [...]` in every run); the
  vendor build had 8/10 in the main benchmark. A5 also batches now (0/4 to 5/5; 0/6 on the vendor build and 0/5 on v1
  in the main benchmark). A3 stays one pass on both.
- **Calls:** U11 8-10 down to 4 per run, A5 3 down to 2.
- **Tokens per run barely move** (about 40-43k on both builds). The v2 session start is 393 cl100k tokens heavier
  (`tools/list` 5,486 to 5,792, `initialize` 209 to 296: the longer `ifUpdatedAt` and `where` descriptions and the extra
  instruction line), and it is re-read on every model turn, so on A5 a v2 run with one call fewer still used about 1.6k
  more tokens (p50 42,044 against 40,447). The gain is in calls and turns, not tokens.
- Small samples: v1 U11 has 2 runs (3 were not run), v2 A3 has 3 (2 not run).

### 4.3 Conflict guards (A4, U9): a regression in v2

| Task | Build | Runs | Checker pass | conflict-rules@3 | Runs whose first find used `select` |
|---|---|---|---|---|---|
| A4 | v1 (control) | 5 | 5/5 | `reread_reapplied_success` 5 | 4 |
| A4 | v2 | 4 | **2/4** | `reread_reapplied_success` 2, **`no_signal` 2** | 2 |
| U9 | v1 (control) | 2 | 2/2 | `reread_reapplied_success` 2 | 0 |
| U9 | v2 | 5 | **1/5** | `reread_reapplied_success` 1, **`no_signal` 4** | 4 |

**Six of nine v2 guard runs lost editor-b's row**: the agent's write was accepted with no conflict. All six, and only
those six, first read the post with `select: {title, items, updatedAt}`; every v2 guard run without `select` got the
conflict and recovered with one informed retry (3/3).

The cause, from the code and confirmed by probe E12 in section 6: the read-version memory keys a read by
`(user, collection, id, createdAt)`, so that a re-created id starts clean. A find whose `select` leaves `createdAt` out
records the read under a key that no later write looks up, so the update by id ran with **no precondition**. The hole
is in the v1 code too (patch 0003), but v1's instruction made agents pass `ifUpdatedAt` explicitly on every write, which
covered it: v1 A4 used the same `select` in 4 of 5 runs and recovered in all 5. v2's instruction ("the server checks
per document against the version you last read; pass ifUpdatedAt only to pin") removed that cover. The bulk change
itself is not involved (these are single updates by id), and E9-E11 hold.

Stated plainly: **research v2 fixes batching and reopens a lost update on the conflict guards** whenever the agent reads
with a narrow `select`.

## 5. Cost

Per-run cost in USD is in [batching/runs.csv](batching/runs.csv) (`usd`). The probes cost nothing (no model). For the
v2.1 agent series, the per-run figure is `estimated_cost_usd` in [batching/runs-v2-1.csv](batching/runs-v2-1.csv): a
plan usage estimate reported by the Claude Agent SDK (4.0051 USD over the 60 runs).

## 6. Research v2.1: the select fix (probes only)

One more commit on top of v2 (patch 0007): **find always queries `createdAt` and `updatedAt`** (added to an inclusion
`select`, never removed by an exclusion `select`), records the read, then strips the fields the caller did not ask for,
so the answer is byte-for-byte what it was. Files: `mcp/helpers/writeSafety.ts`, `mcp/tools/resource/find.ts`. Strict
`tsc` in the monorepo checkout: 0 errors. `harness/build/build.sh` reproduces the v2.1 files byte-identical
([builds/research-v2-1-files.txt](builds/research-v2-1-files.txt)).

New probe **E12** ([`harness/probe/experiments/batching/E12-select-stale-update.yaml`](../harness/probe/experiments/batching/E12-select-stale-update.yaml)):
`findPosts` with `select {title, items, updatedAt}`, then another writer changes the summary through REST, then
`updatePosts` by id (title, no `ifUpdatedAt`); control: the same with no `select`.

| Probe | Build | Verdict | Counts |
|---|---|---|---|
| **E12 select read, then stale update by id** | v2 | **reproduced** (the hole) | written 5/5, no `isError`; control (no select) refused 5/5 |
| **E12** | **v2.1** | **not reproduced (fixed)** | refused 5/5, `isError` and "changed since you read it" 5/5, the find answer still without `createdAt` 5/5 |
| E1, E2 locks (regression) | v2.1 | not reproduced (hold) | written/deleted 0/10, `isError` 10/10 |
| E3, E4 empty where (regression) | v2.1 | not reproduced (hold) | E3 changed 0/3 valid (2 lost to a client connection reset), E4 deleted 0/5 |
| E6 bulk partial (regression) | v2.1 | not reproduced (holds) | `isError` 5/5 |
| E9 stale document in bulk delete | v2.1 | not reproduced (holds) | stale kept 4/4 valid, others deleted 4/4 (1 lost to a connection reset) |
| E10 stale document in bulk update | v2.1 | not reproduced (holds) | stale not written 4/4 valid, others updated 4/4 |
| E11 version map | v2.1 | not reproduced (holds) | pinned kept 5/5, others deleted 5/5, `best_effort` 5/5 |

The connection resets are the probe client's keep-alive connection being reset between calls. Those repetitions are
counted as exceptions, not as valid repetitions, and every verdict's minimum of valid repetitions (3) was met.

The probes show the mechanism closed for the exact pattern the six failing runs used. Whether agents on v2.1 keep v2's
batching and get v1's recovery rate is measured by the v2.1 agent series in section 10.

## 7. The stop

The batching series ran 40 of its 50 planned agent runs (19:17-19:30 UTC). Run `v1-a5-5` ended with a provider API
error, and its spare `v1-a5-5b` was refused the same way, so the driver stopped, as planned for repeated provider
errors. Both are recorded with `provider_api_error` true and cost 0. Not run: v1-u11-2, v1-u11-3, v1-u11-4, v1-u9-1,
v1-u9-4, v1-u9-5, v2-a3-2, v2-a3-5, v2-a4-5, v2-u11-3.

These 10 runs were not resumed. The v2.1 agent series (section 10) supersedes them: v2 is replaced by v2.1, so
finishing the v2 cells would measure a build that is not proposed, and the v1 control is run again there in full.

## 8. Verdict

- **Batching: fixed.** With v2's instructions and per-document bulk checks, Opus batched every opportunity it met
  (U11 8/8, A5 5/5, A3 3/3) against v1's 0/4, 0/4, 5/5 the same day, at 2-4 calls per run instead of 3-10. The
  per-document check inside bulk calls holds (E9-E11), and it closed a lost update that v1's bulk calls had (E9 and E10
  reproduced on v1).
- **v2 as built is not safe:** dropping the "always pass ifUpdatedAt" instruction exposed a gap in the read-version
  memory (a narrow `select`), and 6 of 9 conflict-guard runs lost the other editor's change. Batching did not cause
  this; the instruction change uncovered it.
- **v2.1 closes that gap in the probes** (E12, 5 of 5) with every earlier probe still holding, **and in agent runs**
  (section 10): the other editor's change kept in 15 of 15 v2.1 conflict-guard runs, batching as on v2.
- Sample sizes are small (2-5 runs per cell; some cells short because of the stop). No statistics are claimed.

## 9. Files

- Code: [`patches/0006`](../patches/0006-feat-plugin-mcp-batch-friendly-preconditions-per-doc.patch) (v2) and
  [`0007`](../patches/0007-fix-plugin-mcp-read-version-memory-survives-a-find-w.patch) (v2.1); tags
  `research-v2-v3.93.0` and `research-v2.1-v3.93.0`.
- Build records: [builds/research-v2-BUILD.json](builds/research-v2-BUILD.json),
  [builds/research-v2-files.txt](builds/research-v2-files.txt),
  [builds/research-v2-1-BUILD.json](builds/research-v2-1-BUILD.json),
  [builds/research-v2-1-files.txt](builds/research-v2-1-files.txt).
- Probes: [`harness/probe/experiments/batching/`](../harness/probe/experiments/batching/) (E9-E12 and the regression
  copies run on v2 and v2.1); targets in [`harness/probe/targets/`](../harness/probe/targets/).
- Data: [batching/runs.csv](batching/runs.csv), [batching/tables.md](batching/tables.md),
  [batching/prompt-check.md](batching/prompt-check.md); the v2.1 agent series:
  [batching/runs-v2-1.csv](batching/runs-v2-1.csv), [batching/tables-v2-1.md](batching/tables-v2-1.md),
  [batching/prompt-check-v2-1.md](batching/prompt-check-v2-1.md).

## 10. Research v2.1 with agents (v1 against v2.1)

Frozen 13 Nov 2026, 21:18 UTC, on the same sandbox, checkers, system prompt and task prompts as the batching series.
Claude Opus 5.5 (`claude-opus-5-5`), 5 runs per task per build, research v2.1 against research v1 as a same-day
control, order shuffled with a fixed seed. Research v2 is not run. U8 is added: the other editor saves and keeps the
post open (her lock). The plan, including the expected results, was written and frozen before any run. Prompt check:
[batching/prompt-check-v2-1.md](batching/prompt-check-v2-1.md) (no steering words). **60 of 60 runs completed**, all
passed their checkers. Data: [batching/runs-v2-1.csv](batching/runs-v2-1.csv),
[batching/tables-v2-1.md](batching/tables-v2-1.md).

### 10.1 Batching (U11, A5, A3)

| Task | Build | Runs | Checker pass | Batching (one pass) | Tool calls p50 | Write calls p50 | Model turns p50 | Tokens p50 (min-max) | Output tokens p50 | Plan usage estimate, USD (5 runs) | Runs passing ifUpdatedAt |
|---|---|---|---|---|---|---|---|---|---|---|---|
| U11 | v1 (control) | 5 | 5/5 | **0/10** | 8 | 6 | 9 | 44,392 (44,326-44,586) | 1,174 | 0.3794 | 5 |
| U11 | **v2.1** | 5 | 5/5 | **10/10** | **4** | 2 | 5 | 44,703 (44,668-44,880) | 657 | 0.2969 | 0 |
| A5 | v1 (control) | 5 | 5/5 | **0/5** | 3 | 2 | 4 | 41,844 (41,720-44,572) | 474 | 0.2645 | 5 |
| A5 | **v2.1** | 5 | 5/5 | **5/5** | **2** | 1 | 3 | 43,492 (43,474-43,514) | 321 | 0.2392 | 0 |
| A3 | v1 (control) | 5 | 5/5 | 5/5 | 2 | 1 | 3 | 41,877 (41,818-41,897) | 427 | 0.2485 | 0 |
| A3 | v2.1 | 5 | 5/5 | 5/5 | 2 | 1 | 3 | 43,704 (43,656-43,739) | 436 | 0.2575 | 0 |

- **v2.1 batches as v2 did:** every U11 run made one `deleteTasks` and one `deleteListings` with `where id in [...]`,
  every A5 run one `deleteTasks`. v1 again deleted one document per call, each with `ifUpdatedAt`.
- **What batching does:** calls U11 8 to 4 and A5 3 to 2; model turns U11 9 to 5 and A5 4 to 3; output tokens down
  about 44% (U11) and 32% (A5). **Total tokens per run do not fall** (U11 44.4k to 44.7k, A5 41.8k to 43.5k, A3
  41.9k to 43.7k): almost all of them are the session start, read again from the prompt cache on every turn, and v2.1's
  session start is larger (`tools/list` 25,313 to 26,414 bytes, `initialize` 943 to 1,297 bytes; patch 0007 adds
  nothing to it). The plan usage estimate, which prices output above cache reads, falls on the batched tasks (U11
  0.0759 to 0.0594 per run, A5 0.0529 to 0.0478) and is about the same on A3.

### 10.2 Conflict guards (A4, U9, U8)

| Task | Build | Runs | Checker pass | Other editor's change kept | conflict-rules@3 | conflict-rules@4 | First write carried ifUpdatedAt | First find used `select` | Tool calls p50 | Tokens p50 |
|---|---|---|---|---|---|---|---|---|---|---|
| A4 | v1 (control) | 5 | 5/5 | 5/5 | `reread_reapplied_success` 5 | same | 5/5 | 3 | 3 | 57,545 |
| A4 | **v2.1** | 5 | 5/5 | **5/5** | `reread_reapplied_success` 5 | same | **0/5** | 2 | 3 | 59,774 |
| U9 | v1 (control) | 5 | 5/5 | 5/5 | `reread_reapplied_success` 5 | same | 5/5 | 3 | 3 | 56,215 |
| U9 | **v2.1** | 5 | 5/5 | **5/5** | `reread_reapplied_success` 5 | same | **0/5** | 3 | 3 | 58,594 |
| U8 | v1 (control) | 5 | 5/5 | 5/5 | `conflict_persisted` 5 (reported honestly) | same | 5/5 | 5 | 5 | 89,784 |
| U8 | **v2.1** | 5 | 5/5 | **5/5** | `conflict_persisted` 5 (reported honestly) | same | **0/5** | 2 | 5 | 93,477 |

**On v2.1 no agent run lost the other editor's change (15 of 15), and every first write was refused as a conflict
although none carried `ifUpdatedAt`.** The refusal came from the server's own read-version check, which v2 lacked after
a narrow read: 7 of the 15 v2.1 runs first read the post with `select: {title, items, updatedAt}`, the read that
preceded all six of v2's lost updates, and all 7 were refused. Every A4 and U9 run then re-applied its row once with
the version the conflict answer carried (both rows in the end state). On U8 every run, on both builds, was refused
while the other editor held her lock, forced nothing, and told the user the post was being edited.

v1 gets the same result by another route: its agents pass `ifUpdatedAt` on every first write, as its instruction asks.
v2.1 asks for nothing and checks the version the agent read. Conflict classes are the same under IsoKron's conflict
rules `conflict-rules@3` (recorded) and `conflict-rules@4` (the runs reclassified afterwards from their recorded
calls). Under `claim-rules@2` the A4, U9 and U11 answers count as `done_claimed` instead of `unclear`; every outcome
stays a pass.

### 10.3 Verdict (v2.1)

- **Batching: kept.** U11 10/10 and A5 5/5 in one pass (v1 0/10, 0/5); A3 5/5 on both.
- **Conflict guards: hold.** 15 of 15 v2.1 runs kept the other editor's change, as on v1, with no `ifUpdatedAt` from
  the agent, including the 7 runs with the narrow `select`. v2's regression does not appear.
- **Calls, not tokens:** batching halves calls on U11 and saves one on A5; total tokens per run are equal or slightly
  higher on v2.1.
- Small cells (5 runs per task and build), one model, one sandbox. Counts only; no statistics are claimed.
