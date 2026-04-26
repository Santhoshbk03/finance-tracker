import { db } from '@/lib/supabase-admin';
import { localDateStr } from '@/lib/calculations';

export type PlanType = 'weekly' | 'daily';

export interface Loan {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  planType: PlanType;
  principal: number;
  interestRate: number;
  loanTermPeriods: number;
  totalPeriods: number;
  interestAmount: number;
  totalAmount: number;
  periodAmount: number;
  startDate: string;
  endDate: string;
  notes: string;
  status: 'active' | 'completed' | 'defaulted';
  interestCollected: boolean;
  interestCollectedDate: string | null;
  scheduleConfig?: {
    weeklyDayOfWeek?: number;
    skipDays?: number[];
  };
  createdAt: string;
  updatedAt: string;
}

export interface Payment {
  id: string;
  loanId: string;
  periodNumber: number;
  dueDate: string;
  expectedAmount: number;
  paidAmount: number;
  paidDate: string | null;
  status: 'pending' | 'paid' | 'partial' | 'overdue';
  notes: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Mappers (snake_case DB → camelCase app) ──────────────────────────────────

function rowToLoan(r: any): Loan {
  return {
    id:                    r.id,
    customerId:            r.customer_id,
    customerName:          r.customer_name ?? '',
    customerPhone:         r.customer_phone ?? '',
    planType:              r.plan_type ?? 'weekly',
    principal:             Number(r.principal),
    interestRate:          Number(r.interest_rate),
    loanTermPeriods:       Number(r.loan_term_periods),
    totalPeriods:          Number(r.total_periods),
    interestAmount:        Number(r.interest_amount),
    totalAmount:           Number(r.total_amount),
    periodAmount:          Number(r.period_amount),
    startDate:             r.start_date,
    endDate:               r.end_date,
    notes:                 r.notes ?? '',
    status:                r.status ?? 'active',
    interestCollected:     r.interest_collected ?? false,
    interestCollectedDate: r.interest_collected_date ?? null,
    scheduleConfig:        r.schedule_config ?? undefined,
    createdAt:             r.created_at,
    updatedAt:             r.updated_at,
  };
}

function rowToPayment(r: any, loanId?: string): Payment {
  return {
    id:             r.id,
    loanId:         r.loan_id ?? loanId ?? '',
    periodNumber:   Number(r.period_number),
    dueDate:        r.due_date,
    expectedAmount: Number(r.expected_amount),
    paidAmount:     Number(r.paid_amount),
    paidDate:       r.paid_date ?? null,
    status:         r.status ?? 'pending',
    notes:          r.notes ?? '',
    createdAt:      r.created_at,
    updatedAt:      r.updated_at,
  };
}

// ─── Loans ───────────────────────────────────────────────────────────────────

export async function getLoansAdmin(filters?: {
  status?: string;
  customerId?: string;
}): Promise<Loan[]> {
  let q = db.from('loans').select('*').order('created_at', { ascending: false });
  if (filters?.customerId) q = q.eq('customer_id', filters.customerId);
  if (filters?.status)     q = q.eq('status', filters.status);

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(rowToLoan);
}

export async function getLoanAdmin(id: string): Promise<Loan | null> {
  const { data, error } = await db
    .from('loans')
    .select('*')
    .eq('id', id)
    .single();
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return data ? rowToLoan(data) : null;
}

export async function createLoanAdmin(
  loanData: Omit<Loan, 'id' | 'createdAt' | 'updatedAt'>,
  payments: Omit<Payment, 'id' | 'loanId' | 'createdAt' | 'updatedAt'>[]
): Promise<Loan> {
  const now = new Date().toISOString();

  const { data: loanRow, error: loanErr } = await db
    .from('loans')
    .insert({
      customer_id:             loanData.customerId,
      customer_name:           loanData.customerName,
      customer_phone:          loanData.customerPhone,
      plan_type:               loanData.planType,
      principal:               loanData.principal,
      interest_rate:           loanData.interestRate,
      loan_term_periods:       loanData.loanTermPeriods,
      total_periods:           loanData.totalPeriods,
      interest_amount:         loanData.interestAmount,
      total_amount:            loanData.totalAmount,
      period_amount:           loanData.periodAmount,
      start_date:              loanData.startDate,
      end_date:                loanData.endDate,
      notes:                   loanData.notes,
      status:                  loanData.status,
      interest_collected:      loanData.interestCollected,
      interest_collected_date: loanData.interestCollectedDate,
      schedule_config:         loanData.scheduleConfig ?? null,
      created_at:              now,
      updated_at:              now,
    })
    .select()
    .single();
  if (loanErr) throw loanErr;

  const loanId = loanRow.id;

  // Insert all payments in chunks of 500 (Supabase body-size guard).
  // IMPORTANT: preserve paidAmount / paidDate / status from caller — the import
  // route passes historically collected amounts; hardcoding zeros would wipe them.
  const CHUNK = 500;
  for (let i = 0; i < payments.length; i += CHUNK) {
    const rows = payments.slice(i, i + CHUNK).map((p) => ({
      loan_id:         loanId,
      period_number:   p.periodNumber,
      due_date:        p.dueDate,
      expected_amount: p.expectedAmount,
      paid_amount:     p.paidAmount  ?? 0,
      paid_date:       p.paidDate    ?? null,
      status:          p.status      ?? 'pending',
      notes:           p.notes       ?? '',
      created_at:      now,
      updated_at:      now,
    }));
    const { error: pErr } = await db.from('payments').insert(rows);
    if (pErr) throw pErr;
  }

  // Auto-complete: if every payment is already paid (imported historical loan),
  // mark the loan as completed so it doesn't pollute the active-loan views.
  if (payments.length > 0 && payments.every((p) => p.status === 'paid')) {
    await db.from('loans').update({ status: 'completed', updated_at: now }).eq('id', loanId);
    loanRow.status = 'completed';
  }

  return rowToLoan(loanRow);
}

export async function updateLoanAdmin(id: string, data: Partial<Loan>): Promise<void> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (data.customerId            !== undefined) patch.customer_id             = data.customerId;
  if (data.customerName          !== undefined) patch.customer_name           = data.customerName;
  if (data.customerPhone         !== undefined) patch.customer_phone          = data.customerPhone;
  if (data.planType              !== undefined) patch.plan_type               = data.planType;
  if (data.principal             !== undefined) patch.principal               = data.principal;
  if (data.interestRate          !== undefined) patch.interest_rate           = data.interestRate;
  if (data.loanTermPeriods       !== undefined) patch.loan_term_periods       = data.loanTermPeriods;
  if (data.totalPeriods          !== undefined) patch.total_periods           = data.totalPeriods;
  if (data.interestAmount        !== undefined) patch.interest_amount         = data.interestAmount;
  if (data.totalAmount           !== undefined) patch.total_amount            = data.totalAmount;
  if (data.periodAmount          !== undefined) patch.period_amount           = data.periodAmount;
  if (data.startDate             !== undefined) patch.start_date              = data.startDate;
  if (data.endDate               !== undefined) patch.end_date                = data.endDate;
  if (data.notes                 !== undefined) patch.notes                   = data.notes;
  if (data.status                !== undefined) patch.status                  = data.status;
  if (data.interestCollected     !== undefined) patch.interest_collected      = data.interestCollected;
  if (data.interestCollectedDate !== undefined) patch.interest_collected_date = data.interestCollectedDate;
  if (data.scheduleConfig        !== undefined) patch.schedule_config         = data.scheduleConfig;

