# Deployment

## Environments

| Piece | What runs | Where |
| ----- | --------- | ----- |
| Web app | Next.js 15 (`apps/web`) | Vercel / any Node host / Docker |
| MCP server | Node + Express (`apps/mcp-server`) | Any Node host behind TLS |
| Database + storage | Supabase Postgres + Storage | Supabase project (external) |

The web app is **not** a serverless function — it is a standard Next.js app with dynamic routes; deploy it where Node runs (Vercel, Fly.io, a small VM, or Docker).

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
