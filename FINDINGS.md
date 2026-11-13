# Findings register: @payloadcms/plugin-mcp 3.93.0

The findings of IsoKron's agent-interface audit `isokron-payload-mcp-2026-11` of the Payload MCP plugin,
`@payloadcms/plugin-mcp` 3.93.0 from [payloadcms/payload](https://github.com/payloadcms/payload) tag v3.93.0 (commit
`77425c50`), 12-13 November 2026, on a loopback Payload 3.93.0 app with Postgres 17.6 (two editor accounts; collections
posts, listings and tasks; [`harness/`](harness/README.md)). The changes that address them are in
[CHANGES-EXPERIMENT.md](CHANGES-EXPERIMENT.md); what the changes did for agents is in
[results/BENCHMARK.md](results/BENCHMARK.md).

**Upstream links are added when each item is filed.** Nothing is filed yet. A minimal public reproduction for F1, F2 and
F5 is at [isokron-ai/payload-mcp-repro](https://github.com/isokron-ai/payload-mcp-repro); like this repository, it stays
private until the day the first upstream item is filed.

How to read the tables:

- **Measured.** A frozen, scripted probe (`harness/probe/experiments/`) with a REST control arm against the same app, as
  the same user; the count is reproductions out of valid repetitions. Agent results come from the benchmark and the
  native usability session, graded by a checker that reads the app through REST, never by the agent's claim.
- **Main (v4).** The same experiments run live on a separate sandbox built from upstream `main` (`ae5e1dc6`,
  4.0.0-beta), with the 3.93 inputs translated to v4's generic tools, 13 November 2026.
- **Review.** Independent reviewer agents were given the code and the claim and asked to disprove it; "narrowed" means
  the claim held in the narrower scope given.
- **Research build.** The regression probes re-run on research builds v1, v2 and v2.1 ("not reproduced" = the behaviour
  is gone in that build), and the benchmark tasks on v1.
- **Severity** is IsoKron's (S2 high to S4 low, then info), about reliability for an agent, not a security rating.

## Bugs and design gaps

| Id | Finding | Measured (3.93.0) | REST control | Main (v4) | Review | Class | Sev | Research build | Upstream |
|---|---|---|---|---|---|---|---|---|---|
| F1 | `update<Collection>` writes through a document lock held by another user and deletes their lock row (`overrideLock` defaults to true) | E1: written 10/10, lock removed 10/10, success text, no `isError`. With `overrideLock: false`: refused 3/3 as plain text, no `isError` | PATCH, same user: 423 10/10, lock kept | reproduced live (10/10; the opt-out refusal now sets `isError`) | narrowed (unsafe default; an opt-out exists) | bug: the docs say other users cannot update a locked document | S2 | not reproduced on v1, v2, v2.1 (written 0/10, `isError` 10/10) | issue U, Discussion D2, PR-1 |
| F2 | `delete<Collection>` deletes a locked document; the tool has no `overrideLock` argument | E2: deleted 10/10, success text | DELETE: 423 10/10 | reproduced live (10/10) | confirmed | bug | S2 | not reproduced on v1, v2, v2.1 (deleted 0/10) | issue U, Discussion D2, PR-1 |
| F3 | update and delete with `where: "{}"` change or delete every document; the id-or-where guard only checks for an empty string | E3: 17/20 changed (3 refused by the sandbox's archive hook); E4: 20/20 deleted. `where: "[]"` does the same | no where: 400 "Missing 'where'" | reproduced live | narrowed (`{}` means match-all in Payload's own Local API) | design gap: no guard on a destructive match-all write | S2 | not reproduced on v1, v2, v2.1 (refused unless `all: true`) | Discussion D1, PR-3 |
| F4 | Collection fields named `locale`, `draft`, `select` (and `depth`, `where`, `id`, `fallbackLocale`, `overrideLock`) cannot be written: tool arguments take their place | E5: success text 5/5, value not stored; native job U6 stored the market as null | REST stores all three | fixed (`data` argument), confirmed live 5/5 | fixed on main | bug on 3.x; backport candidate | S3 | fixed (`data`); task A6 0/6 to 6/6 | PR-4 (3.x, only if maintainers want 3.x fixes) |
| F5 | Bulk update and delete report success with no `isError` when some documents fail | E6: 4 committed + 1 refused, headline "Multiple documents updated", `isError` unset 5/5 | 400 with `errors`; the same 4 committed | update fixed; bulk delete still without `isError` (live: 4 deleted, "Errors: 1", `isError` 0/5) | narrowed | bug | S3 | not reproduced on v1, v2, v2.1 (`PARTIAL`, `isError` 5/5) | issue U, PR-2 |
| F6 | Array edits lose the row values of other locales (row ids are stripped from the schema) | E7: es labels lost 5/5, ids refused by the schema; native job U2 failed | REST with row ids keeps es | changed: row ids accepted; with ids es kept 5/5 | duplicate of the open upstream issue #19435 (fix PR #19436) | duplicate: cited, not claimed | S3 | row ids kept; task A2 0/6 to 6/6 | comment C1 on #19435 |
| F7 | Single-document writes echo the whole stored document | native session: 3,278 echo tokens over 13 jobs; a 21-byte update answered with 384 bytes | REST `select` trims the echo | narrowed to delete by id (update and create answer ids only) | narrowed | design gap | info | compact receipts (`returnDocument: true` for the old answer) | not filed (context in issue U) |
| F8 | No tool annotations on 3.x | 0 of 12 tools annotated | | fixed (#17027), confirmed live (13 of 13) | fixed on main | hygiene on 3.x | info | annotations added | not filed (in issue U's 3.x question) |
| F9 | Stale writes are accepted with no signal; no surface has a version precondition | native job U9: the other editor's row lost, no conflict | REST: the same | reproduced live (other editor's row lost 5/5) | n/a | design gap: the MCP layer can add a best-effort precondition | S3 | read-version precondition; tasks A4 and U9 0/5 to 5/5 on v1 (v2 and v2.1: [BATCHING-FIX.md](results/BATCHING-FIX.md)) | not filed (a v4 design proposal, raised only if maintainers are interested) |
| F10 | Two concurrent partial updates to different fields of one document lose one write | E8: one field lost 10/10 (MCP + REST) | REST + REST: lost 10/10 | reproduced live (core) | n/a | platform behaviour passed through, not an MCP finding | info | not addressed (core) | not filed |
| F11 | Resource tools silently strip argument names the advertised schema forbids; a misspelled-only update answers "Document updated successfully" and changes no field | schema fuzzing: 4 of 79 cases | REST also ignores unknown keys, but advertises no schema | fixed on main (strict inputs) | fixed on main; mechanism confirmed | bug on 3.x; backport candidate | S3 | update refuses; create still strips | not filed (backport candidate, like F4) |
| F12 | Tool input schemas omit the fields' min, max, maxLength and configured locales, so schema-valid values are refused | schema fuzzing: 9 of 79 cases | REST refuses the same values | still present (main returns the reason and the schema after a refusal) | narrowed: design gap, 6 tools | design gap (a schema proposal) | info | not addressed, not measured | not filed |
| F13 | Create and update answer a validation refusal with only "The following field is invalid: <Label>", dropping the reason REST gives; `isError` unset | schema fuzzing: 12 cases (e.g. priority 9: REST says "9 is greater than the max allowed Value of 5.") | REST gives the reason | fixed on main | fixed on main | bug on 3.x; backport candidate | S4 | not addressed, not measured | not filed (backport candidate, like F4) |

Static analysis also produced candidates about the plugin's dev-only experimental tools, which register only when
enabled in the plugin config under `NODE_ENV=development`. They are not listed or filed here: v4 removed the
source-writing tool families, and fixes for dev-only tools on 3.x are unlikely to be wanted.

## Upstream items

Filed in this order, at most two new threads a day. Each line gets its link and date when it is filed.

| Item | What | Findings | Link |
|---|---|---|---|
| U | Issue: update and delete tools write through document locks, and partial bulk failures report success; asks whether 3.x fixes are wanted | F1, F2, F5 (context: F7, F8; cites #19435) | [link added when filed] |
| C1 | Comment on #19435 with the measured reproduction | F6 (not ours) | [link added when filed] |
| D2 | Discussion: should the MCP tools respect document locks by default? | F1, F2 | [link added when filed] |
| PR-2 | `fix(plugin-mcp): set isError when bulk delete has errors` (main) | F5 | [link added when filed] |
| D1 | Discussion (v4 ideas): a guard on match-all `where` in update and delete | F3 | [link added when filed] |
| PR-1 | `fix(plugin-mcp): respect document locks in update and delete tools` (main) | F1, F2 | [link added when filed] |
| PR-3 | `fix(plugin-mcp): refuse an empty where unless all is true` (main), only if maintainers agree in D1 | F3 | [link added when filed] |
| PR-4 | `fix(plugin-mcp): allow writing fields named locale, draft, select` (3.x), only if maintainers want 3.x fixes | F4 | [link added when filed] |

The upstream pull requests are small, separate changes written against Payload's own test suite. They are not the
research build in this repository, which bundles every change together for measurement.
