/**
 * PDF report generation using @react-pdf/renderer.
 * Three reports:
 *   1. Today's Collection Sheet — who must pay today (for the collector)
 *   2. Daily Report — end-of-day summary
 *   3. Weekly Report — last 7 days summary
 */
import React from 'react';
import {
  Document, Page, Text, View, StyleSheet, renderToBuffer,
} from '@react-pdf/renderer';
import type { Loan, Payment } from '@/lib/firestore/loans';

// ─── Types ───────────────────────────────────────────────────────────────
export interface LoanWithPayments {
  loan: Loan;
  payments: Payment[];
}

interface TodayRow {
  customerName: string;
  customerPhone: string;
  planType: 'daily' | 'weekly';
  periodNumber: number;
  expectedAmount: number;
  outstanding: number;
  loanId: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────
const inr = (n: number) => '₹' + (n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
const fmtDate = (d: string | Date) =>
  new Date(typeof d === 'string' ? d + 'T00:00:00' : d).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
const fmtDateShort = (d: string | Date) =>
  new Date(typeof d === 'string' ? d + 'T00:00:00' : d).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short',
  });

// ─── Styles (shared) ─────────────────────────────────────────────────────
const styles = StyleSheet.create({
  page: {
    padding: 32,
    fontSize: 10,
    fontFamily: 'Helvetica',
    color: '#111827',
    backgroundColor: '#ffffff',
  },
  header: {
    borderBottom: '2 solid #6d28d9',
    paddingBottom: 12,
    marginBottom: 16,
  },
  brand: { fontSize: 18, fontWeight: 700, color: '#6d28d9' },
  subtitle: { fontSize: 11, color: '#6b7280', marginTop: 4 },
  dateBadge: {
    position: 'absolute',
    right: 0, top: 0,
    backgroundColor: '#f5f3ff',
    padding: '6 10',
    borderRadius: 4,
    fontSize: 10,
    color: '#6d28d9',
    fontWeight: 700,
  },

  summaryRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  summaryBox: {
    flex: 1,
    padding: 10,
    backgroundColor: '#f9fafb',
    borderRadius: 6,
    border: '1 solid #e5e7eb',
  },
  summaryLabel: { fontSize: 8, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5 },
  summaryValue: { fontSize: 14, fontWeight: 700, marginTop: 3, color: '#111827' },

  sectionTitle: {
    fontSize: 12,
    fontWeight: 700,
    color: '#111827',
    marginBottom: 8,
    marginTop: 8,
  },

  table: { border: '1 solid #e5e7eb', borderRadius: 4 },
  thead: {
    flexDirection: 'row',
    backgroundColor: '#f3f4f6',
    padding: '6 8',
    borderBottom: '1 solid #e5e7eb',
  },
  th: { fontWeight: 700, fontSize: 9, color: '#374151', textTransform: 'uppercase' },
  tr: {
    flexDirection: 'row',
    padding: '7 8',
    borderBottom: '1 solid #f3f4f6',
  },
  trZebra: { backgroundColor: '#fafafa' },
  td: { fontSize: 9.5, color: '#1f2937' },
  trLast: { borderBottom: 0 },

  bold: { fontWeight: 700 },
  red: { color: '#dc2626', fontWeight: 700 },
  green: { color: '#059669', fontWeight: 700 },
  amber: { color: '#d97706', fontWeight: 700 },

  footer: {
    position: 'absolute',
    bottom: 20, left: 32, right: 32,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTop: '1 solid #e5e7eb',
    paddingTop: 8,
    fontSize: 8,
    color: '#9ca3af',
  },

  signatureBox: {
    marginTop: 28,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sigLine: {
    width: 180,
    borderTop: '1 solid #9ca3af',
    paddingTop: 4,
    fontSize: 9,
    color: '#6b7280',
  },
});

// ─── Header component ─────────────────────────────────────────────────────
function Header({ title, subtitle, dateLabel }: { title: string; subtitle: string; dateLabel: string }) {
  return (
    <View style={styles.header}>
      <Text style={styles.brand}>FinanceTrack</Text>
      <Text style={styles.subtitle}>{title} — {subtitle}</Text>
      <Text style={styles.dateBadge}>{dateLabel}</Text>
    </View>
  );
}

function Footer({ generatedAt }: { generatedAt: Date }) {
  return (
    <View style={styles.footer} fixed>
      <Text>Generated {generatedAt.toLocaleString('en-IN')}</Text>
      <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// REPORT 1 — Today's Collection Sheet
// ═══════════════════════════════════════════════════════════════════════════
export function TodaysCollectionSheet({ rows, today }: { rows: TodayRow[]; today: Date }) {
  const totalExpected = rows.reduce((s, r) => s + r.expectedAmount, 0);
  const totalOutstanding = rows.reduce((s, r) => s + r.outstanding, 0);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Header
          title="Today's Collection Sheet"
          subtitle="Customers due for payment today"
          dateLabel={today.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        />

        <View style={styles.summaryRow}>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>Total Customers</Text>
            <Text style={styles.summaryValue}>{rows.length}</Text>
          </View>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>Expected Today</Text>
            <Text style={styles.summaryValue}>{inr(totalExpected)}</Text>
          </View>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>Total Outstanding</Text>
            <Text style={styles.summaryValue}>{inr(totalOutstanding)}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Collection List</Text>

        <View style={styles.table}>
          <View style={styles.thead} fixed>
            <Text style={[styles.th, { width: '6%' }]}>#</Text>
            <Text style={[styles.th, { width: '28%' }]}>Borrower</Text>
            <Text style={[styles.th, { width: '18%' }]}>Phone</Text>
            <Text style={[styles.th, { width: '10%' }]}>Plan</Text>
            <Text style={[styles.th, { width: '8%' }]}>Period</Text>
            <Text style={[styles.th, { width: '14%', textAlign: 'right' }]}>Amount</Text>
            <Text style={[styles.th, { width: '16%' }]}>Collected ✓</Text>
          </View>

          {rows.length === 0 ? (
            <View style={styles.tr}>
              <Text style={{ fontSize: 10, color: '#9ca3af', textAlign: 'center', width: '100%', padding: 20 }}>
                No collections scheduled for today
              </Text>
            </View>
          ) : (
            rows.map((r, i) => (
              <View key={r.loanId + '-' + r.periodNumber} style={[styles.tr, i % 2 === 1 ? styles.trZebra : {}]} wrap={false}>
                <Text style={[styles.td, { width: '6%' }]}>{i + 1}</Text>
                <Text style={[styles.td, { width: '28%', fontWeight: 700 }]}>{r.customerName}</Text>
                <Text style={[styles.td, { width: '18%' }]}>{r.customerPhone || '—'}</Text>
                <Text style={[styles.td, { width: '10%' }]}>{r.planType === 'daily' ? 'Daily' : 'Weekly'}</Text>
                <Text style={[styles.td, { width: '8%' }]}>
                  {r.planType === 'daily' ? `D${r.periodNumber}` : `W${r.periodNumber}`}
                </Text>
                <Text style={[styles.td, { width: '14%', textAlign: 'right', fontWeight: 700 }]}>
                  {inr(r.expectedAmount)}
                </Text>
                <Text style={[styles.td, { width: '16%', color: '#9ca3af' }]}>☐ _________</Text>
              </View>
            ))
          )}
        </View>

        <View style={styles.signatureBox}>
          <View style={styles.sigLine}><Text>Collector signature</Text></View>
          <View style={styles.sigLine}><Text>Date & time</Text></View>
        </View>

        <Footer generatedAt={today} />
      </Page>
    </Document>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// REPORT 2 — Daily Report (end of day summary)
// ═══════════════════════════════════════════════════════════════════════════
export interface DailyReportData {
  date: Date;
  expectedToday: { count: number; amount: number };
  collectedToday: { count: number; amount: number; details: Array<{ customerName: string; amount: number; periodLabel: string; time: string }> };
  pendingToday: Array<{ customerName: string; customerPhone: string; amount: number; periodLabel: string }>;
  overdue: Array<{ customerName: string; customerPhone: string; amount: number; daysLate: number; periodLabel: string }>;
  stats: { totalActive: number; totalOutstanding: number; totalCapitalDeployed: number };
}

export function DailyReport({ data }: { data: DailyReportData }) {
  const rate = data.expectedToday.amount > 0
    ? Math.round((data.collectedToday.amount / data.expectedToday.amount) * 100)
    : 0;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Header
          title="Daily Collection Report"
          subtitle="End-of-day summary"
          dateLabel={data.date.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        />

        <View style={styles.summaryRow}>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>Collected</Text>
            <Text style={[styles.summaryValue, styles.green]}>{inr(data.collectedToday.amount)}</Text>
            <Text style={{ fontSize: 8, color: '#6b7280', marginTop: 2 }}>{data.collectedToday.count} payments</Text>
          </View>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>Expected</Text>
            <Text style={styles.summaryValue}>{inr(data.expectedToday.amount)}</Text>
            <Text style={{ fontSize: 8, color: '#6b7280', marginTop: 2 }}>{data.expectedToday.count} due</Text>
          </View>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>Collection Rate</Text>
            <Text style={[styles.summaryValue, rate >= 80 ? styles.green : rate >= 50 ? styles.amber : styles.red]}>
              {rate}%
            </Text>
          </View>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>Overdue</Text>
            <Text style={[styles.summaryValue, data.overdue.length > 0 ? styles.red : {}]}>
              {data.overdue.length}
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Collected Today ({data.collectedToday.count})</Text>
        <View style={styles.table}>
          <View style={styles.thead}>
            <Text style={[styles.th, { width: '8%' }]}>#</Text>
            <Text style={[styles.th, { width: '42%' }]}>Borrower</Text>
            <Text style={[styles.th, { width: '15%' }]}>Period</Text>
            <Text style={[styles.th, { width: '15%' }]}>Time</Text>
            <Text style={[styles.th, { width: '20%', textAlign: 'right' }]}>Amount</Text>
          </View>
          {data.collectedToday.details.length === 0 ? (
            <View style={styles.tr}>
              <Text style={{ fontSize: 9.5, color: '#9ca3af', padding: 10, width: '100%', textAlign: 'center' }}>
                No collections today
              </Text>
            </View>
          ) : (
            data.collectedToday.details.map((p, i) => (
              <View key={i} style={[styles.tr, i % 2 === 1 ? styles.trZebra : {}]}>
                <Text style={[styles.td, { width: '8%' }]}>{i + 1}</Text>
                <Text style={[styles.td, { width: '42%' }]}>{p.customerName}</Text>
                <Text style={[styles.td, { width: '15%' }]}>{p.periodLabel}</Text>
                <Text style={[styles.td, { width: '15%' }]}>{p.time}</Text>
                <Text style={[styles.td, { width: '20%', textAlign: 'right' }, styles.green]}>{inr(p.amount)}</Text>
              </View>
            ))
          )}
        </View>

        {data.pendingToday.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Pending Today ({data.pendingToday.length})</Text>
            <View style={styles.table}>
              <View style={styles.thead}>
                <Text style={[styles.th, { width: '8%' }]}>#</Text>
                <Text style={[styles.th, { width: '42%' }]}>Borrower</Text>
                <Text style={[styles.th, { width: '25%' }]}>Phone</Text>
                <Text style={[styles.th, { width: '25%', textAlign: 'right' }]}>Amount</Text>
              </View>
              {data.pendingToday.map((p, i) => (
                <View key={i} style={[styles.tr, i % 2 === 1 ? styles.trZebra : {}]}>
                  <Text style={[styles.td, { width: '8%' }]}>{i + 1}</Text>
                  <Text style={[styles.td, { width: '42%' }]}>{p.customerName}</Text>
                  <Text style={[styles.td, { width: '25%' }]}>{p.customerPhone || '—'}</Text>
                  <Text style={[styles.td, { width: '25%', textAlign: 'right' }, styles.amber]}>{inr(p.amount)}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {data.overdue.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Overdue ({data.overdue.length})</Text>
            <View style={styles.table}>
              <View style={styles.thead}>
                <Text style={[styles.th, { width: '8%' }]}>#</Text>
                <Text style={[styles.th, { width: '35%' }]}>Borrower</Text>
                <Text style={[styles.th, { width: '20%' }]}>Phone</Text>
                <Text style={[styles.th, { width: '12%', textAlign: 'center' }]}>Days Late</Text>
                <Text style={[styles.th, { width: '25%', textAlign: 'right' }]}>Amount</Text>
              </View>
              {data.overdue.slice(0, 20).map((p, i) => (
                <View key={i} style={[styles.tr, i % 2 === 1 ? styles.trZebra : {}]}>
                  <Text style={[styles.td, { width: '8%' }]}>{i + 1}</Text>
                  <Text style={[styles.td, { width: '35%' }]}>{p.customerName}</Text>
                  <Text style={[styles.td, { width: '20%' }]}>{p.customerPhone || '—'}</Text>
                  <Text style={[styles.td, { width: '12%', textAlign: 'center' }, styles.red]}>{p.daysLate}d</Text>
                  <Text style={[styles.td, { width: '25%', textAlign: 'right' }, styles.red]}>{inr(p.amount)}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        <View style={{ marginTop: 16, padding: 10, backgroundColor: '#f5f3ff', borderRadius: 6 }}>
          <Text style={{ fontSize: 9, color: '#6d28d9', fontWeight: 700 }}>Portfolio snapshot</Text>
          <Text style={{ fontSize: 9, color: '#4c1d95', marginTop: 4 }}>
            Active loans: {data.stats.totalActive}  •  Capital deployed: {inr(data.stats.totalCapitalDeployed)}  •  Principal outstanding: {inr(data.stats.totalOutstanding)}
          </Text>
        </View>

        <Footer generatedAt={data.date} />
      </Page>
    </Document>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// REPORT 3 — Weekly Report
// ═══════════════════════════════════════════════════════════════════════════
export interface WeeklyReportData {
  weekStart: Date;
  weekEnd: Date;
  dailyBreakdown: Array<{ date: Date; collected: number; count: number; expected: number }>;
  weekTotal: { collected: number; expected: number; count: number };
  topCollectors: Array<{ customerName: string; totalPaid: number; paymentsCount: number }>;
  newLoans: Array<{ customerName: string; principal: number; planType: string; startDate: string }>;
  completedLoans: Array<{ customerName: string; principal: number; completedDate: string }>;
  overdueSnapshot: { count: number; amount: number };
  stats: { totalActive: number; totalOutstanding: number; totalCapitalDeployed: number; totalCustomers: number };
}

export function WeeklyReport({ data }: { data: WeeklyReportData }) {
  const rate = data.weekTotal.expected > 0
    ? Math.round((data.weekTotal.collected / data.weekTotal.expected) * 100)
    : 0;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Header
          title="Weekly Report"
          subtitle={`${fmtDate(data.weekStart)} — ${fmtDate(data.weekEnd)}`}
          dateLabel={`Week ending ${fmtDateShort(data.weekEnd)}`}
        />

        <View style={styles.summaryRow}>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>Collected this week</Text>
            <Text style={[styles.summaryValue, styles.green]}>{inr(data.weekTotal.collected)}</Text>
            <Text style={{ fontSize: 8, color: '#6b7280', marginTop: 2 }}>{data.weekTotal.count} payments</Text>
          </View>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>Expected</Text>
            <Text style={styles.summaryValue}>{inr(data.weekTotal.expected)}</Text>
          </View>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>Rate</Text>
            <Text style={[styles.summaryValue, rate >= 80 ? styles.green : rate >= 50 ? styles.amber : styles.red]}>
              {rate}%
            </Text>
          </View>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>Overdue</Text>
            <Text style={[styles.summaryValue, data.overdueSnapshot.count > 0 ? styles.red : {}]}>
              {data.overdueSnapshot.count}
            </Text>
            <Text style={{ fontSize: 8, color: '#6b7280', marginTop: 2 }}>{inr(data.overdueSnapshot.amount)}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Daily breakdown</Text>
        <View style={styles.table}>
          <View style={styles.thead}>
            <Text style={[styles.th, { width: '25%' }]}>Date</Text>
            <Text style={[styles.th, { width: '20%' }]}>Day</Text>
            <Text style={[styles.th, { width: '15%', textAlign: 'center' }]}>Payments</Text>
            <Text style={[styles.th, { width: '20%', textAlign: 'right' }]}>Expected</Text>
            <Text style={[styles.th, { width: '20%', textAlign: 'right' }]}>Collected</Text>
          </View>
          {data.dailyBreakdown.map((d, i) => (
            <View key={i} style={[styles.tr, i % 2 === 1 ? styles.trZebra : {}]}>
              <Text style={[styles.td, { width: '25%' }]}>{fmtDate(d.date)}</Text>
              <Text style={[styles.td, { width: '20%' }]}>
                {d.date.toLocaleDateString('en-IN', { weekday: 'long' })}
              </Text>
              <Text style={[styles.td, { width: '15%', textAlign: 'center' }]}>{d.count}</Text>
              <Text style={[styles.td, { width: '20%', textAlign: 'right' }]}>{inr(d.expected)}</Text>
              <Text style={[styles.td, { width: '20%', textAlign: 'right' }, styles.green]}>{inr(d.collected)}</Text>
            </View>
          ))}
        </View>

        {data.topCollectors.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Top paying borrowers</Text>
            <View style={styles.table}>
              <View style={styles.thead}>
                <Text style={[styles.th, { width: '10%' }]}>#</Text>
                <Text style={[styles.th, { width: '55%' }]}>Borrower</Text>
                <Text style={[styles.th, { width: '15%', textAlign: 'center' }]}>Payments</Text>
                <Text style={[styles.th, { width: '20%', textAlign: 'right' }]}>Total</Text>
              </View>
              {data.topCollectors.slice(0, 10).map((c, i) => (
                <View key={i} style={[styles.tr, i % 2 === 1 ? styles.trZebra : {}]}>
                  <Text style={[styles.td, { width: '10%' }]}>{i + 1}</Text>
                  <Text style={[styles.td, { width: '55%', fontWeight: 700 }]}>{c.customerName}</Text>
                  <Text style={[styles.td, { width: '15%', textAlign: 'center' }]}>{c.paymentsCount}</Text>
                  <Text style={[styles.td, { width: '20%', textAlign: 'right' }, styles.green]}>{inr(c.totalPaid)}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {(data.newLoans.length > 0 || data.completedLoans.length > 0) && (
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
            {data.newLoans.length > 0 && (
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>New loans ({data.newLoans.length})</Text>
                <View style={styles.table}>
                  {data.newLoans.slice(0, 10).map((l, i) => (
                    <View key={i} style={[styles.tr, i % 2 === 1 ? styles.trZebra : {}]}>
                      <Text style={[styles.td, { flex: 1 }]}>{l.customerName}</Text>
                      <Text style={[styles.td, { width: 70, textAlign: 'right' }, styles.bold]}>{inr(l.principal)}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
            {data.completedLoans.length > 0 && (
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>Completed ({data.completedLoans.length})</Text>
                <View style={styles.table}>
                  {data.completedLoans.slice(0, 10).map((l, i) => (
                    <View key={i} style={[styles.tr, i % 2 === 1 ? styles.trZebra : {}]}>
                      <Text style={[styles.td, { flex: 1 }]}>{l.customerName}</Text>
                      <Text style={[styles.td, { width: 70, textAlign: 'right' }, styles.green]}>{inr(l.principal)}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </View>
        )}

        <View style={{ marginTop: 16, padding: 10, backgroundColor: '#f5f3ff', borderRadius: 6 }}>
          <Text style={{ fontSize: 9, color: '#6d28d9', fontWeight: 700 }}>Portfolio snapshot</Text>
          <Text style={{ fontSize: 9, color: '#4c1d95', marginTop: 4 }}>
            Active loans: {data.stats.totalActive}  •  Customers: {data.stats.totalCustomers}  •  Capital deployed: {inr(data.stats.totalCapitalDeployed)}  •  Outstanding: {inr(data.stats.totalOutstanding)}
          </Text>
        </View>

        <Footer generatedAt={data.weekEnd} />
      </Page>
    </Document>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Data builders — collect raw loan data and shape it into report data
// ═══════════════════════════════════════════════════════════════════════════

export function buildTodayRows(lps: LoanWithPayments[], todayStr: string): TodayRow[] {
  const rows: TodayRow[] = [];
  for (const { loan, payments } of lps) {
    if (loan.status !== 'active') continue;
    const totalPaid = payments.reduce((s, p) => s + (p.paidAmount || 0), 0);
    const outstanding = Math.max(0, loan.principal - totalPaid);
    for (const p of payments) {
      if (p.dueDate === todayStr && (p.paidAmount || 0) < (p.expectedAmount || 0)) {
        rows.push({
          customerName: loan.customerName,
          customerPhone: loan.customerPhone,
          planType: loan.planType,
          periodNumber: p.periodNumber,
          expectedAmount: (p.expectedAmount || 0) - (p.paidAmount || 0),
          outstanding,
          loanId: loan.id,
        });
      }
    }
  }
  rows.sort((a, b) => a.customerName.localeCompare(b.customerName));
  return rows;
}

export function buildDailyReportData(lps: LoanWithPayments[], targetDateStr: string): DailyReportData {
  const target = new Date(targetDateStr + 'T00:00:00');
  const expectedToday = { count: 0, amount: 0 };
  const collectedToday = { count: 0, amount: 0, details: [] as DailyReportData['collectedToday']['details'] };
  const pendingToday: DailyReportData['pendingToday'] = [];
  const overdue: DailyReportData['overdue'] = [];
  let totalActive = 0;
  let totalOutstanding = 0;
  let totalCapitalDeployed = 0;

  for (const { loan, payments } of lps) {
    if (loan.status === 'active') {
      totalActive++;
      totalCapitalDeployed += loan.principal;
      const totalPaid = payments.reduce((s, p) => s + (p.paidAmount || 0), 0);
      totalOutstanding += Math.max(0, loan.principal - totalPaid);
    }

    for (const p of payments) {
      const periodLabel = loan.planType === 'daily' ? `D${p.periodNumber}` : `W${p.periodNumber}`;

      if (p.dueDate === targetDateStr) {
        expectedToday.count++;
        expectedToday.amount += p.expectedAmount || 0;
        const paidAmt = p.paidAmount || 0;
        if (paidAmt < (p.expectedAmount || 0)) {
          pendingToday.push({
            customerName: loan.customerName,
            customerPhone: loan.customerPhone,
            amount: (p.expectedAmount || 0) - paidAmt,
            periodLabel,
          });
        }
      }

      if (p.paidDate === targetDateStr && (p.paidAmount || 0) > 0) {
        collectedToday.count++;
        collectedToday.amount += p.paidAmount || 0;
        collectedToday.details.push({
          customerName: loan.customerName,
          amount: p.paidAmount || 0,
          periodLabel,
          time: new Date(p.updatedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
        });
      }

      if (loan.status === 'active' && p.dueDate < targetDateStr && (p.paidAmount || 0) < (p.expectedAmount || 0)) {
        const daysLate = Math.floor((target.getTime() - new Date(p.dueDate + 'T00:00:00').getTime()) / 86400000);
        overdue.push({
          customerName: loan.customerName,
          customerPhone: loan.customerPhone,
          amount: (p.expectedAmount || 0) - (p.paidAmount || 0),
          daysLate,
          periodLabel,
        });
      }
    }
  }

  overdue.sort((a, b) => b.daysLate - a.daysLate);
  pendingToday.sort((a, b) => a.customerName.localeCompare(b.customerName));
  collectedToday.details.sort((a, b) => a.time.localeCompare(b.time));

  return {
    date: target,
    expectedToday,
    collectedToday,
    pendingToday,
    overdue,
    stats: { totalActive, totalOutstanding, totalCapitalDeployed },
  };
}

export function buildWeeklyReportData(
  lps: LoanWithPayments[],
  weekStartStr: string,
  weekEndStr: string,
  totalCustomers: number,
): WeeklyReportData {
  const weekStart = new Date(weekStartStr + 'T00:00:00');
  const weekEnd = new Date(weekEndStr + 'T00:00:00');

  // Build 7-day daily breakdown
  const dailyBreakdown: WeeklyReportData['dailyBreakdown'] = [];
  for (let d = new Date(weekStart); d <= weekEnd; d.setDate(d.getDate() + 1)) {
    dailyBreakdown.push({ date: new Date(d), collected: 0, count: 0, expected: 0 });
  }

  const topCollectorsMap = new Map<string, { totalPaid: number; paymentsCount: number }>();
  const newLoans: WeeklyReportData['newLoans'] = [];
  const completedLoans: WeeklyReportData['completedLoans'] = [];

  let weekCollected = 0;
  let weekExpected = 0;
  let weekCount = 0;
  let overdueCount = 0;
  let overdueAmount = 0;
  let totalActive = 0;
  let totalOutstanding = 0;
  let totalCapitalDeployed = 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const { loan, payments } of lps) {
    if (loan.status === 'active') {
      totalActive++;
      totalCapitalDeployed += loan.principal;
      const totalPaid = payments.reduce((s, p) => s + (p.paidAmount || 0), 0);
      totalOutstanding += Math.max(0, loan.principal - totalPaid);
    }

    // New loans this week
    if (loan.startDate >= weekStartStr && loan.startDate <= weekEndStr) {
      newLoans.push({
        customerName: loan.customerName,
        principal: loan.principal,
        planType: loan.planType,
        startDate: loan.startDate,
      });
    }

    // Completed loans this week
    if (loan.status === 'completed' && loan.updatedAt.substring(0, 10) >= weekStartStr && loan.updatedAt.substring(0, 10) <= weekEndStr) {
      completedLoans.push({
        customerName: loan.customerName,
        principal: loan.principal,
        completedDate: loan.updatedAt.substring(0, 10),
      });
    }

    for (const p of payments) {
      // Expected this week
      if (p.dueDate >= weekStartStr && p.dueDate <= weekEndStr) {
        weekExpected += p.expectedAmount || 0;
      }

      // Collected this week
      if (p.paidDate && p.paidDate >= weekStartStr && p.paidDate <= weekEndStr && (p.paidAmount || 0) > 0) {
        weekCollected += p.paidAmount || 0;
        weekCount++;

        // Distribute to daily breakdown
        const slot = dailyBreakdown.find((d) => d.date.toISOString().substring(0, 10) === p.paidDate);
        if (slot) {
          slot.collected += p.paidAmount || 0;
          slot.count++;
        }

        // Track top collectors
        const prev = topCollectorsMap.get(loan.customerName) || { totalPaid: 0, paymentsCount: 0 };
        prev.totalPaid += p.paidAmount || 0;
        prev.paymentsCount++;
        topCollectorsMap.set(loan.customerName, prev);
      }

      // Expected by day
      if (p.dueDate >= weekStartStr && p.dueDate <= weekEndStr) {
        const slot = dailyBreakdown.find((d) => d.date.toISOString().substring(0, 10) === p.dueDate);
        if (slot) slot.expected += p.expectedAmount || 0;
      }

      // Overdue snapshot (as of week end)
      if (loan.status === 'active' && p.dueDate < today.toISOString().substring(0, 10) && (p.paidAmount || 0) < (p.expectedAmount || 0)) {
        overdueCount++;
        overdueAmount += (p.expectedAmount || 0) - (p.paidAmount || 0);
      }
    }
  }

  const topCollectors = Array.from(topCollectorsMap.entries())
    .map(([customerName, v]) => ({ customerName, ...v }))
    .sort((a, b) => b.totalPaid - a.totalPaid);

  return {
    weekStart,
    weekEnd,
    dailyBreakdown,
    weekTotal: { collected: weekCollected, expected: weekExpected, count: weekCount },
    topCollectors,
    newLoans,
    completedLoans,
    overdueSnapshot: { count: overdueCount, amount: overdueAmount },
    stats: { totalActive, totalOutstanding, totalCapitalDeployed, totalCustomers },
  };
}

// ─── Render helpers ──────────────────────────────────────────────────────
export async function renderPdfToBuffer(element: React.ReactElement): Promise<Buffer> {
  // @react-pdf returns a Node Buffer server-side
  return await renderToBuffer(element);
}
