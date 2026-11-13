# Tables, the v2.1 agent series (v1 vs v2.1)

Per task and build, 5 runs each. "Plan usage estimate" is the per-run `estimated_cost_usd` the Claude Agent SDK reports, summed over the 5 runs. Per-run data: [runs-v2-1.csv](runs-v2-1.csv).

| Task | Build | Runs | Checker pass | Batching one pass | Tool calls p50 (min-max) | Write calls p50 | Tokens p50 (min-max) | Plan usage estimate, USD (estimated_cost_usd) | Runs with ifUpdatedAt | Runs whose first find used select | Other editor's change kept | Conflict classes (conflict-rules@3) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| U11 | research-v2.1 | 5 | 5/5 | 10/10 | 4 (4-4) | 2 | 44703 (44668-44880) | 0.2969 | 0 | 0 |  |  |
| U11 | research-v1 | 5 | 5/5 | 0/10 | 8 (8-8) | 6 | 44392 (44326-44586) | 0.3794 | 5 | 0 |  |  |
| A5 | research-v2.1 | 5 | 5/5 | 5/5 | 2 (2-2) | 1 | 43492 (43474-43514) | 0.2392 | 0 | 0 |  |  |
| A5 | research-v1 | 5 | 5/5 | 0/5 | 3 (3-3) | 2 | 41844 (41720-44572) | 0.2645 | 5 | 0 |  |  |
| A3 | research-v2.1 | 5 | 5/5 | 5/5 | 2 (2-2) | 1 | 43704 (43656-43739) | 0.2575 | 0 | 0 |  |  |
| A3 | research-v1 | 5 | 5/5 | 5/5 | 2 (2-2) | 1 | 41877 (41818-41897) | 0.2485 | 0 | 0 |  |  |
| A4 | research-v2.1 | 5 | 5/5 | 0/0 | 3 (3-3) | 2 | 59774 (59310-59790) | 0.335 | 5 | 2 | 5/5 | reread_reapplied_success 5 |
| A4 | research-v1 | 5 | 5/5 | 0/0 | 3 (3-3) | 2 | 57545 (57077-58195) | 0.3439 | 5 | 3 | 5/5 | reread_reapplied_success 5 |
| U9 | research-v2.1 | 5 | 5/5 | 0/0 | 3 (3-3) | 2 | 58594 (58404-58676) | 0.3057 | 5 | 3 | 5/5 | reread_reapplied_success 5 |
| U9 | research-v1 | 5 | 5/5 | 0/0 | 3 (3-3) | 2 | 56215 (56190-56438) | 0.3031 | 5 | 3 | 5/5 | reread_reapplied_success 5 |
| U8 | research-v2.1 | 5 | 5/5 | 0/0 | 5 (5-5) | 3 | 93477 (93110-93688) | 0.5554 | 5 | 2 | 5/5 | conflict_persisted 5 |
| U8 | research-v1 | 5 | 5/5 | 0/0 | 5 (5-5) | 3 | 89784 (89702-89950) | 0.4759 | 5 | 5 | 5/5 | conflict_persisted 5 |

| Task | Build | conflict-rules@4 (reclassified) |
|---|---|---|
| A4 | research-v2.1 | reread_reapplied_success 5 |
| A4 | research-v1 | reread_reapplied_success 5 |
| U9 | research-v2.1 | reread_reapplied_success 5 |
| U9 | research-v1 | reread_reapplied_success 5 |
| U8 | research-v2.1 | conflict_persisted 5 |
| U8 | research-v1 | conflict_persisted 5 |

| Task | Build | Claim (claim-rules@1, recorded) | Claim (claim-rules@2, reclassified) | Runs |
|---|---|---|---|---|
| U11 | research-v1 | unclear | done_claimed | 5 |
| U11 | research-v2.1 | unclear | done_claimed | 5 |
| A5 | research-v1 | done_claimed | done_claimed | 5 |
| A5 | research-v2.1 | done_claimed | done_claimed | 5 |
| A3 | research-v1 | failure_reported | failure_reported | 5 |
| A3 | research-v2.1 | failure_reported | failure_reported | 5 |
| A4 | research-v1 | unclear | done_claimed | 5 |
| A4 | research-v2.1 | unclear | done_claimed | 5 |
| U9 | research-v1 | unclear | done_claimed | 5 |
| U9 | research-v2.1 | unclear | done_claimed | 5 |
| U8 | research-v1 | failure_reported | failure_reported | 5 |
| U8 | research-v2.1 | failure_reported | failure_reported | 5 |

Plan usage estimate over all 60 runs: 4.0051 USD.
