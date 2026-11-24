# Rift Regulars

Know the names you keep seeing on Summoner’s Rift.

League of Legends match-history tracker. Search a Riot ID; its active League server is detected automatically.

Built with SvelteKit, Svelte 5, TypeScript, shadcn-svelte, and Tailwind CSS v4.

## Run locally

Requires **Bun 1.3.13+** and **Node.js 24+**.

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

Opening a player link or recent entry with complete browser-cached history shows results without Riot requests. Submitted searches in both landing and header rediscover the current server before navigating, even when history is cached. Incomplete caches resume in the scan view. **Refresh** lists history again and downloads only missing matches. The browser never receives the API key. Development keys expire; a 403 means the server owner must renew the key.

## Saved data and import behavior

- Match history is saved in this browser, separately for each account and calendar year. Cached matches from other servers are retained; existing per-server records are merged without deleting them.
- No new match data is written to the server's filesystem. Existing `data/` files are untouched and are no longer served by the dashboard; `/api/data` returns 410.
- Requests Match-V5 history from the active server's regional host, from January 1 UTC through scan start. Previously cached matches remain even if Riot stops listing them. Legacy imports and detected transfers are re-listed before being considered complete.
- Progress is saved periodically. Closing the tab may lose the latest unsaved batch, not earlier saved progress.
- Riot records with zero participants are tracked as excluded instead of blocking the scan. Coverage details show their IDs; Refresh retries them in case usable details become available. Non-empty matches missing the tracked player still stop the scan.
- All visitors share the Riot API quota. Imports respect Riot's rate limits, and the same account cannot be imported simultaneously in multiple tabs.
- Small refreshes can use available burst quota and are primarily network-bound. Large first scans still wait when a rate window fills; throughput depends on the key's advertised limits, network latency, retries, and other visitors. Listing still checks the full current year.
- Browser storage can be cleared or evicted. Another device, browser profile, or origin requires a new scan. Storage failures show a warning and retain results only in the current tab. Scanning requires HTTPS or localhost.
- Close older app tabs before scanning after this update. Premade marks carry across servers; conflicting saved marks show a warning rather than being overwritten.
- The legacy `bun run fetch` CLI still imports Agus Brr's LAS history into the original `data/` format, independently of browser caches. Do not run it concurrently with web scans or other apps sharing the key.

## Interface

- Landing search remembers every successful lookup in this browser. Focusing the player input opens a scrollable, newest-first list, filtered by name or tag as you type. Entries show their server, open history on selection, and can be removed without deleting cached matches. Tab/arrow keys navigate the list; Escape closes it.
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
- Players with at least five teammate games and no opponent games are automatically marked, with manual overrides. This is a heuristic, not detected parties. Hiding a player also hides their opponent/chance encounters. Marks persist only in this browser profile and do not alter saved Riot data.
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

`bun run start` runs the built Node adapter on **127.0.0.1:8765**. Stop the dev server first. Use `bun run dev` for live editing; after rebuilding production, stop and restart `bun run start` yourself to load the new asset references. `bun run preview` is also available for local build inspection. Use `bun run test`, not `bun test`, to run the existing Node test suite.

Tests use synthetic fixtures in temporary directories. They never replace your imported account data.

## Limits and privacy

- “Import complete” means all listed matches downloaded, **not** proof the whole year is available. Coverage dates and partial imports are shown.
- There is no cross-region host fanout or promise of complete transfer history. Live cross-region discovery behavior, returned casing, and PUUID continuity after transfers have not been verified. Cached history can follow only the same PUUID; records under a different PUUID are not automatically combined.
- The cutoff is the calendar year, not a patch-specific ranked-season start.
- All League Match-V5 queues count, including remakes. Custom games and TFT are outside this history.
- General party membership is not exposed. Repeated teammates are **not** confirmed premades. Narrow penalty-related premade flags cannot identify party members. See [research notes](docs/PREMADES.md).
- Arena uses `playerSubteamId` when available; other squads count as opponents, not necessarily direct round opponents.
- Current-game lookup is deferred.
- `.env` and legacy `data/` stay private and gitignored. The dev server explicitly blocks filesystem access to both. Riot proxy requests require same-origin JSON, have bounded request bodies, and accept only validated fixed endpoint inputs.
- The shared limiter assumes one Node process. This remains a local/self-hosted app, not a hardened public service: public deployment needs abuse controls and an appropriate Riot API key; multiple processes need shared rate limiting. Origin checks are not authentication.
- Match caches are device-local, not encrypted against other users of the same browser profile. No authentication. Not an official Riot product.
