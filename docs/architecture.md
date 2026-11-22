# Architecture

## Overview

```
┌────────────────────────────┐        ┌────────────────────────────┐
│  apps/web (Next.js 15)      │        │  apps/mcp-server (Node)    │
│  ─ App Router               │        │  ─ Express                  │
│  ─ Tailwind 4 + zustand     │        │  ─ Streamable HTTP          │
│  ─ Browser client (anon)    │        │  ─ Service role             │
└───────────┬────────────────┘        └───────────┬────────────────┘
            │                                     │
            │ abase-js (anon key, RLS)            │ abase-js (service role)
            ▼                                     ▼
┌──────────────────────────────────────────────────────────────────┐
│                      Supabase (Postgres + RLS)                    │
│  workspaces, profiles, projects, media_assets, timeline_states,   │
│  compositions, subtitle_documents, render_jobs, mcp_api_keys,     │
│  audit_logs + storage bucket "media"                              │
└──────────────────────────────────────────────────────────────────┘
            shared logic:
┌──────────────────────────────────────────────────────────────────┐
│  packages/shared: timeline engine · easing · audio analysis ·    │
│  subtitles · AI command parser · timecode                         │
└──────────────────────────────────────────────────────────────────┘
```

## Data flow (Video Studio)

1. `apps/web` hydrates the timeline from `timeline_states` (or a default).
2. All edits go through `@frameforge/shared` pure functions → the `timeline.store` → persisted to `timeline_states` (autosave, ~900ms debounce).
3. The preview monitor + Timeline render from the same in-memory timeline engine the export pipeline uses — no separate "export model".
4. Export: canvas + MediaRecorder → WebM download; OfflineAudioContext → 16-bit PCM WAV. Both are real, playable artifacts.

## Data flow (MCP)

1. Client (ChatGPT, Claude, etc.) POSTs JSON-RPC to `/mcp` with `Authorization: Bearer <ffmcp_...>`.
2. `apps/mcp-server` hashes the token, looks it up in `mcp_api_keys`, checks `revoked_at` and TTL.
3. A fresh `McpServer` (built from a per-request `ToolContext`) is created — tools/resources/prompts close over the caller's `owner_id`.
4. Tools run the **same shared engine** as the web app, write through Supabase with the service role (server-side only), and log audit entries.
5. The web app manages keys (MCP Integrations page). Keys are shown once on creation; only their SHA-256 hash is stored.

## Repositories / storage

- **Supabase Postgres** — projects, timelines (JSONB), media metadata, compositions, subtitles, render jobs, MCP keys, audit logs. RLS enforces: `owner_id = auth.uid()` on every table.
- **Supabase Storage** (`media` bucket) — user uploads. Signed URLs are issued for preview.
- **No client-side database** — the web app never talks to storage or DB tables directly outside the stores.

## Directories

| Path                  | What lives there                                        |
| --------------------- | ------------------------------------------------------- |
| `apps/web`            | Next.js app (App Router, Tailwind, zustand)              |
| `apps/mcp-server`     | MCP server (Express, Streamable HTTP, service-role)     |
| `packages/shared`     | Timeline, easing, audio, subtitles, AI parser, types    |
| `supabase/migrations` | Schema SQL (applied via execute_query, not the CLI)    |
| `tests`               | Vitest suite over the shared engine                     |
| `docs`                | Architecture, MCP, ChatGPT, rendering, deployment       |
| `docker`              | Dockerfiles                                             |

## Key invariants

- **One source of truth** — the timeline engine never lives in the UI; the same code powers editor, MCP tools, and previews.
- **Honest export** — only WebM/WAV are generated in-browser; MP4/MOV require a server worker (docs/rendering.md).
- **Server-only secrets** — the browser only ever holds `NEXT_PUBLIC_*` keys.
- **No fake states** — jobs, renders and AI edits report real, verifiable states or are honestly unavailable.
