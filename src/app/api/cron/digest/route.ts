import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { buildMorningDigest, buildEveningDigest } from '@/lib/digest';
import { sendEmail } from '@/lib/notify';
import { torontoParts } from '@/lib/tz';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * Manager digests: 9:30 AM and 6:00 PM, Toronto time.
 *
 * Vercel Cron only schedules in UTC and has no timezone support, so a fixed
 * UTC schedule would drift by an hour twice a year — the 6 PM digest would
 * start arriving at 5 PM every November.
 *
 * Instead vercel.json fires this at BOTH candidate UTC times for each slot
 * (13:30 and 14:30 for the morning; 22:00 and 23:00 for the evening) and this
 * handler checks the actual Toronto wall clock. Exactly one of each pair is the
 * right local hour on any given day, so the other is a no-op. That makes the
 * hour check the deduplication as well — no state required.
 *
 * Manual run:
 *   /api/cron/digest?kind=evening&dryRun=1   preview without sending
 *   /api/cron/digest?kind=evening&force=1    send now, ignoring the clock
 * Both require the CRON_SECRET bearer token.
 */
export async function GET(request: Request) {
  // Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Without this the
  // endpoint would be an open trigger for anyone who found the URL.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const url = new URL(request.url);
  const dryRun = url.searchParams.get('dryRun') === '1';
  const force = url.searchParams.get('force') === '1';
  const forcedKind = url.searchParams.get('kind');

  // Dry-run-only date override, so the digest can be checked against a real
  // working day instead of whenever it happens to be run. Ignored unless
  // dryRun is set, so it can never affect a real send.
  const atParam = url.searchParams.get('at');
  const now = dryRun && atParam && !Number.isNaN(Date.parse(atParam)) ? new Date(atParam) : new Date();

  const { hour, minute, dateKey } = torontoParts(now);

  // Which slot, if any, does this invocation belong to?
  let kind: 'morning' | 'evening' | null = null;
  if (force && (forcedKind === 'morning' || forcedKind === 'evening')) {
    kind = forcedKind;
  } else if (hour === 9 && minute >= 20 && minute <= 40) {
    kind = 'morning';
  } else if (hour === 18 && minute <= 20) {
    kind = 'evening';
  }

  if (!kind) {
    return NextResponse.json({
      skipped: true,
      reason: `Toronto local time is ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}, not a digest slot`,
      dateKey,
    });
  }

  let digest: { subject: string; text: string; html: string };
  try {
    digest = kind === 'morning' ? await buildMorningDigest(now) : await buildEveningDigest(now);
  } catch (e) {
    console.error('digest build failed:', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'digest build failed' },
      { status: 500 }
    );
  }

  if (dryRun) {
    return NextResponse.json({ dryRun: true, kind, dateKey, ...digest });
  }

  // Recipients come from the managers table, so changing who gets the digest
  // is a database update rather than a deploy.
  const { data: managers, error } = await supabaseAdmin
    .from('managers')
    .select('name, email')
    .eq('is_active', true)
    .not('email', 'is', null);

  if (error) {
    console.error('manager lookup failed:', error.message);
    return NextResponse.json({ error: 'could not load recipients' }, { status: 503 });
  }
  if (!managers?.length) {
    return NextResponse.json({ sent: 0, warning: 'no active managers have an email set' });
  }

  const results = await Promise.all(
    managers.map(async (m) => {
      const res = await sendEmail({
        to: m.email as string,
        subject: digest.subject,
        text: digest.text,
        html: digest.html,
      });
      if (!res.ok) console.error(`digest to ${m.email} failed: ${res.error}`);
      return { to: m.email, ...res };
    })
  );

  const sent = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);

  // A non-200 on failure makes the miss visible in Vercel's cron log rather
  // than silently succeeding — the whole point is that a missing digest must
  // not read as "nothing to report".
  return NextResponse.json(
    { kind, dateKey, sent, failed: failed.length, errors: failed },
    { status: failed.length && !sent ? 502 : 200 }
  );
}
