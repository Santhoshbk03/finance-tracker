import { NextRequest, NextResponse } from 'next/server';
import { getCustomerAdmin } from '@/lib/firestore/customers';
import { adminDb } from '@/lib/firebase-admin';
import type { Loan, Payment } from '@/lib/firestore/loans';
import { localDateStr } from '@/lib/calculations';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const customer = await getCustomerAdmin(id);
    if (!customer) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const loansSnap = await adminDb.collection('loans').where('customerId', '==', id).get();
    const loans: Loan[] = loansSnap.docs.map(d => ({ ...(d.data() as Loan), id: d.id }));

    // Fetch all payments in parallel
    const loanWithPayments = await Promise.all(loans.map(async (loan) => {
      const pSnap = await adminDb.collection('loans').doc(loan.id).collection('payments').get();
      const payments: Payment[] = pSnap.docs.map(d => ({ ...(d.data() as Payment), id: d.id, loanId: loan.id }));
      return { loan, payments };
    }));

    const today = localDateStr(new Date());
    const plusWeek = new Date();
    plusWeek.setDate(plusWeek.getDate() + 6);
    const weekEnd = localDateStr(plusWeek);

    let totalPrincipal = 0;
    let totalInterest = 0;
    let totalExpected = 0;
    let totalPaid = 0;
    let overdueCount = 0;
    let overdueAmount = 0;
    let dueTodayAmount = 0;
    let dueThisWeekAmount = 0;
    let nextDue: { loanId: string; dueDate: string; amount: number; periodNumber: number } | null = null;

    const loansDetailed = loanWithPayments.map(({ loan, payments }) => {
      let loanPaid = 0;
      let loanExpected = 0;
      let loanOverdueAmount = 0;
      let loanOverdueCount = 0;
      let loanDueToday = 0;
      let paidPeriods = 0;

      for (const p of payments) {
        loanExpected += p.expectedAmount || 0;
        loanPaid += p.paidAmount || 0;
        if ((p.paidAmount || 0) >= (p.expectedAmount || 0)) paidPeriods++;

        if (p.dueDate < today && p.paidAmount < p.expectedAmount) {
          loanOverdueCount++;
          loanOverdueAmount += (p.expectedAmount - p.paidAmount);
        }
        if (p.dueDate === today && p.paidAmount < p.expectedAmount) {
          loanDueToday += (p.expectedAmount - p.paidAmount);
        }
        if (p.dueDate >= today && p.dueDate <= weekEnd && p.paidAmount < p.expectedAmount) {
          dueThisWeekAmount += (p.expectedAmount - p.paidAmount);
        }
        if (p.paidAmount < p.expectedAmount && (!nextDue || p.dueDate < nextDue.dueDate)) {
          nextDue = { loanId: loan.id, dueDate: p.dueDate, amount: p.expectedAmount - p.paidAmount, periodNumber: p.periodNumber };
        }
      }

      totalPrincipal += loan.status === 'active' ? loan.principal : 0;
      totalInterest += loan.interestAmount || 0;
      totalExpected += loanExpected;
      totalPaid += loanPaid;
      overdueCount += loanOverdueCount;
      overdueAmount += loanOverdueAmount;
      dueTodayAmount += loanDueToday;

      return {
        id: loan.id,
        principal: loan.principal,
        planType: loan.planType,
        periodAmount: loan.periodAmount,
        totalPeriods: loan.totalPeriods,
        paidPeriods,
        startDate: loan.startDate,
        endDate: loan.endDate,
        status: loan.status,
        interestAmount: loan.interestAmount,
        interestCollected: loan.interestCollected,
        totalExpected: loanExpected,
        totalPaid: loanPaid,
        outstanding: Math.max(0, loanExpected - loanPaid),
        overdueCount: loanOverdueCount,
        overdueAmount: loanOverdueAmount,
        dueTodayAmount: loanDueToday,
        progress: loanExpected > 0 ? Math.min(100, Math.round((loanPaid / loanExpected) * 100)) : 0,
      };
    }).sort((a, b) => {
      if (a.status === b.status) return a.startDate < b.startDate ? 1 : -1;
      return a.status === 'active' ? -1 : 1;
    });

    // Today's payments for this customer (listed)
    const dueTodayList = loanWithPayments.flatMap(({ loan, payments }) =>
      payments.filter(p => p.dueDate === today && p.paidAmount < p.expectedAmount)
        .map(p => ({
          loanId: loan.id,
          paymentId: p.id,
          periodNumber: p.periodNumber,
          planType: loan.planType,
          amount: p.expectedAmount - p.paidAmount,
          expectedAmount: p.expectedAmount,
        }))
    );

    const activeLoans = loansDetailed.filter(l => l.status === 'active');
    const completedLoans = loansDetailed.filter(l => l.status === 'completed');

    return NextResponse.json({
      customer,
      summary: {
        totalLoans: loans.length,
        activeLoans: activeLoans.length,
        completedLoans: completedLoans.length,
        totalPrincipal,
        totalInterest,
        totalExpected,
        totalPaid,
        outstanding: Math.max(0, totalExpected - totalPaid),
        overdueCount,
        overdueAmount,
        dueTodayAmount,
        dueThisWeekAmount,
        progress: totalExpected > 0 ? Math.min(100, Math.round((totalPaid / totalExpected) * 100)) : 0,
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
