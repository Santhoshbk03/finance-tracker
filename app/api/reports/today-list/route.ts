import { NextRequest, NextResponse } from 'next/server';
import { getTodayListData, getTodayCollectionListRPC } from '@/lib/db/loans';
import { localDateStr } from '@/lib/calculations';

type LoanRow = {
  loanId: string; paymentId: string; planType: 'weekly' | 'daily';
  periodNumber: number; principal: number; expectedAmount: number;
  paidAmount: number; paidDate: string | null; amountDue: number;
  status: string; dueDate: string; bucket: 'today' | 'overdue' | 'paid-today'; notes: string;
  // Interest fields (loan-level — same for every payment of the same loan)
  interestAmount: number;
  interestCollected: boolean;
  interestCollectedDate: string | null;
};

type InterestLoan = {
  loanId: string;
  interestAmount: number;
  interestCollected: boolean;
  interestCollectedDate: string | null;
  planType: 'weekly' | 'daily';
  principal: number;
};

export async function GET(req: NextRequest) {
  try {
    const date = req.nextUrl.searchParams.get('date') || localDateStr(new Date());
    const includeOverdue = req.nextUrl.searchParams.get('overdue') !== 'false';

    // Try RPC first (single query), fall back to two-query approach
    const rpcData = await getTodayCollectionListRPC(date).catch(() => null);
    const data = rpcData ?? await getTodayListData(date);

    const byCustomer: Record<string, {
      customerId: string; customerName: string; customerPhone: string;
      loans: LoanRow[]; totalDue: number; totalPaidToday: number;
      count: number; overdueCount: number;
      interestLoans: InterestLoan[];  // per-loan interest status
      totalPaidPeriods: number;       // how many payments fully paid (for progress)
      totalPeriods: number;           // total payments in loan schedule (for progress)
    }> = {};

    let grandTotalDue = 0, grandTotalPaid = 0, grandOverdue = 0;
    let totalRows = 0, todayRows = 0, overdueRows = 0;

    for (const { loan, payments } of data) {
      const cid = loan.customerId;
      if (!byCustomer[cid]) {
        byCustomer[cid] = {
          customerId: cid, customerName: loan.customerName,
          customerPhone: loan.customerPhone, loans: [],
          totalDue: 0, totalPaidToday: 0, count: 0, overdueCount: 0,
          interestLoans: [], totalPaidPeriods: 0, totalPeriods: 0,
        };
      }

      // Track interest status per unique loan (only add once per loan)
      const alreadyTracked = byCustomer[cid].interestLoans.some(il => il.loanId === loan.id);
      if (!alreadyTracked) {
        byCustomer[cid].interestLoans.push({
          loanId: loan.id,
          interestAmount: loan.interestAmount ?? 0,
          interestCollected: loan.interestCollected ?? false,
          interestCollectedDate: loan.interestCollectedDate ?? null,
          planType: loan.planType,
          principal: loan.principal,
        });
      }

      for (const p of payments) {
        const isToday   = p.dueDate === date;
        const isOverdue = p.dueDate < date && (p.paidAmount || 0) < (p.expectedAmount || 0);
        const isPaidToday = p.paidDate === date && (p.paidAmount || 0) > 0;

        if (!isToday && !isPaidToday && !(includeOverdue && isOverdue)) continue;

        const expectedAmount = p.expectedAmount || 0;
        const paidAmount = p.paidAmount || 0;
        const amountDue = Math.max(0, expectedAmount - paidAmount);
        const bucket: LoanRow['bucket'] = isToday ? 'today' : isOverdue ? 'overdue' : 'paid-today';

        byCustomer[cid].loans.push({
          loanId: loan.id, paymentId: p.id, planType: loan.planType,
          periodNumber: p.periodNumber, principal: loan.principal,
          expectedAmount, paidAmount, paidDate: p.paidDate || null,
          amountDue, status: p.status, dueDate: p.dueDate, bucket, notes: p.notes || '',
          interestAmount: loan.interestAmount ?? 0,
          interestCollected: loan.interestCollected ?? false,
          interestCollectedDate: loan.interestCollectedDate ?? null,
        });

        if (bucket !== 'paid-today') { byCustomer[cid].totalDue += amountDue; grandTotalDue += amountDue; }
        byCustomer[cid].totalPaidToday += isPaidToday ? paidAmount : 0;
        grandTotalPaid += isPaidToday ? paidAmount : 0;
        byCustomer[cid].count += 1;
        if (isOverdue) { byCustomer[cid].overdueCount++; grandOverdue++; overdueRows++; }
        if (isToday) todayRows++;
        totalRows++;
      }
    }

    // Add per-loan period progress (paid/total) — not filtered by today
    // We piggyback on `data` which already has all payments for active loans.
    for (const { loan, payments } of data) {
      const cid = loan.customerId;
      if (!byCustomer[cid]) continue;
      byCustomer[cid].totalPeriods     += payments.length;
      byCustomer[cid].totalPaidPeriods += payments.filter(p => (p.paidAmount ?? 0) >= (p.expectedAmount ?? 1) && (p.expectedAmount ?? 0) > 0).length;
    }

    const rows = Object.values(byCustomer)
      .map(r => ({
        ...r,
        loans: r.loans.sort((a, b) => {
          const order = { overdue: 0, today: 1, 'paid-today': 2 };
          if (order[a.bucket] !== order[b.bucket]) return order[a.bucket] - order[b.bucket];
          return a.dueDate.localeCompare(b.dueDate);
        }),
        // Only surface interest loans that have actual interest amount
        interestLoans: r.interestLoans.filter(il => il.interestAmount > 0),
      }))
      .filter(r => r.loans.length > 0)
      .sort((a, b) => {
        if ((b.overdueCount > 0 ? 1 : 0) !== (a.overdueCount > 0 ? 1 : 0))
          return (b.overdueCount > 0 ? 1 : 0) - (a.overdueCount > 0 ? 1 : 0);
        if (b.totalDue !== a.totalDue) return b.totalDue - a.totalDue;
        return a.customerName.localeCompare(b.customerName);
      });

    return NextResponse.json({
      date, rows,
      summary: {
        totalBorrowers: rows.length, totalPayments: totalRows,
        todayPayments: todayRows, overduePayments: overdueRows,
        totalDue: grandTotalDue, totalPaid: grandTotalPaid,
        totalOverdueBorrowers: rows.filter(r => r.overdueCount > 0).length,
        totalOutstanding: Math.max(0, grandTotalDue),
      },
    });
  } catch (e: any) {
    console.error('[today-list] error:', e);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Failed to fetch today list: ${msg}` }, { status: 500 });
  }
}
