import { createHash } from 'crypto';
import type { McpAuthContext } from './supabase.js';
import type { McpConfig } from './config.js';
import { getServiceClient } from './supabase.js';

/** SHA-256 hex of the bearer token — matches the browser-side generator in apps/web (mcp/page.tsx). */
export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export async function verifyBearerToken(config: McpConfig, token: string): Promise<McpAuthContext | null> {
  if (!token) return null;
  const supabase = getServiceClient(config);
  const hash = hashApiKey(token);
  const { data, error } = await supabase
    .from('mcp_api_keys')
    .select('id, owner_id, scopes, revoked_at, created_at')
    .eq('key_hash', hash)
    .maybeSingle();
  if (error || !data) return null;
  if (data.revoked_at) return null;

  if (config.tokenTtlHours != null && config.tokenTtlHours > 0) {
    const ageMs = Date.now() - new Date(data.created_at as string).getTime();
    if (ageMs > config.tokenTtlHours * 60 * 60 * 1000) return null;
  }

  // touch last_used_at (best-effort, fire-and-forget)
  void supabase.from('mcp_api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', data.id);

  return { keyId: data.id as string, ownerId: data.owner_id as string, scopes: (data.scopes ?? []) as string[] };
}

export function hasScope(ctx: McpAuthContext, scope: string): boolean {
  return ctx.scopes.includes(scope);
}
