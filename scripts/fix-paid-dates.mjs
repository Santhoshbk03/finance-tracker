#!/usr/bin/env node
/**
 * Fix paid_date in firebase-export.json
 *
 * For every payment that has been paid (paid_amount > 0),
 * sets paid_date = due_date so the dashboard shows historical
 * collections spread across real dates instead of one single day.
 *
 * Edits data/firebase-export.json in-place.
 * Run BEFORE supabase-bulk-import.mjs.
 *
 * Usage:  node scripts/fix-paid-dates.mjs
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const jsonPath = join(__dir, '..', 'data', 'firebase-export.json');

if (!existsSync(jsonPath)) {
  console.error('✗ data/firebase-export.json not found. Run firebase-export.mjs first.');
  process.exit(1);
}

const data = JSON.parse(readFileSync(jsonPath, 'utf-8'));

let fixed = 0, skipped = 0, alreadyCorrect = 0;

for (const loan of data.loans) {
  for (const p of loan.payments) {
    const paid = Number(p.paid_amount) || 0;

    if (paid > 0 && p.due_date) {
      if (p.paid_date === p.due_date) {
        alreadyCorrect++;
      } else {
        p.paid_date = p.due_date;
        fixed++;
      }
    } else {
      // Unpaid — make sure paid_date is cleared
      if (p.paid_date && paid === 0) {
        p.paid_date = null;
        skipped++;
      }
    }
  }
}

// Update timestamp so import knows the file was modified
data.fixed_at = new Date().toISOString();

writeFileSync(jsonPath, JSON.stringify(data, null, 2), 'utf-8');

console.log('');
console.log('╔══════════════════════════════════════════════════════╗');
console.log('║   Fix Paid Dates ✓                                   ║');
console.log('╠══════════════════════════════════════════════════════╣');
console.log(`║   paid_date set to due_date : ${String(fixed).padEnd(23)}║`);
console.log(`║   already correct           : ${String(alreadyCorrect).padEnd(23)}║`);
console.log(`║   cleared stale paid_dates  : ${String(skipped).padEnd(23)}║`);
console.log('╠══════════════════════════════════════════════════════╣');
console.log('║   Saved → data/firebase-export.json                  ║');
console.log('╚══════════════════════════════════════════════════════╝');
console.log('');
console.log('  Now run:  npm run import:supabase');
console.log('');
