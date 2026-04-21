/**
 * Finance Calculation Utilities
 *
 * Business model:
 *  - Interest is collected UPFRONT on the loan start date
 *  - Customer repays PRINCIPAL ONLY over the agreed plan period
 *  - Weekly plan: weekly_amount = principal / total_weeks
 *  - Daily plan:  daily_amount  = principal / total_days
 *  - interest_amount = principal × rate × ceil(periods/4) / 100
 *    (periods = weeks for weekly, days/7 for daily — both round up to months)
 */

/** Format a local Date as YYYY-MM-DD without timezone shift (IST-safe) */
export function localDateStr(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// ─── Weekly Plan ─────────────────────────────────────────────────────────────

export function calculateLoan(
  principal: number,
  interestRatePerMonth: number = 4,
  loanTermWeeks: number = 10
) {
  const months = Math.ceil(loanTermWeeks / 4);
  const interestAmount = Math.round((principal * interestRatePerMonth * months) / 100 * 100) / 100;
  const weeklyAmount = Math.round((principal / loanTermWeeks) * 100) / 100;

  return {
    interestAmount,
    totalAmount: Math.round((principal + interestAmount) * 100) / 100,
    weeklyAmount,
    totalWeeks: loanTermWeeks,
  };
}

/**
 * Generate a weekly schedule.
 * @param dayOfWeek optional 0-6 (Sun-Sat). If set, each payment falls on that weekday.
 *                  The first payment is the first occurrence of that weekday ON OR AFTER
 *                  (startDate + 7 days). If undefined, payment day matches startDate's weekday.
 */
export function generateWeeklySchedule(
  loanId: number | string,
  startDate: string,
  totalWeeks: number,
  weeklyAmount: number,
  dayOfWeek?: number
) {
  const schedule = [];
  const start = new Date(startDate + 'T00:00:00');

  // First due date: one week after start, then roll forward to dayOfWeek if provided
  const firstDue = new Date(start);
  firstDue.setDate(start.getDate() + 7);
  if (typeof dayOfWeek === 'number' && dayOfWeek >= 0 && dayOfWeek <= 6) {
    const diff = (dayOfWeek - firstDue.getDay() + 7) % 7;
    firstDue.setDate(firstDue.getDate() + diff);
  }

  for (let week = 1; week <= totalWeeks; week++) {
    const dueDate = new Date(firstDue);
    dueDate.setDate(firstDue.getDate() + (week - 1) * 7);
    schedule.push({
      loan_id: loanId,
      week_number: week,
      periodNumber: week,
      due_date: localDateStr(dueDate),
      dueDate: localDateStr(dueDate),
      expected_amount: weeklyAmount,
      expectedAmount: weeklyAmount,
    });
  }
  return schedule;
}

// ─── Daily Plan ──────────────────────────────────────────────────────────────

export function calculateDailyLoan(
  principal: number,
  interestRatePerMonth: number = 4,
  loanTermDays: number = 100
) {
  // Convert days to months (round up to nearest month) for interest
  const months = Math.ceil(loanTermDays / 30);
  const interestAmount = Math.round((principal * interestRatePerMonth * months) / 100 * 100) / 100;
  const dailyAmount = Math.round((principal / loanTermDays) * 100) / 100;

  return {
    interestAmount,
    totalAmount: Math.round((principal + interestAmount) * 100) / 100,
    dailyAmount,
    totalDays: loanTermDays,
  };
}

/**
 * Generate a daily schedule. Skips any weekdays in `skipDays` (0=Sun .. 6=Sat).
 * Generates exactly `totalDays` payment rows — skipped days push the schedule forward.
 */
export function generateDailySchedule(
  loanId: number | string,
  startDate: string,
  totalDays: number,
  dailyAmount: number,
  skipDays?: number[]
) {
  const schedule = [];
  const start = new Date(startDate + 'T00:00:00');
  const skipSet = new Set((skipDays || []).filter(d => d >= 0 && d <= 6));

  const dueDate = new Date(start);
  let period = 1;
  // Safety cap to prevent infinite loop if all 7 days are skipped
  const maxIter = totalDays * 10 + 30;
  let iter = 0;
  while (period <= totalDays && iter < maxIter) {
    dueDate.setDate(dueDate.getDate() + 1);
    iter++;
    if (skipSet.has(dueDate.getDay())) continue;
    schedule.push({
      loan_id: loanId,
      week_number: period,      // kept for SQLite compat
      periodNumber: period,
      due_date: localDateStr(dueDate),
      dueDate: localDateStr(dueDate),
      expected_amount: dailyAmount,
      expectedAmount: dailyAmount,
    });
    period++;
  }
  return schedule;
}

// ─── Shared Utilities ────────────────────────────────────────────────────────

/** Format Indian phone number to WhatsApp format: 91XXXXXXXXXX */
export function formatWhatsAppNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return digits;
  if (digits.length === 11 && digits.startsWith('0')) return `91${digits.slice(1)}`;
  return digits;
}

/** Compute display status for a payment without hitting the DB */
export function computePaymentStatus(
  payment: { status: string; paidAmount: number; expectedAmount: number; dueDate: string }
): 'paid' | 'partial' | 'overdue' | 'pending' {
  if (payment.status === 'paid' || payment.paidAmount >= payment.expectedAmount) return 'paid';
  if (payment.paidAmount > 0) return 'partial';
  const today = localDateStr(new Date());
  if (payment.dueDate < today) return 'overdue';
  return 'pending';
}
