'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  TrendingUp, Users, AlertTriangle, CheckCircle2,
  Clock, ChevronRight, RefreshCw, Banknote, Zap,
  ArrowUpRight, Wallet, MessageCircle, Target,
  IndianRupee, Activity, TrendingDown, Pencil, Check, X,
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
    today_due: number; today_collected: number; overdue_count: number;
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

function PaymentRow({ p, href, amountColor, amount, showWa }: {
  p: Payment; href: string; amountColor: string; amount: number; showWa?: boolean;
}) {
  const waPhone = showWa && p.customer_phone
    ? p.customer_phone.replace(/\D/g, '').replace(/^0/, '').replace(/^(?!91)/, '91')
    : null;
  const firstName = p.customer_name?.split(' ')[0] || p.customer_name || '';
  const waMsg = waPhone
    ? encodeURIComponent(`Hi ${firstName}, your payment of ₹${amount.toLocaleString('en-IN')} is overdue. Please clear at the earliest. 🙏`)
    : null;

  return (
    <div className="flex items-center border-b last:border-0" style={{ borderColor: 'var(--glass-border)' }}>
      <Link href={href}
        className="flex-1 flex items-center justify-between px-4 py-3 transition-colors hover:bg-white/[0.03] min-w-0">
        <div className="flex items-center gap-3 min-w-0">
          <Avatar name={p.customer_name} />
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{p.customer_name}</p>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>{periodLabel(p)} · {dueLabel(p)}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
          <p className="text-sm font-bold" style={{ color: amountColor }}>{fmtFull(amount)}</p>
          <ChevronRight className="w-3.5 h-3.5" style={{ color: 'var(--muted-2)' }} />
        </div>
      </Link>
      {waPhone && waMsg && (
        <a href={`https://wa.me/${waPhone}?text=${waMsg}`}
          target="_blank" rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          className="px-3 self-stretch flex items-center justify-center flex-shrink-0 transition-colors hover:bg-white/[0.04]"
          style={{ borderLeft: '1px solid var(--glass-border)' }}
          title={`WhatsApp ${firstName}`}>
          <MessageCircle className="w-4 h-4" style={{ color: '#25d366' }} />
        </a>
      )}
    </div>
  );
}

// ─── Capital entry type (stored in localStorage) ──────────────────────────────
interface CapitalEntry { id: string; date: string; amount: number; note: string }

