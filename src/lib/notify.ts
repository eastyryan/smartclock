import 'server-only';

/**
 * Outbound notifications.
 *
 * Email via Resend, SMS via Twilio. Deliberately the only place that talks to a
 * delivery provider, so the digest logic never learns who carries the message.
 *
 * Context for anyone reading this later: SMS was the original plan, but every
 * FREE route into Canadian mobiles is dead. Rogers decommissioned its
 * email-to-SMS gateway (pcs.rogers.com no longer resolves; sms.rogers.com is a
 * CNAME to a domain that doesn't exist), Telus blocks it outright, Textbelt
 * geo-blocks Canada for abuse, and GC Notify is government-only. Twilio is the
 * paid route that reopened it.
 *
 * Email stays on Resend rather than moving to Twilio's SendGrid: this app sends
 * roughly 60 emails a month against a 3,000/month free tier, and SendGrid has
 * no free tier. Moving it would cost ~$20/month to change nothing.
 */

export type SendResult = { ok: true; id: string } | { ok: false; error: string };

export async function sendEmail(opts: {
  to: string;
  subject: string;
  text: string;
  /** Optional HTML alternative. Clients that reject HTML fall back to `text`. */
  html?: string;
}): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: 'RESEND_API_KEY is not set' };

  // Falls back to Resend's shared sender, which only delivers to the Resend
  // account owner. Set DIGEST_FROM to an address on a verified domain to reach
  // anyone else.
  const from = process.env.DIGEST_FROM || 'onboarding@resend.dev';

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [opts.to],
        subject: opts.subject,
        text: opts.text,
        ...(opts.html ? { html: opts.html } : {}),
      }),
    });

    const body = await res.json().catch(() => null);

    if (!res.ok) {
      const msg =
        body && typeof body === 'object' && 'message' in body
          ? String((body as { message: unknown }).message)
          : `Resend returned ${res.status}`;
      return { ok: false, error: msg };
    }
    return { ok: true, id: String((body as { id?: string })?.id ?? '') };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'network error' };
  }
}

/**
 * Normalize a stored number to E.164, the only format Twilio accepts.
 *
 * managers.phone was typed in by hand back when the free-gateway plan was
 * alive, so it may be "(416) 555-0123", "416-555-0123", or already
 * "+14165550123". Returns null when it cannot be read as a North American
 * number, so the caller can skip it loudly instead of paying for a message
 * that was never going to land.
 */
export function toE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, '');

  if (trimmed.startsWith('+')) return digits.length >= 11 ? `+${digits}` : null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

/**
 * Force a message into the GSM-7 character set.
 *
 * This is cost control, not cosmetics. A single character outside GSM-7 — an
 * em dash, a curly quote, the "o-circumflex" in a site name — flips the entire
 * message to UCS-2 encoding, which drops the per-segment budget from 153
 * characters to 67. One stray dash inherited from the email copy can therefore
 * double what every digest costs to send, forever, with nothing looking wrong.
 *
 * Written with \u escapes rather than literal characters because several of
 * these are invisible or indistinguishable from ASCII in an editor.
 */
export function toGsm7(s: string): string {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '')  // fold accents: Cote -> Cote
    .replace(/[‐-―]/g, '-')                  // hyphens, en/em dashes
    .replace(/[‘’]/g, "'")                   // curly single quotes
    .replace(/[“”]/g, '"')                   // curly double quotes
    .replace(/…/g, '...')                         // ellipsis
    .replace(/[   ]/g, ' ')             // non-breaking spaces
    // Anything still outside this set would force UCS-2, so it goes.
    .replace(/[^\n\r A-Za-z0-9@$!"#%&'()*+,\-./:;<=>?_]/g, '');
}

export async function sendSms(opts: { to: string; body: string }): Promise<SendResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const from = process.env.TWILIO_FROM_NUMBER;

  // Twilio accepts either the account's own Auth Token or a scoped API Key
  // pair. Prefer the API key where present: it can be revoked on its own,
  // whereas rotating the Auth Token invalidates every other integration.
  // Either way the request URL is keyed by the Account SID.
  const authUser = process.env.TWILIO_API_KEY_SID || accountSid;
  const authPass = process.env.TWILIO_API_KEY_SECRET || process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid) return { ok: false, error: 'TWILIO_ACCOUNT_SID is not set' };
  if (!authPass) return { ok: false, error: 'TWILIO_AUTH_TOKEN (or TWILIO_API_KEY_SECRET) is not set' };
  if (!from) return { ok: false, error: 'TWILIO_FROM_NUMBER is not set' };

  const to = toE164(opts.to);
  if (!to) return { ok: false, error: `"${opts.to}" is not a usable phone number` };

  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${authUser}:${authPass}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: from, Body: toGsm7(opts.body) }),
    });

    const body = await res.json().catch(() => null);

    if (!res.ok) {
      // Twilio returns {code, message}. The code is the half worth keeping —
      // 21610 recipient replied STOP, 21408 region not enabled on the account,
      // 30034 sending from a number with no approved A2P campaign.
      const err = body as { code?: number; message?: string } | null;
      const detail = err ? [err.code, err.message].filter(Boolean).join(' ') : '';
      return { ok: false, error: detail || `Twilio returned ${res.status}` };
    }
    return { ok: true, id: String((body as { sid?: string })?.sid ?? '') };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'network error' };
  }
}
