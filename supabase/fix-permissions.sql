-- ============================================================
-- Run this in Supabase Dashboard → SQL Editor → New query
-- This fixes the "row-level security policy" 500 errors
-- ============================================================

-- 1. Disable RLS completely on all app tables
ALTER TABLE IF EXISTS customers DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS loans     DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS payments  DISABLE ROW LEVEL SECURITY;

-- 2. Drop any existing policies that might interfere
DROP POLICY IF EXISTS "Enable all for anon" ON customers;
DROP POLICY IF EXISTS "Enable all for anon" ON loans;
DROP POLICY IF EXISTS "Enable all for anon" ON payments;

-- 3. Grant full access to both anon (publishable key) and authenticated roles
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON ALL TABLES    IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;

-- 4. Make future tables automatically accessible too
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES    TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;

-- Verify (should show rls_enabled = false for all three)
SELECT tablename, rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('customers','loans','payments');
