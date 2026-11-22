import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  createDefaultTimeline,
  timelineDuration,
  addClip,
  removeClip,
  duplicateClip,
  splitClip,
  moveClip,
  trimClip,
  setClipSpeed,
  setClipVolume,
  setClipOpacity,
  setClipText,
  setClipColor,
  addMarker,
  removeMarker,
  labelMarker,
  renameTrack,
  addTrack,
  rippleDelete,
  splitEveryClipAt,
  visibleClipsAt,
  parseCommand,
  setTrackFlag,
  parseSubtitles,
  serializeSrt,
  serializeVtt,
} from '@frameforge/shared';
import type { ToolContext } from './toolkit.js';
import { textJson, requireScope, getOwnedProject, loadTimeline, saveTimeline, logAudit, uuid } from './toolkit.js';

const projectIdSchema = z.string().uuid().describe('Project id (UUID)');

function projectTool<T>(
  server: McpServer,
  toolCtx: ToolContext,
  name: string,
  description: string,
  scope: string,
  inputSchema: Record<string, z.ZodTypeAny>,
  handler: (args: any, extra: any) => Promise<{ content: Array<{ type: 'text'; text: string }> }>,
  annotations: { readOnlyHint?: boolean; destructiveHint?: boolean } = {},
) {
  server.registerTool(
    name,
    {
      description,
      inputSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, ...annotations },
    },
    async (args: any, extra: any) => {
      try {
        requireScope(toolCtx.ctx, scope);
        const result = await handler(args, extra);
        await logAudit(toolCtx, actionFor(name), args?.projectId ?? args?.project_id ?? '', { tool: name });
        return result;
      } catch (e) {
        return textJson({ error: e instanceof Error ? e.message : 'Tool failed' });
      }
    },
  );
}

function actionFor(name: string): string {
  if (name.startsWith('list_') || name.startsWith('get_') || name === 'server_info' || name.startsWith('plan_') || name.startsWith('validate_')) return 'read';
  return 'write';
}

