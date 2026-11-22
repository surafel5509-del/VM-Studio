import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpConfig } from './config.js';
import type { McpAuthContext } from './supabase.js';
import { getServiceClient } from './supabase.js';
import type { ToolContext } from './toolkit.js';
import { registerTools } from './tools.js';
import { registerResources } from './resources.js';
import { registerPrompts } from './prompts.js';

/**
 * Builds a complete MCP server instance scoped to a single authenticated caller.
 * One instance per request (stateless Streamable HTTP), so each tool/resource/
 * prompt only ever touches the caller's own data.
 */
export function createFrameForgeServer(ctx: McpAuthContext, config: McpConfig): { server: McpServer; toolCtx: ToolContext } {
  const supabase = getServiceClient(config);
  const toolCtx = { ctx, supabase };

  const server = new McpServer(
    { name: 'frameforge-mcp', version: '0.1.0' },
    {
      capabilities: { tools: { listChanged: false }, resources: { listChanged: false }, prompts: { listChanged: false } },
      instructions:
        'FRAMEFORGE STUDIO tools. All write operations take a projectId and are undoable in the web app. ' +
        'Destructive tools are annotated with destructiveHint — never call them without explicit user confirmation. ' +
        'Read-only tools (list_*, get_*, validate_*) never modify data.',
    },
  );

  registerTools(server, toolCtx);
  registerResources(server, toolCtx);
  registerPrompts(server, toolCtx);

  return { server, toolCtx };
}
