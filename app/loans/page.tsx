'use client';
import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Plus, Search, ChevronRight, AlertTriangle, IndianRupee } from 'lucide-react';

interface Loan {
  id: string;
  customerName?: string; customer_name?: string;
  customerPhone?: string; customer_phone?: string;
  principal: number;
  interestAmount?: number; interest_amount?: number;
  totalAmount?: number; total_amount?: number;
  periodAmount?: number; weekly_amount?: number;
  loanTermPeriods?: number; loan_term_weeks?: number;
  totalPeriods?: number; total_weeks?: number;
  startDate?: string; start_date?: string;
  status: string;
  planType?: string;
  interestCollected?: boolean; interest_collected?: number;
  total_payments?: number;
  paid_payments?: number;
  overdue_payments?: number;
  total_collected?: number;
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

function LoanRow({ loan }: { loan: Loan }) {
  const name = loan.customerName ?? loan.customer_name ?? '?';
  const totalP = loan.totalPeriods ?? loan.total_weeks ?? 0;
  const paidP = loan.paid_payments ?? 0;
  const progress = totalP > 0 ? Math.round((paidP / totalP) * 100) : 0;
  const outstanding = Math.max(0, loan.principal - (loan.total_collected ?? 0));
  const hasOverdue = (loan.overdue_payments ?? 0) > 0;
  const isCompleted = loan.status === 'completed';
  const isDaily = loan.planType === 'daily';
  const period = isDaily ? 'days' : 'wks';
  const periodAmt = loan.periodAmount ?? loan.weekly_amount ?? 0;

  return (
    <Link href={`/loans/${loan.id}`}
      className="flex items-center gap-3.5 px-4 py-3.5 transition-colors hover:bg-white/[0.03] border-b last:border-0"
      style={{ borderColor: 'var(--glass-border)' }}>

      {/* Avatar */}
      <div className="avatar flex-shrink-0 text-sm font-bold"
        style={{
          width: 44, height: 44,
          background: isCompleted
            ? 'linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.05))'
            : 'linear-gradient(135deg, var(--purple), var(--violet))',
          border: isCompleted ? '1.5px solid rgba(255,255,255,0.1)' : '1.5px solid rgba(139,92,246,0.3)',
        }}>
        {name[0]?.toUpperCase()}
      </div>

      {/* Middle */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <p className="font-semibold text-[15px] truncate" style={{ color: 'var(--text)' }}>{name}</p>
          {hasOverdue && (
            <span className="flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ background: 'rgba(244,63,94,0.15)', color: '#fb7185', border: '1px solid rgba(244,63,94,0.25)' }}>
              {loan.overdue_payments} overdue
            </span>
          )}
          {isCompleted && (
            <span className="flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--muted)', border: '1px solid var(--glass-border)' }}>
              Done
            </span>
          )}
          {isDaily && !isCompleted && (
            <span className="flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ background: 'rgba(6,182,212,0.12)', color: '#22d3ee', border: '1px solid rgba(6,182,212,0.2)' }}>
              Daily
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mb-1">
          <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--glass-bg-2)' }}>
            <div className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${progress}%`,
                background: isCompleted
                  ? 'rgba(255,255,255,0.2)'
                  : 'linear-gradient(90deg, var(--purple), var(--violet))',
                boxShadow: isCompleted ? 'none' : '0 0 8px rgba(139,92,246,0.4)',
              }} />
          </div>
          <span className="text-[11px] flex-shrink-0" style={{ color: 'var(--muted)' }}>
            {paidP}/{totalP} {period}
          </span>
        </div>
        <p className="text-xs" style={{ color: 'var(--muted)' }}>
          {fmtFull(loan.principal)} · ₹{periodAmt.toLocaleString('en-IN')}/{isDaily ? 'day' : 'wk'}
        </p>
      </div>

      {/* Right */}
      <div className="text-right flex-shrink-0">
        <p className="text-[15px] font-bold"
          style={{ color: hasOverdue ? 'var(--red)' : isCompleted ? 'var(--muted)' : 'var(--text)' }}>
          {isCompleted ? '—' : fmt(outstanding)}
        </p>
        <p className="text-[10px] mt-0.5" style={{ color: 'var(--muted)' }}>
          {isCompleted ? 'completed' : 'outstanding'}
        </p>
      </div>

      <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--muted-2)' }} />
    </Link>
  );
}

function LoansContent() {
  const searchParams = useSearchParams();
  const customerIdFilter = searchParams.get('customer_id');

  const [loans, setLoans] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'all' | 'active' | 'completed'>('all');

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const url = customerIdFilter ? `/api/loans?customer_id=${customerIdFilter}` : '/api/loans';
    setLoading(true);
    setError(null);
    fetch(url)
      .then(async (r) => {
        const d = await r.json().catch(() => null);
        if (!r.ok || !Array.isArray(d)) {
          const msg = (d && typeof d === 'object' && 'error' in d && typeof d.error === 'string')
            ? d.error
            : `HTTP ${r.status}`;
          setError(msg);
          setLoans([]);
          return;
        }
        setLoans(d);
      })
      .catch((e) => {
        console.error(e);
        setError(e instanceof Error ? e.message : 'Network error');
        setLoans([]);
      })
      .finally(() => setLoading(false));
  }, [customerIdFilter]);

  const filtered = loans
    .filter(l => tab === 'all' || l.status === tab)
    .filter(l => {
      const name = (l.customerName ?? l.customer_name ?? '').toLowerCase();
      return name.includes(search.toLowerCase()) || String(l.principal).includes(search);
    });

  const activeLoans = loans.filter(l => l.status === 'active');
  const totalPrincipal = activeLoans.reduce((s, l) => s + l.principal, 0);
  const overdueTotal = loans.reduce((s, l) => s + (l.overdue_payments || 0), 0);
  const activeCount = activeLoans.length;

  const TABS = [
    { key: 'all', label: 'All', count: loans.length },
    { key: 'active', label: 'Active', count: activeCount },
    { key: 'completed', label: 'Done', count: loans.filter(l => l.status === 'completed').length },
  ] as const;

  return (
    <div className="pb-28 min-h-screen" style={{ background: 'var(--bg)' }}>

      {/* Header */}
      <div className="sticky top-0 z-20 px-4 pt-4 pb-0"
        style={{ background: 'rgba(10,10,15,0.9)', backdropFilter: 'blur(20px)', borderBottom: '1px solid var(--glass-border)' }}>
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-base font-bold" style={{ color: 'var(--text)' }}>Loans</h1>
          <Link href="/loans/new" className="btn-primary py-2 px-3.5 text-sm gap-1.5">
            <Plus className="w-4 h-4" /> New
          </Link>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--muted)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            className="input pl-10 py-2.5 text-sm" placeholder="Search borrower or amount…" />
        </div>

        {/* Tabs */}
        <div className="flex gap-0">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className="px-4 py-2.5 text-sm font-semibold border-b-2 transition-all -mb-px flex items-center gap-1.5"
              style={{
                borderColor: tab === t.key ? 'var(--purple)' : 'transparent',
                color: tab === t.key ? 'var(--purple)' : 'var(--muted)',
              }}>
              {t.label}
              {t.count > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                  style={tab === t.key
                    ? { background: 'rgba(139,92,246,0.15)', color: '#a78bfa' }
                    : { background: 'var(--glass-bg-2)', color: 'var(--muted)' }}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Summary strip */}
      <div className="flex items-center gap-4 px-4 py-3"
        style={{ borderBottom: '1px solid var(--glass-border)', background: 'var(--surface)' }}>
        <div className="flex items-center gap-1.5">
          <IndianRupee className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
          <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{fmt(totalPrincipal)}</span>
          <span className="text-xs" style={{ color: 'var(--muted)' }}>deployed</span>
        </div>
        {overdueTotal > 0 && (
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" style={{ color: 'var(--red)' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--red)' }}>{overdueTotal}</span>
            <span className="text-xs" style={{ color: 'var(--muted)' }}>overdue</span>
          </div>
        )}
      </div>

      {/* Loan list */}
      <div className="p-4">
        {loading ? (
          <div className="card overflow-hidden">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="flex items-center gap-3.5 px-4 py-3.5 border-b last:border-0 animate-pulse"
                style={{ borderColor: 'var(--glass-border)' }}>
                <div className="w-11 h-11 rounded-full flex-shrink-0" style={{ background: 'var(--glass-bg-2)' }} />
                <div className="flex-1 space-y-2">
                  <div className="h-4 rounded w-32" style={{ background: 'var(--glass-bg-2)' }} />
                  <div className="h-2 rounded w-full" style={{ background: 'var(--glass-bg-2)' }} />
                  <div className="h-3 rounded w-24" style={{ background: 'var(--glass-bg-2)' }} />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="card p-8 text-center" style={{ borderColor: 'rgba(244,63,94,0.25)' }}>
            <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3"
              style={{ background: 'rgba(244,63,94,0.1)' }}>
              <AlertTriangle className="w-6 h-6" style={{ color: 'var(--red)' }} />
            </div>
            <p className="font-semibold text-sm mb-1" style={{ color: 'var(--text)' }}>Couldn&apos;t load loans</p>
            <p className="text-xs mb-4" style={{ color: 'var(--muted)' }}>{error}</p>
            <button onClick={() => window.location.reload()}
              className="btn-primary mx-auto text-sm">Retry</button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="card p-12 text-center">
            <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3"
              style={{ background: 'var(--glass-bg-2)' }}>
              <IndianRupee className="w-6 h-6" style={{ color: 'var(--muted-2)' }} />
            </div>
            <p className="font-semibold text-sm" style={{ color: 'var(--muted)' }}>
              {search ? 'No results found' : 'No loans yet'}
            </p>
            {!search && (
              <Link href="/loans/new" className="btn-primary mx-auto mt-4 text-sm">
                <Plus className="w-4 h-4" /> Create First Loan
              </Link>
            )}
          </div>
        ) : (
          <div className="card overflow-hidden">
            {filtered.map(loan => <LoanRow key={loan.id} loan={loan} />)}
          </div>
        )}

        {overdueTotal > 0 && !search && tab === 'all' && (
          <div className="mt-3 px-4 py-3 rounded-xl flex items-center gap-2"
            style={{ background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.2)' }}>
            <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--red)' }} />
            <p className="text-xs font-medium" style={{ color: '#fb7185' }}>
              {overdueTotal} overdue payments need collection
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function LoansPage() {
  return (
    <Suspense fallback={
      <div className="flex justify-center items-center min-h-screen">
        <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: 'var(--purple)', borderTopColor: 'transparent' }} />
      </div>
    }>
      <LoansContent />
    </Suspense>
  );
}
