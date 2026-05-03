import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase-admin';

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// POST /api/payments/defer-overdue
// Moves every overdue/pending payment that is before `date` to AFTER its
// loan's end_date — no interest added, just a grace deferral.
//
// If a loan has multiple overdue payments, they are staggered consecutively:
//   loan ends day 100 → overdue #1 → day 101, overdue #2 → day 102 …
// Each loan's end_date is then updated to the last deferred payment's date.
export async function POST(request: NextRequest) {
  try {
    const { date } = await request.json();
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'date required (YYYY-MM-DD)' }, { status: 400 });
    }

    // 1. Fetch all overdue/pending payments before today
    const { data: overdueRows, error: fetchErr } = await db
      .from('payments')
      .select('id, loan_id, due_date')
      .in('status', ['pending', 'overdue'])
      .lt('due_date', date);

    if (fetchErr) throw fetchErr;
    if (!overdueRows || overdueRows.length === 0) {
      return NextResponse.json({ deferred: 0, loansExtended: 0 });
    }

    // 2. Fetch end_dates for all affected loans
    const loanIds = [...new Set(overdueRows.map((p: any) => p.loan_id as string))];
    const { data: loanRows, error: loanErr } = await db
      .from('loans')
      .select('id, end_date')
      .in('id', loanIds);

    if (loanErr) throw loanErr;
    const loanEndMap = new Map<string, string>(
      (loanRows ?? []).map((l: any) => [l.id as string, l.end_date as string])
    );

    // 3. Group overdue payments by loan and sort by original due_date (earliest first)
    const byLoan = new Map<string, Array<{ id: string; due_date: string }>>();
    for (const p of overdueRows as Array<{ id: string; loan_id: string; due_date: string }>) {
      const arr = byLoan.get(p.loan_id) ?? [];
      arr.push({ id: p.id, due_date: p.due_date });
      byLoan.set(p.loan_id, arr);
    }

    // 4. Compute new dates: stagger consecutively after loan end_date
    //    overdue #1 → end+1, overdue #2 → end+2 …
    const paymentUpdates: Array<{ id: string; newDate: string }> = [];
    const loanEndUpdates = new Map<string, string>(); // loanId → new end_date

    for (const [loanId, payments] of byLoan) {
      const endDate = loanEndMap.get(loanId);
      if (!endDate) continue;

      payments.sort((a, b) => a.due_date.localeCompare(b.due_date));

      payments.forEach((p, i) => {
        paymentUpdates.push({ id: p.id, newDate: addDays(endDate, i + 1) });
      });

      // Loan end_date extends to cover the last deferred payment
      loanEndUpdates.set(loanId, addDays(endDate, payments.length));
    }

    // 5. Bulk-update payments — group by newDate for fewer DB calls
    const now = new Date().toISOString();
    const byNewDate = new Map<string, string[]>();
    for (const { id, newDate } of paymentUpdates) {
      const ids = byNewDate.get(newDate) ?? [];
      ids.push(id);
      byNewDate.set(newDate, ids);
    }

    let deferred = 0;
    for (const [newDate, ids] of byNewDate) {
      const { data, error } = await db
        .from('payments')
        .update({ due_date: newDate, status: 'pending', updated_at: now })
        .in('id', ids)
        .select('id');
      if (error) throw error;
      deferred += (data ?? []).length;
    }

    // 6. Update loan end_dates
    let loansExtended = 0;
    for (const [loanId, newEndDate] of loanEndUpdates) {
      const { error } = await db
        .from('loans')
        .update({ end_date: newEndDate, updated_at: now })
        .eq('id', loanId);
      if (!error) loansExtended++;
    }

    return NextResponse.json({ deferred, loansExtended });
  } catch (e) {
    console.error('[defer-overdue]', e);
    return NextResponse.json({ error: 'Failed to defer overdue payments' }, { status: 500 });
  }
}
