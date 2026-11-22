import type { SupabaseClient } from '@supabase/supabase-js';
import type { McpAuthContext } from './supabase.js';
import { hasScope } from './auth.js';

/**
 * Shared tool infrastructure. Every tool:
 *  - requires a scope (checked at the top),
 *  - filters by the authenticated owner (never cross-tenant),
 *  - returns a structured JSON text payload.
 */
export interface ToolContext {
  ctx: McpAuthContext;
  supabase: SupabaseClient;
}

export function textJson(data: unknown) {
  return { content: [{ type: 'text' as const, text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }] };
}

export function requireScope(ctx: McpAuthContext, scope: string): void {
  if (!hasScope(ctx, scope)) {
    throw new Error(`Missing required scope: ${scope}. Ask the user to grant this scope to the API key.`);
  }
}

/** Fetch a project owned by the caller; throw a clear error otherwise (no cross-tenant leaks). */
export async function getOwnedProject(
  toolCtx: ToolContext,
  projectId: string,
): Promise<{ id: string; name: string; workspace_id: string; owner_id: string; aspect_ratio: string; width: number; height: number; fps: number; status: string; description: string | null; settings: Record<string, unknown>; created_at: string; updated_at: string }> {
  const { data, error } = await toolCtx.supabase
    .from('projects')
    .select('id, name, workspace_id, owner_id, aspect_ratio, width, height, fps, status, description, settings, created_at, updated_at')
    .eq('id', projectId)
    .eq('owner_id', toolCtx.ctx.ownerId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load project: ${error.message}`);
  if (!data) throw new Error(`Project not found: ${projectId}`);
  return data as any;
}

/** Fetch + load the timeline row for a project (owned). */
export async function loadTimeline(
  toolCtx: ToolContext,
  projectId: string,
): Promise<{ timeline: any; version: number }> {
  await getOwnedProject(toolCtx, projectId);
  const { data, error } = await toolCtx.supabase
    .from('timeline_states')
    .select('data, version')
    .eq('project_id', projectId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load timeline: ${error.message}`);
  if (!data) {
    // no timeline row yet — return the shared default so writes can seed it
    const { createDefaultTimeline } = await import('@frameforge/shared');
    return { timeline: createDefaultTimeline(), version: 0 };
  }
  return { timeline: data.data as any, version: (data.version as number) ?? 1 };
}

/** Save the timeline row (upsert). Returns the saved row. */
export async function saveTimeline(
  toolCtx: ToolContext,
  projectId: string,
  timeline: any,
  version: number,
): Promise<void> {
  const { error } = await toolCtx.supabase
    .from('timeline_states')
    .upsert({ project_id: projectId, data: timeline, version: version + 1, updated_at: new Date().toISOString() }, { onConflict: 'project_id' });
  if (error) throw new Error(`Failed to save timeline: ${error.message}`);
}

/** Append an audit log entry (best-effort, never blocks the tool). */
export async function logAudit(toolCtx: ToolContext, action: string, target: string, details: Record<string, unknown> = {}): Promise<void> {
  try {
    await toolCtx.supabase.from('audit_logs').insert({
      actor_id: toolCtx.ctx.ownerId,
      action,
      target,
      details: { ...details, key_fingerprint: toolCtx.ctx.keyId.slice(0, 12) },
    });
  } catch {
    /* audit failures must not break the operation */
  }
}

export function uuid(): string {
  return crypto.randomUUID();
}
