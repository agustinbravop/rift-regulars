# Rift Regulars

Know the names you keep seeing on Summoner’s Rift.

League of Legends match-history tracker. Search a Riot ID; its active League server is detected automatically.

Built with SvelteKit, Svelte 5, TypeScript, shadcn-svelte, and Tailwind CSS v4.

## Run locally

Requires **Bun 1.4.5+** (pinned package manager: **1.4.5**) and **Node.js 24+**.

```bash
cd rift_regulars
bun install
bun run dev
```

Open **http://127.0.0.1:8765**.

Create a `.env` file containing your Riot development key:

```dotenv
RIOT_API_KEY=your-development-key
```

Enter **Player name#TAG** and click **Search** (or press Enter). The account and active server are checked before navigation; lookup errors appear below the input. Valid players open `/player/Name%23TAG`; the detected server is kept in navigation state and browser history, not the URL. The first scan has its own loading view, with listing/download progress, and automatically reveals the recurring-player table when complete. Keep the tab open during the scan; retry resumes missing downloads after an interruption. Partial saved history can also be viewed explicitly.

Opening a player link or recent entry with complete browser-cached history shows results without Riot requests. Personal searches in both landing and header rediscover the current server before navigating, even when history is cached. Featured accounts instead open a shared server snapshot, without Riot requests or browser imports. Incomplete personal caches resume in the scan view. **Refresh** lists personal history again and downloads only missing matches. The browser never receives the API key. Development keys expire; a 403 means the server owner must renew the key.

## Saved data and import behavior

- Match history is saved in this browser, separately for each account and calendar year. Cached matches from other servers are retained; existing per-server records are merged without deleting them.
- Personal web imports do not write match data to the server's filesystem. Featured operator imports use the separate `data/featured/` directory. Existing legacy files are untouched; `/api/data` returns 410.
- Requests Match-V5 history from the active server's regional host, from January 1 UTC through scan start. Previously cached matches remain even if Riot stops listing them. Legacy imports and detected transfers are re-listed before being considered complete.
- Progress is saved periodically. Closing the tab may lose the latest unsaved batch, not earlier saved progress.
- New imports exclude custom games (queue 0), empty and out-of-year records. Refresh retries excluded records in case usable details become available. Non-empty, in-year, non-custom matches missing the tracked player still stop the scan.
- All visitors share the Riot API quota. Imports respect Riot's rate limits, and the same account cannot be imported simultaneously in multiple tabs.
- Small refreshes can use available burst quota and are primarily network-bound. Large first scans still wait when a rate window fills; throughput depends on the key's advertised limits, network latency, retries, and other visitors. Listing still checks the full current year.
- Browser storage can be cleared or evicted. Another device, browser profile, or origin requires a new scan. Storage failures show a warning and retain results only in the current tab. Scanning requires HTTPS or localhost.
- Close older app tabs before scanning after this update. Premade marks carry across servers; conflicting saved marks show a warning rather than being overwritten.
- The legacy `bun run fetch` CLI still imports Agus Brr's LAS history into the original `data/` format, independently of browser caches. Do not run it concurrently with web scans or other apps sharing the key.

## Featured accounts (operator only)

Queue names are bundled in `src/lib/queue-names.json`, so existing snapshots and browser caches can display missing labels without reimporting matches. Refresh the public metadata with `bun run queues` (no Riot API key needed). This preserves previous names, merges nonblank CommunityDragon client names, then Riot's official names, then our friendly overrides. It atomically replaces each of the bundled map and local `data/queues.json` only after both downloads validate. Saved profile labels take precedence over the bundled fallback; unknown future IDs still display as `Queue [number]`. Some internal queues have no published name.

The landing carousel links to shared, precomputed current-year profiles at the normal `/player/Name%23TAG` URLs. Missing or corrupt snapshots show an unavailable state, never a visitor-triggered Riot import. The table retains local premade overrides using the same account PUUID keys as personal histories; featured match history is not copied into IndexedDB.

```bash
bun run featured --id agurin
bun run featured --id crownie --riot-id "Alex Mercer#LARP"
```

Run **one named account at a time**, sequentially. The nine entries in `src/lib/featured.ts` configure labels and verified Riot IDs; `--riot-id` overrides a configured ID. Discovery determines the active server without guessing from the tag. The command uses the shared `historyRequest` and limiter. Do not run it alongside another importer, browser scans, or another application using the key: quotas are process-local.

