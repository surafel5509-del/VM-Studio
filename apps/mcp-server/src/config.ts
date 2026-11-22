import { config as loadEnv } from 'dotenv';
// Load .env.local so the dev loop works out of the box; real deployments use real env vars.
loadEnv({ path: ['.env.local', '.env'] });

export interface McpConfig {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  port: number;
  host: string;
  tokenTtlHours: number | null;
  webOrigin: string;
}

function env(name: string, required: boolean): string {
  const value = process.env[name];
  if (!value && required) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value ?? '';
}

export function loadConfig(): McpConfig {
  const ttl = process.env.MCP_TOKEN_TTL_HOURS;
  return {
    supabaseUrl: env('SUPABASE_URL', true),
    supabaseServiceRoleKey: env('SUPABASE_SERVICE_ROLE_KEY', true),
    port: Number(process.env.PORT ?? 4321),
    host: process.env.HOST ?? '0.0.0.0',
    tokenTtlHours: ttl ? Number(ttl) : null,
    webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:3000',
  };
}
