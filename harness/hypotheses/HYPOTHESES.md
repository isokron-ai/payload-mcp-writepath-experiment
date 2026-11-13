# Hypotheses (pre-registered with the explore freeze, isokron-payload-mcp-2026-11)

Pin: `@payloadcms/plugin-mcp` 3.93.0 (`77425c50`). Sandbox: `sandbox/` (two users: editor-a = the MCP key's user and the
REST control identity; editor-b = lock holder and second writer). Each hypothesis names its measured experiment
(Phase 3, series `-probes`), its control arm (E6: required) and what would refute it. The exploratory checks of
13 Nov (not published) are NOT evidence for any of these; they only told us the experiments are worth running.

| Id | Area | Claim (test arm) | Control arm | Refuted if | Experiment |
|---|---|---|---|---|---|
| H1 | locks | `updatePosts {id, title}` with no `overrideLock`, while editor-b holds a fresh lock on the post, changes the post, answers success, and removes editor-b's lock row | `PATCH /api/posts/:id` as editor-a under the same lock: HTTP 423, unchanged, lock kept | the MCP write is refused or the lock survives in any valid repetition | E1 (10 reps) |
| H2 | locks | `deletePosts {id}` under editor-b's lock deletes the post and answers success | `DELETE /api/posts/:id` as editor-a: 423, kept | the MCP delete is refused | E2 (10 reps) |
| H3 | empty where | `updateTasks {where:"{}", …}` changes every task the user may change (17 of 20; 3 archived refuse) | `PATCH /api/tasks` with no where: 400 "Missing 'where'" | fewer than all non-archived tasks change, or REST accepts | E3 (5 reps) |
| H4 | empty where | `deleteTasks {where:"{}"}` deletes all 20 tasks | `DELETE /api/tasks` with no where: 400 | any task survives, or REST accepts | E4 (5 reps) |
| H5 | argument names | `updateListings {id, locale:"de-DE"}`, `{draft:true}` and `createListings {…, locale, draft}` leave the stored `locale`/`draft` content fields unchanged (null on create) while answering success | REST `PATCH /api/listings/:id {locale, draft, select}` stores all three | the MCP write stores the value | E5 (5 reps) |
| H6 | bulk partial failure | A bulk `updateTasks` whose where matches 5 tasks, one archived (hook refuses), commits the 4 others and answers with the success headline and no `isError` | REST `PATCH /api/tasks?where=…`: HTTP 400 with `errors` (and the 4 committed: parity on the commit) | the MCP answer sets `isError`, or the 4 are not committed while REST commits them | E6 (5 reps) |
| H7 | array rows (known #19435) | An en edit of `items` through `updatePosts` (no row ids possible) drops the es labels of the rows; passing row ids is refused by the schema | REST `PATCH ?locale=en` with row ids keeps the es labels | es labels survive the MCP edit | E7 (5 reps), cited, never claimed |
| H8 | control | Two writers changing different scalar fields of one post (MCP title, REST summary) both stick: parity, no lost update on disjoint fields | the same pair over REST | either write is lost on MCP only | E8 (10 reps, positive control) |
| H9 | conflict recovery | In the seeded conflicts (U8: editor-b keeps the post open and saves her row after the agent's read; U9 and A4: she adds her row after the agent's read and is done), the vendor build never returns a conflict to the agent: conflict class `no_signal` in every conclusive run, and editor-b's row is lost while the agent reports success | the research build, same tasks and seeds | the vendor build returns a conflict (an error response matching the conflict classifier's rule) in any run | Phase 1b U8, U9; Phase 4 A4 |
| H10 | conflict recovery | With the research build (locks respected; a conflict answer with the current version and a re-read instruction; the read-version precondition) the agent re-reads and lands both rows (`reread_reapplied_success`) in at least 4 of 5 conclusive A4 runs | vendor build (H9) | fewer than 4 of 5 | Phase 4 A4 |
| H11 | design | Write receipts echo the whole document: the research build's compact receipts cut response tokens per verified success on set A without lowering completion | vendor build | completion drops, or response tokens do not fall | Phase 4 |
| H12 | known | Array edits through MCP lose other locales (#19435) also inside real jobs (U2, A2) | research build with row ids allowed | es labels survive on the vendor build | Phase 1b U2, Phase 4 A2 (cited) |

