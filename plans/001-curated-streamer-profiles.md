# Plan 001: Publish compact, shared streamer profiles

## Status

- Priority: P1
- Effort: M
- Risk: MED — new persistence and an alternate dashboard data source
- Depends on: live Riot identity validation before import; user selection of any additional accounts
- Category: direction
- Planned at: commit `8f9c588`, 2026-11-23, including existing uncommitted work

## Executor instructions and drift check

Read this plan fully before editing. Preserve all existing user changes. Run
`git status --short` and compare the current files against the excerpts below.
HEAD alone is not a complete baseline: at planning time DESIGN.md, PRODUCT.md,
README.md, bun.lock, package.json, browser-cache.ts, +layout.svelte, +page.svelte,
layout.css, and the player page were modified; PlayerSearch.svelte was untracked.
Do not revert or overwrite those changes. Do not commit, merge, push, run a live
import, or start/stop a server without permission.

## Why

The user wants nine curated streamer accounts on the landing page,
opening shared preloaded histories without each visitor scanning Riot again.
Keep only fields the product consumes. Existing Agus Brr data measured 51.73 MB
raw, 584 KB for a complete compact history gzipped, and 86 KB for its derived
dashboard summary gzipped. Those are sample sizes, not limits or browser usage.

## Initial accounts selected by the user

Researched using public trackers on 2026-11-23; not yet resolved through Riot or
imported. Use these three initially, not invented placeholders:

| Display label | Riot ID | Platform | Source |
|---|---|---|---|
| Agurin | `NAgurin#EU1` | `NA1` | https://op.gg/lol/summoners/na/NAgurin-EU1 and https://trackdiff.com/s/na1/NAgurin-EU1 |
| Thebausffs | `Thebausffs#COOL` | `EUW1` | https://op.gg/lol/summoners/euw/Thebausffs-COOL and https://lolpros.gg/player/thebausffs |
| Drututt | `Drututt#MAKS` | `EUW1` | https://op.gg/lol/summoners/euw/Drututt-MAKS and https://lolpros.gg/player/drututt |

The user requested twenty additional streamer suggestions, not their automatic
addition. Only add further accounts after selection and identity research.

## Current state

- `src/lib/history.ts:35–53`: `compactMatch` projects matches to required fields,
  retaining every participant, including one-off encounters needed by later refreshes.
- `src/lib/import-history.ts:7–45`: browser-independent `importHistory(history,
  api, publish)` lists the current year and downloads missing details, checkpointing
  every ten downloads. Empty records are excluded and retried on refresh.
- `src/lib/server/history.ts:13–50`: validated Riot proxy using one process-wide
  queue/limiter; returns compact match records. It has no persistent shared cache.
- `src/lib/server/storage.ts:12–16`: atomic JSON write via temporary file and rename.
- `src/lib/browser-cache.ts:69–78`: IndexedDB snapshot keyed by platform/year/PUUID.
- `src/routes/player/[riotId]/+page.server.ts` currently returns:

  ```ts
  setHeaders({ 'cache-control': 'no-store' });
  return { summary: null, error: null };
  ```

- `src/routes/player/[riotId]/+page.svelte:95–98` always calls `openPlayer()` on
  mount. `displayHistory` derives the summary; header icons, premade storage keys,
  excluded-record display, and Refresh currently depend on browser History.
- `src/routes/+page.svelte:22–27` is a centered hero containing `PlayerSearch`.
- `scripts/fetch.ts` is a separate legacy importer hardcoded to Agus Brr/LAS,
  writing full match JSON. Do not silently migrate, delete, or overwrite its files.
- `tests/history.test.ts` uses node:test/assert with synthetic APIs. Importer tests
  use temporary directories, not the user's saved data.

## Boundaries and conventions

Use Bun commands, TypeScript, Svelte 5, existing component/style conventions.
PRODUCT.md says “Keep names from match data without extra Riot ID lookups.”
DESIGN.md specifies the existing charcoal/blue theme, Public Sans, accessible
controls, and “No additional marketing sections.” Add a restrained useful list
of featured accounts below the search, not a landing-page redesign. Reuse owned
shadcn-svelte Button/Badge and SummonerPortrait components.

In scope:
- New curated account configuration, e.g. `src/lib/featured-players.ts`.
- New private compressed store/importer modules under `src/lib/server/`.
- New `scripts/fetch-featured.ts` and package command.
- Existing shared history/import/types/validation helpers only as needed.
- Landing server loader and landing page.
- Existing player server loader and player page.
- Scoped styles, tests, README.md, PRODUCT.md, DESIGN.md.

Out of scope:
- Database, Redis, auth system, public import jobs, unrestricted server refresh API.
- Cross-streamer normalized participant tables, custom binary formats, new dependencies.
- Replacing personal lookups or deleting/migrating existing browser/legacy caches.
- Starting/stopping the app, Playwright, real Riot calls, deployment or key changes.

## Steps

### 1. Define the curated identities and public profile contract

Use the three user-selected accounts above; validate their resolved identities
through Riot before a real import. Request or research exact IDs/platforms for
any further user-selected streamers. Do not guess Talaxi's tag/server. An empty
typed configuration is acceptable for tests; never publish fake cards or claim
histories are preloaded.

Reuse the existing player URLs and server labels. Define a public profile envelope
with Summary, resolved Account, platform/year, tracked-player icon, excluded IDs
when relevant, and actual import timestamp. Keep manual premade preferences local,
using the same platform/PUUID key as personal history.

