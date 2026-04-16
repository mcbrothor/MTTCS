import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'local-build-placeholder-key';
const key = serviceRoleKey || anonKey;

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !key) {
  console.warn('[MTN] Supabase server environment is not fully configured. Using build-safe placeholders.');
}

if (!serviceRoleKey) {
  console.warn('[MTN] SUPABASE_SERVICE_ROLE_KEY is missing. Runtime writes may be blocked by RLS.');
}

export const supabaseServer = createClient(url, key, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
