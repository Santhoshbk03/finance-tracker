#!/usr/bin/env node
/**
 * Export ALL data from Firestore → data/firebase-export.json
 *
 * Run:  node scripts/firebase-export.mjs
 *
 * Output file:  data/firebase-export.json
 *   Edit that file freely, then run:
 *   node scripts/supabase-bulk-import.mjs
 *
 * Required env vars (read from .env.local automatically):
 *   FIREBASE_PROJECT_ID
 *   FIREBASE_CLIENT_EMAIL
 *   FIREBASE_PRIVATE_KEY
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

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
const db = getFirestore(firebaseApp);

// ── Main ───────────────────────────────────────────────────────────────────────
async function run() {
  const t0 = Date.now();
  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║   Firebase Export                                    ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');

  // ── Customers ──────────────────────────────────────────────────────────────
  console.log('① Reading customers…');
  const custSnap = await db.collection('customers').get();
  const customers = custSnap.docs.map(d => {
    const r = d.data();
    return {
      id:      d.id,
      name:    r.name    ?? '',
      phone:   r.phone   ?? '',
      address: r.address ?? '',
      notes:   r.notes   ?? '',
    };
  });
  console.log(`   → ${customers.length} customers`);

  // ── Loans + Payments ────────────────────────────────────────────────────────
  console.log('② Reading loans + payments…');
  const loansSnap = await db.collection('loans').get();
  console.log(`   → ${loansSnap.docs.length} loans found`);

  const loans = [];
  let payTotal = 0;
  let idx = 0;

  for (const loanDoc of loansSnap.docs) {
    const l = loanDoc.data();

    // Payments sub-collection
    const paySnap = await db
      .collection('loans').doc(loanDoc.id)
      .collection('payments')
      .orderBy('periodNumber', 'asc')
      .get();

    const payments = paySnap.docs.map(pd => {
      const p = pd.data();
      return {
        id:              pd.id,
        period_number:   Number(p.periodNumber) || 0,
        due_date:        p.dueDate              ?? null,
        expected_amount: Number(p.expectedAmount) || 0,
        paid_amount:     Number(p.paidAmount)    || 0,
        paid_date:       p.paidDate              ?? null,
        status:          p.status               ?? 'pending',
        notes:           p.notes                ?? '',
      };
    });

    loans.push({
      id:                      loanDoc.id,
      customer_id:             l.customerId             ?? null,
      customer_name:           l.customerName           ?? '',
      customer_phone:          l.customerPhone          ?? '',
      plan_type:               l.planType               ?? 'weekly',
      principal:               Number(l.principal)      || 0,
      interest_rate:           Number(l.interestRate)   || 0,
      interest_amount:         Number(l.interestAmount) || 0,
      loan_term_periods:       Number(l.loanTermPeriods)  || Number(l.loan_term_weeks)  || 0,
      total_periods:           Number(l.totalPeriods)     || Number(l.total_weeks)       || 0,
      period_amount:           Number(l.periodAmount)     || Number(l.weekly_amount)     || 0,
      total_amount:            Number(l.totalAmount)    || 0,
      start_date:              l.startDate              ?? null,
      end_date:                l.endDate                ?? null,
      status:                  l.status                 ?? 'active',
      interest_collected:      Boolean(l.interestCollected),
      interest_collected_date: l.interestCollectedDate  ?? null,
      notes:                   l.notes                  ?? '',
      payments,
    });

    payTotal += payments.length;
    idx++;
    process.stdout.write(`\r   ✓ ${idx}/${loansSnap.docs.length} loans (${payTotal} payments)`);
  }

  console.log('\n');

  // ── Write output ───────────────────────────────────────────────────────────
  const dataDir = join(__dir, '..', 'data');
  if (!existsSync(dataDir)) mkdirSync(dataDir);

  const outPath = join(dataDir, 'firebase-export.json');
  const output = {
    exported_at: new Date().toISOString(),
    _instructions: [
      'Edit this file freely — customer names, phone numbers, interest amounts, etc.',
      'Do NOT change "id" fields — they link customers to loans.',
      'Loan "status" values: active | completed',
      'Payment "status" values: paid | partial | pending',
      'Run:  node scripts/supabase-bulk-import.mjs  to upload to Supabase.',
    ],
    customers,
    loans,
  };

  writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf-8');

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║   Export Complete ✓                                  ║');
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log(`║   Customers exported : ${String(customers.length).padEnd(29)}║`);
  console.log(`║   Loans exported     : ${String(loans.length).padEnd(29)}║`);
  console.log(`║   Payments exported  : ${String(payTotal).padEnd(29)}║`);
  console.log(`║   Time elapsed       : ${String(elapsed + 's').padEnd(29)}║`);
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log(`║   Output: data/firebase-export.json                  ║`);
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');
  console.log('  Next steps:');
  console.log('  1. Open  data/firebase-export.json  and edit as needed');
  console.log('  2. Run   node scripts/supabase-bulk-import.mjs');
  console.log('');
}

run().catch(err => {
  console.error('\n✗ Export failed:', err.message ?? err);
  process.exit(1);
});
