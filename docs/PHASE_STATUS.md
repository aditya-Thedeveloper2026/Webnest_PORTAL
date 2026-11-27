# Build status and acceptance boundary

This package is an integrated baseline, not evidence of a deployed production service. No live Supabase project credentials or external project access were supplied. Accordingly, no live authentication, RLS, Edge Function, Storage, concurrency or browser integration test has been run in this environment.

## Source implemented in this package

- Modular vanilla HTML/CSS/JavaScript client and role-specific layouts.
- Common username login through an Edge Function, profile role lookup and forced password change for temporary credentials.
- One-time Admin bootstrap function with a database guard.
- Admin employee creation, activation/deactivation, role updates and temporary password resets.
- Shared client listing/creation, BD lead creation, real Supabase dashboards and reports.
- Website, Application and AI Agent guided discovery definitions; conditional question logic and draft persistence.
- Optional lazy Three.js / GLB integration with greeting/idle/gesture clip hooks, tab-visibility pause, reduced-motion handling, resource disposal and a clear CSS fallback.
- Database pricing calculation from catalogue item IDs, line tax, discount allocation and price snapshots.
- Project submission, Admin approval/rejection, atomic first-claim assignment, technical self-source attribution and completion review.
- Proposal PDF generation and private storage/version recording path.
- Commission policy snapshots and Admin approval/payout/adjustment database functions.
- Discount approval, quotation snapshot creation/review, client payment recording, audit queries and CSV export.
- Setup/security/deployment/testing documentation.

## Not yet accepted as production complete

- A live Supabase deployment and test accounts have not been configured.
- SQL migrations and Edge Functions have not been executed/compiled against a target Supabase project in this environment.
- The Nexus GLB character model is not included; the lazy integration and fallback are provided, but the named animation clips require a model asset.
- Client editing/archival and interaction history UI is not complete.
- Full project workspace screens for milestone editing, notes and rich progress history need completion.
- Admin reporting requires additional date-filtered report definitions and reconciliation review.
- Full quotation PDF lifecycle (client send/acceptance capture, validity/expiry automation and historical document download) still needs acceptance work; the proposal PDF path is implemented separately.
- Some account and administrative actions use prompt-based confirmations and should be replaced with polished application modals before final release.
- Tax configuration must be reviewed for the actual service mix and current legal treatment by a qualified professional.
- Edge Function CORS is permissive for development and must be restricted to production origins.
- Automated database/RLS/concurrency/financial end-to-end tests must be run as described in `TESTING.md`.

## Recommended next acceptance phase

1. Configure a non-production Supabase project.
2. Apply migrations and deploy functions; fix migration/TypeScript issues discovered against the actual project.
3. Run all negative RLS tests with separate Admin, BD and Technical users.
4. Complete and test the remaining client/project workspace and quotation acceptance surfaces.
5. Generate/validate the optimized Nexus GLB with named clips: `greeting_wave`, `idle_breathing`, `idle_look_left`, `idle_look_right`, `blink`.
6. Run financial and concurrent project-claim tests, then complete production security review and controlled rollout.
