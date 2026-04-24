'use client';
import { useEffect, useState, useCallback, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  ChevronLeft, ChevronRight, Search, Phone, CheckCircle2,
  AlertTriangle, Clock, Loader2, Check, X, IndianRupee,
  Sparkles, Calendar, Undo2,
} from 'lucide-react';

// ─── Types ───
type Bucket = 'today' | 'overdue' | 'paid-today';
interface LoanRow {
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
  bucket: Bucket;
  notes: string;
}
interface BorrowerRow {
  customerId: string;
  customerName: string;
  customerPhone: string;
  loans: LoanRow[];
  totalDue: number;
  totalPaidToday: number;
  count: number;
  overdueCount: number;
}
interface Summary {
  totalBorrowers: number;
  totalPayments: number;
  todayPayments: number;
  overduePayments: number;
  totalDue: number;
  totalPaid: number;
  totalOverdueBorrowers: number;
}

// ─── Utils ───
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function fmtINR(n: number) {
  const v = n || 0;
  return '₹' + v.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}
function fmtCompact(n: number) {
  const v = n || 0;
  if (v >= 100000) return '₹' + (v / 100000).toFixed(1) + 'L';
  if (v >= 1000) return '₹' + (v / 1000).toFixed(1) + 'K';
  return '₹' + v.toLocaleString('en-IN');
}
function daysDiff(a: string, b: string) {
  return Math.round((new Date(a + 'T00:00:00').getTime() - new Date(b + 'T00:00:00').getTime()) / 86400000);
}

type FilterTab = 'pending' | 'overdue' | 'paid' | 'all';

export default function CollectPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen" style={{ background: 'var(--bg)' }}>
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--purple)' }} />
      </div>
    }>
      <CollectInner />
    </Suspense>
  );
}

