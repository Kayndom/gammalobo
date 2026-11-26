-- DESTRUCTIVE: wipes all borrower, loan, finance and investor business records.
-- gammalobo / Supabase only.
--
-- BEFORE RUNNING:
-- 1. Take a full Supabase backup and verify that it can be downloaded/restored.
-- 2. Confirm the Supabase project is the intended gammalobo project.
-- 3. Apply and verify the investor-accounting migration first.
-- 4. Ensure no one is using the application while this runs.
--
-- PRESERVES: auth.users (admin login), public.settings, schema, functions,
-- storage objects, and application configuration.
-- DELETES: all applicants, guarantors, applications, loans, loan history,
-- capital injections, withdrawals, investor profiles, agreements, accruals
-- and investor payments.
--
-- This uses explicit DELETEs in foreign-key order. It intentionally avoids
-- TRUNCATE ... CASCADE so unrelated dependent tables cannot be silently wiped.

begin;

do $$
begin
  if to_regclass('public.investors') is null
     or to_regclass('public.investments') is null
     or to_regclass('public.investor_accruals') is null
     or to_regclass('public.investor_payments') is null then
    raise exception 'Investor tables are missing. Apply and verify the investor migration before running this reset.';
  end if;
end $$;

delete from public.investor_payments;
delete from public.investor_accruals;
delete from public.investments;
delete from public.investors;

delete from public.instalments;
delete from public.loan_logs;
delete from public.rollovers;
delete from public.loans;
delete from public.applications;
delete from public.guarantors;
delete from public.applicants;

delete from public.capital_injections;
delete from public.profit_withdrawals;

commit;

-- Settings and the admin authentication account are intentionally retained.
