'use client';
import { useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import {
  ChevronLeft, TrendingUp, Zap, IndianRupee,
  CheckCircle2, Info, RefreshCw, ChevronDown, ChevronUp,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ComposedChart, Bar, Line, CartesianGrid,
} from 'recharts';

// ─── Types ─────────────────────────────────────────────────────────────────
interface SimParams {
  initialCapital:    number;  // own money
  loanPrincipal:     number;  // amount lent per loan
  weeklyRepayment:   number;  // collected per week from each loan
  loanWeeks:         number;  // duration of each loan
  reinvestThreshold: number;  // cash needed before new loan is created
  totalWeeks:        number;  // simulation length
}
interface SimWeek {
  week:                  number;
  activeLoans:           number;
  newLoans:              number;
  completingLoans:       number;
  weeklyIncome:          number;
  cash:                  number;
  totalInterestEarned:   number;
  cumulativeLoans:       number;
}

// ─── Simulation engine ──────────────────────────────────────────────────────
function runSimulation(p: SimParams): SimWeek[] {
  const started: Record<number, number> = {};
  let cash                = p.initialCapital;
  let totalInterest       = 0;
  let cumulativeLoans     = 0;

  // Initial deployment
  const init = Math.floor(cash / p.loanPrincipal);
  started[0]     = init;
  cash          -= init * p.loanPrincipal;
  cumulativeLoans += init;

  const weeks: SimWeek[] = [];

  for (let w = 1; w <= p.totalWeeks; w++) {
    // Count active loans (started in last loanWeeks weeks, still paying)
    let active = 0;
    for (let s = Math.max(0, w - p.loanWeeks); s < w; s++) {
      active += started[s] ?? 0;
    }

    const income   = active * p.weeklyRepayment;
    const completing = started[w - p.loanWeeks] ?? 0;
    const profitPerLoan = p.weeklyRepayment * p.loanWeeks - p.loanPrincipal;
    totalInterest += completing * profitPerLoan;

    cash += income;

    // Reinvest
    let newL = 0;
    while (cash >= p.reinvestThreshold) {
      started[w] = (started[w] ?? 0) + 1;
      cash -= p.loanPrincipal;
      newL++;
      cumulativeLoans++;
    }

    // Active after new deployments
    const activeAfter = active - completing + newL;

    weeks.push({
      week: w,
      activeLoans:         activeAfter,
      newLoans:            newL,
      completingLoans:     completing,
      weeklyIncome:        income,
      cash,
      totalInterestEarned: totalInterest,
      cumulativeLoans,
    });
  }
  return weeks;
}

// ─── Formatters ─────────────────────────────────────────────────────────────
function fmt(n: number) {
  if (n >= 10000000) return '₹' + (n / 10000000).toFixed(2) + ' Cr';
  if (n >= 100000)   return '₹' + (n / 100000).toFixed(2)   + 'L';
  if (n >= 1000)     return '₹' + (n / 1000).toFixed(1)     + 'K';
  return '₹' + Math.round(n).toLocaleString('en-IN');
}
function fmtFull(n: number) {
  return '₹' + Math.round(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

// ─── Milestone detector ──────────────────────────────────────────────────────
function getMilestones(weeks: SimWeek[], p: SimParams) {
  const milestones: { week: number; label: string; icon: string; color: string }[] = [];
  const targets = [
    { v: p.initialCapital * 0.5,  label: `First 50% return (${fmt(p.initialCapital * 0.5)})`,  icon: '📈', color: '#60a5fa' },
    { v: p.initialCapital,        label: `Capital doubled (${fmt(p.initialCapital * 2)} total)`, icon: '🎯', color: '#a78bfa' },
    { v: p.initialCapital * 2,    label: `3× your money — ₹${fmt(p.initialCapital * 3)} total`, icon: '🚀', color: '#f59e0b' },
    { v: p.initialCapital * 5,    label: `6× — earnings alone = ${fmt(p.initialCapital * 5)}`,  icon: '💎', color: '#10B981' },
    { v: 1000000,                 label: '₹10L total interest earned',                            icon: '✅', color: '#34d399' },
    { v: 5000000,                 label: '₹50L total interest earned',                            icon: '🔥', color: '#f87171' },
    { v: 10000000,                label: '₹1 Crore total interest earned',                        icon: '👑', color: '#fbbf24' },
  ];
  for (const t of targets) {
    const w = weeks.find(x => x.totalInterestEarned >= t.v);
    if (w) milestones.push({ week: w.week, label: t.label, icon: t.icon, color: t.color });
  }
  return milestones;
}

// ─── Custom tooltip ──────────────────────────────────────────────────────────
function ChartTip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl p-3 text-xs space-y-1 shadow-2xl"
      style={{ background: 'rgba(18,18,26,0.97)', border: '1px solid rgba(139,92,246,0.3)', color: '#F0F0FF' }}>
      <p className="font-bold mb-1.5" style={{ color: 'rgba(255,255,255,0.7)' }}>{label}</p>
      {payload.map(e => (
        <div key={e.name} className="flex items-center justify-between gap-4">
          <span style={{ color: 'rgba(255,255,255,0.55)' }}>{e.name}</span>
          <span className="font-bold">{typeof e.value === 'number' ? (e.value > 10000 ? fmtFull(e.value) : e.value) : e.value}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────
export default function SimulatePage() {
  const [showParams, setShowParams] = useState(false);
  const [params, setParams] = useState<SimParams>({
    initialCapital:    2200000,   // ₹22L
    loanPrincipal:     300000,    // ₹3L
    weeklyRepayment:   40000,     // ₹40K/week
    loanWeeks:         10,        // 10 weeks
    reinvestThreshold: 300000,    // ₹3L to trigger new loan
    totalWeeks:        52,        // 1 year
  });
  const [raw, setRaw] = useState({
    initialCapital: '22,00,000',
    loanPrincipal:  '3,00,000',
    weeklyRepayment:'40,000',
    loanWeeks:      '10',
    reinvestThreshold: '3,00,000',
  });

  const setPNum = useCallback((key: keyof SimParams, val: string) => {
    setRaw(r => ({ ...r, [key]: val }));
    const n = parseInt(val.replace(/,/g, '')) || 0;
    if (n > 0) setParams(p => ({ ...p, [key]: n }));
  }, []);

  const weeks = useMemo(() => runSimulation(params), [params]);
  const milestones = useMemo(() => getMilestones(weeks, params), [weeks, params]);

  // Build monthly chart data (4 weeks = 1 month)
  const monthlyChart = useMemo(() => {
    const months: { label: string; income: number; interest: number; loans: number; newLoans: number }[] = [];
    for (let m = 0; m < 13; m++) {
      const slice = weeks.filter(w => w.week > m * 4 && w.week <= (m + 1) * 4);
      if (!slice.length) continue;
      months.push({
        label: `M${m + 1}`,
        income:    slice.reduce((s, w) => s + w.weeklyIncome, 0),
        interest:  slice[slice.length - 1].totalInterestEarned,
        loans:     slice[slice.length - 1].activeLoans,
        newLoans:  slice.reduce((s, w) => s + w.newLoans, 0),
      });
    }
    return months;
  }, [weeks]);

  // Quarterly snapshots
  const quarters = useMemo(() => [13, 26, 39, 52].map(w => weeks[w - 1]).filter(Boolean), [weeks]);

  const last    = weeks[weeks.length - 1];
  const profitPerLoan  = params.weeklyRepayment * params.loanWeeks - params.loanPrincipal;
  const returnPct      = ((profitPerLoan / params.loanPrincipal) * 100).toFixed(1);
  const annualROI      = last ? ((last.totalInterestEarned / params.initialCapital) * 100).toFixed(1) : '0';
  const multiplier     = last ? ((params.initialCapital + last.totalInterestEarned) / params.initialCapital).toFixed(2) : '1';
  const weeklyAtEnd    = last?.weeklyIncome || 0;
  const monthlyAtEnd   = weeklyAtEnd * 4;

  return (
    <div className="pb-28 min-h-screen" style={{ background: 'var(--bg)' }}>

      {/* Header */}
      <div className="sticky top-0 z-20 px-4 py-3 flex items-center gap-3"
        style={{ background: 'rgba(10,10,15,0.88)', backdropFilter: 'blur(20px)', borderBottom: '1px solid var(--glass-border)' }}>
        <Link href="/"
          className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: 'var(--glass-bg-2)', border: '1px solid var(--glass-border)' }}>
          <ChevronLeft className="w-4 h-4" style={{ color: 'var(--text)' }} />
        </Link>
        <div>
          <h1 className="text-base font-bold" style={{ color: 'var(--text)' }}>Compound Simulation</h1>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>1-year projection · interest reinvested</p>
        </div>
        <button onClick={() => setShowParams(p => !p)}
          className="ml-auto flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg"
          style={{ color: 'var(--purple)', background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)' }}>
          Params {showParams ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      </div>

      <div className="p-4 space-y-4">

        {/* ── Parameters panel ── */}
        {showParams && (
          <div className="card p-4 space-y-3">
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--muted-2)' }}>Simulation Parameters</p>
            <div className="grid grid-cols-2 gap-3">
              {([
                { key: 'initialCapital',    label: 'Starting Capital',         hint: 'Your total investment' },
                { key: 'loanPrincipal',     label: 'Amount per Loan',          hint: 'Lent to each borrower' },
                { key: 'weeklyRepayment',   label: 'Weekly Collection',        hint: 'Collected from each loan/week' },
                { key: 'loanWeeks',         label: 'Loan Duration (weeks)',    hint: 'How many weeks per loan' },
                { key: 'reinvestThreshold', label: 'Reinvest Threshold',       hint: 'Cash needed to create new loan' },
              ] as const).map(({ key, label, hint }) => (
                <div key={key} className={key === 'initialCapital' ? 'col-span-2' : ''}>
                  <label className="text-[10px] uppercase tracking-wide block mb-1" style={{ color: 'var(--muted-2)' }}>{label}</label>
                  <div className="relative">
                    {key !== 'loanWeeks' && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: 'var(--muted)' }}>₹</span>}
                    <input
                      type="text" inputMode="numeric"
                      value={key === 'loanWeeks' ? String(params.loanWeeks) : raw[key as keyof typeof raw]}
                      onChange={e => setPNum(key, e.target.value)}
                      className="input py-2 text-sm w-full"
                      style={{ paddingLeft: key !== 'loanWeeks' ? '1.75rem' : undefined }}
                    />
                  </div>
                  <p className="text-[10px] mt-0.5" style={{ color: 'var(--muted-2)' }}>{hint}</p>
                </div>
              ))}
            </div>

            {/* Loan summary */}
            <div className="rounded-xl p-3 text-xs space-y-1"
              style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.15)' }}>
              <p className="font-bold" style={{ color: 'var(--purple)' }}>Per-loan economics</p>
              <p style={{ color: 'var(--muted)' }}>
                Lend <strong style={{ color: 'var(--text)' }}>{fmtFull(params.loanPrincipal)}</strong> →
                collect <strong style={{ color: 'var(--text)' }}>{fmtFull(params.weeklyRepayment)}/week × {params.loanWeeks} weeks</strong> =
                <strong style={{ color: 'var(--green)' }}> {fmtFull(params.weeklyRepayment * params.loanWeeks)} total</strong>
              </p>
              <p style={{ color: 'var(--muted)' }}>
                Profit per loan: <strong style={{ color: 'var(--green)' }}>{fmtFull(profitPerLoan)}</strong>
                {' '}(<strong style={{ color: 'var(--amber)' }}>{returnPct}%</strong> return per cycle)
              </p>
            </div>
          </div>
        )}

        {/* ── Hero — Year-end summary ── */}
        <div className="relative rounded-2xl p-5 overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, #064e3b 0%, #065f46 40%, #047857 100%)',
            boxShadow: '0 8px 32px rgba(5,150,105,0.4)',
            border: '1px solid rgba(16,185,129,0.3)',
          }}>
          <div className="absolute inset-0 pointer-events-none" style={{
            backgroundImage: 'radial-gradient(circle at 85% -10%, rgba(52,211,153,0.35) 0%, transparent 55%), radial-gradient(circle at 5% 90%, rgba(139,92,246,0.2) 0%, transparent 50%)',
          }} />
          <div className="absolute inset-0 pointer-events-none" style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }} />
          <div className="relative">
            <p className="text-white/60 text-[11px] font-semibold uppercase tracking-widest mb-1">After 1 Year — Total Interest Earned</p>
            <p className="text-[42px] font-black tracking-tight leading-none text-white mb-0.5">
              {fmt(last?.totalInterestEarned || 0)}
            </p>
            <p className="text-white/45 text-xs mb-5">{fmtFull(last?.totalInterestEarned || 0)} total profit</p>

            <div className="grid grid-cols-3 gap-2.5">
              {[
                { label: 'ROI',       value: `${annualROI}%`,        red: false },
                { label: 'Multiplier', value: `${multiplier}×`,      red: false },
                { label: 'Active Loans', value: String(last?.activeLoans || 0), red: false },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-xl px-3 py-2.5"
                  style={{ background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.15)' }}>
                  <p className="text-white/55 text-[10px] uppercase tracking-wide mb-1">{label}</p>
                  <p className="font-black text-base leading-none text-white">{value}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-white/55 text-[10px] uppercase tracking-wide">Month-end income</span>
                <span className="text-white font-bold text-sm">{fmt(monthlyAtEnd)} / month</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-white/55 text-[10px] uppercase tracking-wide">Loans ever created</span>
                <span className="text-white font-bold text-sm">{last?.cumulativeLoans || 0} loans</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Quarterly snapshots ── */}
        <div>
          <p className="text-[10px] uppercase tracking-widest font-bold mb-2 px-1" style={{ color: 'var(--muted-2)' }}>
            Quarterly Progress
          </p>
          <div className="grid grid-cols-2 gap-3">
            {quarters.map((q, i) => {
              const labels = ['Q1 (3 mo)', 'Q2 (6 mo)', 'Q3 (9 mo)', 'Q4 (12 mo)'];
              const colors = ['#60a5fa', '#a78bfa', '#f59e0b', '#10B981'];
              const roi_q = ((q.totalInterestEarned / params.initialCapital) * 100).toFixed(1);
              return (
                <div key={i} className="card p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: colors[i], boxShadow: `0 0 6px ${colors[i]}` }} />
                    <p className="text-xs font-bold" style={{ color: 'var(--muted)' }}>{labels[i]}</p>
                  </div>
                  <p className="text-lg font-black" style={{ color: colors[i] }}>{fmt(q.totalInterestEarned)}</p>
                  <p className="text-[11px] mt-0.5" style={{ color: 'var(--muted)' }}>earned · {roi_q}% ROI</p>
                  <div className="mt-2 pt-2" style={{ borderTop: '1px solid var(--glass-border)' }}>
                    <p className="text-xs" style={{ color: 'var(--text)' }}>
                      <strong>{q.activeLoans}</strong> active loans
                    </p>
                    <p className="text-[11px]" style={{ color: 'var(--muted)' }}>
                      {fmt(q.weeklyIncome)}/week income
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Monthly Income chart ── */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text)' }}>
              <TrendingUp className="w-4 h-4" style={{ color: 'var(--green)' }} />
              Monthly Collections (Simulated)
            </h3>
            <span className="text-xs font-bold px-2 py-0.5 rounded-lg"
              style={{ background: 'rgba(16,185,129,0.15)', color: 'var(--green)', border: '1px solid rgba(16,185,129,0.2)' }}>
              +{((monthlyChart[monthlyChart.length - 1]?.income || 1) / (monthlyChart[0]?.income || 1) * 100 - 100).toFixed(0)}% growth
            </span>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <ComposedChart data={monthlyChart} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="incGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10B981" stopOpacity={0.7} />
                  <stop offset="100%" stopColor="#10B981" stopOpacity={0.1} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.35)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.35)' }} axisLine={false} tickLine={false}
                tickFormatter={v => v >= 100000 ? (v / 100000).toFixed(0) + 'L' : v >= 1000 ? (v / 1000).toFixed(0) + 'K' : v} />
              <Tooltip content={<ChartTip />} />
              <Bar dataKey="income"  name="Monthly Income" fill="url(#incGrad)" radius={[4, 4, 0, 0]} barSize={16} />
              <Line dataKey="loans"  name="Active Loans" stroke="#8b5cf6" strokeWidth={2}
                dot={{ fill: '#8b5cf6', strokeWidth: 0, r: 3 }} yAxisId={0} />
            </ComposedChart>
          </ResponsiveContainer>
          <p className="text-[10px] mt-2 text-center" style={{ color: 'var(--muted-2)' }}>
            Bars = monthly collection · Purple line = active loans count
          </p>
        </div>

        {/* ── Cumulative interest curve ── */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text)' }}>
              <Zap className="w-4 h-4" style={{ color: 'var(--amber)' }} />
              Compounding Curve
            </h3>
            <span className="text-xs" style={{ color: 'var(--muted)' }}>Cumulative earnings</span>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart
              data={weeks.filter(w => w.week % 2 === 0).map(w => ({
                week: `W${w.week}`,
                earned: Math.round(w.totalInterestEarned),
                capital: params.initialCapital,
              }))}
              margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="earnGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="capGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <XAxis dataKey="week" tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.3)' }} axisLine={false} tickLine={false}
                interval={Math.floor(weeks.length / 8)} />
              <YAxis tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.3)' }} axisLine={false} tickLine={false}
                tickFormatter={v => v >= 10000000 ? (v / 10000000).toFixed(1) + 'Cr' : v >= 100000 ? (v / 100000).toFixed(0) + 'L' : (v / 1000).toFixed(0) + 'K'} />
              <Tooltip content={<ChartTip />} cursor={{ stroke: 'rgba(245,158,11,0.3)', strokeWidth: 1 }} />
              <Area type="monotone" dataKey="capital" name="Own Capital" stroke="#8b5cf6" strokeWidth={1.5}
                fill="url(#capGrad)" strokeDasharray="4 2" dot={false} />
              <Area type="monotone" dataKey="earned"  name="Interest Earned" stroke="#f59e0b" strokeWidth={2}
                fill="url(#earnGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
          <div className="flex items-center justify-center gap-5 mt-2 text-[10px]" style={{ color: 'var(--muted-2)' }}>
            <span className="flex items-center gap-1.5">
              <span className="w-6 h-px" style={{ background: '#8b5cf6', display: 'inline-block' }} />Own Capital (flat)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-6 h-px" style={{ background: '#f59e0b', display: 'inline-block' }} />Compounded Earnings
            </span>
          </div>
        </div>

        {/* ── Milestones ── */}
        {milestones.length > 0 && (
          <div className="card p-4">
            <h3 className="text-sm font-semibold flex items-center gap-2 mb-3" style={{ color: 'var(--text)' }}>
              <CheckCircle2 className="w-4 h-4" style={{ color: 'var(--green)' }} />
              Milestone Timeline
            </h3>
            <div className="relative pl-5 space-y-3">
              <div className="absolute left-2 top-0 bottom-0 w-px" style={{ background: 'rgba(139,92,246,0.25)' }} />
              {milestones.map((m, i) => {
                const month = Math.ceil(m.week / 4);
                return (
                  <div key={i} className="relative">
                    <div className="absolute -left-[15px] w-3 h-3 rounded-full border-2 flex items-center justify-center"
                      style={{ background: 'var(--bg)', borderColor: m.color, top: 3 }} />
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold" style={{ color: m.color }}>
                          {m.icon} {m.label}
                        </p>
                        <p className="text-[11px]" style={{ color: 'var(--muted)' }}>
                          Week {m.week} · Month {month}
                        </p>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md flex-shrink-0"
                        style={{ background: `${m.color}20`, color: m.color, border: `1px solid ${m.color}40` }}>
                        Wk {m.week}
                      </span>
                    </div>
                  </div>
                );
              })}
              {/* Year end dot */}
              <div className="relative">
                <div className="absolute -left-[15px] w-3 h-3 rounded-full"
                  style={{ background: '#10B981', top: 3, boxShadow: '0 0 8px rgba(16,185,129,0.6)' }} />
                <div>
                  <p className="text-xs font-semibold" style={{ color: '#10B981' }}>
                    👑 Year-end: {fmt(last?.totalInterestEarned || 0)} total earned
                  </p>
                  <p className="text-[11px]" style={{ color: 'var(--muted)' }}>Week 52 · Month 12</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Month-by-month breakdown table ── */}
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3"
            style={{ borderBottom: '1px solid var(--glass-border)' }}>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Month-by-Month Breakdown</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--glass-border)', background: 'rgba(255,255,255,0.03)' }}>
                  {['Month', 'Active Loans', 'Monthly Income', 'New Loans', 'Total Earned'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left font-semibold" style={{ color: 'var(--muted-2)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {monthlyChart.map((m, i) => {
                  const growth = i > 0 ? ((m.income - monthlyChart[i - 1].income) / (monthlyChart[i - 1].income || 1) * 100) : 0;
                  const isLast = i === monthlyChart.length - 1;
                  return (
                    <tr key={m.label}
                      style={{
                        borderBottom: '1px solid var(--glass-border)',
                        background: isLast ? 'rgba(16,185,129,0.05)' : 'transparent',
                      }}>
                      <td className="px-3 py-2.5 font-bold" style={{ color: isLast ? 'var(--green)' : 'var(--text)' }}>
                        {m.label}{isLast ? ' ✓' : ''}
                      </td>
                      <td className="px-3 py-2.5" style={{ color: 'var(--text)' }}>
                        <span className="font-bold">{m.loans}</span>
                        <span style={{ color: 'var(--muted)' }}> loans</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="font-bold" style={{ color: 'var(--green)' }}>{fmt(m.income)}</span>
                        {i > 0 && growth !== 0 && (
                          <span className="ml-1 text-[10px]" style={{ color: growth > 0 ? 'var(--green)' : 'var(--red)' }}>
                            {growth > 0 ? '+' : ''}{growth.toFixed(0)}%
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5" style={{ color: 'var(--purple)' }}>
                        +{m.newLoans}
                      </td>
                      <td className="px-3 py-2.5 font-bold" style={{ color: 'var(--amber)' }}>
                        {fmt(m.interest)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Assumptions & disclaimer ── */}
        <div className="rounded-2xl p-4"
          style={{ background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.2)' }}>
          <div className="flex items-start gap-2.5">
            <Info className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#fbbf24' }} />
            <div>
              <p className="text-xs font-bold mb-1.5" style={{ color: '#fbbf24' }}>Simulation Assumptions</p>
              <ul className="text-[11px] space-y-1.5 leading-relaxed" style={{ color: 'var(--muted)' }}>
                <li>• All collected cash ≥ ₹{fmt(params.reinvestThreshold)} is immediately re-lent as a new loan</li>
                <li>• Every borrower pays exactly ₹{fmt(params.weeklyRepayment)}/week for {params.loanWeeks} weeks (no defaults, no prepayments)</li>
                <li>• Interest is the upfront fee built into weekly repayment amount</li>
                <li>• Starting capital: <strong style={{ color: 'var(--text)' }}>{fmtFull(params.initialCapital)}</strong> (₹3L March + ₹19L April 18)</li>
                <li>• Idle cash below ₹{fmt(params.reinvestThreshold)} earns nothing (stays in hand)</li>
                <li>• Real outcomes will vary — defaults, delays, and liquidity needs will reduce returns</li>
              </ul>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