function CollectInner() {
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get('tab') as FilterTab | null) || 'pending';
  const initialDate = searchParams.get('date') || todayStr();

  const [date, setDate] = useState(initialDate);
  const [rows, setRows] = useState<BorrowerRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<FilterTab>(
    ['pending', 'overdue', 'paid', 'all'].includes(initialTab) ? initialTab : 'pending'
  );
  const [savingMap, setSavingMap] = useState<Record<string, boolean>>({});
  const [editingMap, setEditingMap] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; msg: string } | null>(null);

  const flash = useCallback((type: 'success' | 'error' | 'info', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 2500);
  }, []);

  const fetchData = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    try {
      const r = await fetch(`/api/reports/today-list?date=${date}`, { cache: 'no-store' });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setRows(d.rows || []);
      setSummary(d.summary || null);
    } catch (e) {
      console.error(e);
      flash('error', 'Failed to load');
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, [date, flash]);

  useEffect(() => { fetchData(true); }, [fetchData]);

  // Shift date
  const shiftDate = (days: number) => {
    const d = new Date(date + 'T00:00:00');
    d.setDate(d.getDate() + days);
    setDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  };

  // Collect handler
  const collect = useCallback(async (row: LoanRow, amount: number) => {
    const key = row.paymentId;
    setSavingMap(m => ({ ...m, [key]: true }));
    try {
      const r = await fetch(`/api/payments/${row.paymentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paid_amount: amount,
          paid_date: amount > 0 ? date : null,
          notes: row.notes || '',
          loan_id: row.loanId,
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || `HTTP ${r.status}`);
      }
      flash('success', amount > 0 ? `Collected ${fmtINR(amount)}` : 'Cleared');
      await fetchData(false);
      // Clear inline edit state
      setEditingMap(m => { const c = { ...m }; delete c[key]; return c; });
    } catch (e) {
      flash('error', e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSavingMap(m => { const c = { ...m }; delete c[key]; return c; });
    }
  }, [date, fetchData, flash]);

  // Filter rows
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .map(r => {
        const loans = r.loans.filter(l => {
          if (tab === 'pending') return l.bucket === 'today' && l.amountDue > 0;
          if (tab === 'overdue') return l.bucket === 'overdue';
          if (tab === 'paid') return l.paidAmount >= l.expectedAmount && l.expectedAmount > 0;
          return true;
        });
        return { ...r, loans };
      })
      .filter(r => r.loans.length > 0)
      .filter(r => {
        if (!q) return true;
        return r.customerName.toLowerCase().includes(q) ||
               (r.customerPhone || '').includes(q);
      });
  }, [rows, tab, search]);

  // Progress
  const targetTotal = (summary?.totalDue || 0) + (summary?.totalPaid || 0);
  const collectedPct = targetTotal > 0
    ? Math.round(((summary?.totalPaid || 0) / targetTotal) * 100)
    : 0;

  const isToday = date === todayStr();
  const humanDate = new Date(date + 'T00:00:00').toLocaleDateString('en-IN', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
  });

  return (
    <div className="pb-28 min-h-screen" style={{ background: 'var(--bg)' }}>
      {/* ─── Sticky header with date nav ─── */}
      <div className="sticky top-0 z-20 px-4 pt-4 pb-3"
        style={{ background: 'rgba(10,10,15,0.92)', backdropFilter: 'blur(20px)', borderBottom: '1px solid var(--glass-border)' }}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, var(--purple), var(--pink))' }}>
              <IndianRupee className="w-4 h-4 text-white" strokeWidth={2.5} />
            </div>
            <h1 className="text-base font-bold" style={{ color: 'var(--text)' }}>Collect</h1>
          </div>
          {!isToday && (
            <button onClick={() => setDate(todayStr())}
              className="text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1"
              style={{ color: 'var(--purple)', background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.2)' }}>
              <Undo2 className="w-3 h-3" /> Today
            </button>
          )}
        </div>

        {/* Date picker */}
        <div className="flex items-center gap-2 mb-3">
          <button onClick={() => shiftDate(-1)} aria-label="Previous day"
            className="w-9 h-9 rounded-lg flex items-center justify-center transition-colors active:scale-95"
            style={{ background: 'var(--glass-bg-2)', border: '1px solid var(--glass-border)' }}>
            <ChevronLeft className="w-4 h-4" style={{ color: 'var(--text)' }} />
          </button>
          <label className="flex-1 relative cursor-pointer">
            <div className="flex items-center justify-center gap-2 rounded-lg px-3 py-2.5"
              style={{ background: 'var(--glass-bg-2)', border: '1px solid var(--glass-border)' }}>
              <Calendar className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--muted)' }} />
              <span className="text-sm font-bold" style={{ color: 'var(--text)' }}>{humanDate}</span>
              {isToday && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                  style={{ background: 'rgba(245,158,11,0.18)', color: '#fbbf24' }}>TODAY</span>
              )}
            </div>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="absolute inset-0 opacity-0 cursor-pointer" />
          </label>
          <button onClick={() => shiftDate(1)} aria-label="Next day"
            className="w-9 h-9 rounded-lg flex items-center justify-center transition-colors active:scale-95"
            style={{ background: 'var(--glass-bg-2)', border: '1px solid var(--glass-border)' }}>
            <ChevronRight className="w-4 h-4" style={{ color: 'var(--text)' }} />
          </button>
        </div>

        {/* Summary stat strip */}
        {summary && (
          <div className="rounded-2xl p-3 mb-3"
            style={{
              background: 'linear-gradient(135deg, rgba(139,92,246,0.15), rgba(236,72,153,0.1))',
              border: '1px solid rgba(139,92,246,0.25)',
            }}>
            <div className="grid grid-cols-3 gap-2 mb-2">
              <div>
                <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted-2)' }}>Due</p>
                <p className="text-lg font-black" style={{ color: 'var(--text)' }}>{fmtCompact(summary.totalDue)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted-2)' }}>Collected</p>
                <p className="text-lg font-black" style={{ color: 'var(--green)' }}>{fmtCompact(summary.totalPaid)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted-2)' }}>Borrowers</p>
                <p className="text-lg font-black" style={{ color: 'var(--text)' }}>{summary.totalBorrowers}</p>
              </div>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
              <div className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${collectedPct}%`,
                  background: 'linear-gradient(90deg, var(--green), #34d399)',
                  boxShadow: '0 0 8px rgba(16,185,129,0.5)',
                }} />
            </div>
            <div className="flex justify-between mt-1.5">
              <span className="text-[10px]" style={{ color: 'var(--muted)' }}>{collectedPct}% of target</span>
              {summary.overduePayments > 0 && (
                <span className="text-[10px] flex items-center gap-1 font-semibold" style={{ color: 'var(--red)' }}>
                  <AlertTriangle className="w-2.5 h-2.5" /> {summary.overduePayments} overdue
                </span>
              )}
            </div>
          </div>
        )}

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--muted)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            className="input pl-10 py-2.5 text-sm" placeholder="Search borrower or phone…" />
          {search && (
            <button onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: 'var(--glass-bg-2)' }}>
              <X className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
            </button>
          )}
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1">
          {[
            { key: 'pending', label: 'Due', count: summary?.todayPayments || 0 },
            { key: 'overdue', label: 'Overdue', count: summary?.overduePayments || 0, danger: true },
            { key: 'paid', label: 'Paid', count: summary ? summary.totalPayments - (summary.todayPayments + summary.overduePayments) : 0 },
            { key: 'all', label: 'All', count: summary?.totalPayments || 0 },
          ].map(t => {
            const active = tab === t.key;
            return (
              <button key={t.key} onClick={() => setTab(t.key as FilterTab)}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 whitespace-nowrap"
                style={{
                  background: active
                    ? t.danger
                      ? 'linear-gradient(135deg, rgba(244,63,94,0.25), rgba(244,63,94,0.15))'
                      : 'linear-gradient(135deg, var(--purple), var(--pink))'
                    : 'var(--glass-bg-2)',
                  color: active ? '#fff' : 'var(--muted)',
                  border: active
                    ? t.danger ? '1px solid rgba(244,63,94,0.35)' : '1px solid rgba(139,92,246,0.35)'
                    : '1px solid var(--glass-border)',
                  boxShadow: active && !t.danger ? '0 2px 12px rgba(139,92,246,0.3)' : 'none',
                }}>
                {t.label}
                {t.count > 0 && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                    style={{ background: active ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.06)' }}>
                    {t.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── Body ─── */}
      <div className="p-4">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="card animate-pulse" style={{ height: 120 }} />
            ))}
          </div>
        ) : filteredRows.length === 0 ? (
          <EmptyState tab={tab} search={search} isToday={isToday} />
        ) : (
          <div className="space-y-3">
            {filteredRows.map(borrower => (
              <BorrowerCard
                key={borrower.customerId}
                borrower={borrower}
                date={date}
                editingMap={editingMap}
                setEditingMap={setEditingMap}
                savingMap={savingMap}
                onCollect={collect}
              />
            ))}
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[60] pointer-events-none animate-in fade-in slide-in-from-bottom-4 duration-200">
          <div className="px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2.5 text-sm font-medium max-w-[90vw]"
            style={{
              background: toast.type === 'success'
                ? 'linear-gradient(135deg, rgba(16,185,129,0.95), rgba(5,150,105,0.95))'
                : toast.type === 'error'
                ? 'linear-gradient(135deg, rgba(244,63,94,0.95), rgba(225,29,72,0.95))'
                : 'linear-gradient(135deg, rgba(139,92,246,0.95), rgba(124,58,237,0.95))',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.15)',
              backdropFilter: 'blur(12px)',
              boxShadow: '0 12px 40px rgba(0,0,0,0.4)',
            }}>
            {toast.type === 'success'
              ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              : toast.type === 'error'
              ? <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              : <Sparkles className="w-4 h-4 flex-shrink-0" />}
            <span>{toast.msg}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Borrower Card ───
function BorrowerCard({
  borrower, date, editingMap, setEditingMap, savingMap, onCollect,
}: {
  borrower: BorrowerRow;
  date: string;
  editingMap: Record<string, string>;
  setEditingMap: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  savingMap: Record<string, boolean>;
  onCollect: (row: LoanRow, amount: number) => Promise<void>;
}) {
  const hasOverdue = borrower.overdueCount > 0;

  return (
    <div className="card overflow-hidden"
      style={hasOverdue ? { borderColor: 'rgba(244,63,94,0.3)' } : {}}>
      {/* Header */}
      <div className="px-4 py-3 flex items-center gap-3"
        style={{ borderBottom: '1px solid var(--glass-border)', background: hasOverdue ? 'rgba(244,63,94,0.04)' : 'transparent' }}>
        <div className="avatar flex-shrink-0 text-sm font-bold"
          style={{
            width: 40, height: 40,
            background: hasOverdue
              ? 'linear-gradient(135deg, var(--red), #e11d48)'
              : 'linear-gradient(135deg, var(--purple), var(--violet))',
            border: '1.5px solid rgba(255,255,255,0.12)',
          }}>
          {borrower.customerName[0]?.toUpperCase() || '?'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-[15px] truncate" style={{ color: 'var(--text)' }}>{borrower.customerName}</p>
            {hasOverdue && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                style={{ background: 'rgba(244,63,94,0.15)', color: '#fb7185', border: '1px solid rgba(244,63,94,0.25)' }}>
                {borrower.overdueCount} overdue
              </span>
            )}
          </div>
          {borrower.customerPhone && (
            <a href={`tel:${borrower.customerPhone}`}
              className="text-xs flex items-center gap-1 mt-0.5" style={{ color: 'var(--muted)' }}>
              <Phone className="w-3 h-3" /> {borrower.customerPhone}
            </a>
          )}
        </div>
        <div className="text-right flex-shrink-0">
          {borrower.totalDue > 0 && (
            <>
              <p className="text-sm font-black" style={{ color: hasOverdue ? 'var(--red)' : 'var(--text)' }}>{fmtINR(borrower.totalDue)}</p>
              <p className="text-[10px]" style={{ color: 'var(--muted)' }}>due</p>
            </>
          )}
          {borrower.totalPaidToday > 0 && borrower.totalDue === 0 && (
            <>
              <p className="text-sm font-black" style={{ color: 'var(--green)' }}>{fmtINR(borrower.totalPaidToday)}</p>
              <p className="text-[10px]" style={{ color: 'var(--muted)' }}>paid</p>
            </>
          )}
        </div>
      </div>

      {/* Loan rows */}
      <div>
        {borrower.loans.map(row => (
          <PaymentQuickRow
            key={row.paymentId}
            row={row}
            date={date}
            editing={editingMap[row.paymentId]}
            setEditing={(v) => {
              setEditingMap(m => {
                const c = { ...m };
                if (v === undefined) delete c[row.paymentId];
                else c[row.paymentId] = v;
                return c;
              });
            }}
            saving={!!savingMap[row.paymentId]}
            onCollect={onCollect}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Payment Quick Row (one-tap) ───
function PaymentQuickRow({
  row, date, editing, setEditing, saving, onCollect,
}: {
  row: LoanRow;
  date: string;
  editing: string | undefined;
  setEditing: (v: string | undefined) => void;
  saving: boolean;
  onCollect: (row: LoanRow, amount: number) => Promise<void>;
}) {
  const isFullyPaid = row.paidAmount >= row.expectedAmount && row.expectedAmount > 0;
  const isPartial = row.paidAmount > 0 && row.paidAmount < row.expectedAmount;
  const isEditing = editing !== undefined;

  const amount = isEditing ? parseFloat(editing || '0') || 0 : row.amountDue;
  const daysOverdue = row.bucket === 'overdue' ? -daysDiff(row.dueDate, date) : 0;

  const handleFull = () => onCollect(row, row.expectedAmount);
  const handleClear = () => onCollect(row, 0);
  const handleSaveEdit = () => onCollect(row, amount);

  // Color scheme
  const bucketStyle = isFullyPaid
    ? { bg: 'rgba(16,185,129,0.05)', border: 'rgba(16,185,129,0.15)', icon: 'var(--green)' }
    : row.bucket === 'overdue'
    ? { bg: 'rgba(244,63,94,0.05)', border: 'rgba(244,63,94,0.12)', icon: 'var(--red)' }
    : isPartial
    ? { bg: 'rgba(245,158,11,0.04)', border: 'transparent', icon: 'var(--amber)' }
    : { bg: 'transparent', border: 'transparent', icon: 'var(--muted-2)' };

  const dueLabel = new Date(row.dueDate + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });

  return (
    <div className="px-4 py-3"
      style={{
        background: bucketStyle.bg,
        borderBottom: '1px solid var(--glass-border)',
      }}>
      <div className="flex items-center gap-3">
        {/* Period badge */}
        <div className="w-10 h-10 rounded-xl flex flex-col items-center justify-center flex-shrink-0"
          style={{
            background: isFullyPaid ? 'rgba(16,185,129,0.15)' : 'var(--glass-bg-2)',
            border: `1px solid ${isFullyPaid ? 'rgba(16,185,129,0.3)' : 'var(--glass-border)'}`,
          }}>
          <span className="text-[9px] font-bold leading-none"
            style={{ color: isFullyPaid ? 'var(--green)' : 'var(--muted)' }}>
            {row.planType === 'daily' ? 'D' : 'W'}
          </span>
          <span className="text-xs font-black leading-tight" style={{ color: isFullyPaid ? 'var(--green)' : 'var(--text)' }}>
            {row.periodNumber}
          </span>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            {isFullyPaid ? (
              <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--green)' }} />
            ) : row.bucket === 'overdue' ? (
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--red)' }} />
            ) : (
              <Clock className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--muted)' }} />
            )}
            <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
              {fmtINR(row.expectedAmount)}
            </span>
            {isPartial && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                style={{ background: 'rgba(245,158,11,0.15)', color: '#fbbf24' }}>
                {fmtINR(row.paidAmount)} paid
              </span>
            )}
            {daysOverdue > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                style={{ background: 'rgba(244,63,94,0.15)', color: '#fb7185' }}>
                {daysOverdue}d late
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--muted)' }}>
            <span>{dueLabel}</span>
            <span>•</span>
            <Link href={`/loans/${row.loanId}`} className="hover:underline" style={{ color: 'var(--purple)' }}>
              Open loan
            </Link>
          </div>
        </div>

        {/* Action: collapsed vs editing */}
        {!isEditing ? (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {isFullyPaid ? (
              <button onClick={handleClear} disabled={saving}
                className="px-2 py-2 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 flex items-center gap-1"
                style={{ color: 'var(--muted)', background: 'var(--glass-bg-2)', border: '1px solid var(--glass-border)' }}>
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Undo2 className="w-3.5 h-3.5" />}
              </button>
            ) : (
              <>
                <button onClick={() => setEditing(isPartial ? String(row.paidAmount) : String(row.expectedAmount))}
                  disabled={saving}
                  className="px-2.5 py-2 rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
                  style={{ color: 'var(--muted)', background: 'var(--glass-bg-2)', border: '1px solid var(--glass-border)' }}>
                  <IndianRupee className="w-3.5 h-3.5" />
                </button>
                <button onClick={handleFull} disabled={saving}
                  className="px-3 py-2 rounded-lg text-xs font-bold transition-all disabled:opacity-50 text-white flex items-center gap-1.5 active:scale-95"
                  style={{
                    background: 'linear-gradient(135deg, var(--green), #059669)',
                    boxShadow: '0 2px 10px rgba(16,185,129,0.35)',
                  }}>
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" strokeWidth={3} />}
                  Collect
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button onClick={() => setEditing(undefined)} disabled={saving}
              className="w-9 h-9 rounded-lg flex items-center justify-center transition-colors disabled:opacity-50"
              style={{ background: 'var(--glass-bg-2)', border: '1px solid var(--glass-border)', color: 'var(--muted)' }}>
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Inline amount editor */}
      {isEditing && (
        <div className="mt-3 flex items-center gap-2">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold" style={{ color: 'var(--muted)' }}>₹</span>
            <input type="number" autoFocus
              value={editing} onChange={e => setEditing(e.target.value)}
              className="input pl-7 py-2 text-sm font-bold"
              placeholder={String(row.expectedAmount)} />
          </div>
          <button onClick={() => setEditing(String(row.expectedAmount))} disabled={saving}
            className="px-2.5 py-2 rounded-lg text-[11px] font-semibold disabled:opacity-50"
            style={{ background: 'var(--glass-bg-2)', color: 'var(--muted)', border: '1px solid var(--glass-border)' }}>
            Full
          </button>
          <button onClick={() => setEditing('0')} disabled={saving}
            className="px-2.5 py-2 rounded-lg text-[11px] font-semibold disabled:opacity-50"
            style={{ background: 'var(--glass-bg-2)', color: 'var(--muted)', border: '1px solid var(--glass-border)' }}>
            Clear
          </button>
          <button onClick={handleSaveEdit} disabled={saving || isNaN(amount) || amount < 0}
            className="px-3 py-2 rounded-lg text-xs font-bold text-white transition-all disabled:opacity-50 active:scale-95 flex items-center gap-1"
            style={{
              background: 'linear-gradient(135deg, var(--purple), var(--pink))',
              boxShadow: '0 2px 10px rgba(139,92,246,0.35)',
            }}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" strokeWidth={3} />}
            Save
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Empty ───
function EmptyState({ tab, search, isToday }: { tab: FilterTab; search: string; isToday: boolean }) {
  if (search) {
    return (
      <div className="card p-10 text-center">
        <Search className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--muted-2)' }} />
        <p className="text-sm font-semibold" style={{ color: 'var(--muted)' }}>No borrower matches "{search}"</p>
      </div>
    );
  }
  const msg =
    tab === 'pending' ? (isToday ? 'No collections due today 🎉' : 'Nothing due on this date')
    : tab === 'overdue' ? 'No overdue payments — all caught up!'
    : tab === 'paid' ? 'No collections recorded yet'
    : 'No data for this day';
  const sub =
    tab === 'pending' ? 'Change the date or check overdue'
    : tab === 'overdue' ? 'Good job keeping your book clean.'
    : tab === 'paid' ? 'Collections will appear here as you mark them paid.'
    : 'Try a different date';

  return (
    <div className="card p-12 text-center">
      <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3"
        style={{ background: tab === 'overdue' ? 'rgba(16,185,129,0.12)' : 'var(--glass-bg-2)' }}>
        {tab === 'overdue'
          ? <CheckCircle2 className="w-7 h-7" style={{ color: 'var(--green)' }} />
          : <IndianRupee className="w-6 h-6" style={{ color: 'var(--muted-2)' }} />}
      </div>
      <p className="font-bold text-sm mb-1" style={{ color: 'var(--text)' }}>{msg}</p>
      <p className="text-xs" style={{ color: 'var(--muted)' }}>{sub}</p>
    </div>
  );
}
