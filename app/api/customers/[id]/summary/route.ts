import { NextRequest, NextResponse } from 'next/server';
import { getCustomerAdmin } from '@/lib/db/customers';
import { getLoansAdmin, getPaymentsAdmin } from '@/lib/db/loans';
import { localDateStr } from '@/lib/calculations';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const customer = await getCustomerAdmin(id);
    if (!customer) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const loans = await getLoansAdmin({ customerId: id });

    // Fetch all payments in parallel (one query per loan — small N in practice)
    const loanWithPayments = await Promise.all(
      loans.map(async (loan) => {
        const payments = await getPaymentsAdmin(loan.id);
        return { loan, payments };
      })
    );

    const today = localDateStr(new Date());
    const plusWeek = new Date();
    plusWeek.setDate(plusWeek.getDate() + 6);
    const weekEnd = localDateStr(plusWeek);

    let totalPrincipal = 0, totalInterest = 0, totalExpected = 0, totalPaid = 0;
    let overdueCount = 0, overdueAmount = 0, dueTodayAmount = 0, dueThisWeekAmount = 0;
    let nextDue: { loanId: string; dueDate: string; amount: number; periodNumber: number } | null = null;

    const loansDetailed = loanWithPayments.map(({ loan, payments }) => {
      let loanPaid = 0, loanExpected = 0, loanOverdueAmount = 0, loanOverdueCount = 0;
      let loanDueToday = 0, paidPeriods = 0;

      for (const p of payments) {
        loanExpected += p.expectedAmount;
        loanPaid     += p.paidAmount;
        if (p.paidAmount >= p.expectedAmount) paidPeriods++;
        if (p.dueDate < today && p.paidAmount < p.expectedAmount) {
          loanOverdueCount++;
          loanOverdueAmount += p.expectedAmount - p.paidAmount;
        }
        if (p.dueDate === today && p.paidAmount < p.expectedAmount) {
          loanDueToday += p.expectedAmount - p.paidAmount;
        }
        if (p.dueDate >= today && p.dueDate <= weekEnd && p.paidAmount < p.expectedAmount) {
          dueThisWeekAmount += p.expectedAmount - p.paidAmount;
        }
        if (p.paidAmount < p.expectedAmount && (!nextDue || p.dueDate < nextDue.dueDate)) {
          nextDue = { loanId: loan.id, dueDate: p.dueDate, amount: p.expectedAmount - p.paidAmount, periodNumber: p.periodNumber };
        }
      }

      if (loan.status === 'active') totalPrincipal += loan.principal;
      totalInterest += loan.interestAmount;
      totalExpected += loanExpected;
      totalPaid     += loanPaid;
      overdueCount  += loanOverdueCount;
      overdueAmount += loanOverdueAmount;
      dueTodayAmount += loanDueToday;

      return {
        id:               loan.id,
        principal:        loan.principal,
        planType:         loan.planType,
        periodAmount:     loan.periodAmount,
        totalPeriods:     loan.totalPeriods,
        paidPeriods,
        startDate:        loan.startDate,
        endDate:          loan.endDate,
        status:           loan.status,
        interestAmount:   loan.interestAmount,
        interestCollected: loan.interestCollected,
        totalExpected:    loanExpected,
        totalPaid:        loanPaid,
        outstanding:      Math.max(0, loanExpected - loanPaid),
        overdueCount:     loanOverdueCount,
        overdueAmount:    loanOverdueAmount,
        dueTodayAmount:   loanDueToday,
        progress:         loanExpected > 0 ? Math.min(100, Math.round((loanPaid / loanExpected) * 100)) : 0,
      };
    }).sort((a, b) => {
      if (a.status === b.status) return a.startDate < b.startDate ? 1 : -1;
      return a.status === 'active' ? -1 : 1;
    });

    const dueTodayList = loanWithPayments.flatMap(({ loan, payments }) =>
      payments
        .filter(p => p.dueDate === today && p.paidAmount < p.expectedAmount)
        .map(p => ({
          loanId:        loan.id,
          paymentId:     p.id,
          periodNumber:  p.periodNumber,
          planType:      loan.planType,
          amount:        p.expectedAmount - p.paidAmount,
          expectedAmount: p.expectedAmount,
        }))
    );

    return NextResponse.json({
      customer,
      summary: {
        totalLoans:       loans.length,
        activeLoans:      loansDetailed.filter(l => l.status === 'active').length,
        completedLoans:   loansDetailed.filter(l => l.status === 'completed').length,
        totalPrincipal, totalInterest, totalExpected, totalPaid,
        outstanding:      Math.max(0, totalExpected - totalPaid),
        overdueCount, overdueAmount, dueTodayAmount, dueThisWeekAmount,
        progress:         totalExpected > 0 ? Math.min(100, Math.round((totalPaid / totalExpected) * 100)) : 0,
        nextDue,
      },
      loans: loansDetailed,
      dueTodayList,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Failed to fetch customer summary' }, { status: 500 });
  }
}
