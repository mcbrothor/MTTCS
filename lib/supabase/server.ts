import { createClient } from '@supabase/supabase-js';

const isNextProductionBuild = process.env.NEXT_PHASE === 'phase-production-build';
const hasSupabaseUrl = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasAnonKey = Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'local-build-placeholder-key';
const key = serviceRoleKey || anonKey;

if (!isNextProductionBuild) {
  if (!hasSupabaseUrl || !hasAnonKey) {
    console.warn(
      '[MTN] Supabase URL/anon key is not configured. Using local build-safe placeholders; real API calls require NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.'
    );
  }

  if (!serviceRoleKey) {
    console.warn(
      '[MTN] SUPABASE_SERVICE_ROLE_KEY is not configured. Server API writes will fail under service-role-only RLS until it is set in the runtime environment.'
    );
  }
}

export const supabaseServer = createClient(url, key, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