const CAP_KEY = 'ft_capital_entries';
function loadEntries(): CapitalEntry[] {
  try { return JSON.parse(localStorage.getItem(CAP_KEY) || '[]'); } catch { return []; }
}
function saveEntries(e: CapitalEntry[]) { localStorage.setItem(CAP_KEY, JSON.stringify(e)); }

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  // Capital tracking
  const [capEntries, setCapEntries]     = useState<CapitalEntry[]>([]);
  const [showCapEdit, setShowCapEdit]   = useState(false);
  const [capDate, setCapDate]           = useState('');
  const [capAmount, setCapAmount]       = useState('');
  const [capNote, setCapNote]           = useState('');
  const [editingCapId, setEditingCapId] = useState<string | null>(null);

  useEffect(() => { setCapEntries(loadEntries()); }, []);

  const addCapEntry = () => {
    const amt = parseFloat(capAmount.replace(/,/g, '')) || 0;
    if (!capDate || amt <= 0) return;
    let next: CapitalEntry[];
    if (editingCapId) {
      next = capEntries.map(e => e.id === editingCapId ? { ...e, date: capDate, amount: amt, note: capNote } : e);
    } else {
      next = [...capEntries, { id: Date.now().toString(), date: capDate, amount: amt, note: capNote }];
    }
    next.sort((a, b) => a.date.localeCompare(b.date));
    saveEntries(next);
    setCapEntries(next);
    setCapDate(''); setCapAmount(''); setCapNote(''); setEditingCapId(null); setShowCapEdit(false);
  };

  const deleteCapEntry = (id: string) => {
    const next = capEntries.filter(e => e.id !== id);
    saveEntries(next); setCapEntries(next);
  };

  const startEdit = (e: CapitalEntry) => {
    setEditingCapId(e.id); setCapDate(e.date);
    setCapAmount(String(e.amount)); setCapNote(e.note); setShowCapEdit(true);
  };

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

  // New computed metrics
  const todayDue       = data?.stats?.today_due       || 0;
  const todayCollected = data?.stats?.today_collected  || 0;
  const todayPct       = todayDue > 0 ? Math.min(100, Math.round((todayCollected / todayDue) * 100)) : 0;
  const activeLoans    = data?.stats?.active_loans     || 0;
  const completedLoans = data?.stats?.completed_loans  || 0;
  const totalLoans     = activeLoans + completedLoans;
  const avgLoan        = activeLoans > 0 ? Math.round(totalPrincipal / activeLoans) : 0;
  const interestTotal  = interestEarned + interestPending;
  const interestEarnedPct = interestTotal > 0 ? Math.round((interestEarned / interestTotal) * 100) : 0;
  const completionRate = totalLoans > 0 ? Math.round((completedLoans / totalLoans) * 100) : 0;

  // Capital & compounding metrics
  const totalOwnCapital   = capEntries.reduce((s, e) => s + e.amount, 0);
  const compoundedGrowth  = Math.max(0, totalPrincipal - totalOwnCapital);
  const roiPct            = totalOwnCapital > 0 ? (compoundedGrowth / totalOwnCapital) * 100 : 0;
  const capitalMultiplier = totalOwnCapital > 0 ? totalPrincipal / totalOwnCapital : 0;
  const ownPct            = totalPrincipal > 0 && totalOwnCapital > 0
    ? Math.min(100, Math.round((totalOwnCapital / totalPrincipal) * 100))
    : 100;
  const compPct = 100 - ownPct;

  // Month-over-month growth from last two months in chart data
  const momGrowth = (() => {
    if (chartData.length < 2) return null;
    const last = chartData[chartData.length - 1]?.amount || 0;
    const prev = chartData[chartData.length - 2]?.amount || 0;
    if (prev === 0) return null;
    return Math.round(((last - prev) / prev) * 100);
  })();

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
                { label: 'Interest Due',  value: fmt(interestPending), accent: false },
                { label: 'Int. Earned',   value: fmt(interestEarned),  accent: false },
                { label: 'Overdue pymts', value: String(overdueCount),  accent: overdueCount > 0 },
              ].map(({ label, value, accent }) => (
                <div key={label} className="rounded-xl px-3 py-2.5"
                  style={{ background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.15)' }}>
                  <p className="text-white/55 text-[10px] uppercase tracking-wide mb-1">{label}</p>
                  <p className={`font-black text-base leading-none ${accent ? 'text-red-300' : 'text-white'}`}>{value}</p>
                </div>
              ))}
            </div>

            {/* Recovery strip */}
            {totalPrincipal > 0 && (
              <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-white/55 text-[10px] uppercase tracking-wide">Completion rate</span>
                  <span className="text-white text-xs font-bold">{completionRate}% loans closed</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.12)' }}>
                  <div className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${completionRate}%`,
                      background: 'linear-gradient(90deg, #34d399, #10B981)',
                      boxShadow: '0 0 8px rgba(16,185,129,0.5)',
                    }} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Capital & Compounding ── */}
        <div className="card overflow-hidden"
          style={{ borderColor: compoundedGrowth > 0 ? 'rgba(16,185,129,0.25)' : 'rgba(139,92,246,0.2)' }}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 pt-4 pb-3"
            style={{ borderBottom: '1px solid var(--glass-border)' }}>
            <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text)' }}>
              <TrendingUp className="w-4 h-4" style={{ color: 'var(--green)' }} />
              Capital &amp; Compounding
            </h3>
            <button
              onClick={() => { setShowCapEdit(v => !v); setEditingCapId(null); setCapDate(''); setCapAmount(''); setCapNote(''); }}
              className="text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1"
              style={{ color: 'var(--purple)', background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)' }}>
              + Add Capital
            </button>
          </div>

          {/* Add / edit form */}
          {showCapEdit && (
            <div className="px-4 py-3 space-y-2.5" style={{ background: 'rgba(139,92,246,0.04)', borderBottom: '1px solid var(--glass-border)' }}>
              <p className="text-xs font-semibold" style={{ color: 'var(--purple)' }}>
                {editingCapId ? 'Edit entry' : 'New capital entry'}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] uppercase tracking-wide block mb-1" style={{ color: 'var(--muted-2)' }}>Date invested</label>
                  <input type="date" value={capDate} onChange={e => setCapDate(e.target.value)}
                    className="input py-2 text-sm w-full" />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wide block mb-1" style={{ color: 'var(--muted-2)' }}>Amount (₹)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: 'var(--muted)' }}>₹</span>
                    <input type="number" value={capAmount} onChange={e => setCapAmount(e.target.value)}
                      className="input pl-7 py-2 text-sm w-full" placeholder="300000" />
                  </div>
                </div>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wide block mb-1" style={{ color: 'var(--muted-2)' }}>Note (optional)</label>
                <input value={capNote} onChange={e => setCapNote(e.target.value)}
                  className="input py-2 text-sm w-full" placeholder="e.g. Initial investment, Reinvestment batch…" />
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setShowCapEdit(false); setEditingCapId(null); }}
                  className="btn-ghost flex-1 py-2 text-xs justify-center">Cancel</button>
                <button onClick={addCapEntry}
                  disabled={!capDate || !capAmount}
                  className="flex-1 py-2 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-1.5 disabled:opacity-40"
                  style={{ background: 'linear-gradient(135deg, var(--purple), var(--pink))' }}>
                  <Check className="w-3.5 h-3.5" strokeWidth={3} />
                  {editingCapId ? 'Update' : 'Add Entry'}
                </button>
              </div>
            </div>
          )}

          {/* Capital entries list */}
          {capEntries.length > 0 && (
            <div style={{ borderBottom: '1px solid var(--glass-border)' }}>
              {capEntries.map((e, i) => (
                <div key={e.id} className="flex items-center justify-between px-4 py-2.5"
                  style={{ borderBottom: i < capEntries.length - 1 ? '1px solid var(--glass-border)' : 'none' }}>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.2)' }}>
                      <IndianRupee className="w-3.5 h-3.5" style={{ color: 'var(--purple)' }} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{fmtFull(e.amount)}</p>
                      <p className="text-[11px]" style={{ color: 'var(--muted)' }}>
                        {new Date(e.date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        {e.note ? ` · ${e.note}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => startEdit(e)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-white/[0.06]"
                      style={{ color: 'var(--muted)' }}>
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button onClick={() => deleteCapEntry(e.id)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-red-500/10"
                      style={{ color: 'var(--muted)' }}>
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Metrics */}
          {totalOwnCapital > 0 ? (
            <div className="px-4 pt-4 pb-4 space-y-4">
              {/* Stacked ownership bar */}
              <div>
                <div className="flex items-center justify-between mb-2 text-[11px]" style={{ color: 'var(--muted)' }}>
                  <span>Own capital <strong style={{ color: 'var(--text)' }}>{ownPct}%</strong></span>
                  <span>Compounded <strong style={{ color: 'var(--green)' }}>{compPct}%</strong></span>
                </div>
                <div className="flex h-5 rounded-full overflow-hidden" style={{ gap: '2px' }}>
                  <div className="h-full flex items-center justify-center transition-all duration-700 rounded-l-full"
                    style={{
                      width: `${ownPct}%`,
                      background: 'linear-gradient(90deg, #7c3aed, #8b5cf6)',
                      boxShadow: '0 0 8px rgba(139,92,246,0.4)',
                    }}>
                    {ownPct >= 25 && <span className="text-[9px] font-bold text-white px-1">Yours</span>}
                  </div>
                  {compPct > 0 && (
                    <div className="h-full flex items-center justify-center transition-all duration-700 rounded-r-full"
                      style={{
                        width: `${compPct}%`,
                        background: 'linear-gradient(90deg, #059669, #10B981)',
                        boxShadow: '0 0 8px rgba(16,185,129,0.4)',
                      }}>
                      {compPct >= 15 && <span className="text-[9px] font-bold text-white px-1">Earned</span>}
                    </div>
                  )}
                </div>
              </div>

              {/* 4 KPI grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl p-3" style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.15)' }}>
                  <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: 'var(--muted-2)' }}>Own Capital</p>
                  <p className="text-lg font-black" style={{ color: 'var(--text)' }}>{fmt(totalOwnCapital)}</p>
                  <p className="text-[11px]" style={{ color: 'var(--muted)' }}>{fmtFull(totalOwnCapital)}</p>
                </div>
                <div className="rounded-xl p-3" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.15)' }}>
                  <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: 'var(--muted-2)' }}>Compounded</p>
                  <p className="text-lg font-black" style={{ color: compoundedGrowth > 0 ? 'var(--green)' : 'var(--muted)' }}>
                    +{fmt(compoundedGrowth)}
                  </p>
                  <p className="text-[11px]" style={{ color: 'var(--muted)' }}>{compoundedGrowth > 0 ? fmtFull(compoundedGrowth) : 'Not yet'}</p>
                </div>
                <div className="rounded-xl p-3" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.15)' }}>
                  <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: 'var(--muted-2)' }}>Return on Capital</p>
                  <p className="text-lg font-black" style={{ color: roiPct > 0 ? 'var(--amber)' : 'var(--muted)' }}>
                    {roiPct.toFixed(1)}%
                  </p>
                  <p className="text-[11px]" style={{ color: 'var(--muted)' }}>total ROI</p>
                </div>
                <div className="rounded-xl p-3" style={{ background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.15)' }}>
                  <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: 'var(--muted-2)' }}>Multiplier</p>
                  <p className="text-lg font-black" style={{ color: '#22d3ee' }}>
                    {capitalMultiplier > 0 ? capitalMultiplier.toFixed(2) : '—'}×
                  </p>
                  <p className="text-[11px]" style={{ color: 'var(--muted)' }}>capital growth</p>
                </div>
              </div>

              {/* Timeline */}
              {capEntries.length > 1 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wide mb-2" style={{ color: 'var(--muted-2)' }}>Investment timeline</p>
                  <div className="relative pl-4">
                    <div className="absolute left-1.5 top-0 bottom-0 w-px" style={{ background: 'rgba(139,92,246,0.3)' }} />
                    {capEntries.map((e, i) => {
                      const running = capEntries.slice(0, i + 1).reduce((s, x) => s + x.amount, 0);
                      return (
                        <div key={e.id} className="relative mb-3 last:mb-0">
                          <div className="absolute -left-[11px] w-3 h-3 rounded-full border-2"
                            style={{ background: 'var(--bg)', borderColor: 'var(--purple)', top: '3px' }} />
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="text-xs font-semibold" style={{ color: 'var(--text)' }}>
                                {fmtFull(e.amount)}
                                {e.note ? <span className="font-normal" style={{ color: 'var(--muted)' }}> · {e.note}</span> : ''}
                              </p>
                              <p className="text-[11px]" style={{ color: 'var(--muted)' }}>
                                {new Date(e.date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                              </p>
                            </div>
                            <span className="text-[11px] font-bold" style={{ color: 'var(--muted)' }}>
                              Σ {fmt(running)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                    <div className="relative mb-0">
                      <div className="absolute -left-[11px] w-3 h-3 rounded-full border-2"
                        style={{ background: 'var(--green)', borderColor: '#10B981', top: '3px', boxShadow: '0 0 6px rgba(16,185,129,0.6)' }} />
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-xs font-semibold" style={{ color: 'var(--green)' }}>Now (deployed)</p>
                          <p className="text-[11px]" style={{ color: 'var(--muted)' }}>incl. compounded returns</p>
                        </div>
                        <span className="text-[11px] font-bold" style={{ color: 'var(--green)' }}>{fmt(totalPrincipal)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="px-4 py-5 text-center">
              <div className="w-10 h-10 rounded-full mx-auto mb-2 flex items-center justify-center"
                style={{ background: 'rgba(139,92,246,0.12)' }}>
                <IndianRupee className="w-5 h-5" style={{ color: 'var(--purple)' }} />
              </div>
              <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>Track your capital growth</p>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
                Add your initial investments to see how much has been compounded from interest reinvestment.
              </p>
              <button onClick={() => setShowCapEdit(true)}
                className="mt-3 text-xs font-semibold px-3 py-1.5 rounded-lg"
                style={{ color: 'var(--purple)', background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)' }}>
                + Add first entry
              </button>
            </div>
          )}
        </div>

        {/* ── Today's Snapshot ── */}
        {(todayDue > 0 || todayCollected > 0) && (() => {
          const sz = 84, sw = 10, r = (sz - sw) / 2, circ = 2 * Math.PI * r;
          const filled = (todayPct / 100) * circ;
          const color = todayPct >= 100 ? '#10B981' : todayPct >= 60 ? '#f59e0b' : '#8b5cf6';
          return (
            <div className="card p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text)' }}>
                  <Target className="w-4 h-4" style={{ color: 'var(--amber)' }} />
                  Today&apos;s Collections
                </h3>
                <Link href="/collect"
                  className="text-xs font-semibold flex items-center gap-0.5 px-2.5 py-1 rounded-lg transition-colors"
                  style={{ color: 'var(--purple)', background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)' }}>
                  Collect <ArrowUpRight className="w-3 h-3" />
                </Link>
              </div>
              <div className="flex items-center gap-4">
                {/* SVG ring */}
                <div className="relative flex-shrink-0">
                  <svg width={sz} height={sz} className="-rotate-90">
                    <circle cx={sz/2} cy={sz/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={sw} />
                    {todayPct > 0 && (
                      <circle cx={sz/2} cy={sz/2} r={r} fill="none"
                        stroke={color} strokeWidth={sw} strokeLinecap="round"
                        strokeDasharray={`${Math.min(filled, circ)} ${circ}`}
                        style={{ filter: `drop-shadow(0 0 6px ${color}80)`, transition: 'stroke-dasharray 0.7s ease' }} />
                    )}
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <p className="text-lg font-black leading-none" style={{ color }}>{todayPct}%</p>
                    <p className="text-[9px] uppercase tracking-wide mt-0.5" style={{ color: 'var(--muted)' }}>done</p>
                  </div>
                </div>
                {/* Stats */}
                <div className="flex-1 min-w-0 space-y-2.5">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted-2)' }}>Collected</p>
                    <p className="text-xl font-black leading-tight" style={{ color: todayCollected > 0 ? 'var(--green)' : 'var(--muted)' }}>
                      {fmtFull(todayCollected)}
                    </p>
                  </div>
                  <div className="h-px" style={{ background: 'var(--glass-border)' }} />
                  <div>
                    <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted-2)' }}>Expected today</p>
                    <p className="text-base font-bold leading-tight" style={{ color: 'var(--text)' }}>
                      {fmtFull(todayDue)}
                    </p>
                  </div>
                </div>
              </div>
              {todayPct >= 100 && (
                <div className="mt-3 flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-xl"
                  style={{ background: 'rgba(16,185,129,0.1)', color: 'var(--green)', border: '1px solid rgba(16,185,129,0.2)' }}>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  All collections done for today! 🎉
                </div>
              )}
            </div>
          );
        })()}

        {/* ── 4-stat mini grid ── */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { icon: Users,        label: 'Borrowers',   value: data?.stats?.total_customers || 0, color: 'var(--purple)', bg: 'rgba(139,92,246,0.15)', border: 'rgba(139,92,246,0.2)', isFmt: false },
            { icon: Activity,     label: 'Active Loans', value: activeLoans,                       color: 'var(--green)',  bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.2)',  isFmt: false },
            { icon: CheckCircle2, label: 'Completed',   value: completedLoans,                    color: '#60a5fa',      bg: 'rgba(96,165,250,0.12)', border: 'rgba(96,165,250,0.2)',  isFmt: false },
            { icon: IndianRupee,  label: 'Avg Loan',    value: avgLoan,                            color: 'var(--amber)', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.2)',  isFmt: true  },
          ].map(({ icon: Icon, label, value, color, bg, border, isFmt }) => (
            <div key={label} className="card p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: bg, border: `1px solid ${border}` }}>
                <Icon className="w-5 h-5" style={{ color }} />
              </div>
              <div className="min-w-0">
                <p className="text-xl font-black truncate" style={{ color: 'var(--text)' }}>
                  {isFmt ? fmt(value as number) : value}
                </p>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>{label}</p>
              </div>
            </div>
          ))}
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

        {/* ── Interest Income Funnel ── */}
        {interestTotal > 0 && (
          <div className="card p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text)' }}>
                <Banknote className="w-4 h-4" style={{ color: 'var(--amber)' }} />
                Interest Income
              </h3>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold px-2 py-0.5 rounded-lg"
                  style={{
                    background: interestEarnedPct >= 80 ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
                    color:      interestEarnedPct >= 80 ? 'var(--green)' : '#fbbf24',
                    border:     `1px solid ${interestEarnedPct >= 80 ? 'rgba(16,185,129,0.25)' : 'rgba(245,158,11,0.2)'}`,
                  }}>
                  {interestEarnedPct}% collected
                </span>
              </div>
            </div>

            {/* Segmented bar */}
            <div className="h-4 rounded-full overflow-hidden flex mb-3" style={{ background: 'var(--glass-bg-2)' }}>
              {interestEarned > 0 && (
                <div className="h-full transition-all duration-700 relative"
                  style={{
                    width: `${interestEarnedPct}%`,
                    background: 'linear-gradient(90deg, #10B981, #34d399)',
                    boxShadow: '0 0 10px rgba(16,185,129,0.4)',
                  }}>
                  {interestEarnedPct >= 20 && (
                    <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-white">
                      Earned
                    </span>
                  )}
                </div>
              )}
              {interestPending > 0 && (
                <div className="h-full transition-all duration-700 relative"
                  style={{
                    width: `${100 - interestEarnedPct}%`,
                    background: 'linear-gradient(90deg, rgba(245,158,11,0.45), rgba(245,158,11,0.25))',
                    border: '1px solid rgba(245,158,11,0.3)',
                  }}>
                  {(100 - interestEarnedPct) >= 20 && (
                    <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold" style={{ color: '#fbbf24' }}>
                      Pending
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Two stat columns */}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-1">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="w-2 h-2 rounded-full" style={{ background: '#10B981', boxShadow: '0 0 4px #10B981' }} />
                  <span className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted-2)' }}>Earned</span>
                </div>
                <p className="text-base font-black" style={{ color: 'var(--green)' }}>{fmt(interestEarned)}</p>
                <p className="text-[10px]" style={{ color: 'var(--muted)' }}>{fmtFull(interestEarned)}</p>
              </div>
              <div className="col-span-1">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="w-2 h-2 rounded-full" style={{ background: '#f59e0b' }} />
                  <span className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted-2)' }}>Pending</span>
                </div>
                <p className="text-base font-black" style={{ color: 'var(--amber)' }}>{fmt(interestPending)}</p>
                <p className="text-[10px]" style={{ color: 'var(--muted)' }}>{fmtFull(interestPending)}</p>
              </div>
              <div className="col-span-1">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="w-2 h-2 rounded-full" style={{ background: 'var(--purple)' }} />
                  <span className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted-2)' }}>Total</span>
                </div>
                <p className="text-base font-black" style={{ color: 'var(--text)' }}>{fmt(interestTotal)}</p>
                <p className="text-[10px]" style={{ color: 'var(--muted)' }}>{fmtFull(interestTotal)}</p>
              </div>
            </div>
          </div>
        )}

        {/* ── Portfolio Health ── */}
        {totalLoans > 0 && (
          <div className="card p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text)' }}>
                <TrendingUp className="w-4 h-4" style={{ color: '#60a5fa' }} />
                Portfolio Health
              </h3>
              <span className="text-xs" style={{ color: 'var(--muted)' }}>{totalLoans} total loans</span>
            </div>
            <div className="space-y-2.5">
              {([
                { label: 'Active',     val: activeLoans,    total: totalLoans, color: '#8b5cf6', bg: 'rgba(139,92,246,0.18)', suffix: '' },
                { label: 'Completed',  val: completedLoans, total: totalLoans, color: '#10B981', bg: 'rgba(16,185,129,0.15)', suffix: '' },
                { label: 'Overdue ℗',  val: overdueCount,   total: Math.max(overdueCount, activeLoans), color: '#fb7185', bg: 'rgba(244,63,94,0.15)', suffix: ' pymts' },
              ]).map(({ label, val, total, color, bg, suffix }) => {
                const pct = total > 0 ? Math.round((val / total) * 100) : 0;
                return (
                  <div key={label}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-semibold flex items-center gap-2" style={{ color: 'var(--text)' }}>
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color, boxShadow: `0 0 4px ${color}` }} />
                        {label}
                      </span>
                      <span className="text-xs font-bold" style={{ color }}>
                        {val}{suffix ?? ''} <span className="font-normal" style={{ color: 'var(--muted)' }}>({pct}%)</span>
                      </span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--glass-bg-2)' }}>
                      <div className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${pct}%`, background: bg, border: `1px solid ${color}40` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

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
                  showWa
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
              <div className="flex items-center gap-2">
                {momGrowth !== null && (
                  <span className="text-xs font-bold px-2 py-0.5 rounded-lg flex items-center gap-1"
                    style={{
                      background: momGrowth >= 0 ? 'rgba(16,185,129,0.15)' : 'rgba(244,63,94,0.15)',
                      color:      momGrowth >= 0 ? 'var(--green)' : 'var(--red)',
                      border:     `1px solid ${momGrowth >= 0 ? 'rgba(16,185,129,0.25)' : 'rgba(244,63,94,0.25)'}`,
                    }}>
                    {momGrowth >= 0
                      ? <TrendingUp className="w-3 h-3" />
                      : <TrendingDown className="w-3 h-3" />}
                    {momGrowth >= 0 ? '+' : ''}{momGrowth}% MoM
                  </span>
                )}
                <span className="text-xs" style={{ color: 'var(--muted)' }}>
                  {chartData.length}mo
                </span>
              </div>
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
