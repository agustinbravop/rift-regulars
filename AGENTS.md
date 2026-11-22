# UI conventions

- Prefer shadcn-svelte components wherever possible. Reuse the owned components in `src/lib/components/ui/` before adding custom UI or dependencies.
- Keep reusable app components in `src/lib/components/` and route-specific composition in `src/routes/`. Refactor only when needed; preserve the existing theme and accessibility.
- Use Bun for package commands. Run `bun run check`, `bun run test`, and `bun run build` after UI changes.
- Follow `PRODUCT.md` and `DESIGN.md`. The user reviews live changes in Brave; do not use Playwright MCP unless requested.
- Only the user runs the server. Do not start, stop, or restart it unless explicitly asked.
