'use client';
import { useEffect, useState, useCallback, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  ChevronLeft, ChevronRight, Search, Phone, CheckCircle2,
  AlertTriangle, Clock, Loader2, Check, X, IndianRupee,
  Sparkles, Calendar, Undo2, ListChecks, CheckSquare, Square,
  MessageCircle, TrendingUp, BadgePercent, CalendarClock,
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
  endDate: string;
  bucket: Bucket;
  notes: string;
  interestAmount: number;
  interestCollected: boolean;
  interestCollectedDate: string | null;
}
interface InterestLoan {
  loanId: string;
  interestAmount: number;
  interestCollected: boolean;
  interestCollectedDate: string | null;
  planType: 'weekly' | 'daily';
  principal: number;
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
  interestLoans?: InterestLoan[];
  totalPaidPeriods?: number;
  totalPeriods?: number;
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

type FilterTab = 'today' | 'overdue' | 'paid' | 'all';

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
  const initialTab = (searchParams.get('tab') as FilterTab | null) || 'today';
  const initialDate = searchParams.get('date') || todayStr();

  const [date, setDate] = useState(initialDate);
  const [rows, setRows] = useState<BorrowerRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<FilterTab>(
    ['today', 'overdue', 'paid', 'all'].includes(initialTab) ? initialTab : 'today'
  );
  const [savingMap, setSavingMap] = useState<Record<string, boolean>>({});
  const [editingMap, setEditingMap] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; msg: string } | null>(null);
  const [fetchError, setFetchError] = useState<{ msg: string; quotaExceeded: boolean } | null>(null);
  // Bulk-select state. selectionMode toggles checkboxes on; selectedIds tracks
  // which paymentIds the user has picked. This whole feature exists to coalesce
  // many one-tap collects into a single batch — the dominant Firestore-read
  // savings are *not* refetching after every write, so we also drive optimistic
  // updates from `applyOptimisticUpdates` for both single and bulk paths.
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkSaving, setBulkSaving] = useState(false);
  const [rollSaving, setRollSaving] = useState(false);
  // Interest collection state: loanId → { saving, collected }
  const [interestSavingMap, setInterestSavingMap]   = useState<Record<string, boolean>>({});
  const [interestCollectedMap, setInterestCollectedMap] = useState<Record<string, boolean>>({});

  const flash = useCallback((type: 'success' | 'error' | 'info', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 2500);
  }, []);

  const fetchData = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    try {
      const r = await fetch(`/api/reports/today-list?date=${date}`, { cache: 'no-store' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.error) {
        setFetchError({ msg: d.error || `HTTP ${r.status}`, quotaExceeded: !!d.quotaExceeded });
        setRows([]);
        setSummary(null);
        return;
      }
      setFetchError(null);
      setRows(d.rows || []);
      setSummary(d.summary || null);
    } catch (e) {
      console.error(e);
      setFetchError({ msg: e instanceof Error ? e.message : 'Network error', quotaExceeded: false });
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

  // Apply optimistic updates to local state without hitting the network.
  // Used by both the single-collect path (replacing `fetchData(false)` which
  // costs ≈80 reads) and the bulk-collect path (zero refetch). Status/bucket
  // are recomputed locally to mirror the server-side logic in
  // `app/api/payments/bulk-collect/route.ts` so the UI stays consistent.
  const applyOptimisticUpdates = useCallback((
    ups: Array<{ paymentId: string; paidAmount: number; paidDate: string | null }>
  ) => {
    if (ups.length === 0) return;
    const map = new Map(ups.map(u => [u.paymentId, u]));

    // Capture deltas in one pass so we can update summary without re-reading rows.
    let totalPaidDelta = 0;
    let overdueDelta = 0;
    let todayCountDelta = 0;
    let overdueCountDelta = 0;

    setRows(prev => prev.map(borrower => {
      let touched = false;
      const newLoans = borrower.loans.map(l => {
        const u = map.get(l.paymentId);
        if (!u) return l;
        touched = true;

        const wasPaid = l.paidAmount >= l.expectedAmount && l.expectedAmount > 0;
        const wasOverdue = l.bucket === 'overdue';
        const wasToday = l.bucket === 'today';

        let status: string;
        if (u.paidAmount >= l.expectedAmount) status = 'paid';
        else if (u.paidAmount > 0) status = 'partial';
        else status = l.dueDate < date ? 'overdue' : 'pending';

        let bucket: Bucket;
        if (u.paidAmount >= l.expectedAmount && u.paidDate === date) bucket = 'paid-today';
        else if (l.dueDate < date) bucket = 'overdue';
        else bucket = 'today';

        const isPaid = u.paidAmount >= l.expectedAmount && l.expectedAmount > 0;
        const isOverdue = bucket === 'overdue';
        const isToday = bucket === 'today';

        totalPaidDelta += u.paidAmount - l.paidAmount;
        if (!wasPaid && isPaid) {
          if (wasOverdue) overdueCountDelta--;
          else if (wasToday) todayCountDelta--;
        } else if (wasPaid && !isPaid) {
          if (isOverdue) overdueCountDelta++;
          else if (isToday) todayCountDelta++;
        }
        if (wasOverdue && !isOverdue && !isPaid) overdueDelta--;
        if (!wasOverdue && isOverdue) overdueDelta++;

        return {
          ...l,
          paidAmount: u.paidAmount,
          paidDate: u.paidDate,
          status,
          bucket,
          amountDue: Math.max(0, l.expectedAmount - u.paidAmount),
        } as LoanRow;
      });
      if (!touched) return borrower;
      const totalDue = newLoans.reduce((s, l) => s + l.amountDue, 0);
      const totalPaidToday = newLoans.reduce((s, l) => s + (l.paidDate === date ? l.paidAmount : 0), 0);
      const overdueCount = newLoans.filter(l => l.bucket === 'overdue').length;
      return { ...borrower, loans: newLoans, totalDue, totalPaidToday, overdueCount };
    }));

    setSummary(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        totalPaid: Math.max(0, prev.totalPaid + totalPaidDelta),
        totalDue: Math.max(0, prev.totalDue - totalPaidDelta),
        overduePayments: Math.max(0, prev.overduePayments + overdueDelta),
        todayPayments: Math.max(0, prev.todayPayments + todayCountDelta),
      };
    });
  }, [date]);

  // Collect handler — single payment. Now writes via the *bulk* endpoint with
  // a single-item payload, then applies the optimistic update locally instead
  // of refetching. Same UX, but ~80 fewer Firestore reads per collect.
  const collect = useCallback(async (row: LoanRow, amount: number) => {
    const key = row.paymentId;
    setSavingMap(m => ({ ...m, [key]: true }));
    try {
      const r = await fetch('/api/payments/bulk-collect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payments: [{
            loanId: row.loanId,
            paymentId: row.paymentId,
            paidAmount: amount,
            paidDate: amount > 0 ? date : null,
            notes: row.notes || '',
          }],
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || `HTTP ${r.status}`);
      }
      applyOptimisticUpdates([{ paymentId: row.paymentId, paidAmount: amount, paidDate: amount > 0 ? date : null }]);
      flash('success', amount > 0 ? `Collected ${fmtINR(amount)}` : 'Cleared');
      // Clear inline edit state
      setEditingMap(m => { const c = { ...m }; delete c[key]; return c; });
    } catch (e) {
      flash('error', e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSavingMap(m => { const c = { ...m }; delete c[key]; return c; });
    }
  }, [date, applyOptimisticUpdates, flash]);

  // Bulk collect — fire one POST with all selected rows, then apply all the
  // optimistic updates in a single render. The selected rows always collect
  // their `expectedAmount` (matching the single-tap "Collect" button); custom
  // amounts go through the inline editor on a per-row basis.
  const bulkCollect = useCallback(async () => {
    if (selectedIds.size === 0) return;
    // Build payload from current rows.
    const items: Array<{ loanId: string; paymentId: string; paidAmount: number; paidDate: string | null; notes?: string }> = [];
    const updates: Array<{ paymentId: string; paidAmount: number; paidDate: string | null }> = [];
    for (const borrower of rows) {
      for (const loan of borrower.loans) {
        if (!selectedIds.has(loan.paymentId)) continue;
        // Skip already fully paid rows — defensive, the UI should already exclude them.
        if (loan.paidAmount >= loan.expectedAmount && loan.expectedAmount > 0) continue;
        items.push({
          loanId: loan.loanId,
          paymentId: loan.paymentId,
          paidAmount: loan.expectedAmount,
          paidDate: date,
          notes: loan.notes || '',
        });
        updates.push({ paymentId: loan.paymentId, paidAmount: loan.expectedAmount, paidDate: date });
      }
    }
    if (items.length === 0) {
      flash('info', 'Nothing to collect');
      return;
    }
    setBulkSaving(true);
    try {
      const r = await fetch('/api/payments/bulk-collect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payments: items }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      applyOptimisticUpdates(updates);
      const total = items.reduce((s, i) => s + i.paidAmount, 0);
      flash('success', `Collected ${fmtINR(total)} from ${items.length} payment${items.length > 1 ? 's' : ''}`);
      setSelectedIds(new Set());
      setSelectionMode(false);
    } catch (e) {
      flash('error', e instanceof Error ? e.message : 'Bulk collect failed');
    } finally {
      setBulkSaving(false);
    }
  }, [rows, selectedIds, date, applyOptimisticUpdates, flash]);

  // Collect interest for a loan (manual amount + mark collected).
  const collectInterest = useCallback(async (loanId: string, amount: number) => {
    setInterestSavingMap(m => ({ ...m, [loanId]: true }));
    try {
      const r = await fetch(`/api/loans/${loanId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          interest_collected: true,
          interest_collected_date: date,
          interest_amount: amount,
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || `HTTP ${r.status}`);
      }
      // Mark collected locally so the row disappears without refetch
      setInterestCollectedMap(m => ({ ...m, [loanId]: true }));
      // Also patch interestCollected on every LoanRow with this loanId
      setRows(prev => prev.map(b => ({
        ...b,
        loans: b.loans.map(l => l.loanId === loanId ? { ...l, interestCollected: true, interestCollectedDate: date } : l),
        interestLoans: (b.interestLoans ?? []).map(il => il.loanId === loanId ? { ...il, interestCollected: true, interestAmount: amount } : il),
      })));
      flash('success', `Interest ₹${amount.toLocaleString('en-IN')} collected`);
    } catch (e) {
      flash('error', e instanceof Error ? e.message : 'Failed to collect interest');
    } finally {
      setInterestSavingMap(m => { const c = { ...m }; delete c[loanId]; return c; });
    }
  }, [date, flash]);

  const toggleSelect = useCallback((paymentId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(paymentId)) next.delete(paymentId);
      else next.add(paymentId);
      return next;
    });
  }, []);

  const selectAllDueForBorrower = useCallback((borrowerId: string) => {
    const borrower = rows.find(r => r.customerId === borrowerId);
    if (!borrower) return;
    setSelectedIds(prev => {
      const next = new Set(prev);
      const dueIds = borrower.loans
        .filter(l => l.amountDue > 0 && l.expectedAmount > 0)
        .map(l => l.paymentId);
      // Toggle: if everything is already selected for this borrower, clear them.
      const allSelected = dueIds.length > 0 && dueIds.every(id => next.has(id));
      if (allSelected) dueIds.forEach(id => next.delete(id));
      else dueIds.forEach(id => next.add(id));
      return next;
    });
  }, [rows]);

  const cancelSelection = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  // Selected total — recomputed from rows so it stays in sync with edits.
  const selectedTotal = useMemo(() => {
    if (selectedIds.size === 0) return 0;
    let total = 0;
    for (const b of rows) {
      for (const l of b.loans) {
        if (selectedIds.has(l.paymentId)) total += l.expectedAmount;
      }
    }
    return total;
  }, [rows, selectedIds]);

  // Today vs overdue amounts — computed live from rows state so they update
  // immediately when payments are collected or extended, without a refetch.
  const todayDueAmount = useMemo(() =>
    rows.reduce((s, b) => s + b.loans
      .filter(l => l.bucket === 'today' && l.amountDue > 0)
      .reduce((ls, l) => ls + l.amountDue, 0), 0), [rows]);

  const overdueDueAmount = useMemo(() =>
    rows.reduce((s, b) => s + b.loans
      .filter(l => l.bucket === 'overdue' && l.amountDue > 0)
      .reduce((ls, l) => ls + l.amountDue, 0), 0), [rows]);

  // Extend / defer a single payment to a new due date.
  // Key behaviours:
  //   • If newDueDate > current displayed `date` → the payment is scheduled for
  //     the future and REMOVED from the current view. It will appear naturally
  //     on its new date.
  //   • If newDueDate ≤ `date` → stays in view with updated bucket/status.
  //   • If newDueDate > loan.endDate → server pushes the loan's end_date too.
  const extendPayment = useCallback(async (row: LoanRow, newDueDate: string) => {
    try {
      const r = await fetch(`/api/payments/${row.paymentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ due_date: newDueDate, loan_id: row.loanId }),
      });
      const result = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(result.error || `HTTP ${r.status}`);

      const loanEndMoved: boolean = result.loanEndDateExtended ?? false;
      const newLoanEndDate: string = result.newLoanEndDate ?? row.endDate;
      const isFutureDate = newDueDate > date; // beyond current display date

      setRows(prev => prev.map(borrower => {
        // Remove borrowers that end up with no loans after filtering
        const newLoans = borrower.loans
          .filter(l => {
            // If deferred to the future, remove from current view
            if (l.paymentId === row.paymentId && isFutureDate) return false;
            return true;
          })
          .map(l => {
            if (l.paymentId === row.paymentId) {
              // Stays in view — update date/bucket/status
              const newBucket: Bucket = newDueDate < date ? 'overdue' : 'today';
              const newStatus = newDueDate < date ? 'overdue' : 'pending';
              return { ...l, dueDate: newDueDate, bucket: newBucket, status: newStatus, endDate: loanEndMoved ? newLoanEndDate : l.endDate };
            }
            // Update endDate on sibling rows of the same loan
            if (loanEndMoved && l.loanId === row.loanId) {
              return { ...l, endDate: newLoanEndDate };
            }
            return l;
          });
        const totalDue = newLoans.reduce((s, l) => s + l.amountDue, 0);
        const overdueCount = newLoans.filter(l => l.bucket === 'overdue').length;
        return { ...borrower, loans: newLoans, totalDue, overdueCount };
      }).filter(b => b.loans.length > 0));

      // Update summary overdue count if we deferred an overdue row to the future
      if (isFutureDate && row.bucket === 'overdue') {
        setSummary(prev => prev ? { ...prev, overduePayments: Math.max(0, prev.overduePayments - 1) } : prev);
      }

      const dateStr = new Date(newDueDate + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
      if (loanEndMoved) {
        flash('success', `Deferred to ${dateStr} — loan extended`);
      } else {
        flash('success', `Deferred to ${dateStr}`);
      }
    } catch (e) {
      flash('error', e instanceof Error ? e.message : 'Failed to defer');
    }
  }, [date, flash]);

  // Defer ALL overdue → after their loan's end date (no interest).
  // Each loan's overdue payments are staggered: end+1, end+2 … so they
  // don't pile up on the same date. The loan end_date extends accordingly.
  const deferOverdueToEnd = useCallback(async () => {
    setRollSaving(true);
    try {
      const r = await fetch('/api/payments/defer-overdue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date }),
      });
      const result = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(result.error || `HTTP ${r.status}`);

      // Remove all overdue rows from the current view — they're now scheduled
      // for the future and will appear naturally on their new dates.
      setRows(prev =>
        prev
          .map(borrower => {
            const newLoans = borrower.loans.filter(l => l.bucket !== 'overdue');
            const totalDue = newLoans.reduce((s, l) => s + l.amountDue, 0);
            return { ...borrower, loans: newLoans, totalDue, overdueCount: 0 };
          })
          .filter(b => b.loans.length > 0)
      );
      setSummary(prev => prev ? { ...prev, overduePayments: 0 } : prev);

      const n = result.deferred ?? 0;
      const loans = result.loansExtended ?? 0;
      flash('success', `${n} payment${n !== 1 ? 's' : ''} deferred — ${loans} loan${loans !== 1 ? 's' : ''} extended`);
      setTab('today');
    } catch (e) {
      flash('error', e instanceof Error ? e.message : 'Failed to defer overdue');
    } finally {
      setRollSaving(false);
    }
  }, [date, flash]);

  // Filter rows — "today" tab is strictly today's pending only (no overdue bleed-in)
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .map(r => {
        const loans = r.loans.filter(l => {
          if (tab === 'today')   return l.bucket === 'today' && l.amountDue > 0;
          if (tab === 'overdue') return l.bucket === 'overdue';
          if (tab === 'paid')    return l.paidAmount >= l.expectedAmount && l.expectedAmount > 0;
          return true; // 'all'
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
          <div className="flex items-center gap-2">
            {!isToday && (
              <button onClick={() => setDate(todayStr())}
                className="text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1"
                style={{ color: 'var(--purple)', background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.2)' }}>
                <Undo2 className="w-3 h-3" /> Today
              </button>
            )}
            <button onClick={() => selectionMode ? cancelSelection() : setSelectionMode(true)}
              className="text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1"
              style={selectionMode
                ? { color: '#fff', background: 'linear-gradient(135deg, var(--purple), var(--pink))', border: '1px solid rgba(139,92,246,0.45)' }
                : { color: 'var(--purple)', background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.2)' }}>
              <ListChecks className="w-3 h-3" /> {selectionMode ? 'Cancel' : 'Select'}
            </button>
          </div>
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
            {/* Top row: Today / Overdue / Collected */}
            <div className="grid grid-cols-3 gap-2 mb-2">
              <div>
                <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted-2)' }}>Due Today</p>
                <p className="text-base font-black" style={{ color: todayDueAmount > 0 ? 'var(--text)' : 'var(--muted)' }}>
                  {fmtCompact(todayDueAmount)}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted-2)' }}>Overdue</p>
                <p className="text-base font-black" style={{ color: overdueDueAmount > 0 ? 'var(--red)' : 'var(--muted)' }}>
                  {overdueDueAmount > 0 ? fmtCompact(overdueDueAmount) : '—'}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted-2)' }}>Collected</p>
                <p className="text-base font-black" style={{ color: 'var(--green)' }}>{fmtCompact(summary.totalPaid)}</p>
              </div>
            </div>
            {/* Progress against today's target only */}
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
              <span className="text-[10px]" style={{ color: 'var(--muted)' }}>
                {summary.totalBorrowers} borrower{summary.totalBorrowers !== 1 ? 's' : ''}
                {summary.overduePayments > 0 && (
                  <span className="font-semibold ml-2" style={{ color: 'var(--red)' }}>
                    · {summary.overduePayments} overdue
                  </span>
                )}
              </span>
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
            { key: 'today',   label: 'Today',   count: summary?.todayPayments || 0 },
            { key: 'overdue', label: 'Overdue',  count: summary?.overduePayments || 0, danger: true },
            { key: 'paid',    label: 'Paid',     count: summary ? summary.totalPayments - (summary.todayPayments + summary.overduePayments) : 0 },
            { key: 'all',     label: 'All',      count: summary?.totalPayments || 0 },
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

        {/* Overdue action panel — shown in overdue tab */}
        {tab === 'overdue' && !loading && (summary?.overduePayments || 0) > 0 && (
          <div className="mb-4 rounded-2xl p-4"
            style={{
              background: 'linear-gradient(135deg, rgba(244,63,94,0.12), rgba(244,63,94,0.06))',
              border: '1px solid rgba(244,63,94,0.25)',
            }}>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(244,63,94,0.15)', border: '1px solid rgba(244,63,94,0.25)' }}>
                <AlertTriangle className="w-5 h-5" style={{ color: 'var(--red)' }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold mb-0.5" style={{ color: 'var(--text)' }}>
                  {summary?.overduePayments} overdue payment{summary?.overduePayments !== 1 ? 's' : ''}
                </p>
                <p className="text-xs leading-relaxed mb-3" style={{ color: 'var(--muted)' }}>
                  From past days where payment wasn&apos;t collected. Defer them after each loan&apos;s end date — staggered per loan, no interest added. Or handle each one individually below.
                </p>
                <button
                  onClick={deferOverdueToEnd}
                  disabled={rollSaving}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-all active:scale-95 disabled:opacity-60"
                  style={{
                    background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                    boxShadow: '0 4px 16px rgba(245,158,11,0.35)',
                  }}>
                  {rollSaving
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <CalendarClock className="w-4 h-4" />}
                  {rollSaving ? 'Deferring…' : `Defer all ${summary?.overduePayments} to after loan end`}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Today tab — nudge when overdue exists */}
        {tab === 'today' && !loading && (summary?.overduePayments || 0) > 0 && (
          <button
            onClick={() => setTab('overdue')}
            className="w-full mb-3 flex items-center justify-between px-4 py-2.5 rounded-xl transition-colors active:scale-[0.99]"
            style={{
              background: 'rgba(244,63,94,0.08)',
              border: '1px solid rgba(244,63,94,0.2)',
            }}>
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--red)' }} />
              <span className="text-xs font-semibold" style={{ color: '#fb7185' }}>
                {summary?.overduePayments} overdue from past days
              </span>
            </div>
            <div className="flex items-center gap-1 text-[11px] font-semibold" style={{ color: '#fb7185' }}>
              View &amp; fix <ChevronRight className="w-3.5 h-3.5" />
            </div>
          </button>
        )}

        {/* Overdue tab — empty state after rolling */}
        {tab === 'overdue' && !loading && (summary?.overduePayments || 0) === 0 && filteredRows.length === 0 && (
          <div className="card p-10 text-center mb-4">
            <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3"
              style={{ background: 'rgba(16,185,129,0.12)' }}>
              <CheckCircle2 className="w-6 h-6" style={{ color: 'var(--green)' }} />
            </div>
            <p className="font-bold text-sm mb-1" style={{ color: 'var(--green)' }}>All clear!</p>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>No overdue payments. Great job keeping the book clean.</p>
          </div>
        )}

        {fetchError ? (
          <div className="card p-5"
            style={{
              borderColor: fetchError.quotaExceeded ? 'rgba(245,158,11,0.35)' : 'rgba(244,63,94,0.3)',
              background: fetchError.quotaExceeded ? 'rgba(245,158,11,0.06)' : 'rgba(244,63,94,0.04)',
            }}>
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: fetchError.quotaExceeded ? 'rgba(245,158,11,0.15)' : 'rgba(244,63,94,0.15)' }}>
                <AlertTriangle className="w-4 h-4" style={{ color: fetchError.quotaExceeded ? '#fbbf24' : 'var(--red)' }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm mb-1" style={{ color: 'var(--text)' }}>
                  {fetchError.quotaExceeded ? 'Firestore quota exceeded' : 'Failed to load'}
                </p>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
                  {fetchError.msg}
                </p>
                <button onClick={() => fetchData(true)}
                  className="mt-3 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                  style={{ color: 'var(--purple)', background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.2)' }}>
                  Retry
                </button>
              </div>
            </div>
          </div>
        ) : loading ? (
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
                onExtend={extendPayment}
                selectionMode={selectionMode}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
                onSelectAllForBorrower={selectAllDueForBorrower}
                interestSavingMap={interestSavingMap}
                onCollectInterest={collectInterest}
              />
            ))}
          </div>
        )}
      </div>

      {/* Floating bulk action bar — only visible when in selection mode */}
      {selectionMode && (
        <div className="fixed bottom-20 left-0 right-0 z-50 px-4 pointer-events-none">
          <div className="max-w-md mx-auto pointer-events-auto rounded-2xl px-4 py-3 flex items-center gap-3 shadow-2xl"
            style={{
              background: 'linear-gradient(135deg, rgba(139,92,246,0.95), rgba(124,58,237,0.95))',
              border: '1px solid rgba(255,255,255,0.18)',
              backdropFilter: 'blur(16px)',
              boxShadow: '0 16px 48px rgba(139,92,246,0.45)',
            }}>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white/80 leading-tight">
                {selectedIds.size === 0 ? 'Tap rows to select' : `${selectedIds.size} selected`}
              </p>
              {selectedIds.size > 0 && (
                <p className="text-base font-black text-white truncate">{fmtINR(selectedTotal)}</p>
              )}
            </div>
            <button onClick={cancelSelection} disabled={bulkSaving}
              className="px-3 py-2 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
              style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)' }}>
              Cancel
            </button>
            <button onClick={bulkCollect} disabled={bulkSaving || selectedIds.size === 0}
              className="px-4 py-2 rounded-lg text-xs font-bold transition-all disabled:opacity-50 active:scale-95 flex items-center gap-1.5"
              style={{
                background: '#fff',
                color: 'var(--purple)',
                boxShadow: '0 4px 14px rgba(0,0,0,0.2)',
              }}>
              {bulkSaving
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Check className="w-3.5 h-3.5" strokeWidth={3} />}
              Collect All
            </button>
          </div>
        </div>
      )}

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

