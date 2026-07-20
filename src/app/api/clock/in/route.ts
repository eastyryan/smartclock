import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { readSession } from '@/lib/session';
import { evaluateFence } from '@/lib/geo';

/**
 * Clock in.
 *
 * Three things changed from the old client-side insert:
 *
 * 1. Identity comes from the session cookie, never the request body. A caller
 *    cannot clock in as somebody else by editing the payload.
 * 2. clock_in is the SERVER's clock. Previously it was new Date() on the
 *    employee's phone, so changing the device time changed the shift length.
 * 3. The employee's REAL coordinates are stored. The old insert wrote
 *    `lat: site.lat, lng: site.lng` — the job site's own position — which was
 *    identical for every shift there and proved nothing.
 */
export async function POST(request: Request) {
  const session = await readSession();
  if (!session || session.role !== 'employee') {
    return NextResponse.json({ error: 'Your session expired. Enter your PIN again.' }, { status: 401 });
  }

  let body: { siteId?: unknown; lat?: unknown; lng?: unknown; accuracy?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const siteId = Number(body.siteId);
  if (!Number.isFinite(siteId)) {
    return NextResponse.json({ error: 'Select a job site.' }, { status: 400 });
  }

  const { data: site, error: siteErr } = await supabaseAdmin
    .from('job_sites')
    .select('id, name, lat, lng, radius, active')
    .eq('id', siteId)
    .maybeSingle();

  if (siteErr) {
    console.error('site lookup failed:', siteErr.message);
    return NextResponse.json({ error: 'Could not reach the server. Try again.' }, { status: 503 });
  }
  if (!site || !site.active) {
    return NextResponse.json({ error: 'That job site is not available.' }, { status: 400 });
  }

  const fix =
    Number.isFinite(Number(body.lat)) && Number.isFinite(Number(body.lng))
      ? { lat: Number(body.lat), lng: Number(body.lng), accuracy: Number(body.accuracy) || null }
      : null;

  const fence = evaluateFence(fix, site);

  // Server-side enforcement. The old geofence only disabled a button, so a
  // crafted request bypassed it entirely.
  if (fence.withinFence !== true) {
    return NextResponse.json(
      {
        error:
          fence.withinFence === null
            ? 'Could not confirm your location. Enable GPS and try again.'
            : `You are ${fence.distanceM} m from ${site.name}. Move closer to clock in.`,
      },
      { status: 422 }
    );
  }

  const nowISO = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from('clock_events')
    .insert({
      employee_name: session.name,
      site_name: site.name,
      site_id: site.id,
      manager_name: null,
      clock_in: nowISO,
      status: 'pending',
      // Legacy columns kept populated so historical reporting stays consistent.
      lat: site.lat,
      lng: site.lng,
      clock_in_lat: fix?.lat ?? null,
      clock_in_lng: fix?.lng ?? null,
      clock_in_accuracy_m: fence.accuracyM,
      clock_in_distance_m: fence.distanceM,
      clock_in_within_fence: fence.withinFence,
    })
    .select()
    .single();

  if (error) {
    // 23505 = the one-open-shift-per-employee unique index doing its job.
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'You are already clocked in. Clock out before starting a new shift.' },
        { status: 409 }
      );
    }
    console.error('clock-in insert failed:', error.message);
    return NextResponse.json({ error: 'Clock-in did not save. Check your signal and try again.' }, { status: 503 });
  }

  return NextResponse.json({ ok: true, event: data, siteName: site.name });
}
