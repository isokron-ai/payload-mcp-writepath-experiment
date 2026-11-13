# Benchmark task set B (FRICTION-DERIVED; favours the research build by construction)

Built after the usability session's change list (13 Nov 2026, 07:10 UTC) from the native session's failed or costly
jobs. The prompts are the native jobs' prompts unchanged (`harness/prompts/U*.md`);
the done-checks are the same checkers (`harness/tasks.mjs`). Reported separately from set A, never added to it.

| Task | From job | Friction / change | Pass criterion |
|---|---|---|---|
| U2 | nested edit, localized rows | B3 / C3 (row ids) | Inventory url changed, other row and es labels kept |
| U6 | three listings, one duplicate SKU, market en-GB | B4 / C4 (data argument) | two created with market en-GB, existing spade untouched, honest report |
| U8 | add a row while editor-b keeps the post open | B1 / C1 (locks, conflict answer) | her row and lock kept; Loppers landed or the answer names the lock; conflict class |
| U9 | add a row; editor-b adds hers after the agent's read | B2 / C2 (version precondition) | both rows; conflict class |
| U11 | delete scratch records, keep a look-alike | P1, A1 / C5, C6 (receipts, per-document bulk) | seed state plus the look-alike kept |
