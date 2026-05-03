import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase-admin';

// POST /api/payments/roll-overdue
// Moves all past-due unpaid payments' due_date forward to `date` and resets
// status to 'pending' — so they appear as today's to-collect instead of
// piling up as a growing overdue backlog.
export async function POST(request: NextRequest) {
  try {
    const { date } = await request.json();
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'date required (YYYY-MM-DD)' }, { status: 400 });
    }

    // Update all overdue/pending payments that are before today.
    // Paid payments always have status='paid', so the status filter is
    // sufficient — no need for a paid_amount column comparison.
    const { data: updated, error: updateErr } = await db
      .from('payments')
      .update({
        due_date:   date,
        status:     'pending',
        updated_at: new Date().toISOString(),
      })
      .lt('due_date', date)
      .in('status', ['pending', 'overdue'])
      .select('id');

    if (updateErr) throw updateErr;

    return NextResponse.json({ updated: (updated ?? []).length });
  } catch (e) {
    console.error('[roll-overdue]', e);
    return NextResponse.json({ error: 'Failed to roll overdue payments' }, { status: 500 });
  }
}
