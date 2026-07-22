import 'server-only';
import { supabaseAdmin } from './supabase-admin';
import { torontoDayRange, formatTime, hoursBetween, torontoParts, TZ } from './tz';
import { formatDistance } from './geo';

/**
 * Builds the 9:30 AM and 6:00 PM manager digests.
 *
 * Sent as HTML with a plain-text alternative, because the format calls for a
 * bold subheading. Mail clients that refuse HTML still get a readable message.
 *
 * Kept separate from the cron route so content can be generated and inspected
 * without sending — see /api/cron/digest?dryRun=1.
 */

/** Crews are expected on site at 8:00 AM; anything later is a late start. */
const LATE_AFTER = { hour: 8, minute: 0 };

type Row = {
  employee_name: string;
  site_name: string | null;
  clock_in: string;
  clock_out: string | null;
  hours: number | null;
  clock_out_distance_m: number | null;
  clock_out_within_fence: boolean | null;
};

const SELECT =
  'employee_name, site_name, clock_in, clock_out, hours, clock_out_distance_m, clock_out_within_fence';

export type Digest = { subject: string; text: string; html: string; sms: string };

/**
 * Roughly two GSM-7 segments (153 characters each).
 *
 * The SMS is a nudge, not a record — the full roster is in the email that goes
 * out alongside it. Capping here keeps a busy day from quietly turning one text
 * into six.
 */
const SMS_BUDGET = 300;

/**
 * Compact the digest down to something worth reading on a lock screen.
 *
 * Only the headline and the exceptions: a manager who wants the full roster
 * opens the email. Items that do not fit are counted rather than truncated
 * mid-sentence, so the text never implies it showed everything.
 */
function renderSms(headline: string, items: string[]): string {
  const out = [headline];
  let used = headline.length;
  let dropped = 0;

  for (const item of items) {
    // Keep scanning after a skip rather than breaking: a long flag should not
    // shut out the three short ones behind it.
    if (used + item.length + 1 > SMS_BUDGET) { dropped++; continue; }
    out.push(item);
    used += item.length + 1;
  }
  if (dropped) out.push(`+${dropped} more - see email`);

  return out.join('\n');
}

/** "Late: Chris 8:24 AM, Dave 8:40 AM" — one line, or nothing. */
function lateLine(late: Row[]): string[] {
  if (!late.length) return [];
  return [`Late: ${late.map((r) => `${r.employee_name} ${formatTime(r.clock_in)}`).join(', ')}`];
}

async function todaysRows(now: Date): Promise<Row[]> {
  const { startISO, endISO } = torontoDayRange(now);
  const { data, error } = await supabaseAdmin
    .from('clock_events').select(SELECT)
    .gte('clock_in', startISO).lt('clock_in', endISO).order('clock_in');
  if (error) throw new Error(`could not load shifts: ${error.message}`);
  return (data ?? []) as Row[];
}

async function openShifts(): Promise<Row[]> {
  const { data, error } = await supabaseAdmin
    .from('clock_events').select(SELECT).is('clock_out', null).order('clock_in');
  if (error) throw new Error(`could not load open shifts: ${error.message}`);
  return (data ?? []) as Row[];
}

