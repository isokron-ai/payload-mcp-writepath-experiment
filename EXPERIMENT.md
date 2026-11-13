# Payload MCP plugin write-path experiment

An independent research experiment by [IsoKron](https://isokron.ai). It is based on
[payloadcms/payload](https://github.com/payloadcms/payload) `packages/plugin-mcp` at tag `v3.93.0` (commit `77425c50`,
released 4 November 2026), with 7 commits that change how the plugin's collection tools write, the build and check
script, the benchmark harness, and the results used to measure them. The findings behind the changes are in
[FINDINGS.md](FINDINGS.md).

> **Not affiliated with, sponsored by, or endorsed by Payload CMS, Inc.** This is not an official release and not a
> supported distribution. It was built to measure what fixing write-path friction changes for AI agents, and it exists
> so others can inspect the changes and reproduce the measurement. Use the official plugin for real work. If you run
> this build, use a disposable local Payload app with test users only.

Per-commit details: [CHANGES-EXPERIMENT.md](CHANGES-EXPERIMENT.md). Numbers: [results/BENCHMARK.md](results/BENCHMARK.md)
(v1) and [results/BATCHING-FIX.md](results/BATCHING-FIX.md) (v2 and v2.1).

## Three research builds, measured very differently

| Build | Tag | What | How far it was measured |
| --- | --- | --- | --- |
| upstream | `upstream-v3.93.0` | `@payloadcms/plugin-mcp` 3.93.0, unmodified (the benchmark's baseline runs the npm package) | the baseline of every comparison |
| research v1 | `research-v1-v3.93.0` | patches 0001-0005 | **the benchmarked build**: 144 agent runs against the baseline, plus regression probes |
| research v2 | `research-v2-v3.93.0` | v1 + patch 0006 (batch-friendly preconditions) | a short agent series, v2 against v1 as a same-day control (39 graded runs in all), and probes. **It restored batching but lost the other writer's change in 6 of 9 conflict-guard runs. Do not use it.** |
| research v2.1 | `research-v2.1-v3.93.0` | v2 + patch 0007 (the read memory survives `select`) | probes and a 60-run agent series, v2.1 against v1 as a same-day control. **It keeps v2's batching (U11 10/10, A5 5/5) and kept the other writer's change in 15 of 15 conflict-guard runs.** The probes show the v2 hole closed (5 of 5) and every earlier probe holding |

`packages/plugin-mcp` on `main` is research v2.1. The v2 regression and the v2.1 fix are written up in
[results/BATCHING-FIX.md](results/BATCHING-FIX.md), including the runs that went wrong.

## What is in this repository

`main` is one commit: the plugin source at v2.1 and everything around it. The build tags point at a separate,
code-only history: an import of upstream's `packages/plugin-mcp` and root `LICENSE.md` at `77425c50` (tag
`upstream-v3.93.0`, unmodified, without upstream's history), then the 7 experiment commits made with `git am` from
[`patches/`](patches/). Only the plugin is included, not the whole Payload monorepo: the plugin is the only package
changed, and the benchmark installs every other Payload package from npm at 3.93.0.

`git rev-parse upstream-v3.93.0:packages/plugin-mcp` gives `d5843d4a9baf977379c6ec74694b17f51824b377`, the same tree
id as `packages/plugin-mcp` at `77425c50` in upstream's repository. `LICENSE.md` is the same blob as upstream's
(`b31f1fb3a1fdfb07ea047b17323b864f8542224e`).

| Path | What it is |
| --- | --- |
| [`EXPERIMENT.md`](EXPERIMENT.md), [`CHANGES-EXPERIMENT.md`](CHANGES-EXPERIMENT.md), [`FINDINGS.md`](FINDINGS.md), [`NOTICE`](NOTICE), [`SECURITY.md`](SECURITY.md), [`SUPPORT.md`](SUPPORT.md) | This description, the change list, the findings register, attribution, reporting |
| [`packages/plugin-mcp/`](packages/plugin-mcp/) | Upstream at `v3.93.0` plus the 7 experiment commits (research v2.1) |
| [`patches/`](patches/) | The 7 commits as a series for `git am` on a clean upstream checkout at `v3.93.0` |
| [`harness/build/build.sh`](harness/build/build.sh) | Checks the upstream import and the patch series, and rebuilds the measured builds from this repository alone |
| [`harness/`](harness/README.md) | The benchmark: sandbox app and Postgres compose file, seed, task prompts, checkers, probe definitions, run helpers |
| [`results/`](results/) | [`BENCHMARK.md`](results/BENCHMARK.md), [`BATCHING-FIX.md`](results/BATCHING-FIX.md), per-run data, statistics, the measured builds' records, the tool-list weights |
| [`.github/workflows/ci.yml`](.github/workflows/ci.yml) | CI: the upstream import, the patch series, and the transpiled files of all three research builds |

## Build identity

Each research build was measured as the vendor npm package with 7 of its `dist/*.js` files replaced by the changed
TypeScript files, transpiled one by one with esbuild 0.25.12 (ESM, no bundling). The sha256 of each measured file is in
[`results/builds/`](results/builds/) (`research-files.txt` is v1, `research-v2-files.txt` v2,
`research-v2-1-files.txt` v2.1). `harness/build/build.sh transpile` rebuilds all three from the tags in this repository
and compares; on 13 November 2026 all 21 files were byte-identical.

| Build | Commit (tag) | `packages/plugin-mcp` tree |
| --- | --- | --- |
| upstream | `89748e58` | `d5843d4a9baf977379c6ec74694b17f51824b377` |
| research v1 | `81d51a4b` | `a0cd7103c9bbce0f0c520316840117ecb108ff0a` |
| research v2 | `9eeb23d7` | `9a52bcbd1249c657f980226063744782a69a6931` |
| research v2.1 | `f471e2e7` | `afd74ba5dcc9966081617b184047ddfa7a4b493c` |

Two differences from IsoKron's working copies, both outside the measured bytes: one source comment in
`mcp/tools/resource/find.ts` lost an internal reference, and the commit messages were rewritten in plain words. esbuild
drops comments, so the transpiled files are the measured ones, as the hashes show. The build records
(`results/builds/*-BUILD.json`) name the source commit in IsoKron's working clone, which is not in this repository.

## Type check and tests

The experiment commits add no unit tests. After the benchmark, the research source was checked inside a Payload
v3.93.0 monorepo checkout (pnpm, the repository's own strict build):

- type check: 0 errors for v1, v2 and v2.1;
- Payload's plugin integration suite (`test/plugin-mcp/int.spec.ts`, Postgres) on v1: 46 of 74 pass as is. All 28
  failures assert the old full-document write text that the compact receipts replace by design; with
  `returnDocument: true` added to those calls, 74 of 74 pass;
- lint with the plugin's config: 35 errors on v1, 34 of them key order (`perfectionist/sort-objects`, autofixable) and
  one unused capturing group. Style only, left as is so the source matches the measured build.

## What it changes

Each change targets a defect or a friction point found in IsoKron's audit of the plugin, most of them in a usability
session in which an AI agent used the unmodified plugin for 13 everyday jobs.

| Change | Patch |
| --- | --- |
| update and delete respect document locks by default, as Payload's REST API does; delete takes `overrideLock` | 0001 |
| a refused write returns `isError` and a `Conflict:` answer naming the lock holder, with a re-read and re-apply instruction | 0001, 0004 |
| `where: "{}"` (every document) is refused unless `all: true` | 0001 |
| bulk update and delete report per document, with a `PARTIAL` headline and `isError` when any failed | 0001 |
| array rows keep their `id` in the input schema (equivalent to the open upstream PR #19436 for issue #19435, which are not ours) | 0002 |
| every error answer sets `isError`; compact write receipts (`returnDocument: true` for the old answer); tool annotations; default server instructions | 0001, 0002 |
| version preconditions: `ifUpdatedAt`, and otherwise the version the caller last read, refuse stale writes | 0003 |
| conflict answers carry the current document, so a retry can be informed | 0004 |
| fields named like operation arguments (`locale`, `draft`, `select`, ...) can be written through `data`, offered only where a collection has such a field | 0001, 0002, 0005 |
| v2: batch-friendly instructions, a per-document version map, and the read-version check inside bulk update and delete | 0006 |
| v2.1: the read-version memory survives a find with a narrow `select` | 0007 |

Several of these change behaviour on purpose (the lock default, the receipts, the match-all guard). They are research
designs, not patches ready for upstream as they stand. The dev-only experimental tools are untouched.

## What it measured

**Research v1 against the vendor build.** 144 measured agent runs on 13 November 2026 on a loopback Payload 3.93.0 app
with Postgres 17.6, through the Claude Agent SDK with only the MCP server's tools. Correctness comes from a state checker
reading the app through REST, never from the agent. On the pre-registered task set (five jobs frozen before any change
was designed):

| | vendor 3.93.0 | research v1 |
| --- | --- | --- |
| Runs correct (Opus and a capture-off observer) | 11 of 29 (38%) | 28 of 29 (97%) |
| Expected tokens per verified success | 89,513 | 41,393 |
| Tokens per run, median | 34,373 | 40,709 (about +18%; the interval for the difference includes zero) |
| Seeded conflicts (another editor changes the post after the agent's read) | no conflict ever returned; the other change lost in 15 of 15 | 10 of 15 recovered, 0 persisted; the other 5 were reported honestly to the user |

With 5 tasks, the per-task sign test is not significant (p = 0.375). Method, per-task tables, the friction-derived set,
the A3 disclosure and the corrections of 13 November: [results/BENCHMARK.md](results/BENCHMARK.md).

**v1 had a cost the benchmark showed:** on the friction-derived task U11 agents stopped batching (0 of 10 one-call
deletes, against 8 of 10 on the vendor build), because v1's instructions asked for a per-document version on every
write.

**Research v2 and v2.1** ([results/BATCHING-FIX.md](results/BATCHING-FIX.md)):

- v2 brought batching back (U11 8 of 8, A5 5 of 5, against 0 of 4 and 0 of 4 on v1 the same day) and closed a lost
  update inside bulk calls that v1 had (probes E9, E10).
- **v2 also reopened a lost update:** in 6 of 9 conflict-guard runs (A4, U9) the other writer's change was lost with no
  signal. All six runs read the post with a narrow `select`, which hid the document from the read-version memory. v1's
  instruction to pass `ifUpdatedAt` had covered that hole; v2 removed the instruction.
- **v2.1 fixes that hole** in the probes (E12: written 5 of 5 on v2, refused 5 of 5 on v2.1; every earlier probe
  still holds) and with agents: Opus on v2.1 against v1, 5 runs per task, batched U11 10/10 and A5 5/5 (v1 0/10, 0/5)
  and kept the other writer's change in 15 of 15 conflict-guard runs (A4, U9, U8), every first write refused by the
  server with no `ifUpdatedAt` from the agent. Calls fall (U11 8 to 4, A5 3 to 2); tokens per run do not.

## Build and compare

```sh
git clone https://github.com/isokron-ai/payload-mcp-writepath-experiment && cd payload-mcp-writepath-experiment
harness/build/build.sh check-upstream   # the upstream tag == payloadcms/payload v3.93.0 (tree and blob ids)
harness/build/build.sh check-patches    # patches/ on the upstream tag == the v1, v2, v2.1 tags and main (tree ids)
harness/build/build.sh transpile        # rebuild the 21 measured files; compare with results/builds/*files.txt
```

`transpile` uses `ESBUILD` if set, else harness/app's esbuild after `pnpm install`, else `npx esbuild@0.25.12`. The
script needs the build tags, which `git clone` fetches.

Or apply the patch series to a clean upstream checkout (0001-0005 for v1, up to 0006 for v2, all 7 for v2.1):

```sh
git clone https://github.com/payloadcms/payload && cd payload
git checkout v3.93.0 && git am /path/to/patches/*.patch
```

Run the builds side by side: [harness/README.md](harness/README.md) (sandbox app, seed, tasks, checkers).

## Reporting

- **Your results differ from ours:** open an issue here with the task, model, client version and counts (runs correct,
  tool calls, tokens). Reproductions that disagree are the most useful feedback.
- **A bug in one of the experiment commits:** open an issue here.
- **Anything in the upstream plugin:** report it to [payloadcms/payload](https://github.com/payloadcms/payload),
  following its security policy for vulnerabilities. This repository does not track upstream.

This build is not maintained against later upstream releases. Fixes that prove useful are offered upstream as small,
separate pull requests ([FINDINGS.md](FINDINGS.md), "Upstream items").

## License

MIT, as upstream. Payload's copyright and permission notice is kept in [LICENSE.md](LICENSE.md) and
[packages/plugin-mcp/LICENSE.md](packages/plugin-mcp/LICENSE.md). The experiment commits are by IsoKron (Stormhaven
Enterprises LLC) and are released under the same MIT license; see [NOTICE](NOTICE).
