import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { readSession } from '@/lib/session';
import { evaluateFence } from '@/lib/geo';
import { calcHours } from '@/lib/hours';

/**
 * Clock out.
 *
 * This is the route that answers the manager's concern about people clocking
 * out from home rather than from the job site.
 *
 * Behaviour, as chosen: RECORD AND FLAG, never block.
 *
 *   - The employee always clocks out successfully and sees a normal
 *     confirmation. No warning, no error, no friction.
 *   - The real GPS fix, distance from the site, and a within-fence verdict are
 *     stored on the row.
 *   - Out-of-fence clock-outs surface on the manager's board and in the 6pm
 *     SMS digest, as the basis for a face-to-face conversation.
 *
 * Not blocking is a deliberate choice: someone sent home early, or dealing with
 * an emergency, still needs to close their shift. Blocking would generate phone
 * calls and manual timecards, which is how bad data gets created.
 *
 * On honesty about tracking: this cannot and does not run without the employee
 * knowing. navigator.geolocation requires an explicit permission grant and
 * browsers display a live location indicator while it is active — there is no
 * API that reads position silently. Employees already grant this at clock-in
 * and already see "Location verified". Anything covert would require a native
 * app with "Always Allow", which iOS re-prompts users about by design.
 *
 * Ontario's ESA requires employers with 25+ employees to have a written
 * electronic monitoring policy. The roster is 23 employees plus 2 managers —
 * close enough to the threshold to be worth checking before this ships.
 */
export async function POST(request: Request) {
  const session = await readSession();
  if (!session || session.role !== 'employee') {
    return NextResponse.json({ error: 'Your session expired. Enter your PIN again.' }, { status: 401 });
  }

  let body: { lat?: unknown; lng?: unknown; accuracy?: unknown };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  // The open shift is found by session identity, not by a name in the payload.
  const { data: open, error: openErr } = await supabaseAdmin
    .from('clock_events')
    .select('id, site_id, site_name, clock_in')
    .eq('employee_name', session.name)
    .is('clock_out', null)
    .maybeSingle();

  if (openErr) {
    console.error('open shift lookup failed:', openErr.message);
    return NextResponse.json({ error: 'Could not reach the server. Try again.' }, { status: 503 });
  }
  if (!open) {
    return NextResponse.json({ error: 'You are not currently clocked in.' }, { status: 409 });
  }

  const { data: site } = await supabaseAdmin
    .from('job_sites')
    .select('lat, lng, radius')
    .eq('id', open.site_id)
    .maybeSingle();

  const fix =
    Number.isFinite(Number(body.lat)) && Number.isFinite(Number(body.lng))
      ? { lat: Number(body.lat), lng: Number(body.lng), accuracy: Number(body.accuracy) || null }
      : null;

  const fence = site
    ? evaluateFence(fix, site)
    : { distanceM: null, withinFence: null, accuracyM: null };

  // Server clock, so a phone with a doctored time cannot inflate a shift.
  const nowISO = new Date().toISOString();
  const hours = calcHours(open.clock_in, nowISO);

  const { error } = await supabaseAdmin
    .from('clock_events')
    .update({
      clock_out: nowISO,
      hours,
      status: 'pending',
      clock_out_lat: fix?.lat ?? null,
      clock_out_lng: fix?.lng ?? null,
      clock_out_accuracy_m: fence.accuracyM,
      clock_out_distance_m: fence.distanceM,
      clock_out_within_fence: fence.withinFence,
    })
    .eq('id', open.id);

  if (error) {
    console.error('clock-out update failed:', error.message);
    return NextResponse.json({ error: 'Clock-out did not save. Check your signal and try again.' }, { status: 503 });
  }

  // The response deliberately carries no geofence verdict. The employee gets
  // the same confirmation either way; the flag is the manager's to see.
  return NextResponse.json({ ok: true, hours, siteName: open.site_name });
}
