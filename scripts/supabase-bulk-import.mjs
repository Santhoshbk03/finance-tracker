#!/usr/bin/env node
/**
 * Bulk Import → Supabase from data/firebase-export.json
 *
 * Steps:
 *   1. Read data/firebase-export.json  (edit it first if needed)
 *   2. Wipe ALL rows from payments → loans → customers (FK order)
 *   3. Import customers
 *   4. Import loans + payments
 *   5. Auto-complete fully-paid loans
 *   6. Verify final row counts
 *
 * Run:
 *   node scripts/supabase-bulk-import.mjs
 *
 * To skip the wipe and only ADD new records (no delete):
 *   node scripts/supabase-bulk-import.mjs --no-wipe
 *
 * Required env vars (read from .env.local automatically):
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

// ── Supabase (service role — bypasses RLS) ─────────────────────────────────────
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
                 ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('✗ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const sb = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── Helpers ────────────────────────────────────────────────────────────────────
const now = () => new Date().toISOString();
const noWipe = process.argv.includes('--no-wipe');

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function deleteAll(table) {
  const { error } = await sb.from(table).delete().not('id', 'is', null);
  if (error) throw new Error(`[${table}] delete error: ${error.message}`);
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

  // ── Load JSON file ──────────────────────────────────────────────────────────
  const jsonPath = join(__dir, '..', 'data', 'firebase-export.json');
  if (!existsSync(jsonPath)) {
    console.error('✗ data/firebase-export.json not found.');
    console.error('  Run first:  node scripts/firebase-export.mjs');
    process.exit(1);
  }

  let exportData;
  try {
    exportData = JSON.parse(readFileSync(jsonPath, 'utf-8'));
  } catch (e) {
    console.error('✗ Could not parse data/firebase-export.json:', e.message);
    process.exit(1);
  }

  const { customers = [], loans = [] } = exportData;
  const totalPayments = loans.reduce((s, l) => s + (l.payments?.length ?? 0), 0);

  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║   Supabase Bulk Import                               ║');
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log(`║   Source file  : data/firebase-export.json           ║`);
  console.log(`║   Exported at  : ${String((exportData.exported_at ?? '?').slice(0,19)).padEnd(33)}║`);
  console.log(`║   Customers    : ${String(customers.length).padEnd(33)}║`);
  console.log(`║   Loans        : ${String(loans.length).padEnd(33)}║`);
  console.log(`║   Payments     : ${String(totalPayments).padEnd(33)}║`);
  console.log(`║   Wipe first?  : ${String(!noWipe ? 'YES (use --no-wipe to skip)' : 'NO (--no-wipe flag set)').padEnd(33)}║`);
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');

  // ── STEP 1 — WIPE (unless --no-wipe) ────────────────────────────────────────
  if (!noWipe) {
    console.log('⑴  Wiping existing Supabase data…');
    await deleteAll('payments');
    console.log('   ✓ payments cleared');
    await deleteAll('loans');
    console.log('   ✓ loans cleared');
    await deleteAll('customers');
    console.log('   ✓ customers cleared');
    console.log('');
  } else {
    console.log('⑴  Skipping wipe (--no-wipe). Will upsert on top of existing data.\n');
  }

  // ── STEP 2 — CUSTOMERS ───────────────────────────────────────────────────────
  console.log('⑵  Importing customers…');
  const customerRows = customers.map(c => ({
    id:         c.id,
    name:       c.name       ?? '',
    phone:      c.phone      ?? '',
    address:    c.address    ?? '',
    notes:      c.notes      ?? '',
    created_at: now(),
    updated_at: now(),
  }));

  await upsertChunked('customers', customerRows, 'id');
  console.log(`   ✓ ${customerRows.length} customers imported\n`);

  // ── STEP 3 — LOANS + PAYMENTS ────────────────────────────────────────────────
  console.log('⑶  Importing loans + payments…');

  let loanOk = 0, loanFail = 0, payCount = 0;

  for (const loan of loans) {
    if (!loan.customer_id) {
      console.warn(`   ⚠  Skipping loan ${loan.id}: missing customer_id`);
      loanFail++;
      continue;
    }

    // Ensure customer exists (create placeholder for orphaned loans)
    const { count } = await sb
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .eq('id', loan.customer_id);

    if (!count || count === 0) {
      console.warn(`   ⚠  Loan ${loan.id} — customer ${loan.customer_id} not found, creating placeholder`);
      await sb.from('customers').upsert({
        id: loan.customer_id,
        name: loan.customer_name || '(Unknown)',
        phone: loan.customer_phone || '',
        address: '', notes: '',
        created_at: now(), updated_at: now(),
      }, { onConflict: 'id' });
    }

    // Insert loan
    const loanRow = {
      id:                      loan.id,
      customer_id:             loan.customer_id,
      customer_name:           loan.customer_name           ?? '',
      customer_phone:          loan.customer_phone          ?? '',
      plan_type:               loan.plan_type               ?? 'weekly',
      principal:               Number(loan.principal)       || 0,
      interest_rate:           Number(loan.interest_rate)   || 0,
      loan_term_periods:       Number(loan.loan_term_periods) || 0,
      total_periods:           Number(loan.total_periods)   || 0,
      interest_amount:         Number(loan.interest_amount) || 0,
      total_amount:            Number(loan.total_amount)    || 0,
      period_amount:           Number(loan.period_amount)   || 0,
      start_date:              loan.start_date              ?? null,
      end_date:                loan.end_date                ?? null,
      notes:                   loan.notes                   ?? '',
      status:                  loan.status                  ?? 'active',
      interest_collected:      Boolean(loan.interest_collected),
      interest_collected_date: loan.interest_collected_date ?? null,
      schedule_config:         loan.schedule_config         ?? null,
      created_at:              now(),
      updated_at:              now(),
    };

    const { error: lErr } = await sb.from('loans').upsert(loanRow, { onConflict: 'id' });
    if (lErr) {
      console.error(`   ✗ Loan ${loan.id} failed: ${lErr.message}`);
      loanFail++;
      continue;
    }

    // Insert payments
    if (loan.payments?.length) {
      const payRows = loan.payments.map(p => {
        const paidAmt     = Number(p.paid_amount)    || 0;
        const expectedAmt = Number(p.expected_amount) || 0;
        let status = p.status ?? 'pending';
        if (paidAmt >= expectedAmt && expectedAmt > 0) status = 'paid';
        else if (paidAmt > 0)                          status = 'partial';

        return {
          id:              p.id,
          loan_id:         loan.id,
          period_number:   Number(p.period_number) || 0,
          due_date:        p.due_date              ?? null,
          expected_amount: expectedAmt,
          paid_amount:     paidAmt,
          paid_date:       p.paid_date             ?? null,
          status,
          notes:           p.notes                 ?? '',
          created_at:      now(),
          updated_at:      now(),
        };
      });

      await upsertChunked('payments', payRows, 'id');
      payCount += payRows.length;
    }

    loanOk++;
    process.stdout.write(`\r   ✓ ${loanOk + loanFail}/${loans.length} loans | ${payCount} payments`);
  }

  console.log('\n');

  // ── STEP 4 — AUTO-COMPLETE FULLY-PAID LOANS ───────────────────────────────────
  console.log('⑷  Auto-completing fully-paid loans…');
  const { data: activeLoans } = await sb.from('loans').select('id').eq('status', 'active');
  let completedCount = 0;
  for (const { id } of (activeLoans ?? [])) {
    const { count } = await sb
      .from('payments')
      .select('id', { count: 'exact', head: true })
      .eq('loan_id', id)
      .neq('status', 'paid');
    if (count === 0) {
      await sb.from('loans').update({ status: 'completed', updated_at: now() }).eq('id', id);
      completedCount++;
    }
  }
  console.log(`   ✓ ${completedCount} loan(s) marked completed\n`);

  // ── STEP 5 — VERIFY ───────────────────────────────────────────────────────────
  console.log('⑸  Verifying row counts…');
  const [
    { count: custCount },
    { count: loanCount },
    { count: payFinalCount },
  ] = await Promise.all([
    sb.from('customers').select('id', { count: 'exact', head: true }),
    sb.from('loans').select('id', { count: 'exact', head: true }),
    sb.from('payments').select('id', { count: 'exact', head: true }),
  ]);

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║   Import Complete ✓                                  ║');
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log(`║   Customers in Supabase : ${String(custCount  ?? '?').padEnd(27)}║`);
  console.log(`║   Loans in Supabase     : ${String(loanCount  ?? '?').padEnd(27)}║`);
  console.log(`║   Payments in Supabase  : ${String(payFinalCount ?? '?').padEnd(27)}║`);
  if (loanFail > 0)
  console.log(`║   Loans skipped/failed  : ${String(loanFail).padEnd(27)}║`);
  console.log(`║   Time elapsed          : ${String(elapsed + 's').padEnd(27)}║`);
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');
  console.log('  Open the app — your data is live in Supabase.');
  console.log('');
}

run().catch(err => {
  console.error('\n✗ Import failed:', err.message ?? err);
  process.exit(1);
});
