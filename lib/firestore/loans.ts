import { adminDb } from '@/lib/firebase-admin';
import { localDateStr } from '@/lib/calculations';
import { unstable_cache, revalidateTag } from 'next/cache';

export type PlanType = 'weekly' | 'daily';

export interface Loan {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  planType: PlanType;
  principal: number;
  interestRate: number;
  loanTermPeriods: number;   // weeks for weekly, days for daily
  totalPeriods: number;
  interestAmount: number;
  totalAmount: number;
  periodAmount: number;      // weekly_amount or daily_amount
  startDate: string;         // YYYY-MM-DD
  endDate: string;           // YYYY-MM-DD
  notes: string;
  status: 'active' | 'completed' | 'defaulted';
  interestCollected: boolean;
  interestCollectedDate: string | null;
  scheduleConfig?: {
    /** 0-6 (Sun-Sat). Payment day for weekly loans. */
    weeklyDayOfWeek?: number;
    /** 0-6 days that are skipped for daily loans (e.g. [0] = skip Sundays). */
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

// ─── Cache tags ──────────────────────────────────────────────────────────────
// Any Firestore read that goes through a cached wrapper in this file is tagged
// with LOANS_TAG. Mutations call `invalidateLoansCache()` to force re-reads.
// This is the ONLY thing standing between us and the 50K/day read quota.
export const LOANS_TAG = 'loans-data';

export function invalidateLoansCache() {
  // expire:0 → immediate invalidation. Required because right after a mutation
  // (e.g. payment collected) the user expects the next read to reflect it.
  revalidateTag(LOANS_TAG, { expire: 0 });
}

// ─── Loans ───────────────────────────────────────────────────────────────────

export async function getLoansAdmin(filters?: { status?: string; customerId?: string }): Promise<Loan[]> {
  // Note: we intentionally avoid combining `where(...)` with `orderBy('createdAt')`
  // because that requires a Firestore composite index. Instead, we apply ONE
  // equality filter in the query (the more selective one) and sort in memory.
  // Volume per customer is small (dozens, not thousands), so this is free.
  let q = adminDb.collection('loans') as FirebaseFirestore.Query;
  if (filters?.customerId) {
    q = q.where('customerId', '==', filters.customerId);
  } else if (filters?.status) {
    q = q.where('status', '==', filters.status);
  } else {
    q = q.orderBy('createdAt', 'desc');
  }
  const snap = await q.get();
  let loans = snap.docs.map((d) => ({ ...d.data(), id: d.id } as Loan));
  // Apply any remaining filter in memory
  if (filters?.customerId && filters?.status) {
    loans = loans.filter((l) => l.status === filters.status);
  }
  // Sort by createdAt desc in memory when we couldn't use orderBy
  if (filters?.customerId || filters?.status) {
    loans.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }
  return loans;
}

export async function getLoanAdmin(id: string): Promise<Loan | null> {
  const snap = await adminDb.collection('loans').doc(id).get();
  if (!snap.exists) return null;
  return { ...snap.data(), id: snap.id } as Loan;
}

export async function createLoanAdmin(
  loanData: Omit<Loan, 'id' | 'createdAt' | 'updatedAt'>,
  payments: Omit<Payment, 'id' | 'loanId' | 'createdAt' | 'updatedAt'>[]
): Promise<Loan> {
  const now = new Date().toISOString();
  const loanRef = await adminDb.collection('loans').add({
    ...loanData,
    createdAt: now,
    updatedAt: now,
  });

  // Write all payment documents in batches of 500
  const batchSize = 500;
  for (let i = 0; i < payments.length; i += batchSize) {
    const batch = adminDb.batch();
    const chunk = payments.slice(i, i + batchSize);
    for (const p of chunk) {
      const pRef = adminDb.collection('loans').doc(loanRef.id).collection('payments').doc();
      batch.set(pRef, { ...p, loanId: loanRef.id, createdAt: now, updatedAt: now });
    }
    await batch.commit();
  }

  // Update stats aggregate
  await updateStatsOnLoanCreate(loanData);
  invalidateLoansCache();

  return { ...loanData, id: loanRef.id, createdAt: now, updatedAt: now };
}

export async function updateLoanAdmin(id: string, data: Partial<Loan>): Promise<void> {
  await adminDb.collection('loans').doc(id).update({
    ...data,
    updatedAt: new Date().toISOString(),
  });
  invalidateLoansCache();
}

export async function deleteLoanAdmin(id: string): Promise<void> {
  const payments = await adminDb.collection('loans').doc(id).collection('payments').get();
  const batch = adminDb.batch();
  for (const p of payments.docs) batch.delete(p.ref);
  batch.delete(adminDb.collection('loans').doc(id));
  await batch.commit();
  invalidateLoansCache();
}

// ─── Payments ────────────────────────────────────────────────────────────────

export async function getPaymentsAdmin(loanId: string): Promise<Payment[]> {
  const snap = await adminDb.collection('loans').doc(loanId).collection('payments')
    .orderBy('periodNumber', 'asc').get();
  return snap.docs.map((d) => ({ ...d.data(), id: d.id, loanId } as Payment));
}

export async function updatePaymentAdmin(
  loanId: string,
  paymentId: string,
  data: Partial<Payment>
): Promise<void> {
  await adminDb.collection('loans').doc(loanId).collection('payments').doc(paymentId).update({
    ...data,
    updatedAt: new Date().toISOString(),
  });
  invalidateLoansCache();
}

// ─── Dashboard / report queries ──────────────────────────────────────────────
// These fetch ALL payments across active loans. Expensive. Cached aggressively.

async function _getAllActiveLoansWithPayments() {
  const loansSnap = await adminDb.collection('loans').where('status', '==', 'active').get();
  const result: { loan: Loan; payments: Payment[] }[] = [];
  for (const loanDoc of loansSnap.docs) {
    const paymentsSnap = await adminDb.collection('loans').doc(loanDoc.id).collection('payments').get();
    result.push({
      loan: { ...(loanDoc.data() as Loan), id: loanDoc.id },
      payments: paymentsSnap.docs.map(p => ({ ...(p.data() as Payment), id: p.id })),
    });
  }
  return result;
}

export const getAllActiveLoansWithPayments = unstable_cache(
  _getAllActiveLoansWithPayments,
  ['active-loans-with-payments'],
  { tags: [LOANS_TAG], revalidate: 60 }
);

async function _getAllLoansWithPayments() {
  const loansSnap = await adminDb.collection('loans').get();
  const result: { loan: Loan; payments: Payment[] }[] = [];
  for (const loanDoc of loansSnap.docs) {
    const paymentsSnap = await adminDb.collection('loans').doc(loanDoc.id).collection('payments').get();
    result.push({
      loan: { ...(loanDoc.data() as Loan), id: loanDoc.id },
      payments: paymentsSnap.docs.map(p => ({ ...(p.data() as Payment), id: p.id })),
    });
  }
  return result;
}

export const getAllLoansWithPayments = unstable_cache(
  _getAllLoansWithPayments,
  ['all-loans-with-payments'],
  { tags: [LOANS_TAG], revalidate: 60 }
);

// ─── Today-list narrowed query (quota-friendly) ──────────────────────────────
// Instead of reading every payment for every active loan, we run two
// collection-group queries: one for everything due ON or BEFORE `date`, one
// for payments actually collected ON `date`. Future payments are skipped.
// For a book with N loans of K periods where the median loan is halfway done,
// this reads roughly N*K/2 instead of N*K payment docs.
//
// Shape mirrors getAllActiveLoansWithPayments so callers can use it the same way,
// but the per-loan `payments` array is already filtered to the relevant window.

async function _getTodayListData(date: string) {
  // Query 1: all payments due on or before the target date
  const dueSnap = await adminDb
    .collectionGroup('payments')
    .where('dueDate', '<=', date)
    .get();

  // Query 2: all payments collected on the target date
  const paidSnap = await adminDb
    .collectionGroup('payments')
    .where('paidDate', '==', date)
    .get();

  // Union by doc path — a payment collected today also has dueDate <= today
  // in many cases, so de-dup is essential.
  const byPath = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
  for (const d of dueSnap.docs) byPath.set(d.ref.path, d);
  for (const d of paidSnap.docs) byPath.set(d.ref.path, d);

  // Group payment docs by their parent loan id.
  const paymentsByLoanId = new Map<string, Payment[]>();
  for (const d of byPath.values()) {
    const loanId = d.ref.parent.parent!.id; // .../loans/{loanId}/payments/{id}
    const arr = paymentsByLoanId.get(loanId) || [];
    arr.push({ ...(d.data() as Payment), id: d.id, loanId });
    paymentsByLoanId.set(loanId, arr);
  }

  // Batch-fetch the loan docs we need (one round-trip via getAll).
  const loanIds = Array.from(paymentsByLoanId.keys());
  if (loanIds.length === 0) return [];

  const refs = loanIds.map((id) => adminDb.collection('loans').doc(id));
  const loanDocs = await adminDb.getAll(...refs);

  const result: { loan: Loan; payments: Payment[] }[] = [];
  for (const doc of loanDocs) {
    if (!doc.exists) continue;
    const loan = { ...(doc.data() as Loan), id: doc.id };
    if (loan.status !== 'active') continue; // Skip completed/defaulted
    result.push({
      loan,
      payments: paymentsByLoanId.get(doc.id) || [],
    });
  }
  return result;
}

/** Cached, narrowed fetch for the Collect page. Keyed by date. */
export const getTodayListData = unstable_cache(
  _getTodayListData,
  ['today-list-data'],
  { tags: [LOANS_TAG], revalidate: 60 }
);

// ─── Overdue / due-soon helpers (still used by a few routes) ─────────────────

export async function getOverduePaymentsAdmin(today: string, limit = 20) {
  const loansWithPayments = await getAllActiveLoansWithPayments();
  const results: object[] = [];

  for (const { loan, payments } of loansWithPayments) {
    for (const payment of payments) {
      if (payment.dueDate < today && payment.paidAmount < payment.expectedAmount) {
        results.push({
          ...payment,
          id: payment.id, loanId: loan.id,
          customer_name: loan.customerName,
          customer_phone: loan.customerPhone,
          principal: loan.principal,
          planType: loan.planType,
        });
      }
    }
  }

  return results
    .sort((a: any, b: any) => a.dueDate < b.dueDate ? -1 : 1)
    .slice(0, limit);
}

export async function getDueSoonAdmin(today: string, weekEnd: string, limit = 20) {
  const loansWithPayments = await getAllActiveLoansWithPayments();
  const results: object[] = [];

  for (const { loan, payments } of loansWithPayments) {
    for (const payment of payments) {
      if (payment.dueDate >= today && payment.dueDate <= weekEnd && payment.paidAmount < payment.expectedAmount) {
        results.push({
          ...payment,
          id: payment.id, loanId: loan.id,
          customer_name: loan.customerName,
          customer_phone: loan.customerPhone,
          principal: loan.principal,
          planType: loan.planType,
        });
      }
    }
  }

  return results
    .sort((a: any, b: any) => a.dueDate < b.dueDate ? -1 : 1)
    .slice(0, limit);
}

// ─── Stats aggregate ────────────────────────────────────────────────────────

async function updateStatsOnLoanCreate(loan: Omit<Loan, 'id' | 'createdAt' | 'updatedAt'>) {
  const statsRef = adminDb.collection('meta').doc('stats');
  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(statsRef);
    const stats = snap.exists ? snap.data()! : {
      activeLoanCount: 0, completedLoanCount: 0, totalCustomers: 0,
      totalActivePrincipal: 0, totalInterestEarned: 0, totalInterestPending: 0,
    };
    tx.set(statsRef, {
      ...stats,
      activeLoanCount: (stats.activeLoanCount || 0) + 1,
      totalActivePrincipal: (stats.totalActivePrincipal || 0) + loan.principal,
      totalInterestPending: (stats.totalInterestPending || 0) + (loan.interestCollected ? 0 : loan.interestAmount),
      totalInterestEarned: (stats.totalInterestEarned || 0) + (loan.interestCollected ? loan.interestAmount : 0),
      updatedAt: new Date().toISOString(),
    });
  });
}

async function _getStatsAdmin() {
  const [loansSnap, customersSnap] = await Promise.all([
    adminDb.collection('loans').get(),
    adminDb.collection('customers').get(),
  ]);

  let totalPrincipal = 0;
  let interestPending = 0;
  let interestEarned = 0;
  let activeCount = 0;
  let completedCount = 0;

  for (const d of loansSnap.docs) {
    const l = d.data() as Loan;
    if (l.status === 'active') {
      activeCount++;
      totalPrincipal += l.principal;
      if (!l.interestCollected) interestPending += l.interestAmount;
    }
    if (l.status === 'completed' || l.interestCollected) {
      completedCount += l.status === 'completed' ? 1 : 0;
      if (l.interestCollected) interestEarned += l.interestAmount;
    }
  }

  return {
    active_loans: activeCount,
    completed_loans: completedCount,
    total_customers: customersSnap.size,
    total_principal: totalPrincipal,
    interest_pending: interestPending,
    interest_earned: interestEarned,
  };
}

export const getStatsAdmin = unstable_cache(
  _getStatsAdmin,
  ['stats-admin'],
  { tags: [LOANS_TAG], revalidate: 60 }
);