// ─── WhatsApp message builder ───
function buildWaMessage(borrower: BorrowerRow): string {
  const firstName = borrower.customerName.split(' ')[0] || borrower.customerName;

  const overdueLoans = borrower.loans.filter(l => l.bucket === 'overdue' && l.amountDue > 0);
  const todayLoans   = borrower.loans.filter(l => l.bucket === 'today'   && l.amountDue > 0);

  if (overdueLoans.length === 1) {
    const l = overdueLoans[0];
    return `Hi ${firstName}, your ${l.planType} payment of ₹${l.amountDue.toLocaleString('en-IN')} (Period ${l.periodNumber}) is overdue. Please clear at the earliest. 🙏`;
  }
  if (overdueLoans.length > 1) {
    const total = overdueLoans.reduce((s, l) => s + l.amountDue, 0);
    return `Hi ${firstName}, you have ${overdueLoans.length} overdue payments totaling ₹${total.toLocaleString('en-IN')}. Please clear at the earliest. 🙏`;
  }
  if (todayLoans.length === 1) {
    const l = todayLoans[0];
    return `Hi ${firstName}, your ${l.planType} payment of ₹${l.expectedAmount.toLocaleString('en-IN')} is due today (Period ${l.periodNumber}). Please pay at your earliest convenience. 🙏`;
  }
  if (todayLoans.length > 1) {
    const total = todayLoans.reduce((s, l) => s + l.amountDue, 0);
    return `Hi ${firstName}, you have ${todayLoans.length} payments totaling ₹${total.toLocaleString('en-IN')} due today. Please pay at your earliest convenience. 🙏`;
  }
  // Fallback (paid / zero due)
  return `Hi ${firstName}, please ensure your upcoming payments are on time. Thank you! 🙏`;
}

