import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { buildMorningDigest, buildEveningDigest, type Digest } from '@/lib/digest';
import { sendEmail, sendSms, type SendResult } from '@/lib/notify';
import { torontoParts } from '@/lib/tz';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * Manager digests: 9:30 AM and 6:00 PM, Toronto time.
 *
 * Schedules are UTC-only and have no timezone support, so a fixed UTC schedule
 * would drift by an hour twice a year — the 6 PM digest would start arriving at
 * 5 PM every November. The workflow therefore sweeps across BOTH candidate UTC
 * windows and this handler checks the real Toronto wall clock.
 *
 * WINDOWS ARE HOURS WIDE, DELIBERATELY. The original version accepted ~20
 * minutes per slot and used that same check as its deduplication. It broke
 * silently: GitHub Actions delayed the scheduled runs by 44-112 minutes on
 * 2026-07-21, every fire landed outside its window, and each returned HTTP 200
 * with {"skipped": true}. Four green checkmarks, zero digests. Scheduled runs
 * are best-effort on every platform, so the window has to absorb hours of lag.
 *
 * Widening the window means the clock can no longer be the dedup, so the
 * digest_sends table (migration 0007) does that job: the slot is CLAIMED with
 * an insert before anything is sent, and a conflicting insert means an earlier
 * fire already handled it. Sweep as often as you like; exactly one send lands.
 *
 * Manual run:
 *   /api/cron/digest?kind=evening&dryRun=1   preview without sending
 *   /api/cron/digest?kind=evening&force=1    send now, ignoring clock AND claim
 * Both require the CRON_SECRET bearer token.
 */

/**
 * How long after its nominal time a slot may still be sent.
 *
 * Morning runs to 13:00 rather than further so a badly delayed digest still
 * reads as a morning report. Evening runs to 23:59 because a late evening
 * summary is worth having at any point that day, and stopping before midnight
 * keeps it inside its own dateKey.
 */
const SLOTS = {
  morning: { fromHour: 9, fromMinute: 30, toHour: 13 },
  evening: { fromHour: 18, fromMinute: 0, toHour: 24 },
} as const;

function slotFor(hour: number, minute: number): 'morning' | 'evening' | null {
  for (const [name, s] of Object.entries(SLOTS)) {
    const afterStart = hour > s.fromHour || (hour === s.fromHour && minute >= s.fromMinute);
    if (afterStart && hour < s.toHour) return name as 'morning' | 'evening';
  }
  return null;
}
/**
 * Hand a claimed slot back so a later sweep can retry it.
 *
 * Called when a claim was taken but nothing was actually delivered. Without
 * this, one transient failure would burn the slot for the whole day — the
 * claim would say "sent" when nothing was.
 */
async function releaseClaim(dateKey: string, kind: string, skip: boolean): Promise<void> {
  if (skip) return; // never claimed in the first place
  const { error } = await supabaseAdmin
    .from('digest_sends')
    .delete()
    .eq('date_key', dateKey)
    .eq('kind', kind);
  if (error) console.error('digest claim release failed:', error.message);
}

