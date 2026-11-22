# FRAMEFORGE STUDIO

**Create Without Limits.** A professional, AI-native video editing, motion graphics and creative production platform.

Three operating modes share one project system, media library, assets pipeline and unified timeline:

- **Video Studio** — multitrack timeline, preview monitor, inspector, media panel, export.
- **Motion Studio** — keyframed layers, composition state, canvas preview, component library.
- **AI Creative Studio** — conversational, validated, undoable editing over the same timeline.

Plus: Audio Studio (waveforms, silence removal, WAV export), Subtitle Studio (Amharic + English SRT/VTT), Color Grading (canvas grade + scopes), VFX Studio (node-graph compositing), Render Queue, MCP Integrations and Settings.

## What is real today vs. provider-dependent

Frameforge does not fake capabilities. Every feature is one of:

- **Local, always available** — all timeline operations (add/split/trim/move/slip/slide/markers/locking/visibility/mute/solo/undo), preview, canvas export (WebM), WAV export, subtitle parse/serialize, motion canvas preview, VFX canvas effects, local RMS silence removal, AI plan parsing, MCP server.
- **Provider-dependent** — cloud voiceover (TTS), auto-subtitles (speech-to-text), LLM-driven edit planning. These return honest "needs provider keys" responses and are clearly labeled — nothing is simulated.

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  apps/web        — Next.js 15 (App Router), Tailwind 4,      │
│                   zustand, @frameforge/shared                │
│  packages/shared — timeline engine, easing, audio, subtitles,│
│                   AI parser (pure, typed, tested)            │
│  apps/mcp-server — MCP Streamable HTTP server (~60 tools,    │
│                   13 resources, 11 prompts), service-role    │
│                   auth, per-caller scoping                   │
│  supabase        — Postgres + RLS, storage, server-side      │
│                   cron-free persistence                      │
└──────────────────────────────────────────────────────────────┘
```

The web app and the MCP server share `@frameforge/shared` (timeline, easing, audio, subtitles, AI parser) so behavior is identical in-browser and over MCP.

## Quick start (local)

Prerequisites: Node 20+ (22 recommended), npm 10+.

```bash
# 1. Install
npm install

# 2. Configure (copy and fill in)
cp .env.example .env.local
#   NEXT_PUBLIC_SUPABASE_URL=...
#   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...

# 3. Apply the schema (once per Supabase project)
#    See supabase/migrations/0001_core_schema.sql

# 4. Run the web app
npm run dev          # http://localhost:3000

# 5. Run the MCP server (optional)
npm run mcp          # http://localhost:4321
```

Then sign in, create a project, upload media, edit in Video Studio.

## Scripts

| Command              | What it does                                    |
| -------------------- | ----------------------------------------------- |
| `npm run dev`        | Start the Next.js dev server (port 3000)        |
| `npm run build`      | Production build (web)                          |
| `npm test`           | Vitest suite for the shared engine              |
| `npm run typecheck`  | tsc --noEmit across workspaces                  |
| `npm run mcp`        | Start the MCP server (port 4321)                |

## Testing

`npm test` runs the Vitest suite in `tests/` covering the shared engine: timeline editing, easing, audio analysis, subtitles round-trip, timecode, and the AI parser. All 70 tests pass.

## Documentation

- [docs/architecture.md](docs/architecture.md) — how the pieces fit together
- [docs/mcp.md](docs/mcp.md) — MCP server: tools, resources, prompts, auth, scopes
- [docs/chatgpt-integration.md](docs/chatgpt-integration.md) — connect ChatGPT / other MCP clients
- [docs/rendering.md](docs/rendering.md) — export pipeline, honest format matrix
- [docs/deployment.md](docs/deployment.md) — Docker, environment, runbook
- [docs/AGENTS.md](docs/AGENTS.md) — guide for AI/agent contributors
- [docs/ai-safety.md](docs/ai-safety.md) — AI safety model and scope rules

## Security model (summary)

- The browser only ever holds `NEXT_PUBLIC_*` variables.
- The MCP server holds `SUPABASE_SERVICE_ROLE_KEY` (server-only).
- All app queries are owner-scoped (RLS + explicit `owner_id` filters in the MCP server).
- MCP keys are 256-bit random tokens, stored as SHA-256 hashes, never logged; revoked/expired keys are rejected.
- AI-driven operations are always previewed and confirmed, and undoable.

## License

Private — not for redistribution.
