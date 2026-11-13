# Changes in this experiment (on top of @payloadcms/plugin-mcp 3.93.0)

Seven commits after the upstream import (tag `upstream-v3.93.0`), in three builds: research v1 (commits 1-5, tag
`research-v1-v3.93.0`), v2 (+ commit 6, `research-v2-v3.93.0`) and v2.1 (+ commit 7, `research-v2.1-v3.93.0`; this is
`packages/plugin-mcp` on `main`). The same commits are in [`patches/`](patches/) for `git am`;
`harness/build/build.sh check-patches` checks that the series reproduces every build. Paths below are under
`packages/plugin-mcp/src/`.

## Per commit

| # | Commit | Patch | Title | Files | Build |
| --- | --- | --- | --- | --- | --- |
| 1 | `8d6f870b` | `0001` | fix(plugin-mcp): respect document locks, refuse empty where, conflict answers, per-document bulk results in update and delete | `mcp/helpers/writeSafety.ts` (new), `mcp/tools/resource/update.ts`, `mcp/tools/resource/delete.ts` | v1 |
| 2 | `6209ce3f` | `0002` | fix(plugin-mcp): array row ids in input schemas; isError and receipts in create and find; default instructions | `mcp/getMcpHandler.ts`, `mcp/tools/resource/create.ts`, `mcp/tools/resource/find.ts`, `utils/schemaConversion/sanitizeJsonSchema.ts` | v1 |
| 3 | `a56323e1` | `0003` | feat(plugin-mcp): read-version precondition for update and delete by id | `writeSafety.ts`, `create.ts`, `delete.ts`, `find.ts`, `update.ts` | v1 |
| 4 | `98db1c6a` | `0004` | feat(plugin-mcp): conflict answers carry the current document | `writeSafety.ts`, `delete.ts`, `update.ts` | v1 |
| 5 | `81d51a4b` | `0005` | fix(plugin-mcp): data argument only for colliding field names (catalog weight) | `update.ts` | v1 |
| 6 | `9eeb23d7` | `0006` | feat(plugin-mcp): batch-friendly preconditions: per-document checks in bulk update and delete (research v2) | `mcp/getMcpHandler.ts`, `writeSafety.ts`, `update.ts`, `delete.ts` | v2 |
| 7 | `f471e2e7` | `0007` | fix(plugin-mcp): read-version memory survives a find with select (research v2.1) | `writeSafety.ts`, `find.ts` | v2.1 |

The comments in the source use short change labels: `C-conflict`, `C-receipt`, `C-where`, `C-bulk`, `C-args`, `C-rows`,
`C-readversion`, `C-instructions` (v1) and `C-bulk-versions` (v2). They name the rows of the table under "Per change".

Patch file sha256:

```
b62f0f0bdd6167419c1683674919f239207ea6442c94477275fd86e1553e7aad  0001-fix-plugin-mcp-respect-document-locks-refuse-empty-w.patch
d961b83b803e0598c924370d3d42d5fa9d43b5c4f8170350f218ae5f76f404aa  0002-fix-plugin-mcp-array-row-ids-in-input-schemas-isErro.patch
fbefeb8c354f89f7578c23ad57767983d85cc549eae7457340c9bf5abaee12dd  0003-feat-plugin-mcp-read-version-precondition-for-update.patch
a661cab2eb5446f79270791d032a06b372d23d3f7dc956c1f9bf8b47ea0b08b8  0004-feat-plugin-mcp-conflict-answers-carry-the-current-d.patch
0baaa2ab71c0d61a6494981e83ea0809e661b361c9861f80cbb7b93297461127  0005-fix-plugin-mcp-data-argument-only-for-colliding-fiel.patch
5237660410566e1543447285d58db6e78e17b1f9ed56ac9d2a3695b20c300db3  0006-feat-plugin-mcp-batch-friendly-preconditions-per-doc.patch
b5fe673379540d0eff1d8d6da862de024744102495bddaac77e4beeddd95d5cb  0007-fix-plugin-mcp-read-version-memory-survives-a-find-w.patch
```

## v2 and v2.1 (commits 6 and 7)

Measured on 13 November 2026, evening ([results/BATCHING-FIX.md](results/BATCHING-FIX.md)):