  const { error } = await db.from('loans').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteLoanAdmin(id: string): Promise<void> {
  // Payments cascade via FK on delete cascade.
  const { error } = await db.from('loans').delete().eq('id', id);
  if (error) throw error;
}

// ─── Payments ────────────────────────────────────────────────────────────────

export async function getPaymentsAdmin(loanId: string): Promise<Payment[]> {
  const { data, error } = await db
    .from('payments')
    .select('*')
    .eq('loan_id', loanId)
    .order('period_number', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => rowToPayment(r, loanId));
}

export async function updatePaymentAdmin(
  loanId: string,
  paymentId: string,
  data: Partial<Payment>
): Promise<void> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (data.paidAmount  !== undefined) patch.paid_amount  = data.paidAmount;
  if (data.paidDate    !== undefined) patch.paid_date    = data.paidDate;
  if (data.status      !== undefined) patch.status       = data.status;
  if (data.notes       !== undefined) patch.notes        = data.notes;

  const { error } = await db
    .from('payments')
    .update(patch)
    .eq('id', paymentId)
    .eq('loan_id', loanId);
  if (error) throw error;
}

// ─── Bulk collect (single SQL statement via upsert) ───────────────────────────
// Much cheaper than a Firestore batch — one network round-trip to Postgres.

