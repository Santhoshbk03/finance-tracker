'use client';
import { useEffect, useState, use, useCallback } from 'react';
import Header from '@/components/layout/Header';
import Link from 'next/link';
import {
  ChevronLeft, Phone, MapPin, FileText, CheckCircle2,
  Clock, AlertTriangle, IndianRupee, Pencil, X, Check,
  ChevronDown, ChevronUp, Calendar, Trash2, Banknote,
  ListChecks, Square, Loader2, Settings2, RefreshCw, MessageCircle,
} from 'lucide-react';
import { useRouter } from 'next/navigation';

interface Payment {
  id: string; loanId?: string;
  periodNumber?: number; week_number?: number;
  dueDate?: string; due_date?: string;
  expectedAmount?: number; expected_amount?: number;
  paidAmount?: number; paid_amount?: number;
  paidDate?: string | null; paid_date?: string | null;
  status: string; notes: string | null;
}
interface Loan {
  id: string;
  customerId?: string; customer_id?: string;
  customerName?: string; customer_name?: string;
  customerPhone?: string | null; customer_phone?: string | null;
  customerAddress?: string | null; customer_address?: string | null;
  principal: number;
  interestRate?: number; interest_rate?: number;
  loanTermPeriods?: number; loan_term_weeks?: number;
  totalPeriods?: number; total_weeks?: number;
  interestAmount?: number; interest_amount?: number;
  totalAmount?: number; total_amount?: number;
  periodAmount?: number; weekly_amount?: number;
  startDate?: string; start_date?: string;
  endDate?: string;
  notes: string | null;
  status: string;
  planType?: string;
  interestCollected?: boolean; interest_collected?: number | boolean;
  interestCollectedDate?: string | null; interest_collected_date?: string | null;
  payments: Payment[];
}

