# Architecture

## Runtime overview

```text
Browser (Cloudflare Pages)
  ├─ HTML / CSS / Vanilla ES modules
  ├─ Supabase publishable key
  ├─ Supabase Auth session (access + refresh token)
  └─ Supabase Data API / Storage / Edge Functions
         ├─ PostgreSQL + Row Level Security
         ├─ SECURITY DEFINER workflow RPCs
         ├─ Private project-brochures bucket
         └─ Edge Functions using service-role credentials server-side only
```

The UI is one static application, but role navigation and page composition are distinct. `components/layout.js` defines separate navigation for `ADMIN`, `BUSINESS_DEVELOPMENT` and `TECHNICAL`. `auth/router.js` guards paths using the role read from the authenticated user's profile. This route guard is a user-experience control only; database RLS and server-side function checks are the security boundary.

## Trust boundaries

1. **Identity:** Supabase Auth validates the password. The browser calls `username-login`, which resolves a username inside the Edge Function and signs in using the internal synthetic email. The synthetic address and service-role key are never sent to the browser.
2. **Role:** `public.profiles.role` is the source of truth. Frontend state, URLs and local storage are not trusted for authorization.
3. **Provisioning:** `create-employee` verifies the caller's JWT and active Admin profile before using Auth Admin APIs. `admin-employee-action` performs status, role and temporary-password operations.
4. **Initial Admin:** `bootstrap-admin` is a one-time endpoint protected by a high-entropy secret and a database completion flag. It is not a registration page.
5. **Sensitive workflows:** project claiming, pricing calculation, project review, completion approval, commission snapshots, discount approvals, payout recording and quotation review are database functions with role checks.
6. **Files:** proposal PDFs are stored in a private bucket with project-member storage policies. Use signed URLs when a future download/share workflow is added; do not make the bucket public.

## Frontend modules

- `js/app.js` — app boot, auth lifecycle, route resolution, event delegation and form submission.
- `js/config/supabase.js` — validates the browser config and constructs the Supabase client.
- `js/auth/auth-service.js` — username login, profile lookup, logout and auth listener.
- `js/auth/router.js` — role landing routes and path guard helpers.
- `js/components/layout.js` — distinct role shell and navigation.
- `js/modules/dashboard.js` — live dashboard metrics and charts.
- `js/modules/project-wizard.js` — guided discovery, persistent drafts, price calculation and PDF creation.
- `js/modules/questionnaires.js` — versioned question definitions and conditional-question engine.
- `js/modules/projects.js` — project queue and review/assignment action surfaces.
- `js/modules/operations.js` — catalogue, quotation, discount, payment, report and audit views.
- `js/services/data-service.js` — common data access methods.

## Database workflow principles

- Use integer paise (`bigint`) for money.
- Browser inputs submit item IDs and quantities, not authoritative prices.
- `save_project_pricing` loads current catalogue rows, calculates each tax line, applies approved discounts proportionally, and snapshots the results.
- The commission base is the sum of commissionable items less the proportional discount allocation on those items.
- Commission policies are selected at completion approval and snapshotted on the resulting commission row.
- `accept_available_project` uses a conditional database `UPDATE` and transaction semantics. The project can transition to `IN_DEVELOPMENT` for one technical user only.
- `approve_project_completion` is the only standard path that creates `EARNED` commissions.
- Payment records do not update commission status.

## Nexus assistant

`components/nexus-assistant.js` attempts to lazy-load Three.js and `assets/nexus/nexus-character.glb` only when the wizard is rendered. The package deliberately does not pretend to contain a completed 3D asset. If the GLB is missing, WebGL is unavailable, the network import fails or reduced-motion is requested, a lightweight CSS fallback remains visible. The rendering loop pauses when the tab is hidden and is disposed when the wizard is repainted.
