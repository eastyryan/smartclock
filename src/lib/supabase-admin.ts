import { createClient } from '@supabase/supabase-js';

/**
 * Service-role Supabase client. SERVER ONLY.
 *
 * This key bypasses RLS entirely, which is exactly why every caller must first
 * authorize the request against a session cookie (see lib/session.ts). After
 * migration 0003 the anon key has no access to any application table, so this
 * is the only path to the data.
 *
 * The `server-only` import is deliberate: if this module is ever pulled into a
 * client component the build fails rather than shipping the key to browsers,
 * which is the class of mistake that caused the original problem.
 */
import 'server-only';

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set. Add it to .env.local and to the Vercel project.`);
  return v;
}

export const supabaseAdmin = createClient(
  required('NEXT_PUBLIC_SUPABASE_URL'),
  required('SUPABASE_SERVICE_ROLE_KEY'),
  { auth: { persistSession: false, autoRefreshToken: false } }
);
