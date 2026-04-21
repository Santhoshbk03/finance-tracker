'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import Header from '@/components/layout/Header';
import {
  FileDown, FileText, Calendar, CalendarRange, Send,
  ClipboardList, Loader2, CheckCircle2, AlertTriangle,
  Zap, Phone, ChevronDown, ChevronUp, Users, TrendingUp,
} from 'lucide-react';

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function daysAgoStr(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

type FlashKind = 'ok' | 'err';

interface TodayRow {
  customerId: string;
  customerName: string;
  customerPhone: string;
  loans: {
    loanId: string; paymentId: string;
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
}
interface TodayData {
  date: string;
  rows: TodayRow[];
  summary: {
    totalBorrowers: number;
    totalPayments: number;
    totalDue: number;
    totalPaid: number;
    totalOutstanding: number;
  };
}

function fmtFull(n: number) {
  return '₹' + (n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}
function fmtShort(n: number) {
  const v = n || 0;
  if (v >= 100000) return '₹' + (v / 100000).toFixed(1) + 'L';
  if (v >= 1000) return '₹' + (v / 1000).toFixed(1) + 'K';
  return '₹' + v.toLocaleString('en-IN');
}

export default function ReportsPage() {
  const [todayDate, setTodayDate] = useState(todayStr());
  const [dailyDate, setDailyDate] = useState(todayStr());
  const [weekStart, setWeekStart] = useState(daysAgoStr(6));
  const [weekEnd, setWeekEnd] = useState(todayStr());
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ kind: FlashKind; msg: string } | null>(null);
  const [todayData, setTodayData] = useState<TodayData | null>(null);
  const [loadingToday, setLoadingToday] = useState(true);
  const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null);

  useEffect(() => {
    setLoadingToday(true);
    fetch(`/api/reports/today-list?date=${todayDate}`)
      .then(r => r.json())
      .then(setTodayData)
      .catch(console.error)
      .finally(() => setLoadingToday(false));
  }, [todayDate]);

  const flashFor = (kind: FlashKind, msg: string) => {
    setFlash({ kind, msg });
    setTimeout(() => setFlash(null), 4000);
  };

  const download = async (url: string, filename: string, key: string) => {
    setBusy(key);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
      flashFor('ok', 'Downloaded');
    } catch (e) {
      flashFor('err', (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const view = (url: string) => window.open(url, '_blank');

  const triggerCron = async (path: string, key: string) => {
    if (!confirm('Manually run this job now? It will send WhatsApp to admin.')) return;
    setBusy(key);
    try {
      const secret = prompt('Enter CRON_SECRET (one-time):');
      if (!secret) { setBusy(null); return; }
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'x-cron-secret': secret },
      });
      const data = await res.json();
      if (res.ok && data.ok) flashFor('ok', 'Job dispatched');
      else flashFor('err', data.error || 'Failed');
    } catch (e) {
      flashFor('err', (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="pb-28 min-h-screen" style={{ background: 'var(--bg)' }}>
      <Header title="Reports" />

      <div className="p-4 space-y-4">

        {flash && (
          <div className="fade-up card p-3 flex items-center gap-2 text-sm"
            style={{
              borderColor: flash.kind === 'ok' ? 'rgba(16,185,129,0.3)' : 'rgba(244,63,94,0.3)',
              background: flash.kind === 'ok' ? 'rgba(16,185,129,0.08)' : 'rgba(244,63,94,0.08)',
            }}>
            {flash.kind === 'ok'
              ? <CheckCircle2 className="w-4 h-4" style={{ color: 'var(--green)' }} />
              : <AlertTriangle className="w-4 h-4" style={{ color: 'var(--red)' }} />}
            <span style={{ color: 'var(--text)' }}>{flash.msg}</span>
          </div>
        )}

        {/* Intro */}
        <div className="card p-4">
          <p className="section-label mb-1">Automated</p>
          <p className="text-sm" style={{ color: 'var(--text)' }}>
            Daily reports auto-send to your WhatsApp at <b>9 PM IST</b>. Weekly report goes out <b>Sunday 8 PM IST</b>. You can also generate & download any report below.
          </p>
        </div>

        {/* ── Who Pays Today — Live ───────────────────── */}
        <div className="card overflow-hidden"
          style={{ borderColor: 'rgba(139,92,246,0.3)' }}>
          {/* Hero strip */}
          <div className="relative p-4 overflow-hidden"
            style={{
              background: 'linear-gradient(135deg, rgba(139,92,246,0.15), rgba(236,72,153,0.12))',
              borderBottom: '1px solid rgba(139,92,246,0.2)',
            }}>
            <div className="absolute inset-0 pointer-events-none" style={{
              backgroundImage: 'radial-gradient(circle at 90% 0%, rgba(236,72,153,0.25), transparent 55%)',
            }} />
            <div className="relative flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{ background: 'rgba(139,92,246,0.2)', border: '1px solid rgba(139,92,246,0.3)' }}>
                  <Zap className="w-4 h-4" style={{ color: 'var(--purple)' }} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Who Pays Today</h3>
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>
                    {new Date(todayDate + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'short' })}
                  </p>
                </div>
              </div>
              {loadingToday ? (
                <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--muted)' }} />
              ) : todayData && (
                <div className="text-right">
                  <p className="text-lg font-black" style={{ color: 'var(--text)' }}>
                    {fmtShort(todayData.summary.totalDue)}
                  </p>
                  <p className="text-[11px]" style={{ color: 'var(--muted)' }}>
                    to collect
                  </p>
                </div>
              )}
            </div>

            {todayData && todayData.summary.totalPayments > 0 && (
              <div className="relative grid grid-cols-3 gap-2 mt-3">
                <div className="rounded-lg px-2.5 py-1.5"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
                    <Users className="w-2.5 h-2.5" /> Borrowers
                  </div>
                  <p className="text-base font-black" style={{ color: 'var(--text)' }}>{todayData.summary.totalBorrowers}</p>
                </div>
                <div className="rounded-lg px-2.5 py-1.5"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
                    <ClipboardList className="w-2.5 h-2.5" /> Payments
                  </div>
                  <p className="text-base font-black" style={{ color: 'var(--text)' }}>{todayData.summary.totalPayments}</p>
                </div>
                <div className="rounded-lg px-2.5 py-1.5"
                  style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.15)' }}>
                  <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
                    <TrendingUp className="w-2.5 h-2.5" /> Paid
                  </div>
                  <p className="text-base font-black" style={{ color: 'var(--green)' }}>{fmtShort(todayData.summary.totalPaid)}</p>
                </div>
              </div>
            )}
          </div>

          {/* Borrower list */}
          {loadingToday ? (
            <div className="p-8 flex justify-center">
              <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--purple)' }} />
            </div>
          ) : !todayData || todayData.rows.length === 0 ? (
            <div className="p-8 text-center">
              <CheckCircle2 className="w-10 h-10 mx-auto mb-2" style={{ color: 'var(--green)' }} />
              <p className="text-sm font-semibold" style={{ color: 'var(--green)' }}>Nothing due</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>No payments scheduled for this date</p>
            </div>
          ) : (
            <div className="max-h-[420px] overflow-y-auto">
              {todayData.rows.map((row, idx) => {
                const isOpen = expandedCustomer === row.customerId;
                const paidPct = row.totalDue + row.totalPaidToday > 0
                  ? Math.round((row.totalPaidToday / (row.totalDue + row.totalPaidToday)) * 100)
                  : 0;
                return (
                  <div key={row.customerId} className="border-b last:border-0"
                    style={{ borderColor: 'var(--glass-border)' }}>
                    <button onClick={() => setExpandedCustomer(isOpen ? null : row.customerId)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03] transition-colors text-left">
                      <span className="text-[11px] font-bold flex-shrink-0 w-5" style={{ color: 'var(--muted-2)' }}>
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                      <div className="avatar flex-shrink-0 text-xs font-bold" style={{ width: 34, height: 34 }}>
                        {row.customerName[0]?.toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{row.customerName}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[11px]" style={{ color: 'var(--muted)' }}>
                            {row.count} payment{row.count > 1 ? 's' : ''}
                          </span>
                          {row.customerPhone && (
                            <span className="text-[11px] flex items-center gap-0.5" style={{ color: 'var(--muted)' }}>
                              <Phone className="w-2.5 h-2.5" />{row.customerPhone}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-black"
                          style={{ color: row.totalDue > 0 ? 'var(--text)' : 'var(--green)' }}>
                          {fmtFull(row.totalDue)}
                        </p>
                        {row.totalPaidToday > 0 && (
                          <p className="text-[10px] font-semibold" style={{ color: 'var(--green)' }}>
                            +{fmtShort(row.totalPaidToday)} paid
                          </p>
                        )}
                      </div>
                      {isOpen
                        ? <ChevronUp className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--muted-2)' }} />
                        : <ChevronDown className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--muted-2)' }} />}
                    </button>

                    {/* Progress pill under name */}
                    {(row.totalDue > 0 || row.totalPaidToday > 0) && (
                      <div className="px-4 pb-2 -mt-1 flex items-center gap-2">
                        <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'var(--glass-bg-2)' }}>
                          <div className="h-full transition-all duration-500"
                            style={{
                              width: `${paidPct}%`,
                              background: paidPct === 100
                                ? 'linear-gradient(90deg, var(--green), #34d399)'
                                : 'linear-gradient(90deg, var(--purple), var(--pink))',
                            }} />
                        </div>
                        <span className="text-[10px] font-bold" style={{ color: paidPct === 100 ? 'var(--green)' : 'var(--muted)' }}>
                          {paidPct}%
                        </span>
                      </div>
                    )}

                    {/* Expanded detail */}
                    {isOpen && (
                      <div className="px-4 pb-3 space-y-1.5"
                        style={{ background: 'rgba(139,92,246,0.03)' }}>
                        {row.loans.map(l => {
                          const isPaid = l.amountDue === 0;
                          return (
                            <Link key={l.paymentId} href={`/loans/${l.loanId}`}
                              className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-white/[0.04] transition-colors"
                              style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--glass-border)' }}>
                              <div className="flex items-center gap-2">
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase"
                                  style={{
                                    background: l.planType === 'daily' ? 'rgba(6,182,212,0.12)' : 'rgba(139,92,246,0.12)',
                                    color: l.planType === 'daily' ? '#22d3ee' : '#a78bfa',
                                  }}>
                                  {l.planType === 'daily' ? 'DAILY' : 'WKLY'}
                                </span>
                                <span className="text-xs font-medium" style={{ color: 'var(--text)' }}>
                                  {l.planType === 'daily' ? `Day ${l.periodNumber}` : `Wk ${l.periodNumber}`}
                                </span>
                                <span className="text-[10px]" style={{ color: 'var(--muted-2)' }}>
                                  · {fmtShort(l.principal)} loan
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                {isPaid
                                  ? <CheckCircle2 className="w-3 h-3" style={{ color: 'var(--green)' }} />
                                  : null}
                                <span className="text-xs font-bold"
                                  style={{ color: isPaid ? 'var(--green)' : 'var(--text)' }}>
                                  {fmtFull(isPaid ? l.paidAmount : l.amountDue)}
                                </span>
                              </div>
                            </Link>
                          );
                        })}
                        <Link href={`/customers/${row.customerId}`}
                          className="block text-center text-[11px] font-semibold pt-1"
                          style={{ color: 'var(--purple)' }}>
                          View full borrower profile →
                        </Link>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Today's Collection Sheet ─────────────────── */}
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.25)' }}>
              <ClipboardList className="w-4 h-4" style={{ color: 'var(--purple)' }} />
            </div>
            <div>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Collection Sheet</h3>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>Printable list — who pays today</p>
            </div>
          </div>

          <div className="mt-3">
            <label className="section-label block mb-1.5">Date</label>
            <div className="flex gap-2">
              <input type="date" value={todayDate} onChange={e => setTodayDate(e.target.value)}
                className="input py-2 text-sm flex-1" />
              <button onClick={() => setTodayDate(todayStr())} className="btn-ghost py-2 text-xs">Today</button>
            </div>
          </div>

          <div className="flex gap-2 mt-3">
            <button onClick={() => view(`/api/reports/today?date=${todayDate}`)}
              className="btn-ghost flex-1 justify-center py-2.5 text-sm">
              <FileText className="w-4 h-4" /> View
            </button>
            <button onClick={() => download(`/api/reports/today?date=${todayDate}`, `collection-sheet-${todayDate}.pdf`, 'today-dl')}
              disabled={busy === 'today-dl'} className="btn-primary flex-1 justify-center py-2.5 text-sm">
              {busy === 'today-dl' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />} Download
            </button>
          </div>
        </div>

        {/* ── Daily Report ─────────────────── */}
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.25)' }}>
              <Calendar className="w-4 h-4" style={{ color: 'var(--green)' }} />
            </div>
            <div>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Daily Report</h3>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>End-of-day summary with collections</p>
            </div>
          </div>

          <div className="mt-3">
            <label className="section-label block mb-1.5">Date</label>
            <div className="flex gap-2">
              <input type="date" value={dailyDate} onChange={e => setDailyDate(e.target.value)}
                className="input py-2 text-sm flex-1" />
              <button onClick={() => setDailyDate(todayStr())} className="btn-ghost py-2 text-xs">Today</button>
            </div>
          </div>

          <div className="flex gap-2 mt-3">
            <button onClick={() => view(`/api/reports/daily?date=${dailyDate}`)}
              className="btn-ghost flex-1 justify-center py-2.5 text-sm">
              <FileText className="w-4 h-4" /> View
            </button>
            <button onClick={() => download(`/api/reports/daily?date=${dailyDate}`, `daily-report-${dailyDate}.pdf`, 'daily-dl')}
              disabled={busy === 'daily-dl'} className="btn-primary flex-1 justify-center py-2.5 text-sm">
              {busy === 'daily-dl' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />} Download
            </button>
          </div>
        </div>

        {/* ── Weekly Report ─────────────────── */}
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(236,72,153,0.15)', border: '1px solid rgba(236,72,153,0.25)' }}>
              <CalendarRange className="w-4 h-4" style={{ color: 'var(--pink)' }} />
            </div>
            <div>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Weekly Report</h3>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>7-day performance summary</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 mt-3">
            <div>
              <label className="section-label block mb-1.5">Start</label>
              <input type="date" value={weekStart} onChange={e => setWeekStart(e.target.value)} className="input py-2 text-sm" />
            </div>
            <div>
              <label className="section-label block mb-1.5">End</label>
              <input type="date" value={weekEnd} onChange={e => setWeekEnd(e.target.value)} className="input py-2 text-sm" />
            </div>
          </div>

          <div className="flex gap-2 mt-2">
            <button onClick={() => { setWeekStart(daysAgoStr(6)); setWeekEnd(todayStr()); }}
              className="btn-ghost flex-1 py-1.5 text-xs justify-center">Last 7d</button>
            <button onClick={() => { setWeekStart(daysAgoStr(29)); setWeekEnd(todayStr()); }}
              className="btn-ghost flex-1 py-1.5 text-xs justify-center">Last 30d</button>
          </div>

          <div className="flex gap-2 mt-3">
            <button onClick={() => view(`/api/reports/weekly?start=${weekStart}&end=${weekEnd}`)}
              className="btn-ghost flex-1 justify-center py-2.5 text-sm">
              <FileText className="w-4 h-4" /> View
            </button>
            <button onClick={() => download(`/api/reports/weekly?start=${weekStart}&end=${weekEnd}`, `weekly-report-${weekStart}-to-${weekEnd}.pdf`, 'weekly-dl')}
              disabled={busy === 'weekly-dl'} className="btn-primary flex-1 justify-center py-2.5 text-sm">
              {busy === 'weekly-dl' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />} Download
            </button>
          </div>
        </div>

        {/* ── Manual trigger (send now) ────────── */}
        <div className="card p-4" style={{ borderColor: 'rgba(245,158,11,0.2)' }}>
          <div className="flex items-center gap-2 mb-3">
            <Send className="w-4 h-4" style={{ color: 'var(--amber)' }} />
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Send now via WhatsApp</h3>
          </div>
          <p className="text-xs mb-3" style={{ color: 'var(--muted)' }}>
            Manually trigger a cron job — PDF will be built and sent to your WhatsApp admin number.
          </p>
          <div className="flex flex-col gap-2">
            <button onClick={() => triggerCron('/api/cron/daily-report', 'run-daily')}
              disabled={busy === 'run-daily'} className="btn-ghost py-2 text-xs justify-center">
              {busy === 'run-daily' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Run daily report now
            </button>
            <button onClick={() => triggerCron('/api/cron/weekly-report', 'run-weekly')}
              disabled={busy === 'run-weekly'} className="btn-ghost py-2 text-xs justify-center">
              {busy === 'run-weekly' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Run weekly report now
            </button>
            <button onClick={() => triggerCron('/api/cron/payment-reminders', 'run-reminders')}
              disabled={busy === 'run-reminders'} className="btn-ghost py-2 text-xs justify-center">
              {busy === 'run-reminders' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Send reminders to all due-today customers
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
