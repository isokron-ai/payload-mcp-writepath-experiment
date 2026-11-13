> **Payload MCP plugin write-path experiment (unofficial).** An independent research build by
> [IsoKron](https://isokron.ai) based on `@payloadcms/plugin-mcp` 3.93.0 from
> [payloadcms/payload](https://github.com/payloadcms/payload) (commit `77425c50`), with 7 commits that change how its
> collection tools write. It is not affiliated with or endorsed by Payload CMS, Inc. and is not a supported
> distribution. On five pre-registered editing tasks, research build v1 completed 28 of 29 runs against 11 of 29 for
> the unmodified plugin (Claude Opus 5.5 and a capture-off observer arm). The later v2 lost another editor's change in
> 6 of 9 conflict runs; v2.1 fixes that and kept the other editor's change in 15 of 15 agent conflict runs while
> keeping v2's batching. Read [EXPERIMENT.md](EXPERIMENT.md) first;
> the findings are in [FINDINGS.md](FINDINGS.md).

# payload-mcp-writepath-experiment

Payload's MCP plugin at tag `v3.93.0`, with seven commits in three research builds (v1, v2, v2.1), and the harness and
results of the measurements.

    packages/plugin-mcp/      upstream at v3.93.0 + the 7 experiment commits (research v2.1)
    patches/                  the same commits as a patch series (git am)
    EXPERIMENT.md             what this is, the builds, what it changes, what it measured, how to rebuild
    CHANGES-EXPERIMENT.md     every commit, its patch, files and what it addresses
    FINDINGS.md               the findings register and the upstream items
    results/BENCHMARK.md      vendor 3.93.0 vs research v1, corrected 13 Nov 2026
    results/BATCHING-FIX.md   research v2 and v2.1: batching restored, a v2 regression, the v2.1 fix (probes and agents)
    harness/                  loopback sandbox (Payload 3.93.0 app, Postgres compose), tasks, checkers, probes
    harness/build/build.sh    check the upstream import and the patch series; rebuild the measured builds
    LICENSE.md, NOTICE        Payload's MIT licence; attribution
    SECURITY.md, SUPPORT.md   how to report problems; no support offered

Tags: `upstream-v3.93.0` (upstream, unmodified), `research-v1-v3.93.0`, `research-v2-v3.93.0`,
`research-v2.1-v3.93.0`.

## Rebuild and check (no database, no API key)

Needs git, bash and Node 22 or later.

```sh
harness/build/build.sh check-upstream   # the upstream tag == payloadcms/payload v3.93.0
harness/build/build.sh check-patches    # patches/ on the upstream tag == the v1, v2, v2.1 tags and main
harness/build/build.sh transpile        # the 7 changed files of each build, transpiled, == the measured builds (sha256)
```

## Run the builds

Needs Docker, pnpm and Node 22 or later. Everything listens on 127.0.0.1 only. Full steps, including the secrets files
the scripts expect: [harness/README.md](harness/README.md).

```sh
cd harness/app && pnpm install --frozen-lockfile && cd ../..
harness/build/build.sh app research                 # harness/build/app-research with research v1
harness/sandbox/up.sh                               # Postgres 17.6 on 127.0.0.1:55493
MCP_BUILD=baseline harness/sandbox/serve.sh         # vendor plugin on 127.0.0.1:3093
MCP_BUILD=research harness/sandbox/serve.sh         # research v1 on 127.0.0.1:3094 (another terminal)
node harness/sandbox/seed.mjs                       # reset to the seed before every run
```

`build.sh app research-v2` and `app research-v2-1` build the later versions (ports 3095 and 3096). Then point any MCP
client at `http://127.0.0.1:<port>/api/mcp` with the seeded MCP key, give it a prompt from `harness/harness/prompts/`,
and grade the end state with `node harness/harness/check.mjs <task> --run-dir <dir> --answer <file>`.