// ─── Borrower Card ───
function BorrowerCard({
  borrower, date, editingMap, setEditingMap, savingMap, onCollect, onExtend,
  selectionMode, selectedIds, onToggleSelect, onSelectAllForBorrower,
  interestSavingMap, onCollectInterest,
}: {
  borrower: BorrowerRow;
  date: string;
  editingMap: Record<string, string>;
  setEditingMap: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  savingMap: Record<string, boolean>;
  onCollect: (row: LoanRow, amount: number) => Promise<void>;
  onExtend: (row: LoanRow, newDueDate: string) => Promise<void>;
  selectionMode: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (paymentId: string) => void;
  onSelectAllForBorrower: (borrowerId: string) => void;
  interestSavingMap: Record<string, boolean>;
  onCollectInterest: (loanId: string, amount: number) => Promise<void>;
}) {
  const hasOverdue = borrower.overdueCount > 0;
  const dueIdsForBorrower = borrower.loans
    .filter(l => l.amountDue > 0 && l.expectedAmount > 0)
    .map(l => l.paymentId);
  const allSelected = dueIdsForBorrower.length > 0 && dueIdsForBorrower.every(id => selectedIds.has(id));
  const hasDue = dueIdsForBorrower.length > 0;

  // Payment progress (paid/total) — across all this borrower's active loans
  const paid = borrower.totalPaidPeriods ?? 0;
  const total = borrower.totalPeriods ?? 0;
  const progressPct = total > 0 ? Math.round((paid / total) * 100) : 0;

  // Pending interest loans (those with interestAmount > 0 and not yet collected)
  const pendingInterestLoans = (borrower.interestLoans ?? []).filter(il => !il.interestCollected);

  // WhatsApp deep link (India format)
  const waPhone = borrower.customerPhone
    ? borrower.customerPhone.replace(/\D/g, '').replace(/^0/, '').replace(/^(?!91)/, '91')
    : null;

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
            {pendingInterestLoans.length > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                style={{ background: 'rgba(245,158,11,0.15)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.25)' }}>
                Interest due
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {borrower.customerPhone && (
              <a href={`tel:${borrower.customerPhone}`}
                className="text-xs flex items-center gap-1" style={{ color: 'var(--muted)' }}>
                <Phone className="w-3 h-3" /> {borrower.customerPhone}
              </a>
            )}
            {waPhone && (
              <a
                href={`https://wa.me/${waPhone}?text=${encodeURIComponent(buildWaMessage(borrower))}`}
                target="_blank" rel="noopener noreferrer"
                className="text-xs font-semibold flex items-center gap-1 px-2 py-0.5 rounded-md transition-colors"
                style={{ background: 'rgba(37,211,102,0.12)', color: '#25d366', border: '1px solid rgba(37,211,102,0.2)' }}>
                <MessageCircle className="w-3 h-3" /> WhatsApp
              </a>
            )}
          </div>
          {/* Progress bar: paid periods / total periods */}
          {total > 0 && (
            <div className="mt-1.5">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[10px]" style={{ color: 'var(--muted)' }}>
                  <TrendingUp className="inline w-2.5 h-2.5 mr-0.5" />
                  {paid}/{total} paid ({progressPct}%)
                </span>
              </div>
              <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
                <div className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${progressPct}%`,
                    background: progressPct >= 100
                      ? 'linear-gradient(90deg, var(--green), #34d399)'
                      : progressPct >= 60
                      ? 'linear-gradient(90deg, #3b82f6, #60a5fa)'
                      : 'linear-gradient(90deg, var(--purple), var(--pink))',
                  }} />
              </div>
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <div className="text-right">
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
          {selectionMode && hasDue && (
            <button onClick={() => onSelectAllForBorrower(borrower.customerId)}
              className="px-2 py-1.5 rounded-lg text-[10px] font-bold transition-colors flex items-center gap-1"
              style={allSelected
                ? { background: 'rgba(139,92,246,0.25)', color: '#fff', border: '1px solid rgba(139,92,246,0.4)' }
                : { background: 'var(--glass-bg-2)', color: 'var(--muted)', border: '1px solid var(--glass-border)' }}>
              {allSelected ? <CheckSquare className="w-3 h-3" /> : <Square className="w-3 h-3" />}
              All
            </button>
          )}
        </div>
      </div>

      {/* Interest rows (pending upfront interest per loan) */}
      {!selectionMode && pendingInterestLoans.map(il => (
        <InterestRow
          key={il.loanId}
          interestLoan={il}
          saving={!!interestSavingMap[il.loanId]}
          onCollect={onCollectInterest}
        />
      ))}

      {/* Payment rows */}
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
            onExtend={onExtend}
            selectionMode={selectionMode}
            selected={selectedIds.has(row.paymentId)}
            onToggleSelect={onToggleSelect}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Interest Row — manual interest entry + collect ───
function InterestRow({
  interestLoan, saving, onCollect,
}: {
  interestLoan: InterestLoan;
  saving: boolean;
  onCollect: (loanId: string, amount: number) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(interestLoan.interestAmount || ''));
  const amount = parseFloat(value) || 0;

  return (
    <div className="px-4 py-3"
      style={{
        borderBottom: '1px solid var(--glass-border)',
        background: 'rgba(245,158,11,0.04)',
      }}>
      <div className="flex items-center gap-3">
        {/* Icon badge */}
        <div className="w-10 h-10 rounded-xl flex flex-col items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)' }}>
          <BadgePercent className="w-4 h-4" style={{ color: '#fbbf24' }} />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
              style={{ background: 'rgba(245,158,11,0.15)', color: '#fbbf24' }}>
              INTEREST
            </span>
            <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
              {fmtINR(interestLoan.interestAmount)}
            </span>
          </div>
          <p className="text-[11px]" style={{ color: 'var(--muted)' }}>
            Upfront interest — {interestLoan.planType} loan ·{' '}
            <span style={{ color: 'var(--muted-2)' }}>Principal {fmtINR(interestLoan.principal)}</span>
          </p>
        </div>

        {/* Action */}
        {!editing ? (
          <button
            onClick={() => { setEditing(true); setValue(String(interestLoan.interestAmount || '')); }}
            disabled={saving}
            className="px-3 py-2 rounded-lg text-xs font-bold transition-all disabled:opacity-50 text-white flex items-center gap-1.5 active:scale-95"
            style={{
              background: 'linear-gradient(135deg, #f59e0b, #d97706)',
              boxShadow: '0 2px 10px rgba(245,158,11,0.35)',
            }}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" strokeWidth={3} />}
            Collect
          </button>
        ) : (
          <button onClick={() => setEditing(false)} disabled={saving}
            className="w-9 h-9 rounded-lg flex items-center justify-center transition-colors disabled:opacity-50"
            style={{ background: 'var(--glass-bg-2)', border: '1px solid var(--glass-border)', color: 'var(--muted)' }}>
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Inline amount editor — expand on "Collect" click */}
      {editing && (
        <div className="mt-3 flex items-center gap-2">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold" style={{ color: 'var(--muted)' }}>₹</span>
            <input
              type="number" autoFocus
              value={value} onChange={e => setValue(e.target.value)}
              className="input pl-7 py-2 text-sm font-bold"
              placeholder={String(interestLoan.interestAmount)}
            />
          </div>
          <button onClick={() => setValue(String(interestLoan.interestAmount))} disabled={saving}
            className="px-2.5 py-2 rounded-lg text-[11px] font-semibold disabled:opacity-50"
            style={{ background: 'var(--glass-bg-2)', color: 'var(--muted)', border: '1px solid var(--glass-border)' }}>
            Auto
          </button>
          <button
            onClick={() => { onCollect(interestLoan.loanId, amount); setEditing(false); }}
            disabled={saving || isNaN(amount) || amount < 0}
            className="px-3 py-2 rounded-lg text-xs font-bold text-white transition-all disabled:opacity-50 active:scale-95 flex items-center gap-1"
            style={{
              background: 'linear-gradient(135deg, #f59e0b, #d97706)',
              boxShadow: '0 2px 10px rgba(245,158,11,0.35)',
            }}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" strokeWidth={3} />}
            Save
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Payment Quick Row (one-tap) ───
function PaymentQuickRow({
  row, date, editing, setEditing, saving, onCollect, onExtend,
  selectionMode, selected, onToggleSelect,
}: {
  row: LoanRow;
  date: string;
  editing: string | undefined;
  setEditing: (v: string | undefined) => void;
  saving: boolean;
  onCollect: (row: LoanRow, amount: number) => Promise<void>;
  onExtend: (row: LoanRow, newDueDate: string) => Promise<void>;
  selectionMode: boolean;
  selected: boolean;
  onToggleSelect: (paymentId: string) => void;
}) {
  const [extendMode, setExtendMode] = useState(false);
  const [extendDate, setExtendDate] = useState('');
  const [extendSaving, setExtendSaving] = useState(false);

  const isFullyPaid = row.paidAmount >= row.expectedAmount && row.expectedAmount > 0;
  const isPartial = row.paidAmount > 0 && row.paidAmount < row.expectedAmount;
  const isEditing = editing !== undefined;
  // Disable selection on rows the user can't bulk-collect (already paid).
  const canSelect = selectionMode && !isFullyPaid && row.expectedAmount > 0;

  const amount = isEditing ? parseFloat(editing || '0') || 0 : row.amountDue;
  const daysOverdue = row.bucket === 'overdue' ? -daysDiff(row.dueDate, date) : 0;

  const handleFull = () => onCollect(row, row.expectedAmount);
  const handleClear = () => onCollect(row, 0);
  const handleSaveEdit = () => onCollect(row, amount);

  const openExtend = () => {
    // Default to tomorrow (or one week from due date, whichever is later)
    const baseDate = row.dueDate < date ? date : row.dueDate;
    const d = new Date(baseDate + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    setExtendDate(iso);
    setExtendMode(true);
    setEditing(undefined); // close amount editor if open
  };

  const saveExtend = async () => {
    if (!extendDate) return;
    setExtendSaving(true);
    try {
      await onExtend(row, extendDate);
      setExtendMode(false);
    } finally {
      setExtendSaving(false);
    }
  };

  // Compute "day after loan end" for overdue one-tap defer
  const afterEndDate = row.endDate ? (() => {
    const d = new Date(row.endDate + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })() : null;
  const afterEndLabel = afterEndDate
    ? new Date(afterEndDate + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
    : null;

  const handleDeferToEnd = async () => {
    if (!afterEndDate) return;
    setExtendSaving(true);
    try { await onExtend(row, afterEndDate); }
    finally { setExtendSaving(false); }
  };

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
    <div className={`px-4 py-3 ${canSelect ? 'cursor-pointer' : ''}`}
      onClick={canSelect ? () => onToggleSelect(row.paymentId) : undefined}
      style={{
        background: selected
          ? 'linear-gradient(135deg, rgba(139,92,246,0.12), rgba(236,72,153,0.06))'
          : bucketStyle.bg,
        borderBottom: '1px solid var(--glass-border)',
      }}>
      <div className="flex items-center gap-3">
        {/* Checkbox (selection mode only) */}
        {selectionMode && (
          <button onClick={(e) => { e.stopPropagation(); if (canSelect) onToggleSelect(row.paymentId); }}
            disabled={!canSelect}
            aria-label={selected ? 'Deselect payment' : 'Select payment'}
            className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors disabled:opacity-30"
            style={{
              background: selected ? 'linear-gradient(135deg, var(--purple), var(--pink))' : 'var(--glass-bg-2)',
              border: selected ? '1px solid rgba(139,92,246,0.5)' : '1px solid var(--glass-border)',
            }}>
            {selected
              ? <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
              : <Square className="w-3.5 h-3.5" style={{ color: 'var(--muted-2)' }} />}
          </button>
        )}
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
            <Link href={`/loans/${row.loanId}`} onClick={(e) => e.stopPropagation()}
              className="hover:underline" style={{ color: 'var(--purple)' }}>
              Open loan
            </Link>
          </div>
        </div>

        {/* Action: hidden in selection mode (so the whole row toggles checkbox) */}
        {selectionMode ? null : !isEditing && !extendMode ? (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {isFullyPaid ? (
              <button onClick={handleClear} disabled={saving}
                className="px-2 py-2 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 flex items-center gap-1"
                style={{ color: 'var(--muted)', background: 'var(--glass-bg-2)', border: '1px solid var(--glass-border)' }}>
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Undo2 className="w-3.5 h-3.5" />}
              </button>
            ) : (
              <>
                {/* Overdue: one-tap defer to after loan end. Today: custom extend picker */}
                {row.bucket === 'overdue' && afterEndDate ? (
                  <button onClick={handleDeferToEnd} disabled={extendSaving || saving}
                    title={`Defer to ${afterEndLabel} (after loan end, no interest)`}
                    className="px-2.5 py-2 rounded-lg text-[11px] font-bold transition-all disabled:opacity-50 active:scale-95 flex items-center gap-1"
                    style={{ color: '#f59e0b', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)' }}>
                    {extendSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <CalendarClock className="w-3 h-3" />}
                    Defer
                  </button>
                ) : (
                  <button onClick={openExtend} disabled={saving || extendSaving}
                    title="Extend due date"
                    className="px-2 py-2 rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
                    style={{ color: '#f59e0b', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)' }}>
                    <CalendarClock className="w-3.5 h-3.5" />
                  </button>
                )}
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
        ) : isEditing ? (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button onClick={() => setEditing(undefined)} disabled={saving}
              className="w-9 h-9 rounded-lg flex items-center justify-center transition-colors disabled:opacity-50"
              style={{ background: 'var(--glass-bg-2)', border: '1px solid var(--glass-border)', color: 'var(--muted)' }}>
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          /* extend mode: close button */
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button onClick={() => setExtendMode(false)} disabled={extendSaving}
              className="w-9 h-9 rounded-lg flex items-center justify-center transition-colors disabled:opacity-50"
              style={{ background: 'var(--glass-bg-2)', border: '1px solid var(--glass-border)', color: 'var(--muted)' }}>
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Inline amount editor — hidden in selection mode */}
      {isEditing && !selectionMode && (
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

      {/* Extend due-date picker — shows when user taps the calendar-clock button */}
      {extendMode && !selectionMode && (() => {
        // afterEndDate / afterEndLabel are already computed at component level
        const endDateLabel = row.endDate
          ? new Date(row.endDate + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
          : null;

        return (
          <div className="mt-3 rounded-xl p-3"
            style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)' }}>
            <div className="flex items-center gap-1.5 mb-2.5">
              <CalendarClock className="w-3.5 h-3.5" style={{ color: '#f59e0b' }} />
              <span className="text-[11px] font-semibold" style={{ color: '#f59e0b' }}>
                Extend due date
              </span>
              <span className="text-[10px]" style={{ color: 'var(--muted)' }}>
                · was {new Date(row.dueDate + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
              </span>
            </div>

            {/* Quick presets */}
            <div className="flex flex-wrap gap-1.5 mb-2.5">
              {/* +1 week */}
              {(() => {
                const d = new Date(date + 'T00:00:00');
                d.setDate(d.getDate() + 7);
                const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                return (
                  <button key="+7" onClick={() => setExtendDate(iso)}
                    className="text-[10px] font-bold px-2 py-1 rounded-lg transition-colors"
                    style={{
                      background: extendDate === iso ? 'rgba(245,158,11,0.3)' : 'rgba(245,158,11,0.1)',
                      color: '#f59e0b',
                      border: `1px solid ${extendDate === iso ? 'rgba(245,158,11,0.5)' : 'rgba(245,158,11,0.2)'}`,
                    }}>
                    +1 week
                  </button>
                );
              })()}
              {/* +2 weeks */}
              {(() => {
                const d = new Date(date + 'T00:00:00');
                d.setDate(d.getDate() + 14);
                const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                return (
                  <button key="+14" onClick={() => setExtendDate(iso)}
                    className="text-[10px] font-bold px-2 py-1 rounded-lg transition-colors"
                    style={{
                      background: extendDate === iso ? 'rgba(245,158,11,0.3)' : 'rgba(245,158,11,0.1)',
                      color: '#f59e0b',
                      border: `1px solid ${extendDate === iso ? 'rgba(245,158,11,0.5)' : 'rgba(245,158,11,0.2)'}`,
                    }}>
                    +2 weeks
                  </button>
                );
              })()}
              {/* After loan end date */}
              {afterEndDate && (
                <button onClick={() => setExtendDate(afterEndDate)}
                  className="text-[10px] font-bold px-2 py-1 rounded-lg transition-colors flex items-center gap-1"
                  style={{
                    background: extendDate === afterEndDate ? 'rgba(139,92,246,0.3)' : 'rgba(139,92,246,0.1)',
                    color: 'var(--purple)',
                    border: `1px solid ${extendDate === afterEndDate ? 'rgba(139,92,246,0.5)' : 'rgba(139,92,246,0.2)'}`,
                  }}>
                  After end
                  <span style={{ color: 'var(--muted)', fontWeight: 400 }}>({endDateLabel}+1)</span>
                </button>
              )}
            </div>

            {/* Date picker + save */}
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={extendDate}
                onChange={e => setExtendDate(e.target.value)}
                min={date}
                className="input py-2 text-sm font-bold flex-1"
              />
              <button
                onClick={saveExtend}
                disabled={extendSaving || !extendDate}
                className="px-3 py-2 rounded-lg text-xs font-bold text-white transition-all disabled:opacity-50 active:scale-95 flex items-center gap-1"
                style={{
                  background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                  boxShadow: '0 2px 10px rgba(245,158,11,0.35)',
                }}>
                {extendSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" strokeWidth={3} />}
                Set
              </button>
            </div>
            {extendDate && row.endDate && extendDate > row.endDate && (
              <p className="text-[10px] mt-1.5 font-semibold flex items-center gap-1" style={{ color: 'var(--purple)' }}>
                <CalendarClock className="w-3 h-3 flex-shrink-0" />
                Loan end date will extend from{' '}
                {new Date(row.endDate + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                {' '}→{' '}
                {new Date(extendDate + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
              </p>
            )}
          </div>
        );
      })()}
    </div>
  );
}

// ─── Empty ───
function EmptyState({ tab, search, isToday }: { tab: FilterTab; search: string; isToday: boolean }) {
  if (search) {
    return (
      <div className="card p-10 text-center">
        <Search className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--muted-2)' }} />
        <p className="text-sm font-semibold" style={{ color: 'var(--muted)' }}>No borrower matches &ldquo;{search}&rdquo;</p>
      </div>
    );
  }
  const msg =
    tab === 'today'   ? (isToday ? 'Nothing due today — all caught up!' : 'Nothing due on this date')
    : tab === 'overdue' ? 'No overdue payments!'
    : tab === 'paid'    ? 'No collections recorded yet'
    : 'No data for this day';
  const sub =
    tab === 'today'   ? (isToday ? 'Check the Overdue tab if there are past dues.' : 'Try a different date.')
    : tab === 'overdue' ? 'Great job keeping your book clean.'
    : tab === 'paid'    ? 'Collections will appear here as you mark them paid.'
    : 'Try a different date';

  return (
    <div className="card p-12 text-center">
      <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3"
        style={{ background: (tab === 'overdue' || tab === 'today') ? 'rgba(16,185,129,0.12)' : 'var(--glass-bg-2)' }}>
        {(tab === 'overdue' || tab === 'today')
          ? <CheckCircle2 className="w-7 h-7" style={{ color: 'var(--green)' }} />
          : <IndianRupee className="w-6 h-6" style={{ color: 'var(--muted-2)' }} />}
      </div>
      <p className="font-bold text-sm mb-1" style={{ color: 'var(--text)' }}>{msg}</p>
      <p className="text-xs" style={{ color: 'var(--muted)' }}>{sub}</p>
    </div>
  );
}
