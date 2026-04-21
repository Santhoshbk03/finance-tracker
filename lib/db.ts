import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DB_DIR, 'finance.db');

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initializeSchema(db);
    runMigrations(db);
  }
  return db;
}

function initializeSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      address TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS loans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      principal REAL NOT NULL,
      interest_rate REAL DEFAULT 4.0,
      loan_term_weeks INTEGER DEFAULT 10,
      total_weeks INTEGER DEFAULT 10,
      interest_amount REAL NOT NULL,
      total_amount REAL NOT NULL,
      weekly_amount REAL NOT NULL,
      start_date TEXT NOT NULL,
      notes TEXT,
      status TEXT DEFAULT 'active',
      interest_collected INTEGER DEFAULT 0,
      interest_collected_date TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS weekly_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      loan_id INTEGER NOT NULL,
      week_number INTEGER NOT NULL,
      due_date TEXT NOT NULL,
      expected_amount REAL NOT NULL,
      paid_amount REAL DEFAULT 0,
      paid_date TEXT,
      status TEXT DEFAULT 'pending',
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_loans_customer ON loans(customer_id);
    CREATE INDEX IF NOT EXISTS idx_payments_loan ON weekly_payments(loan_id);
    CREATE INDEX IF NOT EXISTS idx_payments_status ON weekly_payments(status);
    CREATE INDEX IF NOT EXISTS idx_payments_due_date ON weekly_payments(due_date);
  `);
}

function runMigrations(db: Database.Database) {
  // Add new columns to existing installations safely
  const migrations = [
    "ALTER TABLE loans ADD COLUMN interest_collected INTEGER DEFAULT 0",
    "ALTER TABLE loans ADD COLUMN interest_collected_date TEXT",
    "ALTER TABLE loans ADD COLUMN loan_term_weeks INTEGER DEFAULT 10",
  ];
  for (const sql of migrations) {
    try { db.exec(sql); } catch { /* column already exists */ }
  }
}

export default getDb;
