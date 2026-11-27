# Webnest Nexus

A modular internal operations portal for Webnest Studio. The frontend is plain HTML, CSS and vanilla ES modules; Supabase provides authentication, PostgreSQL, Row Level Security, private storage and Edge Functions.

> **Deployment status:** This repository contains an integrated implementation baseline and setup materials. It is not connected to a live Supabase project in this package. Production readiness must not be inferred until the migrations/functions are deployed, the environment is configured, and the security/workflow test plan in `docs/TESTING.md` passes against separate test accounts.

## What is included

- Common username/password login with server-side username resolution.
- Distinct Admin, Business Development and Technical workspaces, routed using the role stored in `public.profiles`.
- Admin account provisioning, activation/deactivation, role changes and temporary password reset via protected Edge Functions.
- Shared client directory and Business Development lead capture.
- Project wizard with website, application and AI Agent branches, conditional MCQs, draft persistence and “I don't know” choices.
- Optional Nexus 3D model integration with a lightweight animated CSS fallback. A GLB model is not bundled; see `frontend/assets/nexus/README.md`.
- Database-calculated catalogue pricing, line-level tax, approved discount allocation and commission-eligible amount snapshots.
- Project approval, atomic first-claim technical assignment, technical self-sourced projects and completion approval.
- Client proposal PDF generation; proposal versions are stored in private Supabase Storage when configured.
- Commission policies and immutable rate snapshots: BD 15%, Technical / company-provided 35%, Technical / self-acquired 45%.
- Commission approval, adjustment and payout RPCs; payment receipts are separate.
- Discount and quotation approval workflows, audit records and CSV report exports.

## Quick start

### 1. Create a Supabase project

Create a project in Supabase. Keep the project URL, publishable/anon key and service-role key available for the setup steps. The service-role key is server-only.

### 2. Configure the browser client

Copy `frontend/config.example.js` to `frontend/config.js` and enter the Supabase Project URL and publishable/anon key. Never put the service-role key in this file.

```bash
cp frontend/config.example.js frontend/config.js
```

On Windows PowerShell:

```powershell
Copy-Item frontend/config.example.js frontend/config.js
```

Edit the two values in `frontend/config.js`.

### 3. Apply the database migrations

Install the Supabase CLI, sign in, link this folder to the project and push the migrations:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

The migrations are in `supabase/migrations/` and are ordered. They create the schema, RLS policies, pricing catalogue starter rows, commission policy defaults, workflow functions, private brochure storage and audit logic.

### 4. Deploy Edge Functions

```bash
supabase functions deploy username-login --no-verify-jwt
supabase functions deploy bootstrap-admin --no-verify-jwt
supabase functions deploy create-employee
supabase functions deploy admin-employee-action
```

Supabase injects the project URL and server credentials into the Edge Function runtime. Confirm that `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are present in the function environment. Do not copy the service-role key into frontend files or Git.

### 5. Create the first Admin account

Follow `docs/ADMIN_SETUP.md`. The initial username is `admin_2026_2108`; the owner chooses the password during a one-time protected bootstrap call. No password is embedded in source code.

### 6. Run the frontend locally

From the repository root:

```bash
python -m http.server 8000 --directory frontend
```

Open `http://localhost:8000`. A local static server is required because the app uses JavaScript modules.

### 7. Run static checks

```bash
npm test
```

This checks required files, frontend JavaScript syntax and a few security invariants. It does **not** replace database/RLS, Edge Function, concurrency, browser or financial tests.

## Hosting

The frontend is static and can be hosted on Cloudflare Pages. Set the Pages project root to the repository root, build command to none, and output directory to `frontend`. Keep `frontend/config.js` configured with the public Supabase URL/key. See `docs/DEPLOYMENT.md`.

## Important policies

- BD commission: **15%** of the eligible amount.
- Technical commission on company-provided leads: **35%**.
- Technical commission on technical self-acquired leads: **45%**.
- Eligible base: commissionable development/features less their proportional allocation of approved discounts. Hosting, domains, third-party expenses and taxes are excluded according to item catalogue flags.
- Commission becomes **EARNED** only after Admin approves project completion; client payment receipt does not control earning.
- Technical project acceptance is an atomic database operation.
- Prices and taxes are calculated from the active database catalogue. The website starter values (₹999, ₹1,999 and ₹2,999 initial) are configurable catalogue seeds, not a delivery promise. No hosting provider price is invented or preloaded.

## Documentation

- `docs/ARCHITECTURE.md` — component architecture and trust boundaries.
- `docs/DATABASE.md` — schema, RPCs and financial snapshots.
- `docs/SUPABASE_SETUP.md` — project setup and migration deployment.
- `docs/ADMIN_SETUP.md` — one-time initial administrator bootstrap and recovery.
- `docs/SECURITY.md` — threat model, RLS and operational safeguards.
- `docs/DEPLOYMENT.md` — Cloudflare Pages and production rollout.
- `docs/USER_GUIDE.md` — role-specific workflows.
- `docs/TESTING.md` — manual test plan and limitations.
- `docs/PHASE_STATUS.md` — implemented baseline vs remaining acceptance work.

## Repository structure

```text
webnest-nexus/
├── frontend/
│   ├── index.html
│   ├── config.example.js
│   ├── css/
│   ├── js/
│   └── assets/nexus/
├── supabase/
│   ├── config.toml
│   ├── migrations/
│   ├── functions/
│   └── seed.sql
├── docs/
├── tests/
├── .env.example
├── .gitignore
└── package.json
```
