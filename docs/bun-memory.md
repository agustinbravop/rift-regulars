# Homepage allocations and Bun production comparison

Measured 2026-11-25. No deployment changes; public domain remains
**riftregulars.agusbravo.dev**.

## Outcome

The homepage now reads tiny card sidecars instead of decompressing and validating
all nine public summaries on every request. Production uses official
`@sveltejs/adapter-bun` **1.0.2**, with Bun **1.4.5** pinned in package metadata.
Node **24.17.0** still runs tests and operator importers; dev/preview stay on Node.
`--smol` is measured, **not enabled by default**: it did not consistently reduce
peak RSS or improve throughput.

Under this synthetic workload, optimized Node homepage RSS was 111.8 MiB versus
219.3 MiB before optimization. The official Bun adapter's whole-run peak RSS was
154.1 MiB, versus optimized Node's 317.3 MiB. These are observations from one
bounded run per configuration, not a production memory budget.

## Publication and compatibility

- Completed imports and offline republish atomically replace the public gzip,
  then atomically write a small `card.json.gz` sidecar with resolved identity,
  platform, icon and match count. The existing private checkpoint and identity
  formats are unchanged. Aliases still resolve when public data is unavailable.
- Sidecars contain version/account/year validation and a public-file stamp:
  device, inode, byte size, nanosecond mtime and ctime. Homepage reads check the
  stamp before and after reading metadata. There is no parsed-profile cache.
- Missing, corrupt, wrong-year, malformed or stale sidecars use the existing full
  validated profile reader. A missing/corrupt public file stays unavailable,
  rather than trusting an old card or attempting Riot access.
- Legacy snapshots require no immediate migration. For the fast path, run the
  documented offline `republishFeatured(id)` command once per completed account.
  It reads private checkpoints and queue labels without Riot requests. Incomplete
  or failed imports do not replace the last successful public snapshot/card.
- A failed optional sidecar write does not turn an already successful public
  commit into a failed import: legacy validation remains available. The next
  republish can restore the fast path. Both files use private permissions and
  temporary-file sync/rename/cleanup through the existing writer.
- Snapshot/card replacement is deliberately not a two-file transaction. During
  the gap, a mismatched sidecar falls back to public validation. A request racing
  publication can show the preceding valid generation. Copy/restore/move may
  change the stamp; republish afterwards. Year-specific filenames prevent
  previous-year cards becoming available in January.
- Filesystem identity is not a cryptographic integrity check. Ordinary writes,
  replacement, deletion and truncation invalidate it; silent storage corruption
  that leaves all stat fields unchanged is not detected by the fast path.
  Published files are operator-owned, not writable by visitors. Do not modify
  them concurrently outside the importer lock. Full profile requests still
  decompress and validate the public envelope.

## Method

Linux x64, WSL2 `6.6.87.2-microsoft-standard-WSL2`, Intel i9-14900HX,
eight visible logical CPUs. Node 24.17.0, isolated Bun 1.4.5, SvelteKit 3.4.0,
Vite 8.3.8, Svelte 5.59.0. Node adapter 6.0.5; official Bun adapter 1.0.2.
Bun was downloaded into `/tmp/opencode/rift-bun-1.4.5`; global Bun was not changed.

Baseline is commit `849acc2`'s Node-adapter production build, before metadata.
Optimized Node output uses the same dependency versions and current featured
implementation, with adapter-node temporarily loaded from isolated benchmark
tooling, not retained as an application dependency. Both Node-adapter outputs
were built under Node; official adapter output was built under Bun.

The benchmark creates nine synthetic current-year private histories in a fresh
temporary cwd and uses the real offline publication path. Accounts have
320, 380, 440, 500, 560, 620, 680, 740 and 800 games, with ten participants/game
and a rotating pool of 150 recurring opponents. All eight configurations read
the **same files**, not regenerated fixtures per runtime.

- Public envelopes total **7,626,825 bytes (7.27 MiB)** uncompressed and
  **173,429 bytes** gzip; largest profile is **1,203,945 bytes** uncompressed.
  This is representative in scale, slightly smaller than the plan's 8.36 MiB
  real-data estimate; highly repetitive synthetic fixtures compress unusually well.
