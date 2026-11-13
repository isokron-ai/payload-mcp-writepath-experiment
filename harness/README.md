# Harness: sandbox, tasks, checkers, probes and build script

IsoKron's files for the measurements in [`../results/BENCHMARK.md`](../results/BENCHMARK.md) (vendor 3.93.0 against
research v1) and [`../results/BATCHING-FIX.md`](../results/BATCHING-FIX.md) (research v1, v2 and v2.1), audit
`isokron-payload-mcp-2026-11`: the build script, the sandbox Payload app and its seed, the task prompts and checkers,
and the probe definitions. They are not packaged as a general tool.

The files were frozen before each measured series. The copies here were edited for publication (see "What differs from
the frozen harness"), so their hashes differ from the hashes recorded at the freezes. The task prompts, system prompt,
seed, checkers and sandbox app are otherwise as they were measured.

Everything listens on 127.0.0.1 only. The scripts refuse any other host (`sandbox/lib.mjs`). Use test users and a
disposable database.

## Layout

| Path | What it is |
| --- | --- |
| `app/` | The sandbox Payload 3.93.0 app: collections posts (localized, drafts, array and blocks), listings (fields named `locale`, `draft`, `select`), tasks (with a text field `owner`); `@payloadcms/plugin-mcp` 3.93.0 from npm; `pnpm-lock.yaml` pins every package |
| `sandbox/` | `compose.yaml` (Postgres 17.6, pinned by digest), `up.sh`, `serve.sh`, `env.sh`, `seed.mjs` (reset and state hash), `lock.mjs` (the second editor's document locks), `boundary.mjs` (loopback, keys and scope check), `lib.mjs` |
| `harness/` | `tasks.mjs` (pre-state, the second editor's actions, the checkers), `setup.mjs`, `during.mjs`, `check.mjs`, `prompts/`, `system.md` (the agent's system prompt), `faults/` (a fault-injection case of the usability session) |
| `bench/` | `TASKS-A.md` (pre-registered set) and `TASKS-B.md` (friction-derived set) |
| `probe/` | Probe definitions with REST control arms: `experiments/` (E1 to E8), `experiments/regression/` (re-run on research v1), `experiments/batching/` (E9 to E12 and the regression copies run on v2 and v2.1), `targets/` (one per build), the Payload adapter and the expected seed states |
| `build/` | `build.sh` (use this), `build-research.sh` (the script that built the measured v1 build; needs bash 4 and a full Payload clone) |
| `lib/stdio-bridge.mjs` | stdio to Streamable HTTP bridge, for clients that only launch stdio servers; it adds, drops and rewrites nothing |
| `hypotheses/HYPOTHESES.md`, `CONFLICT-RECOVERY.md` | The pre-registered hypotheses, the conflict design |

The probe files are in the format of IsoKron's probe runner, which is not public. Each one is readable as a
specification: the steps of each arm (MCP calls, REST calls, reads), the counters, and the verdict rule.

## What differs from the frozen harness

| Change | Where |
| --- | --- |
| The secrets directory is `~/.payload-mcp-exp/` (the frozen files named an internal directory) | `sandbox/env.sh`, `sandbox/lib.mjs`, `sandbox/compose.yaml`, `probe/payload-adapter.mjs`, `lib/stdio-bridge.mjs` |
| The run-directory variables are `HARNESS_RUN_DIR` and `HARNESS_TRIGGER_SEQ` (renamed from the internal driver's names) | `harness/setup.mjs`, `harness/during.mjs` |
| Comments that named internal tools, internal ids or local paths were reworded; probe titles lost internal lead labels; the probe files' `format:` line names the format, not the internal runner | code comments, `probe/experiments/`, `probe/targets/`, `bench/`, `hypotheses/`, `CONFLICT-RECOVERY.md` |
| `build-research.sh` takes the Payload clone as a required argument (it defaulted to a local path) | `build/build-research.sh` |
| `build.sh`, `README.md` | rewritten for this repository (builds from the tags; three research builds) |

Not published, and why:

- The agent driver and its configurations (the frozen `series/` directory and the per-series driver scripts). They run
  IsoKron's internal audit toolkit, which is not public, and carry local paths and credential file locations. What
  they did is described below and in the results files (model, task order, per-run limits).
- `config.env`: local paths, credential file locations and the spend cap.
- The checker workbench cases, adapter and result: they run on the internal toolkit. Their outcome (every checker
  tested before the freeze, 71 cases, 0 wrong) is in [`bench/TASKS-A.md`](bench/TASKS-A.md).
- The evidence-chain ledgers and everything written at run time: run records, transcripts, wire captures.

## Secrets the scripts expect

The scripts read secrets from `~/.payload-mcp-exp/` (mode 700, files mode 600) and never print them. Create them yourself
with values that are only for this sandbox:

| File | Contents |
| --- | --- |
| `app.env` | `PAYLOAD_SECRET=<random>`, `POSTGRES_PASSWORD=<random>`, `DATABASE_URL=postgres://payload:<same password>@127.0.0.1:55493/payload` |
| `users.json` | `{"editor-a": {"email": "editor-a@sandbox.test", "password": "<random>"}, "editor-b": {"email": "editor-b@sandbox.test", "password": "<random>"}}` |
| `mcp-key-editor-a` | created by `seed.mjs` on first run (random) |

## Run

```sh
cd harness/app && pnpm install --frozen-lockfile && cd ../..
harness/build/build.sh app research            # copies app/ to build/app-research and swaps in research v1's files
harness/sandbox/up.sh                          # Postgres on 127.0.0.1:55493
MCP_BUILD=baseline harness/sandbox/serve.sh    # vendor build on 127.0.0.1:3093 (next dev pushes the schema)
MCP_BUILD=research harness/sandbox/serve.sh    # research v1 on 127.0.0.1:3094 (second terminal)
node harness/sandbox/seed.mjs                  # users, MCP key, seed content; prints the state hash
```

`build.sh app research-v2` and `build.sh app research-v2-1` build v2 (port 3095) and v2.1 (port 3096) the same way.
All builds share one database. Run them one at a time and reseed before every run. `env.sh` points the scripts at port
3093; set `PAYLOAD_URL=http://127.0.0.1:<port>` to seed and check through another server.

One run of a task, by hand or with any MCP client:

1. `HARNESS_RUN_DIR=<dir> node harness/harness/setup.mjs <task>`: reseed and set the task's pre-state (for U8,
   editor-b's lock). Writes `<dir>/prestate.json`.
2. Give the agent the prompt in `harness/harness/prompts/<task>.md` (system prompt: `harness/harness/system.md`) and
   the MCP endpoint `http://127.0.0.1:<port>/api/mcp` with `Authorization: Bearer <~/.payload-mcp-exp/mcp-key-editor-a>`.
3. Conflict tasks (A4, U8, U9): run `HARNESS_RUN_DIR=<dir> node harness/harness/during.mjs <task> <action>` right
   after the agent's first `findPosts` call returns, as the measured runs did (`tasks.mjs` names the action).
4. Save the agent's final answer to a file and grade: `node harness/harness/check.mjs <task> --run-dir <dir> --answer
   <file>`. Exit 0 is pass. The agent's claim never decides pass or fail. Conflict tasks also read `<dir>/calls.jsonl`
   (the client's call log, one JSON object per tool call) to classify recovery.

The measured runs used the Claude Agent SDK with the MCP server's tools as the agent's only tools, through IsoKron's
internal driver. The driver ran `setup.mjs` before each run, fired `during.mjs` on the agent's first `findPosts`,
recorded `calls.jsonl` and ran `check.mjs`, exactly the steps above.

## Checks without a database

```sh
harness/build/build.sh check-upstream   # the upstream tag is payloadcms/payload v3.93.0, unmodified
harness/build/build.sh check-patches    # patches/ on the upstream tag reproduce the v1, v2 and v2.1 sources
harness/build/build.sh transpile        # the transpiled files of all three builds match results/builds/
```
