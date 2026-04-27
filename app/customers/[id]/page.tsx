'use client';
import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Phone, MapPin, FileText, Plus, ChevronRight,
  Wallet, TrendingUp, AlertTriangle, CheckCircle2, Calendar,
  CreditCard, Zap, MessageCircle, Loader2,
} from 'lucide-react';

interface Customer {
  id: string; name: string; phone: string; address: string; notes: string;
}
interface LoanSummary {
  id: string; principal: number; planType: 'weekly' | 'daily';
  periodAmount: number; totalPeriods: number; paidPeriods: number;
  startDate: string; endDate: string; status: string;
  interestAmount: number; interestCollected: boolean;
  totalExpected: number; totalPaid: number; outstanding: number;
  overdueCount: number; overdueAmount: number; dueTodayAmount: number;
  progress: number;
}
interface Summary {
  totalLoans: number; activeLoans: number; completedLoans: number;
  totalPrincipal: number; totalInterest: number; totalExpected: number;
  totalPaid: number; outstanding: number; overdueCount: number;
  overdueAmount: number; dueTodayAmount: number; dueThisWeekAmount: number;
  progress: number;
  nextDue: { loanId: string; dueDate: string; amount: number; periodNumber: number } | null;
}
interface DueToday {
  loanId: string; paymentId: string; periodNumber: number;
  planType: 'weekly' | 'daily'; amount: number; expectedAmount: number;
}
interface Data {
  customer: Customer;
  summary: Summary;
  loans: LoanSummary[];
  dueTodayList: DueToday[];
}