function formatINR(n: number) {
  return '₹' + (n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

function computeDisplayStatus(p: Payment): string {
  const today = new Date().toISOString().split('T')[0];
  const due = p.dueDate ?? p.due_date ?? '';
  const paid = p.paidAmount ?? p.paid_amount ?? 0;
  const expected = p.expectedAmount ?? p.expected_amount ?? 0;
  if (paid >= expected) return 'paid';
  if (paid > 0) return 'partial';
  if (due < today) return 'overdue';
  const diffDays = Math.ceil((new Date(due).getTime() - new Date(today).getTime()) / 86400000);
  if (diffDays <= 2) return 'due-soon';
  return 'pending';
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    paid: 'pill-paid', pending: 'pill-pending', overdue: 'pill-overdue',
    partial: 'pill-partial', 'due-soon': 'pill-partial',
    active: 'pill-active', completed: 'pill-completed',
  };
  return <span className={`pill ${map[status] || 'pill-pending'} capitalize`}>{status.replace('-', ' ')}</span>;
}

function PaymentRow({
  payment, onUpdate,
  selectionMode, selected, onToggleSelect,
}: {
  payment: Payment;
  onUpdate: (id: string, paid: number, date: string, notes: string) => Promise<void>;
  selectionMode: boolean;
  selected: boolean;
  onToggleSelect: (paymentId: string) => void;
}) {
  const displayStatus = computeDisplayStatus(payment);
  const today = new Date().toISOString().split('T')[0];
  const due = payment.dueDate ?? payment.due_date ?? '';
  const isDueToday = due === today;
  const periodNum = payment.periodNumber ?? payment.week_number ?? 0;
  const expectedAmt = payment.expectedAmount ?? payment.expected_amount ?? 0;
  const paidAmt = payment.paidAmount ?? payment.paid_amount ?? 0;
  const paidDateVal = payment.paidDate ?? payment.paid_date;
  // Already-fully-paid rows can't participate in bulk-collect (matches the
  // collect page behaviour and the bulk-collect endpoint guard).
  const isFullyPaid = paidAmt >= expectedAmt && expectedAmt > 0;
  const canSelect = selectionMode && !isFullyPaid && expectedAmt > 0;

  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setAmount(paidAmt > 0 ? String(paidAmt) : '');
    setDate(paidDateVal || today);
    setNotes(payment.notes || '');
  }, [paidAmt, paidDateVal, payment.notes, today]);

  const handleSave = async () => {
    setSaving(true);
    await onUpdate(payment.id, parseFloat(amount) || 0, date, notes);
    setSaving(false);
    setOpen(false);
  };

  const statusIcon = {
    paid:     <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--green)' }} />,
    overdue:  <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--red)' }} />,
    partial:  <Clock className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--amber)' }} />,
    'due-soon': <Clock className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--amber)' }} />,
    pending:  <Clock className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--muted-2)' }} />,
  }[displayStatus] ?? <Clock className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--muted-2)' }} />;

  const rowStyle = displayStatus === 'overdue'
    ? { background: 'rgba(244,63,94,0.05)' }
    : isDueToday
    ? { background: 'rgba(245,158,11,0.05)' }
    : {};

  // In selection mode, the whole row toggles the checkbox instead of the
  // expandable editor. Keeps the interaction unambiguous for bulk flows.
  const handleRowClick = () => {
    if (selectionMode) {
      if (canSelect) onToggleSelect(payment.id);
      return;
    }
    setOpen(o => !o);
  };

  return (
    <div className="border-b last:border-0"
      style={{
        borderColor: 'var(--glass-border)',
        ...(selected ? { background: 'linear-gradient(135deg, rgba(139,92,246,0.10), rgba(236,72,153,0.05))' } : rowStyle),
      }}>
      <button onClick={handleRowClick}
        disabled={selectionMode && !canSelect}
        className="w-full flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-white/[0.03] text-left disabled:opacity-50 disabled:cursor-not-allowed">
        {/* Checkbox in selection mode */}
        {selectionMode && (
          <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{
              background: selected ? 'linear-gradient(135deg, var(--purple), var(--pink))' : 'var(--glass-bg-2)',
              border: selected ? '1px solid rgba(139,92,246,0.5)' : '1px solid var(--glass-border)',
              opacity: canSelect ? 1 : 0.4,
            }}>
            {selected
              ? <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
              : <Square className="w-3.5 h-3.5" style={{ color: 'var(--muted-2)' }} />}
          </div>
        )}
        {/* Period badge */}
        <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: 'var(--glass-bg-2)', border: '1px solid var(--glass-border)' }}>
          <span className="text-[11px] font-bold" style={{ color: 'var(--muted)' }}>
            {(payment as any).planType === 'daily' ? `D${periodNum}` : `W${periodNum}`}
          </span>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {statusIcon}
            <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>
              {due ? new Date(due + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
            </span>
            {isDueToday && (
              <span className="text-xs font-semibold px-1.5 py-0.5 rounded-md"
                style={{ background: 'rgba(245,158,11,0.15)', color: '#fbbf24' }}>Today</span>
            )}
            <StatusPill status={displayStatus} />
          </div>
          {payment.notes && (
            <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--muted)' }}>{payment.notes}</p>
          )}
        </div>

        {/* Amounts */}
        <div className="text-right flex-shrink-0 mr-2">
          <p className="text-sm font-bold"
            style={{ color: displayStatus === 'paid' ? 'var(--green)' : displayStatus === 'overdue' ? 'var(--red)' : 'var(--text)' }}>
            {paidAmt > 0 ? formatINR(paidAmt) : '—'}
          </p>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>of {formatINR(expectedAmt)}</p>
        </div>

        {!selectionMode && (open
          ? <ChevronUp className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--muted)' }} />
          : <ChevronDown className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--muted)' }} />)}
      </button>

      {open && !selectionMode && (
        <div className="px-5 pb-4" style={{ borderTop: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.15)' }}>
          <div className="pt-4 grid grid-cols-2 gap-3">
            <div>
              <label className="section-label block mb-1.5">Amount Paid (₹)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: 'var(--muted)' }}>₹</span>
                <input value={amount} onChange={e => setAmount(e.target.value)}
                  type="number" min="0" className="input pl-7 py-2 text-sm"
                  placeholder={String(expectedAmt)} />
              </div>
            </div>
            <div>
              <label className="section-label block mb-1.5">Date Collected</label>
              <input value={date} onChange={e => setDate(e.target.value)} type="date" className="input py-2 text-sm" />
            </div>
            <div className="col-span-2">
              <label className="section-label block mb-1.5">Notes</label>
              <input value={notes} onChange={e => setNotes(e.target.value)}
                className="input py-2 text-sm" placeholder="Optional note…" />
            </div>
            <div className="col-span-2 flex gap-2 flex-wrap items-center">
              <button type="button" onClick={() => setAmount(String(expectedAmt))}
                className="text-xs px-3 py-1.5 rounded-lg transition-colors"
                style={{ border: '1px solid var(--glass-border)', color: 'var(--muted)', background: 'var(--glass-bg)' }}>
                Full ({formatINR(expectedAmt)})
              </button>
              <div className="flex-1" />
              <button onClick={() => setOpen(false)} className="btn-ghost py-2 text-xs">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary py-2 text-xs disabled:opacity-50">
                <Check className="w-3.5 h-3.5" />
                {saving ? 'Saving…' : 'Mark Collected'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── WhatsApp loan-statement message ───────────────────────────────────────────
function buildLoanWaMessage(loan: Loan): string {
  const firstName = (loan.customerName ?? loan.customer_name ?? '').split(' ')[0] || 'there';
  const isDaily = loan.planType === 'daily';
  const totalPeriods = loan.totalPeriods ?? loan.total_weeks ?? 0;
  const periodAmt = loan.periodAmount ?? loan.weekly_amount ?? 0;
  const today = new Date().toISOString().split('T')[0];

  const paidCount = loan.payments.filter(p => {
    const paid = p.paidAmount ?? p.paid_amount ?? 0;
    const exp  = p.expectedAmount ?? p.expected_amount ?? 0;
    return exp > 0 && paid >= exp;
  }).length;

  const overdueCount = loan.payments.filter(p => {
    const paid = p.paidAmount ?? p.paid_amount ?? 0;
    const exp  = p.expectedAmount ?? p.expected_amount ?? 0;
    const due  = p.dueDate ?? p.due_date ?? '';
    return exp > 0 && paid < exp && due < today;
  }).length;

  const totalCollected = loan.payments.reduce((s, p) => s + (p.paidAmount ?? p.paid_amount ?? 0), 0);
  const outstanding = Math.max(0, loan.principal - totalCollected);

  const fmt = (n: number) => '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 });

  let msg = `Hi ${firstName} 👋\n\n*Loan Statement*\n`;
  msg += `• Principal: ${fmt(loan.principal)}\n`;
  msg += `• ${isDaily ? 'Daily' : 'Weekly'} payment: ${fmt(periodAmt)}\n`;
  msg += `• Progress: ${paidCount}/${totalPeriods} ${isDaily ? 'days' : 'weeks'} paid\n`;
  msg += `• Collected so far: ${fmt(totalCollected)}\n`;
  if (outstanding > 0) msg += `• Outstanding: ${fmt(outstanding)}\n`;

  if (overdueCount > 0) {
    msg += `\n⚠️ You have ${overdueCount} overdue payment${overdueCount > 1 ? 's' : ''}. Please clear at the earliest. 🙏`;
  } else if (loan.status === 'completed') {
    msg += `\n✅ Loan fully paid — thank you! 🙏`;
  } else {
    msg += `\nThank you for your regular payments! 🙏`;
  }
  return msg;
}

export default function LoanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [loan, setLoan] = useState<Loan | null>(null);
  const [loading, setLoading] = useState(true);
  const [editNotes, setEditNotes] = useState(false);
  const [notes, setNotes] = useState('');
  const [showDelete, setShowDelete] = useState(false);
  const [markingInterest, setMarkingInterest] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  // Bulk-select state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkSaving, setBulkSaving] = useState(false);
  // Edit-loan panel
  const [showEdit, setShowEdit] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    customerName: '', customerPhone: '', notes: '',
    principal: '', interestRate: '', loanTermPeriods: '',
    startDate: '', planType: 'weekly' as 'weekly' | 'daily',
    useCustomInterest: false,
    customInterestMode: 'fixed' as 'fixed' | 'percent',
    customInterestVal: '',
  });
  const [editRegenConfirm, setEditRegenConfirm] = useState(false);
  // Inline interest-amount editor (on the Upfront Interest card)
  const [editInterest, setEditInterest] = useState(false);
  const [intMode, setIntMode] = useState<'fixed' | 'percent'>('fixed');
  const [intVal, setIntVal] = useState('');
  const [intSaving, setIntSaving] = useState(false);

  const flash = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 2600);
  };

  // First load uses `loading` (shows skeleton); refreshes after mutations don't (avoids full-screen flicker)
  const fetchLoan = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    try {
      const r = await fetch(`/api/loans/${id}`);
      const d = await r.json();
      if (!d.error) { setLoan(d); setNotes(d.notes || ''); }
    } catch (e) {
      console.error(e);
      flash('error', 'Failed to load loan');
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchLoan(true); }, [fetchLoan]);

  // Pre-fill edit form whenever loan data changes
  useEffect(() => {
    if (!loan) return;
    setEditForm({
      customerName:    loan.customerName ?? loan.customer_name ?? '',
      customerPhone:   (loan.customerPhone ?? loan.customer_phone ?? '') as string,
      notes:           loan.notes ?? '',
      principal:       String(loan.principal),
      interestRate:    String(loan.interestRate ?? loan.interest_rate ?? 0),
      loanTermPeriods: String(loan.loanTermPeriods ?? loan.loan_term_weeks ?? 0),
      startDate:       loan.startDate ?? loan.start_date ?? '',
      planType:        (loan.planType ?? 'weekly') as 'weekly' | 'daily',
      useCustomInterest: true,
      customInterestMode: 'fixed',
      customInterestVal: String(loan.interestAmount ?? loan.interest_amount ?? 0),
    });
  }, [loan]);

  // Apply optimistic updates to the local loan state so we don't refetch after
  // every payment save. Mirrors the bulk-collect endpoint's status logic.
  const applyOptimisticPaymentUpdates = useCallback((
    ups: Array<{ paymentId: string; paidAmount: number; paidDate: string | null; notes?: string }>
  ) => {
    if (ups.length === 0) return;
    const map = new Map(ups.map(u => [u.paymentId, u]));
    const todayLocal = new Date().toISOString().split('T')[0];
    setLoan(prev => {
      if (!prev) return prev;
      const newPayments = prev.payments.map(p => {
        const u = map.get(p.id);
        if (!u) return p;
        const expected = p.expectedAmount ?? p.expected_amount ?? 0;
        let status: string;
        if (u.paidAmount >= expected && expected > 0) status = 'paid';
        else if (u.paidAmount > 0) status = 'partial';
        else {
          const due = p.dueDate ?? p.due_date ?? '';
          status = due && due < todayLocal ? 'overdue' : 'pending';
        }
        return {
          ...p,
          paidAmount: u.paidAmount,
          paid_amount: u.paidAmount,
          paidDate: u.paidDate,
          paid_date: u.paidDate,
          notes: u.notes !== undefined ? u.notes : p.notes,
          status,
        };
      });
      // Loan-level status: if all rows now paid, mark completed locally.
      const allPaid = newPayments.every(p => {
        const expected = p.expectedAmount ?? p.expected_amount ?? 0;
        const paid = p.paidAmount ?? p.paid_amount ?? 0;
        return expected > 0 && paid >= expected;
      });
      return {
        ...prev,
        payments: newPayments,
        status: allPaid ? 'completed' : prev.status,
      };
    });
  }, []);

  const handlePaymentUpdate = async (paymentId: string, paid_amount: number, paid_date: string, paymentNotes: string) => {
    try {
      // Use the bulk endpoint with a single-item payload — saves the post-write
      // refetch (which on this page would re-hit Firestore for every payment).
      const res = await fetch('/api/payments/bulk-collect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payments: [{
            loanId: id,
            paymentId,
            paidAmount: paid_amount,
            paidDate: paid_amount > 0 ? paid_date : null,
            notes: paymentNotes,
          }],
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `HTTP ${res.status}`);
      }
      applyOptimisticPaymentUpdates([{
        paymentId,
        paidAmount: paid_amount,
        paidDate: paid_amount > 0 ? paid_date : null,
        notes: paymentNotes,
      }]);
      flash('success', paid_amount > 0 ? 'Payment recorded' : 'Payment cleared');
    } catch (e) {
      flash('error', e instanceof Error ? e.message : 'Failed to save');
      throw e;
    }
  };

  const toggleSelect = useCallback((paymentId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(paymentId)) next.delete(paymentId);
      else next.add(paymentId);
      return next;
    });
  }, []);

  const cancelSelection = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  const selectAllDue = useCallback(() => {
    if (!loan) return;
    setSelectedIds(prev => {
      const dueIds = loan.payments
        .filter(p => {
          const expected = p.expectedAmount ?? p.expected_amount ?? 0;
          const paid = p.paidAmount ?? p.paid_amount ?? 0;
          return expected > 0 && paid < expected;
        })
        .map(p => p.id);
      const allSelected = dueIds.length > 0 && dueIds.every(id => prev.has(id));
      const next = new Set(prev);
      if (allSelected) dueIds.forEach(id => next.delete(id));
      else dueIds.forEach(id => next.add(id));
      return next;
    });
  }, [loan]);

  const bulkCollectPayments = useCallback(async () => {
    if (!loan || selectedIds.size === 0) return;
    const todayLocal = new Date().toISOString().split('T')[0];
    const items: Array<{ loanId: string; paymentId: string; paidAmount: number; paidDate: string | null; notes?: string }> = [];
    const updates: Array<{ paymentId: string; paidAmount: number; paidDate: string | null; notes?: string }> = [];
    for (const p of loan.payments) {
      if (!selectedIds.has(p.id)) continue;
      const expected = p.expectedAmount ?? p.expected_amount ?? 0;
      const paid = p.paidAmount ?? p.paid_amount ?? 0;
      if (expected <= 0 || paid >= expected) continue;
      items.push({
        loanId: id,
        paymentId: p.id,
        paidAmount: expected,
        paidDate: todayLocal,
        notes: p.notes || '',
      });
      updates.push({ paymentId: p.id, paidAmount: expected, paidDate: todayLocal });
    }
    if (items.length === 0) {
      flash('error', 'Nothing to collect in selection');
      return;
    }
    setBulkSaving(true);
    try {
      const res = await fetch('/api/payments/bulk-collect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payments: items }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      applyOptimisticPaymentUpdates(updates);
      const total = items.reduce((s, i) => s + i.paidAmount, 0);
      flash('success', `Collected ${formatINR(total)} from ${items.length} payment${items.length > 1 ? 's' : ''}`);
      setSelectedIds(new Set());
      setSelectionMode(false);
    } catch (e) {
      flash('error', e instanceof Error ? e.message : 'Bulk collect failed');
    } finally {
      setBulkSaving(false);
    }
  }, [loan, selectedIds, id, applyOptimisticPaymentUpdates]);

  const selectedTotal = (() => {
    if (!loan || selectedIds.size === 0) return 0;
    let total = 0;
    for (const p of loan.payments) {
      if (!selectedIds.has(p.id)) continue;
      total += p.expectedAmount ?? p.expected_amount ?? 0;
    }
    return total;
  })();

  // ── Loan edit ────────────────────────────────────────────────────────────────
  const scheduleWillChange = loan
    ? (editForm.principal !== String(loan.principal) ||
       editForm.loanTermPeriods !== String(loan.loanTermPeriods ?? loan.loan_term_weeks ?? 0) ||
       editForm.startDate !== (loan.startDate ?? loan.start_date) ||
       editForm.planType !== (loan.planType ?? 'weekly'))
    : false;

  const handleSaveLoan = async () => {
    if (scheduleWillChange && !editRegenConfirm) {
      setEditRegenConfirm(true);
      return;
    }
    setEditSaving(true);
    try {
      const body: Record<string, unknown> = {
        customerName:  editForm.customerName,
        customerPhone: editForm.customerPhone,
        notes:         editForm.notes,
      };
      if (scheduleWillChange) {
        body.principal       = parseFloat(editForm.principal);
        body.interestRate    = parseFloat(editForm.interestRate);
        body.loanTermPeriods = parseInt(editForm.loanTermPeriods);
        body.startDate       = editForm.startDate;
        body.planType        = editForm.planType;
        body.regenerate      = true;
      }
      // Custom interest amount override (works with or without regeneration)
      if (editForm.useCustomInterest) {
        const principal = parseFloat(editForm.principal) || (loan?.principal ?? 0);
        const customAmt = editForm.customInterestMode === 'percent'
          ? Math.round(principal * (parseFloat(editForm.customInterestVal) || 0) / 100 * 100) / 100
          : parseFloat(editForm.customInterestVal) || 0;
        body.customInterestAmount = customAmt;
      }
      const res = await fetch(`/api/loans/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `HTTP ${res.status}`);
      }
      const updated = await res.json();
      setLoan(updated);
      setNotes(updated.notes || '');
      setShowEdit(false);
      setEditRegenConfirm(false);
      flash('success', scheduleWillChange ? 'Loan updated + schedule regenerated' : 'Loan updated');
    } catch (e) {
      flash('error', e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setEditSaving(false);
    }
  };

  const handleSaveNotes = async () => {
    try {
      const res = await fetch(`/api/loans/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      });
      if (!res.ok) throw new Error('Failed');
      setEditNotes(false);
      flash('success', 'Notes saved');
      await fetchLoan();
    } catch {
      flash('error', 'Failed to save notes');
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/loans/${id}`, { method: 'DELETE' });
      if (res.ok) router.push('/loans');
      else { flash('error', 'Failed to delete'); setDeleting(false); }
    } catch {
      flash('error', 'Failed to delete');
      setDeleting(false);
    }
  };

  const handleToggleInterest = async () => {
    if (!loan) return;
    setMarkingInterest(true);
    try {
      const current = loan.interestCollected ?? Boolean(loan.interest_collected);
      const res = await fetch(`/api/loans/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interest_collected: !current }),
      });
      if (!res.ok) throw new Error('Failed');
      flash('success', current ? 'Interest undone' : 'Interest marked collected');
      await fetchLoan();
    } catch {
      flash('error', 'Failed to update interest');
    } finally {
      setMarkingInterest(false);
    }
  };

  const handleSaveInterestAmount = async () => {
    if (!loan) return;
    setIntSaving(true);
    try {
      const amt = intMode === 'percent'
        ? Math.round(loan.principal * (parseFloat(intVal) || 0) / 100 * 100) / 100
        : parseFloat(intVal) || 0;
      const res = await fetch(`/api/loans/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interest_amount: amt }),
      });
      if (!res.ok) throw new Error('Failed');
      const updated = await res.json();
      setLoan(prev => prev ? {
        ...prev,
        interestAmount: updated.interestAmount ?? updated.interest_amount ?? amt,
        interest_amount: updated.interest_amount ?? amt,
      } : prev);
      setEditInterest(false);
      flash('success', 'Interest amount updated');
    } catch {
      flash('error', 'Failed to update interest amount');
    } finally {
      setIntSaving(false);
    }
  };

  if (loading) return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <Header title="Loan Details" />
      <div className="p-4 space-y-4">
        {[1,2,3].map(i => (
          <div key={i} className="card animate-pulse" style={{ height: 80 }} />
        ))}
      </div>
    </div>
  );

  if (!loan) return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <Header title="Loan Details" />
      <div className="p-6 text-center mt-16" style={{ color: 'var(--muted)' }}>Loan not found</div>
    </div>
  );

  const name = loan.customerName ?? loan.customer_name ?? '?';
  const phone = loan.customerPhone ?? loan.customer_phone;
  const address = loan.customerAddress ?? loan.customer_address;
  const interestRate = loan.interestRate ?? loan.interest_rate ?? 0;
  const termPeriods = loan.loanTermPeriods ?? loan.loan_term_weeks ?? 0;
  const totalPeriods = loan.totalPeriods ?? loan.total_weeks ?? 0;
  const interestAmt = loan.interestAmount ?? loan.interest_amount ?? 0;
  const periodAmt = loan.periodAmount ?? loan.weekly_amount ?? 0;
  const startDate = loan.startDate ?? loan.start_date ?? '';
  const interestCollected = loan.interestCollected ?? Boolean(loan.interest_collected);
  const interestCollectedDate = loan.interestCollectedDate ?? loan.interest_collected_date;
  const isDaily = loan.planType === 'daily';
  const period = isDaily ? 'day' : 'week';
  const months = Math.ceil(termPeriods / (isDaily ? 30 : 4));

  const totalCollected = loan.payments.reduce((s, p) => s + (p.paidAmount ?? p.paid_amount ?? 0), 0);
  const paidCount = loan.payments.filter(p => computeDisplayStatus(p) === 'paid').length;
  const overdueCount = loan.payments.filter(p => computeDisplayStatus(p) === 'overdue').length;
  const progress = totalPeriods > 0 ? Math.round((paidCount / totalPeriods) * 100) : 0;
  const outstanding = Math.max(0, loan.principal - totalCollected);

  // Edit modal — auto-calculated interest based on current form values
  const editCalcInterest = (() => {
    const p = parseFloat(editForm.principal) || loan.principal;
    const r = parseFloat(editForm.interestRate) || (loan.interestRate ?? loan.interest_rate ?? 0);
    const t = parseInt(editForm.loanTermPeriods) || (loan.loanTermPeriods ?? loan.loan_term_weeks ?? 0);
    const m = Math.ceil(t / (editForm.planType === 'daily' ? 30 : 4));
    return Math.round(p * r * m / 100 * 100) / 100;
  })();

  const editCustomInterestAmt = (() => {
    const p = parseFloat(editForm.principal) || loan.principal;
    const v = parseFloat(editForm.customInterestVal) || 0;
    return editForm.customInterestMode === 'percent'
      ? Math.round(p * v / 100 * 100) / 100
      : v;
  })();

  // Inline interest card editor
  const intComputedAmt = intMode === 'percent'
    ? Math.round(loan.principal * (parseFloat(intVal) || 0) / 100 * 100) / 100
    : parseFloat(intVal) || 0;

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <Header title="Loan Details" />
      <div className="p-4 max-w-2xl mx-auto space-y-4 pb-28">

        <div className="flex items-center justify-between">
          <Link href="/loans" className="inline-flex items-center gap-1 text-sm transition-colors hover:opacity-80"
            style={{ color: 'var(--muted)' }}>
            <ChevronLeft className="w-4 h-4" /> Loans
          </Link>
          <div className="flex items-center gap-2">
            <button onClick={() => { setShowEdit(true); setEditRegenConfirm(false); }}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors"
              style={{ color: 'var(--purple)', background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)' }}>
              <Settings2 className="w-3.5 h-3.5" /> Edit
            </button>
            <button onClick={() => setShowDelete(true)}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors"
              style={{ color: '#fb7185', background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.15)' }}>
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
          </div>
        </div>

        {/* Customer Card */}
        <div className="card p-5">
          <div className="flex items-center gap-4">
            <div className="avatar flex-shrink-0 text-2xl font-black" style={{ width: 56, height: 56 }}>
              {name[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>{name}</h1>
                <StatusPill status={loan.status} />
                {isDaily && <span className="pill" style={{ background: 'rgba(6,182,212,0.12)', color: '#22d3ee', border: '1px solid rgba(6,182,212,0.2)' }}>Daily</span>}
              </div>
              {phone && (
                <div className="flex items-center gap-2 flex-wrap mt-1">
                  <a href={`tel:${phone}`}
                    className="text-sm flex items-center gap-1.5" style={{ color: 'var(--muted)' }}>
                    <Phone className="w-3.5 h-3.5" /> {phone}
                  </a>
                  {(() => {
                    const waPhone = phone.replace(/\D/g, '').replace(/^0/, '').replace(/^(?!91)/, '91');
                    return (
                      <a
                        href={`https://wa.me/${waPhone}?text=${encodeURIComponent(buildLoanWaMessage(loan))}`}
                        target="_blank" rel="noopener noreferrer"
                        className="text-xs font-semibold flex items-center gap-1 px-2 py-0.5 rounded-md transition-colors"
                        style={{ background: 'rgba(37,211,102,0.12)', color: '#25d366', border: '1px solid rgba(37,211,102,0.2)' }}>
                        <MessageCircle className="w-3 h-3" /> WhatsApp
                      </a>
                    );
                  })()}
                </div>
              )}
              {address && (
                <p className="text-sm flex items-center gap-1.5 mt-0.5" style={{ color: 'var(--muted)' }}>
                  <MapPin className="w-3.5 h-3.5" /> {address}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Loan Stats */}
        <div className="card p-5">
          <div className="grid grid-cols-2 gap-4 mb-5">
            {[
              { label: 'Principal', value: formatINR(loan.principal), big: true, color: 'var(--text)' },
              { label: `${isDaily ? 'Daily' : 'Weekly'} Amount`, value: formatINR(periodAmt), big: true, color: 'var(--green)' },
              { label: `Interest Fee (${interestRate}%×${months}mo)`, value: formatINR(interestAmt), color: 'var(--muted)' },
              { label: `Total ${isDaily ? 'Days' : 'Weeks'}`, value: `${totalPeriods} ${isDaily ? 'days' : 'wks'}`, color: 'var(--muted)' },
              { label: 'Collected', value: formatINR(totalCollected), color: 'var(--green)' },
              { label: 'Outstanding', value: outstanding > 0 ? formatINR(outstanding) : '—', color: outstanding > 0 ? 'var(--amber)' : 'var(--muted)' },
            ].map(({ label, value, big, color }) => (
              <div key={label}>
                <p className="section-label mb-1">{label}</p>
                <p className={big ? 'text-2xl font-black' : 'text-base font-semibold'} style={{ color }}>{value}</p>
              </div>
            ))}
          </div>

          {/* Progress */}
          <div>
            <div className="flex justify-between text-xs mb-1.5" style={{ color: 'var(--muted)' }}>
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                {startDate ? new Date(startDate + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
              </span>
              <span className="font-semibold" style={{ color: 'var(--text)' }}>{paidCount}/{totalPeriods} {isDaily ? 'days' : 'weeks'}</span>
            </div>
            <div className="h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--glass-bg-2)' }}>
              <div className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${progress}%`,
                  background: 'linear-gradient(90deg, var(--purple), var(--violet))',
                  boxShadow: '0 0 8px rgba(139,92,246,0.4)',
                }} />
            </div>
            <div className="flex justify-between mt-2">
              <span className="text-xs" style={{ color: 'var(--muted)' }}>{progress}% complete</span>
              {overdueCount > 0 && (
                <span className="text-xs flex items-center gap-1" style={{ color: 'var(--red)' }}>
                  <AlertTriangle className="w-3 h-3" /> {overdueCount} overdue
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Upfront Interest */}
        <div className="card p-5"
          style={{ borderColor: interestCollected ? 'rgba(16,185,129,0.25)' : 'rgba(245,158,11,0.25)' }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Banknote className="w-4 h-4" style={{ color: interestCollected ? 'var(--green)' : 'var(--amber)' }} />
              <h3 className="font-semibold text-[15px]" style={{ color: 'var(--text)' }}>Upfront Interest</h3>
            </div>
            {interestCollected
              ? <span className="pill pill-paid"><CheckCircle2 className="w-3 h-3" /> Collected</span>
              : <span className="pill pill-partial">Pending</span>}
          </div>

          {/* Amount row */}
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-2xl font-black" style={{ color: 'var(--text)' }}>{formatINR(interestAmt)}</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                {interestCollected
                  ? `Collected on ${interestCollectedDate ? new Date(interestCollectedDate + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'loan start'}`
                  : `Due on ${startDate ? new Date(startDate + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {/* Edit amount button */}
              {!editInterest && (
                <button
                  onClick={() => { setIntVal(String(interestAmt)); setIntMode('fixed'); setEditInterest(true); }}
                  className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
                  style={{ background: 'var(--glass-bg-2)', border: '1px solid var(--glass-border)', color: 'var(--muted)' }}
                  title="Edit interest amount">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              )}
              <button onClick={handleToggleInterest} disabled={markingInterest}
                className="px-4 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 text-white"
                style={interestCollected
                  ? { background: 'var(--glass-bg-2)', color: 'var(--muted)', border: '1px solid var(--glass-border)' }
                  : { background: 'var(--green)', boxShadow: '0 4px 16px var(--glow-green)' }}>
                {markingInterest ? '…' : interestCollected ? 'Undo' : 'Mark Collected'}
              </button>
            </div>
          </div>

          {/* Inline interest amount editor */}
          {editInterest && (
            <div className="rounded-xl p-4 space-y-3"
              style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)' }}>
              <p className="text-xs font-semibold" style={{ color: '#fbbf24' }}>Edit Interest Amount</p>

              {/* Mode toggle */}
              <div className="grid grid-cols-2 gap-1 p-1 rounded-lg" style={{ background: 'var(--glass-bg-2)' }}>
                {(['fixed', 'percent'] as const).map(m => (
                  <button key={m} type="button"
                    onClick={() => {
                      setIntMode(m);
                      // Convert current value when switching modes
                      if (m === 'percent' && loan.principal > 0) {
                        const amt = parseFloat(intVal) || 0;
                        setIntVal(String(Math.round(amt / loan.principal * 100 * 100) / 100));
                      } else {
                        setIntVal(String(intComputedAmt || interestAmt));
                      }
                    }}
                    className="py-1.5 rounded-md text-xs font-bold transition-all"
                    style={{
                      background: intMode === m ? 'linear-gradient(135deg, var(--amber), #d97706)' : 'transparent',
                      color: intMode === m ? '#fff' : 'var(--muted)',
                    }}>
                    {m === 'fixed' ? '₹ Fixed Amount' : '% of Principal'}
                  </button>
                ))}
              </div>

              {/* Input */}
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-medium"
                  style={{ color: 'var(--muted-2)' }}>
                  {intMode === 'fixed' ? '₹' : '%'}
                </span>
                <input
                  type="number" min="0" step={intMode === 'percent' ? '0.1' : '1'}
                  value={intVal}
                  onChange={e => setIntVal(e.target.value)}
                  className="input pl-8"
                  placeholder={intMode === 'fixed' ? '0' : '0.0'} />
              </div>

              {/* Preview */}
              {intMode === 'percent' && (
                <p className="text-xs" style={{ color: 'var(--muted)' }}>
                  = <strong style={{ color: 'var(--text)' }}>{formatINR(intComputedAmt)}</strong>
                  {' '}({parseFloat(intVal) || 0}% of {formatINR(loan.principal)})
                </p>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setEditInterest(false)}
                  className="btn-ghost flex-1 justify-center py-2 text-xs">
                  <X className="w-3.5 h-3.5" /> Cancel
                </button>
                <button type="button" onClick={handleSaveInterestAmount} disabled={intSaving}
                  className="flex-1 py-2 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-1.5 disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', boxShadow: '0 4px 12px rgba(245,158,11,0.3)' }}>
                  {intSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" strokeWidth={3} />}
                  {intSaving ? 'Saving…' : `Save ${formatINR(intComputedAmt)}`}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Notes */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-[15px] flex items-center gap-2" style={{ color: 'var(--text)' }}>
              <FileText className="w-4 h-4" style={{ color: 'var(--muted)' }} /> Notes
            </h3>
            {!editNotes ? (
              <button onClick={() => setEditNotes(true)} className="btn-ghost py-1.5 text-xs">
                <Pencil className="w-3.5 h-3.5" /> Edit
              </button>
            ) : (
              <div className="flex gap-2">
                <button onClick={() => { setEditNotes(false); setNotes(loan.notes || ''); }} className="btn-ghost py-1.5 text-xs">
                  <X className="w-3.5 h-3.5" /> Cancel
                </button>
                <button onClick={handleSaveNotes} className="btn-primary py-1.5 text-xs">
                  <Check className="w-3.5 h-3.5" /> Save
                </button>
              </div>
            )}
          </div>
          {editNotes ? (
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
              className="input resize-none text-sm" placeholder="Add notes about this loan…" />
          ) : (
            <p className="text-sm min-h-[2rem]" style={{ color: loan.notes ? 'var(--text)' : 'var(--muted-2)' }}>
              {loan.notes || 'No notes added'}
            </p>
          )}
        </div>

        {/* Payment Tracker */}
        <div className="card overflow-hidden">
          <div className="px-5 py-4 flex items-center justify-between flex-wrap gap-2"
            style={{ borderBottom: '1px solid var(--glass-border)' }}>
            <h3 className="font-semibold text-[15px] flex items-center gap-2" style={{ color: 'var(--text)' }}>
              <IndianRupee className="w-4 h-4" style={{ color: 'var(--purple)' }} />
              {isDaily ? 'Daily' : 'Weekly'} Collections ({totalPeriods} {isDaily ? 'days' : 'weeks'})
            </h3>
            <div className="flex items-center gap-2">
              {selectionMode ? (
                <>
                  <button onClick={selectAllDue}
                    className="text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1"
                    style={{ color: 'var(--purple)', background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.2)' }}>
                    <Square className="w-3 h-3" /> All due
                  </button>
                  <button onClick={cancelSelection}
                    className="text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1"
                    style={{ color: 'var(--muted)', background: 'var(--glass-bg-2)', border: '1px solid var(--glass-border)' }}>
                    <X className="w-3 h-3" /> Cancel
                  </button>
                </>
              ) : (
                <button onClick={() => setSelectionMode(true)}
                  disabled={loan.payments.length === 0}
                  className="text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1 disabled:opacity-50"
                  style={{ color: 'var(--purple)', background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.2)' }}>
                  <ListChecks className="w-3 h-3" /> Select
                </button>
              )}
            </div>
          </div>
          {!selectionMode && (
            <div className="px-5 py-2 flex items-center gap-3 text-xs"
              style={{ color: 'var(--muted)', borderBottom: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.12)' }}>
              <span className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" style={{ color: 'var(--green)' }} /> Paid</span>
              <span className="flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" style={{ color: 'var(--red)' }} /> Overdue</span>
              <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" style={{ color: 'var(--muted-2)' }} /> Pending</span>
            </div>
          )}
          <div>
            {loan.payments.length === 0 ? (
              <p className="text-sm text-center py-8" style={{ color: 'var(--muted)' }}>No payment schedule found</p>
            ) : (
              loan.payments.map(p => (
                <PaymentRow key={p.id} payment={{ ...p, planType: loan.planType } as any} onUpdate={handlePaymentUpdate}
                  selectionMode={selectionMode}
                  selected={selectedIds.has(p.id)}
                  onToggleSelect={toggleSelect} />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Floating bulk action bar */}
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
                <p className="text-base font-black text-white truncate">{formatINR(selectedTotal)}</p>
              )}
            </div>
            <button onClick={cancelSelection} disabled={bulkSaving}
              className="px-3 py-2 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
              style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)' }}>
              Cancel
            </button>
            <button onClick={bulkCollectPayments} disabled={bulkSaving || selectedIds.size === 0}
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

      {/* ── Edit Loan Modal ── */}
      {showEdit && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
          <div className="w-full max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-y-auto max-h-[90vh]"
            style={{ background: 'var(--surface)', border: '1px solid var(--glass-border)' }}>
            {/* Header */}
            <div className="sticky top-0 px-5 pt-5 pb-4 flex items-center justify-between"
              style={{ background: 'var(--surface)', borderBottom: '1px solid var(--glass-border)' }}>
              <h3 className="font-bold text-base flex items-center gap-2" style={{ color: 'var(--text)' }}>
                <Settings2 className="w-4 h-4" style={{ color: 'var(--purple)' }} /> Edit Loan
              </h3>
              <button onClick={() => { setShowEdit(false); setEditRegenConfirm(false); }}
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: 'var(--glass-bg-2)', color: 'var(--muted)' }}>
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Customer info */}
              <div>
                <p className="section-label mb-2">Customer</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="section-label block mb-1">Name</label>
                    <input value={editForm.customerName} onChange={e => setEditForm(f => ({ ...f, customerName: e.target.value }))}
                      className="input py-2 text-sm" placeholder="Name" />
                  </div>
                  <div>
                    <label className="section-label block mb-1">Phone</label>
                    <input value={editForm.customerPhone} onChange={e => setEditForm(f => ({ ...f, customerPhone: e.target.value }))}
                      className="input py-2 text-sm" placeholder="+91…" type="tel" />
                  </div>
                </div>
              </div>

              {/* Loan terms */}
              <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '1rem' }}>
                <p className="section-label mb-2 flex items-center gap-1.5">
                  Loan Terms
                  {scheduleWillChange && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                      style={{ background: 'rgba(245,158,11,0.15)', color: '#fbbf24' }}>
                      schedule will regenerate
                    </span>
                  )}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="section-label block mb-1">Plan</label>
                    <select value={editForm.planType} onChange={e => setEditForm(f => ({ ...f, planType: e.target.value as any }))}
                      className="input py-2 text-sm">
                      <option value="weekly">Weekly</option>
                      <option value="daily">Daily</option>
                    </select>
                  </div>
                  <div>
                    <label className="section-label block mb-1">Principal (₹)</label>
                    <input value={editForm.principal} onChange={e => setEditForm(f => ({ ...f, principal: e.target.value }))}
                      className="input py-2 text-sm" type="number" min="0" />
                  </div>
                  <div>
                    <label className="section-label block mb-1">Interest Rate (%)</label>
                    <input value={editForm.interestRate} onChange={e => setEditForm(f => ({ ...f, interestRate: e.target.value }))}
                      className="input py-2 text-sm" type="number" min="0" step="0.5" />
                  </div>
                  <div>
                    <label className="section-label block mb-1">{editForm.planType === 'daily' ? 'Days' : 'Weeks'}</label>
                    <input value={editForm.loanTermPeriods} onChange={e => setEditForm(f => ({ ...f, loanTermPeriods: e.target.value }))}
                      className="input py-2 text-sm" type="number" min="1" />
                  </div>
                  <div className="col-span-2">
                    <label className="section-label block mb-1">Start Date</label>
                    <input value={editForm.startDate} onChange={e => setEditForm(f => ({ ...f, startDate: e.target.value }))}
                      className="input py-2 text-sm" type="date" />
                  </div>

                  {/* Interest amount — always visible direct edit */}
                  <div className="col-span-2">
                    <label className="section-label block mb-1">
                      Interest Amount (₹)
                      <span className="ml-1.5 font-normal" style={{ color: 'var(--muted-2)' }}>
                        — auto: {formatINR(editCalcInterest)}
                      </span>
                    </label>
                    {/* Mode toggle */}
                    <div className="grid grid-cols-2 gap-1 p-1 mb-2 rounded-lg" style={{ background: 'var(--glass-bg-2)' }}>
                      {(['fixed', 'percent'] as const).map(m => (
                        <button key={m} type="button"
                          onClick={() => setEditForm(f => ({ ...f, customInterestMode: m, useCustomInterest: true, customInterestVal: m === 'percent' ? '' : f.customInterestVal }))}
                          className="py-1 rounded-md text-[11px] font-bold transition-all"
                          style={{
                            background: editForm.customInterestMode === m
                              ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'transparent',
                            color: editForm.customInterestMode === m ? '#fff' : 'var(--muted)',
                          }}>
                          {m === 'fixed' ? '₹ Fixed Amount' : '% of Principal'}
                        </button>
                      ))}
                    </div>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium"
                        style={{ color: 'var(--muted-2)' }}>
                        {editForm.customInterestMode === 'fixed' ? '₹' : '%'}
                      </span>
                      <input
                        type="number" min="0" step={editForm.customInterestMode === 'percent' ? '0.1' : '1'}
                        value={editForm.customInterestVal}
                        onChange={e => setEditForm(f => ({ ...f, customInterestVal: e.target.value, useCustomInterest: e.target.value !== '' }))}
                        className="input pl-7 py-2 text-sm"
                        placeholder={editForm.customInterestMode === 'fixed'
                          ? `${editCalcInterest} (auto)`
                          : 'e.g. 5'} />
                    </div>
                    {editForm.useCustomInterest && editForm.customInterestVal !== '' && (
                      <p className="text-[11px] mt-1" style={{ color: 'var(--muted)' }}>
                        → Interest set to{' '}
                        <strong style={{ color: '#fbbf24' }}>{formatINR(editCustomInterestAmt)}</strong>
                        {editForm.customInterestMode === 'percent' &&
                          ` (${editForm.customInterestVal}% of ${formatINR(parseFloat(editForm.principal) || loan.principal)})`}
                        {' '}<button type="button" className="underline text-[11px]"
                          style={{ color: 'var(--muted-2)' }}
                          onClick={() => setEditForm(f => ({ ...f, useCustomInterest: false, customInterestVal: '' }))}>
                          clear
                        </button>
                      </p>
                    )}
                    {!editForm.useCustomInterest && (
                      <p className="text-[11px] mt-1" style={{ color: 'var(--muted-2)' }}>
                        Leave blank to use auto-calculated amount ({formatINR(editCalcInterest)})
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="section-label block mb-1">Notes</label>
                <textarea value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2} className="input resize-none text-sm" placeholder="Optional notes…" />
              </div>

              {/* Regenerate confirmation warning */}
              {editRegenConfirm && scheduleWillChange && (
                <div className="rounded-xl p-4"
                  style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)' }}>
                  <div className="flex items-start gap-2">
                    <RefreshCw className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: '#fbbf24' }} />
                    <div>
                      <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>Regenerate payment schedule?</p>
                      <p className="text-xs" style={{ color: 'var(--muted)' }}>
                        All <strong>pending</strong> payment rows will be deleted and recreated from the new terms.
                        Already-collected payments are preserved.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-1">
                <button onClick={() => { setShowEdit(false); setEditRegenConfirm(false); }}
                  className="btn-ghost flex-1 justify-center py-3 text-sm">
                  Cancel
                </button>
                <button onClick={handleSaveLoan} disabled={editSaving}
                  className="flex-1 py-3 rounded-xl font-semibold text-sm text-white transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                  style={{
                    background: editRegenConfirm && scheduleWillChange
                      ? 'linear-gradient(135deg, #f59e0b, #d97706)'
                      : 'linear-gradient(135deg, var(--purple), var(--pink))',
                    boxShadow: '0 4px 16px rgba(139,92,246,0.3)',
                  }}>
                  {editSaving
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</>
                    : editRegenConfirm && scheduleWillChange
                    ? <><RefreshCw className="w-3.5 h-3.5" /> Confirm & Regenerate</>
                    : <><Check className="w-3.5 h-3.5" /> Save Changes</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {showDelete && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
          <div className="w-full max-w-sm rounded-2xl shadow-2xl p-6 text-center"
            style={{ background: 'var(--surface)', border: '1px solid var(--glass-border)' }}>
            <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3"
              style={{ background: 'rgba(244,63,94,0.12)' }}>
              <Trash2 className="w-7 h-7" style={{ color: 'var(--red)' }} />
            </div>
            <h3 className="font-bold text-lg mb-2" style={{ color: 'var(--text)' }}>Delete this loan?</h3>
            <p className="text-sm mb-6" style={{ color: 'var(--muted)' }}>
              All payment records will be permanently deleted.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowDelete(false)} disabled={deleting} className="btn-ghost flex-1 justify-center py-3 disabled:opacity-50">Cancel</button>
              <button onClick={handleDelete} disabled={deleting}
                className="flex-1 py-3 rounded-xl font-semibold text-sm text-white transition-all hover:brightness-110 disabled:opacity-60 flex items-center justify-center gap-2"
                style={{ background: 'var(--red)', boxShadow: '0 4px 16px var(--glow-red)' }}>
                {deleting ? (
                  <>
                    <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                    Deleting…
                  </>
                ) : 'Delete'}
              </button>
            </div>
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
                : 'linear-gradient(135deg, rgba(244,63,94,0.95), rgba(225,29,72,0.95))',
              color: '#fff',
              border: toast.type === 'success'
                ? '1px solid rgba(16,185,129,0.4)'
                : '1px solid rgba(244,63,94,0.4)',
              backdropFilter: 'blur(12px)',
              boxShadow: toast.type === 'success'
                ? '0 12px 40px rgba(16,185,129,0.35)'
                : '0 12px 40px rgba(244,63,94,0.35)',
            }}>
            {toast.type === 'success'
              ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              : <AlertTriangle className="w-4 h-4 flex-shrink-0" />}
            <span>{toast.msg}</span>
          </div>
        </div>
      )}
    </div>
  );
}
