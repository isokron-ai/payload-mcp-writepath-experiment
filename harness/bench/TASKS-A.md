# Benchmark task set A (PRE-REGISTERED; frozen with the explore series, before any change is designed)

Built from the live-baseline job and the static-analysis candidates. The prompts are in `harness/prompts/A*.md` (verbatim what the
agent gets); the done-checks are `harness/tasks.mjs` (REST as editor-a, never the agent's claim); every run starts
from `sandbox/seed.mjs` (state hash `adac08f9…`) plus the task's own setup. Checker readiness: before the freeze every checker
was tested on prepared states (an untouched state fails, a correct REST-made end state passes, named near-misses fail;
71 cases, 0 wrong).

| Task | Prompt (short) | Pass criterion | What it exercises |
|---|---|---|---|
| A1 | Get the 'Autumn plant swap' post live: new summary, add tag, add a 'Plant list' item after the existing ones, publish; add a task for Theo | post published, summary exact, tags event+saturday, items Venue map then Plant list, layout kept, exactly one task Theo/priority 2 | multi-part build across two collections, drafts, arrays (the live-baseline job) |
| A2 | Change the 'Tomatoes' item's link in the Spring planting guide | url changed; other rows unchanged; **es labels kept** (Tomates, Judías, Calabacines) | nested array edit in a localized post (#19435 cited) |
| A3 | Mark every 'doing' task as done; say if any could not be changed | 5 non-archived doing tasks done; nothing else changed; answer names the archived one | bulk with a partial failure |
| A4 | Add a 'Peas' item to the Spring planting guide | Peas and editor-b's Garlic both present, originals kept. editor-b adds Garlic (and is done: no lock left) right after the agent's first `findPosts` returns, so the agent's copy is stale when it writes | **concurrency: seeded stale-write conflict; conflict class by the driver's classifier (`conflict-rules@1`)** |
| A5 | Delete the tasks owned by Mara that are done | exactly 'Label beds' and 'Order seed potatoes' deleted | scoped destructive write (where) |
| A6 | Add a listing for the de-DE market, not a draft, slot 'none' | listing stored with locale de-DE, draft false, select 'none', name and price | fields named like operation arguments |

Conflict recovery (A4): the task has a `conflict` block in the driver's configuration (seed = the during hook `b-adds` on the agent's first
`findPosts`; write = `updatePosts`; read = `findPosts`). The checker reports `{"conflict": {other_change_survived,
own_change_landed}}`; the agent driver classifies the agent's next move from its own calls (`conflict-rules@1`:
`no_signal`, `reread_reapplied_success`, `blind_retry_stale`, `force_overwrite`, `gave_up_reported_failure`,
`false_success`; inconclusive when not exercised), and the benchmark report gives the conflict recovery rate per build.
Our checker's own classification (`harness_conflict`) is kept as a cross-check.
