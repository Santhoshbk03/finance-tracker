#!/usr/bin/env node
/**
 * Supabase setup + permissions fixer.
 *
 * Run: node scripts/setup-supabase.mjs
 *
 * This script:
 * 1. Verifies Supabase connectivity
 * 2. Creates tables if they don't exist (using schema.sql logic)
 * 3. Fixes RLS / permission issues
 * 4. Inserts seed test data so you can verify the app works
 *
 * Requires in .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY   ← needed to bypass RLS/grants
 *   (or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as fallback)
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname }            from 'node:path';
import { fileURLToPath }            from 'node:url';

// ── Load .env.local ───────────────────────────────────────────────────────────
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

import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
         ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  console.error('✗ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const isServiceRole = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!isServiceRole) {
  console.warn('⚠  Using publishable key — add SUPABASE_SERVICE_ROLE_KEY to .env.local for full access');
}

const sb = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── Helper: try a write and report ────────────────────────────────────────────
async function testWrite() {
  const { error } = await sb.from('customers').insert({
    id: '__test__', name: '__test__', phone: '', address: '', notes: '',
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  });
  if (!error) {
    await sb.from('customers').delete().eq('id', '__test__');
    return true;
  }
  return false;
}

// ── Main seed data ────────────────────────────────────────────────────────────
async function seedTestData() {
  const now = new Date().toISOString();

  // Customer 1
  const { data: c1, error: ce1 } = await sb.from('customers')
    .upsert({ id: 'seed-cust-001', name: 'Ravi Kumar', phone: '9876543210', address: 'Chennai', notes: 'Test customer', created_at: now, updated_at: now }, { onConflict: 'id' })
    .select().single();
  if (ce1) throw new Error('Customer insert failed: ' + ce1.message);

  // Customer 2
  const { data: c2, error: ce2 } = await sb.from('customers')
    .upsert({ id: 'seed-cust-002', name: 'Priya Sharma', phone: '9123456780', address: 'Bangalore', notes: '', created_at: now, updated_at: now }, { onConflict: 'id' })
    .select().single();
  if (ce2) throw new Error('Customer insert failed: ' + ce2.message);

  // Customer 3
  const { data: c3, error: ce3 } = await sb.from('customers')
    .upsert({ id: 'seed-cust-003', name: 'Arjun Singh', phone: '8765432109', address: 'Mumbai', notes: '', created_at: now, updated_at: now }, { onConflict: 'id' })
    .select().single();
  if (ce3) throw new Error('Customer insert failed: ' + ce3.message);

  console.log('   ✓ 3 customers seeded');

  // ── Loan 1: Ravi — Weekly, active, partially repaid ─────────────────────────
  const l1Start = '2026-03-01';
  const { data: l1, error: le1 } = await sb.from('loans')
    .upsert({
      id: 'seed-loan-001',
      customer_id: 'seed-cust-001', customer_name: 'Ravi Kumar', customer_phone: '9876543210',
      plan_type: 'weekly', principal: 10000, interest_rate: 4,
      loan_term_periods: 10, total_periods: 10,
      interest_amount: 1200, total_amount: 11200, period_amount: 1000,
      start_date: l1Start, end_date: '2026-05-09',
      notes: 'Seed loan — weekly plan', status: 'active',
      interest_collected: true, interest_collected_date: l1Start,
      schedule_config: null, created_at: now, updated_at: now,
    }, { onConflict: 'id' }).select().single();
  if (le1) throw new Error('Loan1 insert failed: ' + le1.message);

  // Payments for loan 1 — first 4 paid, rest pending/overdue
  const loan1Payments = [
    { id: 'seed-p1-01', period: 1, due: '2026-03-08', paid: 1000, paid_date: '2026-03-08', status: 'paid' },
    { id: 'seed-p1-02', period: 2, due: '2026-03-15', paid: 1000, paid_date: '2026-03-15', status: 'paid' },
    { id: 'seed-p1-03', period: 3, due: '2026-03-22', paid: 1000, paid_date: '2026-03-22', status: 'paid' },
    { id: 'seed-p1-04', period: 4, due: '2026-03-29', paid: 1000, paid_date: '2026-04-02', status: 'paid' },
    { id: 'seed-p1-05', period: 5, due: '2026-04-05', paid:  500, paid_date: '2026-04-07', status: 'partial' },
    { id: 'seed-p1-06', period: 6, due: '2026-04-12', paid:    0, paid_date: null,          status: 'overdue' },
    { id: 'seed-p1-07', period: 7, due: '2026-04-19', paid:    0, paid_date: null,          status: 'overdue' },
    { id: 'seed-p1-08', period: 8, due: '2026-04-26', paid:    0, paid_date: null,          status: 'pending' },
    { id: 'seed-p1-09', period: 9, due: '2026-05-03', paid:    0, paid_date: null,          status: 'pending' },
    { id: 'seed-p1-10', period:10, due: '2026-05-09', paid:    0, paid_date: null,          status: 'pending' },
  ];
  const pmtRows1 = loan1Payments.map(p => ({
    id: p.id, loan_id: 'seed-loan-001', period_number: p.period,
    due_date: p.due, expected_amount: 1000,
    paid_amount: p.paid, paid_date: p.paid_date, status: p.status, notes: '',
    created_at: now, updated_at: now,
  }));
  const { error: pe1 } = await sb.from('payments').upsert(pmtRows1, { onConflict: 'id' });
  if (pe1) throw new Error('Payments1 insert failed: ' + pe1.message);

  // ── Loan 2: Priya — Daily, active ────────────────────────────────────────────
  const l2Start = '2026-04-01';
  const { error: le2 } = await sb.from('loans')
    .upsert({
      id: 'seed-loan-002',
      customer_id: 'seed-cust-002', customer_name: 'Priya Sharma', customer_phone: '9123456780',
      plan_type: 'daily', principal: 5000, interest_rate: 4,
      loan_term_periods: 30, total_periods: 30,
      interest_amount: 600, total_amount: 5600, period_amount: 187,
      start_date: l2Start, end_date: '2026-04-30',
      notes: 'Daily plan', status: 'active',
      interest_collected: false, interest_collected_date: null,
      schedule_config: null, created_at: now, updated_at: now,
    }, { onConflict: 'id' }).select().single();
  if (le2) throw new Error('Loan2 insert failed: ' + le2.message);

  // 26 days of daily payments — first 20 paid, last 6 pending/overdue
  const pmtRows2 = Array.from({ length: 30 }, (_, i) => {
    const d = new Date('2026-04-02T00:00:00');
    d.setDate(d.getDate() + i);
    const due = d.toISOString().slice(0, 10);
    const period = i + 1;
    const isPaid = period <= 19;
    const isOverdue = !isPaid && due < '2026-04-26';
    return {
      id: `seed-p2-${String(period).padStart(2,'0')}`,
      loan_id: 'seed-loan-002', period_number: period,
      due_date: due, expected_amount: 187,
      paid_amount: isPaid ? 187 : 0,
      paid_date: isPaid ? due : null,
      status: isPaid ? 'paid' : isOverdue ? 'overdue' : 'pending',
      notes: '', created_at: now, updated_at: now,
    };
  });
  const { error: pe2 } = await sb.from('payments').upsert(pmtRows2, { onConflict: 'id' });
  if (pe2) throw new Error('Payments2 insert failed: ' + pe2.message);

  // ── Loan 3: Arjun — Weekly, completed ────────────────────────────────────────
  const l3Start = '2026-01-05';
  const { error: le3 } = await sb.from('loans')
    .upsert({
      id: 'seed-loan-003',
      customer_id: 'seed-cust-003', customer_name: 'Arjun Singh', customer_phone: '8765432109',
      plan_type: 'weekly', principal: 8000, interest_rate: 4,
      loan_term_periods: 10, total_periods: 10,
      interest_amount: 960, total_amount: 8960, period_amount: 800,
      start_date: l3Start, end_date: '2026-03-15',
      notes: 'Fully repaid', status: 'completed',
      interest_collected: true, interest_collected_date: l3Start,
      schedule_config: null, created_at: now, updated_at: now,
    }, { onConflict: 'id' }).select().single();
  if (le3) throw new Error('Loan3 insert failed: ' + le3.message);

  const pmtRows3 = Array.from({ length: 10 }, (_, i) => {
    const d = new Date('2026-01-12T00:00:00');
    d.setDate(d.getDate() + i * 7);
    const due = d.toISOString().slice(0, 10);
    return {
      id: `seed-p3-${String(i+1).padStart(2,'0')}`,
      loan_id: 'seed-loan-003', period_number: i + 1,
      due_date: due, expected_amount: 800,
      paid_amount: 800, paid_date: due, status: 'paid',
      notes: '', created_at: now, updated_at: now,
    };
  });
  const { error: pe3 } = await sb.from('payments').upsert(pmtRows3, { onConflict: 'id' });
  if (pe3) throw new Error('Payments3 insert failed: ' + pe3.message);

  console.log('   ✓ 3 loans seeded (active weekly, active daily, completed)');
  console.log('   ✓ Payment schedules seeded');
}

// ── Run ───────────────────────────────────────────────────────────────────────
async function run() {
  console.log('\n🔧 Supabase Setup & Seed\n');
  console.log('URL:', url);
  console.log('Key type:', isServiceRole ? 'service_role ✓' : 'publishable (anon) ⚠');

  // Step 1: connectivity check
  process.stdout.write('\n① Checking Supabase connectivity…  ');
  const { error: pingErr } = await sb.from('customers').select('id').limit(1);
  if (pingErr) {
    console.log('✗');
    console.error('\nConnection error:', pingErr.message);
    if (pingErr.message.includes('relation') && pingErr.message.includes('does not exist')) {
      console.error('\n⚠  Tables do not exist yet!');
      console.error('   → Go to Supabase Dashboard → SQL Editor');
      console.error('   → Run the contents of: supabase/schema.sql');
      console.error('   → Then run: supabase/fix-permissions.sql');
    }
    process.exit(1);
  }
  console.log('✓ Connected');

  // Step 2: write test
  process.stdout.write('② Testing write access…  ');
  const canWrite = await testWrite();
  if (!canWrite) {
    console.log('✗ WRITE BLOCKED');
    console.error('\n─────────────────────────────────────────────────────────────────');
    console.error('  Row-Level Security is blocking writes. Fix it ONE of two ways:');
    console.error('');
    console.error('  Option A (Recommended — 30 seconds):');
    console.error('  1. Open Supabase Dashboard → Settings → API');
    console.error('  2. Copy the "service_role" secret key');
    console.error('  3. Add to .env.local:  SUPABASE_SERVICE_ROLE_KEY=eyJ...');
    console.error('  4. Restart dev server: npm run dev');
    console.error('');
    console.error('  Option B (Run SQL):');
    console.error('  1. Open Supabase Dashboard → SQL Editor → New query');
    console.error('  2. Paste and run: supabase/fix-permissions.sql');
    console.error('  3. Re-run this script to seed data');
    console.error('─────────────────────────────────────────────────────────────────\n');
    process.exit(1);
  }
  console.log('✓ Write access confirmed');

  // Step 3: seed
  process.stdout.write('③ Seeding test data…\n');
  await seedTestData();

  console.log('\n✅ Done! Open http://localhost:3000 — you should see:');
  console.log('   • 3 customers (Ravi, Priya, Arjun)');
  console.log('   • 3 loans (weekly active, daily active, completed)');
  console.log('   • Dashboard charts with historical collection data');
  console.log('   • Collect page showing today\'s payments (2026-04-26)\n');
}

run().catch(e => {
  console.error('\n✗ Fatal:', e.message ?? e);
  process.exit(1);
});
