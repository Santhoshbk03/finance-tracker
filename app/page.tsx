'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  TrendingUp, Users, AlertTriangle, CheckCircle2,
  Clock, ChevronRight, RefreshCw, Banknote, Zap,
  ArrowUpRight, Wallet
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis,
  Tooltip, ResponsiveContainer,
  ComposedChart, Bar, Line, CartesianGrid,
} from 'recharts';

interface Payment {
  id: string; loanId: string; periodNumber: number; due_date: string; dueDate: string;
  expected_amount: number; expectedAmount: number;
  paid_amount: number; paidAmount: number;
  paid_date: string | null; paidDate: string | null;
  status: string; customer_name: string; customer_phone: string;
  principal: number; planType?: string;
}
interface DashboardData {
  stats: {
    active_loans: number; completed_loans: number; total_customers: number;
    total_principal: number; total_expected_interest: number; total_collected: number;
    interest_pending: number; interest_earned: number;
  };
  overduePayments: Payment[];
  dueSoon: Payment[];
  monthlyData: { month: string; collected: number; count: number }[];
  thisWeek: { expected: number; collected: number };
  recentActivity: Payment[];
  heatmap: { date: string; amount: number }[];
  cashflow: { date: string; expected: number; collected: number }[];
  planSplit: {
    daily: { count: number; principal: number };
    weekly: { count: number; principal: number };
  };
  topBorrowers: { customerId: string; name: string; phone: string; outstanding: number; loans: number }[];
}

function fmt(n: number) {
  const v = n || 0;
  if (v >= 100000) return '₹' + (v / 100000).toFixed(1) + 'L';
  if (v >= 1000) return '₹' + (v / 1000).toFixed(1) + 'K';
  return '₹' + v.toLocaleString('en-IN');
}
function fmtFull(n: number) {
  return '₹' + (n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}
function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}
function periodLabel(p: Payment) {
  const n = p.periodNumber ?? (p as any).week_number ?? 0;
  if (p.planType === 'daily') return `Day ${n}`;
  return `Wk ${n}`;
}
function dueLabel(p: Payment) {
  const d = p.dueDate ?? p.due_date;
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  return (
    <div className="avatar flex-shrink-0 text-xs font-bold"
      style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {name[0]?.toUpperCase()}
    </div>
  );
}

