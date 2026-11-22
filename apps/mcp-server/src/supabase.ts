import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { McpConfig } from './config.js';

let client: SupabaseClient | null = null;

/** Service-role client — server-only. Never exposed to the browser. */
export function getServiceClient(config: McpConfig): SupabaseClient {
  if (!client) {
    client = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

/** Database-row shapes (mirror supabase/migrations/0001_core_schema.sql). */
export interface McpAuthContext {
  keyId: string;
  ownerId: string;
  scopes: string[];
}

export const ALL_SCOPES = [
  'read:projects', 'write:projects',
  'read:timeline', 'write:timeline',
  'read:media', 'write:media',
  'read:motion', 'write:motion',
  'read:subtitles', 'write:subtitles',
  'read:render', 'write:render',
  'read:ai',
] as const;

export type Scope = (typeof ALL_SCOPES)[number];
