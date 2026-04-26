#!/usr/bin/env node
/**
 * Apply advanced PostgreSQL functions, views, and triggers to Supabase.
 *
 * Usage:
 *   node scripts/apply-advanced.mjs
 *
 * Requires one of:
 *   DATABASE_URL=postgresql://postgres:[password]@db.[project].supabase.co:5432/postgres
 *     — get from Supabase Dashboard → Settings → Database → Connection string → URI
 *   OR:
 *   NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY  (falls back to SQL print-only mode)
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname }            from 'node:path';
import { fileURLToPath }            from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));

// ── Load .env.local ───────────────────────────────────────────────────────────
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

const sqlPath = join(__dir, '..', 'supabase', 'advanced-functions.sql');
const sql = readFileSync(sqlPath, 'utf-8');

// ── Split SQL into individual statements ──────────────────────────────────────
// We split on blank-line-separated blocks so function bodies (which contain
// semicolons) stay intact. We rely on the convention that each top-level
// statement starts with CREATE/DROP/ALTER/COMMENT at column 0.
function splitStatements(raw) {
  // Split on lines that start a new top-level DDL keyword (not inside a body).
  // Strategy: split on double newlines before a DDL keyword at column 0.
  const stmts = [];
  // Regex: anything between top-level DDL boundaries
  const blocks = raw
    .split(/\n(?=\s*(?:CREATE|DROP|ALTER|COMMENT|INSERT|UPDATE|DELETE|SELECT|--\s*───))/i)
    .map(b => b.trim())
    .filter(Boolean)
    .filter(b => !b.startsWith('--') || b.includes('CREATE') || b.includes('DROP'));

  // Rejoin adjacent blocks that are part of the same statement.
  let current = '';
  for (const block of blocks) {
    if (block.startsWith('--')) {
      if (current) { stmts.push(current); current = ''; }
      continue; // skip pure-comment blocks
    }
    current += (current ? '\n' : '') + block;
    // A statement ends when it has balanced $$ markers and ends with ;
    const dollarCount = (current.match(/\$\$/g) || []).length;
    if (dollarCount % 2 === 0) {
      stmts.push(current.trim());
      current = '';
    }
  }
  if (current.trim()) stmts.push(current.trim());
  return stmts.filter(s => s && !s.startsWith('--'));
}

// ── Try pg (direct connection) ────────────────────────────────────────────────
async function tryPg() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return false;

  let pg;
  try { pg = await import('pg'); } catch {
    console.warn('  pg package not found — run: npm install pg');
    return false;
  }

  const { Client } = pg.default ?? pg;
  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });

  try {
    await client.connect();
    console.log('✓ Connected via DATABASE_URL\n');

    // Run the whole SQL file as one execution (handles dollar-quoting correctly)
    await client.query(sql);
    console.log('✓ All functions, views, and triggers applied successfully!\n');
    await client.end();
    return true;
  } catch (err) {
    console.error('✗ pg error:', err.message);
    await client.end().catch(() => {});
    return false;
  }
}

// ── Fallback: print instructions ──────────────────────────────────────────────
function printInstructions() {
  const url  = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://xxxx.supabase.co';
  const proj = url.replace('https://', '').replace('.supabase.co', '');

  console.log('');
  console.log('┌─────────────────────────────────────────────────────────────┐');
  console.log('│  Manual setup — run the SQL in Supabase Dashboard           │');
  console.log('└─────────────────────────────────────────────────────────────┘');
  console.log('');
  console.log('  1. Open: https://supabase.com/dashboard/project/' + proj + '/sql/new');
  console.log('  2. Paste the contents of:  supabase/advanced-functions.sql');
  console.log('  3. Click  RUN');
  console.log('');
  console.log('  OR add DATABASE_URL to .env.local and re-run this script:');
  console.log('    • Supabase Dashboard → Settings → Database → Connection string → URI');
  console.log('    DATABASE_URL=postgresql://postgres:[PASSWORD]@db.' + proj + '.supabase.co:5432/postgres');
  console.log('');
  console.log('  Functions that will be created:');
  const fns = [
    'get_dashboard_stats()',
    'get_overdue_payments(limit)',
    'get_due_soon(from, to, limit)',
    'get_cashflow(days)',
    'get_collection_heatmap(days)',
    'get_top_borrowers(limit)',
    'get_monthly_collections(months)',
    'get_plan_split()',
    'get_week_collections(from, to)',
    'get_customer_stats(customer_id)',
    'get_today_collection_list(date)',
    'get_recent_activity(limit)',
  ];
  fns.forEach(f => console.log('    • ' + f));
  console.log('');
  console.log('  Views:  loan_with_payment_summary,  overdue_summary');
  console.log('  Trigger: auto_complete_loan (auto-marks loans done when fully paid)');
  console.log('  Indexes: 3 new composite indexes for faster queries');
  console.log('');
}

// ── Verify functions exist (via Supabase REST) ────────────────────────────────
async function verifyFunctions() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY
                   ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !serviceKey) return;

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const sb = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Try calling our new function
    const { data, error } = await sb.rpc('get_dashboard_stats');
    if (error) {
      if (error.code === '42883') {
        console.log('⚠  Functions not yet applied — run the SQL manually (see instructions above).');
      } else {
        console.warn('⚠  Verification error:', error.message);
      }
    } else {
      console.log('✓ Verified: get_dashboard_stats() is live!');
      console.log('  Stats:', JSON.stringify(data, null, 2));
    }
  } catch (e) {
    console.warn('  (verification skipped:', e.message + ')');
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
console.log('');
console.log('Finance Tracker — Apply Advanced PostgreSQL Enhancements');
console.log('─'.repeat(56));
console.log('');

const applied = await tryPg();

if (!applied) {
  printInstructions();
}

await verifyFunctions();
