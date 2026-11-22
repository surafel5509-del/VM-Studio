# AGENTS.md — guide for AI/agent contributors

This repository is built by AI agents and humans. The agent working here must:

1. **Read `README.md` and `docs/architecture.md` first.** Do not invent an architecture.
2. **Never fake capability.** No mock data, no simulated exports, no invented completion. If a feature needs a provider, say so.
3. **Shared logic lives in `packages/shared`.** Do not duplicate timeline/audio/easing logic in UI or MCP layers.
4. **Schema changes go through migrations.** `supabase/migrations/` documents the schema; keep `0001_core_schema.sql` readable — changes are made additively and documented.
5. **All state lives in the two stores** (`timeline.store`, `motion.store`) or Supabase. No parallel in-memory models.
6. **Every AI-generated edit** is previewed, confirmed when destructive, and undoable. See `docs/ai-safety.md`.
7. **Run the tests before moving on.** `npm test` must pass.
8. **Typecheck everything.** `npm run typecheck` must pass.
9. **Secrets stay out of the repo.** `.env` never committed; `.env.example` carries placeholders only.
10. **When in doubt, ask** — but do not stall: the default behavior is to produce honest, documented, working code.

## Repo conventions

- TypeScript strict; `noUncheckedIndexedAccess` is on.
- Tailwind 4 (no config file; `@tailwindcss/postcss`).
- Imports: web uses `@/*` → `apps/web/src/*`; MCP uses relative paths; shared is `@frameforge/shared` (workspace).
- No `.js` extensions in relative imports (bundler resolution).
- Icons: `lucide-react` only.
- UI primitives live in `apps/web/src/components/ui.tsx` — do not create parallel ones.

## File-size discipline

Keep files small and focused. Studio pages are thin (project resolution + panels); heavy lifting lives in shared libs (`lib/use-active-video-frame.ts`, `lib/silence-removal.ts`, `lib/motion-helpers.ts`, `lib/export/*`).