function isLate(clockInISO: string): boolean {
  const p = torontoParts(new Date(clockInISO));
  return p.hour > LATE_AFTER.hour || (p.hour === LATE_AFTER.hour && p.minute > LATE_AFTER.minute);
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** "Fri Jul 17, 6:00 PM" */
function stamp(now: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(now).replace(' at ', ', ');
}

/** One roster line: name, times, job site. */
function line(r: Row): string {
  const times = r.clock_out
    ? `${formatTime(r.clock_in)} to ${formatTime(r.clock_out)}`
    : `in at ${formatTime(r.clock_in)}, still on`;
  return `${r.employee_name} — ${times} — ${r.site_name ?? 'unknown site'}`;
}

function render(parts: { heading: string; rows: Row[]; flags: string[]; late: Row[] }): { text: string; html: string } {
  const { heading, rows, flags, late } = parts;

  const text = [
    heading,
    '',
    ...(rows.length ? rows.map(line) : ['No shifts recorded.']),
    ...(flags.length ? ['', `Flags (${flags.length})`, ...flags.map((f) => `  ${f}`)] : []),
    ...(late.length
      ? ['', `Late starts, after 8:00 AM (${late.length})`,
         ...late.map((r) => `  ${r.employee_name} — ${formatTime(r.clock_in)} — ${r.site_name ?? 'unknown site'}`)]
      : []),
  ].join('\n');

  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:15px;line-height:1.6;color:#1e293b">
<p style="margin:0 0 10px"><strong>${esc(heading)}</strong></p>
<p style="margin:0 0 18px">
${rows.length ? rows.map((r) => esc(line(r))).join('<br>') : 'No shifts recorded.'}
</p>
${flags.length ? `<p style="margin:0 0 10px"><strong>Flags (${flags.length})</strong></p>
<p style="margin:0 0 18px;color:#b91c1c">${flags.map(esc).join('<br>')}</p>` : ''}
${late.length ? `<p style="margin:0 0 10px"><strong>Late starts, after 8:00 AM (${late.length})</strong></p>
<p style="margin:0 0 18px">${late.map((r) => esc(`${r.employee_name} — ${formatTime(r.clock_in)} — ${r.site_name ?? 'unknown site'}`)).join('<br>')}</p>` : ''}
</div>`;

  return { text, html };
}

/** 9:30 AM — who is on the clock right now. */
export async function buildMorningDigest(now = new Date()): Promise<Digest> {
  const [rows, open] = await Promise.all([todaysRows(now), openShifts()]);

  const stale = open.filter((r) => hoursBetween(r.clock_in, now) > 14);
  const flags = stale.map(
    (r) => `${r.employee_name} — clocked in ${hoursBetween(r.clock_in, now)}h ago, likely missed a clock-out`
  );

  const late = rows.filter((r) => isLate(r.clock_in));
  const heading = `Total Clocked-in/out - ${open.length} employees`;
  const { text, html } = render({ heading, rows: open, flags, late });

  const sms = renderSms(`DNRs ${formatTime(now)} - ${open.length} on the clock`, [
    ...stale.map((r) => `! ${r.employee_name} in ${hoursBetween(r.clock_in, now)}h ago, check clock-out`),
    ...lateLine(late),
  ]);

  return { subject: `DNRs App - ${stamp(now)}`, text, html, sms };
}

/** 6:00 PM — the day's summary, with flags a manager may need to act on. */
export async function buildEveningDigest(now = new Date()): Promise<Digest> {
  const [rows, open] = await Promise.all([todaysRows(now), openShifts()]);
  const closed = rows.filter((r) => r.clock_out);

  const flags: string[] = [];
  const smsFlags: string[] = [];

  // Only shifts we are CONFIDENT were outside the fence. clock_out_within_fence
  // is null when the GPS fix was too vague to mean anything, and a vague reading
  // must never be shown to a manager as evidence.
  for (const r of closed.filter((r) => r.clock_out_within_fence === false)) {
    const dist = formatDistance(r.clock_out_distance_m);
    const site = r.site_name ?? 'site';
    flags.push(`${r.employee_name} — clocked out ${dist} from ${site} at ${formatTime(r.clock_out!)}`);
    smsFlags.push(`! ${r.employee_name} out ${dist} from ${site} ${formatTime(r.clock_out!)}`);
  }
  for (const r of open) {
    const h = hoursBetween(r.clock_in, now);
    flags.push(`${r.employee_name} — still clocked in since ${formatTime(r.clock_in)} (${h}h)`);
    smsFlags.push(`! ${r.employee_name} still in since ${formatTime(r.clock_in)} (${h}h)`);
  }

  const late = rows.filter((r) => isLate(r.clock_in));
  const heading = `Total Clocked-in/out - ${rows.length} employees`;
  const { text, html } = render({ heading, rows, flags, late });

  const headline =
    `DNRs ${formatTime(now)} - ${rows.length} shifts today` + (open.length ? `, ${open.length} still on` : '');
  const sms = renderSms(headline, [...smsFlags, ...lateLine(late)]);

  return { subject: `DNRs App - ${stamp(now)}`, text, html, sms };
}
