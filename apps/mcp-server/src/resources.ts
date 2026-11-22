import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext } from './toolkit.js';
import { requireScope, getOwnedProject } from './toolkit.js';

function textJson(data: unknown) {
  return { contents: [{ uri: 'caller', mimeType: 'application/json', text: JSON.stringify(data, null, 2) }] };
}

export function registerResources(server: McpServer, toolCtx: ToolContext): void {
  const supabase = toolCtx.supabase;
  const ownerId = toolCtx.ctx.ownerId;

  const resourceText = (uri: string, data: unknown) =>
    ({ contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(data, null, 2) }] });

  // ---- static ----
  server.registerResource(
    'server-info', 'frameforge://server',
    { title: 'Server info', description: 'Server name, version, capabilities and transport', mimeType: 'application/json' },
    async () => resourceText('frameforge://server', {
      name: 'frameforge-mcp', version: '0.1.0', transport: 'Streamable HTTP', capabilities: ['tools', 'resources', 'prompts'],
    }),
  );

  server.registerResource(
    'projects', 'frameforge://projects',
    { title: 'Projects', description: 'List of the caller\'s projects', mimeType: 'application/json' },
    async () => {
      requireScope(toolCtx.ctx, 'read:projects');
      const { data, error } = await supabase.from('projects').select('*').eq('owner_id', ownerId).order('updated_at', { ascending: false });
      if (error) throw new Error(error.message);
      return resourceText('frameforge://projects', data ?? []);
    },
  );

  server.registerResource(
    'media', 'frameforge://media',
    { title: 'Media assets', description: 'List of the caller\'s media assets', mimeType: 'application/json' },
    async () => {
      requireScope(toolCtx.ctx, 'read:media');
      const { data, error } = await supabase.from('media_assets').select('*').eq('owner_id', ownerId).order('created_at', { ascending: false }).limit(100);
      if (error) throw new Error(error.message);
      return resourceText('frameforge://media', data ?? []);
    },
  );

  server.registerResource(
    'compositions', 'frameforge://compositions',
    { title: 'Compositions', description: 'List of compositions', mimeType: 'application/json' },
    async () => {
      requireScope(toolCtx.ctx, 'read:motion');
      const { data, error } = await supabase.from('compositions').select('*').eq('owner_id', ownerId).order('updated_at', { ascending: false });
      if (error) throw new Error(error.message);
      return resourceText('frameforge://compositions', data ?? []);
    },
  );

  server.registerResource(
    'subtitle-documents', 'frameforge://subtitles',
    { title: 'Subtitle documents', description: 'List of subtitle documents', mimeType: 'application/json' },
    async () => {
      requireScope(toolCtx.ctx, 'read:subtitles');
      const { data, error } = await supabase.from('subtitle_documents').select('*').eq('owner_id', ownerId).order('updated_at', { ascending: false });
      if (error) throw new Error(error.message);
      return resourceText('frameforge://subtitles', data ?? []);
    },
  );

  server.registerResource(
    'render-jobs', 'frameforge://render/jobs',
    { title: 'Render jobs', description: 'List of render jobs', mimeType: 'application/json' },
    async () => {
      requireScope(toolCtx.ctx, 'read:render');
      const { data, error } = await supabase.from('render_jobs').select('*').eq('owner_id', ownerId).order('created_at', { ascending: false }).limit(50);
      if (error) throw new Error(error.message);
      return resourceText('frameforge://render/jobs', data ?? []);
    },
  );

  server.registerResource(
    'mcp-keys', 'frameforge://mcp/keys',
    { title: 'MCP keys', description: 'List of the caller\'s API keys (metadata only — never includes secrets)', mimeType: 'application/json' },
    async () => {
      const { data, error } = await supabase.from('mcp_api_keys').select('id, name, scopes, created_at, last_used_at, revoked_at').eq('owner_id', ownerId).order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return resourceText('frameforge://mcp/keys', data ?? []);
    },
  );

  // ---- templated ----
  server.registerResource(
    'project', new ResourceTemplate('frameforge://projects/{projectId}', { list: undefined }),
    { title: 'Project', description: 'A single project by id', mimeType: 'application/json' },
    async (uri: any, variables: any) => {
      requireScope(toolCtx.ctx, 'read:projects');
      const { projectId } = variables;
      const project = await getOwnedProject(toolCtx, projectId);
      return resourceText(uri.href, project);
    },
  );

  server.registerResource(
    'timeline', new ResourceTemplate('frameforge://timelines/{projectId}', { list: undefined }),
    { title: 'Timeline', description: 'The timeline for a project', mimeType: 'application/json' },
    async (uri: any, variables: any) => {
      requireScope(toolCtx.ctx, 'read:timeline');
      const { projectId } = variables;
      await getOwnedProject(toolCtx, projectId);
      const { data, error } = await supabase.from('timeline_states').select('data, version').eq('project_id', projectId).maybeSingle();
      if (error) throw new Error(error.message);
      return resourceText(uri.href, data ?? { data: null, version: 0 });
    },
  );

  server.registerResource(
    'asset', new ResourceTemplate('frameforge://media/{assetId}', { list: undefined }),
    { title: 'Media asset', description: 'A single media asset by id', mimeType: 'application/json' },
    async (uri: any, variables: any) => {
      requireScope(toolCtx.ctx, 'read:media');
      const { assetId } = variables;
      const { data, error } = await supabase.from('media_assets').select('*').eq('id', assetId).eq('owner_id', ownerId).maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error(`Asset not found: ${assetId}`);
      return resourceText(uri.href, data);
    },
  );

  server.registerResource(
    'composition', new ResourceTemplate('frameforge://compositions/{compositionId}', { list: undefined }),
    { title: 'Composition', description: 'A single composition by id', mimeType: 'application/json' },
    async (uri: any, variables: any) => {
      requireScope(toolCtx.ctx, 'read:motion');
      const { compositionId } = variables;
      const { data, error } = await supabase.from('compositions').select('*').eq('id', compositionId).eq('owner_id', ownerId).maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error(`Composition not found: ${compositionId}`);
      return resourceText(uri.href, data);
    },
  );

  server.registerResource(
    'subtitle-document', new ResourceTemplate('frameforge://subtitles/{documentId}', { list: undefined }),
    { title: 'Subtitle document', description: 'A single subtitle document by id', mimeType: 'application/json' },
    async (uri: any, variables: any) => {
      requireScope(toolCtx.ctx, 'read:subtitles');
      const { documentId } = variables;
      const { data, error } = await supabase.from('subtitle_documents').select('*').eq('id', documentId).eq('owner_id', ownerId).maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error(`Document not found: ${documentId}`);
      return resourceText(uri.href, data);
    },
  );

  server.registerResource(
    'render-job', new ResourceTemplate('frameforge://render/jobs/{jobId}', { list: undefined }),
    { title: 'Render job', description: 'A single render job by id', mimeType: 'application/json' },
    async (uri: any, variables: any) => {
      requireScope(toolCtx.ctx, 'read:render');
      const { jobId } = variables;
      const { data, error } = await supabase.from('render_jobs').select('*').eq('id', jobId).eq('owner_id', ownerId).maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error(`Job not found: ${jobId}`);
      return resourceText(uri.href, data);
    },
  );
}