export function registerTools(server: McpServer, toolCtx: ToolContext): void {
  const ctx = toolCtx.ctx;
  const supabase = toolCtx.supabase;
  const ownerId = toolCtx.ctx.ownerId;

  // ---------- meta ----------
  projectTool(server, toolCtx, 'server_info', 'Report the server version, capabilities and scope catalogue.', 'read:ai', {},
    async () => textJson({
      server: 'frameforge-mcp',
      version: '0.1.0',
      ownerId,
      scopes: ctx.scopes,
      capabilities: ['tools', 'resources', 'prompts'],
      transport: 'Streamable HTTP',
    }),
    { readOnlyHint: true },
  );

  // ---------- projects ----------
  projectTool(server, toolCtx, 'list_projects', 'List the authenticated user\'s projects (newest first).', 'read:projects', {},
    async () => {
      const { data, error } = await supabase.from('projects').select('*').eq('owner_id', ownerId).order('updated_at', { ascending: false });
      if (error) throw new Error(`Failed to list projects: ${error.message}`);
      return textJson({ projects: data ?? [] });
    },
    { readOnlyHint: true },
  );

  projectTool(server, toolCtx, 'get_project', 'Fetch one project by id.', 'read:projects', { projectId: projectIdSchema },
    async ({ projectId }) => textJson(await getOwnedProject(toolCtx, projectId)),
    { readOnlyHint: true },
  );

  projectTool(server, toolCtx, 'create_project', 'Create a new project in the caller\'s workspace. Produces an empty timeline.', 'write:projects', {
    name: z.string().min(1).max(200),
    aspectRatio: z.enum(['16:9', '9:16', '1:1', '4:5', '4:3', '21:9']).default('16:9'),
    description: z.string().max(500).optional(),
  },
    async ({ name, aspectRatio, description }) => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Not authenticated');
      const { data: workspaces, error: wsErr } = await supabase.from('workspaces').select('id').eq('owner_id', ownerId).limit(1);
      if (wsErr) throw new Error(`Failed to find workspace: ${wsErr.message}`);
      let workspaceId = (workspaces?.[0] as { id: string } | undefined)?.id;
      if (!workspaceId) {
        const { data: created, error: cErr } = await supabase.from('workspaces').insert({ name: 'My Studio', owner_id: ownerId, plan: 'free' }).select('id').single();
        if (cErr) throw new Error(`Failed to create workspace: ${cErr.message}`);
        workspaceId = (created as { id: string }).id;
      }
      const dims: Record<string, [number, number]> = {
        '16:9': [1920, 1080], '9:16': [1080, 1920], '1:1': [1080, 1080], '4:5': [1080, 1350], '4:3': [1440, 1080], '21:9': [2560, 1080],
      };
      const [width, height] = dims[aspectRatio] ?? [1920, 1080];
      const { data, error } = await supabase.from('projects').insert({
        workspace_id: workspaceId, owner_id: ownerId, name, description: description ?? null,
        aspect_ratio: aspectRatio, width, height, status: 'draft',
      }).select().single();
      if (error) throw new Error(`Failed to create project: ${error.message}`);
      await supabase.from('timeline_states').insert({ project_id: data.id, data: createDefaultTimeline(), version: 1 });
      return textJson(data);
    },
  );

  projectTool(server, toolCtx, 'update_project', 'Update allowed project fields.', 'write:projects', {
    projectId: projectIdSchema,
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(500).nullable().optional(),
    status: z.enum(['draft', 'rendering', 'archived']).optional(),
  },
    async ({ projectId, ...patch }) => {
      await getOwnedProject(toolCtx, projectId);
      const payload: Record<string, unknown> = {};
      if (patch.name !== undefined) payload.name = patch.name;
      if (patch.description !== undefined) payload.description = patch.description;
      if (patch.status !== undefined) payload.status = patch.status;
      const { data, error } = await supabase.from('projects').update(payload).eq('id', projectId).select().single();
      if (error) throw new Error(`Failed to update project: ${error.message}`);
      return textJson(data);
    },
  );

  projectTool(server, toolCtx, 'delete_project', 'Delete a project and its timeline (destructive).', 'write:projects', {
    projectId: projectIdSchema,
  },
    async ({ projectId }) => {
      await getOwnedProject(toolCtx, projectId);
      const { error } = await supabase.from('projects').delete().eq('id', projectId);
      if (error) throw new Error(`Failed to delete project: ${error.message}`);
      return textJson({ deleted: true, projectId });
    },
    { destructiveHint: true },
  );

  projectTool(server, toolCtx, 'archive_project', 'Archive a project (keeps it, hides it from active lists).', 'write:projects', {
    projectId: projectIdSchema,
  },
    async ({ projectId }) => {
      await getOwnedProject(toolCtx, projectId);
      const { data, error } = await supabase.from('projects').update({ status: 'archived' }).eq('id', projectId).select().single();
      if (error) throw new Error(`Failed to archive project: ${error.message}`);
      return textJson(data);
    },
  );

  // ---------- timeline: read ----------
  projectTool(server, toolCtx, 'get_timeline', 'Fetch the full timeline for a project.', 'read:timeline', { projectId: projectIdSchema },
    async ({ projectId }) => {
      const { timeline, version } = await loadTimeline(toolCtx, projectId);
      return textJson({ timeline, version });
    },
    { readOnlyHint: true },
  );

  projectTool(server, toolCtx, 'get_timeline_summary', 'Duration, clip/track/marker counts and total media for a project.', 'read:timeline', {
    projectId: projectIdSchema,
  },
    async ({ projectId }) => {
      const { timeline } = await loadTimeline(toolCtx, projectId);
      return textJson({
        duration: timelineDuration(timeline),
        tracks: timeline.tracks.length,
        clips: timeline.clips.length,
        markers: timeline.markers.length,
        mediaIds: [...new Set(timeline.clips.map((c: any) => c.mediaId).filter(Boolean))],
      });
    },
    { readOnlyHint: true },
  );

  projectTool(server, toolCtx, 'list_tracks', 'List tracks with kind/visibility/mute/lock state.', 'read:timeline', { projectId: projectIdSchema },
    async ({ projectId }) => {
      const { timeline } = await loadTimeline(toolCtx, projectId);
      return textJson(timeline.tracks);
    },
    { readOnlyHint: true },
  );

  projectTool(server, toolCtx, 'list_clips', 'List clips on the timeline.', 'read:timeline', {
    projectId: projectIdSchema,
    trackId: z.string().optional(),
  },
    async ({ projectId, trackId }) => {
      const { timeline } = await loadTimeline(toolCtx, projectId);
      const clips = trackId ? timeline.clips.filter((c: any) => c.trackId === trackId) : timeline.clips;
      return textJson(clips);
    },
    { readOnlyHint: true },
  );

  projectTool(server, toolCtx, 'get_clip', 'Fetch one clip by id.', 'read:timeline', { projectId: projectIdSchema, clipId: z.string().uuid() },
    async ({ projectId, clipId }) => {
      const { timeline } = await loadTimeline(toolCtx, projectId);
      const clip = timeline.clips.find((c: any) => c.id === clipId);
      if (!clip) throw new Error(`Clip not found: ${clipId}`);
      return textJson(clip);
    },
    { readOnlyHint: true },
  );

  projectTool(server, toolCtx, 'list_markers', 'List markers.', 'read:timeline', { projectId: projectIdSchema },
    async ({ projectId }) => {
      const { timeline } = await loadTimeline(toolCtx, projectId);
      return textJson(timeline.markers);
    },
    { readOnlyHint: true },
  );

  projectTool(server, toolCtx, 'visible_clips_at', 'Clips visible at a time (seconds).', 'read:timeline', {
    projectId: projectIdSchema,
    time: z.number().min(0),
  },
    async ({ projectId, time }) => {
      const { timeline } = await loadTimeline(toolCtx, projectId);
      return textJson(visibleClipsAt(timeline as any, time));
    },
    { readOnlyHint: true },
  );

  projectTool(server, toolCtx, 'validate_timeline', 'Check for overlapping clips, locked-track clips, and bad clip data.', 'read:timeline', {
    projectId: projectIdSchema,
  },
    async ({ projectId }) => {
      const { timeline } = await loadTimeline(toolCtx, projectId);
      const issues: Array<{ code: string; message: string }> = [];
      const byTrack = new Map<string, any[]>();
      for (const clip of timeline.clips) {
        const track = timeline.tracks.find((t: any) => t.id === clip.trackId);
        if (!track) issues.push({ code: 'orphan_clip', message: `Clip ${clip.id} has no track ${clip.trackId}` });
        else if (track.locked) issues.push({ code: 'locked_track_clip', message: `Clip ${clip.id} is on locked track ${track.name}` });
        if (clip.duration <= 0) issues.push({ code: 'zero_duration', message: `Clip ${clip.id} has non-positive duration` });
        if (!byTrack.has(clip.trackId)) byTrack.set(clip.trackId, []);
        byTrack.get(clip.trackId)!.push(clip);
      }
      for (const [trackId, clips] of byTrack) {
        const sorted = [...clips].sort((a, b) => a.start - b.start);
        for (let i = 0; i < sorted.length - 1; i++) {
          const a = sorted[i]!; const b = sorted[i + 1]!;
          if (a.start + a.duration > b.start) issues.push({ code: 'overlap', message: `Clips ${a.id} and ${b.id} overlap on track ${trackId}` });
        }
      }
      return textJson({ valid: issues.length === 0, issues });
    },
    { readOnlyHint: true },
  );

  // ---------- timeline: write ----------
  projectTool(server, toolCtx, 'add_clip', 'Add a clip to a track. Overlap is auto-resolved by nudging.', 'write:timeline', {
    projectId: projectIdSchema,
    trackId: z.string().optional(),
    kind: z.enum(['video', 'audio', 'text', 'solid', 'image', 'motion']).default('video'),
    name: z.string().max(200).default('Clip'),
    mediaId: z.string().uuid().nullable().optional(),
    start: z.number().min(0).default(0),
    duration: z.number().min(0.05).default(5),
    inPoint: z.number().min(0).default(0),
    speed: z.number().positive().default(1),
    volume: z.number().min(0).max(2).default(1),
    opacity: z.number().min(0).max(1).default(1),
    transform: z.object({ x: z.number().default(0), y: z.number().default(0), scale: z.number().default(1), rotation: z.number().default(0) }).optional(),
  },
    async ({ projectId, trackId, kind, name, mediaId, start, duration, inPoint, speed, volume, opacity, transform }) => {
      const { timeline, version } = await loadTimeline(toolCtx, projectId);
      const idsBefore = new Set(timeline.clips.map((c: any) => c.id));
      const track = trackId
        ? timeline.tracks.find((t: any) => t.id === trackId)
        : timeline.tracks.find((t: any) => t.kind === (kind === 'audio' ? 'audio' : 'video'));
      if (!track) throw new Error('No suitable track found — pass trackId or create a track first');
      const next = addClip(timeline as any, track.id, {
        mediaId: mediaId ?? null,
        layerKind: kind,
        name,
        start,
        duration,
        inPoint,
        outPoint: null,
        speed,
        volume,
        opacity,
        transform: transform ?? { x: 0, y: 0, scale: 1, rotation: 0 },
      } as any);
      const added = next.clips.find((c: any) => !idsBefore.has(c.id));
      await saveTimeline(toolCtx, projectId, next, version);
      return textJson({ added: added ?? { trackId: track.id, name, start, duration } });
    },
  );

  projectTool(server, toolCtx, 'remove_clip', 'Remove a clip, optionally ripple-shifting later clips.', 'write:timeline', {
    projectId: projectIdSchema,
    clipId: z.string().uuid(),
    ripple: z.boolean().default(false),
  },
    async ({ projectId, clipId, ripple }) => {
      const { timeline, version } = await loadTimeline(toolCtx, projectId);
      const next = ripple ? rippleDelete(timeline as any, clipId) : removeClip(timeline as any, clipId);
      await saveTimeline(toolCtx, projectId, next, version);
      return textJson({ removed: true, clipId, ripple });
    },
    { destructiveHint: true },
  );

  projectTool(server, toolCtx, 'split_clip', 'Split one clip at a specific time.', 'write:timeline', {
    projectId: projectIdSchema,
    clipId: z.string().uuid(),
    time: z.number().min(0),
  },
    async ({ projectId, clipId, time }) => {
      const { timeline, version } = await loadTimeline(toolCtx, projectId);
      const next = splitClip(timeline as any, clipId, time);
      await saveTimeline(toolCtx, projectId, next, version);
      return textJson({ clipId, time });
    },
  );

  projectTool(server, toolCtx, 'split_all_at', 'Split every clip covering a time.', 'write:timeline', {
    projectId: projectIdSchema,
    time: z.number().min(0),
  },
    async ({ projectId, time }) => {
      const { timeline, version } = await loadTimeline(toolCtx, projectId);
      const next = splitEveryClipAt(timeline as any, time);
      await saveTimeline(toolCtx, projectId, next, version);
      return textJson({ time, clipCount: next.clips.length });
    },
  );

  projectTool(server, toolCtx, 'duplicate_clip', 'Duplicate a clip, offset by 0.5s.', 'write:timeline', {
    projectId: projectIdSchema,
    clipId: z.string().uuid(),
  },
    async ({ projectId, clipId }) => {
      const { timeline, version } = await loadTimeline(toolCtx, projectId);
      const next = duplicateClip(timeline as any, clipId);
      await saveTimeline(toolCtx, projectId, next, version);
      return textJson({ duplicated: true, clipId });
    },
  );

  projectTool(server, toolCtx, 'move_clip', 'Move a clip to a new start time.', 'write:timeline', {
    projectId: projectIdSchema,
    clipId: z.string().uuid(),
    start: z.number().min(0),
  },
    async ({ projectId, clipId, start }) => {
      const { timeline, version } = await loadTimeline(toolCtx, projectId);
      const next = moveClip(timeline as any, clipId, start);
      await saveTimeline(toolCtx, projectId, next, version);
      return textJson(next.clips.find((c: any) => c.id === clipId));
    },
  );

  projectTool(server, toolCtx, 'trim_clip', 'Trim the start or end of a clip by a signed delta (seconds).', 'write:timeline', {
    projectId: projectIdSchema,
    clipId: z.string().uuid(),
    edge: z.enum(['start', 'end']),
    delta: z.number(),
  },
    async ({ projectId, clipId, edge, delta }) => {
      const { timeline, version } = await loadTimeline(toolCtx, projectId);
      const next = trimClip(timeline as any, clipId, edge, delta);
      await saveTimeline(toolCtx, projectId, next, version);
      return textJson(next.clips.find((c: any) => c.id === clipId));
    },
  );

  projectTool(server, toolCtx, 'set_clip_speed', 'Set a clip\'s playback speed (0.1..8).', 'write:timeline', {
    projectId: projectIdSchema,
    clipId: z.string().uuid(),
    speed: z.number().min(0.1).max(8),
  },
    async ({ projectId, clipId, speed }) => {
      const { timeline, version } = await loadTimeline(toolCtx, projectId);
      const next = setClipSpeed(timeline as any, clipId, speed);
      await saveTimeline(toolCtx, projectId, next, version);
      return textJson(next.clips.find((c: any) => c.id === clipId));
    },
  );

  projectTool(server, toolCtx, 'set_clip_volume', 'Set a clip\'s volume (0..2).', 'write:timeline', {
    projectId: projectIdSchema,
    clipId: z.string().uuid(),
    volume: z.number().min(0).max(2),
  },
    async ({ projectId, clipId, volume }) => {
      const { timeline, version } = await loadTimeline(toolCtx, projectId);
      const next = setClipVolume(timeline as any, clipId, volume);
      await saveTimeline(toolCtx, projectId, next, version);
      return textJson(next.clips.find((c: any) => c.id === clipId));
    },
  );

  projectTool(server, toolCtx, 'set_clip_opacity', 'Set a clip\'s opacity (0..1).', 'write:timeline', {
    projectId: projectIdSchema,
    clipId: z.string().uuid(),
    opacity: z.number().min(0).max(1),
  },
    async ({ projectId, clipId, opacity }) => {
      const { timeline, version } = await loadTimeline(toolCtx, projectId);
      const next = setClipOpacity(timeline as any, clipId, opacity);
      await saveTimeline(toolCtx, projectId, next, version);
      return textJson(next.clips.find((c: any) => c.id === clipId));
    },
  );

  projectTool(server, toolCtx, 'set_clip_text', 'Set the text of a text clip.', 'write:timeline', {
    projectId: projectIdSchema,
    clipId: z.string().uuid(),
    text: z.string().max(500),
  },
    async ({ projectId, clipId, text }) => {
      const { timeline, version } = await loadTimeline(toolCtx, projectId);
      const next = setClipText(timeline as any, clipId, text);
      await saveTimeline(toolCtx, projectId, next, version);
      return textJson(next.clips.find((c: any) => c.id === clipId));
    },
  );

  projectTool(server, toolCtx, 'set_clip_color', 'Set a clip\'s solid color.', 'write:timeline', {
    projectId: projectIdSchema,
    clipId: z.string().uuid(),
    color: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/),
  },
    async ({ projectId, clipId, color }) => {
      const { timeline, version } = await loadTimeline(toolCtx, projectId);
      const next = setClipColor(timeline as any, clipId, color);
      await saveTimeline(toolCtx, projectId, next, version);
      return textJson(next.clips.find((c: any) => c.id === clipId));
    },
  );

  projectTool(server, toolCtx, 'add_marker', 'Add a marker at a time.', 'write:timeline', {
    projectId: projectIdSchema,
    time: z.number().min(0),
    label: z.string().max(120).optional(),
  },
    async ({ projectId, time, label }) => {
      const { timeline, version } = await loadTimeline(toolCtx, projectId);
      const next = addMarker(timeline as any, time, label);
      await saveTimeline(toolCtx, projectId, next, version);
      return textJson(next.markers[next.markers.length - 1]);
    },
  );

  projectTool(server, toolCtx, 'remove_marker', 'Remove a marker by id.', 'write:timeline', {
    projectId: projectIdSchema,
    markerId: z.string().uuid(),
  },
    async ({ projectId, markerId }) => {
      const { timeline, version } = await loadTimeline(toolCtx, projectId);
      const next = removeMarker(timeline as any, markerId);
      await saveTimeline(toolCtx, projectId, next, version);
      return textJson({ removed: true, markerId });
    },
    { destructiveHint: true },
  );

  projectTool(server, toolCtx, 'label_marker', 'Rename a marker.', 'write:timeline', {
    projectId: projectIdSchema,
    markerId: z.string().uuid(),
    label: z.string().max(120),
  },
    async ({ projectId, markerId, label }) => {
      const { timeline, version } = await loadTimeline(toolCtx, projectId);
      const next = labelMarker(timeline as any, markerId, label);
      await saveTimeline(toolCtx, projectId, next, version);
      return textJson(next.markers.find((m: any) => m.id === markerId));
    },
  );

  projectTool(server, toolCtx, 'set_track_flag', 'Toggle a track flag (mute/locked/visible/solo).', 'write:timeline', {
    projectId: projectIdSchema,
    trackId: z.string().uuid(),
    flag: z.enum(['muted', 'locked', 'visible', 'solo']),
    value: z.boolean(),
  },
    async ({ projectId, trackId, flag, value }) => {
      const { timeline, version } = await loadTimeline(toolCtx, projectId);
      const next = setTrackFlag(timeline as any, trackId, flag as any, value);
      await saveTimeline(toolCtx, projectId, next, version);
      return textJson(next.tracks.find((t: any) => t.id === trackId));
    },
  );

  projectTool(server, toolCtx, 'rename_track', 'Rename a track.', 'write:timeline', {
    projectId: projectIdSchema,
    trackId: z.string().uuid(),
    name: z.string().min(1).max(120),
  },
    async ({ projectId, trackId, name }) => {
      const { timeline, version } = await loadTimeline(toolCtx, projectId);
      const next = renameTrack(timeline as any, trackId, name);
      await saveTimeline(toolCtx, projectId, next, version);
      return textJson(next.tracks.find((t: any) => t.id === trackId));
    },
  );

  projectTool(server, toolCtx, 'add_track', 'Add a track (video or audio).', 'write:timeline', {
    projectId: projectIdSchema,
    kind: z.enum(['video', 'audio']),
    name: z.string().max(120).optional(),
  },
    async ({ projectId, kind, name }) => {
      const { timeline, version } = await loadTimeline(toolCtx, projectId);
      let next = addTrack(timeline as any, kind);
      if (name) next = renameTrack(next, next.tracks[next.tracks.length - 1]!.id, name);
      await saveTimeline(toolCtx, projectId, next, version);
      return textJson(next.tracks[next.tracks.length - 1]);
    },
  );

  projectTool(server, toolCtx, 'clear_timeline', 'Remove every clip (destructive).', 'write:timeline', {
    projectId: projectIdSchema,
  },
    async ({ projectId }) => {
      const { timeline, version } = await loadTimeline(toolCtx, projectId);
      const next = { ...timeline, clips: [], markers: [] };
      await saveTimeline(toolCtx, projectId, next, version);
      return textJson({ cleared: true, projectId });
    },
    { destructiveHint: true },
  );

  // ---------- media ----------
  projectTool(server, toolCtx, 'list_media_assets', 'List media assets owned by the caller (newest first).', 'read:media', {
    projectId: z.string().uuid().optional(),
  },
    async ({ projectId }) => {
      let q = supabase.from('media_assets').select('*').eq('owner_id', ownerId).order('created_at', { ascending: false }).limit(100);
      if (projectId) q = q.eq('project_id', projectId);
      const { data, error } = await q;
      if (error) throw new Error(`Failed to list assets: ${error.message}`);
      return textJson(data ?? []);
    },
    { readOnlyHint: true },
  );

  projectTool(server, toolCtx, 'get_media_asset', 'Fetch one media asset by id.', 'read:media', {
    assetId: z.string().uuid(),
  },
    async ({ assetId }) => {
      const { data, error } = await supabase.from('media_assets').select('*').eq('id', assetId).eq('owner_id', ownerId).maybeSingle();
      if (error) throw new Error(`Failed to get asset: ${error.message}`);
      if (!data) throw new Error(`Asset not found: ${assetId}`);
      return textJson(data);
    },
    { readOnlyHint: true },
  );

  projectTool(server, toolCtx, 'search_media_assets', 'Search assets by name substring.', 'read:media', {
    query: z.string().min(1).max(200),
    projectId: z.string().uuid().optional(),
  },
    async ({ query, projectId }) => {
      let q = supabase.from('media_assets').select('*').eq('owner_id', ownerId).ilike('name', `%${query}%`).limit(50);
      if (projectId) q = q.eq('project_id', projectId);
      const { data, error } = await q;
      if (error) throw new Error(`Failed to search assets: ${error.message}`);
      return textJson(data ?? []);
    },
    { readOnlyHint: true },
  );

  projectTool(server, toolCtx, 'attach_media_to_project', 'Move a media asset into a project.', 'write:media', {
    assetId: z.string().uuid(),
    projectId: projectIdSchema,
  },
    async ({ assetId, projectId }) => {
      await getOwnedProject(toolCtx, projectId);
      const { data, error } = await supabase.from('media_assets').update({ project_id: projectId }).eq('id', assetId).eq('owner_id', ownerId).select().single();
      if (error) throw new Error(`Failed to attach asset: ${error.message}`);
      return textJson(data);
    },
  );

  projectTool(server, toolCtx, 'delete_media_asset', 'Delete a media asset row (destructive). File itself stays in storage.', 'write:media', {
    assetId: z.string().uuid(),
  },
    async ({ assetId }) => {
      const { error } = await supabase.from('media_assets').delete().eq('id', assetId).eq('owner_id', ownerId);
      if (error) throw new Error(`Failed to delete asset: ${error.message}`);
      return textJson({ deleted: true, assetId });
    },
    { destructiveHint: true },
  );

  // ---------- motion ----------
  projectTool(server, toolCtx, 'list_compositions', 'List compositions owned by the caller.', 'read:motion', {
    projectId: z.string().uuid().optional(),
  },
    async ({ projectId }) => {
      let q = supabase.from('compositions').select('*').eq('owner_id', ownerId).order('updated_at', { ascending: false });
      if (projectId) q = q.eq('project_id', projectId);
      const { data, error } = await q;
      if (error) throw new Error(`Failed to list compositions: ${error.message}`);
      return textJson(data ?? []);
    },
    { readOnlyHint: true },
  );

  projectTool(server, toolCtx, 'get_composition', 'Fetch one composition by id.', 'read:motion', {
    compositionId: z.string().uuid(),
  },
    async ({ compositionId }) => {
      const { data, error } = await supabase.from('compositions').select('*').eq('id', compositionId).eq('owner_id', ownerId).maybeSingle();
      if (error) throw new Error(`Failed to get composition: ${error.message}`);
      if (!data) throw new Error(`Composition not found: ${compositionId}`);
      return textJson(data);
    },
    { readOnlyHint: true },
  );

  projectTool(server, toolCtx, 'create_composition', 'Create a new composition (motion project).', 'write:motion', {
    name: z.string().min(1).max(200),
    projectId: z.string().uuid().optional(),
    width: z.number().int().min(64).max(8192).default(1920),
    height: z.number().int().min(64).max(8192).default(1080),
    fps: z.number().int().min(1).max(120).default(30),
    duration: z.number().min(0.5).max(600).default(10),
  },
    async ({ name, projectId, width, height, fps, duration }) => {
      if (projectId) await getOwnedProject(toolCtx, projectId);
      const { data, error } = await supabase.from('compositions').insert({
        name, project_id: projectId ?? null, owner_id: ownerId, width, height, fps, duration,
        background_color: '#0a0a0a', data: { layers: [] },
      }).select().single();
      if (error) throw new Error(`Failed to create composition: ${error.message}`);
      return textJson(data);
    },
  );

  projectTool(server, toolCtx, 'update_composition', 'Update composition settings.', 'write:motion', {
    compositionId: z.string().uuid(),
    name: z.string().min(1).max(200).optional(),
    width: z.number().int().min(64).max(8192).optional(),
    height: z.number().int().min(64).max(8192).optional(),
    fps: z.number().int().min(1).max(120).optional(),
    duration: z.number().min(0.5).max(600).optional(),
    backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  },
    async ({ compositionId, ...patch }) => {
      if (!patch.name && !patch.width && !patch.height && !patch.fps && !patch.duration && !patch.backgroundColor) throw new Error('Nothing to update');
      const payload: Record<string, unknown> = {};
      if (patch.name !== undefined) payload.name = patch.name;
      if (patch.width !== undefined) payload.width = patch.width;
      if (patch.height !== undefined) payload.height = patch.height;
      if (patch.fps !== undefined) payload.fps = patch.fps;
      if (patch.duration !== undefined) payload.duration = patch.duration;
      if (patch.backgroundColor !== undefined) payload.background_color = patch.backgroundColor;
      const { data, error } = await supabase.from('compositions').update(payload).eq('id', compositionId).eq('owner_id', ownerId).select().single();
      if (error) throw new Error(`Failed to update composition: ${error.message}`);
      return textJson(data);
    },
  );

  projectTool(server, toolCtx, 'delete_composition', 'Delete a composition (destructive).', 'write:motion', {
    compositionId: z.string().uuid(),
  },
    async ({ compositionId }) => {
      const { error } = await supabase.from('compositions').delete().eq('id', compositionId).eq('owner_id', ownerId);
      if (error) throw new Error(`Failed to delete composition: ${error.message}`);
      return textJson({ deleted: true, compositionId });
    },
    { destructiveHint: true },
  );

  projectTool(server, toolCtx, 'add_layer', 'Add a layer to a composition (text/solid/gradient/shape/image).', 'write:motion', {
    compositionId: z.string().uuid(),
    name: z.string().min(1).max(120),
    kind: z.enum(['text', 'solid', 'gradient', 'shape', 'image']).default('text'),
    text: z.string().max(500).optional(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    shape: z.enum(['rect', 'ellipse', 'triangle', 'star', 'line']).optional(),
    gradient: z.object({ from: z.string(), to: z.string(), angle: z.number().default(90) }).optional(),
    solidColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  },
    async ({ compositionId, name, kind, text, color, shape, gradient, solidColor }) => {
      const { data: row, error: fetchErr } = await supabase.from('compositions').select('*').eq('id', compositionId).eq('owner_id', ownerId).maybeSingle();
      if (fetchErr) throw new Error(`Failed to load composition: ${fetchErr.message}`);
      if (!row) throw new Error(`Composition not found: ${compositionId}`);
      const data = (row as any).data ?? { layers: [] };
      const layer = {
        id: uuid(),
        name,
        kind,
        visible: true,
        locked: false,
        lockedToParent: false,
        parentId: null,
        transform: { x: 0, y: 0, scale: 1, rotation: 0 },
        anchor: { x: 0, y: 0 },
        keyframes: {},
        ...(kind === 'text' ? { text } : {}),
        ...(kind === 'solid' || kind === 'gradient' ? { solidColor } : {}),
        ...(kind === 'gradient' ? { gradient } : {}),
        ...(kind === 'shape' ? { shape, color } : {}),
      };
      const next = { ...data, layers: [...(data.layers ?? []), layer] };
      const { data: updated, error } = await supabase.from('compositions').update({ data: next }).eq('id', compositionId).eq('owner_id', ownerId).select().single();
      if (error) throw new Error(`Failed to add layer: ${error.message}`);
      return textJson({ layer, composition: updated });
    },
  );

  projectTool(server, toolCtx, 'remove_layer', 'Remove a layer (destructive).', 'write:motion', {
    compositionId: z.string().uuid(),
    layerId: z.string().uuid(),
  },
    async ({ compositionId, layerId }) => {
      const { data: row, error: fetchErr } = await supabase.from('compositions').select('*').eq('id', compositionId).eq('owner_id', ownerId).maybeSingle();
      if (fetchErr) throw new Error(`Failed to load composition: ${fetchErr.message}`);
      if (!row) throw new Error(`Composition not found: ${compositionId}`);
      const data = (row as any).data ?? { layers: [] };
      const next = { ...data, layers: (data.layers ?? []).filter((l: any) => l.id !== layerId) };
      const { data: updated, error } = await supabase.from('compositions').update({ data: next }).eq('id', compositionId).eq('owner_id', ownerId).select().single();
      if (error) throw new Error(`Failed to remove layer: ${error.message}`);
      return textJson({ removed: true, composition: updated });
    },
    { destructiveHint: true },
  );

  projectTool(server, toolCtx, 'set_layer_visible', 'Toggle a layer visibility.', 'write:motion', {
    compositionId: z.string().uuid(),
    layerId: z.string().uuid(),
    visible: z.boolean(),
  },
    async ({ compositionId, layerId, visible }) => {
      const { data: row } = await supabase.from('compositions').select('data').eq('id', compositionId).eq('owner_id', ownerId).maybeSingle();
      if (!row) throw new Error(`Composition not found: ${compositionId}`);
      const data = (row as any).data ?? { layers: [] };
      const layers = (data.layers ?? []).map((l: any) => (l.id === layerId ? { ...l, visible } : l));
      const next = { ...data, layers };
      const { data: updated, error } = await supabase.from('compositions').update({ data: next }).eq('id', compositionId).eq('owner_id', ownerId).select().single();
      if (error) throw new Error(`Failed to update layer: ${error.message}`);
      return textJson({ layerId, visible, composition: updated });
    },
  );

  projectTool(server, toolCtx, 'add_keyframe', 'Add a keyframe to a layer at a time.', 'write:motion', {
    compositionId: z.string().uuid(),
    layerId: z.string().uuid(),
    property: z.string().min(1).max(120).describe('Property path, e.g. transform.x or opacity'),
    time: z.number().min(0),
    value: z.number(),
    easing: z.enum(['linear', 'easeIn', 'easeOut', 'easeInOut', 'easeInOutBack', 'easeInOutElastic', 'cubicBezier']).default('easeInOut'),
  },
    async ({ compositionId, layerId, property, time, value, easing }) => {
      const { data: row } = await supabase.from('compositions').select('data').eq('id', compositionId).eq('owner_id', ownerId).maybeSingle();
      if (!row) throw new Error(`Composition not found: ${compositionId}`);
      const data = (row as any).data ?? { layers: [] };
      const layers = (data.layers ?? []).map((l: any) => {
        if (l.id !== layerId) return l;
        const keyframes = { ...(l.keyframes ?? {}) };
        const track = [...(keyframes[property] ?? []), { id: uuid(), time, value, easing }].sort((a, b) => a.time - b.time);
        keyframes[property] = track;
        return { ...l, keyframes };
      });
      const next = { ...data, layers };
      const { data: updated, error } = await supabase.from('compositions').update({ data: next }).eq('id', compositionId).eq('owner_id', ownerId).select().single();
      if (error) throw new Error(`Failed to add keyframe: ${error.message}`);
      return textJson({ layerId, property, keyframe: { time, value, easing }, composition: updated });
    },
  );

  projectTool(server, toolCtx, 'remove_keyframe', 'Remove keyframes at a specific time on a property.', 'write:motion', {
    compositionId: z.string().uuid(),
    layerId: z.string().uuid(),
    property: z.string().min(1).max(120),
    time: z.number().min(0),
  },
    async ({ compositionId, layerId, property, time }) => {
      const { data: row } = await supabase.from('compositions').select('data').eq('id', compositionId).eq('owner_id', ownerId).maybeSingle();
      if (!row) throw new Error(`Composition not found: ${compositionId}`);
      const data = (row as any).data ?? { layers: [] };
      const layers: any[] = [];
      for (const l of data.layers ?? []) {
        if (l.id !== layerId) { layers.push(l); continue; }
        const keyframes = { ...(l.keyframes ?? {}) };
        if (keyframes[property]) {
          const kept = keyframes[property].filter((k: any) => Math.abs(k.time - time) > 0.001);
          if (kept.length) keyframes[property] = kept; else delete keyframes[property];
        }
        layers.push({ ...l, keyframes });
      }
      const next = { ...data, layers };
      const { data: updated, error } = await supabase.from('compositions').update({ data: next }).eq('id', compositionId).eq('owner_id', ownerId).select().single();
      if (error) throw new Error(`Failed to remove keyframe: ${error.message}`);
      return textJson({ layerId, property, time, composition: updated });
    },
  );

  // ---------- subtitles ----------
  projectTool(server, toolCtx, 'list_subtitle_documents', 'List subtitle documents owned by the caller.', 'read:subtitles', {
    projectId: z.string().uuid().optional(),
  },
    async ({ projectId }) => {
      let q = supabase.from('subtitle_documents').select('*').eq('owner_id', ownerId).order('updated_at', { ascending: false });
      if (projectId) q = q.eq('project_id', projectId);
      const { data, error } = await q;
      if (error) throw new Error(`Failed to list documents: ${error.message}`);
      return textJson(data ?? []);
    },
    { readOnlyHint: true },
  );

  projectTool(server, toolCtx, 'get_subtitle_document', 'Fetch one subtitle document by id.', 'read:subtitles', {
    documentId: z.string().uuid(),
  },
    async ({ documentId }) => {
      const { data, error } = await supabase.from('subtitle_documents').select('*').eq('id', documentId).eq('owner_id', ownerId).maybeSingle();
      if (error) throw new Error(`Failed to get document: ${error.message}`);
      if (!data) throw new Error(`Document not found: ${documentId}`);
      return textJson(data);
    },
    { readOnlyHint: true },
  );

  projectTool(server, toolCtx, 'create_subtitle_document', 'Create a subtitle document with cues. Either pass cues directly or raw subtitle text (SRT/VTT).', 'write:subtitles', {
    name: z.string().min(1).max(200),
    projectId: z.string().uuid().optional(),
    language: z.enum(['en', 'am']).default('en'),
    cues: z.array(z.object({ start: z.number().min(0), end: z.number().min(0), text: z.string().min(1).max(500) })).max(5000).optional(),
    text: z.string().max(200_000).optional(),
  },
    async ({ name, projectId, language, cues, text }) => {
      if (projectId) await getOwnedProject(toolCtx, projectId);
      let parsedCues: any[] = cues ?? [];
      if (!parsedCues.length && text) {
        parsedCues = parseSubtitles(text);
      }
      if (!parsedCues.length) throw new Error('No cues provided and no parseable text');
      for (const c of parsedCues) {
        if (c.end <= c.start) throw new Error(`Invalid cue: end (${c.end}) must be after start (${c.start})`);
      }
      const normalized = parsedCues.map((c, i) => ({ index: i + 1, start: c.start, end: c.end, text: c.text, style: c.style ?? 'default' }));
      const { data, error } = await supabase.from('subtitle_documents').insert({
        name, project_id: projectId ?? null, owner_id: ownerId, language,
        data: { cues: normalized, language },
      }).select().single();
      if (error) throw new Error(`Failed to create document: ${error.message}`);
      return textJson({ document: data, srt: serializeSrt(normalized), vtt: serializeVtt(normalized) });
    },
  );

  projectTool(server, toolCtx, 'update_subtitle_document', 'Replace the cues of a subtitle document.', 'write:subtitles', {
    documentId: z.string().uuid(),
    cues: z.array(z.object({ start: z.number().min(0), end: z.number().min(0), text: z.string().min(1).max(500) })).max(5000),
  },
    async ({ documentId, cues }) => {
      for (const c of cues) {
        if (c.end <= c.start) throw new Error(`Invalid cue: end (${c.end}) must be after start (${c.start})`);
      }
      const normalized = cues.map((c: any, i: number) => ({ index: i + 1, start: c.start, end: c.end, text: c.text, style: 'default' as const }));
      const { data, error } = await supabase.from('subtitle_documents').select('data').eq('id', documentId).eq('owner_id', ownerId).maybeSingle();
      if (error) throw new Error(`Failed to load document: ${error.message}`);
      if (!data) throw new Error(`Document not found: ${documentId}`);
      const nextData = { ...((data as any).data ?? {}), cues: normalized };
      const { data: updated, error: updateErr } = await supabase.from('subtitle_documents').update({ data: nextData }).eq('id', documentId).eq('owner_id', ownerId).select().single();
      if (updateErr) throw new Error(`Failed to update document: ${updateErr.message}`);
      return textJson({ document: updated, srt: serializeSrt(normalized), vtt: serializeVtt(normalized) });
    },
  );

  projectTool(server, toolCtx, 'delete_subtitle_document', 'Delete a subtitle document (destructive).', 'write:subtitles', {
    documentId: z.string().uuid(),
  },
    async ({ documentId }) => {
      const { error } = await supabase.from('subtitle_documents').delete().eq('id', documentId).eq('owner_id', ownerId);
      if (error) throw new Error(`Failed to delete document: ${error.message}`);
      return textJson({ deleted: true, documentId });
    },
    { destructiveHint: true },
  );

  // ---------- render ----------
  projectTool(server, toolCtx, 'list_render_jobs', 'List render jobs owned by the caller (newest first).', 'read:render', {
    projectId: z.string().uuid().optional(),
  },
    async ({ projectId }) => {
      let q = supabase.from('render_jobs').select('*').eq('owner_id', ownerId).order('created_at', { ascending: false }).limit(50);
      if (projectId) q = q.eq('project_id', projectId);
      const { data, error } = await q;
      if (error) throw new Error(`Failed to list jobs: ${error.message}`);
      return textJson(data ?? []);
    },
    { readOnlyHint: true },
  );

  projectTool(server, toolCtx, 'get_render_job', 'Fetch one render job by id.', 'read:render', {
    jobId: z.string().uuid(),
  },
    async ({ jobId }) => {
      const { data, error } = await supabase.from('render_jobs').select('*').eq('id', jobId).eq('owner_id', ownerId).maybeSingle();
      if (error) throw new Error(`Failed to get job: ${error.message}`);
      if (!data) throw new Error(`Job not found: ${jobId}`);
      return textJson(data);
    },
    { readOnlyHint: true },
  );

  projectTool(server, toolCtx, 'create_render_job', 'Queue an export job (in-browser or server worker).', 'write:render', {
    projectId: projectIdSchema,
    kind: z.enum(['export_video', 'export_audio', 'thumbnail', 'proxy']).default('export_video'),
    settings: z.record(z.string(), z.unknown()).optional(),
  },
    async ({ projectId, kind, settings }) => {
      await getOwnedProject(toolCtx, projectId);
      const { data, error } = await supabase.from('render_jobs').insert({
        project_id: projectId, owner_id: ownerId, kind, status: 'queued', settings: settings ?? {},
      }).select().single();
      if (error) throw new Error(`Failed to create job: ${error.message}`);
      return textJson(data);
    },
  );

  projectTool(server, toolCtx, 'cancel_render_job', 'Cancel a queued/running render job.', 'write:render', {
    jobId: z.string().uuid(),
  },
    async ({ jobId }) => {
      const { data, error } = await supabase.from('render_jobs').update({ status: 'cancelled' }).eq('id', jobId).eq('owner_id', ownerId).select().single();
      if (error) throw new Error(`Failed to cancel job: ${error.message}`);
      return textJson(data);
    },
    { destructiveHint: true },
  );

  // ---------- AI ----------
  projectTool(server, toolCtx, 'plan_edit', 'Parse a natural-language edit command into a validated plan. Non-destructive — nothing is applied.', 'read:ai', {
    projectId: projectIdSchema.optional(),
    command: z.string().min(1).max(1000),
    playheadTime: z.number().min(0).optional(),
    selectedClipId: z.string().uuid().optional(),
  },
    async ({ projectId, command, playheadTime, selectedClipId }) => {
      if (projectId) await getOwnedProject(toolCtx, projectId);
      const { timeline } = projectId ? await loadTimeline(toolCtx, projectId) : { timeline: createDefaultTimeline() };
      const plan = parseCommand(command, {
        playheadTime: playheadTime ?? 0,
        selectedClipId: selectedClipId ?? null,
        timeline,
        hasAudioTracks: timeline.tracks.some((t: any) => t.kind === 'audio'),
      });
      return textJson(plan);
    },
    { readOnlyHint: true },
  );

  projectTool(server, toolCtx, 'ai_capabilities', 'Report the AI assistant capabilities available to this deployment.', 'read:ai', {},
    async () => textJson({
      localPlanner: true,
      silenceRemoval: 'local-rms',
      voiceover: 'provider-dependent — set provider keys for cloud TTS; browser SpeechSynthesis is always available in the web app',
      autoSubtitles: 'provider-dependent — requires speech-to-text provider keys',
      llmEditing: 'provider-dependent — set ANTHROPIC_API_KEY (or compatible) for natural-language planning',
      neverClaimsCompletion: true,
    }),
    { readOnlyHint: true },
  );
}
