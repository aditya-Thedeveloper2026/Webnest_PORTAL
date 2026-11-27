# Deployment guide

## 1. Prepare the Supabase backend

Follow `SUPABASE_SETUP.md` to:

- Create/link your Supabase project.
- Apply all SQL migrations.
- Disable public signups and configure the synthetic-email Auth approach.
- Deploy the four Edge Functions.
- Run the one-time Admin bootstrap from `ADMIN_SETUP.md`.
- Create separate test users for BD and Technical roles.

Do not deploy a public-facing frontend until RLS and the negative authorization tests pass.

## 2. Prepare the frontend

1. Copy `frontend/config.example.js` to `frontend/config.js`.
2. Set the Supabase URL and publishable/anon key.
3. Confirm no service-role or bootstrap secret appears anywhere under `frontend/`.
4. Run locally with `python -m http.server 8000 --directory frontend` and test each role.
5. Run `npm test`.

## 3. Cloudflare Pages

Create a Pages project connected to the repository.

Suggested settings:

- Framework preset: None.
- Root directory: repository root.
- Build command: leave empty / no build command.
- Build output directory: `frontend`.
- Production branch: your protected main branch.

The app is static; all runtime data is served by Supabase. The included `_redirects` file sends application routes to `index.html` for client-side routing.

If the Pages domain differs by environment, use a separate public `config.js` per environment or a build-time substitution process. Never expose a service-role key in build variables that become frontend files.

## 4. Edge Function origin policy

The scaffold's `_shared/cors.ts` allows all origins for straightforward local setup. Before production, replace `Access-Control-Allow-Origin: *` with the explicit production Pages origin and the required localhost origin for development. Consider reflecting only allow-listed origins and sending `Vary: Origin`.

## 5. Supabase Auth URL settings

Set Site URL to the production Pages origin and add only approved local/production redirect URLs. Public user sign-up must remain disabled.

## 6. Production checklist

- [ ] Migrations applied and backed up.
- [ ] Edge Functions deployed and logs reviewed.
- [ ] Bootstrap secret removed and endpoint disabled/undeployed.
- [ ] `admin_2026_2108` owner login verified.
- [ ] Admin creates one BD and one Technical test user.
- [ ] RLS tests pass as each role.
- [ ] Concurrent project acceptance test passes.
- [ ] Commission, discount, tax and payout calculations are reconciled.
- [ ] Private brochure Storage access tested as owner, unrelated employee and Admin.
- [ ] `config.js` contains only the public key.
- [ ] CORS allow-list restricted.
- [ ] Cloudflare Pages route fallback works on refresh.
- [ ] Browser console and Supabase logs have no unresolved errors.
- [ ] Backup, access revocation and incident response processes documented.

## 7. Rollback

For a frontend rollback, redeploy the previously successful Pages commit. Database migrations should be forward-fixed unless an explicit tested rollback migration has been prepared. Do not manually delete financial records or historical quotation/commission snapshots to resolve deployment problems.
