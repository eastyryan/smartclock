/**
 * Client-side fetch wrapper.
 *
 * Every mutation used to swallow its failure:
 *
 *   const { error } = await supabase.from('clock_events').insert({...});
 *   if (!error && data) { setActiveClocks(...) }   // no else branch
 *
 * ...and the caller then reported success unconditionally, so an employee in a
 * dead zone saw "clocked in at Navaho" while nothing had been written. This
 * returns a discriminated result so a failure cannot be ignored by accident —
 * the success value is only reachable through the `ok` branch.
 */

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string };

const NETWORK_MESSAGE =
  'No connection. Check your signal and try again — nothing was saved.';

export async function api<T = unknown>(
  path: string,
  init?: { method?: string; body?: unknown; signal?: AbortSignal }
): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, {
      method: init?.method ?? (init?.body ? 'POST' : 'GET'),
      headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
      body: init?.body ? JSON.stringify(init.body) : undefined,
      signal: init?.signal,
      credentials: 'same-origin',
    });

    let payload: unknown = null;
    try {
      payload = await res.json();
    } catch {
      // fall through to the status-based message below
    }

    if (!res.ok) {
      const msg =
        payload && typeof payload === 'object' && 'error' in payload
          ? String((payload as { error: unknown }).error)
          : `Something went wrong (${res.status}).`;
      return { ok: false, error: msg };
    }

    return { ok: true, data: payload as T };
  } catch {
    return { ok: false, error: NETWORK_MESSAGE };
  }
}

/**
 * One-shot GPS read for clock in/out.
 *
 * Resolves to null rather than rejecting when location is unavailable, so the
 * caller decides what an absent fix means — clock-in refuses without one,
 * clock-out still succeeds and records "unknown".
 */
export function getFix(
  timeoutMs = 10000
): Promise<{ lat: number; lng: number; accuracy: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 }
    );
  });
}