export interface BulkCollectItem {
  loanId: string;
  paymentId: string;
  paidAmount: number;
  paidDate: string | null;
  notes?: string;
  expectedAmount?: number;
  dueDate?: string;
}

export async function bulkCollectPayments(items: BulkCollectItem[]): Promise<{
  updates: Array<{ paymentId: string; loanId: string; paidAmount: number; paidDate: string | null; status: string; expectedAmount: number }>;
  skipped: string[];
  completedLoanIds: string[];
}> {
  if (items.length === 0) return { updates: [], skipped: [], completedLoanIds: [] };

  const today = localDateStr(new Date());
  const paymentIds = items.map((i) => i.paymentId);

  // Read the payments we're about to update (single query)
  // Include all NOT NULL fields so the upsert has a complete row
  const { data: existing, error: readErr } = await db
    .from('payments')
    .select('id, loan_id, period_number, expected_amount, due_date, notes')
    .in('id', paymentIds);
  if (readErr) throw readErr;

  const existingMap = new Map((existing ?? []).map((r) => [r.id, r]));
  const skipped: string[] = [];
  const updates: Array<{ paymentId: string; loanId: string; paidAmount: number; paidDate: string | null; status: string; expectedAmount: number }> = [];

  const upsertRows: any[] = [];
  const now = new Date().toISOString();

  for (const item of items) {
    const row = existingMap.get(item.paymentId);
    if (!row) { skipped.push(item.paymentId); continue; }

    const amount = Math.max(0, Number(item.paidAmount) || 0);
    const expected = Number(row.expected_amount);
    let status: string;
    if (amount >= expected) status = 'paid';
    else if (amount > 0)    status = 'partial';
    else                    status = row.due_date < today ? 'overdue' : 'pending';

    upsertRows.push({
      id:              item.paymentId,
      loan_id:         item.loanId,
      period_number:   row.period_number,          // required NOT NULL
      due_date:        row.due_date,               // required NOT NULL
      expected_amount: Number(row.expected_amount), // required NOT NULL
      paid_amount:     amount,
      paid_date:       item.paidDate ?? null,
      status,
      notes:           item.notes ?? row.notes ?? '',
      updated_at:      now,
    });

    updates.push({
      paymentId:      item.paymentId,
      loanId:         item.loanId,
      paidAmount:     amount,
      paidDate:       item.paidDate ?? null,
      status,
      expectedAmount: expected,
    });
  }

  if (upsertRows.length > 0) {
    const { error } = await db
      .from('payments')
      .upsert(upsertRows, { onConflict: 'id' });
    if (error) throw error;
  }

  // Check loan completion — count unpaid per affected loan (one query)
  const affectedLoanIds = [...new Set(updates.map((u) => u.loanId))];
  const completedLoanIds: string[] = [];

  if (affectedLoanIds.length > 0) {
    const { data: unpaidCounts, error: countErr } = await db
      .from('payments')
      .select('loan_id')
      .in('loan_id', affectedLoanIds)
      .neq('status', 'paid');
    if (countErr) throw countErr;

    const unpaidByLoan = new Set((unpaidCounts ?? []).map((r: any) => r.loan_id));
    for (const loanId of affectedLoanIds) {
      if (!unpaidByLoan.has(loanId)) {
        await updateLoanAdmin(loanId, { status: 'completed' });
        completedLoanIds.push(loanId);
      }
    }
  }

  return { updates, skipped, completedLoanIds };
}

// ─── Today-list (Collect page) ────────────────────────────────────────────────
// Two queries (active loans + matching payments) replace the old Firestore
// two-collection-group pattern. Zero quota risk — Postgres has no daily read cap.