- Each command fetches Riot's public queue labels once, without credentials, with a ten-second timeout and validated `data/queues.json` fallback. Bundled names fill missing IDs, and friendly overrides apply last. Only labels for imported queues are saved. If the request fails and the local fallback is unavailable or invalid, the command stops without authenticated requests.
- `data/featured/<id>-<year>.private.json.gz` is a resumable compact history, retaining every participant, including singleton encounters. No raw full-match payloads are saved.
- `data/featured/<id>-<year>.public.json.gz` holds the resolved identity, platform, icon, exclusions, coverage and precomputed summary. Only this public envelope reaches visitors; private history files are not HTTP endpoints.
- A small `<id>-<year>.identity.json.gz` preserves resolved aliases, including `--riot-id` overrides, so missing or corrupt public snapshots never turn those names into visitor-triggered imports.
- A tiny atomic `<id>-<year>.card.json.gz` lets the homepage read identity, icon and availability without parsing full summaries. It is bound to the public file's device/inode, size and nanosecond modification/change times. Missing, corrupt or mismatched card metadata falls back to full validated public reads; missing/corrupt public data remains unavailable. Old snapshots work unchanged, but use the offline republish command below to gain the fast path. Moving/restoring snapshots can invalidate metadata; republish after restoring them. Do not edit published files in place.
- Both use atomic replacement with private filesystem permissions. Listing pages, ten-download batches, completion and handled failures checkpoint progress. Re-running re-lists the current host and downloads missing games, retaining previously downloaded platforms for the same PUUID.
- Only a completed import replaces the public snapshot. Failures retain the last successful snapshot. Corrupt checkpoints or a changed PUUID fail closed without overwriting data.
- JSONL progress includes account key, phase, listed/downloaded/excluded/remaining counts, compressed bytes and final completion counts.
- SIGINT/SIGTERM pause at the next request boundary and save completed work. A hard kill can lose the latest unsaved batch and leave `data/featured/import.lock`. Check the PID in that file and confirm the process is no longer running before removing that specific stale lock. The lock serializes all featured accounts, not only a single account.
- Data is current-year only; custom queue 0, empty and out-of-year records are excluded. Completion means all listed IDs were processed, not that Riot returned the entire year. There is no cross-region fanout.

To repair queue labels in an already completed import without any network calls, wait for its process to exit and run:

```bash
node --input-type=module -e 'import { republishFeatured } from "./src/lib/server/featured.ts"; await republishFeatured("agurin");'
```

This reads the existing `data/queues.json`, validates and compacts the private current-year checkpoint, and republishes its summary under the same global lock. It refuses incomplete, corrupt, or wrong-year histories and makes no account, listing or match requests.

## Interface

- Landing search remembers every successful lookup in this browser. Focusing the player input opens a scrollable, newest-first list, filtered by name or tag as you type. Entries show their server, open history on selection, and can be removed without deleting cached matches. Tab/arrow keys navigate the list; Escape closes it.
- Below search, a full-width static catalog centers two wrapping lists: Agurin, Thebausffs, Tyler1, Caedrel, Nemesis above Drututt, AloisNL, Dantes, Crownie. Cards use intrinsic content widths and 1.5rem gaps, without artificial row indentation. Each card places its 56px icon left of its single-line account name/tag; avatars elsewhere retain their existing sizes. A bright apricot streamer badge floats just above the name without moving the icon/name or widening the card. Game counts are currently hidden for visual review; availability still determines whether cards are links. Unimported cards are disabled without links or unavailable messages. Streamer badges appear only when the labels differ, ignoring case. There are no arrows, scrollbars, controls, duplicated cards or animation.
- Players encountered in at least two distinct games, combining teammates and opponents.
- Total encounters, teammate/opponent split, champions, last encounter, and your wins/losses with and against each player.
- One sortable match-history table across queues, with both players' champions, K/D/A, recorded roles, and results.
- Names and `#TAG` come from the latest saved match.
- Summoner icons beside names come from the latest saved game in the selected queue, without extra Riot API requests. Missing icons fall back to initials.
- Queue filters require at least two encounters within the selected queue. Teammate and opponent games remain together in player details; there is no relationship filter.
- Full-width sortable player list with expandable row details.
- The roster shows 50 players per page; expanded details initially show five matches, with Show all and Show less controls.
- Click column headers to sort by name, encounter count, played-with wins, played-against wins, last champion, or last seen. Click again to reverse direction. Record sorting prefers fewer losses on tied wins.
- “WR with” and “WR against” show your win/loss records, with unknown results labeled. Recent champions shows up to three distinct picks, newest first, within the selected queue.
- Remakes remain encounters and appear as “Remake” in detailed history, but do not count toward wins, losses, or win rates. Ordinary surrenders still count.
- Keyboard-operable filters, sorting, expandable rows, and pagination. Coverage details are below the table.
- Dark by default, with charcoal surfaces, blue selection, and text-labeled teal/rose results.
- Expand a teammate’s row and **Mark as premade**. Turn off **Include premade** to hide marked players; turn it back on to review/unmark them.
- Players with at least five teammate games and strictly more than 95% of all imported encounters together are automatically marked, with manual overrides. Exactly 95% does not qualify; remakes count as encounters, and the rule runs before queue/time filters. This is a heuristic, not detected parties. Hiding a player also hides their opponent/chance encounters. Marks persist only in this browser profile and do not alter saved Riot data.
- Queue 1740 (Bravery Arena) and 1750 share one Arena filter, display label and detail count. Encounters across the two queues jointly satisfy the two-game repeat threshold. Original saved queue IDs and metadata are retained; other queues are not grouped.
- Larger text and controls, keyboard support, and explicit win/loss labels.
- Fonts are hosted locally. Champion portraits use Riot's public Data Dragon CDN; missing artwork does not block data or controls.
- Win rates exclude unknown outcomes rather than treating them as losses. Teammate/opponent counts and colors are separate from win/loss semantics.

