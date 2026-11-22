# FRAMEFORGE MCP server

The MCP server (`apps/mcp-server`) exposes FRAMEFORGE STUDIO to external AI clients over the Model Context Protocol using the **Streamable HTTP** transport. It is the first-class, future-proof integration path — not a legacy ChatGPT plugin.

## Transport & protocol

- **Endpoint:** `POST /mcp` (Streamable HTTP, JSON response mode)
- **Auth:** `Authorization: Bearer <ffmcp_...>` header
- **Health:** `GET /health` (public)
- **Info:** `GET /` (advertises version, transport, scopes)
- **Stateless:** every request builds a fresh server → no session store, no shared state to leak between clients.
- **Version:** MCP `2024-11-05`+ compatible; `enableJsonResponse: true`.

## Authentication & authorization

1. Create a key in the web app (**MCP Integrations** page). The token is 256-bit random, shown once, then only its SHA-256 hash is stored in `mcp_api_keys.key_hash`.
2. The client sends it as a Bearer token. The server re-hashes it, looks up the row, checks `revoked_at` and (optionally) the `MCP_TOKEN_TTL_HOURS` window.
3. Scopes on the key gate every tool and resource. A key with `read:projects` can never delete anything.
4. All operations are owner-scoped: tools verify the caller's own rows via `owner_id = <user from key>`. No cross-tenant access is possible.
5. Every tool call appends an `audit_logs` entry (action, target, key fingerprint — never the key itself).

### Scope catalogue

| Scope | Grants |
| ----- | ------ |
| `read:projects` / `write:projects` | list/get/create/update/archive/delete projects |
| `read:timeline` / `write:timeline` | timeline read, validate, all timeline edits |
| `read:media` / `write:media` | media assets read/search, attach/delete |
| `read:motion` / `write:motion` | compositions and layers read/write |
| `read:subtitles` / `write:subtitles` | subtitle documents read/create/update/delete |
| `read:render` / `write:render` | render jobs read/create/cancel |
| `read:ai` | `plan_edit`, `ai_capabilities`, prompt templates, server info |

Destructive tools (deletes, `clear_timeline`, `cancel_render_job`, `delete_project`, `delete_composition`, `remove_layer`, `delete_media_asset`, `delete_subtitle_document`, `remove_clip`) carry `destructiveHint: true` in their MCP metadata so clients can warn before calling.

## Tool catalogue (~60)

### Meta (1)

`server_info` — server name, version, transport, the caller's scope list.

### Projects (6)

`list_projects`, `get_project`, `create_project`, `update_project`, `delete_project`, `archive_project`

### Timeline (read: 7)

`get_timeline`, `get_timeline_summary`, `list_tracks`, `list_clips` (with optional `trackId`), `get_clip`, `list_markers`, `visible_clips_at`, `validate_timeline`

### Timeline (write: 16)

`add_clip`, `remove_clip` (optional ripple), `split_clip`, `split_all_at`, `duplicate_clip`, `move_clip`, `trim_clip`, `set_clip_speed`, `set_clip_volume`, `set_clip_opacity`, `set_clip_text`, `set_clip_color`, `add_marker`, `remove_marker`, `label_marker`, `set_track_flag` (locked/visible/muted/solo), `rename_track`, `add_track`, `clear_timeline`

### Media (5)

`list_media_assets` (optional `projectId`), `get_media_asset`, `search_media_assets`, `attach_media_to_project`, `delete_media_asset`

### Motion (9)

`list_compositions`, `get_composition`, `create_composition`, `update_composition`, `delete_composition`, `add_layer`, `remove_layer`, `set_layer_visible`, `add_keyframe`, `remove_keyframe`

### Subtitles (5)

`list_subtitle_documents`, `get_subtitle_document`, `create_subtitle_document` (cues or raw SRT/VTT text), `update_subtitle_document`, `delete_subtitle_document`

### Render (4)

`list_render_jobs`, `get_render_job`, `create_render_job`, `cancel_render_job`

### AI (2)

`plan_edit` (deterministic, non-destructive, returns the validated plan), `ai_capabilities`

## Resource catalogue

| URI | Scope |
| --- | ----- |
| `frameforge://server` | public-ish (metadata) |
| `frameforge://projects`, `frameforge://projects/{projectId}` | `read:projects` |
| `frameforge://timelines/{projectId}` | `read:timeline` |
| `frameforge://media`, `frameforge://media/{assetId}` | `read:media` |
| `frameforge://compositions`, `frameforge://compositions/{compositionId}` | `read:motion` |
| `frameforge://subtitles`, `frameforge://subtitles/{documentId}` | `read:subtitles` |
| `frameforge://render/jobs`, `frameforge://render/jobs/{jobId}` | `read:render` |
| `frameforge://mcp/keys` | own keys only (metadata — never secrets) |

## Prompt templates (11)

`cinematic_trailer`, `talking_head_short`, `repurpose_for_reels`, `auto_subtitle_amharic`, `auto_subtitle_english`, `remove_silences`, `weekly_recap_video`, `motion_title_intro`, `render_batch`, `audio_health_check`, `repurpose_for_youtube`.

Each prompt returns an instruction the client should act on — with explicit "ask before destructive action" guidance. Prompts do not execute anything themselves.

## Running

```bash
cp apps/mcp-server/.env.example apps/mcp-server/.env.local
# fill in SUPABASE_SERVICE_ROLE_KEY (see docs/deployment.md)
npm run mcp
```

## The current state of the endpoint (honestly)

The server is **implemented and type-checked** — all of the tools, resources and prompts above are registered against the shared engine, auth and ownership rules are enforced in code, and the auth paths return 401 for missing/revoked/expired keys. The endpoint is **not yet exercised end-to-end over the live network path** because it requires `SUPABASE_SERVICE_ROLE_KEY` at runtime (never in the repo). With a valid key, a client can:

1. `POST /mcp` initialize handshake → list tools (`tools/list`),
2. `call tools/call` → tools execute and write to Supabase,
3. poll `get_render_job` / `get_timeline_summary` — all owner-scoped,
4. see audit entries in `audit_logs`.

Until the server is running against a live Supabase project with the service-role key, the integration path is documented-but-untested over the wire — do not describe it as "live".
