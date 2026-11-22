# Premade detection findings

Checked November 20, 2026 against the published API schema and all 658 locally cached matches.

## Historical matches: no reliable party membership

Public League Match-V5 does not provide a general party ID, party roster, or pairwise “queued with” relationship. Spectator-V5 has team IDs, not party IDs. `teamId` describes the match team; `playerSubteamId` describes an Arena squad, not proof that players entered the queue together.

The current Match-V5 participant schema does contain:

- `wasPremadeWithIGNBGameEndCauser`
- `wasPremadeWithSevereTransgressor`

These are narrow, penalty-related flags, not a general party-membership model. They do not identify party members. In this cache they were present on 4,524 participant records and always false. False or missing values cannot establish that someone queued solo.

Repeated same-team appearances and consecutive games can suggest a party, but cannot confirm it. Small queues and short sessions can produce repeat matchmaking by chance. No frequency-based premade classification has been added.

## Current solution: player-level marks

The user marks known premades from expandable player rows. Only someone seen as their teammate in the saved history can be marked. Marks use the player's stable PUUID, are scoped to the tracked account, and stay in this browser's local storage. The original `queue-partners` storage key is intentionally retained so existing marks survive the UI rename.

The **Include premade** switch is on by default. Turning it off hides marked players. Turn it back on to review and unmark them.

**Hiding is player-level, not match-level.** A marked player's opponent games and chance encounters are hidden too. Unmarked players have unknown party membership, not confirmed solo status. Marks do not change the imported files or count as API evidence.

Browser storage failures are visible; changes remain in the current tab rather than silently claiming persistence.

## Future option: own-lobby capture

A local companion on the computer running League could capture the user's own pre-queue lobby membership through the League Client API, then associate the snapshot with the resulting match. The community-observed `GET /lol-lobby/v2/lobby/members` is a starting point.

This needs actual-client validation, game-flow handling, and policy review. It would provide evidence about **the user's own party in future captured games**, not arbitrary teammate/opponent parties or historical matches. A normal remote website cannot collect it from a different computer.

Riot calls this an unsupported interface, with no documentation, uptime, or change guarantees. Riot also requires documenting the integration in the Developer Portal. No client integration, credential discovery, or access to hidden champion-select identities has been implemented.

## Sources

- [Riot API reference: Match-V5 and Spectator-V5](https://developer.riotgames.com/apis)
- [Community-generated schema mirroring the Riot API reference](https://www.mingweisamuel.com/riotapi-schema/openapi-3.0.0.min.json)
- [Riot's League Client API guidance and policy](https://developer.riotgames.com/docs/lol#league-client-api)
- [Community LCU endpoint reference](https://lcu.kebs.dev/)
