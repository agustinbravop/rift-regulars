# Player list design

## Scene and theme

A player checks familiar names between League matches in a dark desktop setup, with their browser beside the game client. Dark is the default from the first server-rendered frame, regardless of OS theme.

Reference OP.GG's scan-friendly player tables and blue selection hierarchy, and coachless.gg's charcoal surfaces, restrained borders, and teal/rose result semantics. Take cues, not their branding or assets. No decorative motion.

## Color

Restrained palette: charcoal workspace, slightly raised charcoal panels, pale text, muted cool-gray labels, blue interactions, teal wins, and rose losses. CSS uses OKLCH semantic tokens in `src/routes/layout.css`. Wins/losses always have text labels too.

## Typography

Self-hosted Public Sans variable (400–800), 17px base, 1.5 body line-height, tabular counts. Latin and Latin Extended WOFF2 files total about 45 KB; only Latin is preloaded. Font display is `swap`, with system fallbacks including non-Latin names. License: `static/fonts/OFL-Public-Sans.txt`. No Google Fonts runtime requests. Keep readable controls and spacious rows rather than adopting the references' smaller text.

## Layout

The home page is a simple centered search hero: “Know the names you keep seeing on the Rift.”, a one-line description, and labeled Riot ID and server inputs with a centered submit button below them. Enter in the Riot ID input submits the form. Validate the account before leaving the landing page; show player-not-found and other lookup errors below the inputs, above the button. Keep input labels left-aligned. Preserve the existing dark palette, Public Sans, and supplied logo. Controls stack on mobile. The dashboard lives at `/player/Name%23TAG?server=LA2`; its header offers Change player. No additional marketing sections.

New or incomplete history opens a centered scan screen instead of exposing the table during loading. Show the player and server, current listing/download status, and a labeled progress bar when match IDs are known. Transition automatically to the existing table when complete. Complete browser-cached history skips the scan. A failed scan stays visible with retry, back-to-search, and an explicit option to view saved matches when available.

The landing input opens a scrollable dropdown of every successfully found player, most recent first, with no five-player cap or Show all control. Filter by name/tag while typing; show each entry's server and a separate accessible remove button. Selection opens that player's history and moves them to the top. Store identities in localStorage, deduplicated by PUUID and platform, separately from IndexedDB matches. Removing a recent entry does not delete its match cache. Support Tab, arrow keys, Escape, and outside-click dismissal.

History lives in IndexedDB, keyed by platform, year, and PUUID. Show cached results immediately on returning visits. Refresh checks Riot for missing matches, with visible listing/download progress and incomplete-import alerts. Browser storage failures must be visible, never silently presented as saved history. Premade override keys use platform and PUUID, falling back to the previous Riot-ID key for existing manual marks.

On the table screen, Refresh keeps the table visible. Show “Checking for new matches…” immediately to the left of the button, then “Found X new matches” without trailing punctuation once listing finishes. Hide the result two seconds after it first appears, even if downloads are still running. Count IDs not present before Refresh, excluding already listed but unfinished downloads. No scan instructions below the header. Detailed scan progress belongs only on the initial/resumed scan screen.

A full-width player table with one inline expandable row at a time. No dossier, sidebar, eyebrows, separate “Encounter roster” title, “Scout desk” label, or saved-history label. The old subtitle is now the primary, larger sentence. The header contains only product and account identity.

Render 50 players per page. Click column headings to sort ascending or descending by name/tag, encounter count, teammate wins, opponent wins, last champion, or last encounter. Record sorting prefers fewer losses on tied wins. Keep the sort indicator and `aria-sort` synchronized.

The roster uses fixed table layout with explicit column proportions and a 1200px minimum width so expanding a player's details cannot resize its columns. Narrow screens scroll horizontally. Reserve the page scrollbar gutter to prevent shifts when expanded history adds vertical overflow.