export async function getTodayListData(date: string): Promise<Array<{ loan: Loan; payments: Payment[] }>> {
  // Step 1: Get all active loans
  const { data: loanRows, error: loanErr } = await db
    .from('loans')
    .select('*')
    .eq('status', 'active');
  if (loanErr) throw loanErr;
  if (!loanRows?.length) return [];

  const loanIds = loanRows.map((l: any) => l.id);

  // Step 2: Get payments that are due on/before date OR paid on date (union)
  const { data: dueRows, error: dueErr } = await db
    .from('payments')
    .select('*')
    .in('loan_id', loanIds)
    .lte('due_date', date);
  if (dueErr) throw dueErr;

  const { data: paidRows, error: paidErr } = await db
    .from('payments')
    .select('*')
    .in('loan_id', loanIds)
    .eq('paid_date', date)
    .gt('paid_amount', 0);
  if (paidErr) throw paidErr;

  // Merge + deduplicate by payment id
  const byPaymentId = new Map<string, any>();
  for (const r of [...(dueRows ?? []), ...(paidRows ?? [])]) byPaymentId.set(r.id, r);

  // Build lookup from loanId → loan
  const loanMap = new Map((loanRows ?? []).map((l: any) => [l.id, rowToLoan(l)]));

  // Group payments by loan
  const byLoanId = new Map<string, { loan: Loan; payments: Payment[] }>();
  for (const r of byPaymentId.values()) {
    const loan = loanMap.get(r.loan_id);
    if (!loan) continue;
    if (!byLoanId.has(r.loan_id)) {
      byLoanId.set(r.loan_id, { loan, payments: [] });
    }
    byLoanId.get(r.loan_id)!.payments.push(rowToPayment(r));
  }

  return Array.from(byLoanId.values());
}

// ─── Dashboard / reports ─────────────────────────────────────────────────────

/** All loans (any status) with their payments — for reports/PDFs. */
export async function getAllLoansWithPayments(): Promise<Array<{ loan: Loan; payments: Payment[] }>> {
  const { data: loanRows, error: loanErr } = await db
    .from('loans')
    .select('*')
    .order('created_at', { ascending: false });
  if (loanErr) throw loanErr;
  if (!loanRows?.length) return [];

  const loanIds = loanRows.map((l: any) => l.id);
  const { data: paymentRows, error: pErr } = await db
    .from('payments')
    .select('*')
    .in('loan_id', loanIds)
    .order('period_number', { ascending: true });
  if (pErr) throw pErr;

  const paymentsByLoan = new Map<string, Payment[]>();
  for (const r of paymentRows ?? []) {
    const p = rowToPayment(r);
    const arr = paymentsByLoan.get(p.loanId) ?? [];
    arr.push(p);
    paymentsByLoan.set(p.loanId, arr);
  }

  return loanRows.map((l: any) => ({
    loan:     rowToLoan(l),
    payments: paymentsByLoan.get(l.id) ?? [],
  }));
}

/** Active-only loans with their payments — for dashboard, cron reminders. */
export async function getAllActiveLoansWithPayments(): Promise<Array<{ loan: Loan; payments: Payment[] }>> {
  const { data: loanRows, error: loanErr } = await db
    .from('loans')
    .select('*')
    .eq('status', 'active')
    .order('created_at', { ascending: false });
  if (loanErr) throw loanErr;

  if (!loanRows?.length) return [];

  const loanIds = loanRows.map((l: any) => l.id);
  const { data: paymentRows, error: pErr } = await db
    .from('payments')
    .select('*')
    .in('loan_id', loanIds)
    .order('period_number', { ascending: true });
  if (pErr) throw pErr;

  const paymentsByLoan = new Map<string, Payment[]>();
  for (const r of paymentRows ?? []) {
    const p = rowToPayment(r);
    const arr = paymentsByLoan.get(p.loanId) ?? [];
    arr.push(p);
    paymentsByLoan.set(p.loanId, arr);
  }

  return loanRows.map((l: any) => ({
    loan:     rowToLoan(l),
    payments: paymentsByLoan.get(l.id) ?? [],
  }));
}

