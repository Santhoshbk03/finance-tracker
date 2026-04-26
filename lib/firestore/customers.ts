import {
  collection, doc, getDocs, getDoc, addDoc, updateDoc, deleteDoc,
  query, orderBy, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { db } from '@/lib/firebase';
import { invalidateLoansCache } from '@/lib/firestore/loans';

export interface Customer {
  id: string;
  name: string;
  phone: string;
  address: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Server-side (Admin SDK) ─────────────────────────────────────────────────

export async function getCustomersAdmin(): Promise<Customer[]> {
  const snap = await adminDb.collection('customers').orderBy('createdAt', 'desc').get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Customer));
}

export async function getCustomerAdmin(id: string): Promise<Customer | null> {
  const snap = await adminDb.collection('customers').doc(id).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() } as Customer;
}

export async function createCustomerAdmin(data: Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>): Promise<Customer> {
  const now = new Date().toISOString();
  const ref = await adminDb.collection('customers').add({
    ...data,
    createdAt: now,
    updatedAt: now,
  });
  return { id: ref.id, ...data, createdAt: now, updatedAt: now };
}

export async function updateCustomerAdmin(id: string, data: Partial<Customer>): Promise<void> {
  await adminDb.collection('customers').doc(id).update({
    ...data,
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteCustomerAdmin(id: string): Promise<void> {
  // Delete all loans and their payments first
  const loans = await adminDb.collection('loans').where('customerId', '==', id).get();
  const batch = adminDb.batch();
  for (const loan of loans.docs) {
    const payments = await adminDb.collection('loans').doc(loan.id).collection('payments').get();
    for (const p of payments.docs) batch.delete(p.ref);
    batch.delete(loan.ref);
  }
  batch.delete(adminDb.collection('customers').doc(id));
  await batch.commit();
  invalidateLoansCache();
}

export async function findOrCreateCustomerAdmin(name: string, phone?: string): Promise<Customer> {
  if (phone) {
    const existing = await adminDb.collection('customers')
      .where('phone', '==', phone).limit(1).get();
    if (!existing.empty) return { id: existing.docs[0].id, ...existing.docs[0].data() } as Customer;
  }
  return createCustomerAdmin({ name, phone: phone || '', address: '', notes: '' });
}
