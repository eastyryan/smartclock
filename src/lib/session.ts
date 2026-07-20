import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';

/**
 * Signed, httpOnly session cookies.
 *
 * Replaces the old `managerAuth` boolean, which lived in React state and could
 * be flipped in devtools, and the employee identity that was established by a
 * client-side string compare against a PIN in the JS bundle.
 *
 * Deliberately dependency-free: an HMAC over a JSON payload is enough here, and
 * pulling in a JWT library for this would be more surface than substance.
 */

export const SESSION_COOKIE = 'sc_session';

/**
 * Employee sessions are intentionally short. The clock screen resets to the PIN
 * pad after every action, so a punch is a complete interaction — there is no
 * reason to leave an identity resident on a phone that gets passed around a
 * truck. Managers get longer, since approving a pay period is a sitting task.
 */
const TTL_SECONDS = { employee: 15 * 60, manager: 2 * 60 * 60 } as const;

export type Role = 'employee' | 'manager';

export type Session = {
  role: Role;
  /** Employee name, or the manager's name when PINs are distinct. */
  name: string;
  /** True when the manager PIN matched more than one manager (shared PIN). */
  ambiguous?: boolean;
  exp: number;
};

function secret(): Buffer {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) {
    throw new Error(
      'SESSION_SECRET is missing or too short (needs >= 32 chars). ' +
        'Generate one with: openssl rand -base64 48'
    );
  }
  return Buffer.from(s, 'utf8');
}

const b64url = (b: Buffer) => b.toString('base64url');

function sign(body: string): string {
  return b64url(createHmac('sha256', secret()).update(body).digest());
}

export function createToken(session: Omit<Session, 'exp'>): { token: string; maxAge: number } {
  const maxAge = TTL_SECONDS[session.role];
  const payload: Session = { ...session, exp: Math.floor(Date.now() / 1000) + maxAge };
  const body = b64url(Buffer.from(JSON.stringify(payload), 'utf8'));
  return { token: `${body}.${sign(body)}`, maxAge };
}

export function verifyToken(token: string | undefined): Session | null {
  if (!token) return null;
  const dot = token.lastIndexOf('.');
  if (dot < 1) return null;

  const body = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1));
  const want = Buffer.from(sign(body));

  // Length check first: timingSafeEqual throws on a length mismatch.
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;

  try {
    const session = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Session;
    if (typeof session.exp !== 'number' || session.exp * 1000 < Date.now()) return null;
    if (session.role !== 'employee' && session.role !== 'manager') return null;
    if (typeof session.name !== 'string' || !session.name) return null;
    return session;
  } catch {
    return null;
  }
}

export async function readSession(): Promise<Session | null> {
  const jar = await cookies();
  return verifyToken(jar.get(SESSION_COOKIE)?.value);
}

/** Returns the session only if it is a manager session. */
export async function readManagerSession(): Promise<Session | null> {
  const s = await readSession();
  return s?.role === 'manager' ? s : null;
}

export function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
  };
}

export const newSecret = () => randomBytes(48).toString('base64');
