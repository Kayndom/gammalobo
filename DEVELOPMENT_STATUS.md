# gammalobo development status

This is a tested application build on the development branch, not yet a production release.

## Implemented on this branch
- Finance cash movement reporting separates owner capital, investor liabilities, borrower cash received, principal disbursed, operating expenses and owner withdrawals.
- Finance records owner capital injections, expenses and withdrawals; internal profit-to-capital transfers are not treated as cash leaving the business.
- Finance reports collected loan interest from explicit principal-first repayment allocations and separates it from total borrower cash received.
- Repayments are allocated principal-first and tagged to the current rollover cycle; overpayments are rejected.
- Investor agreements support individual principal, monthly simple-interest rate, term and payout preference.
- Investor funding must be explicitly confirmed before interest accrues.
- Investor interest uses simple interest on original principal, prorates partial periods, and can be regenerated without duplicate periods.
- Investor payouts separately record principal and interest and are checked against outstanding amounts.
- The fresh-start SQL deletes business records in explicit foreign-key order without TRUNCATE CASCADE; it preserves the admin auth account and settings.
- A fresh-start and deployment guide documents migration order and operational test cases.

## Automated checks
- Latest GitHub Actions run for commit `4ea9eac725efd7705ebaea8ce5fef17fb3dff791` passed `npm ci`, `npm run lint`, and `npm run build`.
- This is a code build check; it is not a live Supabase integration test.

## Still required before production
- Apply both SQL migrations to the intended Supabase project and verify the resulting schema.
- Take and verify a full backup before running the destructive reset.
- Run the fresh-start reset only after confirming the backup and target project.
- Deploy a Vercel preview and complete the test sequence in `supabase/FRESH_START_GUIDE.md`.
- Reconcile the Finance cash estimate against real bank transactions.

## Security scope
The owner explicitly asked to defer the existing borrower/guarantor public-access security work. Those policies were not changed. This branch is not a security sign-off.

Do not deploy to production or run the reset until the database migration, backup and preview checks above are completed.
