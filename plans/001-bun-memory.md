# Reduce homepage allocations and evaluate Bun

## Status
- Priority: P1; risk: medium; dependencies: none.
- Planned at: `849acc2`, 2026-11-25.
- Worktree: `/home/agustinbravop/.local/share/opencode/worktree/660984/riftregulars-bun-memory`.

## Intent and current state
Implement the requested homepage memory optimization, compare production Node,
Bun and Bun --smol, and switch production to official @sveltejs/adapter-bun.
Domain is always riftregulars.agusbravo.dev.

`src/lib/server/featured.ts` publishes atomic gzip snapshots and `featuredCards`
currently Promise.all loads all nine complete public profiles to extract card
metadata. Profiles are 8.36 MiB uncompressed in aggregate. Preserve private
checkpoints, resumability, aliases, missing/corrupt unavailable behavior, and SSR.
Do not cache all parsed profiles.

`vite.config.ts` imports @sveltejs/adapter-node. package.json uses Node 24 for
build/start/tests, Bun 1.3.13 as package manager. scripts/local-server.ts enforces
127.0.0.1:8765. Official @sveltejs/adapter-bun 1.0.2 requires Bun >=1.4.0 and
builds under Bun. Existing docs record a Bun Vite SSR prebundle failure: verify
whether it affects production builds rather than assume resolved.

## Scope
Only change package.json, bun.lock, vite.config.ts, scripts/local-server.ts,
src/lib/server/featured.ts, tests/featured.test.ts, README.md, AGENTS.md,
and new focused benchmark script/test/report files under scripts/, tests/, docs/.
Do not change any existing player page (the main tree has user edits there).
Do not change homelab, deploy, push, or touch actual .env or imported data.
Use synthetic temporary fixtures exclusively for tests/benchmarks.

## Execution
1. Confirm git HEAD and drift. Read PRODUCT.md, DESIGN.md, AGENTS.md, featured
   code and tests, route loaders, package config. Match existing TS conventions.
2. Acquire a pinned Bun >=1.4 in an isolated /tmp/opencode directory or local
   worktree tooling, never replace global Bun. Verify version. Install with Bun.
   Do not read or copy .env. If no suitable Bun can be obtained, STOP and report.
3. Add tiny publication metadata for homepage cards. Keep atomic snapshot
   semantics and preserve honest missing/corrupt behavior. Consider file metadata
   validity against snapshot replacement and legacy snapshots; avoid parsing full
   snapshots on the optimized homepage path. Explain tradeoffs. Test successful
   publication, incomplete/failed import, aliases, corrupt/missing, and refresh.
   Existing snapshots must have a documented safe migration/fallback.
4. Benchmark current Node-adapter output with Node 24, Bun, and Bun --smol using
   identical synthetic representative nine-profile fixtures. Include baseline
   pre-optimization and optimized homepage if feasible, idle, repeated homepage,
   largest featured profile, modest concurrency, post-load memory. No Riot calls.
   Use isolated ports, production builds, one server process at a time, bounded
   duration, guaranteed cleanup. Sample process RSS and peak RSS. Docker/container
   metrics only if available; never label RSS as container memory.
5. Switch to official @sveltejs/adapter-bun, update required versions, production
   start/build command and local host/port safety; keep Node test runner/importer.
   Benchmark official adapter normal and --smol as well. Keep comparison tooling
   reproducible without permanently retaining adapter-node as an app dependency
   if possible. No bespoke adapter or rewrite; STOP on unresolved build failures.
6. Write docs report with commands, versions, fixture sizes, results, limitations,
   no unsupported claims. Do not treat smaller image size as RAM savings.
7. Run bun run check, bun run test, bun run build using the isolated compatible
   Bun. Ensure runtime smoke verifies SSR, static assets, no-key same-origin error
   path, graceful SIGTERM, and timeout settings appropriate to queued Riot calls.
   Never call Riot with a real key.
8. Commit completed scoped changes only in the isolated worktree, not main tree.

## Verification / done
- All check/test/build commands exit zero, with meaningful new synthetic tests.
- Official adapter is configured, compatible pinned Bun documented, local start
  remains localhost:8765 and operator importer remains Node.
- Benchmark is reproducible; report actual outcomes including failures and
  unavailable container metrics. No promised memory budget without measurements.
- No imported data, secrets or unrelated changes included. No server left running.

## Stop conditions and maintenance
Stop after two unsuccessful reasonable fixes to a verification failure, or if
unsupported APIs require broad rewrite. Report missing tools honestly.
Card metadata must remain consistent with annual rollover, snapshot replacements,
and the rule that failed imports retain the last successful public snapshot.
