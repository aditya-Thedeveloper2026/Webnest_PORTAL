# Security guide

## Secrets

- Browser configuration may contain only the Supabase project URL and publishable/anon key.
- Never place `SUPABASE_SERVICE_ROLE_KEY`, database passwords, bootstrap secrets or other privileged credentials under `frontend/`.
- Edge Functions use service credentials only after verifying the caller (except the one-time bootstrap and public login resolver, which have their own controls).
- Keep `frontend/config.js` out of public source control if it contains environment-specific project details; the anon key is public by design, but project identifiers are still configuration information.

## Authentication

- User enters username and password.
- `username-login` performs server-side username mapping through the protected `profiles` records and calls Supabase Auth with an internal synthetic address.
- The browser receives only an Auth session. It does not receive the synthetic email.
- Login attempts are rate-limited using hashed identifiers in `login_attempts`.
- Public sign-up is disabled.
- The profile role is loaded after authentication. The UI does not accept role input.
- New and reset employee accounts are marked to change their temporary password at next sign-in.

## Authorization

RLS is the real security boundary. Route guards and hidden navigation are not authorization. Before production use, verify at least:

- BD cannot query another employee's lead, project commission, payout or private project details.
- Technical cannot query another Technical employee's project or commission by changing a UUID.
- Technical can read the safe `available_projects` view but cannot select the base `projects` table for unassigned projects.
- Non-Admin users cannot read `payments`, `audit_logs`, or `commission_policies`.
- A user cannot update their own role, account status, username, synthetic auth email or temporary-password flag.
- A non-Admin cannot write acquisition source, technical owner, project status or project pricing totals directly.
- Only Admin can create employee profiles or reset employee passwords.
- Only Admin can approve discounts, quotations, completion or commission payouts.

## Sensitive workflows

- Account creation and role/password management run in Edge Functions.
- Project source is set from the authenticated profile role on insert.
- The technical first-claim path is a transaction-backed database function. The UI cannot assign a project by updating a column.
- `save_project_pricing` accepts catalogue item IDs and quantities, reads authoritative prices from PostgreSQL and stores paise snapshots. It does not accept browser-supplied prices or totals.
- The completion approval function snapshots commission policy and makes the commission earned. Client payments are separate rows.
- Discount and payout changes use audited functions.
- Proposal PDFs are private Storage objects.

## Operational safeguards before production

1. Review every migration against the target Supabase version.
2. Restrict Edge Function CORS to the actual Cloudflare Pages origin(s); the scaffold currently uses `*` to simplify local development.
3. Configure Auth rate limits and password policy in the dashboard.
4. Add monitoring/alerts for repeated failed login attempts, bootstrap invocation, role changes and unusual Admin actions.
5. Test deactivation against existing sessions and refresh tokens.
6. Review employee identity verification and temporary-password handover procedures.
7. Run RLS tests using separate non-service-role accounts.
8. Review applicable Indian tax, privacy and employment requirements with qualified advisors.
9. Configure backups and an audited recovery runbook before storing live client or financial data.
10. Avoid placing private client documents in public buckets.

## Known boundary

The project package has not been connected to a live Supabase tenant. Static source inspection is not a substitute for a security assessment, Postgres policy tests, Edge Function tests, concurrency tests or deployment verification.
