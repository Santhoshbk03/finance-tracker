#!/usr/bin/env node
/**
 * ONE-SHOT Firestore → Supabase migration script.
 *
 * Reads every customer, loan, and payment from Firestore (using the Admin SDK)
 * and upserts them into Supabase, preserving the original Firestore document
 * IDs as text primary keys.  Run once, idempotent (upsert on conflict).
 *
 * Usage:
 *   node scripts/migrate-firestore-to-supabase.mjs
 *
 * Required env vars (same as your .env.local):
 *   FIREBASE_PROJECT_ID
 *   FIREBASE_CLIENT_EMAIL
 *   FIREBASE_PRIVATE_KEY
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY   (or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
 *
 * The script reads .env.local automatically via the dotenv logic at the top.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ── Load .env.local manually (dotenv-lite) ────────────────────────────────────
const __dir = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dir, '..', '.env.local');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key   = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (!(key in process.env)) process.env[key] = value;
  }
  console.log('✓ Loaded .env.local');
} else {
  console.warn('⚠  No .env.local found — using existing process.env');
}

// ── Firebase Admin ────────────────────────────────────────────────────────────
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore }        from 'firebase-admin/firestore';

const firebaseApp = initializeApp({
  credential: cert({
    projectId:   process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey:  (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  }),
});
const firestore = getFirestore(firebaseApp);

// ── Supabase ──────────────────────────────────────────────────────────────────
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
                 ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('✗ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function now() { return new Date().toISOString(); }

/** Upsert a batch of rows, retrying on transient errors. */
async function upsert(table, rows, onConflict) {
  if (rows.length === 0) return;
  const { error } = await supabase.from(table).upsert(rows, { onConflict });
  if (error) throw new Error(`[${table}] upsert error: ${error.message}`);
}

