# Implementation plans

| Plan | Status | Dependencies |
|---|---|---|
| [001: Bun and memory](001-bun-memory.md) | DONE — reviewed and integrated into main | None |
| [002: Arrays and prerendering](002-arrays-prerender.md) | DONE — reviewed and integrated into main | 001 |

The user authorized integration and deployment on 2026-11-25. Main-tree user
changes, including the coverage-paragraph removal and these plans, were committed
before integrating both optimization commits.

Commit: `189301e1fbb345b9e81461a0d9a44a7888f0e295`.
Reviewer reran check (0 errors/warnings), tests (112 passing), and production build.
Benchmark results were inspected, not rerun during review; they are single-run
synthetic process RSS measurements, not homelab container memory.

Plan 002 commit: `6374a4e6e508c79cd98dd9915203af3399b5e4b6`.
Reviewer read the diff and reran check (0 errors/warnings), tests (115 passing),
build, and assertions that both generated legal HTML pages contain headings,
contact and legal links.
