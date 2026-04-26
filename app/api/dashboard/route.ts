import { NextResponse } from 'next/server';
import {
  // RPC-first (single round-trip per query, pure SQL aggregation)
  getDashboardStatsRPC,
  getOverduePaymentsRPC,
  getDueSoonRPC,
  getCashflowRPC,
  getHeatmapRPC,
  getTopBorrowersRPC,
  getMonthlyCollectionsRPC,
  getPlanSplitRPC,
  getWeekCollectionsRPC,
  getRecentActivityRPC,
  // Legacy fallbacks (used when SQL functions not yet applied)
  getStatsAdmin,
  getAllActiveLoansWithPayments,
} from '@/lib/db/loans';
import { localDateStr } from '@/lib/calculations';

export async function GET() {
  try {
    const today = localDateStr(new Date());
    const weekEndD = new Date();
    weekEndD.setDate(weekEndD.getDate() + 6);
    const weekEnd = localDateStr(weekEndD);

    // ── RPC-first: all 10 queries fire in parallel, each is a single SQL call ──
    const [
      statsRPC,
      overdueRPC,
      dueSoonRPC,
      cashflowRPC,
      heatmapRPC,
      topBorrowersRPC,
      monthlyRPC,
      planSplitRPC,
      weekRPC,
      recentRPC,
    ] = await Promise.all([
      getDashboardStatsRPC(),
      getOverduePaymentsRPC(20),
      getDueSoonRPC(today, weekEnd, 20),
      getCashflowRPC(14),
      getHeatmapRPC(90),
      getTopBorrowersRPC(5),
      getMonthlyCollectionsRPC(6),
      getPlanSplitRPC(),
      getWeekCollectionsRPC(today, weekEnd),
      getRecentActivityRPC(8),
    ]);

    // ── If all RPC functions are available, return immediately ──────────────────
    if (
      statsRPC !== null &&
      overdueRPC !== null &&
      dueSoonRPC !== null &&
      cashflowRPC !== null &&
      heatmapRPC !== null &&
      topBorrowersRPC !== null &&
      monthlyRPC !== null &&
      planSplitRPC !== null &&
      weekRPC !== null &&
      recentRPC !== null
    ) {
      return NextResponse.json({
        stats: {
          active_loans:       statsRPC.active_loans,
          completed_loans:    statsRPC.completed_loans,
          total_customers:    statsRPC.total_customers,
          total_principal:    statsRPC.capital_deployed,
          interest_pending:   statsRPC.interest_pending,
          interest_earned:    statsRPC.interest_earned,
          total_collected:    statsRPC.total_collected_ever,
          total_expected_interest: statsRPC.interest_pending,
          overdue_count:      statsRPC.overdue_count,
          today_due:          statsRPC.today_due_amount,
          today_collected:    statsRPC.today_collected,
        },
        overduePayments: overdueRPC.map((p: (typeof overdueRPC)[0]) => ({
          id: p.id, loanId: p.loanId, dueDate: p.dueDate,
          expectedAmount: p.expectedAmount, paidAmount: p.paidAmount,
          customer_name: p.customerName, customer_phone: p.customerPhone,
          principal: p.principal, planType: p.planType,
        })),
        dueSoon: dueSoonRPC.map((p: (typeof dueSoonRPC)[0]) => ({
          id: p.id, loanId: p.loanId, dueDate: p.dueDate,
          expectedAmount: p.expectedAmount, paidAmount: p.paidAmount,
          customer_name: p.customerName, customer_phone: p.customerPhone,
          principal: p.principal, planType: p.planType,
        })),
        monthlyData: monthlyRPC.map((m: (typeof monthlyRPC)[0]) => ({ month: m.month, collected: m.collected, count: m.count })),
        thisWeek: { expected: weekRPC.expected, collected: weekRPC.collected },
        recentActivity: recentRPC.map((r: (typeof recentRPC)[0]) => ({
          id: r.id, loanId: r.loanId, paidDate: r.paidDate,
          paidAmount: r.paidAmount, expectedAmount: r.expectedAmount,
          customer_name: r.customerName, principal: r.principal,
        })),
        heatmap: heatmapRPC.map((h: (typeof heatmapRPC)[0]) => ({ date: h.date, amount: h.amount })),
        cashflow: cashflowRPC,
        planSplit: planSplitRPC,
        topBorrowers: topBorrowersRPC,
      });
    }

    // ── Fallback: SQL functions not yet applied — use JS aggregation ────────────
    // (same logic as before; runs until the user applies advanced-functions.sql)
    console.warn('[dashboard] RPC functions not available — using JS fallback. Run: node scripts/apply-advanced.mjs');

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const sixMonthsAgoStr = localDateStr(sixMonthsAgo);

    const [stats, loansWithPayments] = await Promise.all([
      getStatsAdmin(),
      getAllActiveLoansWithPayments(),
    ]);

    const overduePayments: object[] = [];
    const dueSoon: object[] = [];
    const recentPayments: object[] = [];
    const monthlyMap: Record<string, { collected: number; count: number }> = {};
    const heatmapDays = 90;
    const heatmapStart = new Date();
    heatmapStart.setDate(heatmapStart.getDate() - (heatmapDays - 1));
    const heatmapStartStr = localDateStr(heatmapStart);
    const dailyCollected: Record<string, number> = {};
    const cashflowDays = 14;
    const cashflowStart = new Date();
    cashflowStart.setDate(cashflowStart.getDate() - (cashflowDays - 1));
    const cashflowStartStr = localDateStr(cashflowStart);
    const cashflowMap: Record<string, { expected: number; collected: number }> = {};
    let dailyLoanCount = 0, weeklyLoanCount = 0, dailyPrincipal = 0, weeklyPrincipal = 0;
    const borrowerOutstanding: Record<string, { name: string; outstanding: number; loans: number; phone: string; customerId: string }> = {};
    let weekExpected = 0, weekCollected = 0, totalRecovered = 0;

    for (const { loan, payments } of loansWithPayments) {
      if (loan.planType === 'daily') { dailyLoanCount++; dailyPrincipal += loan.principal; }
      else { weeklyLoanCount++; weeklyPrincipal += loan.principal; }

      let loanExpectedTotal = 0, loanPaidTotal = 0;
      for (const pp of payments) { loanExpectedTotal += pp.expectedAmount || 0; loanPaidTotal += pp.paidAmount || 0; }
      const outstanding = Math.max(0, loanExpectedTotal - loanPaidTotal);
      if (!borrowerOutstanding[loan.customerId]) {
        borrowerOutstanding[loan.customerId] = { customerId: loan.customerId, name: loan.customerName, phone: loan.customerPhone, outstanding: 0, loans: 0 };
      }
      borrowerOutstanding[loan.customerId].outstanding += outstanding;
      borrowerOutstanding[loan.customerId].loans += 1;

      for (const p of payments) {
        totalRecovered += p.paidAmount || 0;
        if (p.paidDate && p.paidDate >= heatmapStartStr && p.paidAmount > 0) dailyCollected[p.paidDate] = (dailyCollected[p.paidDate] || 0) + p.paidAmount;
        if (p.dueDate >= cashflowStartStr && p.dueDate <= today) {
          if (!cashflowMap[p.dueDate]) cashflowMap[p.dueDate] = { expected: 0, collected: 0 };
          cashflowMap[p.dueDate].expected += p.expectedAmount || 0;
        }
        if (p.paidDate && p.paidDate >= cashflowStartStr && p.paidDate <= today && p.paidAmount > 0) {
          if (!cashflowMap[p.paidDate]) cashflowMap[p.paidDate] = { expected: 0, collected: 0 };
          cashflowMap[p.paidDate].collected += p.paidAmount;
        }
        if (p.dueDate < today && p.paidAmount < p.expectedAmount && overduePayments.length < 20) {
          overduePayments.push({ ...p, id: p.id, loanId: loan.id, customer_name: loan.customerName, customer_phone: loan.customerPhone, principal: loan.principal, planType: loan.planType });
        }
        if (p.dueDate >= today && p.dueDate <= weekEnd && p.paidAmount < p.expectedAmount && dueSoon.length < 20) {
          dueSoon.push({ ...p, id: p.id, loanId: loan.id, customer_name: loan.customerName, customer_phone: loan.customerPhone, principal: loan.principal, planType: loan.planType });
        }
        if (p.dueDate >= today && p.dueDate <= weekEnd) { weekExpected += p.expectedAmount || 0; weekCollected += p.paidAmount || 0; }
        if (p.paidDate && p.paidDate >= sixMonthsAgoStr && p.paidAmount > 0) {
          const month = (p.paidDate as string).slice(0, 7);
          if (!monthlyMap[month]) monthlyMap[month] = { collected: 0, count: 0 };
          monthlyMap[month].collected += p.paidAmount;
          monthlyMap[month].count += 1;
        }
        if (p.paidDate) recentPayments.push({ ...p, id: p.id, loanId: loan.id, customer_name: loan.customerName, principal: loan.principal });
      }
    }

    overduePayments.sort((a: any, b: any) => a.dueDate < b.dueDate ? -1 : 1);
    dueSoon.sort((a: any, b: any) => a.dueDate < b.dueDate ? -1 : 1);

    const monthlyData = Object.entries(monthlyMap).map(([month, v]) => ({ month, ...v })).sort((a, b) => a.month.localeCompare(b.month));
    const recentActivity = recentPayments.sort((a: any, b: any) => b.paidDate > a.paidDate ? 1 : -1).slice(0, 8);

    const heatmap: { date: string; amount: number }[] = [];
    for (let i = 0; i < heatmapDays; i++) {
      const d = new Date(heatmapStart); d.setDate(d.getDate() + i);
      const ds = localDateStr(d);
      heatmap.push({ date: ds, amount: Math.round(dailyCollected[ds] || 0) });
    }
    const cashflow: { date: string; expected: number; collected: number }[] = [];
    for (let i = 0; i < cashflowDays; i++) {
      const d = new Date(cashflowStart); d.setDate(d.getDate() + i);
      const ds = localDateStr(d);
      const v = cashflowMap[ds] || { expected: 0, collected: 0 };
      cashflow.push({ date: ds, expected: Math.round(v.expected), collected: Math.round(v.collected) });
    }
    const topBorrowers = Object.values(borrowerOutstanding).filter(b => b.outstanding > 0).sort((a, b) => b.outstanding - a.outstanding).slice(0, 5);

    return NextResponse.json({
      stats: { ...stats, total_collected: totalRecovered, total_expected_interest: stats.interest_pending },
      overduePayments, dueSoon, monthlyData,
      thisWeek: { expected: weekExpected, collected: weekCollected },
      recentActivity, heatmap, cashflow,
      planSplit: { daily: { count: dailyLoanCount, principal: dailyPrincipal }, weekly: { count: weeklyLoanCount, principal: weeklyPrincipal } },
      topBorrowers,
    });

  } catch (e) {
    console.error('[dashboard]', e);
    return NextResponse.json({ error: 'Failed to fetch dashboard data' }, { status: 500 });
  }
}
