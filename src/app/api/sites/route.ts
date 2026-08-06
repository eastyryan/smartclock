import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { readSession, readManagerSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

/** Job sites. Any signed-in user may read; only managers may create. */
export async function GET() {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: 'Enter your PIN to continue.' }, { status: 401 });
  }

  // Managers need paused sites too, so they can resume them.
  const query = supabaseAdmin.from('job_sites').select('*').order('id');
  const { data, error } = session.role === 'manager' ? await query : await query.eq('active', true);

  if (error) {
    console.error('sites fetch failed:', error.message);
    return NextResponse.json({ error: 'Could not load job sites.' }, { status: 503 });
  }
  return NextResponse.json({ sites: data ?? [] });
}

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

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  const radius = Number(body.radius);

  if (!name) return NextResponse.json({ error: 'Site name is required.' }, { status: 400 });
  if (!Number.isFinite(lat) || lat < -90 || lat > 90)
    return NextResponse.json({ error: 'Latitude must be between -90 and 90.' }, { status: 400 });
  if (!Number.isFinite(lng) || lng < -180 || lng > 180)
    return NextResponse.json({ error: 'Longitude must be between -180 and 180.' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('job_sites')
    .insert({
      name,
      address: typeof body.address === 'string' ? body.address.trim() : null,
      lat,
      lng,
      radius: Number.isFinite(radius) && radius > 0 ? Math.round(radius) : 359,
      active: true,
    })
    .select()
    .single();

  if (error) {
    // 23505 = the unique index on lower(name). Two sites sharing a name are
    // indistinguishable in the clock-in dropdown, so say which name clashed
    // rather than reporting a generic save failure.
    if (error.code === '23505') {
      return NextResponse.json(
        { error: `A job site called "${name}" already exists. If it is paused, resume it instead.` },
        { status: 409 }
      );
    }
    console.error('site insert failed:', error.message);
    return NextResponse.json({ error: 'Could not save the job site.' }, { status: 503 });
  }
  return NextResponse.json({ ok: true, site: data });
}
