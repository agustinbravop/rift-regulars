# Familiar Players

Personal LAS match-history tracker for **Agus Brr#ARG**.

**SvelteKit + Svelte 5 + TypeScript + shadcn-svelte + Tailwind CSS v4.** The importer is TypeScript too; Python is no longer needed.

## Run locally

Requires **Bun 1.3.13+** and **Node.js 24+**. Bun manages dependencies and script commands. Vite, the importer, test runner, and production adapter retain their Node runtime; do not force `--bun` on Vite, which produced an SSR pre-bundle error with this toolchain.

```bash
cd familiar_players
bun install
bun run dev
```

Open **http://127.0.0.1:8765**.

Create a `.env` file containing your Riot development key:

```dotenv
RIOT_API_KEY=your-development-key
```

In another terminal, from this folder:

```bash
bun run fetch
```

The importer loads `.env` using Node's built-in env-file support. An existing environment variable takes precedence. Development keys expire; a 403 means you should renew the key.

Click **Reload saved data** to see import progress. Summaries update every ten downloads. The browser only reloads local data; it never receives the key or makes Riot requests.

## Saved data and import behavior

- Retains the original `data/matches/*.json`, `data/queues.json`, and `data/summary.json` format.
- Requests all LAS Match-V5 history from January 1 of the current UTC year through the import start time.
- Reuses downloaded matches and retains previously listed cached history if Riot no longer returns it.
- Writes JSON atomically. Invalid API responses or corrupt cache files stop the import without deleting existing files.
- Paces requests for development-key limits, respects `Retry-After`, retries temporary failures, and preserves partial progress.
- Run **one importer at a time** and avoid other apps sharing the key during import.
- Around 1,000 uncached matches takes 22 minutes before retries. Ctrl+C keeps downloaded matches; rerun to resume.

## Interface

- Players encountered in at least two distinct games, combining teammates and opponents.
- Total encounters, teammate/opponent split, champions, last encounter, and your wins/losses with and against each player.
- One sortable match-history table across queues, with both players' champions, K/D/A, recorded roles, and results.
- Names and `#TAG` from the latest saved match, without extra Riot ID lookups. Identity is tracked by PUUID.
- Summoner icons beside names come from the latest saved game in the selected queue, without extra Riot API requests. Missing icons fall back to initials.
- Queue filters require at least two encounters within the selected queue. Teammate and opponent games remain together in player details; there is no relationship filter.
- Full-width sortable player list with expandable row details, not a separate dossier or sidebar.
- The roster shows 50 players per page; expanded details initially show five matches, with Show all and Show less controls.
- Click column headers to sort by name, encounter count, played-with wins, played-against wins, last champion, or last seen. Click again to reverse direction. Record sorting prefers fewer losses on tied wins.
- “WR with” and “WR against” show your win/loss records, with unknown results labeled. Recent champions shows up to three distinct picks, newest first, within the selected queue.
- Remakes use Riot’s `gameEndedInEarlySurrender` flag on any participant. They remain encounters and appear as “Remake” in detailed history, but do not count as wins, losses, unknown outcomes, or toward win rates. Ordinary surrenders still count.
- Queue labels: 1750 is Arena, 710 is Ranked 5s, 420 is Ranked Solo/Duo, and 440 is Ranked Flex.
- Keyboard-operable filters, labeled sorting controls, expandable rows, and pagination remain accessible. Coverage details are in the footer; no eyebrows or reset button.
- Dark by default, with charcoal surfaces, blue selection, and text-labeled teal/rose results.
- Expand a teammate’s row and **Mark as premade**. Turn off **Include premade** to hide marked players; turn it back on to review/unmark them.
- Players with at least five teammate games and no opponent games are automatically marked, with manual overrides. This is a heuristic, not detected parties. Hiding a player also hides their opponent/chance encounters. Marks persist only in this browser profile and do not alter saved Riot data.
- Larger text and controls, keyboard support, and explicit win/loss labels.
- Self-hosted Public Sans, 17px base, with its license bundled in `static/fonts/`. No runtime Google Fonts requests.
- Champion portraits use Riot's public Data Dragon CDN (16.23.1), with reserved dimensions and letter fallbacks. Missing artwork does not block data or controls.
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

## Structure

```text
scripts/fetch.ts                     Riot import command
src/lib/encounters.ts                Shared counting and filtering
src/lib/types.ts                     Match and saved-data types
src/lib/server/                      Riot client, validation, private disk access
src/lib/components/ui/               Owned shadcn-svelte component sources
src/lib/components/PlayerDetails.svelte
src/routes/+page.svelte              Sortable rows and manual premade tags
src/routes/+page.server.ts           Initial saved-data load
src/routes/api/data/+server.ts       Saved-data reload endpoint
tests/                              Counting, validation, rate-limit, cache tests
docs/PREMADES.md                     Party-data research and limitations
```

## Limits and privacy

- “Import complete” means all listed matches downloaded, **not** proof the whole year is available. Coverage dates and partial imports are shown.
- The cutoff is the calendar year, not a patch-specific ranked-season start.
- All League Match-V5 queues count, including remakes. Custom games and TFT are outside this history.
- General party membership is not exposed. Repeated teammates are **not** confirmed premades. Narrow penalty-related premade flags cannot identify party members. See [research notes](docs/PREMADES.md).
- Arena uses `playerSubteamId` when available; other squads count as opponents, not necessarily direct round opponents.
- Current-game lookup is deferred.
- `.env` and `data/` stay private and gitignored. The dev server explicitly blocks filesystem access to both; production serves only built public assets and the summary endpoint.
- Local-only personal app, no authentication or public deployment. Not an official Riot product.
- Visual changes are reviewed by the user in Brave; do not use Playwright MCP unless requested.