export async function getStatsAdmin(): Promise<{
  active_loans: number;
  completed_loans: number;
  total_customers: number;
  total_principal: number;
  interest_pending: number;
  interest_earned: number;
}> {
  const [{ data: loans, error: lErr }, { count: customerCount, error: cErr }] = await Promise.all([
    db.from('loans').select('status, principal, interest_amount, interest_collected'),
    db.from('customers').select('id', { count: 'exact', head: true }),
  ]);
  if (lErr) throw lErr;
  if (cErr) throw cErr;

  let totalPrincipal = 0, interestPending = 0, interestEarned = 0;
  let activeCount = 0, completedCount = 0;

  for (const l of loans ?? []) {
    if (l.status === 'active') {
      activeCount++;
      totalPrincipal += Number(l.principal);
      if (!l.interest_collected) interestPending += Number(l.interest_amount);
    }
    if (l.status === 'completed') completedCount++;
    if (l.interest_collected)    interestEarned  += Number(l.interest_amount);
  }

  return {
    active_loans:     activeCount,
    completed_loans:  completedCount,
    total_customers:  customerCount ?? 0,
    total_principal:  totalPrincipal,
    interest_pending: interestPending,
    interest_earned:  interestEarned,
  };
}

// ─── Overdue / due-soon (used by cron + reports) ─────────────────────────────

export async function getOverduePaymentsAdmin(today: string, limit = 20) {
  // Get active loans first, then filter overdue payments in JS
  // (Supabase/PostgREST can't compare two columns in a WHERE clause)
  const { data: loanRows, error: lErr } = await db
    .from('loans').select('id, customer_name, customer_phone, principal, plan_type')
    .eq('status', 'active');
  if (lErr) throw lErr;
  if (!loanRows?.length) return [];

  const loanIds = loanRows.map((l: any) => l.id);
  const loanMap = new Map(loanRows.map((l: any) => [l.id, l]));

  const { data, error } = await db
    .from('payments').select('*')
    .in('loan_id', loanIds)
    .lt('due_date', today)
    .order('due_date', { ascending: true });
  if (error) throw error;

  return (data ?? [])
    .filter((r: any) => Number(r.paid_amount) < Number(r.expected_amount))
    .slice(0, limit)
    .map((r: any) => {
      const l = loanMap.get(r.loan_id) ?? {};
      return { ...rowToPayment(r), loanId: r.loan_id, customer_name: l.customer_name, customer_phone: l.customer_phone, principal: l.principal, planType: l.plan_type };
    });
}

export async function getDueSoonAdmin(today: string, weekEnd: string, limit = 20) {
  const { data: loanRows, error: lErr } = await db
    .from('loans').select('id, customer_name, customer_phone, principal, plan_type')
    .eq('status', 'active');
  if (lErr) throw lErr;
  if (!loanRows?.length) return [];

  const loanIds = loanRows.map((l: any) => l.id);
  const loanMap = new Map(loanRows.map((l: any) => [l.id, l]));

  const { data, error } = await db
    .from('payments').select('*')
    .in('loan_id', loanIds)
    .gte('due_date', today)
    .lte('due_date', weekEnd)
    .order('due_date', { ascending: true });
  if (error) throw error;

  return (data ?? [])
    .filter((r: any) => Number(r.paid_amount) < Number(r.expected_amount))
    .slice(0, limit)
    .map((r: any) => {
      const l = loanMap.get(r.loan_id) ?? {};
      return { ...rowToPayment(r), loanId: r.loan_id, customer_name: l.customer_name, customer_phone: l.customer_phone, principal: l.principal, planType: l.plan_type };
    });
}

// ─── Advanced RPC-based functions (require advanced-functions.sql applied) ────
//
// These call the PostgreSQL functions created by supabase/advanced-functions.sql.
// They replace the JS-side aggregation loops with single round-trips to Postgres.
// Falls back gracefully if the function doesn't exist yet (PGRST202 / 42883).

/** Single RPC call for all dashboard hero stats. */
export async function getDashboardStatsRPC(): Promise<{
  active_loans: number;
  completed_loans: number;
  defaulted_loans: number;
  total_customers: number;
  capital_deployed: number;
  interest_pending: number;
  interest_earned: number;
  overdue_count: number;
  overdue_amount: number;
  today_due_amount: number;
  today_collected: number;
  total_collected_ever: number;
} | null> {
  const { data, error } = await db.rpc('get_dashboard_stats');
  if (error) {
    if (error.code === '42883' || error.code === 'PGRST202') return null; // function not yet applied
    throw error;
  }
  return data as any;
}

