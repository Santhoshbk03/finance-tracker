import { NextRequest, NextResponse } from 'next/server';
import { getLoansAdmin, createLoanAdmin } from '@/lib/db/loans';
import { getCustomerAdmin } from '@/lib/db/customers';
import {
  calculateLoan, calculateDailyLoan,
  generateWeeklySchedule, generateDailySchedule,
  localDateStr,
} from '@/lib/calculations';
import { sendWhatsAppLoanCreated } from '@/lib/whatsapp';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || undefined;
    const customerId = searchParams.get('customer_id') || undefined;

    const loans = await getLoansAdmin({ status, customerId });
    return NextResponse.json(loans);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Failed to fetch loans' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      customer_id,
      principal,
      interest_rate = 4,
      plan_type = 'weekly',
      loan_term_periods,
      loan_term_weeks,   // legacy compat
      start_date,
      notes,
      interest_amount: customInterest,
      schedule_config,
      interest_collected,
    } = body;

    if (!customer_id || !principal || !start_date) {
      return NextResponse.json({ error: 'customer_id, principal, start_date are required' }, { status: 400 });
    }

    const planType: 'weekly' | 'daily' = plan_type === 'daily' ? 'daily' : 'weekly';
    const periods = parseInt(loan_term_periods || loan_term_weeks || (planType === 'daily' ? '100' : '10'));
    const p = parseFloat(principal);
    const rate = parseFloat(interest_rate);

    // Get customer for denormalization
    const customer = await getCustomerAdmin(customer_id);
    if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 });

    let interestAmount: number;
    let periodAmount: number;
    let totalPeriods: number;

    if (planType === 'daily') {
      const calc = calculateDailyLoan(p, rate, periods);
      interestAmount = customInterest !== undefined ? parseFloat(customInterest) : calc.interestAmount;
      periodAmount = calc.dailyAmount;
      totalPeriods = calc.totalDays;
    } else {
      const calc = calculateLoan(p, rate, periods);
      interestAmount = customInterest !== undefined ? parseFloat(customInterest) : calc.interestAmount;
      periodAmount = calc.weeklyAmount;
      totalPeriods = calc.totalWeeks;
    }

    // endD computed from the last payment's due date below, after schedule is generated

    const cfg = schedule_config || {};
    const skipDays: number[] = Array.isArray(cfg.skipDays)
      ? cfg.skipDays.filter((d: number) => typeof d === 'number' && d >= 0 && d <= 6)
      : [];
    const weeklyDayOfWeek: number | undefined =
      typeof cfg.weeklyDayOfWeek === 'number' && cfg.weeklyDayOfWeek >= 0 && cfg.weeklyDayOfWeek <= 6
        ? cfg.weeklyDayOfWeek
        : undefined;

    const schedule = planType === 'daily'
      ? generateDailySchedule('__placeholder__', start_date, totalPeriods, periodAmount, skipDays)
      : generateWeeklySchedule('__placeholder__', start_date, totalPeriods, periodAmount, weeklyDayOfWeek);

    const payments = schedule.map((s) => ({
      periodNumber: s.periodNumber,
      dueDate: s.dueDate,
      expectedAmount: s.expectedAmount,
      paidAmount: 0,
      paidDate: null,
      status: 'pending' as const,
      notes: '',
    }));

    // End date = last scheduled payment date (accounts for skip days / chosen weekday)
    const endDateStr = schedule.length > 0
      ? schedule[schedule.length - 1].dueDate
      : localDateStr(new Date(start_date + 'T00:00:00'));

    const loan = await createLoanAdmin(
      {
        customerId: customer_id,
        customerName: customer.name,
        customerPhone: customer.phone || '',
        planType,
        principal: p,
        interestRate: rate,
        loanTermPeriods: periods,
        totalPeriods,
        interestAmount,
        totalAmount: p + interestAmount,
        periodAmount,
        startDate: start_date,
        endDate: endDateStr,
        notes: notes || '',
        status: 'active',
        interestCollected: interest_collected === true,
        interestCollectedDate: interest_collected === true ? start_date : null,
        scheduleConfig: {
          ...(weeklyDayOfWeek !== undefined ? { weeklyDayOfWeek } : {}),
          ...(skipDays.length > 0 ? { skipDays } : {}),
        },
      },
      payments
    );

    // Send WhatsApp notification (non-blocking)
    if (customer.phone) {
      sendWhatsAppLoanCreated(loan, customer).catch(console.error);
    }

    return NextResponse.json(loan, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Failed to create loan' }, { status: 500 });
  }
}
