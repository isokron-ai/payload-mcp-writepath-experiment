# Prompt-versus-description check, the v2.1 agent series (v1 vs v2.1)

Generated before the freeze by a script in IsoKron's audit record (not public). The prompt is what the agent gets;
the pre-registered text is the task table frozen in earlier series (`bench/TASKS-A.md` in -explore and -bench,
`bench/TASKS-B.md` in -bench). "Steering words" scans the prompt for words that would push the agent towards or
away from one bulk call (the property this series measures). None may appear.

| Task | Prompt (harness/prompts) | Pre-registered text | Prompt sha256 (16) | Last change | Steering words | Match |
|---|---|---|---|---|---|---|
| U11 | Earlier today some scratch records were created by mistake: tasks owned by 'Assistant' and marketplace listings whose SKU starts with 'TMP-'. Please delete all of them, and only them, and confirm what was removed. | delete scratch records, keep a look-alike | `82f36f64e1978b3f` | c1c2fd6 2026-11-12T23:18:58-07:00 | none | yes: the same job; "and only them" is what the look-alike tests |
| A5 | Please delete the tasks that are owned by Mara and already done. Nothing else. | Delete the tasks owned by Mara that are done | `eb10e557d4b2452f` | c1c2fd6 2026-11-12T23:18:58-07:00 | none | yes: same scope (Mara, done), "Nothing else" adds no method |
| A3 | Please mark every task that is currently 'doing' as done, and tell me if any of them couldn't be changed. | Mark every 'doing' task as done; say if any could not be changed | `2cb1deb2d64245c5` | 7f4ba27 2026-11-13T00:28:28-07:00 | none | yes: word for word in substance (the -bench correction stands) |
| A4 | Please add an item 'Peas' linking to /plants/pea to the Spring planting guide post, after the existing items. | Add a 'Peas' item to the Spring planting guide | `8f88fd48cb0122f2` | c1c2fd6 2026-11-12T23:18:58-07:00 | none | yes: same row, same post; the conflict is seeded by the harness, not the prompt |
| U9 | Please add an item 'Leaf mould' linking to /compost/leaf-mould to the Compost basics post, after the existing items. | add a row; editor-b adds hers after the agent's read | `047d89e2d8293e5e` | f618103 2026-11-12T23:38:15-07:00 | none | yes: the row; editor-b's row is seeded by the harness, not the prompt |
| U8 | Please add a link item 'Loppers' pointing to /tools/loppers to the Members-only tool library post, after the existing items. | add a row while editor-b keeps the post open | `2bcc91d871238a30` | c1c2fd6 2026-11-12T23:18:58-07:00 | none | yes: the row; editor-b's save and her open lock are seeded by the harness, not the prompt |

Steering words found: none.