## Checks and build

```bash
bun run check
bun run test
bun run build
bun run start
```

`bun run start` runs the official `@sveltejs/adapter-bun` production output on **127.0.0.1:8765**, overriding inherited host/port/socket settings. Stop the dev server first. Use `bun run dev` for live editing; after rebuilding production, stop and restart `bun run start` yourself to load the new asset references. `bun run preview` is also available for local build inspection. Use `bun run test`, not `bun test`, to run the existing Node test suite.

Production builds explicitly run Vite under Bun, as required by the official adapter. This was verified with Bun 1.4.5; it does not establish that the previously failing Bun **dev SSR prebundle** path is fixed. Dev/preview, tests, and both operator importers still run under Node. Production disables Bun's connection-idle timeout so requests waiting in the shared Riot queue are not dropped after the default ten seconds. Operators can override this with `CONNECTION_IDLE_TIMEOUT` (seconds, 0 disables); account for queue/cooldown waits in any reverse proxy as well. SIGTERM drains requests with the adapter's default 30-second shutdown deadline; longer pending work can be interrupted and retried.

Synthetic production RSS comparisons and reproduction commands: [Bun memory report](docs/bun-memory.md). No deployment changes are included; the public domain remains **riftregulars.agusbravo.dev**.

Tests use synthetic fixtures in temporary directories. They never replace your imported account data.

## Production deployment

The Dockerfile builds with Bun 1.4.5 and runs only the official adapter output as
UID/GID 1000 on port 3000, without the localhost preview preload. Its allowlisted
build context excludes `.env`, imported data and private checkpoints. GitHub
Actions publishes `ghcr.io/agustinbravop/riftregulars:latest` and immutable
`sha-<commit>` tags from `main`; the repository remains named `rift-regulars`.
GHCR must permit the cluster and Image Updater to pull the image (public package,
or operator-managed registry credentials).

Kubernetes manifests live in the homelab repository at `apps/riftregulars`,
with Argo CD and Image Updater registrations. The public origin is
**https://riftregulars.agusbravo.dev**. Runtime configuration uses a namespace-bound
SealedSecret for `RIOT_API_KEY`; never pass credentials as build arguments.
The service uses one replica, Recreate updates, a 192 MiB request and a 384 MiB
memory limit, with static-file probes. These are starting limits, not a measured
production capacity guarantee. Watch pod/node memory before changing them.

Mount the snapshots PVC read-only at `/app/data/featured`. Provision it before
the first application rollout through a temporary operator pod, running as UID
1000: transfer only validated public snapshots and resolved identity records
with mode 0600. Recreate card metadata against the destination files' stat
identity; copied sidecars alone cannot retain the optimized path. Keep private
checkpoints on the operator machine. There is no in-cluster Riot import job.

Traefik bounds expensive `/player` and `/api/history` requests by host-wide rate
and in-flight limits; static assets, legal pages and probes bypass those limits.
This intentionally shares capacity across visitors and is not authentication.
Gateway text errors receive visitor-safe retry guidance in the client.
The application's connection-idle timeout is disabled for queued Riot requests;
external proxy timeouts can still interrupt long waits. SIGTERM drains for 30
seconds within the pod's 40-second grace period. Recreate updates have downtime.

## Limits and privacy

- “Import complete” means all listed matches downloaded, **not** proof the whole year is available. Coverage dates and partial imports are shown.
- There is no cross-region host fanout or promise of complete transfer history. Live cross-region discovery behavior, returned casing, and PUUID continuity after transfers have not been verified. Cached history can follow only the same PUUID; records under a different PUUID are not automatically combined.
- The cutoff is the calendar year, not a patch-specific ranked-season start.
- All League Match-V5 queues count, including remakes. Custom games and TFT are outside this history.
- General party membership is not exposed. Repeated teammates are **not** confirmed premades. Narrow penalty-related premade flags cannot identify party members. See [research notes](docs/PREMADES.md).
- Arena uses `playerSubteamId` when available; other squads count as opponents, not necessarily direct round opponents.
- Current-game lookup is deferred.
- `.env` and legacy `data/` stay private and gitignored. The dev server explicitly blocks filesystem access to both. Riot proxy requests require same-origin JSON, have bounded request bodies, and accept only validated fixed endpoint inputs.
- The shared limiter assumes one server process. This remains a local/self-hosted app, not a hardened public service: public deployment needs abuse controls and an appropriate Riot API key; multiple processes need shared rate limiting. Origin checks are not authentication.
- Match caches are device-local, not encrypted against other users of the same browser profile. No authentication. Not an official Riot product.
