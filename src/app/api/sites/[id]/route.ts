import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { readManagerSession } from '@/lib/session';

type Ctx = { params: Promise<{ id: string }> };

/** Pause / resume a job site. Manager only. */
export async function PATCH(request: Request, { params }: Ctx) {
  const manager = await readManagerSession();
  if (!manager) return NextResponse.json({ error: 'Manager access required.' }, { status: 403 });

  const id = Number((await params).id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Invalid site.' }, { status: 400 });

  let body: { active?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  if (typeof body.active !== 'boolean') {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('job_sites')
    .update({ active: body.active })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('site update failed:', error.message);
    return NextResponse.json({ error: 'Could not update the job site.' }, { status: 503 });
  }
  return NextResponse.json({ ok: true, site: data });
}

/**
 * Remove a job site. Manager only.
 *
 * Refuses when timecards reference the site. clock_events denormalises
 * site_name/site_id with no foreign key, so a hard delete used to leave
 * dangling references behind — the reason the edit modal has to merge historical
 * site names into its dropdown. Pausing keeps the history intact and is what
 * the manager almost always actually wants.
 */
export async function DELETE(_request: Request, { params }: Ctx) {
  const manager = await readManagerSession();
  if (!manager) return NextResponse.json({ error: 'Manager access required.' }, { status: 403 });

  const id = Number((await params).id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Invalid site.' }, { status: 400 });

  const { count, error: countErr } = await supabaseAdmin
    .from('clock_events')
    .select('id', { count: 'exact', head: true })
    .eq('site_id', id);

  if (countErr) {
    console.error('site reference check failed:', countErr.message);
    return NextResponse.json({ error: 'Could not check the job site.' }, { status: 503 });
  }

  if ((count ?? 0) > 0) {
    return NextResponse.json(
      {
        error: `This site has ${count} time card${count === 1 ? '' : 's'} attached, so deleting it would break that history. Pause it instead — it disappears from the clock-in list but the records stay.`,
      },
      { status: 409 }
    );
  }

  const { error } = await supabaseAdmin.from('job_sites').delete().eq('id', id);
  if (error) {
    console.error('site delete failed:', error.message);
    return NextResponse.json({ error: 'Could not remove the job site.' }, { status: 503 });
  }
  return NextResponse.json({ ok: true });
}
