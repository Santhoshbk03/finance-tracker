-- Capital Entries table
-- Tracks own capital invested (initial + top-ups) to measure compounding growth.
-- Run in: Supabase Dashboard → SQL Editor → New query → Run

create table if not exists capital_entries (
  id         text primary key default gen_random_uuid()::text,
  date       date          not null,
  amount     numeric(15,2) not null check (amount > 0),
  note       text          not null default '',
  created_at timestamptz   not null default now(),
  updated_at timestamptz   not null default now()
);

create index if not exists capital_entries_date_idx on capital_entries(date);