- Nine card sidecars total **1,649 bytes gzip** in the recorded run. Stat stamps
  and timestamps can change compressed lengths slightly between runs.
- Each production process gets an ephemeral localhost port and a clean environment
  with an empty Riot key. A preload forbids outbound `fetch`; it would fail the
  run if the application attempted one. No `.env` or imported data is read/copied.
- One server at a time; no check/test/build was run concurrently with the final
  recorded benchmark. Readiness requests a static favicon, followed by one second
  idle. Smoke checks cover homepage SSR and synthetic identity, a referenced
  immutable asset, largest-profile SSR, and a same-origin no-key API request.
- Ordered phases: 40 sequential homepage requests; ten largest-profile requests;
  24 homepage requests at concurrency four; eight profile requests at concurrency
  four; three seconds post-load idle. Smoke adds one homepage and one profile
  request before their respective phases. Clients consume the full response.
- `/proc/PID/status` supplies process RSS and kernel high-water RSS. A 20 ms sampler
  separately records observed peak RSS. Phase RSS is an endpoint sample, not a
  phase-specific peak. Later phases inherit earlier allocation/GC history.
- Each server has a 90-second hard bound; requests have a 15-second bound.
  `finally` kills/reaps failed children and removes synthetic fixtures. Parent
  SIGINT/SIGTERM handlers kill the active child and remove fixtures too.
- All eight runs passed smoke assertions and exited **code 0 on SIGTERM** within
  five seconds after load. No benchmark server remained running.

Docker's executable resolves to a Windows/WSL shim, but `docker info` fails because
Docker Desktop WSL integration is unavailable. **No container metrics were
collected. RSS is not container memory.** Image size was not measured and is not
used as a RAM claim.

## Results

All memory values are **MiB**. HWM is the kernel's whole-process high-water RSS;
the last column is the independent 20 ms sampled RSS peak.

| Build / runtime | Idle | After home | After profile | After concurrent home | After concurrent profile | Post-load | HWM | Sampled peak |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Baseline Node adapter / Node | 78.9 | 219.3 | 280.0 | 352.6 | 368.5 | 368.5 | 375.1 | 369.3 |
| Baseline Node adapter / Bun | 45.5 | 117.0 | 156.9 | 143.3 | 149.7 | 90.2 | 169.2 | 168.1 |
| Baseline Node adapter / Bun smol | 45.9 | 123.1 | 154.8 | 145.8 | 147.3 | 82.5 | 167.3 | 167.3 |
| Optimized Node adapter / Node | 79.0 | 111.8 | 283.8 | 284.9 | 314.4 | 314.4 | 317.3 | 317.3 |
| Optimized Node adapter / Bun | 45.9 | 81.5 | 155.0 | 139.7 | 148.4 | 87.8 | 165.2 | 165.0 |
| Optimized Node adapter / Bun smol | 45.6 | 81.0 | 151.3 | 143.9 | 158.7 | 83.4 | 161.1 | 160.6 |
| Official Bun adapter / Bun | 40.1 | 78.9 | 140.4 | 130.8 | 151.1 | 83.3 | 154.1 | 154.0 |
| Official Bun adapter / Bun smol | 41.6 | 76.4 | 134.3 | 132.6 | 144.1 | 84.0 | 156.0 | 156.0 |

Total phase duration in **milliseconds**, rounded; not per-request latency:

| Build / runtime | Home ×40 | Profile ×10 | Home ×24 / c4 | Profile ×8 / c4 |
| --- | ---: | ---: | ---: | ---: |
| Baseline Node adapter / Node | 2963 | 1080 | 1564 | 759 |
| Baseline Node adapter / Bun | 2091 | 945 | 1147 | 543 |
| Baseline Node adapter / Bun smol | 2229 | 836 | 1070 | 582 |
| Optimized Node adapter / Node | 333 | 1232 | 144 | 801 |
| Optimized Node adapter / Bun | 269 | 888 | 74 | 545 |
| Optimized Node adapter / Bun smol | 254 | 834 | 70 | 546 |
| Official Bun adapter / Bun | 218 | 763 | 62 | 495 |
| Official Bun adapter / Bun smol | 267 | 879 | 72 | 643 |

