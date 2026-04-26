/**
 * Server-only Supabase client — lazily initialised so Next.js build workers
 * can import the module without crashing when env vars are only available at
 * request time.
 *
 * Uses the service role key → bypasses Row Level Security.
 * NEVER import this from client components or expose it to the browser.
 *
 * Add to .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ...   (Settings → API → service_role key)
 *   # OR during dev, the publishable/anon key also works when RLS is disabled:
 *   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=eyJ...
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (_client) return _client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key  = process.env.SUPABASE_SERVICE_ROLE_KEY
    // Fallback to publishable key in dev when service role key not yet set.
    ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error(
      'Missing Supabase env vars. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) to .env.local',
    );
  }

  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}

// Proxy so all call-sites (`db.from(...)`, `db.rpc(...)`, etc.) still work
// without any changes, while the actual client is only created on first use.
export const db: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop: string | symbol) {
    return Reflect.get(getClient(), prop, getClient());
  },
});
