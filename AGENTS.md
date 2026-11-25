# UI conventions

- Prefer shadcn-svelte components wherever possible. Reuse the owned components in `src/lib/components/ui/` before adding custom UI or dependencies.
- Keep reusable app components in `src/lib/components/` and route-specific composition in `src/routes/`. Refactor only when needed; preserve the existing theme and accessibility.
- Use Bun for package commands. Run `bun run check`, `bun run test`, and `bun run build` after UI changes.
- Follow `PRODUCT.md` and `DESIGN.md`. The user reviews live changes in Brave; do not use Playwright MCP unless requested.
- Only the user runs the server. Do not start, stop, or restart it unless explicitly asked.
- Keep visitor-facing errors actionable without developer instructions: never ask visitors to run CLI commands, edit environment files, or renew API keys. Credential/configuration problems belong to the operator; visitors should see temporary-unavailability and retry/contact guidance. Cover shared Riot error messages in `tests/riot.test.ts`.
- Keep `/privacy` and `/terms` accurate to implemented data handling. The shared site footer carries legal links, the Riot disclaimer, and contact `agustinbravop1@gmail.com`.

## Runtime and implementation

- Bun 1.4.5 manages dependencies and runs production builds/output through official `@sveltejs/adapter-bun` 1.0.2. Dev/preview Vite, importers and tests remain on Node 24+. The production Bun build is verified; do not force Bun on dev Vite, whose SSR prebundle previously failed. The adapter loads dynamically in `vite.config.ts` to avoid leaking Bun-only fetch types into Node/browser tests.
- Production defaults to no connection-idle timeout because Riot queue/cooldown waits can exceed Bun's ten-second default; consider proxy timeouts too. Local start must force 127.0.0.1:8765 and clear SOCKET_PATH. Synthetic benchmarks may use isolated ephemeral ports only when explicitly authorized.
- Homepage card sidecars are atomic, optional and bound to public snapshot stat identity. Legacy/stale/corrupt sidecars fall back to full validated profile reads, not cached parsed summaries. Offline republish migrates/restores the fast path; failed imports keep the last public snapshot.
- Use `bun run test`, not `bun test`, for the Node test suite. Tests use synthetic fixtures in temporary directories, never imported account data.
- Browser history uses IndexedDB database `rift-regulars` v1, keyed by platform, year, and PUUID. Retain all participants, including one-off encounters. Save atomic snapshots after each listing page, every ten downloads, completion, and handled failures.
- Keep the shared serialized Riot queue and rolling-window limiter. Fallback budgets are 20 requests/second and 100 requests/120 seconds with a boundary margin; Riot headers update budgets and 429s establish shared `Retry-After` cooldowns. App usage combines regions conservatively; method limits are scoped by endpoint and region. Browser Web Locks serialize imports per account.
- Names and tags come from the latest saved match; identity uses PUUID. Detect remakes using any participant's `gameEndedInEarlySurrender` flag, not duration.
- Queue aliases: 1750 → Arena, 710 → Ranked 5s, 420 → Ranked Solo/Duo, 440 → Ranked Flex.
- Public Sans is self-hosted with its license in `static/fonts/`. Champion artwork uses pinned Data Dragon 16.23.1 with reserved dimensions and letter fallbacks. Follow `DESIGN.md` for visual details.

## Code map

- `scripts/fetch.ts`: legacy Riot import command.
- `src/lib/encounters.ts`, `history.ts`, `import-history.ts`: encounter summaries, compact history, and incremental browser imports.
- `src/lib/browser-cache.ts`, `validation.ts`, `regions.ts`: IndexedDB persistence, input validation, and regional routing.
- `src/lib/server/`: Riot client, shared request queue, and legacy disk access.
- `src/lib/components/PlayerSearch.svelte`, `PlayerDetails.svelte`: shared search and expanded match details.
- `src/routes/+page.svelte`, `player/[riotId]/+page.svelte`: landing search and player dashboard.
- `src/routes/player/+page.server.ts`: legacy query-string redirects.
- `src/routes/api/history/+server.ts`: validated server-side Riot proxy.
- `tests/`: counting, validation, rate-limit, cache, and player-flow tests.
- `docs/PREMADES.md`: party-data research and limitations.
