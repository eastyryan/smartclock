import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { createToken, cookieOptions, SESSION_COOKIE } from '@/lib/session';
import { checkRateLimit, recordFailure, clearAttempts } from '@/lib/rate-limit';

/**
 * Verifies a manager PIN and issues a manager session cookie.
 *
 * Replaces two separate client-side gates that both compared against the same
 * bundled constant:
 *   - PinEntry with type="manager"  -> set the shared `managerAuth` state
 *   - EODChecklist's own onMgrPin   -> set a local `exportAuthed` state
 *
 * Both are now this one route, so there is a single place where manager
 * authority is granted and a single place to audit.
 */
export async function POST(request: Request) {
  let body: { pin?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const pin = typeof body.pin === 'string' ? body.pin : '';
  if (!/^\d{4}$/.test(pin)) {
    return NextResponse.json({ error: 'Enter the 4-digit manager PIN.' }, { status: 400 });
  }

  // Single shared key: the manager PIN is one credential, so throttle it as one.
  const key = 'manager';
  const limit = await checkRateLimit(key);
  if (!limit.ok) {
    const mins = Math.ceil(limit.retryAfterSec / 60);
    return NextResponse.json(
      { error: `Too many incorrect attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}.` },
      { status: 429 }
    );
  }

  const { data, error } = await supabaseAdmin.rpc('verify_manager_pin', { p_pin: pin });

  if (error) {
    console.error('verify_manager_pin failed:', error.message);
    return NextResponse.json({ error: 'Could not verify the PIN. Check your connection and try again.' }, { status: 503 });
  }

  const matches: Array<{ name: string }> = Array.isArray(data) ? data : [];
  if (matches.length === 0) {
    await recordFailure(key);
    return NextResponse.json({ error: 'Incorrect manager PIN' }, { status: 401 });
  }

  await clearAttempts(key);

  // More than one match means the managers still share a PIN, so we cannot
  // attribute actions to a person. Recorded honestly rather than guessing.
  const ambiguous = matches.length > 1;
  const name = ambiguous ? 'manager (shared PIN)' : matches[0].name;

  const { token, maxAge } = createToken({ role: 'manager', name, ambiguous });
  const res = NextResponse.json({ ok: true, name, ambiguous });
  res.cookies.set(SESSION_COOKIE, token, cookieOptions(maxAge));
  return res;
}
