import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * Employee names for the clock-in dropdown.
 *
 * Names only — never PINs. This is what replaces the EMPLOYEES array that used
 * to ship to every browser with all 23 PINs attached.
 *
 * Adding or removing a person is now a database row, not a code deploy. The git
 * log shows the old cost of this: "Add employee Tim Larkin with PIN",
 * "Change Dexter's PIN to 6628" — production deploys to onboard a hire.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  // Column is is_active, not active — the table predates this code.
  const { data, error } = await supabaseAdmin
    .from('employees')
    .select('name')
    .eq('is_active', true)
    .order('name');

  if (error) {
    console.error('roster fetch failed:', error.message);
    return NextResponse.json({ error: 'Could not load the employee list.' }, { status: 503 });
  }

  return NextResponse.json({ employees: (data ?? []).map((e) => e.name) });
}
