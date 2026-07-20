import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { createToken, cookieOptions, SESSION_COOKIE } from '@/lib/session';
import { checkRateLimit, recordFailure, clearAttempts } from '@/lib/rate-limit';

/**
 * Verifies an employee PIN and issues a short-lived session cookie.
 *
 * Replaces the old client-side check, which compared against a PIN sitting in
 * the JS bundle:
 *
 *   const emp = employees.find(e => e.name === sel);
 *   if (emp.pin !== pin) { setErr("Incorrect PIN"); ... }
 *
 * The PIN now never leaves the server and the roster no longer ships to the
 * browser at all.
 */
export async function POST(request: Request) {
  let body: { name?: unknown; pin?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const pin = typeof body.pin === 'string' ? body.pin : '';

  if (!name || !/^\d{4}$/.test(pin)) {
    return NextResponse.json({ error: 'Select your name and enter your 4-digit PIN.' }, { status: 400 });
  }

  const key = `employee:${name.toLowerCase()}`;
  const limit = await checkRateLimit(key);
  if (!limit.ok) {
    const mins = Math.ceil(limit.retryAfterSec / 60);
    return NextResponse.json(
      { error: `Too many incorrect attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}, or see your manager.` },
      { status: 429 }
    );
  }

  const { data, error } = await supabaseAdmin.rpc('verify_employee_pin', {
    p_name: name,
    p_pin: pin,
  });

  if (error) {
    console.error('verify_employee_pin failed:', error.message);
    return NextResponse.json({ error: 'Could not verify your PIN. Check your connection and try again.' }, { status: 503 });
  }

  const match = Array.isArray(data) ? data[0] : null;
  if (!match) {
    await recordFailure(key);
    return NextResponse.json({ error: 'Incorrect PIN' }, { status: 401 });
  }

  await clearAttempts(key);

  const { token, maxAge } = createToken({ role: 'employee', name: match.name });
  const res = NextResponse.json({ ok: true, name: match.name });
  res.cookies.set(SESSION_COOKIE, token, cookieOptions(maxAge));
  return res;
}
