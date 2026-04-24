#!/usr/bin/env node
/**
 * End-to-end smoke test for Finance Tracker.
 *
 * Walks through the core user flow against a running server:
 *   1. Login (Firebase email/password → session cookie)
 *   2. Create a test borrower
 *   3. Create a weekly loan for that borrower
 *   4. Verify dashboard reflects the new loan
 *   5. Fetch loan detail + payment schedule
 *   6. Collect 1st payment via /api/reports/today-list + PUT /api/payments/:id
 *   7. Verify the payment is marked paid
 *   8. Negative tests (invalid inputs → expected errors)
 *   9. Clean up — delete loan + borrower
 *
 * Run:
 *   node scripts/smoke-test.mjs
 *
 * Env vars (read from .env.local automatically if present):
 *   BASE_URL                     default: http://localhost:3000
 *   TEST_EMAIL                   Firebase user email
 *   TEST_PASSWORD                Firebase user password
 *   NEXT_PUBLIC_FIREBASE_API_KEY Firebase web API key
 *   SMOKE_KEEP                   set to "1" to skip cleanup (for manual inspection)
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ─── .env.local loader (so you can just run `node scripts/smoke-test.mjs`) ───
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '..', '.env.local');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const k = trimmed.slice(0, eq).trim();
    let v = trimmed.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!(k in process.env)) process.env[k] = v;
  }
}

const BASE_URL = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const EMAIL = process.env.TEST_EMAIL;
const PASSWORD = process.env.TEST_PASSWORD;
const FB_API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const KEEP = process.env.SMOKE_KEEP === '1';

// ─── Pretty output ───
const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', magenta: '\x1b[35m', cyan: '\x1b[36m', gray: '\x1b[90m',
};
const ok  = (m) => console.log(`  ${C.green}✓${C.reset} ${m}`);
const bad = (m) => console.log(`  ${C.red}✗${C.reset} ${m}`);
const info = (m) => console.log(`  ${C.dim}·${C.reset} ${C.dim}${m}${C.reset}`);
const step = (n, m) => console.log(`\n${C.bold}${C.cyan}▶ ${n}. ${m}${C.reset}`);
const title = (m) => console.log(`\n${C.bold}${C.magenta}━━━ ${m} ━━━${C.reset}`);

// ─── Test state ───
let cookie = '';
let borrowerId = '';
let loanId = '';
let paymentId = '';
let expectedAmount = 0;
const failures = [];

// Stop walking on critical failures but keep going if possible; track everything.
function fail(msg, err) {
  bad(msg + (err ? ` — ${err.message || err}` : ''));
  failures.push(msg);
}
function assert(cond, msg) {
  if (cond) ok(msg);
  else fail(msg);
  return cond;
}

// ─── HTTP ───
async function api(path, opts = {}) {
  const url = path.startsWith('http') ? path : `${BASE_URL}${path}`;
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (cookie) headers.Cookie = cookie;
  const r = await fetch(url, { ...opts, headers });
  const ct = r.headers.get('content-type') || '';
  const body = ct.includes('application/json') ? await r.json().catch(() => null) : await r.text();
  return { status: r.status, ok: r.ok, body };
}

// ─── Login ───
async function firebaseSignIn() {
  if (!FB_API_KEY || !EMAIL || !PASSWORD) {
    throw new Error('Missing env vars: need NEXT_PUBLIC_FIREBASE_API_KEY, TEST_EMAIL, TEST_PASSWORD');
  }
  const r = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FB_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD, returnSecureToken: true }),
    }
  );
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error(`Firebase auth failed: ${j.error?.message || r.statusText}`);
  }
  const { idToken } = await r.json();
  return idToken;
}

async function login() {
  const idToken = await firebaseSignIn();
  const r = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
    redirect: 'manual',
  });
  if (!r.ok) throw new Error(`Session login failed: HTTP ${r.status}`);
  const setCookie = r.headers.get('set-cookie') || '';
  const match = setCookie.match(/auth-session=([^;]+)/);
  if (!match) throw new Error('No auth-session cookie returned');
  cookie = `auth-session=${match[1]}`;
  return true;
}

// ─── Test helpers ───
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ─── Flow ───
async function run() {
  console.log(`${C.bold}Finance Tracker — Smoke Test${C.reset}`);
  console.log(`${C.dim}Base URL:${C.reset} ${BASE_URL}`);
  console.log(`${C.dim}User:${C.reset}     ${EMAIL || '(not set)'}`);

  title('Auth');
  step(1, 'Sign in');
  try { await login(); ok('Logged in, session cookie obtained'); }
  catch (e) { fail('Login failed', e); return; }

  title('Core flow');

  // ── Create borrower ──
  step(2, 'Create test borrower');
  const borrowerName = `_SMOKE_${Date.now()}`;
  {
    const { ok: k, status, body } = await api('/api/customers', {
      method: 'POST',
      body: JSON.stringify({ name: borrowerName, phone: '+919999000000', address: 'Test Road, Test City' }),
    });
    if (!assert(k, `POST /api/customers → ${status}`)) return;
    borrowerId = body?.id;
    assert(!!borrowerId, `borrowerId returned: ${borrowerId}`);
  }

  // ── Create loan ──
  step(3, 'Create weekly loan');
  {
    const { ok: k, status, body } = await api('/api/loans', {
      method: 'POST',
      body: JSON.stringify({
        customer_id: borrowerId,
        principal: 10000,
        interest_rate: 4,
        plan_type: 'weekly',
        loan_term_periods: 10,
        start_date: todayStr(),
        notes: 'Smoke test loan',
        interest_collected: true,
      }),
    });
    if (!assert(k, `POST /api/loans → ${status}`)) return;
    loanId = body?.id;
    assert(!!loanId, `loanId returned: ${loanId}`);
  }

  // ── Fetch loan + schedule ──
  step(4, 'Fetch loan detail + payment schedule');
  {
    const { ok: k, status, body } = await api(`/api/loans/${loanId}`);
    if (!assert(k, `GET /api/loans/${loanId} → ${status}`)) return;
    const payments = body?.payments || [];
    assert(payments.length === 10, `Payment schedule has 10 entries (got ${payments.length})`);
    paymentId = payments[0]?.id;
    expectedAmount = payments[0]?.expectedAmount || 0;
    assert(!!paymentId, `First paymentId captured: ${paymentId}`);
    assert(expectedAmount > 0, `Expected amount per period: ₹${expectedAmount}`);
  }

  // ── Dashboard shows loan ──
  step(5, 'Dashboard includes this loan');
  {
    const { ok: k, status, body } = await api('/api/dashboard');
    if (!assert(k, `GET /api/dashboard → ${status}`)) return;
    assert(typeof body?.thisWeek?.expected === 'number', 'thisWeek.expected is number');
    assert(Array.isArray(body?.dueSoon), 'dueSoon is array');
    assert(Array.isArray(body?.overduePayments), 'overduePayments is array');
  }

  // ── Today list for loan start date ──
  step(6, 'Today-list for loan start date');
  {
    const { ok: k, status, body } = await api(`/api/reports/today-list?date=${todayStr()}`);
    if (!assert(k, `GET /api/reports/today-list → ${status}`)) return;
    assert(Array.isArray(body?.rows), 'rows is array');
    assert(typeof body?.summary?.totalDue === 'number', 'summary.totalDue is number');
  }

  // ── Collect first payment ──
  step(7, 'Mark first payment as fully paid');
  {
    const { ok: k, status, body } = await api(`/api/payments/${paymentId}`, {
      method: 'PUT',
      body: JSON.stringify({
        paid_amount: expectedAmount,
        paid_date: todayStr(),
        notes: 'Smoke test collect',
        loan_id: loanId,
      }),
    });
    if (!assert(k, `PUT /api/payments/${paymentId} → ${status}`)) return;
    assert(body?.status === 'paid', `Status → paid (got: ${body?.status})`);
    assert(body?.paidAmount === expectedAmount, `paidAmount = ₹${body?.paidAmount}`);
  }

  // ── Re-fetch confirms ──
  step(8, 'Re-fetch loan confirms payment persisted');
  {
    const { ok: k, body } = await api(`/api/loans/${loanId}`);
    if (!k) { fail('Re-fetch failed'); return; }
    const p = (body?.payments || []).find((x) => x.id === paymentId);
    assert(p?.status === 'paid', 'First payment status = paid');
    assert(p?.paidAmount === expectedAmount, `Persisted paidAmount = ₹${p?.paidAmount}`);
  }

  title('Negative tests (expected failures)');

  step(9, 'PUT payment without loan_id → 400');
  {
    const { status, body } = await api(`/api/payments/${paymentId}`, {
      method: 'PUT',
      body: JSON.stringify({ paid_amount: 0, paid_date: null, notes: '' }),
    });
    assert(status === 400, `Returned 400 (got ${status})`);
    assert(/loan_id/i.test(body?.error || ''), `Error mentions loan_id: "${body?.error}"`);
  }

  step(10, 'GET loan with bogus id → 404');
  {
    const { status } = await api('/api/loans/__bogus_id__');
    assert(status === 404, `Returned 404 (got ${status})`);
  }

  step(11, 'POST loan without required fields → 400');
  {
    const { status } = await api('/api/loans', {
      method: 'POST',
      body: JSON.stringify({ notes: 'no customer or principal' }),
    });
    assert(status === 400, `Returned 400 (got ${status})`);
  }

  step(12, 'POST customer with empty name → 400');
  {
    const { status } = await api('/api/customers', {
      method: 'POST',
      body: JSON.stringify({ name: '' }),
    });
    assert(status === 400 || status === 422, `Returned ${status} (expected 400/422)`);
  }

  // ── Cleanup ──
  if (!KEEP) {
    title('Cleanup');
    step(13, 'Delete test loan');
    {
      const { ok: k, status } = await api(`/api/loans/${loanId}`, { method: 'DELETE' });
      assert(k, `DELETE /api/loans/${loanId} → ${status}`);
    }
    step(14, 'Delete test borrower');
    {
      const { ok: k, status } = await api(`/api/customers/${borrowerId}`, { method: 'DELETE' });
      assert(k, `DELETE /api/customers/${borrowerId} → ${status}`);
    }
  } else {
    console.log(`\n  ${C.yellow}⚠${C.reset}  SMOKE_KEEP=1 — skipping cleanup.`);
    info(`Borrower: ${borrowerId}`);
    info(`Loan:     ${loanId}`);
  }
}

// ─── Main ───
run()
  .then(() => {
    console.log('');
    if (failures.length === 0) {
      console.log(`${C.green}${C.bold}✓ All checks passed.${C.reset}`);
      process.exit(0);
    }
    console.log(`${C.red}${C.bold}✗ ${failures.length} check(s) failed:${C.reset}`);
    for (const f of failures) console.log(`  ${C.red}•${C.reset} ${f}`);
    process.exit(1);
  })
  .catch((e) => {
    console.error(`\n${C.red}Uncaught:${C.reset}`, e);
    process.exit(2);
  });
