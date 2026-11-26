# gammalobo development status

This branch is a development release candidate, not production-ready.

## Verified
- GitHub Actions successfully ran `npm ci`, `npm run lint`, and `npm run build` for the Finance page revision at commit eede06347c4fde42ee6eaae0811ec202b488413a.

## Not approved for production
- Investor migration has not been executed or tested against the hosted Supabase schema.
- Public borrower and guarantor token workflows still need a secure server-side/RPC design before anonymous access can be restricted.
- The reset SQL has not been validated against a fresh backup and full dependency inventory.
- Live cash balances, loan rollover history, and investor liabilities require reconciliation before operational use.
- No production Vercel deployment has been made.

Do not run the reset SQL or apply the investor migration to production yet.
