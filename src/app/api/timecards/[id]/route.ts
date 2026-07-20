import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { readManagerSession } from '@/lib/session';

type Ctx = { params: Promise<{ id: string }> };

/**
 * Approve, reject, or edit a time card. Manager only.
 *
 * Every one of these used to be a direct anon-key write from the browser with
 * no authorization at all — a probe against production confirmed an anonymous
 * PATCH setting status='approved' was accepted.
 *
 * Each action also writes a clock_event_audit row capturing before/after.
 * Edits still overwrite the live row (the pay-period screen and Excel export
 * read from it), but the original values are now recoverable, which matters
 * because adjusting short shifts is routine here and those conversations happen
 * face to face.
 */
export async function PATCH(request: Request, { params }: Ctx) {
  const manager = await readManagerSession();
  if (!manager) return NextResponse.json({ error: 'Manager access required.' }, { status: 403 });

  const id = (await params).id;
  if (!id) return NextResponse.json({ error: 'Invalid time card.' }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const action = body.action;
  if (action !== 'approve' && action !== 'reject' && action !== 'edit') {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const { data: before, error: beforeErr } = await supabaseAdmin
    .from('clock_events')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (beforeErr) {
    console.error('timecard lookup failed:', beforeErr.message);
    return NextResponse.json({ error: 'Could not reach the server. Try again.' }, { status: 503 });
  }
  if (!before) return NextResponse.json({ error: 'That time card no longer exists.' }, { status: 404 });

  const updates: Record<string, unknown> = {};

  if (action === 'approve') updates.status = 'approved';
  if (action === 'reject') updates.status = 'rejected';

  if (action === 'edit') {
    updates.status = 'edited';
    if (typeof body.clockIn === 'string') {
      if (Number.isNaN(Date.parse(body.clockIn)))
        return NextResponse.json({ error: 'Invalid clock-in time.' }, { status: 400 });
      updates.clock_in = body.clockIn;
    }
    if (typeof body.clockOut === 'string') {
      if (Number.isNaN(Date.parse(body.clockOut)))
        return NextResponse.json({ error: 'Invalid clock-out time.' }, { status: 400 });
      updates.clock_out = body.clockOut;
    }
    const ci = (updates.clock_in ?? before.clock_in) as string;
    const co = (updates.clock_out ?? before.clock_out) as string | null;
    if (co && Date.parse(co) <= Date.parse(ci)) {
      return NextResponse.json({ error: 'Clock-out must be after clock-in.' }, { status: 400 });
    }

    if (body.hours !== undefined) {
      const h = Number(body.hours);
      if (!Number.isFinite(h) || h < 0 || h > 24)
        return NextResponse.json({ error: 'Hours must be between 0 and 24.' }, { status: 400 });
      updates.hours = h;
    }
    if (typeof body.site === 'string') updates.site_name = body.site;
    if (body.siteId !== undefined && Number.isFinite(Number(body.siteId)))
      updates.site_id = Number(body.siteId);
    if (typeof body.manager === 'string') updates.manager_name = body.manager;
    if (typeof body.notes === 'string') updates.notes = body.notes || null;
  }

  const { data: after, error } = await supabaseAdmin
    .from('clock_events')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('timecard update failed:', error.message);
    return NextResponse.json({ error: 'That change did not save. Try again.' }, { status: 503 });
  }

  await supabaseAdmin.from('clock_event_audit').insert({
    clock_event_id: id,
    actor: manager.name,
    action,
    reason: typeof body.notes === 'string' ? body.notes : null,
    before,
    after,
  });

  return NextResponse.json({ ok: true, event: after });
}