/** "a***@rogers.com", "***0123" — enough to identify, not enough to publish. */
function mask(recipient: string): string {
  if (recipient.includes('@')) {
    const [user, domain] = recipient.split('@');
    return `${user.slice(0, 1)}***@${domain}`;
  }
  return `***${recipient.replace(/\D/g, '').slice(-4)}`;
}

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
  const kind =
    force && (forcedKind === 'morning' || forcedKind === 'evening') ? forcedKind : slotFor(hour, minute);

  if (!kind) {
    return NextResponse.json({
      skipped: true,
      reason: `Toronto local time is ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}, not a digest slot`,
      dateKey,
    });
  }

  // Claim the slot BEFORE building anything. The workflow sweeps every 30
  // minutes to survive delayed runs, so on a normal day most fires land here
  // and stop — no Supabase reads for the roster, no provider calls.
  //
  // A dry run must never claim (it would suppress the real send), and an
  // explicit force is the manual recovery path, so it bypasses the check.
  if (!dryRun && !force) {
    const { error: claimError } = await supabaseAdmin
      .from('digest_sends')
      .insert({ date_key: dateKey, kind });

    if (claimError) {
      // 23505 = unique_violation: an earlier fire already owns this slot.
      if (claimError.code === '23505') {
        return NextResponse.json({ skipped: true, reason: 'already sent', kind, dateKey });
      }
      // Anything else (table missing, network) must not silently swallow the
      // digest — that failure mode is exactly what we are fixing. Fail with a
      // non-200 so the workflow goes red instead of green.
      console.error('digest claim failed:', claimError.message);
      const hint = /digest_sends|relation|schema cache/i.test(claimError.message)
        ? ' — run supabase/migrations/0007_digest_sends.sql in the Supabase SQL editor'
        : '';
      return NextResponse.json(
        { error: `could not claim digest slot: ${claimError.message}${hint}` },
        { status: 503 }
      );
    }
  }

  let digest: Digest;
  try {
    digest = kind === 'morning' ? await buildMorningDigest(now) : await buildEveningDigest(now);
  } catch (e) {
    console.error('digest build failed:', e);
    // Release the claim so the next sweep retries rather than the day being
    // lost to one bad build.
    await releaseClaim(dateKey, kind, dryRun || force);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'digest build failed' },
      { status: 500 }
    );
  }

  if (dryRun) {
    return NextResponse.json({ dryRun: true, kind, dateKey, ...digest });
  }

  // Recipients come from the managers table, so changing who gets the digest —
  // or which channel they get it on — is a database update rather than a deploy.
  // A manager with both an email and a phone gets both.
  const { data: managers, error } = await supabaseAdmin
    .from('managers')
    .select('name, email, phone')
    .eq('is_active', true);

  if (error) {
    console.error('manager lookup failed:', error.message);
    return NextResponse.json({ error: 'could not load recipients' }, { status: 503 });
  }

  const recipients = (managers ?? []).filter((m) => m.email || m.phone);
  if (!recipients.length) {
    await releaseClaim(dateKey, kind, dryRun || force);
    return NextResponse.json({ sent: 0, warning: 'no active managers have an email or phone set' });
  }

  // Email and SMS are dispatched independently so one channel failing — a
  // Twilio spend cap, an unapproved A2P campaign, a Resend outage — cannot
  // suppress the other. The email is the complete record; the SMS is a nudge.
  type Delivery = { channel: 'email' | 'sms'; to: string } & SendResult;
  const jobs: Promise<Delivery>[] = [];

  for (const m of recipients) {
    if (m.email) {
      const to = m.email as string;
      jobs.push(
        sendEmail({ to, subject: digest.subject, text: digest.text, html: digest.html })
          .then((res) => ({ channel: 'email' as const, to, ...res }))
      );
    }
    if (m.phone) {
      const to = m.phone as string;
      jobs.push(
        sendSms({ to, body: digest.sms }).then((res) => ({ channel: 'sms' as const, to, ...res }))
      );
    }
  }

  const results = await Promise.all(jobs);

  // Full address goes to the Vercel log, which is behind account auth.
  for (const r of results) {
    if (!r.ok) console.error(`${kind} digest ${r.channel} to ${r.to} failed: ${r.error}`);
  }

  const sent = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);

  if (sent) {
    // Record what actually landed. This is the audit trail whose absence made
    // the missed digests so hard to see.
    const byChannel = { email: 0, sms: 0 };
    for (const r of results) if (r.ok) byChannel[r.channel]++;
    const { error: logError } = await supabaseAdmin
      .from('digest_sends')
      .upsert(
        { date_key: dateKey, kind, result: { ...byChannel, failed: failed.length } },
        { onConflict: 'date_key,kind' }
      );
    if (logError) console.error('digest result log failed:', logError.message);
  } else {
    // Nothing got through on any channel. Give the slot back so the next sweep
    // tries again instead of the claim asserting a send that never happened.
    await releaseClaim(dateKey, kind, dryRun || force);
  }

  // The response body is a different audience: this repo is public and
  // .github/workflows/digest.yml cats it straight into the Actions log, so an
  // unmasked address here would publish a manager's personal mobile. Channel
  // plus the last four is enough to tell which recipient failed.
  const errors = failed.map((r) => ({ channel: r.channel, to: mask(r.to), error: r.error }));

  // A non-200 on failure makes the miss visible in Vercel's cron log rather
  // than silently succeeding — the whole point is that a missing digest must
  // not read as "nothing to report".
  return NextResponse.json(
    { kind, dateKey, sent, failed: failed.length, errors },
    { status: failed.length && !sent ? 502 : 200 }
  );
}
