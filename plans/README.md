# Implementation plans

| Plan | Status | Dependencies |
|---|---|---|
| [001: Bun and memory](001-bun-memory.md) | DONE — reviewed; awaiting user merge decision | None |
| [002: Arrays and prerendering](002-arrays-prerender.md) | DONE — reviewed; awaiting user merge decision | 001 |

Implementation runs in an isolated worktree; merging is the user's decision.

Commit: `189301e1fbb345b9e81461a0d9a44a7888f0e295`.
Reviewer reran check (0 errors/warnings), tests (112 passing), and production build.
Benchmark results were inspected, not rerun during review; they are single-run
synthetic process RSS measurements, not homelab container memory.

Plan 002 commit: `6374a4e6e508c79cd98dd9915203af3399b5e4b6`.
Reviewer read the diff and reran check (0 errors/warnings), tests (115 passing),
build, and assertions that both generated legal HTML pages contain headings,
contact and legal links.
