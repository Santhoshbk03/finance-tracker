#!/usr/bin/env node
/**
 * Bulk import from handwritten ledger.
 *
 * WIPES all existing customers + loans + payments + meta stats, then
 * imports the 28 entries from the March–April 2026 ledger pages.
 *
 * Run:
 *   node scripts/bulk-import-ledger.mjs              # prompts for "yes"
 *   node scripts/bulk-import-ledger.mjs --force      # skip prompt
 *   node scripts/bulk-import-ledger.mjs --dry-run    # show plan, no writes
 *
 * Env vars (read from .env.local automatically):
 *   FIREBASE_PROJECT_ID
 *   FIREBASE_CLIENT_EMAIL
 *   FIREBASE_PRIVATE_KEY
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';
import admin from 'firebase-admin';

// ─── Load .env.local ───
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

const FORCE = process.argv.includes('--force');
const DRY   = process.argv.includes('--dry-run');

// ─── Pretty output ───
const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  cyan: '\x1b[36m', magenta: '\x1b[35m',
};
const ok = (m) => console.log(`  ${C.green}✓${C.reset} ${m}`);
const info = (m) => console.log(`  ${C.dim}·${C.reset} ${m}`);
const warn = (m) => console.log(`  ${C.yellow}⚠${C.reset} ${m}`);
const err = (m) => console.log(`  ${C.red}✗${C.reset} ${m}`);
const title = (m) => console.log(`\n${C.bold}${C.magenta}━━━ ${m} ━━━${C.reset}`);

// ─── Firebase Admin init ───
if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
  console.error(`${C.red}Missing Firebase admin env vars. Need FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY in .env.local${C.reset}`);
  process.exit(1);
}
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  }),
});
const db = admin.firestore();

// ─── Ledger data (from images: Page 2 rows 1–17, Page 4 rows 18–28) ───
const DAY_MAP = { M: 1, T: 2, W: 3, Th: 4, F: 5, S: 6 }; // 0=Sun…6=Sat
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const LEDGER = [
  // Page 2
  { sno: 1,  name: 'Kahtarasi',      date: '2026-03-09', amount: 10000,  day: 'M',  paid: 6 },
  { sno: 2,  name: 'Latta',          date: '2026-03-09', amount: 5000,   day: 'M',  paid: 6 },
  { sno: 3,  name: 'Bhai',           date: '2026-03-09', amount: 5000,   day: 'M',  paid: 6 },
  { sno: 4,  name: 'Bharathi',       date: '2026-03-09', amount: 10000,  day: 'M',  paid: 5 },
  { sno: 5,  name: 'Asina',          date: '2026-03-09', amount: 10000,  day: 'M',  paid: 5 },
  { sno: 6,  name: 'Magesh',         date: '2026-03-09', amount: 5000,   day: 'T',  paid: 4 },
  { sno: 7,  name: 'Karthick',       date: '2026-03-12', amount: 100000, day: 'Th', paid: 6 },
  { sno: 8,  name: 'Sista',          date: '2026-03-10', amount: 30000,  day: 'S',  paid: 5 },
  { sno: 9,  name: 'Carpenter',      date: '2026-03-14', amount: 100000, day: 'S',  paid: 6 },
  { sno: 10, name: 'Maraj',          date: '2026-03-16', amount: 10000,  day: 'M',  paid: 5 },
  { sno: 11, name: 'Vijaya',         date: '2026-03-16', amount: 2000,   day: 'M',  paid: 5 },
  { sno: 12, name: 'Vetrivel',       date: '2026-03-16', amount: 50000,  day: 'M',  paid: 4 },
  { sno: 13, name: 'Esa',            date: '2026-03-16', amount: 5000,   day: 'T',  paid: 4 },
  { sno: 14, name: 'Kabilan Amma',   date: '2026-03-17', amount: 20000,  day: 'T',  paid: 4 },
  { sno: 15, name: 'Ramya',          date: '2026-03-19', amount: 3000,   day: 'Th', paid: 5 },
  { sno: 16, name: 'Kerthika',       date: '2026-03-23', amount: 10000,  day: 'M',  paid: 4 },
  { sno: 17, name: 'Jayamatta',      date: '2026-03-21', amount: 40000,  day: 'S',  paid: 4 },
  // Page 4
  { sno: 18, name: 'Ravalosa Kaoli', date: '2026-03-21', amount: 5000,   day: 'T',  paid: 3 },
  { sno: 19, name: 'Pannu Lakshmi',  date: '2026-03-28', amount: 30000,  day: 'S',  paid: 3 },
  { sno: 20, name: 'Yeashri',        date: '2026-03-30', amount: 5000,   day: 'M',  paid: 3 },
  { sno: 21, name: 'Kani',           date: '2026-03-30', amount: 30000,  day: 'M',  paid: 3 },
  { sno: 22, name: 'Asun Amma',      date: '2026-03-31', amount: 20000,  day: 'T',  paid: 2 },
  { sno: 23, name: 'Jaya Akka',      date: '2026-04-08', amount: 60000,  day: 'W',  paid: 1 },
  { sno: 24, name: 'Dharani',        date: '2026-04-11', amount: 30000,  day: 'S',  paid: 1 },
  { sno: 25, name: 'Manjamma',       date: '2026-04-16', amount: 30000,  day: 'Th', paid: 0 },
  { sno: 26, name: 'Shothavathi',    date: '2026-04-18', amount: 10000,  day: 'S',  paid: 0 },
  { sno: 27, name: 'Bai',            date: '2026-04-18', amount: 5000,   day: 'S',  paid: 0 },
  { sno: 28, name: 'Rohith',         date: '2026-04-18', amount: 5000,   day: 'S',  paid: 0 },
];

// ─── Helpers ───
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function localDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Mirrors lib/calculations.ts → generateWeeklySchedule
function generateWeeklySchedule(startDate, totalWeeks, weeklyAmount, dayOfWeek) {
  const schedule = [];
  const start = new Date(startDate + 'T00:00:00');
  const firstDue = new Date(start);
  firstDue.setDate(start.getDate() + 7);
  if (typeof dayOfWeek === 'number' && dayOfWeek >= 0 && dayOfWeek <= 6) {
    const diff = (dayOfWeek - firstDue.getDay() + 7) % 7;
    firstDue.setDate(firstDue.getDate() + diff);
  }
  for (let week = 1; week <= totalWeeks; week++) {
    const due = new Date(firstDue);
    due.setDate(firstDue.getDate() + (week - 1) * 7);
    schedule.push({ periodNumber: week, dueDate: localDateStr(due), expectedAmount: weeklyAmount });
  }
  return schedule;
}

async function confirm(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => rl.question(q, (a) => { rl.close(); res(a.trim().toLowerCase()); }));
}

async function deleteCollection(name) {
  const snap = await db.collection(name).get();
  let count = 0;
  // Firestore batch limit is 500; commit in chunks
  const docs = snap.docs;
  const chunks = [];
  for (let i = 0; i < docs.length; i += 400) chunks.push(docs.slice(i, i + 400));
  for (const chunk of chunks) {
    const batch = db.batch();
    for (const doc of chunk) {
      if (name === 'loans') {
        const payments = await doc.ref.collection('payments').get();
        const payChunks = [];
        for (let j = 0; j < payments.docs.length; j += 400) payChunks.push(payments.docs.slice(j, j + 400));
        for (const pc of payChunks) {
          const pb = db.batch();
          for (const p of pc) pb.delete(p.ref);
          await pb.commit();
        }
      }
      batch.delete(doc.ref);
      count++;
    }
    await batch.commit();
  }
  return count;
}

async function importLoan(entry) {
  const now = new Date().toISOString();
  const today = todayStr();
  const dayOfWeek = DAY_MAP[entry.day];
  if (dayOfWeek === undefined) throw new Error(`Unknown day code: ${entry.day}`);

  const principal = entry.amount;
  const loanTermWeeks = 10;
  const months = Math.ceil(loanTermWeeks / 4); // 3
  const interestRate = 4; // %/month
  const interestAmount = Math.round(principal * interestRate * months / 100); // 12% flat
  const weeklyAmount = Math.round(principal / loanTermWeeks);

  const schedule = generateWeeklySchedule(entry.date, loanTermWeeks, weeklyAmount, dayOfWeek);
  const endDate = schedule[schedule.length - 1].dueDate;

  if (DRY) {
    return {
      name: entry.name,
      start: entry.date,
      firstDue: schedule[0].dueDate,
      dayName: DAY_NAMES[dayOfWeek],
      weekly: weeklyAmount,
      interest: interestAmount,
      paidWeeks: entry.paid,
    };
  }

  // Create customer
  const cRef = await db.collection('customers').add({
    name: entry.name,
    phone: '',
    address: '',
    notes: 'Imported from ledger',
    createdAt: now,
    updatedAt: now,
  });

  // Create loan
  const lRef = await db.collection('loans').add({
    customerId: cRef.id,
    customerName: entry.name,
    customerPhone: '',
    planType: 'weekly',
    principal,
    interestRate,
    loanTermPeriods: loanTermWeeks,
    totalPeriods: loanTermWeeks,
    interestAmount,
    totalAmount: principal + interestAmount,
    periodAmount: weeklyAmount,
    startDate: entry.date,
    endDate,
    notes: `Imported from ledger · Pay day: ${DAY_NAMES[dayOfWeek]}`,
    status: 'active',
    interestCollected: true,
    interestCollectedDate: entry.date,
    scheduleConfig: { weeklyDayOfWeek: dayOfWeek },
    createdAt: now,
    updatedAt: now,
  });

  // Write all payments (up to 500 per batch — we have 10 so one batch is fine)
  const batch = db.batch();
  for (let i = 0; i < schedule.length; i++) {
    const s = schedule[i];
    const isPaid = i < entry.paid;
    const pRef = db.collection('loans').doc(lRef.id).collection('payments').doc();
    let status = 'pending';
    if (isPaid) status = 'paid';
    else if (s.dueDate < today) status = 'overdue';
    batch.set(pRef, {
      loanId: lRef.id,
      periodNumber: s.periodNumber,
      dueDate: s.dueDate,
      expectedAmount: s.expectedAmount,
      paidAmount: isPaid ? s.expectedAmount : 0,
      paidDate: isPaid ? s.dueDate : null,
      status,
      notes: '',
      createdAt: now,
      updatedAt: now,
    });
  }
  await batch.commit();

  return { customerId: cRef.id, loanId: lRef.id };
}

async function rebuildStats() {
  // Derive from actual loans after import
  const loansSnap = await db.collection('loans').get();
  let activeLoanCount = 0;
  let totalActivePrincipal = 0;
  let totalInterestEarned = 0;
  let totalInterestPending = 0;
  for (const d of loansSnap.docs) {
    const l = d.data();
    if (l.status === 'active') {
      activeLoanCount++;
      totalActivePrincipal += l.principal || 0;
    }
    if (l.interestCollected) totalInterestEarned += l.interestAmount || 0;
    else totalInterestPending += l.interestAmount || 0;
  }
  await db.collection('meta').doc('stats').set({
    activeLoanCount,
    completedLoanCount: 0,
    totalCustomers: LEDGER.length,
    totalActivePrincipal,
    totalInterestEarned,
    totalInterestPending,
    updatedAt: new Date().toISOString(),
  });
}

// ─── Main ───
async function run() {
  console.log(`${C.bold}Finance Tracker — Bulk Import from Ledger${C.reset}`);
  console.log(`${C.dim}Project:${C.reset}  ${process.env.FIREBASE_PROJECT_ID}`);
  console.log(`${C.dim}Today:${C.reset}    ${todayStr()}`);
  console.log(`${C.dim}Entries:${C.reset}  ${LEDGER.length}`);
  console.log(`${C.dim}Mode:${C.reset}     ${DRY ? 'DRY RUN' : FORCE ? 'LIVE (forced)' : 'LIVE'}`);

  // Show plan
  const totalPrincipal = LEDGER.reduce((s, l) => s + l.amount, 0);
  const totalInterest = LEDGER.reduce((s, l) => s + Math.round(l.amount * 4 * 3 / 100), 0);
  const totalPaid = LEDGER.reduce((s, l) => s + (l.amount / 10) * l.paid, 0);
  console.log(`${C.dim}Total principal:${C.reset} ₹${totalPrincipal.toLocaleString('en-IN')}`);
  console.log(`${C.dim}Total interest:${C.reset}  ₹${totalInterest.toLocaleString('en-IN')}`);
  console.log(`${C.dim}Already collected:${C.reset} ₹${totalPaid.toLocaleString('en-IN')}`);

  if (DRY) {
    title('Dry-run preview (no writes)');
    for (const entry of LEDGER) {
      const r = await importLoan(entry);
      info(`#${String(entry.sno).padStart(2)} ${entry.name.padEnd(18)} ${entry.date} (${r.dayName}) ₹${String(entry.amount).padStart(6)} → first due ${r.firstDue}, weekly ₹${r.weekly}, ${r.paidWeeks}/10 paid`);
    }
    console.log(`\n${C.yellow}Dry-run complete. Re-run without --dry-run to apply.${C.reset}`);
    process.exit(0);
  }

  if (!FORCE) {
    console.log(`\n${C.yellow}${C.bold}WARNING${C.reset} — this will ${C.red}DELETE ALL${C.reset} existing customers, loans, and payments.`);
    const a = await confirm('Type "yes" to continue, anything else to abort: ');
    if (a !== 'yes') {
      console.log('Aborted.');
      process.exit(0);
    }
  }

  title('Wipe');
  try {
    const nLoans = await deleteCollection('loans');
    ok(`Deleted ${nLoans} loans (and nested payments)`);
    const nCustomers = await deleteCollection('customers');
    ok(`Deleted ${nCustomers} customers`);
    try {
      await db.collection('meta').doc('stats').delete();
      ok('Cleared meta/stats');
    } catch { warn('meta/stats not present, skipping'); }
  } catch (e) {
    err('Wipe failed: ' + e.message);
    process.exit(1);
  }

  title('Import');
  let success = 0;
  for (const entry of LEDGER) {
    try {
      const r = await importLoan(entry);
      ok(`#${String(entry.sno).padStart(2)} ${entry.name.padEnd(18)} ₹${String(entry.amount).padStart(6)} ${entry.day.padEnd(2)} start ${entry.date} (${entry.paid}/10 paid)  loan=${r.loanId.slice(0,6)}…`);
      success++;
    } catch (e) {
      err(`#${entry.sno} ${entry.name}: ${e.message}`);
    }
  }

  title('Rebuild stats');
  await rebuildStats();
  ok('meta/stats rebuilt from loan data');

  console.log(`\n${C.green}${C.bold}✓ Import complete: ${success}/${LEDGER.length} loans.${C.reset}`);
  console.log(`${C.dim}Open /collect in the app to start recording new payments.${C.reset}`);
  process.exit(0);
}

run().catch((e) => {
  console.error(`\n${C.red}Fatal:${C.reset}`, e);
  process.exit(1);
});
