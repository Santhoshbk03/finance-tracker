'use client';
import { useEffect, useState, use, useCallback } from 'react';
import Header from '@/components/layout/Header';
import Link from 'next/link';
import {
  ChevronLeft, Phone, MapPin, FileText, CheckCircle2,
  Clock, AlertTriangle, IndianRupee, Pencil, X, Check,
  ChevronDown, ChevronUp, Calendar, Trash2, Banknote
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

function PaymentRow({ payment, onUpdate }: {
  payment: Payment;
  onUpdate: (id: string, paid: number, date: string, notes: string) => Promise<void>;
}) {
  const displayStatus = computeDisplayStatus(payment);
  const today = new Date().toISOString().split('T')[0];
  const due = payment.dueDate ?? payment.due_date ?? '';
  const isDueToday = due === today;
  const periodNum = payment.periodNumber ?? payment.week_number ?? 0;
  const expectedAmt = payment.expectedAmount ?? payment.expected_amount ?? 0;
  const paidAmt = payment.paidAmount ?? payment.paid_amount ?? 0;
  const paidDateVal = payment.paidDate ?? payment.paid_date;

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

  return (
    <div className="border-b last:border-0" style={{ borderColor: 'var(--glass-border)', ...rowStyle }}>
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-white/[0.03] text-left">
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

        {open
          ? <ChevronUp className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--muted)' }} />
          : <ChevronDown className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--muted)' }} />}
      </button>

      {open && (
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

export default function LoanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [loan, setLoan] = useState<Loan | null>(null);
  const [loading, setLoading] = useState(true);
  const [editNotes, setEditNotes] = useState(false);
  const [notes, setNotes] = useState('');
  const [showDelete, setShowDelete] = useState(false);
  const [markingInterest, setMarkingInterest] = useState(false);

  const fetchLoan = useCallback(() => {
    setLoading(true);
    fetch(`/api/loans/${id}`)
      .then(r => r.json())
      .then(d => { if (!d.error) { setLoan(d); setNotes(d.notes || ''); } })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { fetchLoan(); }, [fetchLoan]);

  const handlePaymentUpdate = async (paymentId: string, paid_amount: number, paid_date: string, paymentNotes: string) => {
    await fetch(`/api/payments/${paymentId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paid_amount, paid_date, notes: paymentNotes }),
    });
    fetchLoan();
  };

  const handleSaveNotes = async () => {
    await fetch(`/api/loans/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes }),
    });
    setEditNotes(false);
    fetchLoan();
  };

  const handleDelete = async () => {
    const res = await fetch(`/api/loans/${id}`, { method: 'DELETE' });
    if (res.ok) router.push('/loans');
  };

  const handleToggleInterest = async () => {
    if (!loan) return;
    setMarkingInterest(true);
    const current = loan.interestCollected ?? Boolean(loan.interest_collected);
    await fetch(`/api/loans/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ interest_collected: !current }),
    });
    setMarkingInterest(false);
    fetchLoan();
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

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <Header title="Loan Details" />
      <div className="p-4 max-w-2xl mx-auto space-y-4 pb-28">

        <div className="flex items-center justify-between">
          <Link href="/loans" className="inline-flex items-center gap-1 text-sm transition-colors hover:opacity-80"
            style={{ color: 'var(--muted)' }}>
            <ChevronLeft className="w-4 h-4" /> Loans
          </Link>
          <button onClick={() => setShowDelete(true)}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors"
            style={{ color: '#fb7185', background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.15)' }}>
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
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
                <p className="text-sm flex items-center gap-1.5 mt-1" style={{ color: 'var(--muted)' }}>
                  <Phone className="w-3.5 h-3.5" /> {phone}
                </p>
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
          <div className="flex items-center justify-between">
            <div>
              <p className="text-2xl font-black" style={{ color: 'var(--text)' }}>{formatINR(interestAmt)}</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                {interestCollected
                  ? `Collected on ${interestCollectedDate ? new Date(interestCollectedDate + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'loan start'}`
                  : `Due on ${startDate ? new Date(startDate + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}`}
              </p>
            </div>
            <button onClick={handleToggleInterest} disabled={markingInterest}
              className="px-4 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 text-white"
              style={interestCollected
                ? { background: 'var(--glass-bg-2)', color: 'var(--muted)', border: '1px solid var(--glass-border)' }
                : { background: 'var(--green)', boxShadow: '0 4px 16px var(--glow-green)' }}>
              {markingInterest ? '…' : interestCollected ? 'Undo' : 'Mark Collected'}
            </button>
          </div>
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
            <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--muted)' }}>
              <span className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" style={{ color: 'var(--green)' }} /> Paid</span>
              <span className="flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" style={{ color: 'var(--red)' }} /> Overdue</span>
              <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" style={{ color: 'var(--muted-2)' }} /> Pending</span>
            </div>
          </div>
          <div>
            {loan.payments.length === 0 ? (
              <p className="text-sm text-center py-8" style={{ color: 'var(--muted)' }}>No payment schedule found</p>
            ) : (
              loan.payments.map(p => (
                <PaymentRow key={p.id} payment={{ ...p, planType: loan.planType } as any} onUpdate={handlePaymentUpdate} />
              ))
            )}
          </div>
        </div>
      </div>

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
              <button onClick={() => setShowDelete(false)} className="btn-ghost flex-1 justify-center py-3">Cancel</button>
              <button onClick={handleDelete}
                className="flex-1 py-3 rounded-xl font-semibold text-sm text-white transition-all hover:brightness-110"
                style={{ background: 'var(--red)', boxShadow: '0 4px 16px var(--glow-red)' }}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
