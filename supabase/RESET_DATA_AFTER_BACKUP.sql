-- DESTRUCTIVE REGNUM DATA RESET — gammalobo
-- Run ONLY after downloading a verified full backup and confirming the correct Supabase project.
-- Erases borrower, guarantor, application, loan, payment, capital and investor business records.
-- Preserves auth.users and settings. Review table names and foreign-key dependencies first.
begin;
truncate table
 public.investor_payments, public.investor_accruals, public.investments, public.investors,
 public.instalments, public.loan_logs, public.rollovers, public.loans, public.applications,
 public.guarantors, public.applicants, public.capital_injections, public.profit_withdrawals
restart identity cascade;
commit;
