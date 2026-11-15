# Changes in this experiment (on top of @payloadcms/plugin-mcp 3.93.0)

Twelve commits after the upstream import (tag `upstream-v3.93.0`), in four builds: research v1 (commits 1-5, tag
`research-v1-v3.93.0`), v2 (+ commit 6, `research-v2-v3.93.0`), v2.1 (+ commit 7, `research-v2.1-v3.93.0`) and v2.2
(+ commits 8-12; this is `packages/plugin-mcp` on `main`, tagged `research-v2.2-v3.93.0` once merged). The same
commits are in [`patches/`](patches/) for `git am`; `harness/build/build.sh check-patches` checks that the series
reproduces every build. Paths below are under `packages/plugin-mcp/src/`.

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
| 8 | `bd9fa133` | `0008` | fix(plugin-mcp): version precondition per write, not per user (research v2.2) | `writeSafety.ts`, `create.ts`, `delete.ts`, `find.ts`, `update.ts`, `mcp/getMcpHandler.ts`; tests `versionPrecondition.spec.ts`, `fakePayload.spec-utils.ts` | v2.2 |
| 9 | `265fb7f3` | `0009` | fix(plugin-mcp): refuse and name unknown arguments on every collection tool (research v2.2) | `mcp/helpers/strictArgs.ts` (new), `create.ts`, `delete.ts`, `find.ts`, `update.ts`; tests `unknownArguments.spec.ts` | v2.2 |
| 10 | `85fa21ed` | `0010` | fix(plugin-mcp): pass the reason of a validation refusal through (research v2.2) | `writeSafety.ts`, `create.ts`, `delete.ts`, `update.ts`; tests `refusalReason.spec.ts` | v2.2 |
| 11 | `8642af5a` | `0011` | fix(plugin-mcp): keep array row ids when the same rows are sent again (research v2.2) | `mcp/helpers/rowIds.ts` (new), `update.ts`, `mcp/getMcpHandler.ts`; tests `rowIds.spec.ts` | v2.2 |
| 12 | `45c7dbb9` | `0012` | fix(plugin-mcp): review fixes for research v2.2 | `rowIds.ts`, `strictArgs.ts`, `writeSafety.ts`, `delete.ts`, `update.ts`; tests in the four spec files | v2.2 |

The comments in the source use short change labels: `C-conflict`, `C-receipt`, `C-where`, `C-bulk`, `C-args`, `C-rows`,
`C-readversion`, `C-instructions` (v1), `C-bulk-versions` (v2), and `C-version` (which replaces `C-readversion`),
`C-strict-args`, `C-reason`, `C-row-ids` (v2.2). They name the rows of the tables under "v2.2" and "Per change".

Patch file sha256:

```
b62f0f0bdd6167419c1683674919f239207ea6442c94477275fd86e1553e7aad  0001-fix-plugin-mcp-respect-document-locks-refuse-empty-w.patch
d961b83b803e0598c924370d3d42d5fa9d43b5c4f8170350f218ae5f76f404aa  0002-fix-plugin-mcp-array-row-ids-in-input-schemas-isErro.patch
fbefeb8c354f89f7578c23ad57767983d85cc549eae7457340c9bf5abaee12dd  0003-feat-plugin-mcp-read-version-precondition-for-update.patch
a661cab2eb5446f79270791d032a06b372d23d3f7dc956c1f9bf8b47ea0b08b8  0004-feat-plugin-mcp-conflict-answers-carry-the-current-d.patch
0baaa2ab71c0d61a6494981e83ea0809e661b361c9861f80cbb7b93297461127  0005-fix-plugin-mcp-data-argument-only-for-colliding-fiel.patch
5237660410566e1543447285d58db6e78e17b1f9ed56ac9d2a3695b20c300db3  0006-feat-plugin-mcp-batch-friendly-preconditions-per-doc.patch
b5fe673379540d0eff1d8d6da862de024744102495bddaac77e4beeddd95d5cb  0007-fix-plugin-mcp-read-version-memory-survives-a-find-w.patch
53daf170a4c6aa7e72277001528ccb23bc5491ca9199ba627b184e17a7c7551c  0008-fix-plugin-mcp-version-precondition-per-write-not-pe.patch
80818fe82a0470093a4bdfd3e68f6216c8535bb6b02d93f17f1ca0dd56f1d275  0009-fix-plugin-mcp-refuse-and-name-unknown-arguments-on-.patch
2130eab95134f19835ff12a1a720ae312303eba32718b332a13beb166af6be29  0010-fix-plugin-mcp-pass-the-reason-of-a-validation-refus.patch
0f0dec0585dddeccda8304a5dd34e524d9e7d53b7eef3ba42a726b9ddd0f0dbf  0011-fix-plugin-mcp-keep-array-row-ids-when-the-same-rows.patch
07bddbcbc79a67745b440ab9984993eb665c2faf1da55fa90816bc6b3be11b30  0012-fix-plugin-mcp-review-fixes-for-research-v2.2.patch
```