Raw byte counts, unrounded durations, per-phase HWM, fixture sizes and exit results
are in [`bun-memory-results.json`](bun-memory-results.json).

The homepage change removes its dominant repeated parsing work, but does not
remove large-profile SSR allocations. Normal Bun retains less RSS after load
here, without proving a production savings percentage or a maximum safe memory
limit. Filesystem caches, JIT/GC, run order, highly repetitive fixtures and WSL
scheduling all affect these single-run numbers. There are no real Riot calls,
browser hydration/asset bursts, long-running soak, real-key queue waits,
in-flight shutdown tests, proxy tests or deployment measurements.

## Reproduce

Use Node 24.17.0 and an isolated pinned Bun 1.4.5. For Linux x64, acquisition used:

```sh
mkdir -p /tmp/opencode/rift-bun-1.4.5
curl -fsSL https://registry.npmjs.org/@oven/bun-linux-x64/-/bun-linux-x64-1.4.5.tgz \
  | tar -xz -C /tmp/opencode/rift-bun-1.4.5
export PATH="/tmp/opencode/rift-bun-1.4.5/package/bin:$PATH"
bun --version
```

Build comparisons in disposable worktrees, starting from the completed commit.
Never copy `.env` or `data/` into them. These commands do not start servers:

```sh
here=$PWD
scratch=$(mktemp -d /tmp/opencode/rift-reproduce.XXXXXX)
git worktree add --detach "$scratch/baseline" 849acc2
git worktree add --detach "$scratch/optimized" HEAD
(cd "$scratch/baseline" && bun install --frozen-lockfile && bun run build)
(cd "$scratch/optimized" && bun install --frozen-lockfile &&
  bun remove @sveltejs/adapter-bun &&
  bun add --dev --exact @sveltejs/adapter-node@6.0.5 &&
  bun -e 'const p="vite.config.ts"; await Bun.write(p,(await Bun.file(p).text()).replace("@sveltejs/adapter-bun","@sveltejs/adapter-node"));' &&
  node node_modules/vite/bin/vite.js build)
bun install --frozen-lockfile
bun run check
bun run test
bun run build
node scripts/benchmark-memory.ts "$scratch/results.json" "$(command -v bun)" \
  "$scratch/baseline/build" "$scratch/optimized/build" "$here/build"
```

Only the final command starts bounded production children, on unused ephemeral
ports, never the normal 8765 listener. Run it alone for less timing interference.
The optimized scratch worktree deliberately has package/config edits; review and
remove the disposable worktrees afterwards. Adapter-node is absent from the final
app's dependencies/lockfile.

## Verification and issues encountered

- Final `bun run check`: **0 errors, 0 warnings**.
- Final `bun run test`: **112 passed, 0 failed**, Node test runner.
- Final `bun run build`: **exit 0**, official adapter under isolated Bun 1.4.5.
- New synthetic tests verify atomic publication, fast-path avoidance of summary
  JSON parsing, legacy/corrupt/malformed/stale metadata fallback, changed snapshots,
  missing/corrupt public data, alias preservation, year rollover, refresh,
  failed-import retention and optional-sidecar-write failure cleanup.
- A subprocess test verifies local preload forces localhost:8765 and removes
  inherited `SOCKET_PATH`, without opening that port.
- Official production builds succeeded. The historical Bun Vite **dev** SSR
  prebundle failure was not retested; no dev server was started.
- A static TypeScript import of the adapter initially introduced Bun's required
  `fetch.preconnect` namespace into existing Node/browser mocks (22 check errors).
  Loading the same official package dynamically in Vite config avoids global
  type pollution without changing unrelated tests or suppressing diagnostics.
- Initial benchmark smoke code incorrectly concatenated a relative asset URL and
  expected a 503 for a missing key. URL resolution was corrected; the existing
  proxy intentionally returns **400** with visitor-safe temporary-unavailability
  text for an empty key. No API behavior was changed. Subsequent runs passed.
- No secrets/imported data, player-page edits, homelab changes, deployment, push,
  shared server changes or main-plan index changes are part of this work.
