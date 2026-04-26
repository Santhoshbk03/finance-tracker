'use client';
import { useEffect, useState, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft, IndianRupee, Calendar, User, CalendarDays,
  Sparkles, Check, AlertCircle, Loader2, CalendarRange,
} from 'lucide-react';
import Link from 'next/link';

interface Customer { id: string; name: string; phone?: string; }

function formatINR(n: number) {
  return isNaN(n) || n === 0 ? '₹0' : '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

const WEEK_OPTIONS = [4, 8, 10, 12, 16, 20, 24];
const DAY_OPTIONS = [30, 50, 75, 100, 120, 150, 200];
const DAY_NAMES_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_NAMES_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function NewLoanFallback() {
  return (
    <div className="pb-28 min-h-screen" style={{ background: 'var(--bg)' }}>
      <div className="sticky top-0 z-20 px-4 py-3 flex items-center gap-3"
        style={{ background: 'rgba(10,10,15,0.85)', backdropFilter: 'blur(20px)', borderBottom: '1px solid var(--glass-border)' }}>
        <Link href="/loans" className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{ background: 'var(--glass-bg-2)', border: '1px solid var(--glass-border)' }}>
          <ArrowLeft className="w-4 h-4" style={{ color: 'var(--text)' }} />
        </Link>
        <div className="flex-1 min-w-0">
          <p className="text-xs" style={{ color: 'var(--muted)' }}>Create</p>
          <h1 className="text-base font-bold" style={{ color: 'var(--text)' }}>New Loan</h1>
        </div>
      </div>
      <div className="p-4 max-w-2xl mx-auto space-y-4">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="card animate-pulse" style={{ height: i === 1 ? 56 : 120 }} />
        ))}
        <div className="flex items-center justify-center py-4 gap-2" style={{ color: 'var(--muted)' }}>
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Loading…</span>
        </div>
      </div>
    </div>
  );
}

export default function NewLoanPage() {
  return (
    <Suspense fallback={<NewLoanFallback />}>
      <NewLoanForm />
    </Suspense>
  );
}

function NewLoanForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefilledCustomerId = searchParams.get('customerId') || '';
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [planType, setPlanType] = useState<'weekly' | 'daily'>('weekly');

  const [form, setForm] = useState({
    customer_id: prefilledCustomerId,
    principal: '',
    interest_rate: '4',
    loan_term_periods: '10',
    start_date: todayStr(),
    notes: '',
    custom_interest: '',
    use_custom_interest: false,
    custom_interest_mode: 'fixed' as 'fixed' | 'percent',
    interest_collected: true, // default: customer paid interest upfront
  });

  // Weekday preferences
  const [weeklyDay, setWeeklyDay] = useState<number | null>(null); // 0-6, or null = same as start_date weekday
  const [skipDays, setSkipDays] = useState<number[]>([]); // for daily

  useEffect(() => {
    fetch('/api/customers')
      .then(async (r) => {
        const d = await r.json().catch(() => null);
        setCustomers(Array.isArray(d) ? d : []);
      })
      .catch((e) => { console.error(e); setCustomers([]); });
  }, []);

  function switchPlan(type: 'weekly' | 'daily') {
    setPlanType(type);
    setForm(f => ({ ...f, loan_term_periods: type === 'daily' ? '100' : '10' }));
  }

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  // Live preview calculations
  const principal = parseFloat(form.principal) || 0;
  const rate = parseFloat(form.interest_rate) || 0;
  const periods = parseInt(form.loan_term_periods) || (planType === 'daily' ? 100 : 10);

  const { months, calcInterest, periodAmount } = useMemo(() => {
    if (planType === 'daily') {
      const m = Math.ceil(periods / 30);
      return {
        months: m,
        calcInterest: Math.round((principal * rate * m) / 100 * 100) / 100,
        periodAmount: periods > 0 ? Math.round((principal / periods) * 100) / 100 : 0,
      };
    }
    const m = Math.ceil(periods / 4);
    return {
      months: m,
      calcInterest: Math.round((principal * rate * m) / 100 * 100) / 100,
      periodAmount: periods > 0 ? Math.round((principal / periods) * 100) / 100 : 0,
    };
  }, [planType, periods, principal, rate]);

  const customInterestAmt = form.custom_interest_mode === 'percent'
    ? Math.round(principal * (parseFloat(form.custom_interest) || 0) / 100 * 100) / 100
    : parseFloat(form.custom_interest) || 0;

  const interestAmount = form.use_custom_interest ? customInterestAmt : calcInterest;

  // Disbursed (what the customer actually receives today)
  const disbursedAmount = form.interest_collected ? Math.max(0, principal - interestAmount) : principal;

  // End date preview (accounting for weekly day / skip days)
  const endDate = useMemo(() => {
    const d = new Date(form.start_date + 'T00:00:00');
    if (planType === 'daily') {
      const skip = new Set(skipDays);
      if (skip.size === 7) return '—';
      let remaining = periods;
      let iter = 0;
      while (remaining > 0 && iter < periods * 10 + 30) {
        d.setDate(d.getDate() + 1);
        iter++;
        if (!skip.has(d.getDay())) remaining--;
      }
    } else {
      d.setDate(d.getDate() + 7);
      if (weeklyDay !== null) {
        const diff = (weeklyDay - d.getDay() + 7) % 7;
        d.setDate(d.getDate() + diff);
      }
      d.setDate(d.getDate() + (periods - 1) * 7);
    }
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }, [form.start_date, planType, periods, skipDays, weeklyDay]);

  const startWeekday = useMemo(() => {
    const d = new Date(form.start_date + 'T00:00:00');
    return d.getDay();
  }, [form.start_date]);

  const effectiveWeeklyDay = weeklyDay ?? startWeekday;

  const toggleSkip = (d: number) =>
    setSkipDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort());

  const activeDailyDays = 7 - skipDays.length;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.customer_id) { setError('Please select a borrower'); return; }
    if (planType === 'daily' && skipDays.length === 7) { setError('At least one day per week must be active'); return; }
    setError('');
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        customer_id: form.customer_id,
        principal: form.principal,
        interest_rate: form.interest_rate,
        plan_type: planType,
        loan_term_periods: form.loan_term_periods,
        start_date: form.start_date,
        notes: form.notes,
        interest_collected: form.interest_collected,
        schedule_config: {
          ...(planType === 'weekly' && weeklyDay !== null ? { weeklyDayOfWeek: weeklyDay } : {}),
          ...(planType === 'daily' && skipDays.length > 0 ? { skipDays } : {}),
        },
      };
      if (form.use_custom_interest) payload.interest_amount = customInterestAmt;

      const res = await fetch('/api/loans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const loan = await res.json();
        router.push(`/loans/${loan.id}`);
      } else {
        const d = await res.json();
        setError(d.error || 'Failed to create loan');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const termOptions = planType === 'daily' ? DAY_OPTIONS : WEEK_OPTIONS;
  const termLabel = planType === 'daily' ? 'days' : 'weeks';

  return (
    <div className="pb-28 min-h-screen" style={{ background: 'var(--bg)' }}>
      {/* Top bar */}
      <div className="sticky top-0 z-20 px-4 py-3 flex items-center gap-3"
        style={{ background: 'rgba(10,10,15,0.85)', backdropFilter: 'blur(20px)', borderBottom: '1px solid var(--glass-border)' }}>
        <Link href="/loans" className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{ background: 'var(--glass-bg-2)', border: '1px solid var(--glass-border)' }}>
          <ArrowLeft className="w-4 h-4" style={{ color: 'var(--text)' }} />
        </Link>
        <div className="flex-1 min-w-0">
          <p className="text-xs" style={{ color: 'var(--muted)' }}>Create</p>
          <h1 className="text-base font-bold" style={{ color: 'var(--text)' }}>New Loan</h1>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="p-4 space-y-4 max-w-2xl mx-auto">

        {/* Plan type toggle — pill */}
        <div className="card p-1.5 grid grid-cols-2 gap-1 relative">
          <div
            className="absolute top-1.5 bottom-1.5 rounded-xl transition-all duration-300 pointer-events-none"
            style={{
              left: planType === 'weekly' ? '6px' : 'calc(50% + 2px)',
              width: 'calc(50% - 8px)',
              background: 'linear-gradient(135deg, var(--purple), var(--pink))',
              boxShadow: '0 4px 16px rgba(139,92,246,0.3)',
            }} />
          {(['weekly', 'daily'] as const).map((type) => (
            <button key={type} type="button" onClick={() => switchPlan(type)}
              className="relative z-10 py-2.5 rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-1.5"
              style={{ color: planType === type ? '#fff' : 'var(--muted)' }}>
              {type === 'weekly' ? <CalendarRange className="w-3.5 h-3.5" /> : <CalendarDays className="w-3.5 h-3.5" />}
              {type === 'weekly' ? 'Weekly' : 'Daily'}
            </button>
          ))}
        </div>

        {/* Borrower */}
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.2)' }}>
              <User className="w-3.5 h-3.5" style={{ color: 'var(--purple)' }} />
            </div>
            <h2 className="section-label">Borrower</h2>
          </div>
          {customers.length === 0 ? (
            <div className="text-sm py-2" style={{ color: 'var(--muted)' }}>
              No borrowers yet.{' '}
              <Link href="/customers" className="font-semibold" style={{ color: 'var(--purple)' }}>Add one first →</Link>
            </div>
          ) : (
            <select value={form.customer_id} onChange={set('customer_id')} required className="input">
              <option value="">— Choose borrower —</option>
              {customers.map(c => (
                <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ''}</option>
              ))}
            </select>
          )}
        </div>

        {/* Loan Details */}
        <div className="card p-4 space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.2)' }}>
              <IndianRupee className="w-3.5 h-3.5" style={{ color: 'var(--green)' }} />
            </div>
            <h2 className="section-label">Loan Details</h2>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted)' }}>Principal (₹) *</label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-medium text-sm" style={{ color: 'var(--muted-2)' }}>₹</span>
              <input value={form.principal} onChange={set('principal')} required type="number" min="1"
                className="input pl-8" placeholder="10000" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted)' }}>Rate (% / month)</label>
              <input value={form.interest_rate} onChange={set('interest_rate')} type="number"
                min="0" max="100" step="0.1" className="input" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted)' }}>Term ({termLabel})</label>
              <select value={form.loan_term_periods} onChange={set('loan_term_periods')} className="input">
                {termOptions.map(t => (
                  <option key={t} value={t}>
                    {t} {termLabel} ({planType === 'daily' ? `${Math.ceil(t / 30)} mo` : `${Math.ceil(t / 4)} mo`})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium mb-1.5" style={{ color: 'var(--muted)' }}>
              <Calendar className="w-3.5 h-3.5" /> Start date — disbursement day
            </label>
            <input value={form.start_date} onChange={set('start_date')} type="date" required className="input" />
            <p className="text-[11px] mt-1.5" style={{ color: 'var(--muted-2)' }}>
              {new Date(form.start_date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
              {form.start_date < todayStr() && (
                <span className="ml-1.5 font-semibold" style={{ color: 'var(--amber)' }}>
                  • past date (schedule starts from here)
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Weekday customization */}
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: 'rgba(236,72,153,0.15)', border: '1px solid rgba(236,72,153,0.2)' }}>
              <CalendarDays className="w-3.5 h-3.5" style={{ color: 'var(--pink)' }} />
            </div>
            <h2 className="section-label">{planType === 'weekly' ? 'Pay day' : 'Active days'}</h2>
          </div>

          {planType === 'weekly' ? (
            <>
              <p className="text-xs mb-3" style={{ color: 'var(--muted)' }}>
                Choose which day of the week the borrower will pay.
              </p>
              <div className="grid grid-cols-7 gap-1.5">
                {DAY_NAMES_SHORT.map((d, i) => {
                  const active = effectiveWeeklyDay === i;
                  return (
                    <button key={i} type="button"
                      onClick={() => setWeeklyDay(i)}
                      className="py-2.5 rounded-xl text-xs font-bold transition-all"
                      style={{
                        background: active
                          ? 'linear-gradient(135deg, var(--purple), var(--pink))'
                          : 'var(--glass-bg-2)',
                        color: active ? '#fff' : 'var(--muted)',
                        border: active ? '1px solid rgba(139,92,246,0.4)' : '1px solid var(--glass-border)',
                        boxShadow: active ? '0 4px 16px rgba(139,92,246,0.3)' : 'none',
                      }}>
                      {d}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] mt-2.5" style={{ color: 'var(--muted-2)' }}>
                First payment: <strong style={{ color: 'var(--text)' }}>{
                  (() => {
                    const d = new Date(form.start_date + 'T00:00:00');
                    d.setDate(d.getDate() + 7);
                    if (weeklyDay !== null) {
                      const diff = (weeklyDay - d.getDay() + 7) % 7;
                      d.setDate(d.getDate() + diff);
                    }
                    return d.toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'short' });
                  })()
                }</strong>
              </p>
            </>
          ) : (
            <>
              <p className="text-xs mb-3" style={{ color: 'var(--muted)' }}>
                Tap to skip days (shop closed etc.). <strong style={{ color: 'var(--text)' }}>{activeDailyDays}</strong> active day{activeDailyDays !== 1 ? 's' : ''} / week.
              </p>
              <div className="grid grid-cols-7 gap-1.5">
                {DAY_NAMES_SHORT.map((d, i) => {
                  const skipped = skipDays.includes(i);
                  return (
                    <button key={i} type="button"
                      onClick={() => toggleSkip(i)}
                      className="relative py-2.5 rounded-xl text-xs font-bold transition-all"
                      style={{
                        background: skipped
                          ? 'rgba(244,63,94,0.08)'
                          : 'linear-gradient(135deg, rgba(16,185,129,0.2), rgba(6,182,212,0.15))',
                        color: skipped ? 'var(--muted-2)' : '#fff',
                        border: skipped
                          ? '1px solid rgba(244,63,94,0.2)'
                          : '1px solid rgba(16,185,129,0.3)',
                        boxShadow: skipped ? 'none' : '0 2px 8px rgba(16,185,129,0.15)',
                        textDecoration: skipped ? 'line-through' : 'none',
                      }}>
                      {d}
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <button type="button"
                  onClick={() => setSkipDays([])}
                  className="btn-ghost text-[11px] py-1 px-2.5">All 7 days</button>
                <button type="button"
                  onClick={() => setSkipDays([0])}
                  className="btn-ghost text-[11px] py-1 px-2.5">Skip Sun</button>
                <button type="button"
                  onClick={() => setSkipDays([5])}
                  className="btn-ghost text-[11px] py-1 px-2.5">Skip Fri</button>
                <button type="button"
                  onClick={() => setSkipDays([6])}
                  className="btn-ghost text-[11px] py-1 px-2.5">Skip Sat</button>
                <button type="button"
                  onClick={() => setSkipDays([0, 6])}
                  className="btn-ghost text-[11px] py-1 px-2.5">Weekends off</button>
              </div>
            </>
          )}
        </div>

        {/* Interest config */}
        <div className="card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.2)' }}>
              <Sparkles className="w-3.5 h-3.5" style={{ color: 'var(--amber)' }} />
            </div>
            <h2 className="section-label">Interest</h2>
          </div>

          <div className="rounded-xl p-3"
            style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)' }}>
            <p className="text-xs font-semibold" style={{ color: '#fbbf24' }}>
              Interest is a one-time upfront deduction
            </p>
            <p className="text-[11px] mt-1" style={{ color: 'var(--muted)' }}>
              The borrower pays interest once at disbursement. After that they only repay principal over the schedule — never interest again.
            </p>
          </div>

          {/* Collected upfront toggle */}
          <label className="flex items-start gap-3 py-2 cursor-pointer select-none">
            <div className="relative flex-shrink-0 mt-0.5">
              <input type="checkbox"
                checked={form.interest_collected}
                onChange={e => setForm(f => ({ ...f, interest_collected: e.target.checked }))}
                className="peer sr-only" />
              <div className="w-5 h-5 rounded-md transition-all peer-checked:scale-100"
                style={{
                  background: form.interest_collected
                    ? 'linear-gradient(135deg, var(--green), #34d399)'
                    : 'var(--glass-bg-2)',
                  border: `1px solid ${form.interest_collected ? 'var(--green)' : 'var(--glass-border)'}`,
                  boxShadow: form.interest_collected ? '0 0 0 3px rgba(16,185,129,0.15)' : 'none',
                }}>
                {form.interest_collected && <Check className="w-4 h-4 text-white m-auto mt-0.5" strokeWidth={3} />}
              </div>
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Interest collected upfront today</p>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--muted)' }}>
                Deducted from principal — borrower receives <strong style={{ color: 'var(--text)' }}>{formatINR(disbursedAmount)}</strong> in hand.
              </p>
            </div>
          </label>

          <label className="flex items-start gap-3 py-2 cursor-pointer select-none"
            style={{ borderTop: '1px solid var(--glass-border)', paddingTop: 12 }}>
            <div className="relative flex-shrink-0 mt-0.5">
              <input type="checkbox"
                checked={form.use_custom_interest}
                onChange={e => setForm(f => ({ ...f, use_custom_interest: e.target.checked, custom_interest: String(calcInterest) }))}
                className="peer sr-only" />
              <div className="w-5 h-5 rounded-md transition-all"
                style={{
                  background: form.use_custom_interest
                    ? 'linear-gradient(135deg, var(--purple), var(--pink))'
                    : 'var(--glass-bg-2)',
                  border: `1px solid ${form.use_custom_interest ? 'var(--purple)' : 'var(--glass-border)'}`,
                }}>
                {form.use_custom_interest && <Check className="w-4 h-4 text-white m-auto mt-0.5" strokeWidth={3} />}
              </div>
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Override calculated interest</p>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--muted)' }}>
                Auto: <strong style={{ color: 'var(--text)' }}>{formatINR(calcInterest)}</strong> ({rate}% × {months}mo)
              </p>
              {form.use_custom_interest && (
                <div className="mt-2.5 space-y-2">
                  {/* Mode toggle */}
                  <div className="grid grid-cols-2 gap-1 p-1 rounded-lg" style={{ background: 'var(--glass-bg-2)' }}>
                    {(['fixed', 'percent'] as const).map(m => (
                      <button key={m} type="button"
                        onClick={() => setForm(f => ({ ...f, custom_interest_mode: m, custom_interest: m === 'percent' ? '' : String(calcInterest) }))}
                        className="py-1.5 rounded-md text-[11px] font-bold transition-all"
                        style={{
                          background: form.custom_interest_mode === m
                            ? 'linear-gradient(135deg, var(--purple), var(--pink))'
                            : 'transparent',
                          color: form.custom_interest_mode === m ? '#fff' : 'var(--muted)',
                        }}>
                        {m === 'fixed' ? '₹ Fixed Amount' : '% of Principal'}
                      </button>
                    ))}
                  </div>
                  {/* Input */}
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm" style={{ color: 'var(--muted-2)' }}>
                      {form.custom_interest_mode === 'fixed' ? '₹' : '%'}
                    </span>
                    <input value={form.custom_interest} onChange={set('custom_interest')}
                      type="number" min="0" step={form.custom_interest_mode === 'percent' ? '0.1' : '1'}
                      className="input pl-8 text-sm"
                      placeholder={form.custom_interest_mode === 'fixed' ? 'Amount in ₹' : 'Percentage'} />
                  </div>
                  {/* % mode preview */}
                  {form.custom_interest_mode === 'percent' && principal > 0 && (
                    <p className="text-[11px]" style={{ color: 'var(--muted)' }}>
                      = <strong style={{ color: 'var(--text)' }}>{formatINR(customInterestAmt)}</strong>
                      {' '}({form.custom_interest || 0}% of {formatINR(principal)})
                    </p>
                  )}
                </div>
              )}
            </div>
          </label>
        </div>

        {/* Notes */}
        <div className="card p-4">
          <label className="section-label block mb-2">Notes (optional)</label>
          <textarea value={form.notes} onChange={set('notes')} rows={2}
            className="input resize-none text-sm" placeholder="Guarantor, purpose, collateral…" />
        </div>

        {/* ── Live summary ── */}
        {principal > 0 && (
          <div className="relative rounded-2xl p-5 overflow-hidden"
            style={{
              background: 'linear-gradient(135deg, #4c1d95 0%, #6d28d9 50%, #7c3aed 100%)',
              boxShadow: '0 8px 32px rgba(109,40,217,0.4)',
              border: '1px solid rgba(139,92,246,0.3)',
            }}>
            <div className="absolute inset-0 pointer-events-none" style={{
              backgroundImage: 'radial-gradient(circle at 90% -20%, rgba(236,72,153,0.4) 0%, transparent 55%), radial-gradient(circle at 0% 100%, rgba(6,182,212,0.25) 0%, transparent 50%)',
            }} />

            <div className="relative">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4 text-white/80" />
                <p className="text-white/70 text-[11px] uppercase tracking-widest font-semibold">Loan Summary</p>
              </div>

              {/* Headline: disbursed + schedule */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="rounded-xl p-3"
                  style={{ background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.15)' }}>
                  <p className="text-white/55 text-[10px] uppercase tracking-wide">In hand today</p>
                  <p className="text-2xl font-black text-white leading-tight mt-0.5">{formatINR(disbursedAmount)}</p>
                  {form.interest_collected && interestAmount > 0 && (
                    <p className="text-[10px] text-white/60 mt-0.5">
                      {formatINR(principal)} − {formatINR(interestAmount)} interest
                    </p>
                  )}
                </div>
                <div className="rounded-xl p-3"
                  style={{ background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.15)' }}>
                  <p className="text-white/55 text-[10px] uppercase tracking-wide">
                    {planType === 'daily' ? 'Per day' : 'Per week'}
                  </p>
                  <p className="text-2xl font-black text-white leading-tight mt-0.5">{formatINR(periodAmount)}</p>
                  <p className="text-[10px] text-white/60 mt-0.5">× {periods} {termLabel}</p>
                </div>
              </div>

              {/* Details grid */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-white/85">
                <div>
                  <p className="text-[10px] text-white/50 uppercase tracking-wide">Principal</p>
                  <p className="text-sm font-bold">{formatINR(principal)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-white/50 uppercase tracking-wide">Interest ({rate}% × {months}mo)</p>
                  <p className="text-sm font-bold">{formatINR(interestAmount)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-white/50 uppercase tracking-wide">
                    {planType === 'weekly' ? 'Pay day' : 'Active days'}
                  </p>
                  <p className="text-sm font-bold">
                    {planType === 'weekly'
                      ? DAY_NAMES_LONG[effectiveWeeklyDay]
                      : activeDailyDays === 7 ? 'All 7 days' : `${activeDailyDays} per week`}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-white/50 uppercase tracking-wide">Last payment</p>
                  <p className="text-sm font-bold">{endDate}</p>
                </div>
              </div>

              {form.interest_collected && (
                <div className="relative mt-4 rounded-xl px-3 py-2 flex items-start gap-2"
                  style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.25)' }}>
                  <Check className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: '#6ee7b7' }} />
                  <p className="text-[11px] text-white/90">
                    Interest of <strong>{formatINR(interestAmount)}</strong> is collected once at disbursement. Borrower only repays principal from here on.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {error && (
          <div className="card p-3 flex items-center gap-2"
            style={{ background: 'rgba(244,63,94,0.08)', borderColor: 'rgba(244,63,94,0.3)' }}>
            <AlertCircle className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--red)' }} />
            <p className="text-sm" style={{ color: '#fb7185' }}>{error}</p>
          </div>
        )}

        <button type="submit" disabled={saving || !form.customer_id}
          className="btn-primary w-full justify-center py-3.5 text-sm disabled:opacity-50">
          {saving ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Creating loan…</>
          ) : (
            <><Sparkles className="w-4 h-4" /> Create Loan & Generate Schedule</>
          )}
        </button>
      </form>
    </div>
  );
}