## v2.2 (commits 8 to 12): corrections

A standards run on 15 November 2026 compared the vendor build with v2.1 and found three records here broader than the
build, and one problem the changes had introduced. v2.2 fixes all four in the code (commits 8 to 11), and commit 12
holds the fixes from a second review of those four. Each fix has unit tests that fail on
the code before it and pass after (`harness/test/run.sh`; "Tests" below), and was checked by hand against a running
app with v2.1 and then v2.2 swapped in (raw JSON-RPC and REST, the same app and seed as the run; "Measured"). Scripts
and outputs: [`results/v2-2/`](results/v2-2/) (`hand-checks-v2-1.mjs` sends no versions, as clients of v2.1 did;
`hand-checks-v2-2.mjs` sends them). The hand checks ran on v2.2 as of commit 11; commit 12's review fixes change
edge cases only (an unreadable document, collections without timestamps, json fields, fallback locales, suggestions)
and are covered by unit tests. A hand re-run on the final build is still to do.

| Change | v2.1 did | v2.2 does | Measured |
| --- | --- | --- | --- |
| `C-version`: the version precondition is per write (F9) | without `ifUpdatedAt`, the version the server remembered **per user** was the precondition. Two clients sharing one MCP key are one user: one client's read or write refreshed the other's memory, and the other's stale write went through (3 of 3 by hand) | every update and delete carries the version its change is based on: `ifUpdatedAt` is **required** in the advertised schema (a string with `id`; a map `{"<id>": "<updatedAt>"}` for several documents, which selects them). A document whose `updatedAt` is no longer the one sent is refused with its current state, whoever changed it. A bulk match the map does not name is refused as `no_version`. The per-user memory is gone. Find answers keep `updatedAt` under any `select`; receipts carry it | v2.1: a second client of the same key read and wrote, then the first client's stale write went through, 3 of 3. v2.2: that write refused 3 of 3 with the version sent, and refused 3 of 3 with none (the refusal names `ifUpdatedAt`); the second client's change kept 3 of 3. The other user's REST change: refused on both, 3 of 3 |
| `C-strict-args`: unknown arguments refused on every collection tool (F11) | refused only an update made entirely of unknown arguments ("nothing to write"); a misspelled field next to a valid one was dropped and the rest written, and create and find dropped it too | create, find, update and delete parse their arguments strictly: a call with an argument the schema does not name is refused before anything runs, with `isError` and a message naming it and the nearest known name (`updateTasks does not take the argument "ttle" (did you mean "title"?)`) | v2.1: `{id, owner, ttle}` written with `ttle` dropped, create with `ttle` and find with `dpth` answered as if it were absent. v2.2: all five refused and named (update twice, create, find, delete); nothing written or created |
| `C-reason`: the refusal carries the reason (F13) | set `isError` on a refused create or update (since v1), but passed on only "The following field is invalid: Priority" | appends Payload's reasons: `... Priority (priority: 9 is greater than the max allowed Value of 5.)`. A bulk update still gives each document's headline only (Payload's bulk result keeps only the message) | v2.1: "The following field is invalid: Priority" (update and create). v2.2: "... Priority (priority: 9 is greater than the max allowed Value of 5.)", `isError` set, update and create |
| `C-row-ids`: row ids stable on a repeat (a regression of v1 to v2.1) | the update tools declare `idempotentHint: true`, but every array row sent without an id got a new id on every call, and with it lost its other-locale values | a row sent without an id that is identical to the stored row at the same position keeps that row's id; a row that differs or moved is new, and no id is given twice. A repeat with the same `ifUpdatedAt` is refused as stale and changes nothing; a repeat with the new version keeps the ids. The hint stays | the same rows re-sent with the new version: v2.1 gave a new row id 3 of 3 and lost the row's Spanish label 3 of 3; v2.2 kept the id 3 of 3 and the label 3 of 3. The identical call repeated: refused, nothing changed, 3 of 3 |

**Not measured with agents yet.** v2.2 asks every write for a version. Research v1 asked agents for one too, by
instruction, and on task U11 they stopped batching (0 of 10 one-call deletes); v2 moved the check into the server to
bring batching back. v2.2 keeps one-call batches possible (the version map selects the documents) and its instructions
say to batch, but whether agents do is open until the agent series is re-run on v2.2.

**Known limits of v2.2.** In a collection with drafts the check compares against the latest draft, while the find tool
reads the published document unless asked for `draft: true`; a write sent with the published version is then refused,
with the current version, at the cost of one more call (the argument's description says so). A bulk update reports each
document's headline only, without the reason (Payload's bulk result keeps only the message). Unknown arguments and a
missing `ifUpdatedAt` are refused by the MCP SDK before the tool runs, so an app's `overrideResponse` hook does not see
those refusals. If the plugin cannot convert a collection's schema (its permissive fallback), the strict schema refuses
every field of that collection by name; before, they were dropped.

## v2 and v2.1 (commits 6 and 7)

Measured on 13 November 2026, evening ([results/BATCHING-FIX.md](results/BATCHING-FIX.md)):

| Change | What | Measured |
| --- | --- | --- |
| Batch-friendly instructions (v2) | several documents getting the same change: ONE update/delete call with `where`; every update/delete, bulk included, is checked per document against the version last read; `ifUpdatedAt` only to pin a version | agents batched U11 8/8 and A5 5/5 (research v1 the same day: 0/4, 0/4) |
| Per-document version map (v2) | `ifUpdatedAt` takes a string (with `id`) or `{"<id>": "<updatedAt>"}` (with `where`; a map alone selects its ids) | probe E11: the pinned stale document refused, the rest deleted, 5/5 |
| Read-version check in bulk calls (v2) | every matching document is checked first; stale ones are refused with their current state, the rest written; the answer says `mode: "best_effort"` with per-document results (`PARTIAL:` / `Conflict:` headlines) | probes E9/E10: refused only the stale document 5/5; research v1's bulk calls lost that update in every valid repetition |
| Read memory survives `select` (v2.1) | find always queries `createdAt`/`updatedAt` for the read-version memory and strips what the caller did not ask for | **v2 lost the other editor's change in 6 of 9 conflict-guard runs**, all of them runs whose read used such a `select`; probe E12: v2 written 5/5, v2.1 refused 5/5. agents on v2.1 (5 runs per task): the other editor's change kept in 15 of 15 conflict-guard runs, batching kept (U11 10/10, A5 5/5) |

## Per change

| Change | What | Files | Addresses | Measured (research v1) |
| --- | --- | --- | --- | --- |
| Locks respected by default | `overrideLock` defaults to `false` on update (REST parity); delete takes `overrideLock` (default `false`) and passes it | `update.ts`, `delete.ts` | update and delete wrote through another user's lock and deleted the lock row (REST answers 423) | lock probes: 0 of 10 written or deleted, `isError` 10 of 10 |
| Conflict answers | a refused write returns `isError` and a `Conflict:` text with the lock holder, lock age, `updatedAt`, the current document and a re-read/re-apply instruction; the same facts as one JSON line | `mcp/helpers/writeSafety.ts` | agents never learned of conflicts | seeded conflicts: 10 of 15 recovered, 1 extra call (p50) |
| Version preconditions | v1 to v2.1: `ifUpdatedAt` on update/delete by id; without it, the version this user last read (find, create, update) is the precondition, keyed by `createdAt` so a re-created id starts clean. Best-effort (read, then write); in-process memory, **per user**, so two clients sharing a key are not told apart. v2.2: `ifUpdatedAt` required on every update and delete, checked per write; no memory | `writeSafety.ts`, `find.ts`, `create.ts`, `update.ts`, `delete.ts` | stale array writes silently dropping another editor's row | A4 and U9: 0 of 5 → 5 of 5 (v1; the other editor is another user) |
| Empty where refused | `where: "{}"` (every document) is refused with the match count unless `all: true` | `update.ts`, `delete.ts` | one call could change or delete a whole collection | match-all probes: refused 5 of 5 |
| `data` argument | collection fields named like operation arguments (`locale`, `draft`, `select`, …) are written through `data`, offered only for collections that have such a field; top-level names unchanged | `create.ts`, `update.ts` | such fields could not be written at all on 3.x (v4 already has `data`) | A6 0 of 6 → 6 of 6 |
| Array row ids | the schema keeps the optional `id` of array rows, so an edit can keep rows and their other-locale values | `utils/schemaConversion/sanitizeJsonSchema.ts` | equivalent to the open upstream PR payloadcms/payload#19436 for #19435 (cited, not ours) | A2 0 of 6 → 6 of 6 |
| Bulk results | bulk update/delete report per document with a `PARTIAL` headline and `isError` when any failed | `update.ts`, `delete.ts` | partial failures read as success | partial-bulk probe: `PARTIAL`, `isError` 5 of 5 |
| Compact receipts | single-document writes answer `{id, updatedAt, _status, fieldsWritten}`; `returnDocument: true` gives the old answer | `writeSafety.ts`, `create.ts`, `update.ts`, `delete.ts` | whole-document echo on every write | response bytes per run: A6 419 → 341, U2 1,486 → 995 |
| `isError`, annotations, instructions | every error answer sets `isError`; tools carry read-only/destructive/idempotent hints; six lines of default server instructions when the app sets none. v1 to v2.1 dropped the reason of a validation refusal and gave array rows new ids on every update despite `idempotentHint: true`; v2.2 fixes both | `find.ts`, all resource tools, `mcp/getMcpHandler.ts` | the write contract was invisible to agents | not isolated |

The measured column is research v1 as a whole on the benchmark and the regression probes
([results/BENCHMARK.md](results/BENCHMARK.md)). No change was measured on its own.

## Tests

**v2.2 adds unit tests** next to the code, as upstream does (`*.spec.ts`), with a shared fixture
(`mcp/tools/resource/fakePayload.spec-utils.ts`): an in-memory stand-in for the Payload Local API calls the tools make,
and a real MCP server and client from the SDK over its in-memory transport, so argument validation, `isError` and
`tools/list` go through the SDK as in the app. `harness/test/run.sh` runs them (vitest 3.2.4, the plugin's pinned
dependencies, no database). Neither the tests nor the fixture is part of a build (`build.sh` skips them).

| Spec file | Fix | Tests | On the code before the fix | After |
| --- | --- | --- | --- | --- |
| `versionPrecondition.spec.ts` | 8 (`C-version`) | 10 | 7 fail (no version, bulk without a map, an unnamed bulk match, delete without a version, `select` hiding `updatedAt`, the schema) | 10 pass |
| `unknownArguments.spec.ts` | 9 (`C-strict-args`) | 8 | 5 fail (update with a valid field, update alone, create, find, delete) | 8 pass |
| `refusalReason.spec.ts` | 10 (`C-reason`) | 3 | 2 fail (update, create) | 3 pass |
| `rowIds.spec.ts` | 11 (`C-row-ids`) | 7 | 2 fail (the repeat, an unchanged row beside a changed one); the helper's own test cannot load before the fix | 7 pass |
| the four files, 4 more tests | 12 (review fixes) | 4 | 4 fail (no usable version and an unreadable document, no timestamps, a json field and a nested id, suggestions) | 4 pass |

The tests that pass before their fix guard behaviour that must not change (a stale version already sent is refused,
unknown keys inside array rows were already refused, an id is not given twice). On `main` all 33 pass (32 new, 1 upstream). The
plugin source on `main` type-checks with 0 errors (strict) against Payload 3.93.0's installed types
(`harness/test/typecheck.sh`, after `pnpm install` in `harness/app`).

Research v1 to v2.1 have no unit tests. Their changed files were transpiled with esbuild into the installed 3.93.0
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