function fmt(n: number) {
  const v = n || 0;
  if (v >= 100000) return '₹' + (v / 100000).toFixed(1) + 'L';
  if (v >= 1000) return '₹' + (v / 1000).toFixed(1) + 'K';
  return '₹' + v.toLocaleString('en-IN');
}
function fmtFull(n: number) { return '₹' + (n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 }); }
function fmtDate(s: string) {
  if (!s) return '—';
  return new Date(s + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Radial / donut ring — SVG
function Donut({ progress, size = 120, stroke = 10, color = 'var(--purple)' }: {
  progress: number; size?: number; stroke?: number; color?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (progress / 100) * c;
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={offset}
        style={{ filter: `drop-shadow(0 0 8px ${color})`, transition: 'stroke-dashoffset 1s ease-out' }} />
    </svg>
  );
}

export default function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/customers/${id}/summary`)
      .then(r => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--purple)' }} />
      </div>
    );
  }

  if (!data || !data.customer) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <p style={{ color: 'var(--muted)' }}>Borrower not found</p>
      </div>
    );
  }

  const { customer, summary, loans, dueTodayList } = data;
  const dueTodayTotal = dueTodayList.reduce((s, d) => s + d.amount, 0);
  const activePrincipal = loans.filter(l => l.status === 'active').reduce((s, l) => s + l.principal, 0);
  const dailyCount = loans.filter(l => l.planType === 'daily' && l.status === 'active').length;
  const weeklyCount = loans.filter(l => l.planType === 'weekly' && l.status === 'active').length;
  const waPhone = customer.phone
    ? customer.phone.replace(/\D/g, '').replace(/^0/, '').replace(/^(?!91)/, '91')
    : null;
  const waMessage = (() => {
    const firstName = customer.name.split(' ')[0] || customer.name;
    if (summary.overdueAmount > 0) {
      return `Hi ${firstName}, you have overdue payments totaling ₹${summary.overdueAmount.toLocaleString('en-IN')}. Please clear at the earliest. 🙏`;
    }
    if (summary.dueTodayAmount > 0) {
      return `Hi ${firstName}, your payment of ₹${summary.dueTodayAmount.toLocaleString('en-IN')} is due today. Please pay at your earliest convenience. 🙏`;
    }
    return `Hi ${firstName}, please ensure your upcoming payments are on time. Thank you! 🙏`;
  })();
  const whatsappUrl = waPhone ? `https://wa.me/${waPhone}?text=${encodeURIComponent(waMessage)}` : null;

  return (
    <div className="pb-28 min-h-screen" style={{ background: 'var(--bg)' }}>

      {/* Top bar */}
      <div className="sticky top-0 z-20 px-4 py-3 flex items-center gap-3"
        style={{ background: 'rgba(10,10,15,0.85)', backdropFilter: 'blur(20px)', borderBottom: '1px solid var(--glass-border)' }}>
        <Link href="/customers"
          className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{ background: 'var(--glass-bg-2)', border: '1px solid var(--glass-border)' }}>
          <ArrowLeft className="w-4 h-4" style={{ color: 'var(--text)' }} />
        </Link>
        <div className="flex-1 min-w-0">
          <p className="text-xs" style={{ color: 'var(--muted)' }}>Borrower</p>
          <h1 className="text-base font-bold truncate" style={{ color: 'var(--text)' }}>{customer.name}</h1>
        </div>
        {whatsappUrl && (
          <a href={whatsappUrl} target="_blank" rel="noreferrer"
            className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.25)' }}>
            <MessageCircle className="w-4 h-4" style={{ color: 'var(--green)' }} />
          </a>
        )}
      </div>

      <div className="p-4 space-y-4">

        {/* ── Hero profile ── */}
        <div className="relative rounded-2xl p-5 overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, #4c1d95 0%, #6d28d9 50%, #7c3aed 100%)',
            boxShadow: '0 8px 32px rgba(109,40,217,0.4)',
            border: '1px solid rgba(139,92,246,0.3)',
          }}>
          <div className="absolute inset-0 pointer-events-none" style={{
            backgroundImage: 'radial-gradient(circle at 90% -20%, rgba(236,72,153,0.4) 0%, transparent 55%), radial-gradient(circle at 0% 100%, rgba(6,182,212,0.25) 0%, transparent 50%)',
          }} />
          <div className="relative flex items-center gap-4">
            <div className="flex items-center justify-center font-black text-2xl text-white flex-shrink-0"
              style={{
                width: 64, height: 64, borderRadius: 18,
                background: 'rgba(255,255,255,0.15)',
                backdropFilter: 'blur(12px)',
                border: '1px solid rgba(255,255,255,0.25)',
              }}>
              {customer.name[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] uppercase tracking-widest text-white/60 mb-0.5">Total Outstanding</p>
              <p className="text-3xl font-black text-white leading-none">{fmt(summary.outstanding)}</p>
              <p className="text-xs text-white/60 mt-1">
                {summary.activeLoans} active · {summary.completedLoans} completed
              </p>
            </div>
          </div>

          {(customer.phone || customer.address) && (
            <div className="relative mt-4 flex items-center gap-4 flex-wrap">
              {customer.phone && (
                <span className="text-xs text-white/80 flex items-center gap-1.5">
                  <Phone className="w-3 h-3" />{customer.phone}
                </span>
              )}
              {customer.address && (
                <span className="text-xs text-white/80 flex items-center gap-1.5">
                  <MapPin className="w-3 h-3" />{customer.address}
                </span>
              )}
            </div>
          )}
        </div>

        {customer.notes && (
          <div className="card p-3 flex items-start gap-2"
            style={{ borderColor: 'rgba(245,158,11,0.2)', background: 'rgba(245,158,11,0.05)' }}>
            <FileText className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: 'var(--amber)' }} />
            <p className="text-xs" style={{ color: '#fbbf24' }}>{customer.notes}</p>
          </div>
        )}

        {/* ── Due today — highlight card ── */}
        {dueTodayList.length > 0 && (
          <div className="card overflow-hidden"
            style={{ borderColor: 'rgba(244,63,94,0.3)', background: 'linear-gradient(135deg, rgba(244,63,94,0.08), rgba(236,72,153,0.05))' }}>
            <div className="flex items-center justify-between px-4 py-3"
              style={{ borderBottom: '1px solid rgba(244,63,94,0.15)' }}>
              <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text)' }}>
                <Zap className="w-4 h-4" style={{ color: 'var(--red)' }} />
                Due Today
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold"
                  style={{ background: 'rgba(244,63,94,0.2)', color: '#fb7185' }}>
                  {dueTodayList.length}
                </span>
              </h3>
              <p className="text-base font-black" style={{ color: 'var(--red)' }}>{fmtFull(dueTodayTotal)}</p>
            </div>
            {dueTodayList.map(d => (
              <Link key={d.paymentId} href={`/loans/${d.loanId}`}
                className="flex items-center justify-between px-4 py-2.5 border-b last:border-0 hover:bg-white/[0.03]"
                style={{ borderColor: 'rgba(244,63,94,0.08)' }}>
                <div className="flex items-center gap-2">
                  <CreditCard className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
                  <span className="text-xs font-medium" style={{ color: 'var(--text)' }}>
                    {d.planType === 'daily' ? `Day ${d.periodNumber}` : `Wk ${d.periodNumber}`}
                  </span>
                </div>
                <span className="text-sm font-bold" style={{ color: 'var(--text)' }}>{fmtFull(d.amount)}</span>
              </Link>
            ))}
          </div>
        )}

        {/* ── Stats + Donut grid ── */}
        <div className="grid grid-cols-5 gap-3">
          {/* Donut card */}
          <div className="col-span-2 card p-4 flex flex-col items-center justify-center">
            <div className="relative">
              <Donut progress={summary.progress} size={100} stroke={10}
                color={summary.progress === 100 ? 'var(--green)' : 'var(--purple)'} />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-xl font-black leading-none" style={{ color: 'var(--text)' }}>{summary.progress}%</p>
                <p className="text-[10px] mt-0.5" style={{ color: 'var(--muted)' }}>Repaid</p>
              </div>
            </div>
            <p className="text-[11px] mt-2" style={{ color: 'var(--muted)' }}>
              {fmt(summary.totalPaid)} / {fmt(summary.totalExpected)}
            </p>
          </div>

          {/* Stat stack */}
          <div className="col-span-3 grid grid-cols-2 gap-2.5">
            <div className="card p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Wallet className="w-3 h-3" style={{ color: 'var(--purple)' }} />
                <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Capital</p>
              </div>
              <p className="text-base font-black" style={{ color: 'var(--text)' }}>{fmt(activePrincipal)}</p>
            </div>
            <div className="card p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <TrendingUp className="w-3 h-3" style={{ color: 'var(--green)' }} />
                <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Interest</p>
              </div>
              <p className="text-base font-black" style={{ color: 'var(--text)' }}>{fmt(summary.totalInterest)}</p>
            </div>
            <div className="card p-3" style={{ borderColor: summary.overdueCount > 0 ? 'rgba(244,63,94,0.25)' : undefined }}>
              <div className="flex items-center gap-1.5 mb-1">
                <AlertTriangle className="w-3 h-3" style={{ color: summary.overdueCount > 0 ? 'var(--red)' : 'var(--muted)' }} />
                <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Overdue</p>
              </div>
              <p className="text-base font-black"
                style={{ color: summary.overdueCount > 0 ? 'var(--red)' : 'var(--text)' }}>
                {summary.overdueCount}
              </p>
            </div>
            <div className="card p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Calendar className="w-3 h-3" style={{ color: 'var(--amber)' }} />
                <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Week</p>
              </div>
              <p className="text-base font-black" style={{ color: 'var(--text)' }}>{fmt(summary.dueThisWeekAmount)}</p>
            </div>
          </div>
        </div>

        {/* ── Plan split pill ── */}
        {(dailyCount + weeklyCount) > 0 && (
          <div className="card p-3 flex items-center gap-3">
            <div className="flex-1 h-2 rounded-full overflow-hidden flex" style={{ background: 'var(--glass-bg-2)' }}>
              {dailyCount > 0 && (
                <div style={{
                  width: `${(dailyCount / (dailyCount + weeklyCount)) * 100}%`,
                  background: 'linear-gradient(90deg, #06b6d4, #0ea5e9)',
                }} />
              )}
              {weeklyCount > 0 && (
                <div style={{
                  width: `${(weeklyCount / (dailyCount + weeklyCount)) * 100}%`,
                  background: 'linear-gradient(90deg, #8b5cf6, #ec4899)',
                }} />
              )}
            </div>
            <div className="flex items-center gap-3 text-[11px]" style={{ color: 'var(--muted)' }}>
              {dailyCount > 0 && (
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full" style={{ background: '#06b6d4' }} />
                  {dailyCount} Daily
                </span>
              )}
              {weeklyCount > 0 && (
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full" style={{ background: '#8b5cf6' }} />
                  {weeklyCount} Weekly
                </span>
              )}
            </div>
          </div>
        )}

        {/* ── Action buttons ── */}
        <div className="grid grid-cols-2 gap-3">
          <Link href={`/loans/new?customerId=${id}`} className="btn-primary justify-center py-3 text-sm">
            <Plus className="w-4 h-4" /> New Loan
          </Link>
          <Link href={`/loans?customer_id=${id}`} className="btn-ghost justify-center py-3 text-sm">
            <CreditCard className="w-4 h-4" /> All Loans
          </Link>
        </div>

        {/* ── Loans list ── */}
        <div className="card overflow-hidden">
          <div className="px-4 py-3 flex items-center justify-between"
            style={{ borderBottom: '1px solid var(--glass-border)' }}>
            <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text)' }}>
              <CreditCard className="w-4 h-4" style={{ color: 'var(--purple)' }} />
              Loans ({loans.length})
            </h3>
          </div>
          {loans.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm" style={{ color: 'var(--muted)' }}>No loans yet</p>
              <Link href={`/loans/new?customerId=${id}`}
                className="btn-primary mx-auto mt-4 text-sm inline-flex">
                <Plus className="w-4 h-4" /> Create first loan
              </Link>
            </div>
          ) : (
            loans.map((l, i) => {
              const statusColor =
                l.status === 'completed' ? 'var(--green)' :
                l.status === 'defaulted' ? 'var(--red)' :
                l.overdueCount > 0 ? 'var(--red)' :
                l.dueTodayAmount > 0 ? 'var(--amber)' : 'var(--purple)';
              const statusBg =
                l.status === 'completed' ? 'rgba(16,185,129,0.12)' :
                l.status === 'defaulted' ? 'rgba(244,63,94,0.12)' :
                l.overdueCount > 0 ? 'rgba(244,63,94,0.1)' :
                l.dueTodayAmount > 0 ? 'rgba(245,158,11,0.1)' : 'rgba(139,92,246,0.1)';
              const statusLabel =
                l.status === 'completed' ? 'Completed' :
                l.status === 'defaulted' ? 'Defaulted' :
                l.overdueCount > 0 ? `${l.overdueCount} overdue` :
                l.dueTodayAmount > 0 ? 'Due today' : 'On track';
              return (
                <Link key={l.id} href={`/loans/${l.id}`}
                  className="block px-4 py-3.5 border-b last:border-0 hover:bg-white/[0.03] transition-colors"
                  style={{ borderColor: 'var(--glass-border)' }}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold" style={{ color: 'var(--muted-2)' }}>#{loans.length - i}</span>
                      <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{fmtFull(l.principal)}</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide"
                        style={{
                          background: l.planType === 'daily' ? 'rgba(6,182,212,0.15)' : 'rgba(139,92,246,0.15)',
                          color: l.planType === 'daily' ? '#22d3ee' : '#a78bfa',
                        }}>
                        {l.planType}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                        style={{ background: statusBg, color: statusColor, border: `1px solid ${statusBg}` }}>
                        {statusLabel}
                      </span>
                      <ChevronRight className="w-3.5 h-3.5" style={{ color: 'var(--muted-2)' }} />
                    </div>
                  </div>

                  {/* Progress */}
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--glass-bg-2)' }}>
                      <div className="h-full transition-all duration-700"
                        style={{
                          width: `${l.progress}%`,
                          background: l.status === 'completed'
                            ? 'linear-gradient(90deg, var(--green), #34d399)'
                            : l.overdueCount > 0
                              ? 'linear-gradient(90deg, var(--red), #fb7185)'
                              : 'linear-gradient(90deg, var(--purple), var(--pink))',
                          boxShadow: `0 0 8px ${statusColor}`,
                        }} />
                    </div>
                    <span className="text-xs font-bold" style={{ color: statusColor }}>{l.progress}%</span>
                  </div>

                  <div className="flex items-center justify-between text-[11px]" style={{ color: 'var(--muted)' }}>
                    <span>{l.paidPeriods}/{l.totalPeriods} {l.planType === 'daily' ? 'days' : 'weeks'}</span>
                    <span>
                      {l.status === 'active'
                        ? <>Outstanding: <strong style={{ color: 'var(--text)' }}>{fmt(l.outstanding)}</strong></>
                        : <>Started {fmtDate(l.startDate)}</>}
                    </span>
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