Click anywhere in a player row except its premade-action cell or another interactive control to toggle details. Selecting text must not toggle the row. Keep the name button as the keyboard-accessible disclosure with `aria-expanded` and `aria-controls`; it handles its own click without double-toggling through the row.

Pagination uses a one-based `?page=4` URL parameter, preserving the selected page on reload and supporting Back/Forward. Missing or invalid parameters default to page one; out-of-range pages clamp to the available roster. Page one omits the parameter. Filter and sort changes reset pagination.

Columns are Player (name and `#TAG`), Recent champions, Encounters, WR with, WR against, Last seen, and a compact premade action. Recent champions shows up to three distinct portraits, newest first in the selected queue: the latest is 48px in front, the second is 38px, and the third is 28px, with 8px overlaps behind each preceding portrait. Keep accessible names and name tooltips; sorting uses the latest champion name. Encounters counts shared games in the selected queue, including remakes. The action appears at the far right on row hover or keyboard focus, and stays visible on touch screens. Keep its Users/Check icons and single-line “Mark as premade” or “Unmark premade” labels. Premade accents are green. Default ranking remains encounter count, descending, with a visible sortable Encounters column. There is no relationship filter; search, queue, and Include premade are the roster filters.

Expanded details use a summary column with queues played, sorted by game count, then champions played. Each champion occupies one line with its game count to the right; show as many as the match table height permits, reserving space for an “… X more” summary with the total games on hidden champions only when needed. The main body is one newest-first table across queues, initially five matches with “Show all.” That single control expands both matches and the full champion list, removing the champion overflow summary. Expanded history offers a floating “Show less” while on screen, returning to five rows and the height-limited champion list. Columns: They played, You played (each champion portrait beside that player's neutral, tabular K/D/A), Result (your win/loss), Queue, Date, Match ID (League of Graphs link in a new tab). Missing K/D/A in older saved history displays an accessible unavailable dash. No separate KDA column, match-history title, count eyebrows, premade helper text, or per-queue accordions. Preserve all columns in a horizontally scrollable table on narrow screens; prevent page-level horizontal overflow.

Match-history headers are sortable buttons with direction arrows and synchronized `aria-sort`, matching the roster. Default to Date descending. They played and You played sort by displayed champion name, Result sorts win/loss/remake/unknown, Queue uses its displayed label, and Match ID sorts numerically. Apply sorting before the five-row limit; Show all and Show less preserve the selected sort. Use fixed table layout and explicit column proportions (20% per player, 10% Result, 20% Queue, 14% Date, 16% Match ID) so sorting cannot change widths. The match table has a 1000px minimum width and scrolls horizontally on narrower screens; long queue labels truncate with their full text in a tooltip.

Normal history coverage is always visible below the table, without a disclosure. Show “X indexed games, from [earliest date] to [latest date].” on the left, with “Scanned on [date] [time].” aligned right. Format the scan timestamp in the browser's local timezone, without a timezone label. Do not show Requested since, UTC, Last saved, the generic coverage note, or premade/name-storage helper copy. List excluded empty record IDs below the indexed-games line. Partial imports and errors remain visible alerts. Do not add a reset-filter button or explanatory data blocks above the table.

The Show all / Show less footer spans both the summary and match columns, with the vertical divider ending above it. The collapsed champion summary uses a leading ellipsis (“… X more”) on the left and hidden-game total on the right, without a dotted leader.

## Components

The app identity uses the user-supplied transparent two-minion artwork: `static/brand-logo.png` (256px source, displayed at 56px) plus `static/favicon.png` (48px) and `static/favicon.ico` (16/32/48px). Keep it transparent and unframed; do not redraw or replace the supplied artwork. The header image is decorative beside the visible app name.

Riot-flagged remakes remain in encounter counts and detailed history, with a neutral “Remake” result. Exclude them from wins, losses, unknown-result counts, win rates, and W/L sort comparisons. Use any participant’s `gameEndedInEarlySurrender` flag, not a duration threshold; ordinary surrenders keep their normal outcome.

Player names have a 44px shadcn-svelte Avatar to their left, using the profile icon from their latest saved game in the selected queue. All champion portraits are 48px, including the roster, summary, and details table. Normalize Riot's `FiddleSticks` spelling to Data Dragon's `Fiddlesticks` for both imported and saved encounters. No live summoner lookup or additional API key is needed. Initials remain visible while loading or on failure. Icon artwork uses the same pinned Data Dragon patch as champion portraits and can fall back if newer artwork is unavailable.

The compact filter toolbar contains player search, queue, Last seen (Any time, 7, 30, 90, or 365 days), and Include premades. It wraps on smaller screens and stacks on mobile. Include premades is a bordered control aligned with the dropdowns, with its label on the left and a larger shadcn-svelte switch on the right. Last seen uses the latest encounter in the selected queue, relative to the current time, without trimming older games from records or details. Ranges only search imported history, which currently covers the requested calendar year.

Svelte 5 in SvelteKit with TypeScript, Tailwind CSS v4, and owned shadcn-svelte components under `src/lib/components/ui/`. Prefer shadcn-svelte wherever possible: buttons, fields, input groups, native selects, tables, badges, alerts, empty states, avatars, switches, and accordions.

Champion portraits are decorative beside visible champion labels, reserve their layout dimensions, and fall back to letters if Riot's Data Dragon CDN is unavailable. The smaller, older portraits in Recent champions are the exception to the standard 48px size. Artwork is pinned to Data Dragon 16.23.1; it is not necessary for the app to work.

UI/UX Pro Max research: the verified Data-Dense Dashboard style, keyboard navigation/skip-link guidance, and Svelte 5 runes guidance informed the implementation. The generated marketing patterns, glass effects, and light palette did not fit this personal dark application and were not adopted or persisted as a generated design system.

Match-row champion portraits alone show an 18px role badge at bottom right when Riot records a known position. Both players get their own match-specific role. Use the locally hosted League client SVGs in `static/roles/`, preserving League gold (#c8aa6e); see `docs/role-icons.md` for sources. Include the role in the portrait's accessible name and tooltip. Unknown positions have no badge, and roster portraits remain unchanged.

## Premades

Shared-match rows have a narrow, visually unlabeled Relationship column between They played and You played. Center plain lowercase “with” in muted blue or “against” in muted red; preserve neutral K/D/A and existing result colors. This column is not sortable. Its header remains accessible to screen readers. This supersedes the earlier six-column widths: 190px their player, 6% relationship, 20% your player, 10% result, 180px queue, 12% date, remaining space for match ID, with a 1000px table minimum width. Keep their player column fixed so extra width does not separate their K/D/A from the relationship label.

Player rows offer “Mark as premade” / “Unmark premade” on hover (always visible on touch screens). Automatically mark players with at least five teammate games and zero opponent games across all imported history, before applying filters. Recompute when history reloads; do not persist automatic marks as manual ones. Badge tooltips distinguish manual marks from the automatic heuristic, which is not Riot party detection. An “Include premades” switch is on by default; turning it off hides both manual and automatic premades. Preserve the original browser storage key for manual marks and store explicit unmarks under its `:unmarked` suffix so overrides survive reloads. Hiding affects the whole player, not just premade matches. Persistence stays in this browser, separate from imported Riot data.

Queue display overrides: 1750 → Arena, 710 → Ranked 5s, 420 → Ranked Solo/Duo, 440 → Ranked Flex. These aliases are shared by filters and match details.

## Review

Changing roster filters preserves the expanded player when they remain in the filtered results; their details use the filtered encounters. Clear the expansion when filters exclude that player, so removing a filter does not reopen them. Explicit sorting or pagination still closes details.

The user reviews live changes in Brave. Do not use Playwright MCP for this project unless the user changes that instruction.
