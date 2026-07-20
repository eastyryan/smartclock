import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { readSession, readManagerSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

const BOOL_FIELDS = [
  'no_trash',
  'interior_wipe',
  'bed_blown',
  'clean_mower',
  'clean_weedwacker',
  'clean_blower',
] as const;

/** Checklist history. Manager only — this feeds the Excel export. */
export async function GET() {
  const manager = await readManagerSession();
  if (!manager) return NextResponse.json({ error: 'Manager access required.' }, { status: 403 });

  const { data, error } = await supabaseAdmin
    .from('eod_checklists')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('eod fetch failed:', error.message);
    return NextResponse.json({ error: 'Could not load checklists.' }, { status: 503 });
  }
  return NextResponse.json({ checklists: data ?? [] });
}

/** Submit an end-of-day checklist. Any signed-in employee. */
export async function POST(request: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Enter your PIN to continue.' }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const vehicle = typeof body.vehicle === 'string' ? body.vehicle.trim() : '';
  if (!vehicle) return NextResponse.json({ error: 'Select a vehicle.' }, { status: 400 });

  const payload: Record<string, unknown> = {
    // From the session, not the payload.
    employee_name: session.name,
    vehicle,
    gas_level: typeof body.gas_level === 'string' ? body.gas_level : null,
    broken_notes: typeof body.broken_notes === 'string' ? body.broken_notes.slice(0, 2000) || null : null,
  };
  for (const f of BOOL_FIELDS) payload[f] = body[f] === true;

  const { data, error } = await supabaseAdmin.from('eod_checklists').insert(payload).select().single();

  if (error) {
    console.error('eod insert failed:', error.message);
    return NextResponse.json({ error: 'Checklist did not save. Check your signal and try again.' }, { status: 503 });
  }
  return NextResponse.json({ ok: true, checklist: data });
}