Verify: `bun run test` passes with new config validation tests for duplicate
identities, invalid server/ID, and an empty configuration.

### 2. Add compact compressed persistence and an operator-only importer

Store under ignored `data/featured/`, outside `static/`. Derive filenames only
from validated configuration IDs and year, never arbitrary request paths.
Keep one gzip-compressed compact History and one gzip-compressed public profile
per account/year. Use node:zlib; atomic temporary-file-plus-rename writes. Do not
retain raw responses or duplicate uncompressed snapshots. Persist source history
at checkpoints, but publish a new public profile only after successful completion;
failed refreshes preserve the last good public profile.

Reuse importHistory and the validated historyRequest path for one sequential
operator command (`bun run fetch:featured`), using RIOT_API_KEY server-side.
Install a command-level exclusive lock so overlapping scheduled runs cannot
overwrite snapshots; release it on errors/signals. Document safe stale-lock
recovery, and that all API-key users/processes still need coordinated quotas.
Do not implement a background scheduler in the web server; document a cron example.

On read validate saved data, account/platform/year identity, and match uniqueness.
On write compact/project records again so unknown fields cannot persist from a
legacy or future upstream response. Keep all required participant fields and all
one-off participants. Reject custom queue 0 at the publication/import boundary;
track excluded IDs explicitly so they neither block completion nor leak custom
history into output. Preserve empty-record retry behavior.

Verification: `bun run test` passes synthetic multi-account first-import,
incremental refresh, interrupted resume, concurrent command rejection, corrupt
snapshot, missing snapshot, atomic publication failure, year rollover, exclusion,
and unknown-attribute stripping tests. Assert persisted files decompress/validate
and dashboard output matches the equivalent allowed raw fixtures.

### 3. Serve the public profiles without exposing source histories

Extend the existing player server loader to resolve only configured profiles.
Read the validated public snapshot, not private matches. A configured profile
with no current-year successful import must show an honest unavailable state,
not start a visitor-driven Riot scan. Non-curated players retain today's behavior.

Use server-rendered public profile data with the existing dashboard first.
Configure production HTML/SvelteKit data-response compression through the supported
adapter/proxy path and document verification; a compressed disk file alone does
not imply compressed network transfer. Apply appropriate bounded HTTP cache headers
for curated responses and preserve no-store for personal flows. Never cache
browser-local premade preferences into public responses.

Adapt onMount so curated profiles do not call openPlayer/readHistory/writeHistory
or /api/history. Resolve header icon, account identity, premade keys and excluded
records from the public envelope. Reuse all roster/detail/filter logic. Hide the
Riot Refresh action for curated profiles; display the real publication timestamp.
Do not claim a reread is a Riot refresh.

Verification: `bun run check` and `bun run test` pass. Add tests proving configured
profile loads make zero upstream calls, arbitrary IDs cannot access private files,
missing/corrupt profiles do not start scans, and ordinary personal lookups retain
their current path. Include correct server/year and premade-key cases.

### 4. Add the landing list and operational documentation

Landing server loader returns a small curated index, never whole summaries.
Show configured accounts with display identity/server, saved profile icon when
available, and usable links only for available snapshots. Unimported accounts
have an honest unavailable state. Keep keyboard navigation, mobile wrapping,
existing search and recent-history functionality.

Update PRODUCT.md/DESIGN.md for this explicitly requested shared-profile exception
to browser-only storage. README documents config, import command, cron scheduling,
compressed storage layout, atomic recovery, required persistent disk, backups,
single importer/key coordination, and Riot production approval for public release.
Make clear the personal proxy still needs abuse controls before unrestricted
public deployment; this feature alone does not harden it.

Verify: `bun run check`, `bun run test`, `bun run build` all exit 0. User reviews
the live UI in Brave; do not start the server or invoke Playwright.

## Done criteria

- [ ] Existing personal histories/search and all prior tests still work.
- [ ] Curated landing links load precomputed dashboards without Riot requests.
- [ ] Public results contain current UI details, accurate dates and identity.
- [ ] Private source retains single encounters but no unused upstream attributes.
- [ ] Only compressed source/public snapshots are persisted for this feature.
- [ ] Failed imports cannot overwrite a valid public profile or legacy/browser data.
- [ ] New boundary, persistence, refresh/resume and curated-load tests pass.
- [ ] `bun run check`, `bun run test`, `bun run build` exit 0.
- [ ] No dependency or out-of-scope source changes; user changes preserved.
- [ ] Plans index status updated after independent review, not merely after coding.

## STOP conditions

- User identities are needed for real configuration/import but have not been supplied.
- In-scope code differs materially from these excerpts or user edits conflict.
- A real API call, key change, server restart, source-data deletion or deployment
  becomes necessary: request explicit permission.
- A proposed solution needs a database, public job endpoint, unrelated refactor,
  or changes outside the stated scope.
- Verification fails twice after a reasonable repair attempt.

## Maintenance

Changing what the UI consumes requires updating compaction, validation and tests
together. Old snapshots cannot reconstruct discarded fields; expanding features
may require reimporting while Riot still retains the matches. Historical names,
Arena squads, unknown outcomes and remake semantics must not be simplified away.
At nine accounts, per-account compressed snapshots are deliberate; reconsider
shared-match deduplication only when overlap/scale justifies it.
