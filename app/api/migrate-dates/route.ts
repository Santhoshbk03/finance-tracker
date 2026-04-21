import { NextResponse } from 'next/server';
import getDb from '@/lib/db';

function localDateStr(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * POST /api/migrate-dates
 * Recalculates all weekly_payment due_dates using timezone-safe arithmetic:
 *   due_date = start_date + week_number * 7 days
 * This fixes records created before the localDateStr() fix (when toISOString()
 * caused a 1-day shift in IST timezone).
 */
export async function POST() {
  try {
    const db = getDb();

    const loans = db.prepare(`
      SELECT id, start_date FROM loans
    `).all() as { id: number; start_date: string }[];

    const updatePayment = db.prepare(`
      UPDATE weekly_payments SET due_date = ? WHERE loan_id = ? AND week_number = ?
    `);

    const payments = db.prepare(`
      SELECT week_number FROM weekly_payments WHERE loan_id = ?
    `);

    let updated = 0;

    const migrate = db.transaction(() => {
      for (const loan of loans) {
        const start = new Date(loan.start_date + 'T00:00:00');
        const weeks = payments.all(loan.id) as { week_number: number }[];

        for (const { week_number } of weeks) {
          const dueDate = new Date(start);
          dueDate.setDate(start.getDate() + week_number * 7);
          const correct = localDateStr(dueDate);
          updatePayment.run(correct, loan.id, week_number);
          updated++;
        }
      }
    });

    migrate();

    return NextResponse.json({ ok: true, updated, loans: loans.length });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