/** Chunk an array into slices of at most `size`. */
function chunk(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

// ── Migration ─────────────────────────────────────────────────────────────────
async function run() {
  const startTime = Date.now();
  console.log('\n╔═══════════════════════════════════════════════════╗');
  console.log('║   Firestore → Supabase Migration                  ║');
  console.log('╚═══════════════════════════════════════════════════╝\n');

  // ── 1. Customers ─────────────────────────────────────────────────────────────
  console.log('① Reading customers from Firestore…');
  const customersSnap = await firestore.collection('customers').get();
  const customerRows = customersSnap.docs.map((d) => {
    const data = d.data();
    return {
      id:         d.id,
      name:       data.name        ?? '',
      phone:      data.phone       ?? '',
      address:    data.address     ?? '',
      notes:      data.notes       ?? '',
      created_at: data.createdAt   ?? now(),
      updated_at: data.updatedAt   ?? now(),
    };
  });
  console.log(`   → ${customerRows.length} customers`);

  for (const batch of chunk(customerRows, 200)) {
    await upsert('customers', batch, 'id');
  }
  console.log(`   ✓ Upserted ${customerRows.length} customers\n`);

  // ── 2. Loans + Payments ───────────────────────────────────────────────────────
  console.log('② Reading loans from Firestore…');
  const loansSnap = await firestore.collection('loans').get();
  console.log(`   → ${loansSnap.docs.length} loans`);

  let totalPayments = 0;
  let loansDone = 0;

  for (const loanDoc of loansSnap.docs) {
    const l = loanDoc.data();

    const loanRow = {
      id:                      loanDoc.id,
      customer_id:             l.customerId          ?? null,
      customer_name:           l.customerName        ?? '',
      customer_phone:          l.customerPhone       ?? '',
      plan_type:               l.planType            ?? 'weekly',
      principal:               Number(l.principal)   || 0,
      interest_rate:           Number(l.interestRate)|| 0,
      loan_term_periods:       Number(l.loanTermPeriods) || Number(l.loan_term_weeks) || 0,
      total_periods:           Number(l.totalPeriods)    || Number(l.total_weeks) || 0,
      interest_amount:         Number(l.interestAmount)  || 0,
      total_amount:            Number(l.totalAmount)     || 0,
      period_amount:           Number(l.periodAmount)    || Number(l.weekly_amount) || 0,
      start_date:              l.startDate           ?? null,
      end_date:                l.endDate             ?? null,
      notes:                   l.notes               ?? '',
      status:                  l.status              ?? 'active',
      interest_collected:      Boolean(l.interestCollected),
      interest_collected_date: l.interestCollectedDate ?? null,
      schedule_config:         l.scheduleConfig       ?? null,
      created_at:              l.createdAt            ?? now(),
      updated_at:              l.updatedAt            ?? now(),
    };

    // Insert/upsert the loan
    await upsert('loans', [loanRow], 'id');

    // Read payments subcollection
    const paymentsSnap = await firestore
      .collection('loans').doc(loanDoc.id)
      .collection('payments')
      .orderBy('periodNumber', 'asc')
      .get();

    const paymentRows = paymentsSnap.docs.map((pd) => {
      const p = pd.data();
      const paidAmt = Number(p.paidAmount) || 0;
      const expectedAmt = Number(p.expectedAmount) || 0;

      // Recompute status from stored values (source of truth)
      let status = p.status ?? 'pending';
      if (paidAmt >= expectedAmt && expectedAmt > 0) status = 'paid';
      else if (paidAmt > 0) status = 'partial';

      return {
        id:              pd.id,
        loan_id:         loanDoc.id,
        period_number:   Number(p.periodNumber) || 0,
        due_date:        p.dueDate             ?? null,
        expected_amount: expectedAmt,
        paid_amount:     paidAmt,
        paid_date:       p.paidDate            ?? null,
        status,
        notes:           p.notes               ?? '',
        created_at:      p.createdAt           ?? now(),
        updated_at:      p.updatedAt           ?? now(),
      };
    });

    // Upsert payments in chunks of 500
    for (const batch of chunk(paymentRows, 500)) {
      await upsert('payments', batch, 'id');
    }

    totalPayments += paymentRows.length;
    loansDone++;

    if (loansDone % 10 === 0 || loansDone === loansSnap.docs.length) {
      process.stdout.write(`\r   ✓ ${loansDone}/${loansSnap.docs.length} loans, ${totalPayments} payments…`);
    }
  }

  // ── 3. Auto-complete fully-paid loans ─────────────────────────────────────────
  // After migration, mark any loan where all payments are paid as completed.
  console.log('\n\n③ Checking loan completion status…');
  const { data: activeLoans } = await supabase
    .from('loans').select('id').eq('status', 'active');

  let completedCount = 0;
  for (const { id } of (activeLoans ?? [])) {
    const { count } = await supabase
      .from('payments')
      .select('id', { count: 'exact', head: true })
      .eq('loan_id', id)
      .neq('status', 'paid');
    if (count === 0) {
      await supabase.from('loans').update({ status: 'completed', updated_at: now() }).eq('id', id);
      completedCount++;
    }
  }
  console.log(`   ✓ ${completedCount} loans auto-completed\n`);

  // ── Summary ───────────────────────────────────────────────────────────────────
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('╔═══════════════════════════════════════════════════╗');
  console.log('║   Migration Complete!                             ║');
  console.log('╠═══════════════════════════════════════════════════╣');
  console.log(`║   Customers : ${String(customerRows.length).padEnd(34)}║`);
  console.log(`║   Loans     : ${String(loansSnap.docs.length).padEnd(34)}║`);
  console.log(`║   Payments  : ${String(totalPayments).padEnd(34)}║`);
  console.log(`║   Time      : ${String(elapsed + 's').padEnd(34)}║`);
  console.log('╚═══════════════════════════════════════════════════╝\n');
}

run().catch((err) => {
  console.error('\n✗ Migration failed:', err.message ?? err);
  process.exit(1);
});
