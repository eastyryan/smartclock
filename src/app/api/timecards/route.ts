import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { readSession, readManagerSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * Read time cards, scoped to the caller.
 *
 * Employees get only their own. This is a real change: previously loadData()
 * pulled every clock event for every employee into every browser on mount —
 * before any PIN was entered — so all 572 rows and everyone's hours were
 * visible in the Network tab to anyone who opened the site.
 */
export async function GET() {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: 'Enter your PIN to continue.' }, { status: 401 });
  }

  const base = supabaseAdmin.from('clock_events').select('*').order('clock_in', { ascending: false });
  const { data, error } =
    session.role === 'manager' ? await base : await base.eq('employee_name', session.name);

  if (error) {
    console.error('timecards fetch failed:', error.message);
    return NextResponse.json({ error: 'Could not load time cards.' }, { status: 503 });
  }

  const rows = data ?? [];
  return NextResponse.json({
    active: rows.filter((r) => !r.clock_out),
    history: rows.filter((r) => r.clock_out),
    scope: session.role,
  });
}

/** Manually create a time card. Manager only. */
export async function POST(request: Request) {
  const manager = await readManagerSession();
  if (!manager) return NextResponse.json({ error: 'Manager access required.' }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const employee = typeof body.employee === 'string' ? body.employee.trim() : '';
  const clockIn = typeof body.clockIn === 'string' ? body.clockIn : '';
  const clockOut = typeof body.clockOut === 'string' ? body.clockOut : '';

  if (!employee) return NextResponse.json({ error: 'Select an employee.' }, { status: 400 });
  if (!clockIn || !clockOut || Number.isNaN(Date.parse(clockIn)) || Number.isNaN(Date.parse(clockOut))) {
    return NextResponse.json({ error: 'Enter a valid start and end time.' }, { status: 400 });
  }
  if (Date.parse(clockOut) <= Date.parse(clockIn)) {
    return NextResponse.json({ error: 'Clock-out must be after clock-in.' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('clock_events')
    .insert({
      employee_name: employee,
      site_name: typeof body.site === 'string' ? body.site : null,
      site_id: Number.isFinite(Number(body.siteId)) ? Number(body.siteId) : null,
      manager_name: typeof body.manager === 'string' ? body.manager : null,
      clock_in: clockIn,
      clock_out: clockOut,
      hours: Number.isFinite(Number(body.hours)) ? Number(body.hours) : null,
      status: 'pending',
      notes: typeof body.notes === 'string' && body.notes ? body.notes : null,
    })
    .select()
    .single();

  if (error) {
    console.error('timecard insert failed:', error.message);
    return NextResponse.json({ error: 'Could not save the time card.' }, { status: 503 });
  }

  await supabaseAdmin.from('clock_event_audit').insert({
    clock_event_id: data.id,
    actor: manager.name,
    action: 'create',
    reason: typeof body.notes === 'string' ? body.notes : null,
    after: data,
  });

  return NextResponse.json({ ok: true, event: data });
}
