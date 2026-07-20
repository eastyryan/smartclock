import 'server-only';

/**
 * Outbound notifications.
 *
 * Email via Resend. Deliberately the only place that talks to a delivery
 * provider, so swapping to SMS later (Twilio, simpletext.dev, whatever) is a
 * change to this one function rather than to the digest logic.
 *
 * Context for anyone reading this later: SMS was the original plan, but every
 * free route into Canadian mobiles is dead. Rogers decommissioned its
 * email-to-SMS gateway (pcs.rogers.com no longer resolves; sms.rogers.com is a
 * CNAME to a domain that doesn't exist), Telus blocks it outright, Textbelt
 * geo-blocks Canada for abuse, and GC Notify is government-only.
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
