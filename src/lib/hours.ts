/**
 * Payroll hours.
 *
 * The 30-minute deduction is unconditional and MUST STAY THAT WAY.
 *
 * It is not a bug and it is not naive. Deducting per shift is precisely what
 * removes the incentive to split a day: an employee who clocks out and back in
 * to dodge the lunch deduction takes it twice (2 x 0.5h) instead of once, so
 * splitting costs them rather than paying them. Applying it only to long shifts
 * would re-open exactly the loophole this closes.
 *
 * Short shifts clamping to 0.00 is likewise intentional. Those are corrected by
 * a manager through the edit flow, face to face with the employee — a
 * deliberate human step, not an oversight to automate away.
 *
 * Behaviour is byte-for-byte identical to the original calcHours() in
 * src/app/page.tsx; only its location changed. Do not "improve" this without
 * talking to Nick or Jake first.
 */
export const LUNCH_DEDUCTION_HOURS = 0.5;

export function calcHours(clockInISO: string, clockOutISO: string): number {
  const diff = (new Date(clockOutISO).getTime() - new Date(clockInISO).getTime()) / 3600000;
  return Math.round(Math.max(0, diff - LUNCH_DEDUCTION_HOURS) * 100) / 100;
}
