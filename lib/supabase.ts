import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Server-only client using the service role key. This file must never be
// imported from a Client Component -- it is only used inside app/api/**
// route handlers, which run on the server.
//
// The client is built lazily (on first use, not on import) because Next.js's
// build-time "collect page data" step imports every route module without
// running requests -- @supabase/supabase-js's createClient() throws
// immediately on an empty URL, which would fail `next build` in any
// environment (including a fresh checkout) before env vars are ever set.
let cached: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (cached) return cached;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set.');
  }
  cached = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  return cached;
}

export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getClient(), prop, receiver);
  },
});
