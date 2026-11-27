# Supabase setup (beginner-friendly)

## A. Create the project

1. Create a new Supabase project in the Supabase dashboard.
2. Save the Project URL and publishable/anon key.
3. Keep the service-role key in a password manager. It must never be committed to Git or copied into `frontend/config.js`.
4. In Authentication settings, disable public sign-ups. The app provisions accounts through Admin-only Edge Functions.
5. Because employee logins use internal synthetic addresses rather than real mailboxes, disable email confirmation for this Auth provider. Confirm your organization's account-recovery approach in `ADMIN_SETUP.md`.

## B. Browser configuration

Copy `frontend/config.example.js` to `frontend/config.js` and set:

- `SUPABASE_URL`: Project URL.
- `SUPABASE_ANON_KEY`: publishable/anon key.

Both values are safe for the browser when RLS is correctly enabled. The service-role key is not.

## C. Link and migrate

Install the Supabase CLI, then run from the repository root:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

Review the migration SQL before applying it to a production database. For a new project, the six ordered migrations create the base tables, RLS, pricing seeds, secure workflow RPCs and private storage bucket.

## D. Deploy functions

```bash
supabase functions deploy username-login --no-verify-jwt
supabase functions deploy bootstrap-admin --no-verify-jwt
supabase functions deploy create-employee
supabase functions deploy admin-employee-action
```

`username-login` and `bootstrap-admin` are unauthenticated at the platform JWT layer by design, but each has its own controls: `username-login` is rate-limited and only returns an Auth session after a successful sign-in; `bootstrap-admin` requires a high-entropy one-time secret and checks the database bootstrap flag. Employee management functions verify the caller's JWT and Admin role.

The Supabase Edge runtime normally injects `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`. Verify that they are present. The service key belongs only in the Edge runtime.

## E. Authentication configuration

The included `supabase/config.toml` documents the intended settings. Check the final dashboard settings after linking because project-level dashboard settings can differ from local CLI configuration:

- Public sign-up disabled.
- Email confirmation disabled for the synthetic-email workflow.
- Site URL set to the exact frontend origin.
- Redirect allow-list contains only the required local and production origins.
- Password policy set to at least 12 characters where supported.

## F. Validate RLS

Create separate accounts for Admin, Business Development and Technical roles. Do not test with the service-role key. Sign in as each user and test the negative cases in `TESTING.md`; a successful Admin query does not prove that employee RLS works.

## G. Local development

Use a static server (not `file://`):

```bash
python -m http.server 8000 --directory frontend
```

Visit `http://localhost:8000`. Browser developer tools should show the connected Supabase project and any RLS/Edge errors. Never work around an RLS error by adding unrestricted policies.
