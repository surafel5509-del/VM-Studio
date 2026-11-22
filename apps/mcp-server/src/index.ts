/**
 * FRAMEFORGE MCP server — Streamable HTTP transport.
 *
 * Run:  npm run dev --workspace=apps/mcp-server
 * Env:  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PORT, HOST, MCP_TOKEN_TTL_HOURS, WEB_ORIGIN
 */
import express from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Request, Response } from 'express';
import { loadConfig } from './config.js';
import { verifyBearerToken } from './auth.js';
import { createFrameForgeServer } from './server.js';
import { ALL_SCOPES } from './supabase.js';

const config = loadConfig();
const app = express();

app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'frameforge-mcp', time: new Date().toISOString() });
});

app.get('/', (_req, res) => {
  res.status(200).json({
    name: 'frameforge-mcp',
    version: '0.1.0',
    transport: 'streamable-http',
    endpoint: '/mcp',
    health: '/health',
    scopes: ALL_SCOPES,
  });
});

/**
 * Single MCP endpoint. Stateless: every request builds a fresh server + transport,
 * so no session state is stored or shared across requests. Service-role key never
 * leaves this process; callers only authenticate as their OWN user via bearer key.
 */
async function handleMcp(req: Request, res: Response): Promise<void> {
  const auth = req.headers.authorization;
  const token = auth?.startsWith('Bearer ') ? auth.slice('Bearer '.length).trim() : null;
  if (!token) {
    res.status(401).json({ error: 'Missing Authorization: Bearer <api-key> header' });
    return;
  }

  const ctx = await verifyBearerToken(config, token);
  if (!ctx) {
    res.status(401).json({ error: 'Invalid or revoked API key' });
    return;
  }

  const { server } = createFrameForgeServer(ctx, config);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless
    enableJsonResponse: true,
  });

  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    try { await server.close(); } catch { /* ignore */ }
    try { await transport.close(); } catch { /* ignore */ }
  };

  res.on('close', close);
  res.on('finish', close);

  await server.connect(transport);
  // The transport handles the request in the background of the response.
  await transport.handleRequest(req, res, req.body);
}

app.all('/mcp', async (req, res) => {
  try {
    await handleMcp(req, res);
  } catch (e) {
    console.error('[mcp] unhandled error:', e);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal MCP error' });
    }
  }
});

// GET is handled by the transport itself (SSE stream); we route everything through one handler.
app.all('/mcp/*', (req, res) => {
  res.status(404).json({ error: 'Only /mcp exists. Use POST /mcp with the MCP-Protocol-Version header.' });
});

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.listen(config.port, config.host, () => {
  console.log(`[frameforge-mcp] listening on ${config.host}:${config.port} (stateless Streamable HTTP)`);
});

process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));
