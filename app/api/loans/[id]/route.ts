import { NextRequest, NextResponse } from 'next/server';
import {
  getLoanAdmin, updateLoanAdmin, deleteLoanAdmin,
  getPaymentsAdmin, createLoanAdmin,
} from '@/lib/db/loans';
import { db } from '@/lib/supabase-admin';
import {
  localDateStr, computePaymentStatus,
  calculateLoan, calculateDailyLoan,
  generateWeeklySchedule, generateDailySchedule,
} from '@/lib/calculations';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const loan = await getLoanAdmin(id);
    if (!loan) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    let payments = await getPaymentsAdmin(id);
    payments = payments.map((p) => ({
      ...p,
      status: computePaymentStatus({ ...p, dueDate: p.dueDate, expectedAmount: p.expectedAmount, paidAmount: p.paidAmount }),
    }));

    return NextResponse.json({ ...loan, payments });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Failed to fetch loan' }, { status: 500 });
  }
}

/**
 * PUT /api/loans/[id]
 *
 * Safe fields (no schedule change): notes, status, customerName, customerPhone.
 * Schedule-affecting fields: principal, interestRate, loanTermPeriods, startDate, planType.
 *   → These trigger a schedule regeneration. ONLY pending/unpaid payment rows are deleted
 *     and regenerated; already-paid rows are kept so collected data isn't lost.
 *   → Client must send { regenerate: true } to confirm intentional regeneration.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const existing = await getLoanAdmin(id);
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // ── Safe field updates ──────────────────────────────────────────────────
    const safePatch: Partial<typeof existing> = {};
    if (body.notes           !== undefined) safePatch.notes           = body.notes;
    if (body.status          !== undefined) safePatch.status          = body.status;
    if (body.customerName    !== undefined) safePatch.customerName    = body.customerName;
    if (body.customerPhone   !== undefined) safePatch.customerPhone   = body.customerPhone;

    // Custom interest amount (standalone — does NOT require regeneration)
    if (!body.regenerate && body.customInterestAmount !== undefined) {
      const customAmt = parseFloat(body.customInterestAmount);
      if (!isNaN(customAmt) && customAmt >= 0) {
        safePatch.interestAmount = customAmt;
        safePatch.totalAmount = existing.principal + customAmt;
      }
    }

    // ── Schedule-affecting changes ──────────────────────────────────────────
    const wantsRegenerate =
      body.regenerate === true &&
      (body.principal !== undefined || body.interestRate !== undefined ||
       body.loanTermPeriods !== undefined || body.startDate !== undefined ||
       body.planType !== undefined);

    if (wantsRegenerate) {
      const planType = body.planType ?? existing.planType;
      const principal = parseFloat(body.principal) || existing.principal;
      const rate = parseFloat(body.interestRate) || existing.interestRate;
      const periods = parseInt(body.loanTermPeriods) || existing.loanTermPeriods;
      const startDate = body.startDate || existing.startDate;
      const cfg = existing.scheduleConfig ?? {};

      let interestAmount: number, periodAmount: number, totalPeriods: number;
      if (planType === 'daily') {
        const calc = calculateDailyLoan(principal, rate, periods);
        interestAmount = calc.interestAmount; periodAmount = calc.dailyAmount; totalPeriods = calc.totalDays;
      } else {
        const calc = calculateLoan(principal, rate, periods);
        interestAmount = calc.interestAmount; periodAmount = calc.weeklyAmount; totalPeriods = calc.totalWeeks;
      }
      // Allow caller to override the auto-calculated interest amount
      if (body.customInterestAmount !== undefined) {
        const custom = parseFloat(body.customInterestAmount);
        if (!isNaN(custom) && custom >= 0) interestAmount = custom;
      }

      const skipDays: number[] = Array.isArray(cfg.skipDays) ? cfg.skipDays : [];
      const weeklyDayOfWeek: number | undefined =
        typeof cfg.weeklyDayOfWeek === 'number' ? cfg.weeklyDayOfWeek : undefined;

      const schedule = planType === 'daily'
        ? generateDailySchedule(id, startDate, totalPeriods, periodAmount, skipDays)
        : generateWeeklySchedule(id, startDate, totalPeriods, periodAmount, weeklyDayOfWeek);

      const endDateStr = schedule.length > 0
        ? schedule[schedule.length - 1].dueDate
        : localDateStr(new Date(startDate + 'T00:00:00'));

      // Delete only UNPAID payments (preserve already-collected rows)
      await db.from('payments')
        .delete()
        .eq('loan_id', id)
        .neq('status', 'paid');

      // Get already-paid period numbers so we don't re-insert them
      const { data: paidRows } = await db.from('payments')
        .select('period_number')
        .eq('loan_id', id)
        .eq('status', 'paid');
      const paidPeriods = new Set((paidRows ?? []).map((r: any) => r.period_number));

      const now = new Date().toISOString();
      const newPaymentRows = schedule
        .filter(s => !paidPeriods.has(s.periodNumber))
        .map(s => ({
          loan_id:         id,
          period_number:   s.periodNumber,
          due_date:        s.dueDate,
          expected_amount: s.expectedAmount,
          paid_amount:     0,
          paid_date:       null,
          status:          'pending',
          notes:           '',
          created_at:      now,
          updated_at:      now,
        }));

      if (newPaymentRows.length > 0) {
        const { error: pErr } = await db.from('payments').insert(newPaymentRows);
        if (pErr) throw pErr;
      }

      Object.assign(safePatch, {
        planType, principal, interestRate: rate, loanTermPeriods: periods,
        totalPeriods, interestAmount, totalAmount: principal + interestAmount,
        periodAmount, startDate, endDate: endDateStr,
      });
    }

    await updateLoanAdmin(id, safePatch);
    const updated = await getLoanAdmin(id);
    const payments = await getPaymentsAdmin(id);
    return NextResponse.json({ ...updated, payments });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Failed to update loan' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const existing = await getLoanAdmin(id);
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // ── Interest collection patch ─────────────────────────────────────────────
    if ('interest_collected' in body) {
      const collected = !!body.interest_collected;
      const patch: Parameters<typeof updateLoanAdmin>[1] = {
        interestCollected: collected,
        interestCollectedDate: collected ? (body.interest_collected_date || localDateStr(new Date())) : null,
      };
      // Allow caller to update the interest amount at collect time (manual override)
      if (typeof body.interest_amount === 'number' && body.interest_amount >= 0) {
        patch.interestAmount = body.interest_amount;
        patch.totalAmount = existing.principal + body.interest_amount;
      }
      await updateLoanAdmin(id, patch);
    }

    // ── Standalone interest amount update (no interest_collected change) ──────
    else if ('interest_amount' in body) {
      const amt = parseFloat(body.interest_amount);
      if (!isNaN(amt) && amt >= 0) {
        await updateLoanAdmin(id, {
          interestAmount: amt,
          totalAmount: existing.principal + amt,
        });
      }
    }

    return NextResponse.json(await getLoanAdmin(id));
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Failed to update loan' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await deleteLoanAdmin(id);
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Failed to delete loan' }, { status: 500 });
  }
}
