# Familiar Players

## Register

product

## Users

League of Legends players looking up their own Riot ID and server to recognize recurring teammates and opponents.

## Product Purpose

Answer “Who have I met most often?” using retrievable matches from the current calendar year. A simple landing page accepts a Riot ID and server. Riot requests run on the server; compact match history stays in the browser's IndexedDB, separated by account, server, and year. Refresh downloads missing games and retains cached history. Count two or more encounters across all queues, then show each player's shared matches in one chronological table. A current-game lookup is a later feature.

## Brand Personality

Practical, readable, compact. A match tracker, not a marketing site.

A full-width sortable player list with inline expandable row details is the chosen layout. Default to dark, with OP.GG and coachless.gg as visual references, while retaining larger text and controls.

## Anti-references

No eyebrows, extra marketing sections beyond the search hero, decorative effects, or separate dossier/sidebar. No unsupported premade claims. No dense tiny-text tables. No reset-filter button.

## Design Principles

- Rank by actual encounters, not speculative scores.
- Show coverage and incomplete imports honestly.
- Keep names from match data without extra Riot ID lookups.
- Make queue and teammate/opponent differences easy to inspect.
- Premade labels use manual marks or the user-requested rule of at least five games together and zero against across imported history. This is a heuristic, not Riot party detection. Manual unmarks override the rule.

## Accessibility & Inclusion

Larger text and spacing, keyboard support, readable contrast, and explicit text for wins and losses.
