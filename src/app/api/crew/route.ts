import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { readManagerSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * Crew management. Manager-only, reads included: unlike /api/roster (active
 * names only, feeds the sign-in dropdown), this returns inactive people too so
 * a manager can bring someone back.
 *
 * PINs go through set_employee_pin in Postgres, the same path the seed used —
 * bcrypt-hashed on the way in, never stored or logged in plain text here.
 */
export async function GET() {
  const manager = await readManagerSession();
  if (!manager) {
    return NextResponse.json({ error: 'Manager access required.' }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from('employees')
    .select('name, is_active, created_at')
    .order('name');

  if (error) {
    console.error('crew fetch failed:', error.message);
    return NextResponse.json({ error: 'Could not load the crew list.' }, { status: 503 });
  }
  return NextResponse.json({ crew: data ?? [] });
}

/** Add a crew member, or reset an existing member's PIN — set_employee_pin
 *  upserts by name and reactivates, so both are the same operation. */
export async function POST(request: Request) {
  const manager = await readManagerSession();
  if (!manager) {
    return NextResponse.json({ error: 'Manager access required.' }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const name = typeof body.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : '';
  const pin = typeof body.pin === 'string' ? body.pin : '';

  if (!name) return NextResponse.json({ error: 'A name is required.' }, { status: 400 });
  if (name.length > 80) return NextResponse.json({ error: 'That name is too long.' }, { status: 400 });
  if (!/^\d{4}$/.test(pin)) {
    return NextResponse.json({ error: 'The PIN must be exactly 4 digits.' }, { status: 400 });
  }

  const { error } = await supabaseAdmin.rpc('set_employee_pin', {
    p_name: name,
    p_pin: pin,
  });

  if (error) {
    console.error('set_employee_pin failed:', error.message);
    return NextResponse.json({ error: 'Could not save the crew member.' }, { status: 503 });
  }
  return NextResponse.json({ ok: true, name });
}

/** Deactivate or reactivate. Never a DELETE — clock_events stores the name as
 *  text, so the row has to stay for old time cards to keep balancing. */
export async function PATCH(request: Request) {
  const manager = await readManagerSession();
  if (!manager) {
    return NextResponse.json({ error: 'Manager access required.' }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const active = body.active;

  if (!name || typeof active !== 'boolean') {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('employees')
    .update({ is_active: active })
    .eq('name', name)
    .select('name, is_active');

  if (error) {
    console.error('crew update failed:', error.message);
    return NextResponse.json({ error: 'Could not update the crew member.' }, { status: 503 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: `No crew member called "${name}".` }, { status: 404 });
  }
  return NextResponse.json({ ok: true, employee: data[0] });
}