| Change | What | Measured |
| --- | --- | --- |
| Batch-friendly instructions (v2) | several documents getting the same change: ONE update/delete call with `where`; every update/delete, bulk included, is checked per document against the version last read; `ifUpdatedAt` only to pin a version | Opus batched U11 8/8 and A5 5/5 (research v1 the same day: 0/4, 0/4) |
| Per-document version map (v2) | `ifUpdatedAt` takes a string (with `id`) or `{"<id>": "<updatedAt>"}` (with `where`; a map alone selects its ids) | probe E11: the pinned stale document refused, the rest deleted, 5/5 |
| Read-version check in bulk calls (v2) | every matching document is checked first; stale ones are refused with their current state, the rest written; the answer says `mode: "best_effort"` with per-document results (`PARTIAL:` / `Conflict:` headlines) | probes E9/E10: refused only the stale document 5/5; research v1's bulk calls lost that update in every valid repetition |
| Read memory survives `select` (v2.1) | find always queries `createdAt`/`updatedAt` for the read-version memory and strips what the caller did not ask for | **v2 lost the other editor's change in 6 of 9 conflict-guard runs**, all of them runs whose read used such a `select`; probe E12: v2 written 5/5, v2.1 refused 5/5. agents on v2.1 (Opus, 5 runs per task): the other editor's change kept in 15 of 15 conflict-guard runs, batching kept (U11 10/10, A5 5/5) |

## Per change

| Change | What | Files | Addresses | Measured (research v1) |
| --- | --- | --- | --- | --- |
| Locks respected by default | `overrideLock` defaults to `false` on update (REST parity); delete takes `overrideLock` (default `false`) and passes it | `update.ts`, `delete.ts` | update and delete wrote through another user's lock and deleted the lock row (REST answers 423) | lock probes: 0 of 10 written or deleted, `isError` 10 of 10 |
| Conflict answers | a refused write returns `isError` and a `Conflict:` text with the lock holder, lock age, `updatedAt`, the current document and a re-read/re-apply instruction; the same facts as one JSON line | `mcp/helpers/writeSafety.ts` | agents never learned of conflicts | seeded conflicts: 10 of 15 recovered, 1 extra call (p50) |
| Version preconditions | `ifUpdatedAt` on update/delete by id; without it, the version this user last read (find, create, update) is the precondition, keyed by `createdAt` so a re-created id starts clean. Best-effort (read, then write); in-process memory | `writeSafety.ts`, `find.ts`, `create.ts`, `update.ts`, `delete.ts` | stale array writes silently dropping another editor's row | A4 and U9: 0 of 5 → 5 of 5 |
| Empty where refused | `where: "{}"` (every document) is refused with the match count unless `all: true` | `update.ts`, `delete.ts` | one call could change or delete a whole collection | match-all probes: refused 5 of 5 |
| `data` argument | collection fields named like operation arguments (`locale`, `draft`, `select`, …) are written through `data`, offered only for collections that have such a field; top-level names unchanged | `create.ts`, `update.ts` | such fields could not be written at all on 3.x (v4 already has `data`) | A6 0 of 6 → 6 of 6 |
| Array row ids | the schema keeps the optional `id` of array rows, so an edit can keep rows and their other-locale values | `utils/schemaConversion/sanitizeJsonSchema.ts` | equivalent to the open upstream PR payloadcms/payload#19436 for #19435 (cited, not ours) | A2 0 of 6 → 6 of 6 |
| Bulk results | bulk update/delete report per document with a `PARTIAL` headline and `isError` when any failed | `update.ts`, `delete.ts` | partial failures read as success | partial-bulk probe: `PARTIAL`, `isError` 5 of 5 |
| Compact receipts | single-document writes answer `{id, updatedAt, _status, fieldsWritten}`; `returnDocument: true` gives the old answer | `writeSafety.ts`, `create.ts`, `update.ts`, `delete.ts` | whole-document echo on every write | response bytes per run: A6 419 → 341, U2 1,486 → 995 |
| `isError`, annotations, instructions | every error answer sets `isError`; tools carry read-only/destructive/idempotent hints; six lines of default server instructions when the app sets none | `find.ts`, all resource tools, `mcp/getMcpHandler.ts` | the write contract was invisible to agents | not isolated |

The measured column is research v1 as a whole on the benchmark and the regression probes
([results/BENCHMARK.md](results/BENCHMARK.md)). No change was measured on its own.

## Tests

The experiment commits add no unit tests. The changed files were transpiled with esbuild into the installed 3.93.0
package for the measurement (`harness/build/build.sh`; the build that was measured used
`harness/build/build-research.sh`, kept as recorded) and exercised by the regression probes and the benchmark. After
the benchmark they were type-checked inside a Payload v3.93.0 monorepo checkout (0 errors for v1, v2 and v2.1) and v1 ran
Payload's plugin integration suite (74 of 74 with `returnDocument: true` in the write calls; see
[EXPERIMENT.md](EXPERIMENT.md), "Type check and tests"). Any change offered upstream is rewritten as a small pull request
with its own tests in Payload's test suite.

## Not changed

- The dev-only experimental tools (collection, config, job and auth families).
- Global tools, and every package other than `plugin-mcp`.
- Upstream's `.github/` automation is not in this repository (only the plugin directory was imported).
