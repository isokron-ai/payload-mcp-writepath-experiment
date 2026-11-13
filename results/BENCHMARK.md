# Benchmark: @payloadcms/plugin-mcp 3.93.0 vs research build v1

144 measured agent runs on 13 November 2026: Claude Opus 5.5 (`claude-opus-5-5`) on both task sets, plus Claude Sonnet
5.5 (`claude-sonnet-5-5`) on set A. Each run was one agent through the Claude Agent SDK with the MCP server's tools as
its only tools. The harness was hashed and frozen before run 1, the sandbox was reseeded before every run, and the run
order was shuffled with a fixed seed and alternated between builds. Correctness comes from an independent state checker
that reads the sandbox through Payload's REST API, never from the agent's own claim. Both builds ran on the same Payload
3.93.0 app and the same Postgres database; only the plugin build differs.

The results measure the **combined** set of changes in [CHANGES-EXPERIMENT.md](../CHANGES-EXPERIMENT.md) as of research
build v1 (patches 0001-0005, tag `research-v1-v3.93.0`), not each change on its own. "This build" below means v1. The
later v2 and v2.1 builds were measured separately and much less: [BATCHING-FIX.md](BATCHING-FIX.md).

## Corrected 13 November 2026

This file first gave three figures that were wrong or covered the wrong task set, and one wrong count. They are
corrected below:

- **Tokens per run.** Was "rose about 17%" (six-task Opus medians, A3 included). Now: about +18% on the five
  pre-registered tasks (median 34,373 to 40,709), and the interval for the difference includes zero.
- **Cost per run.** Was "unchanged on set A" (six tasks). Now, five pre-registered tasks, Opus: mean 0.0349 to 0.0377
  USD, a difference of +0.0028 with an interval of −0.0039 to 0.0110, which includes zero.
- **Run-level test.** Was McNemar p = 0.0003 over six tasks. Now p = 0.000275 over the five pre-registered tasks. The
  per-task sign test over 5 tasks is +4/−1, p = 0.375.
- **False "done" claims.** Two, both on A6 (see "Agent claims" below), not one on A1.

## Task sets

- **Set A, pre-registered** (A1, A2, A4, A5, A6): ordinary editing jobs written and frozen before any change was
  designed. This is the fair test. Prompts and checkers: [`harness/bench/TASKS-A.md`](../harness/bench/TASKS-A.md).
- **Set B, friction-derived** (U2, U6, U8, U9, U11, plus A3): built from the failures of a usability session on the
  unmodified plugin, after the changes were designed. It favours this build by construction.
  [`harness/bench/TASKS-B.md`](../harness/bench/TASKS-B.md).
- The two sets are never added together.

**A3 moved from set A to set B (disclosed).** At the freeze, A3's prompt file was a copy of another job's prompt and did
not match A3's own frozen description and checker. A dry run caught it. The prompt was corrected to match the frozen
description before the benchmark was frozen. A changed pre-registered task cannot count as pre-registered, so A3 is
reported with set B. A3 passed 6/6 on both builds, so it changes no total.

## Results

| Set | Model | Vendor 3.93.0 | This build | Expected tokens per verified success |
|---|---|---|---|---|
| A, pre-registered (A1, A2, A4, A5, A6) | Opus + capture-off observer | 11/29 (38%) [23%, 56%] | 28/29 (97%) [83%, 99%] | 89,513 → 41,393 |
| A, pre-registered | Opus only | 9/25 (36.0%) | 24/25 (96.0%) | |
| A (A1 to A6, 2 runs per task) | Sonnet | 6/12 | 12/12 | |
| B, friction-derived (U2, U6, U8, U9, U11, A3) | Opus | 11/31 (35%) | 31/31 (100%) | 109,364 → 52,230 |

Brackets are Wilson 95% intervals with runs pooled. Expected tokens per verified success = all tokens over every
completed attempt ÷ verified successes.

Per task, set A (Opus and observer; [BENCH-usability.md](BENCH-usability.md)):

| Task | Vendor | This build | What decided it |
|---|---|---|---|
| A1 publish a post and add a task | 5/6 (one provider API error) | 6/6 | |
| A2 change one array row's link | 0/6 | 6/6 | vendor: the Spanish labels of the rows were lost (upstream issue #19435); this build keeps row ids |
| A4 add a row; another editor adds hers after the agent's read | 0/5 | 5/5 | vendor: the stale write drops her row; this build: a conflict, then an informed retry |
| A5 delete one person's done tasks | 6/6 | 5/6 (one provider API error) | |
| A6 create a listing with market `de-DE` | 0/6 | 6/6 | vendor: a field named `locale` cannot be written; this build: `data` |

