/**
 * All date logic for SmartClock happens in America/Toronto.
 *
 * This matters more than it looks. The existing app mixes UTC and local time:
 * the Active Board computes "shifts today" with
 *   new Date().toISOString().split("T")[0]
 * which is a UTC date, so in Ottawa any shift starting after 8:00 PM local is
 * counted on the following day. Pay period boundaries are built with
 * new Date(y, m, 1) — the browser's zone — then compared against UTC
 * timestamps, so the answer depends on where the manager happens to be.
 *
 * The digests run on Vercel, where the server clock is UTC, so doing this
 * properly is not optional: a naive implementation would send the "6pm" digest
 * at 2pm and report the wrong day's shifts.
 */

export const TZ = 'America/Toronto';

export type TorontoParts = {
  year: number; month: number; day: number;
  hour: number; minute: number;
  /** YYYY-MM-DD in Toronto local time. */
  dateKey: string;
};

/** Break a UTC instant into Toronto wall-clock parts. */
export function torontoParts(d: Date = new Date()): TorontoParts {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const p: Record<string, string> = {};
  for (const { type, value } of fmt.formatToParts(d)) p[type] = value;

  // en-CA renders midnight as "24" rather than "00".
  const hour = Number(p.hour) % 24;

  return {
    year: Number(p.year), month: Number(p.month), day: Number(p.day),
    hour, minute: Number(p.minute),
    dateKey: `${p.year}-${p.month}-${p.day}`,
  };
}

/**
 * UTC instants bounding a Toronto calendar day.
 *
 * Derived by probing the actual offset for that date rather than assuming -5 or
 * -4, so DST transitions are handled without special cases.
 */
export function torontoDayRange(ref: Date = new Date()): { startISO: string; endISO: string; dateKey: string } {
  const { year, month, day, dateKey } = torontoParts(ref);

  const offsetMinutesAt = (utc: Date): number => {
    const p = torontoParts(utc);
    const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    return (asUTC - Math.floor(utc.getTime() / 60000) * 60000) / 60000;
  };

  // First approximation of local midnight, then correct using that instant's
  // real offset. Two passes settle it either side of a DST boundary.
  let guess = new Date(Date.UTC(year, month - 1, day, 0, 0));
  for (let i = 0; i < 2; i++) {
    guess = new Date(guess.getTime() - offsetMinutesAt(guess) * 60000);
  }

  const start = guess;
  const end = new Date(start.getTime() + 24 * 3600 * 1000);
  return { startISO: start.toISOString(), endISO: end.toISOString(), dateKey };
}

/** e.g. "7:12 AM" */
export function formatTime(iso: string | Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(typeof iso === 'string' ? new Date(iso) : iso);
}

/** e.g. "Monday, July 20" */
export function formatDay(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, weekday: 'long', month: 'long', day: 'numeric',
  }).format(d);
}

/** Hours between two instants, to one decimal. */
export function hoursBetween(from: string | Date, to: string | Date = new Date()): number {
  const a = typeof from === 'string' ? new Date(from) : from;
  const b = typeof to === 'string' ? new Date(to) : to;
  return Math.round(((b.getTime() - a.getTime()) / 3600000) * 10) / 10;
}
