#!/usr/bin/env node
/**
 * Reset Supabase & Migrate from Firestore.
 *
 * Steps:
 *   1. Wipe ALL rows from payments → loans → customers (FK order)
 *   2. Import every customer, loan, and payment from Firestore
 *   3. Auto-complete fully-paid loans
 *
 * Usage:
 *   node scripts/reset-and-migrate.mjs
 *
 * Required env vars (read from .env.local automatically):
 *   FIREBASE_PROJECT_ID
 *   FIREBASE_CLIENT_EMAIL
 *   FIREBASE_PRIVATE_KEY
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname }            from 'node:path';
import { fileURLToPath }            from 'node:url';

// ── Load .env.local ────────────────────────────────────────────────────────────
const __dir = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dir, '..', '.env.local');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!(k in process.env)) process.env[k] = v;
  }
}

// ── Firebase Admin ─────────────────────────────────────────────────────────────
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

// ── Supabase (service role — bypasses RLS) ─────────────────────────────────────
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
                 ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('✗ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}
if (!supabaseKey.includes('service_role') && !supabaseKey.startsWith('sb_secret_')) {
  console.warn('⚠  Key looks like a publishable key — deletes may fail if RLS is on.');
}

const sb = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── Helpers ────────────────────────────────────────────────────────────────────
const now = () => new Date().toISOString();

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function deleteAll(table) {
  // `.not('id','is',null)` matches every row regardless of ID format
  const { error, count } = await sb.from(table).delete().not('id', 'is', null);
  if (error) throw new Error(`[${table}] delete error: ${error.message}`);
  return count;
}

async function upsertChunked(table, rows, onConflict, chunkSize = 500) {
  if (!rows.length) return;
  for (const batch of chunk(rows, chunkSize)) {
    const { error } = await sb.from(table).upsert(batch, { onConflict });
    if (error) throw new Error(`[${table}] upsert error: ${error.message}`);
  }
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function run() {
  const t0 = Date.now();
  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║   Reset Supabase  +  Migrate from Firestore          ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');

  // ── STEP 1 — WIPE SUPABASE ───────────────────────────────────────────────────
  console.log('⑴  Wiping existing Supabase data…');
  console.log('   (order: payments → loans → customers to satisfy FK constraints)');

  const delPay = await deleteAll('payments');
  console.log(`   ✓ Deleted payments table`);

  const delLoan = await deleteAll('loans');
  console.log(`   ✓ Deleted loans table`);

  const delCust = await deleteAll('customers');
  console.log(`   ✓ Deleted customers table`);

  console.log('   Supabase is now empty.\n');

  // ── STEP 2 — CUSTOMERS ───────────────────────────────────────────────────────
  console.log('⑵  Reading customers from Firestore…');
  const custSnap = await firestore.collection('customers').get();
  console.log(`   → ${custSnap.docs.length} customers found`);

  const customerRows = custSnap.docs.map(d => {
    const r = d.data();
    return {
      id:         d.id,
      name:       r.name       ?? '',
      phone:      r.phone      ?? '',
      address:    r.address    ?? '',
      notes:      r.notes      ?? '',
      created_at: r.createdAt  ?? now(),
      updated_at: r.updatedAt  ?? now(),
    };
  });

  await upsertChunked('customers', customerRows, 'id');
  console.log(`   ✓ Inserted ${customerRows.length} customers\n`);

  // ── STEP 3 — LOANS + PAYMENTS ────────────────────────────────────────────────
  console.log('⑶  Reading loans + payments from Firestore…');
  const loansSnap = await firestore.collection('loans').get();
  console.log(`   → ${loansSnap.docs.length} loans found`);

  let totalPayments = 0;
  let loanIdx = 0;

  for (const loanDoc of loansSnap.docs) {
    const l = loanDoc.data();

    const loanRow = {
      id:                      loanDoc.id,
      customer_id:             l.customerId             ?? null,
      customer_name:           l.customerName           ?? '',
      customer_phone:          l.customerPhone          ?? '',
      plan_type:               l.planType               ?? 'weekly',
      principal:               Number(l.principal)      || 0,
      interest_rate:           Number(l.interestRate)   || 0,
      loan_term_periods:       Number(l.loanTermPeriods)  || Number(l.loan_term_weeks)   || 0,
      total_periods:           Number(l.totalPeriods)     || Number(l.total_weeks)        || 0,
      interest_amount:         Number(l.interestAmount)   || 0,
      total_amount:            Number(l.totalAmount)      || 0,
      period_amount:           Number(l.periodAmount)     || Number(l.weekly_amount)      || 0,
      start_date:              l.startDate               ?? null,
      end_date:                l.endDate                 ?? null,
      notes:                   l.notes                   ?? '',
      status:                  l.status                  ?? 'active',
      interest_collected:      Boolean(l.interestCollected),
      interest_collected_date: l.interestCollectedDate   ?? null,
      schedule_config:         l.scheduleConfig           ?? null,
      created_at:              l.createdAt               ?? now(),
      updated_at:              l.updatedAt               ?? now(),
    };

    // Validate customer FK — if the customer wasn't in Firestore, create a placeholder
    if (loanRow.customer_id) {
      const { count } = await sb
        .from('customers')
        .select('id', { count: 'exact', head: true })
        .eq('id', loanRow.customer_id);

      if (!count || count === 0) {
        // Orphaned loan — insert a placeholder customer
        console.warn(`   ⚠  Loan ${loanDoc.id} has no matching customer ${loanRow.customer_id} — creating placeholder`);
        await sb.from('customers').upsert({
          id: loanRow.customer_id,
          name: loanRow.customer_name || '(Unknown)',
          phone: loanRow.customer_phone || '',
          address: '', notes: '',
          created_at: now(), updated_at: now(),
        }, { onConflict: 'id' });
      }
    } else {
      // No customer_id — skip loan
      console.warn(`   ⚠  Skipping loan ${loanDoc.id}: no customer_id`);
      loanIdx++;
      continue;
    }

    // Insert loan
    const { error: lErr } = await sb.from('loans').insert(loanRow);
    if (lErr) {
      console.error(`   ✗ Failed to insert loan ${loanDoc.id}: ${lErr.message}`);
      loanIdx++;
      continue;
    }

    // Payments subcollection
    const paySnap = await firestore
      .collection('loans').doc(loanDoc.id)
      .collection('payments')
      .orderBy('periodNumber', 'asc')
      .get();

    const paymentRows = paySnap.docs.map(pd => {
      const p = pd.data();
      const paidAmt     = Number(p.paidAmount)    || 0;
      const expectedAmt = Number(p.expectedAmount) || 0;

      let status = p.status ?? 'pending';
      if (paidAmt >= expectedAmt && expectedAmt > 0) status = 'paid';
      else if (paidAmt > 0)                          status = 'partial';

      return {
        id:              pd.id,
        loan_id:         loanDoc.id,
        period_number:   Number(p.periodNumber) || 0,
        due_date:        p.dueDate              ?? null,
        expected_amount: expectedAmt,
        paid_amount:     paidAmt,
        paid_date:       p.paidDate             ?? null,
        status,
        notes:           p.notes                ?? '',
        created_at:      p.createdAt            ?? now(),
        updated_at:      p.updatedAt            ?? now(),
      };
    });

    await upsertChunked('payments', paymentRows, 'id');
    totalPayments += paymentRows.length;
    loanIdx++;

    process.stdout.write(
      `\r   ✓ ${loanIdx}/${loansSnap.docs.length} loans | ${totalPayments} payments`
    );
  }

  console.log('\n');

  // ── STEP 4 — AUTO-COMPLETE FULLY-PAID LOANS ───────────────────────────────────
  console.log('⑷  Checking loan completion (all payments paid → completed)…');
  const { data: activeLoans } = await sb
    .from('loans').select('id').eq('status', 'active');

  let completedCount = 0;
  for (const { id } of (activeLoans ?? [])) {
    const { count } = await sb
      .from('payments')
      .select('id', { count: 'exact', head: true })
      .eq('loan_id', id)
      .neq('status', 'paid');

    if (count === 0) {
      await sb.from('loans')
        .update({ status: 'completed', updated_at: now() })
        .eq('id', id);
      completedCount++;
    }
  }
  console.log(`   ✓ ${completedCount} loans marked as completed\n`);

  // ── STEP 5 — VERIFY COUNTS ────────────────────────────────────────────────────
  console.log('⑸  Verifying row counts in Supabase…');
  const [
    { count: custCount },
    { count: loanCount },
    { count: payCount },
  ] = await Promise.all([
    sb.from('customers').select('id', { count: 'exact', head: true }),
    sb.from('loans').select('id', { count: 'exact', head: true }),
    sb.from('payments').select('id', { count: 'exact', head: true }),
  ]);

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║   Migration Complete ✓                               ║');
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log(`║   Customers in Supabase : ${String(custCount  ?? '?').padEnd(27)}║`);
  console.log(`║   Loans in Supabase     : ${String(loanCount  ?? '?').padEnd(27)}║`);
  console.log(`║   Payments in Supabase  : ${String(payCount   ?? '?').padEnd(27)}║`);
  console.log(`║   Time elapsed          : ${String(elapsed + 's').padEnd(27)}║`);
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');
  console.log('  Open the app — all your real Firebase data is now live.');
  console.log('');
}

run().catch(err => {
  console.error('\n✗ Script failed:', err.message ?? err);
  process.exit(1);
});
