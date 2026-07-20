import 'server-only';
import { supabaseAdmin } from './supabase-admin';

/**
 * PIN attempt throttling.
 *
 * With a 4-digit PIN the search space is 10,000, so this — not the bcrypt hash —
 * is what actually stops an attacker. The old PinPad had no throttle of any kind.
 *
 * Backed by a table rather than memory because serverless instances don't share
 * state; an in-process counter would reset on every cold start.
 *
 * Keyed per identifier (employee name, or the literal 'manager') so one person
 * fat-fingering their PIN can't lock out the rest of the crew mid-shift.
 */

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const LOCKOUT_MS = 15 * 60 * 1000;

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSec: number };

export async function checkRateLimit(identifier: string): Promise<RateLimitResult> {
  const { data } = await supabaseAdmin
    .from('auth_attempts')
    .select('attempts, window_start, locked_until')
    .eq('identifier', identifier)
    .maybeSingle();

  if (!data) return { ok: true };

  if (data.locked_until) {
    const until = new Date(data.locked_until).getTime();
    if (until > Date.now()) {
      return { ok: false, retryAfterSec: Math.ceil((until - Date.now()) / 1000) };
    }
  }
  return { ok: true };
}

export async function recordFailure(identifier: string): Promise<void> {
  const { data } = await supabaseAdmin
    .from('auth_attempts')
    .select('attempts, window_start')
    .eq('identifier', identifier)
    .maybeSingle();

  const now = Date.now();
  const windowExpired =
    !data?.window_start || now - new Date(data.window_start).getTime() > WINDOW_MS;

  const attempts = windowExpired ? 1 : (data?.attempts ?? 0) + 1;
  const lockedUntil =
    attempts >= MAX_ATTEMPTS ? new Date(now + LOCKOUT_MS).toISOString() : null;

  await supabaseAdmin.from('auth_attempts').upsert(
    {
      identifier,
      attempts,
      window_start: windowExpired ? new Date(now).toISOString() : data!.window_start,
      locked_until: lockedUntil,
    },
    { onConflict: 'identifier' }
  );
}

export async function clearAttempts(identifier: string): Promise<void> {
  await supabaseAdmin.from('auth_attempts').delete().eq('identifier', identifier);
}