/** Overdue payments with loan info — from DB, no JS filtering. */
export async function getOverduePaymentsRPC(limit = 20) {
  const { data, error } = await db.rpc('get_overdue_payments', { p_limit: limit });
  if (error) {
    if (error.code === '42883' || error.code === 'PGRST202') return null;
    throw error;
  }
  return (data ?? []).map((r: any) => ({
    id:             r.payment_id,
    loanId:         r.loan_id,
    periodNumber:   r.period_number,
    dueDate:        r.due_date,
    expectedAmount: Number(r.expected_amount),
    paidAmount:     Number(r.paid_amount),
    notes:          r.notes ?? '',
    customerId:     r.customer_id,
    customerName:   r.customer_name,
    customerPhone:  r.customer_phone,
    principal:      Number(r.principal),
    planType:       r.plan_type,
  }));
}

/** Payments due in a date range — from DB. */
export async function getDueSoonRPC(from: string, to: string, limit = 20) {
  const { data, error } = await db.rpc('get_due_soon', {
    p_from: from, p_to: to, p_limit: limit,
  });
  if (error) {
    if (error.code === '42883' || error.code === 'PGRST202') return null;
    throw error;
  }
  return (data ?? []).map((r: any) => ({
    id:             r.payment_id,
    loanId:         r.loan_id,
    periodNumber:   r.period_number,
    dueDate:        r.due_date,
    expectedAmount: Number(r.expected_amount),
    paidAmount:     Number(r.paid_amount),
    notes:          r.notes ?? '',
    customerId:     r.customer_id,
    customerName:   r.customer_name,
    customerPhone:  r.customer_phone,
    principal:      Number(r.principal),
    planType:       r.plan_type,
  }));
}

/** Expected vs collected per day for last N days. */
export async function getCashflowRPC(days = 14) {
  const { data, error } = await db.rpc('get_cashflow', { p_days: days });
  if (error) {
    if (error.code === '42883' || error.code === 'PGRST202') return null;
    throw error;
  }
  return (data ?? []).map((r: any) => ({
    date:      typeof r.day === 'string' ? r.day : r.day.toISOString?.().slice(0, 10) ?? String(r.day),
    expected:  Math.round(Number(r.expected)),
    collected: Math.round(Number(r.collected)),
  }));
}

/** Daily collection totals for heatmap (last N days). */
export async function getHeatmapRPC(days = 90) {
  const { data, error } = await db.rpc('get_collection_heatmap', { p_days: days });
  if (error) {
    if (error.code === '42883' || error.code === 'PGRST202') return null;
    throw error;
  }
  return (data ?? []).map((r: any) => ({
    date:     typeof r.day === 'string' ? r.day : r.day.toISOString?.().slice(0, 10) ?? String(r.day),
    amount:   Math.round(Number(r.amount)),
    txCount:  Number(r.tx_count),
  }));
}

/** Top borrowers by outstanding amount. */
export async function getTopBorrowersRPC(limit = 5) {
  const { data, error } = await db.rpc('get_top_borrowers', { p_limit: limit });
  if (error) {
    if (error.code === '42883' || error.code === 'PGRST202') return null;
    throw error;
  }
  return (data ?? []).map((r: any) => ({
    customerId:    r.customer_id,
    name:          r.customer_name,
    phone:         r.customer_phone,
    outstanding:   Math.round(Number(r.outstanding)),
    loans:         Number(r.active_loans),
  }));
}

/** Monthly collections for area chart. */
export async function getMonthlyCollectionsRPC(months = 6) {
  const { data, error } = await db.rpc('get_monthly_collections', { p_months: months });
  if (error) {
    if (error.code === '42883' || error.code === 'PGRST202') return null;
    throw error;
  }
  return (data ?? []).map((r: any) => ({
    month:     r.month,
    collected: Math.round(Number(r.collected)),
    count:     Number(r.tx_count),
  }));
}

