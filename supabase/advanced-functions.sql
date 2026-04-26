-- ============================================================
-- Finance Tracker — Advanced PostgreSQL Functions, Views & Triggers
-- Run in: Supabase Dashboard → SQL Editor → New query → Run
-- Or use: node scripts/apply-advanced.mjs
-- ============================================================

-- ─── 1. get_dashboard_stats() ────────────────────────────────────────────────
-- Single RPC call that replaces two round-trips + massive JS aggregation loop.
-- Returns all hero stats for the dashboard in one query.
CREATE OR REPLACE FUNCTION get_dashboard_stats()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH loan_agg AS (
    SELECT
      COUNT(*)                                                                     AS total_loans,
      COUNT(*) FILTER (WHERE status = 'active')                                   AS active_loans,
      COUNT(*) FILTER (WHERE status = 'completed')                                AS completed_loans,
      COUNT(*) FILTER (WHERE status = 'defaulted')                                AS defaulted_loans,
      COALESCE(SUM(principal) FILTER (WHERE status = 'active'), 0)               AS capital_deployed,
      COALESCE(SUM(interest_amount)
        FILTER (WHERE status = 'active' AND NOT interest_collected), 0)          AS interest_pending,
      COALESCE(SUM(interest_amount) FILTER (WHERE interest_collected), 0)        AS interest_earned
    FROM loans
  ),
  cust_agg AS (
    SELECT COUNT(*) AS total_customers FROM customers
  ),
  pay_agg AS (
    SELECT
      COUNT(*)
        FILTER (WHERE p.due_date < CURRENT_DATE
                  AND p.paid_amount < p.expected_amount
                  AND l.status = 'active')                                        AS overdue_count,
      COALESCE(SUM(p.expected_amount - p.paid_amount)
        FILTER (WHERE p.due_date < CURRENT_DATE
                  AND p.paid_amount < p.expected_amount
                  AND l.status = 'active'), 0)                                   AS overdue_amount,
      COALESCE(SUM(p.expected_amount - p.paid_amount)
        FILTER (WHERE p.due_date = CURRENT_DATE
                  AND p.paid_amount < p.expected_amount
                  AND l.status = 'active'), 0)                                   AS today_due_amount,
      COALESCE(SUM(p.paid_amount)
        FILTER (WHERE p.paid_date = CURRENT_DATE), 0)                            AS today_collected,
      COALESCE(SUM(p.paid_amount), 0)                                            AS total_collected_ever
    FROM payments p
    JOIN loans l ON p.loan_id = l.id
  )
  SELECT jsonb_build_object(
    'active_loans',         la.active_loans,
    'completed_loans',      la.completed_loans,
    'defaulted_loans',      la.defaulted_loans,
    'total_customers',      ca.total_customers,
    'capital_deployed',     la.capital_deployed,
    'interest_pending',     la.interest_pending,
    'interest_earned',      la.interest_earned,
    'overdue_count',        pa.overdue_count,
    'overdue_amount',       pa.overdue_amount,
    'today_due_amount',     pa.today_due_amount,
    'today_collected',      pa.today_collected,
    'total_collected_ever', pa.total_collected_ever
  )
  FROM loan_agg la, cust_agg ca, pay_agg pa;
$$;

