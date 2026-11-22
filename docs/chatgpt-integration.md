# Connecting ChatGPT (and other MCP clients) to FRAMEFORGE STUDIO

FRAMEFORGE Studio exposes an MCP server via Streamable HTTP. This gives ChatGPT (and Claude, Cursor and other MCP-capable clients) a scoped, authenticated window into your projects.

## Prerequisites

- A deployed/running FRAMEFORGE MCP server (see `docs/mcp.md`).
- An MCP API key from the web app: **MCP Integrations** → Create key.

## Step 1 — create a key

1. Sign in to FRAMEFORGE STUDIO → **MCP Integrations**.
2. Name the key (e.g. "ChatGPT bridge").
3. Select only the scopes the client needs. For a read-only trailer-planning assistant: `read:projects`, `read:timeline`, `read:media`, `read:ai`.
4. Click **Create key** — the token is shown **once**. Copy it into your MCP client config immediately.

## Step 2 — register the connector in ChatGPT

1. ChatGPT → **Settings** → **Connectors**.
2. Click **Add**, paste the MCP endpoint URL, e.g. `https://your-domain/mcp`.
3. Authentication: **Bearer token** — paste the `ffmcp_...` token.
4. Save. The connector should list tools (`list_projects`, `plan_edit`, …) and you should see a working handshake.

> If your ChatGPT plan requires allowlisting the MCP domain (Team/Enterprise plans), add the domain in Settings → Connectors → Allowlist.

## Step 3 — use it

Prompts that work well:

- "List my projects and create a 30-second trailer plan for the most recent one."
- "Show me the timeline of my project and flag anything overlapping."
- "Remove silent sections from the audio track of my project."
- "Add a text title at the playhead saying 'Launch Day'."

The assistant will:

1. Read the project (`list_projects`, `get_timeline`),
2. Build a plan with `plan_edit` (deterministic, non-destructive),
3. Show the plan and ask you to confirm any destructive action before calling the write tool,
4. Report the result honestly — only claims success when the tool returned success.

## Step 4 — revoke the key

If a client is compromised or the key is no longer needed, **revoke it in MCP Integrations**. A revoked key is rejected immediately (401) and can no longer read or write.

## How to verify end-to-end (without a client)

```bash
# health
curl https://your-domain/health
# 401 (no auth)
curl -X POST https://your-domain/mcp -H 'Content-Type: application/json' -d '{}'
# initialize handshake (replace TOKEN with a real token)
curl -X POST https://your-domain/mcp \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'MCP-Protocol-Version: 2024-11-05' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"curl","version":"0.1.0"}}}'
```

A healthy integration returns `200` with a JSON or SSE payload containing your server's name and capabilities.

## Security notes

- Keys are shown **once** and never stored in the browser. Lost them? Delete in MCP Integrations and create a new one.
- The endpoint is **not** public-readable without a key.
- Never paste your key into a public chat, issue tracker or screenshot.
- `docs/ai-safety.md` describes the safety model this client operates under.