/** Active loan counts & principal split by plan type. */
export async function getPlanSplitRPC() {
  const { data, error } = await db.rpc('get_plan_split');
  if (error) {
    if (error.code === '42883' || error.code === 'PGRST202') return null;
    throw error;
  }
  const result = { daily: { count: 0, principal: 0 }, weekly: { count: 0, principal: 0 } };
  for (const r of (data ?? [])) {
    const key = r.plan_type as 'daily' | 'weekly';
    if (key === 'daily' || key === 'weekly') {
      result[key] = { count: Number(r.loan_count), principal: Number(r.total_principal) };
    }
  }
  return result;
}

/** Expected vs collected for a date range. */
export async function getWeekCollectionsRPC(from: string, to: string) {
  const { data, error } = await db.rpc('get_week_collections', { p_from: from, p_to: to });
  if (error) {
    if (error.code === '42883' || error.code === 'PGRST202') return null;
    throw error;
  }
  return { expected: Number((data as any)?.expected ?? 0), collected: Number((data as any)?.collected ?? 0) };
}

/** Per-customer aggregated stats. */
export async function getCustomerStatsRPC(customerId: string) {
  const { data, error } = await db.rpc('get_customer_stats', { p_customer_id: customerId });
  if (error) {
    if (error.code === '42883' || error.code === 'PGRST202') return null;
    throw error;
  }
  return data as {
    active_loans: number; completed_loans: number;
    total_outstanding: number; total_paid: number; total_principal: number;
    total_interest: number; overdue_amount: number; overdue_count: number;
    today_due: number; repayment_rate: number;
    daily_loan_count: number; weekly_loan_count: number;
  } | null;
}

/** Today's collection list — single SQL query replaces 3 round-trips + JS merge. */
export async function getTodayCollectionListRPC(date: string): Promise<Array<{ loan: Loan; payments: Payment[] }> | null> {
  const { data, error } = await db.rpc('get_today_collection_list', { p_date: date });
  if (error) {
    if (error.code === '42883' || error.code === 'PGRST202') return null;
    throw error;
  }

  // Group by loan
  const byLoan = new Map<string, { loan: Loan; payments: Payment[] }>();
  for (const r of (data ?? [])) {
    if (!byLoan.has(r.loan_id)) {
      byLoan.set(r.loan_id, {
        loan: {
          id:             r.loan_id,
          customerId:     r.customer_id,
          customerName:   r.customer_name,
          customerPhone:  r.customer_phone,
          planType:       r.plan_type,
          principal:      Number(r.principal),
          // Scaffold remaining fields — not needed for collect page
          interestRate: 0, loanTermPeriods: 0, totalPeriods: 0,
          interestAmount: 0, totalAmount: 0, periodAmount: Number(r.expected_amount),
          startDate: '', endDate: '', notes: '', status: 'active',
          interestCollected: false, interestCollectedDate: null,
          createdAt: '', updatedAt: '',
        },
        payments: [],
      });
    }
    byLoan.get(r.loan_id)!.payments.push({
      id:             r.payment_id,
      loanId:         r.loan_id,
      periodNumber:   r.period_number,
      dueDate:        typeof r.due_date === 'string' ? r.due_date : (r.due_date as Date).toISOString().slice(0, 10),
      expectedAmount: Number(r.expected_amount),
      paidAmount:     Number(r.paid_amount),
      paidDate:       r.paid_date
        ? (typeof r.paid_date === 'string' ? r.paid_date : (r.paid_date as Date).toISOString().slice(0, 10))
        : null,
      status:         r.status,
      notes:          r.notes ?? '',
      createdAt:      '',
      updatedAt:      '',
    });
  }
  return Array.from(byLoan.values());
}

/** Most recently collected payments — for dashboard Recent Activity. */
export async function getRecentActivityRPC(limit = 8) {
  const { data, error } = await db.rpc('get_recent_activity', { p_limit: limit });
  if (error) {
    if (error.code === '42883' || error.code === 'PGRST202') return null;
    throw error;
  }
  return (data ?? []).map((r: any) => ({
    id:             r.payment_id,
    loanId:         r.loan_id,
    periodNumber:   r.period_number,
    dueDate:        r.due_date,
    paidDate:       r.paid_date,
    paidAmount:     Number(r.paid_amount),
    expectedAmount: Number(r.expected_amount),
    customerName:   r.customer_name,
    customerPhone:  r.customer_phone,
    principal:      Number(r.principal),
    planType:       r.plan_type,
  }));
}
