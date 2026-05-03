#!/usr/bin/env node
/**
 * setup-tables.mjs — prints the SQL needed to create any missing tables
 * and opens the Supabase SQL editor in your browser.
 *
 * Usage: node scripts/setup-tables.mjs
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { exec } from 'node:child_process';

const __dir = dirname(fileURLToPath(import.meta.url));

// ── Load .env.local ────────────────────────────────────────────────────────────
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

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('✗ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const db = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── Tables to check ────────────────────────────────────────────────────────────
const TABLES = [
  {
    name: 'capital_entries',
    sql: `create table if not exists capital_entries (
  id         text primary key default gen_random_uuid()::text,
  date       date          not null,
  amount     numeric(15,2) not null check (amount > 0),
  note       text          not null default '',
  created_at timestamptz   not null default now(),
  updated_at timestamptz   not null default now()
);
create index if not exists capital_entries_date_idx on capital_entries(date);
alter table capital_entries disable row level security;`,
  },
];

// ── Check which tables are missing ─────────────────────────────────────────────
console.log('\n🔍 Checking Supabase tables…\n');

const missing = [];
for (const table of TABLES) {
  const { error } = await db.from(table.name).select('id').limit(1);
  if (error?.code === 'PGRST205' || error?.message?.includes('schema cache')) {
    console.log(`  ✗ ${table.name} — MISSING`);
    missing.push(table);
  } else if (error) {
    console.log(`  ? ${table.name} — error: ${error.message}`);
  } else {
    console.log(`  ✓ ${table.name}`);
  }
}

if (missing.length === 0) {
  console.log('\n✅ All tables exist — nothing to do.\n');
  process.exit(0);
}

// ── Print SQL ──────────────────────────────────────────────────────────────────
const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\./)?.[1] ?? '';
const sqlEditorUrl = `https://supabase.com/dashboard/project/${projectRef}/sql/new`;
const combinedSql = missing.map(t => t.sql).join('\n\n');

console.log(`
┌─────────────────────────────────────────────────────────────────┐
│  ${missing.length} table(s) missing — run this SQL in Supabase SQL Editor  │
└─────────────────────────────────────────────────────────────────┘

  ${sqlEditorUrl}

─── Copy & paste the SQL below ──────────────────────────────────────

${combinedSql}

─────────────────────────────────────────────────────────────────────
`);

// Open Supabase SQL editor in browser
const opener = process.platform === 'win32' ? 'start'
  : process.platform === 'darwin' ? 'open' : 'xdg-open';
exec(`${opener} "${sqlEditorUrl}"`, () => {});
console.log('🌐 Opening Supabase SQL editor in your browser…\n');
console.log('After running the SQL, restart the app or refresh the Capital card.\n');