function PaymentRow({ p, href, amountColor, amount }: {
  p: Payment; href: string; amountColor: string; amount: number;
}) {
  return (
    <Link href={href}
      className="flex items-center justify-between px-4 py-3 transition-colors hover:bg-white/[0.03] border-b last:border-0"
      style={{ borderColor: 'var(--glass-border)' }}>
      <div className="flex items-center gap-3">
        <Avatar name={p.customer_name} />
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{p.customer_name}</p>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>{periodLabel(p)} · {dueLabel(p)}</p>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <p className="text-sm font-bold" style={{ color: amountColor }}>{fmtFull(amount)}</p>
        <ChevronRight className="w-3.5 h-3.5" style={{ color: 'var(--muted-2)' }} />
      </div>
    </Link>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    fetch('/api/dashboard')
      .then(r => r.ok ? r.json() : r.json().then(e => Promise.reject(e)))
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const chartData = data?.monthlyData?.map(m => ({
    month: new Date(m.month + '-01').toLocaleDateString('en-IN', { month: 'short' }),
    amount: Math.round(m.collected),
  })) || [];

  const weekProgress = data?.thisWeek
    ? Math.min(100, Math.round((data.thisWeek.collected / (data.thisWeek.expected || 1)) * 100))
    : 0;

  const totalPrincipal = data?.stats?.total_principal || 0;
  const interestPending = data?.stats?.interest_pending ?? data?.stats?.total_expected_interest ?? 0;
  const interestEarned = data?.stats?.interest_earned || 0;
  const overdueCount = data?.overduePayments?.length || 0;
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="pb-28 min-h-screen" style={{ background: 'var(--bg)' }}>

      {/* Top bar */}
      <div className="sticky top-0 z-20 px-4 py-3.5 flex items-center justify-between"
        style={{ background: 'rgba(10,10,15,0.85)', backdropFilter: 'blur(20px)', borderBottom: '1px solid var(--glass-border)' }}>
        <div>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>{today}</p>
          <h1 className="text-base font-bold" style={{ color: 'var(--text)' }}>{getGreeting()}</h1>
        </div>
        <button onClick={load} disabled={loading}
          className="w-9 h-9 rounded-full flex items-center justify-center transition-all hover:scale-105"
          style={{ background: 'var(--glass-bg-2)', border: '1px solid var(--glass-border)' }}>
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} style={{ color: 'var(--muted)' }} />
        </button>
      </div>

      <div className="p-4 space-y-4">

        {/* ── Hero card ── */}
        <div className="relative rounded-2xl p-5 overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, #4c1d95 0%, #5b21b6 40%, #6d28d9 100%)',
            boxShadow: '0 8px 32px rgba(109,40,217,0.4)',
            border: '1px solid rgba(139,92,246,0.3)',
          }}>
          {/* Mesh overlay */}
          <div className="absolute inset-0 pointer-events-none" style={{
            backgroundImage: 'radial-gradient(circle at 80% -10%, rgba(236,72,153,0.4) 0%, transparent 55%), radial-gradient(circle at 10% 90%, rgba(6,182,212,0.2) 0%, transparent 50%)',
          }} />
          <div className="absolute inset-0 pointer-events-none" style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }} />

          <div className="relative">
            <div className="flex items-center gap-2 mb-1">
              <Wallet className="w-3.5 h-3.5 text-white/60" />
              <p className="text-white/60 text-[11px] font-semibold uppercase tracking-widest">Capital Deployed</p>
            </div>
            <p className="text-[42px] font-black tracking-tight leading-none text-white mb-0.5">{fmt(totalPrincipal)}</p>
            <p className="text-white/45 text-xs mb-5">
              {fmtFull(totalPrincipal)} · {data?.stats?.active_loans || 0} active loans
            </p>

            <div className="grid grid-cols-3 gap-2.5">
              {[
                { label: 'Interest Due', value: fmt(interestPending), sub: null },
                { label: 'Earned', value: fmt(interestEarned), sub: null },
                { label: 'Overdue', value: String(overdueCount), red: overdueCount > 0 },
              ].map(({ label, value, red }) => (
                <div key={label} className="rounded-xl px-3 py-2.5"
                  style={{ background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.15)' }}>
                  <p className="text-white/55 text-[10px] uppercase tracking-wide mb-1">{label}</p>
                  <p className={`font-black text-base leading-none ${red ? 'text-red-300' : 'text-white'}`}>{value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Bento stats row ── */}
        <div className="grid grid-cols-2 gap-3">
          <div className="card p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.2)' }}>
              <Users className="w-5 h-5" style={{ color: 'var(--purple)' }} />
            </div>
            <div>
              <p className="text-2xl font-black" style={{ color: 'var(--text)' }}>{data?.stats?.total_customers || 0}</p>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>Borrowers</p>
            </div>
          </div>
          <div className="card p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.2)' }}>
              <CheckCircle2 className="w-5 h-5" style={{ color: 'var(--green)' }} />
            </div>
            <div>
              <p className="text-2xl font-black" style={{ color: 'var(--text)' }}>{data?.stats?.completed_loans || 0}</p>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>Completed</p>
            </div>
          </div>
        </div>

        {/* ── This week progress ── */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text)' }}>
              <Zap className="w-4 h-4" style={{ color: 'var(--amber)' }} />
              This Week&apos;s Collections
            </h3>
            <span className="text-sm font-bold"
              style={{ color: weekProgress === 100 ? 'var(--green)' : 'var(--amber)' }}>
              {weekProgress}%
            </span>
          </div>
          <div className="flex justify-between text-xs mb-2.5" style={{ color: 'var(--muted)' }}>
            <span>Collected: <strong style={{ color: 'var(--text)' }}>{fmtFull(data?.thisWeek?.collected || 0)}</strong></span>
            <span>Target: <strong style={{ color: 'var(--text)' }}>{fmtFull(data?.thisWeek?.expected || 0)}</strong></span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--glass-bg-2)' }}>
            <div className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${weekProgress}%`,
                background: weekProgress === 100
                  ? 'linear-gradient(90deg, var(--green), #34d399)'
                  : 'linear-gradient(90deg, var(--amber), #fbbf24)',
                boxShadow: `0 0 12px ${weekProgress === 100 ? 'rgba(16,185,129,0.5)' : 'rgba(245,158,11,0.5)'}`,
              }} />
          </div>
          <p className="text-xs mt-2" style={{ color: 'var(--muted)' }}>
            {data?.dueSoon?.length || 0} payment{(data?.dueSoon?.length || 0) !== 1 ? 's' : ''} due this week
          </p>
        </div>

        {/* ── Overdue ── */}
        {overdueCount > 0 && (
          <div className="card overflow-hidden" style={{ borderColor: 'rgba(244,63,94,0.25)' }}>
            <div className="flex items-center justify-between px-4 py-3"
              style={{ borderBottom: '1px solid rgba(244,63,94,0.12)', background: 'rgba(244,63,94,0.05)' }}>
              <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text)' }}>
                <AlertTriangle className="w-4 h-4" style={{ color: 'var(--red)' }} />
                Overdue
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold"
                  style={{ background: 'rgba(244,63,94,0.15)', color: '#fb7185', border: '1px solid rgba(244,63,94,0.25)' }}>
                  {overdueCount}
                </span>
              </h3>
              <Link href="/collect?tab=overdue" className="text-xs flex items-center gap-0.5 font-semibold" style={{ color: 'var(--red)' }}>
                Collect <ArrowUpRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="max-h-[360px] overflow-y-auto">
              {data?.overduePayments.map(p => (
                <PaymentRow key={p.id}
                  p={p}
                  href={`/loans/${p.loanId ?? (p as any).loan_id}`}
                  amountColor="var(--red)"
                  amount={(p.expectedAmount ?? p.expected_amount) - (p.paidAmount ?? p.paid_amount)}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── Due This Week (grouped by day, scrollable) ── */}
        {(data?.dueSoon?.length || 0) > 0 && (() => {
          // Group by due date
          const byDate: Record<string, Payment[]> = {};
          for (const p of data!.dueSoon) {
            const d = p.dueDate ?? p.due_date;
            if (!byDate[d]) byDate[d] = [];
            byDate[d].push(p);
          }
          const todayStr = new Date().toISOString().slice(0, 10);
          const sortedDates = Object.keys(byDate).sort();
          const totalDue = data!.dueSoon.reduce((s, p) => s + (p.expectedAmount ?? p.expected_amount), 0);
          return (
            <div className="card overflow-hidden" style={{ borderColor: 'rgba(245,158,11,0.2)' }}>
              <div className="flex items-center justify-between px-4 py-3"
                style={{ borderBottom: '1px solid rgba(245,158,11,0.1)', background: 'rgba(245,158,11,0.04)' }}>
                <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text)' }}>
                  <Clock className="w-4 h-4" style={{ color: 'var(--amber)' }} />
                  Due This Week
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold"
                    style={{ background: 'rgba(245,158,11,0.12)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.2)' }}>
                    {data?.dueSoon.length}
                  </span>
                </h3>
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted-2)' }}>Total</p>
                  <p className="text-sm font-black" style={{ color: 'var(--amber)' }}>{fmt(totalDue)}</p>
                </div>
              </div>
              <div className="max-h-[420px] overflow-y-auto">
                {sortedDates.map(date => {
                  const items = byDate[date];
                  const dayTotal = items.reduce((s, p) => s + (p.expectedAmount ?? p.expected_amount), 0);
                  const d = new Date(date + 'T00:00:00');
                  const isToday = date === todayStr;
                  const dayLabel = isToday
                    ? 'Today'
                    : d.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' });
                  return (
                    <div key={date}>
                      <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-2"
                        style={{
                          background: isToday ? 'rgba(245,158,11,0.08)' : 'rgba(10,10,15,0.92)',
                          backdropFilter: 'blur(12px)',
                          borderBottom: '1px solid var(--glass-border)',
                        }}>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-bold uppercase tracking-wide"
                            style={{ color: isToday ? '#fbbf24' : 'var(--muted)' }}>
                            {dayLabel}
                          </span>
                          <span className="px-1.5 py-0 rounded text-[10px] font-bold"
                            style={{ background: 'var(--glass-bg-2)', color: 'var(--muted)' }}>
                            {items.length}
                          </span>
                        </div>
                        <span className="text-[11px] font-bold" style={{ color: 'var(--text)' }}>
                          {fmt(dayTotal)}
                        </span>
                      </div>
                      {items.map(p => (
                        <PaymentRow key={p.id}
                          p={p}
                          href={`/loans/${p.loanId ?? (p as any).loan_id}`}
                          amountColor="var(--text)"
                          amount={p.expectedAmount ?? p.expected_amount}
                        />
                      ))}
                    </div>
                  );
                })}
              </div>
              <Link href="/collect"
                className="flex items-center justify-center gap-1 px-4 py-2.5 text-xs font-semibold transition-colors hover:bg-white/[0.03]"
                style={{ borderTop: '1px solid var(--glass-border)', color: 'var(--purple)' }}>
                Quick collect — mark payments <ArrowUpRight className="w-3 h-3" />
              </Link>
            </div>
          );
        })()}

        {/* All clear */}
        {overdueCount === 0 && (data?.dueSoon?.length || 0) === 0 && !loading && (
          <div className="card p-5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(16,185,129,0.12)' }}>
              <CheckCircle2 className="w-5 h-5" style={{ color: 'var(--green)' }} />
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--green)' }}>All clear!</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>No overdue or upcoming payments</p>
            </div>
          </div>
        )}

        {/* ── Collection chart ── */}
        {chartData.length > 0 && (
          <div className="card p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text)' }}>
                <TrendingUp className="w-4 h-4" style={{ color: 'var(--purple)' }} />
                Monthly Collections
              </h3>
              <span className="text-xs" style={{ color: 'var(--muted)' }}>
                Last {chartData.length} month{chartData.length !== 1 ? 's' : ''}
              </span>
            </div>
            <ResponsiveContainer width="100%" height={150}>
              <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                <defs>
                  <linearGradient id="purpleGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#8B5CF6" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.35)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.35)' }} axisLine={false} tickLine={false}
                  tickFormatter={v => `₹${v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v}`} />
                <Tooltip
                  formatter={(v) => [fmtFull(Number(v)), 'Collected']}
                  contentStyle={{
                    borderRadius: 12, border: '1px solid rgba(139,92,246,0.3)',
                    background: 'rgba(18,18,26,0.95)', color: '#F0F0FF', fontSize: 12,
                  }}
                  cursor={{ stroke: 'rgba(139,92,246,0.3)', strokeWidth: 1 }}
                />
                <Area type="monotone" dataKey="amount" stroke="#8B5CF6" strokeWidth={2}
                  fill="url(#purpleGrad)" dot={{ fill: '#8B5CF6', strokeWidth: 0, r: 3 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* ── Activity Heatmap (last 90 days) ── */}
        {data?.heatmap && data.heatmap.length > 0 && (() => {
          const maxAmount = Math.max(...data.heatmap.map(d => d.amount), 1);
          // Arrange into weeks (columns) × 7 days — reverse so newest is rightmost
          const cells = data.heatmap;
          const firstDate = new Date(cells[0].date + 'T00:00:00');
          const startOffset = firstDate.getDay(); // 0=Sun
          const padded: (typeof cells[number] | null)[] = [];
          for (let i = 0; i < startOffset; i++) padded.push(null);
          cells.forEach(c => padded.push(c));
          while (padded.length % 7 !== 0) padded.push(null);
          const weeks: (typeof cells[number] | null)[][] = [];
          for (let i = 0; i < padded.length; i += 7) weeks.push(padded.slice(i, i + 7));
          const totalCollected = cells.reduce((s, c) => s + c.amount, 0);
          const activeDays = cells.filter(c => c.amount > 0).length;
          return (
            <div className="card p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text)' }}>
                  <Zap className="w-4 h-4" style={{ color: 'var(--purple)' }} />
                  Collection Heatmap
                </h3>
                <span className="text-[11px]" style={{ color: 'var(--muted)' }}>
                  {activeDays}/90 active days
                </span>
              </div>
              <p className="text-xs mb-3" style={{ color: 'var(--muted)' }}>
                Total <strong style={{ color: 'var(--text)' }}>{fmtFull(totalCollected)}</strong> over last 90 days
              </p>
              <div className="flex gap-[3px] w-full">
                {weeks.map((week, wi) => (
                  <div key={wi} className="flex-1 flex flex-col gap-[3px] min-w-0">
                    {week.map((cell, di) => {
                      if (!cell) return <div key={di} className="aspect-square w-full" style={{ visibility: 'hidden' }} />;
                      const intensity = cell.amount / maxAmount;
                      const opacity = cell.amount === 0 ? 0 : Math.max(0.15, intensity);
                      return (
                        <div key={di}
                          title={`${cell.date}: ${fmtFull(cell.amount)}`}
                          className="aspect-square w-full rounded-[3px]"
                          style={{
                            background: cell.amount === 0
                              ? 'rgba(255,255,255,0.04)'
                              : `rgba(139,92,246,${opacity})`,
                            border: cell.amount > 0
                              ? `1px solid rgba(139,92,246,${Math.min(1, opacity + 0.2)})`
                              : '1px solid rgba(255,255,255,0.04)',
                            boxShadow: intensity > 0.7 ? '0 0 4px rgba(139,92,246,0.6)' : undefined,
                          }} />
                      );
                    })}
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between mt-3 text-[10px]" style={{ color: 'var(--muted-2)' }}>
                <span>Less</span>
                <div className="flex gap-[3px]">
                  {[0.1, 0.3, 0.5, 0.75, 1].map(i => (
                    <div key={i} style={{
                      width: 9, height: 9, borderRadius: 2,
                      background: `rgba(139,92,246,${i})`,
                      border: '1px solid rgba(139,92,246,0.3)',
                    }} />
                  ))}
                </div>
                <span>More</span>
              </div>
            </div>
          );
        })()}

        {/* ── Cashflow: expected vs collected (last 14 days) ── */}
        {data?.cashflow && data.cashflow.some(c => c.expected > 0 || c.collected > 0) && (
          <div className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text)' }}>
                <TrendingUp className="w-4 h-4" style={{ color: 'var(--pink)' }} />
                Cashflow · 14 days
              </h3>
              <div className="flex items-center gap-2 text-[10px]" style={{ color: 'var(--muted)' }}>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-sm" style={{ background: 'rgba(139,92,246,0.5)' }} /> Expected
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full" style={{ background: '#10B981' }} /> Collected
                </span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <ComposedChart data={data.cashflow.map(c => ({
                ...c,
                label: new Date(c.date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
              }))} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                <defs>
                  <linearGradient id="barPurple" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.7} />
                    <stop offset="100%" stopColor="#8B5CF6" stopOpacity={0.2} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.35)' }} axisLine={false} tickLine={false} interval={1} />
                <YAxis tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.35)' }} axisLine={false} tickLine={false}
                  tickFormatter={v => v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v} />
                <Tooltip
                  formatter={(v, name) => [fmtFull(Number(v)), name === 'expected' ? 'Expected' : 'Collected']}
                  contentStyle={{
                    borderRadius: 12, border: '1px solid rgba(139,92,246,0.3)',
                    background: 'rgba(18,18,26,0.95)', color: '#F0F0FF', fontSize: 12,
                  }}
                  cursor={{ fill: 'rgba(139,92,246,0.08)' }}
                />
                <Bar dataKey="expected" fill="url(#barPurple)" radius={[4, 4, 0, 0]} barSize={8} />
                <Line type="monotone" dataKey="collected" stroke="#10B981" strokeWidth={2}
                  dot={{ fill: '#10B981', strokeWidth: 0, r: 2.5 }} activeDot={{ r: 4 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* ── Plan Mix ── */}
        {data?.planSplit && (data.planSplit.daily.count + data.planSplit.weekly.count) > 0 && (() => {
          const total = data.planSplit.daily.count + data.planSplit.weekly.count;
          const dailyPct = Math.round((data.planSplit.daily.count / total) * 100);
          const weeklyPct = 100 - dailyPct;
          const totalPrincipal = data.planSplit.daily.principal + data.planSplit.weekly.principal;
          const size = 88, stroke = 10;
          const r = (size - stroke) / 2;
          const c = 2 * Math.PI * r;
          const dailyLen = (dailyPct / 100) * c;
          return (
            <div className="card p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text)' }}>
                  <Wallet className="w-4 h-4" style={{ color: 'var(--purple)' }} />
                  Plan Mix
                </h3>
                <span className="text-[11px]" style={{ color: 'var(--muted)' }}>{total} active</span>
              </div>
              <div className="flex items-center gap-4">
                {/* Donut */}
                <div className="relative flex-shrink-0">
                  <svg width={size} height={size} className="-rotate-90">
                    <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
                    {data.planSplit.daily.count > 0 && (
                      <circle cx={size/2} cy={size/2} r={r} fill="none"
                        stroke="#06b6d4" strokeWidth={stroke} strokeLinecap="round"
                        strokeDasharray={`${dailyLen} ${c - dailyLen}`}
                        strokeDashoffset={0}
                        style={{ filter: 'drop-shadow(0 0 6px rgba(6,182,212,0.5))' }} />
                    )}
                    {data.planSplit.weekly.count > 0 && (
                      <circle cx={size/2} cy={size/2} r={r} fill="none"
                        stroke="#8b5cf6" strokeWidth={stroke} strokeLinecap="round"
                        strokeDasharray={`${c - dailyLen} ${dailyLen}`}
                        strokeDashoffset={-dailyLen}
                        style={{ filter: 'drop-shadow(0 0 6px rgba(139,92,246,0.5))' }} />
                    )}
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <p className="text-xl font-black leading-none" style={{ color: 'var(--text)' }}>{total}</p>
                    <p className="text-[9px] uppercase tracking-wide" style={{ color: 'var(--muted)' }}>loans</p>
                  </div>
                </div>

                {/* Legend rows */}
                <div className="flex-1 space-y-2.5 min-w-0">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold flex items-center gap-1.5" style={{ color: 'var(--text)' }}>
                        <span className="w-2 h-2 rounded-full" style={{ background: '#06b6d4', boxShadow: '0 0 4px #06b6d4' }} />
                        Daily
                      </span>
                      <span className="text-xs" style={{ color: 'var(--muted)' }}>
                        <strong style={{ color: 'var(--text)' }}>{data.planSplit.daily.count}</strong> · {fmt(data.planSplit.daily.principal)}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--glass-bg-2)' }}>
                      <div className="h-full transition-all duration-700" style={{
                        width: `${dailyPct}%`,
                        background: 'linear-gradient(90deg, #06b6d4, #0ea5e9)',
                      }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold flex items-center gap-1.5" style={{ color: 'var(--text)' }}>
                        <span className="w-2 h-2 rounded-full" style={{ background: '#8b5cf6', boxShadow: '0 0 4px #8b5cf6' }} />
                        Weekly
                      </span>
                      <span className="text-xs" style={{ color: 'var(--muted)' }}>
                        <strong style={{ color: 'var(--text)' }}>{data.planSplit.weekly.count}</strong> · {fmt(data.planSplit.weekly.principal)}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--glass-bg-2)' }}>
                      <div className="h-full transition-all duration-700" style={{
                        width: `${weeklyPct}%`,
                        background: 'linear-gradient(90deg, #8b5cf6, #ec4899)',
                      }} />
                    </div>
                  </div>
                </div>
              </div>
              <div className="mt-3 pt-3 flex items-center justify-between text-[11px]"
                style={{ borderTop: '1px solid var(--glass-border)', color: 'var(--muted)' }}>
                <span>Total capital</span>
                <span className="font-black" style={{ color: 'var(--text)' }}>{fmtFull(totalPrincipal)}</span>
              </div>
            </div>
          );
        })()}

        {/* ── Top Outstanding ── */}
        {data?.topBorrowers && data.topBorrowers.length > 0 && (
          <div className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text)' }}>
                <Users className="w-4 h-4" style={{ color: 'var(--pink)' }} />
                Top Outstanding
              </h3>
              <Link href="/customers" className="text-[11px] flex items-center gap-0.5" style={{ color: 'var(--muted)' }}>
                All <ArrowUpRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="space-y-2.5">
              {data.topBorrowers.map((b, i) => {
                const max = data.topBorrowers[0].outstanding;
                const pct = max > 0 ? (b.outstanding / max) * 100 : 0;
                return (
                  <Link key={b.customerId} href={`/customers/${b.customerId}`}
                    className="block hover:bg-white/[0.03] -mx-2 px-2 py-1.5 rounded-lg transition-colors">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[10px] font-bold flex-shrink-0" style={{ color: 'var(--muted-2)' }}>
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <span className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{b.name}</span>
                        {b.loans > 1 && (
                          <span className="px-1.5 py-0 rounded text-[9px] font-bold flex-shrink-0"
                            style={{ background: 'rgba(236,72,153,0.15)', color: '#f472b6' }}>
                            ×{b.loans}
                          </span>
                        )}
                      </div>
                      <span className="text-sm font-black flex-shrink-0" style={{ color: 'var(--text)' }}>
                        {fmt(b.outstanding)}
                      </span>
                    </div>
                    <div className="h-1 rounded-full overflow-hidden" style={{ background: 'var(--glass-bg-2)' }}>
                      <div className="h-full transition-all duration-700" style={{
                        width: `${pct}%`,
                        background: 'linear-gradient(90deg, var(--purple), var(--pink))',
                      }} />
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Recent collections ── */}
        {(data?.recentActivity?.length || 0) > 0 && (
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3"
              style={{ borderBottom: '1px solid var(--glass-border)' }}>
              <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text)' }}>
                <Banknote className="w-4 h-4" style={{ color: 'var(--green)' }} />
                Recent Collections
              </h3>
            </div>
            {data?.recentActivity.map(p => (
              <Link key={p.id} href={`/loans/${p.loanId ?? (p as any).loan_id}`}
                className="flex items-center justify-between px-4 py-3 transition-colors hover:bg-white/[0.03] border-b last:border-0"
                style={{ borderColor: 'var(--glass-border)' }}>
                <div className="flex items-center gap-3">
                  <Avatar name={p.customer_name} size={36} />
                  <div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{p.customer_name}</p>
                    <p className="text-xs" style={{ color: 'var(--muted)' }}>
                      {periodLabel(p)} · {p.paidDate ?? p.paid_date
                        ? new Date(((p.paidDate ?? p.paid_date) as string) + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
                        : '—'}
                    </p>
                  </div>
                </div>
                <p className="text-sm font-bold" style={{ color: 'var(--green)' }}>
                  {fmtFull(p.paidAmount ?? p.paid_amount)}
                </p>
              </Link>
            ))}
          </div>
        )}

        {loading && (
          <div className="flex justify-center py-10">
            <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
              style={{ borderColor: 'var(--purple)', borderTopColor: 'transparent' }} />
          </div>
        )}
      </div>
    </div>
  );
}
