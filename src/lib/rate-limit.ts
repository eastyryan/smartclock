import 'server-only';
import { supabaseAdmin } from './supabase-admin';

/**
 * PIN abuse protection — WITHOUT lockouts.
 *
 * There is deliberately no lockout. An earlier version locked an employee out
 * for 15 minutes after 5 wrong attempts, which is the wrong trade for this
 * business: the crew clocks in at 7am wearing gloves, a mistyped PIN is
 * routine, and a locked-out employee cannot start work while a manager has no
 * way to clear it from the app. Being unable to clock in is a worse, more
 * likely problem than a brute-force attempt.
 *
 * Instead, wrong attempts get progressively slower. A CORRECT PIN is never
 * delayed, so a real employee never waits — only someone guessing does.
 *
 * That still makes scripted brute force impractical. A 4-digit PIN is 10,000
 * combinations; at the capped 2s penalty that is over five hours of sustained
 * wrong guesses against a single name, and the attempts are recorded.
 */

const FREE_ATTEMPTS = 4;
const STEP_MS = 500;
const MAX_DELAY_MS = 2000;
const WINDOW_MS = 15 * 60 * 1000;

/**
 * How long to stall a FAILED attempt, based on recent failures.
 * Never called on success, so correct PINs are always instant.
 */
export async function failureDelayMs(identifier: string): Promise<number> {
  const { data } = await supabaseAdmin
    .from('auth_attempts')
    .select('attempts, window_start')
    .eq('identifier', identifier)
    .maybeSingle();

  if (!data?.window_start) return 0;
  if (Date.now() - new Date(data.window_start).getTime() > WINDOW_MS) return 0;

  const over = (data.attempts ?? 0) - FREE_ATTEMPTS;
  return over <= 0 ? 0 : Math.min(MAX_DELAY_MS, over * STEP_MS);
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

  await supabaseAdmin.from('auth_attempts').upsert(
    {
      identifier,
      attempts: windowExpired ? 1 : (data?.attempts ?? 0) + 1,
      window_start: windowExpired ? new Date(now).toISOString() : data!.window_start,
      locked_until: null, // never set; column kept so old rows stay valid
    },
    { onConflict: 'identifier' }
  );
}

export async function clearAttempts(identifier: string): Promise<void> {
  await supabaseAdmin.from('auth_attempts').delete().eq('identifier', identifier);
}

export const sleep = (ms: number) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());