-- ─── 2. get_overdue_payments(limit) ──────────────────────────────────────────
-- Returns overdue payment rows joined with loan & customer info.
CREATE OR REPLACE FUNCTION get_overdue_payments(p_limit int DEFAULT 20)
RETURNS TABLE (
  payment_id     text,
  loan_id        text,
  period_number  int,
  due_date       date,
  expected_amount numeric,
  paid_amount    numeric,
  notes          text,
  customer_id    text,
  customer_name  text,
  customer_phone text,
  principal      numeric,
  plan_type      text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    p.id,
    p.loan_id,
    p.period_number,
    p.due_date,
    p.expected_amount,
    p.paid_amount,
    p.notes,
    l.customer_id,
    l.customer_name,
    l.customer_phone,
    l.principal,
    l.plan_type
  FROM payments p
  JOIN loans l ON p.loan_id = l.id
  WHERE l.status = 'active'
    AND p.due_date < CURRENT_DATE
    AND p.paid_amount < p.expected_amount
  ORDER BY p.due_date ASC
  LIMIT p_limit;
$$;

-- ─── 3. get_due_soon(from, to, limit) ────────────────────────────────────────
-- Returns payments due in a date range (default: today → +6 days).
CREATE OR REPLACE FUNCTION get_due_soon(
  p_from  date    DEFAULT CURRENT_DATE,
  p_to    date    DEFAULT CURRENT_DATE + 6,
  p_limit int     DEFAULT 20
)
RETURNS TABLE (
  payment_id     text,
  loan_id        text,
  period_number  int,
  due_date       date,
  expected_amount numeric,
  paid_amount    numeric,
  notes          text,
  customer_id    text,
  customer_name  text,
  customer_phone text,
  principal      numeric,
  plan_type      text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    p.id,
    p.loan_id,
    p.period_number,
    p.due_date,
    p.expected_amount,
    p.paid_amount,
    p.notes,
    l.customer_id,
    l.customer_name,
    l.customer_phone,
    l.principal,
    l.plan_type
  FROM payments p
  JOIN loans l ON p.loan_id = l.id
  WHERE l.status = 'active'
    AND p.due_date >= p_from
    AND p.due_date <= p_to
    AND p.paid_amount < p.expected_amount
  ORDER BY p.due_date ASC, l.customer_name ASC
  LIMIT p_limit;
$$;

-- ─── 4. get_cashflow(days) ───────────────────────────────────────────────────
-- Returns expected vs collected per day for the last N days.
-- Uses generate_series so every day appears even with zero activity.
CREATE OR REPLACE FUNCTION get_cashflow(p_days int DEFAULT 14)
RETURNS TABLE (
  day       date,
  expected  numeric,
  collected numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH date_series AS (
    SELECT generate_series(
      CURRENT_DATE - (p_days - 1),
      CURRENT_DATE,
      '1 day'::interval
    )::date AS day
  ),
  exp_by_day AS (
    SELECT p.due_date AS day, SUM(p.expected_amount) AS expected
    FROM payments p
    JOIN loans l ON p.loan_id = l.id
    WHERE l.status = 'active'
      AND p.due_date >= CURRENT_DATE - (p_days - 1)
      AND p.due_date <= CURRENT_DATE
    GROUP BY p.due_date
  ),
  col_by_day AS (
    SELECT p.paid_date AS day, SUM(p.paid_amount) AS collected
    FROM payments p
    WHERE p.paid_date >= CURRENT_DATE - (p_days - 1)
      AND p.paid_date <= CURRENT_DATE
      AND p.paid_amount > 0
    GROUP BY p.paid_date
  )
  SELECT
    ds.day,
    COALESCE(e.expected,  0) AS expected,
    COALESCE(c.collected, 0) AS collected
  FROM date_series ds
  LEFT JOIN exp_by_day e  ON e.day = ds.day
  LEFT JOIN col_by_day c  ON c.day = ds.day
  ORDER BY ds.day;
$$;

-- ─── 5. get_collection_heatmap(days) ────────────────────────────────────────
-- Returns daily collection totals + transaction count for the last N days.
CREATE OR REPLACE FUNCTION get_collection_heatmap(p_days int DEFAULT 90)
RETURNS TABLE (
  day      date,
  amount   numeric,
  tx_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH date_series AS (
    SELECT generate_series(
      CURRENT_DATE - (p_days - 1),
      CURRENT_DATE,
      '1 day'::interval
    )::date AS day
  ),
  daily AS (
    SELECT paid_date AS day, SUM(paid_amount) AS amount, COUNT(*) AS tx_count
    FROM payments
    WHERE paid_date >= CURRENT_DATE - (p_days - 1)
      AND paid_amount > 0
    GROUP BY paid_date
  )
  SELECT
    ds.day,
    COALESCE(d.amount,   0) AS amount,
    COALESCE(d.tx_count, 0) AS tx_count
  FROM date_series ds
  LEFT JOIN daily d ON d.day = ds.day
  ORDER BY ds.day;
$$;

-- ─── 6. get_top_borrowers(limit) ────────────────────────────────────────────
-- Returns borrowers ranked by total outstanding amount across all active loans.
CREATE OR REPLACE FUNCTION get_top_borrowers(p_limit int DEFAULT 5)
RETURNS TABLE (
  customer_id    text,
  customer_name  text,
  customer_phone text,
  outstanding    numeric,
  active_loans   bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    l.customer_id,
    l.customer_name,
    l.customer_phone,
    SUM(GREATEST(0, p.expected_amount - p.paid_amount)) AS outstanding,
    COUNT(DISTINCT l.id) AS active_loans
  FROM loans l
  JOIN payments p ON p.loan_id = l.id
  WHERE l.status = 'active'
  GROUP BY l.customer_id, l.customer_name, l.customer_phone
  HAVING SUM(GREATEST(0, p.expected_amount - p.paid_amount)) > 0
  ORDER BY outstanding DESC
  LIMIT p_limit;
$$;

-- ─── 7. get_monthly_collections(months) ──────────────────────────────────────
-- Returns total collected and transaction count per calendar month.
CREATE OR REPLACE FUNCTION get_monthly_collections(p_months int DEFAULT 6)
RETURNS TABLE (
  month     text,
  collected numeric,
  tx_count  bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    TO_CHAR(paid_date, 'YYYY-MM') AS month,
    SUM(paid_amount)              AS collected,
    COUNT(*)                      AS tx_count
  FROM payments
  WHERE paid_date >= (CURRENT_DATE - (p_months * 30))
    AND paid_amount > 0
  GROUP BY TO_CHAR(paid_date, 'YYYY-MM')
  ORDER BY month;
$$;

-- ─── 8. get_plan_split() ─────────────────────────────────────────────────────
-- Returns active loan counts and principal split by plan type (daily/weekly).
CREATE OR REPLACE FUNCTION get_plan_split()
RETURNS TABLE (
  plan_type       text,
  loan_count      bigint,
  total_principal numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    plan_type,
    COUNT(*)        AS loan_count,
    SUM(principal)  AS total_principal
  FROM loans
  WHERE status = 'active'
  GROUP BY plan_type;
$$;

-- ─── 9. get_week_collections(from, to) ───────────────────────────────────────
-- Returns expected vs collected for a date range (default: this week).
CREATE OR REPLACE FUNCTION get_week_collections(
  p_from date DEFAULT CURRENT_DATE,
  p_to   date DEFAULT CURRENT_DATE + 6
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT jsonb_build_object(
    'expected',  COALESCE(SUM(p.expected_amount)
      FILTER (WHERE p.due_date >= p_from
                AND p.due_date <= p_to
                AND l.status = 'active'), 0),
    'collected', COALESCE(SUM(p.paid_amount)
      FILTER (WHERE p.paid_date >= p_from
                AND p.paid_date <= p_to), 0)
  )
  FROM payments p
  JOIN loans l ON p.loan_id = l.id;
$$;

-- ─── 10. get_customer_stats(customer_id) ────────────────────────────────────
-- Returns aggregated stats for a single borrower — for the customer detail page.
CREATE OR REPLACE FUNCTION get_customer_stats(p_customer_id text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH loan_pay AS (
    SELECT
      l.id AS loan_id,
      l.status,
      l.plan_type,
      l.principal,
      l.interest_amount,
      l.period_amount,
      COALESCE(SUM(p.paid_amount), 0)                                          AS total_paid,
      COALESCE(SUM(p.expected_amount), 0)                                      AS total_expected,
      COUNT(p.id) FILTER (WHERE p.paid_amount >= p.expected_amount
                            AND p.expected_amount > 0)                         AS paid_periods,
      COUNT(p.id)                                                               AS total_periods,
      COALESCE(SUM(GREATEST(0, p.expected_amount - p.paid_amount))
        FILTER (WHERE p.due_date < CURRENT_DATE
                  AND p.paid_amount < p.expected_amount), 0)                   AS overdue_amount,
      COUNT(p.id) FILTER (WHERE p.due_date < CURRENT_DATE
                            AND p.paid_amount < p.expected_amount)             AS overdue_count,
      COALESCE(SUM(GREATEST(0, p.expected_amount - p.paid_amount))
        FILTER (WHERE p.due_date = CURRENT_DATE
                  AND p.paid_amount < p.expected_amount), 0)                   AS today_due
    FROM loans l
    LEFT JOIN payments p ON p.loan_id = l.id
    WHERE l.customer_id = p_customer_id
    GROUP BY l.id, l.status, l.plan_type, l.principal, l.interest_amount, l.period_amount
  )
  SELECT jsonb_build_object(
    'active_loans',      COUNT(*) FILTER (WHERE status = 'active'),
    'completed_loans',   COUNT(*) FILTER (WHERE status = 'completed'),
    'total_outstanding', COALESCE(SUM(GREATEST(0, total_expected - total_paid)), 0),
    'total_paid',        COALESCE(SUM(total_paid), 0),
    'total_principal',   COALESCE(SUM(principal), 0),
    'total_interest',    COALESCE(SUM(interest_amount), 0),
    'overdue_amount',    COALESCE(SUM(overdue_amount), 0),
    'overdue_count',     COALESCE(SUM(overdue_count), 0),
    'today_due',         COALESCE(SUM(today_due), 0),
    'repayment_rate',    CASE WHEN COALESCE(SUM(total_expected), 0) > 0
                           THEN ROUND(COALESCE(SUM(total_paid), 0)
                                / COALESCE(SUM(total_expected), 1) * 100, 1)
                           ELSE 0 END,
    'daily_loan_count',  COUNT(*) FILTER (WHERE plan_type = 'daily' AND status = 'active'),
    'weekly_loan_count', COUNT(*) FILTER (WHERE plan_type = 'weekly' AND status = 'active')
  )
  FROM loan_pay;
$$;

-- ─── 11. get_today_collection_list(date) ─────────────────────────────────────
-- Single query that returns all payments relevant for a given collection date:
--   • due today (exact match)
--   • overdue (past due, not fully paid)
--   • paid today (regardless of due date)
-- This replaces three separate queries + JS deduplication in getTodayListData().
CREATE OR REPLACE FUNCTION get_today_collection_list(p_date date DEFAULT CURRENT_DATE)
RETURNS TABLE (
  loan_id        text,
  payment_id     text,
  plan_type      text,
  period_number  int,
  principal      numeric,
  expected_amount numeric,
  paid_amount    numeric,
  paid_date      date,
  due_date       date,
  status         text,
  notes          text,
  customer_id    text,
  customer_name  text,
  customer_phone text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT DISTINCT ON (p.id)
    l.id,
    p.id,
    l.plan_type,
    p.period_number,
    l.principal,
    p.expected_amount,
    p.paid_amount,
    p.paid_date,
    p.due_date,
    p.status,
    p.notes,
    l.customer_id,
    l.customer_name,
    l.customer_phone
  FROM payments p
  JOIN loans l ON p.loan_id = l.id
  WHERE l.status = 'active'
    AND (
      p.due_date = p_date                                                  -- due on this date
      OR (p.due_date < p_date AND p.paid_amount < p.expected_amount)       -- overdue
      OR (p.paid_date = p_date AND p.paid_amount > 0)                      -- paid today
    )
  ORDER BY p.id, p.due_date;
$$;

-- ─── 12. get_recent_activity(limit) ──────────────────────────────────────────
-- Returns the most recently collected payments with borrower info.
CREATE OR REPLACE FUNCTION get_recent_activity(p_limit int DEFAULT 8)
RETURNS TABLE (
  payment_id     text,
  loan_id        text,
  period_number  int,
  due_date       date,
  paid_date      date,
  paid_amount    numeric,
  expected_amount numeric,
  customer_name  text,
  customer_phone text,
  principal      numeric,
  plan_type      text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    p.id,
    p.loan_id,
    p.period_number,
    p.due_date,
    p.paid_date,
    p.paid_amount,
    p.expected_amount,
    l.customer_name,
    l.customer_phone,
    l.principal,
    l.plan_type
  FROM payments p
  JOIN loans l ON p.loan_id = l.id
  WHERE p.paid_date IS NOT NULL
    AND p.paid_amount > 0
  ORDER BY p.paid_date DESC, p.updated_at DESC
  LIMIT p_limit;
$$;

-- ─── 13. View: loan_with_payment_summary ─────────────────────────────────────
-- Pre-joined view for loan list pages — avoids re-aggregating in JS.
CREATE OR REPLACE VIEW loan_with_payment_summary AS
SELECT
  l.*,
  COUNT(p.id)                                                                  AS total_payments,
  COUNT(p.id) FILTER (WHERE p.paid_amount >= p.expected_amount
                        AND p.expected_amount > 0)                             AS paid_payments,
  COUNT(p.id) FILTER (WHERE p.due_date < CURRENT_DATE
                        AND p.paid_amount < p.expected_amount)                 AS overdue_count,
  COALESCE(SUM(p.paid_amount), 0)                                              AS total_paid,
  COALESCE(SUM(p.expected_amount), 0)                                          AS total_expected,
  COALESCE(SUM(GREATEST(0, p.expected_amount - p.paid_amount)), 0)            AS outstanding
FROM loans l
LEFT JOIN payments p ON p.loan_id = l.id
GROUP BY l.id;

-- ─── 14. View: overdue_summary ───────────────────────────────────────────────
-- Quick lookup of all currently-overdue payments with borrower context.
CREATE OR REPLACE VIEW overdue_summary AS
SELECT
  p.id           AS payment_id,
  p.loan_id,
  p.period_number,
  p.due_date,
  p.expected_amount,
  p.paid_amount,
  p.expected_amount - p.paid_amount AS amount_overdue,
  CURRENT_DATE - p.due_date         AS days_overdue,
  l.customer_id,
  l.customer_name,
  l.customer_phone,
  l.principal,
  l.plan_type
FROM payments p
JOIN loans l ON p.loan_id = l.id
WHERE l.status = 'active'
  AND p.due_date < CURRENT_DATE
  AND p.paid_amount < p.expected_amount
ORDER BY p.due_date ASC;

-- ─── 15. Trigger: auto_complete_loan ─────────────────────────────────────────
-- Automatically marks a loan as 'completed' when every payment is fully paid.
-- Fires after any INSERT or UPDATE on payments — zero app-code changes needed.
CREATE OR REPLACE FUNCTION auto_complete_loan_fn()
RETURNS TRIGGER AS $$
DECLARE
  v_total  int;
  v_paid   int;
  v_status text;
BEGIN
  -- Only act on active loans (avoid re-completing already-completed loans)
  SELECT status INTO v_status FROM loans WHERE id = NEW.loan_id;
  IF v_status != 'active' THEN
    RETURN NEW;
  END IF;

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE paid_amount >= expected_amount AND expected_amount > 0)
  INTO v_total, v_paid
  FROM payments
  WHERE loan_id = NEW.loan_id;

  IF v_total > 0 AND v_total = v_paid THEN
    UPDATE loans
    SET status = 'completed', updated_at = NOW()
    WHERE id = NEW.loan_id AND status = 'active';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS auto_complete_loan ON payments;
CREATE TRIGGER auto_complete_loan
  AFTER INSERT OR UPDATE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION auto_complete_loan_fn();

-- ─── 16. Additional indexes for new query patterns ────────────────────────────
-- Speeds up the overdue/due-soon queries across active loans.
CREATE INDEX IF NOT EXISTS payments_due_date_status_idx
  ON payments (due_date, paid_amount, expected_amount);

CREATE INDEX IF NOT EXISTS loans_status_customer_idx
  ON loans (status, customer_id);

CREATE INDEX IF NOT EXISTS payments_paid_date_amount_idx
  ON payments (paid_date, paid_amount)
  WHERE paid_amount > 0;

-- ─── Done ─────────────────────────────────────────────────────────────────────
-- Verify: SELECT routine_name FROM information_schema.routines WHERE routine_schema = 'public';
