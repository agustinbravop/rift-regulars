# Implementation plans

Prepared 2026-11-23 against `8f9c588` plus existing uncommitted work.
Source code has not been changed by the advisor.

| Plan | Goal | Priority | Depends on | Status |
|---|---|---|---|---|
| [001](001-curated-streamer-profiles.md) | Compact shared streamer profiles and landing links | P1 | All nine active identities validated through Riot on 2026-11-24 | DONE — executor implementation reviewed; nine sequential imports and published profiles verified |
| [002](002-account-history-discovery.md) | Server-free search and account-based browser history | P1 | None; independent of 001 | DONE — reviewed and applied to active checkout by executor |

Execute with a separate implementation agent, then independently review the diff
and verification results. No merging, pushing, live imports or server restarts
are authorized by this plan.

Plan 001 execution update, 2026-11-24: the user explicitly authorized implementation
and one-at-a-time live imports of Agurin, Thebausffs, Drututt, Nemesis, AloisNL,
Tyler1, Dantes, Crownie and Caedrel. This supersedes the earlier three-account
list and server-selector assumptions in plan 001. Current Name#TAG discovery is
preserved. The executor implemented the compressed store, importer and landing
catalog. User refinements supersede the original carousel: static, centered,
intrinsically sized horizontal cards in staggered rows, icons left, floating
conditional streamer badges, hidden game counts, and no unavailable-card action.
All nine imports completed: 6,041 account-games (not deduplicated across accounts),
4,661,943 bytes private gzip histories, 1,812,950 bytes public gzip profiles,
6,476,397 bytes total including identity records. Every public snapshot has complete
listed coverage and an icon; raw unused match fields and custom games are absent.
Reviewer independently passed check, test, build and whitespace checks. In-process
production SSR verified nine linked cards and nine complete dashboards with zero
upstream requests. Browser appearance remains unverified. No server was restarted.

Plan 002 approved 2026-11-24: branch `plan002-review1`, worktree
`/tmp/opencode/rift-plan002-review1`, baseline `5c96e47`, feature `8b58783`.
Reviewer independently ran check (0 errors/warnings), test (78 passing), build,
and diff whitespace checks. Current `rift-regulars` storage naming and concurrent
README changes were preserved. Live Riot/transfer behavior and browser review
remain unverified. After explicit user authorization, the executor applied the
feature-only changes to the active checkout without commits or server operations,
preserving unrelated edits. Active check/test/build pass (78 tests).
Landing search now uses a 600px form with Search on the right and mobile stacking.

Deferred: database, binary format, cross-streamer match deduplication, and public
refresh jobs. For nine accounts, compressed snapshots are sufficient.