Opus only, five pre-registered tasks ([STATS-opus-preregistered.md](STATS-opus-preregistered.md); one row per run:
[runs-setA-preregistered.csv](runs-setA-preregistered.csv)). The bootstrap resamples tasks (10,000 resamples, seed 1):

| Measure | Vendor | This build | Difference [95% interval] |
|---|---|---|---|
| Completion | 36.0% | 96.0% | +60.0 pp [12.0, 100.0] |
| Tokens per run, median | 34,365 | 40,709 | +6,344 [−7,445, 21,477] |
| Cost per run, mean (USD) | 0.0349 | 0.0377 | +0.0028 [−0.0039, 0.0110] |

- Exact sign test over the 5 tasks: +4/−1, p = 0.375. With 5 tasks no per-task test can reach significance.
- McNemar over pooled run pairs: p = 0.000275. It treats runs as independent, so it is a reference only.
- Tokens per run with the observer runs included: median 34,373 to 40,709, about +18%. The rise comes from the larger
  catalog and instructions and from the extra calls of conflict recovery. The cost per verified success still roughly
  halved.

[STATS-opus.md](STATS-opus.md) has the same statistics over six tasks with A3 included, as first reported. They are not
the fair-test figures.

## Conflict recovery

Another editor changes the post right after the agent reads it (A4, U9), or keeps it open for the whole run and saves
a row (U8). Classified with IsoKron's conflict rules `conflict-rules@3`, reclassified on 13 November from each
run's saved capture, checker output and answer:

| Task | Build | Seeded | No signal (other change lost) | Recovered | Other |
|---|---|---|---|---|---|
| A4 | vendor / this build | 5 / 5 | 5 / 0 | 0 / 5 | |
| U9 | vendor / this build | 5 / 5 | 5 / 0 | 0 / 5 | |
| U8 (lock held all run) | vendor / this build | 5 / 5 | 5 / 0 | 0 / 0 | this build: `gave_up_reported_failure` 5 |

- Vendor build: no conflict was ever returned. In 15 of 15 seeded runs the other editor's change was lost.
- This build: 10 of 15 recovered (A4 5/5, U9 5/5), 0 persisted. Recovery used the current document carried in the
  conflict answer and took 1 extra call and about 60 extra response tokens (p50).
- U8: the agent refused to overwrite and told the user who was editing, in all 5 runs (checker pass 5/5). The checker
  was frozen before conflict-rules@3 existed and did not record whose lock remained at the end, so @3 classes these runs
  `gave_up_reported_failure`, not `conflict_persisted`. The saved state makes it very likely that they were persisted
  conflicts, but that is an inference, not a measured field.

## Other measures

| Measure | Result |
|---|---|
| Tool calls per run | median 2 to 3 on both builds; U8 and U11 take more on this build (lock retries; per-document deletes and checks) |
| Response bytes per run | fell where writes dominate (A6 419 → 341; U2 1,486 → 995); rose where conflict answers carry the document (U8 1,563 → 5,360) |
| Catalog | 4,031 → 5,060 cl100k model-visible tokens (+1,029, +25%); [catalog/](catalog/) |
| Observer effect | capture off vs on gave the same pass pattern (vendor 3/5, this build 5/5) |
| API errors | 2 runs failed on a provider API error (one per build) and were not graded; they count as failed attempts above |

## Agent claims on the vendor build's failures

Of the 17 graded vendor-build failures on set A (Opus and observer), the run table records 8 honest failures, 7 unclear
failures and 2 false "done" claims. Both false "done" claims are on A6 (`ob-a6-4`, `xb-a6-1`): the claim rule matched
the word "finished", and both answers also told the user the market was probably not stored. They count as false
"done" claims under the recorded rule, but the failure was not silent.

## Limits

- The sandbox runs `next dev`, because the Postgres schema is pushed only in development. Both builds share this.
- This build was measured as esbuild-transpiled files. It was type-checked inside the Payload monorepo only after the
  benchmark (0 errors; [EXPERIMENT.md](../EXPERIMENT.md)). Its preconditions are best-effort: a read, then a write, not
  atomic.
- The second editor's admin-panel save is simulated as a REST PATCH of the rows she saw when she opened the post.
- One sandbox and one Postgres for both builds; runs are sequential and every run reseeds.
- One client (the Claude Agent SDK). Other MCP clients may present tools differently.

Files: [BENCH-usability.md](BENCH-usability.md) (the generated report, both sets),
[STATS-opus-preregistered.md](STATS-opus-preregistered.md), [STATS-opus.md](STATS-opus.md) (six tasks),
[STATS-sonnet.md](STATS-sonnet.md), [runs.csv](runs.csv) (every run), [builds/](builds/) (the measured research
builds' records), [catalog/](catalog/) (tool-list weights).
