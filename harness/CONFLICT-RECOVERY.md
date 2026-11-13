# Conflict recovery: design for isokron-payload-mcp-2026-11 (a probe step and a benchmark metric)

## The conflict signal Payload already has

- **Document locks.** When a user opens a document in the admin panel, Payload writes a `payload-locked-documents`
  row (document, user) and refreshes it while the form is open (expiry 300 s by default). The REST endpoints pass
  `overrideLock ?? false`, so another user's PATCH or DELETE gets **HTTP 423** "Document with ID n is currently
  locked by another user and cannot be updated." (core `checkDocumentLockStatus.ts:61-97`). The lock row is
  deleted on any write that is allowed through (`:99-104`), including an override.
- **No version precondition.** Payload has no ETag / If-Match / expected-version check on update or delete
  (searched core `collections/operations/update*.ts`, `endpoints/`). `updatedAt` is the only version marker.

## The vendor build (3.93.0) gives the agent no signal

- `update<Collection>` defaults `overrideLock` to true (`resource/update.ts:32`, schema `:297-301`), and
  `delete<Collection>` never passes it (Local API default true). So the write goes through editor-b's lock, and the
  lock row is removed (exploratory: 3/3; measured: E1, E2).
- Even with `overrideLock: false` the refusal is plain text, `isError` unset, with no lock holder and no version
  ("Error updating resource in collection "posts": Document with ID 2 is currently locked by another user…").
- Expected classification on the vendor build: **`no_signal`** in every seeded-conflict run (H9). Expected harm:
  editor-b's open form later saves over the agent's change, and the agent has already told the user "done".

## The research build: a usable conflict

1. **Locks respected by default** (REST parity): `overrideLock` default false on update; delete takes
   `overrideLock` (default false) and passes it. The schema text says what a lock means and that true takes over
   another person's editing session.
2. **Conflict answer** (`helpers/writeSafety.ts`): `isError: true`, and a text that starts `Conflict:` and carries
   - who holds the lock (the user's email or id) and when the lock was last refreshed,
   - the document's current `updatedAt`,
   - that nothing was applied,
   - the next step: re-read with `find<Collection>`, re-apply only your own change to the current version, pass
     `ifUpdatedAt`; if it is still locked, tell the user who is editing it; never `overrideLock` unless the user
     asked to take over,
   - the same facts as one JSON object on the last line (no structuredContent copy: no duplicated tokens).
3. **Stale-write precondition** `ifUpdatedAt` (update and delete by id): the tool reads the current `updatedAt`
   first and refuses with `Conflict: … changed since you read it (you sent X; it is now Y)` and the same re-read
   instruction. Best-effort: read-then-write in two steps, not atomic (stated in the design note); a true
   compare-and-set needs core support (`updatedAt` in the update's where, or a version column).
4. **Server instructions** (default, when the app sets none) state the write contract in six lines, so the agent
   knows to pass `ifUpdatedAt` before it ever meets a conflict.

## The seeded-conflict jobs (native agent through the Claude Agent SDK, MCP tools only)

The rule: the other writer acts **after the agent's read and before its write** (seed = an `on_call`
during hook on the read). So every seed here fires on the agent's first `findPosts`.

| Job | Seed state | Seed hook (`on_call: {tool: findPosts, nth: 1}`) | Pass | What a good agent does |
|---|---|---|---|---|
| A4 (benchmark, both builds) | no lock | `b-adds`: editor-b adds Garlic and is done | Peas and Garlic both present, originals kept | vendor build: nothing tells it; research build: the write is refused as stale (read-version precondition or `ifUpdatedAt`), it re-reads and re-applies |
| U9 (usability session) | no lock | `b-adds`: editor-b adds Wormery to Compost basics | Leaf mould and Wormery both present | same as A4 |
| U8 (usability session, a conflict-recovery job) | editor-b holds a fresh lock on the tool-library post (setup) | `b-saves`: she saves her form (adds Wheelbarrow) and keeps editing (lock refreshed) | Wheelbarrow and her lock kept; Loppers landed, or the answer says the post is being edited | vendor build: nothing tells it, and its write takes over her lock and drops her row; research build: refused with the lock holder; it should not take over, and should tell the user |

Classes (the agent driver's `conflict-rules@1`, first match wins): `no_signal`, `false_success`, `force_overwrite`,
`reread_reapplied_success`, `blind_retry_stale`, `gave_up_reported_failure`; inconclusive when the seed did not fire,
the seed raced the write, or the conflict was not exercised. The checker reports `{"conflict":
{other_change_survived, own_change_landed}}`. Our own pre-registered classes (`harness_conflict`: `no_signal`,
`reread_reapply`, `blind_retry`, `force`, `gave_up`, `false_success`, `other`) are kept as a cross-check.

**Conflict recovery rate** (benchmark report) = conclusive A4 runs the build signalled that ended
`reread_reapplied_success` ÷ conclusive signalled runs, per build, with the extra calls and response tokens of the
recovered runs. A build that never signals scores `no_signal`, not 0%.

Note on U8: with editor-b still editing at the end of the run, the right outcome is `gave_up_reported_failure`
with an honest answer naming her; the classifier scores that `not_recovered`. U8 measures whether the agent respects the
lock; A4 is the recovery-rate task.

The classifier was later revised twice (`conflict-rules@2`, then `@3`); the published results say which version
each table uses ([`../results/BENCHMARK.md`](../results/BENCHMARK.md)).
