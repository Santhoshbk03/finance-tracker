import { adminDb } from '@/lib/firebase-admin';
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

// ─── Loans ───────────────────────────────────────────────────────────────────

export async function getLoansAdmin(filters?: { status?: string; customerId?: string }): Promise<Loan[]> {
  let q = adminDb.collection('loans') as FirebaseFirestore.Query;
  if (filters?.status) q = q.where('status', '==', filters.status);
  if (filters?.customerId) q = q.where('customerId', '==', filters.customerId);
  q = q.orderBy('createdAt', 'desc');
  const snap = await q.get();
  return snap.docs.map((d) => ({ ...d.data(), id: d.id } as Loan));
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

  return { ...loanData, id: loanRef.id, createdAt: now, updatedAt: now };
}

export async function updateLoanAdmin(id: string, data: Partial<Loan>): Promise<void> {
  await adminDb.collection('loans').doc(id).update({
    ...data,
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteLoanAdmin(id: string): Promise<void> {
  const payments = await adminDb.collection('loans').doc(id).collection('payments').get();
  const batch = adminDb.batch();
  for (const p of payments.docs) batch.delete(p.ref);
  batch.delete(adminDb.collection('loans').doc(id));
  await batch.commit();
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
}

// ─── Dashboard queries (fetch all payments per loan, filter in JS — no indexes needed) ──

export async function getAllActiveLoansWithPayments() {
  const loansSnap = await adminDb.collection('loans').where('status', '==', 'active').get();
  const result = [];
  for (const loanDoc of loansSnap.docs) {
    const paymentsSnap = await adminDb.collection('loans').doc(loanDoc.id).collection('payments').get();
    result.push({
      loan: { ...(loanDoc.data() as Loan), id: loanDoc.id },
      payments: paymentsSnap.docs.map(p => ({ ...(p.data() as Payment), id: p.id })),
    });
  }
  return result;
}

// Fetch every loan (any status) with its payments — for reports that include completed loans
export async function getAllLoansWithPayments() {
  const loansSnap = await adminDb.collection('loans').get();
  const result = [];
  for (const loanDoc of loansSnap.docs) {
    const paymentsSnap = await adminDb.collection('loans').doc(loanDoc.id).collection('payments').get();
    result.push({
      loan: { ...(loanDoc.data() as Loan), id: loanDoc.id },
      payments: paymentsSnap.docs.map(p => ({ ...(p.data() as Payment), id: p.id })),
    });
  }
  return result;
}

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

export async function getStatsAdmin() {
  const [loansSnap, customersSnap, statsSnap] = await Promise.all([
    adminDb.collection('loans').get(),
    adminDb.collection('customers').get(),
    adminDb.collection('meta').doc('stats').get(),
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
