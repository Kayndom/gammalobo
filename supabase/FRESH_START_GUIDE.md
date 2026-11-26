# gammalobo fresh-start and deployment guide

This guide applies only to `Kayndom/gammalobo` on `feature/finance-investors-reset`.

## What the current changes do

- Investor agreements store an individual principal, monthly simple-interest rate, term, maturity date and payout preference.
- An agreement is not treated as funded until the operator confirms the money has actually arrived.
- Confirmation starts the investment term and interest clock on the actual receipt date.
- Simple interest is calculated against the original principal, with partial periods prorated.
- Investor principal and interest payouts are recorded separately and cannot exceed the recorded outstanding amounts.
- Loan repayments are allocated principal-first, then interest. Allocation is tracked separately for each rollover cycle.
- Finance shows recorded cash movement and collected loan interest separately. It does not label all borrower repayments as profit.
- The fresh-start script preserves `auth.users` and `public.settings`.

## Database migration order

1. Download and verify a full backup of the intended Supabase project.
2. In Supabase SQL Editor, run the complete contents of `migrations/202611260001_investor_accounting.sql`.
3. Run the complete contents of `migrations/202611260002_repayment_allocation.sql`.
4. Check that the four investor tables exist and that the three allocation columns exist on `public.instalments`.
5. Only when you are certain the backup is recoverable and this is the intended project, run `RESET_DATA_AFTER_BACKUP.sql`.

Do not run the reset script before both migrations. It deliberately aborts if the investor tables are missing.

## What the reset deletes

- Investor profiles, agreements, interest accruals and investor payments
- Loan instalments, loan logs, rollover history and loans
- Applications, guarantors and applicants
- Owner capital injections and profit withdrawals

It preserves the admin authentication account and `public.settings`. It does not delete storage objects, schema, functions or application configuration.

## After the reset

1. Deploy the branch as a Vercel preview first.
2. Sign in with the existing admin account.
3. Add a test owner capital injection.
4. Create a test loan and disburse it. Confirm that the disbursement log records the principal amount as cash paid out.
5. Record a partial repayment smaller than principal; confirm it is allocated entirely to principal.
6. Record enough further repayments to clear principal; confirm subsequent amounts are allocated to interest.
7. Roll over a test loan and verify the new cycle starts its own principal-first allocation without counting previous-cycle allocations twice.
8. Create an investor agreement, confirm funding, generate accruals twice and verify the second run does not duplicate interest.
9. Record interest and principal payouts and confirm the remaining liability reduces correctly.
10. Reconcile Finance's estimated cash movement with the test bank/cash transactions.

Only promote the Vercel deployment to production after those checks pass.

## Important scope note

The existing public borrower and guarantor access policies have intentionally not been changed, per the project owner's instruction to defer security work. This guide does not certify those workflows as secure.
