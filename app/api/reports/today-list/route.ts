import { NextRequest, NextResponse } from 'next/server';
import { getAllActiveLoansWithPayments } from '@/lib/firestore/loans';
import { localDateStr } from '@/lib/calculations';

type LoanRow = {
  loanId: string;
  paymentId: string;
  planType: 'weekly' | 'daily';
  periodNumber: number;
  principal: number;
  expectedAmount: number;
  paidAmount: number;
  paidDate: string | null;
  amountDue: number;
  status: string;
  dueDate: string;
  bucket: 'today' | 'overdue' | 'paid-today';
  notes: string;
};

export async function GET(req: NextRequest) {
  try {
    const date = req.nextUrl.searchParams.get('date') || localDateStr(new Date());
    const includeOverdue = req.nextUrl.searchParams.get('overdue') !== 'false'; // default on
    const data = await getAllActiveLoansWithPayments();

    // Group by customer
    const byCustomer: Record<string, {
      customerId: string;
      customerName: string;
      customerPhone: string;
      loans: LoanRow[];
      totalDue: number;
      totalPaidToday: number;
      count: number;
      overdueCount: number;
    }> = {};

    let grandTotalDue = 0;
    let grandTotalPaid = 0;
    let grandOverdue = 0;
    let totalRows = 0;
    let todayRows = 0;
    let overdueRows = 0;

    for (const { loan, payments } of data) {
      for (const p of payments) {
        const isToday = p.dueDate === date;
        const isOverdue = p.dueDate < date && (p.paidAmount || 0) < (p.expectedAmount || 0);
        const isPaidToday = p.paidDate === date && (p.paidAmount || 0) > 0;

        if (!isToday && !isPaidToday && !(includeOverdue && isOverdue)) continue;

        const cid = loan.customerId;
        if (!byCustomer[cid]) {
          byCustomer[cid] = {
            customerId: cid,
            customerName: loan.customerName,
            customerPhone: loan.customerPhone,
            loans: [],
            totalDue: 0,
            totalPaidToday: 0,
            count: 0,
            overdueCount: 0,
          };
        }
        const expectedAmount = p.expectedAmount || 0;
        const paidAmount = p.paidAmount || 0;
        const amountDue = Math.max(0, expectedAmount - paidAmount);
        const paidOnTime = isPaidToday ? paidAmount : 0;

        const bucket: LoanRow['bucket'] = isToday
          ? 'today'
          : isOverdue
          ? 'overdue'
          : 'paid-today';

        byCustomer[cid].loans.push({
          loanId: loan.id,
          paymentId: p.id,
          planType: loan.planType,
          periodNumber: p.periodNumber,
          principal: loan.principal,
          expectedAmount,
          paidAmount,
          paidDate: p.paidDate || null,
          amountDue,
          status: p.status,
          dueDate: p.dueDate,
          bucket,
          notes: p.notes || '',
        });

        if (bucket !== 'paid-today') {
          byCustomer[cid].totalDue += amountDue;
          grandTotalDue += amountDue;
        }
        byCustomer[cid].totalPaidToday += paidOnTime;
        byCustomer[cid].count += 1;
        if (isOverdue) {
          byCustomer[cid].overdueCount += 1;
          grandOverdue += 1;
          overdueRows += 1;
        }
        if (isToday) todayRows += 1;
        grandTotalPaid += paidOnTime;
        totalRows += 1;
      }
    }

    const rows = Object.values(byCustomer)
      .map(r => ({
        ...r,
        // Sort loans: overdue first, then today, then paid-today; within each oldest dueDate first
        loans: r.loans.sort((a, b) => {
          const order = { overdue: 0, today: 1, 'paid-today': 2 };
          if (order[a.bucket] !== order[b.bucket]) return order[a.bucket] - order[b.bucket];
          return a.dueDate.localeCompare(b.dueDate);
        }),
      }))
      .sort((a, b) => {
        // Borrowers with overdue first, then by amount due desc, then name
        if ((b.overdueCount > 0 ? 1 : 0) !== (a.overdueCount > 0 ? 1 : 0)) {
          return (b.overdueCount > 0 ? 1 : 0) - (a.overdueCount > 0 ? 1 : 0);
        }
        if (b.totalDue !== a.totalDue) return b.totalDue - a.totalDue;
        return a.customerName.localeCompare(b.customerName);
      });

    return NextResponse.json({
      date,
      rows,
      summary: {
        totalBorrowers: rows.length,
        totalPayments: totalRows,
        todayPayments: todayRows,
        overduePayments: overdueRows,
        totalDue: grandTotalDue,
        totalPaid: grandTotalPaid,
        totalOverdueBorrowers: grandOverdue > 0 ? rows.filter(r => r.overdueCount > 0).length : 0,
        totalOutstanding: Math.max(0, grandTotalDue),
      },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Failed to fetch today list' }, { status: 500 });
  }
}
