# Implementation plans

Prepared 2026-11-23 against `8f9c588` plus existing uncommitted work.
Source code has not been changed by the advisor.

| Plan | Goal | Priority | Depends on | Status |
|---|---|---|---|---|
| [001](001-curated-streamer-profiles.md) | Compact shared streamer profiles and landing links | P1 | Riot identity validation; three initial accounts researched in plan | TODO |
| [002](002-account-history-discovery.md) | Server-free search and account-based browser history | P1 | None; independent of 001 | DONE — reviewed and applied to active checkout by executor |

Execute with a separate implementation agent, then independently review the diff
and verification results. No merging, pushing, live imports or server restarts
are authorized by this plan.

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
refresh jobs. For approximately ten accounts, compressed snapshots are sufficient.
