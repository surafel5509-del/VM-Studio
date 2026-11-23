# Deployment

## Environments

| Piece | What runs | Where |
| ----- | --------- | ----- |
| Web app | Next.js 15 (`apps/web`) | Vercel / any Node host / Docker |
| MCP server | Node + Express (`apps/mcp-server`) | Any Node host behind TLS |
| Database + storage | Supabase Postgres + Storage | Supabase project (external) |

The web app is **not** a serverless function — it is a standard Next.js app with dynamic routes; deploy it where Node runs (Vercel, Fly.io, a small VM, or Docker).

## Vercel

Two Vercel projects from this repo's `main`/`arena/*` branches:

| Vercel project | Source | Notes |
| ---------------- | ------ | ----- |
| `vm-studio` (Next.js 15) | `apps/web` | Browser-safe `NEXT_PUBLIC_*` env vars only |
| `mcp-server` (Node + Express) | `apps/mcp-server` | Server-only `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` (sensitive) / `MCP_TOKEN_TTL_HOURS` / `WEB_ORIGIN` |

- The MCP server project **must** have the repo's `apps/mcp-server` directory as its **root directory**. The Express builder searches the project root for the entrypoint (e.g. `src/index.ts`); at the repo root it fails with "No entrypoint found".
- Do **not** add a root `vercel.json` with a functions entry for `apps/mcp-server/src/index.ts` to work around the root-directory problem — it does not resolve against the `apps/mcp-server` root and produces the same "No entrypoint found" failure. The `@frameforge/shared` workspace sources are bundled via `sourceFilesOutsideRootDirectory: true` and dependency tracing, not `includeFiles`.
- The web app must never receive the service-role key; it only holds browser-safe keys.
- Note that the earlier `main`-branch fix (`vercel.json` with `apps/mcp-server/src/index.ts` + `packages/shared/src/**` includeFiles) does **not** work for this project layout and should not be re-applied.

## Docker (local dev / self-host)

```bash
# web (port 3000)
docker build -f docker/Dockerfile.web -t frameforge-web .
docker run --rm -p 3000:3000 --env-file .env.local frameforge-web

# MCP server (port 4321)
docker build -f docker/Dockerfile.mcp -t frameforge-mcp .
docker run --rm -p 4321:4321 --env-file apps/mcp-server/.env.local frameforge-mcp
```

Or with compose:

```bash
docker compose up --build
```

`docker-compose.yml` wires the two services and an optional Postgres container for fully local development (see `docker-compose.yml` comments — Supabase remains the recommended production path).

## Required environment variables

### Web (browser-safe)

| Variable | Purpose |
| -------- | ------- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key (RLS applies) |

### MCP server (server-only, never in the repo)

| Variable | Purpose |
| -------- | ------- |
| `SUPABASE_URL` | Same project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server-only** — bypasses RLS, used to verify keys and act on the owner's behalf |
| `PORT` / `HOST` | Listener (default 4321 / 0.0.0.0) |
| `MCP_TOKEN_TTL_HOURS` | Optional token expiry (default: no expiry) |
| `WEB_ORIGIN` | Optional CORS origin for the MCP surface |

## Production notes

- Put the MCP server behind TLS with a reverse proxy (Caddy/nginx/Cloudflare).
- Rate-limit `/mcp` at the proxy.
- Set `MCP_TOKEN_TTL_HOURS` — expired keys are rejected automatically.
- Keep `SUPABASE_SERVICE_ROLE_KEY` out of logs, screenshots and CI artifacts.
- The web app is stateless; sessions live in Supabase Auth (cookies).

## Health & monitoring

- `GET /health` — liveness for the MCP server.
- The web app has no public health endpoint today; monitor the deploy platform's checks.

## Rollback

- The web app is a standard Next.js deployment — roll back the release.
- The MCP server is a single Node process — roll back the container.
- Supabase migrations are additive (no destructive migration is applied to replace them except RLS policies) — keep the project's migration history intact.
