/**
 * Geofence math. Shared by the clock-in and clock-out routes so the two can
 * never drift apart.
 */

export const DEFAULT_FENCE_RADIUS_M = 359;

/** Readings vaguer than this tell us nothing useful (typically IP geolocation). */
export const MAX_TRUSTED_ACCURACY_M = 1000;

export type Fix = { lat: number; lng: number; accuracy?: number | null };
export type Site = { lat: number; lng: number; radius?: number | null };

/** Great-circle distance in metres. */
export function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const p = Math.PI / 180;
  const a =
    0.5 -
    Math.cos((lat2 - lat1) * p) / 2 +
    (Math.cos(lat1 * p) * Math.cos(lat2 * p) * (1 - Math.cos((lon2 - lon1) * p))) / 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export type FenceResult = {
  distanceM: number | null;
  /**
   * true  - inside the radius
   * false - CONFIDENTLY outside, accounting for GPS error
   * null  - no usable fix; treat as unknown, never as evidence
   */
  withinFence: boolean | null;
  accuracyM: number | null;
};

/**
 * Evaluate a GPS fix against a job site.
 *
 * The accuracy handling here is the point. A phone under tree cover can report
 * a position 400m off with ±300m accuracy — that reading is consistent with
 * standing on site, so flagging it as "clocked out from home" would be wrong.
 * A shift is only marked outside the fence when the *nearest* point the
 * employee could plausibly be is still beyond the radius.
 *
 * The asymmetry is deliberate: we err toward "unknown" rather than toward
 * accusing someone, because a flag here starts a conversation with a manager.
 */
export function evaluateFence(fix: Fix | null | undefined, site: Site): FenceResult {
  if (!fix || !Number.isFinite(fix.lat) || !Number.isFinite(fix.lng)) {
    return { distanceM: null, withinFence: null, accuracyM: null };
  }

  const accuracy = Number.isFinite(fix.accuracy) ? Number(fix.accuracy) : null;
  const distance = distanceMeters(fix.lat, fix.lng, site.lat, site.lng);
  const radius = site.radius ?? DEFAULT_FENCE_RADIUS_M;

  if (accuracy !== null && accuracy > MAX_TRUSTED_ACCURACY_M) {
    return { distanceM: Math.round(distance), withinFence: null, accuracyM: Math.round(accuracy) };
  }

  const inside = distance <= radius;
  const confidentlyOutside = distance - (accuracy ?? 0) > radius;

  return {
    distanceM: Math.round(distance),
    withinFence: inside ? true : confidentlyOutside ? false : null,
    accuracyM: accuracy === null ? null : Math.round(accuracy),
  };
}

/** Human-readable distance for the manager board and SMS digests. */
export function formatDistance(m: number | null | undefined): string {
  if (m === null || m === undefined) return 'unknown';
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}
