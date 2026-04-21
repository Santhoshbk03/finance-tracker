import { NextRequest, NextResponse } from 'next/server';
import { getAllActiveLoansWithPayments } from '@/lib/firestore/loans';
import { localDateStr } from '@/lib/calculations';

export async function GET(req: NextRequest) {
  try {
    const date = req.nextUrl.searchParams.get('date') || localDateStr(new Date());
    const data = await getAllActiveLoansWithPayments();

    // Group by customer
    const byCustomer: Record<string, {
      customerId: string;
      customerName: string;
      customerPhone: string;
      loans: {
        loanId: string;
        paymentId: string;
        planType: 'weekly' | 'daily';
        periodNumber: number;
        principal: number;
        expectedAmount: number;
        paidAmount: number;
        amountDue: number;
        status: string;
      }[];
      totalDue: number;
      totalPaidToday: number;
      count: number;
    }> = {};

    let grandTotal = 0;
    let grandPaid = 0;
    let totalRows = 0;

    for (const { loan, payments } of data) {
      for (const p of payments) {
        if (p.dueDate !== date) continue;
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
          };
        }
        const amountDue = Math.max(0, (p.expectedAmount || 0) - (p.paidAmount || 0));
        const paidOnTime = (p.paidDate === date) ? (p.paidAmount || 0) : 0;
        byCustomer[cid].loans.push({
          loanId: loan.id,
          paymentId: p.id,
          planType: loan.planType,
          periodNumber: p.periodNumber,
          principal: loan.principal,
          expectedAmount: p.expectedAmount || 0,
          paidAmount: p.paidAmount || 0,
          amountDue,
          status: p.status,
        });
        byCustomer[cid].totalDue += amountDue;
        byCustomer[cid].totalPaidToday += paidOnTime;
        byCustomer[cid].count += 1;
        grandTotal += amountDue;
        grandPaid += paidOnTime;
        totalRows += 1;
      }
    }

    const rows = Object.values(byCustomer).sort((a, b) => b.totalDue - a.totalDue);

    return NextResponse.json({
      date,
      rows,
      summary: {
        totalBorrowers: rows.length,
        totalPayments: totalRows,
        totalDue: grandTotal,
        totalPaid: grandPaid,
        totalOutstanding: Math.max(0, grandTotal),
      },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Failed to fetch today list' }, { status: 500 });
  }
}
