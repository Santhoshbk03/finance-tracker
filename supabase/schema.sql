-- FinanceTrack — Supabase Postgres Schema
-- Run this once in: Supabase Dashboard → SQL Editor → New query → Run
-- text PKs (not uuid) so Firestore IDs migrate without transformation.

-- ─── Customers ───────────────────────────────────────────────────────────────
create table if not exists customers (
  id            text primary key default gen_random_uuid()::text,
  name          text not null,
  phone         text not null default '',
  address       text not null default '',
  notes         text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ─── Loans ───────────────────────────────────────────────────────────────────
create table if not exists loans (
  id                       text primary key default gen_random_uuid()::text,
  customer_id              text not null references customers(id) on delete restrict,
  customer_name            text not null default '',
  customer_phone           text not null default '',
  plan_type                text not null default 'weekly',   -- 'weekly' | 'daily'
  principal                numeric(15,2) not null,
  interest_rate            numeric(8,4)  not null default 0,
  loan_term_periods        int           not null,
  total_periods            int           not null,
  interest_amount          numeric(15,2) not null default 0,
  total_amount             numeric(15,2) not null,
  period_amount            numeric(15,2) not null,
  start_date               date          not null,
  end_date                 date          not null,
  notes                    text          not null default '',
  status                   text          not null default 'active',  -- 'active'|'completed'|'defaulted'
  interest_collected       boolean       not null default false,
  interest_collected_date  date,
  schedule_config          jsonb,
  created_at               timestamptz   not null default now(),
  updated_at               timestamptz   not null default now()
);

create index if not exists loans_customer_id_idx on loans(customer_id);
create index if not exists loans_status_idx       on loans(status);
create index if not exists loans_created_at_idx   on loans(created_at desc);

-- ─── Payments ────────────────────────────────────────────────────────────────
create table if not exists payments (
  id               text primary key default gen_random_uuid()::text,
  loan_id          text          not null references loans(id) on delete cascade,
  period_number    int           not null,
  due_date         date          not null,
  expected_amount  numeric(15,2) not null,
  paid_amount      numeric(15,2) not null default 0,
  paid_date        date,
  status           text          not null default 'pending',  -- 'pending'|'paid'|'partial'|'overdue'
  notes            text          not null default '',
  created_at       timestamptz   not null default now(),
  updated_at       timestamptz   not null default now()
);

create index if not exists payments_loan_id_period_idx on payments(loan_id, period_number);
create index if not exists payments_due_date_idx        on payments(due_date);
create index if not exists payments_paid_date_idx       on payments(paid_date);
create index if not exists payments_status_idx          on payments(status);

-- Disable Row Level Security (single-owner admin app — server uses service role key)
alter table customers disable row level security;
alter table loans     disable row level security;
alter table payments  disable row level security;
