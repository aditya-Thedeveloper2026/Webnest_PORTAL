# Initial administrator setup

The first Admin is created once during owner-controlled setup. There is no public administrator registration page and no password is stored in source code.

## Prerequisites

- The Supabase project has been created.
- The database migrations have been applied.
- `bootstrap-admin` has been deployed.
- You can access the Supabase CLI as the project owner.

The fixed initial username is:

```text
admin_2026_2108
```

The owner supplies the initial password at bootstrap time. Use a password manager and choose at least 12 characters with uppercase, lowercase, a number and a symbol.

## 1. Generate a one-time secret

Generate at least 32 random bytes. For example, with OpenSSL:

```bash
openssl rand -hex 32
```

Store the resulting value temporarily in a secure password manager. Do not place it in Git, chat, screenshots or a public terminal recording.

## 2. Set the Edge Function secret

```bash
supabase secrets set BOOTSTRAP_SECRET="PASTE_THE_RANDOM_SECRET_HERE"
```

The function already uses the server-injected `SUPABASE_SERVICE_ROLE_KEY`; do not add that key to the browser configuration.

## 3. Call the one-time bootstrap endpoint

Run this from a trusted owner-controlled terminal. The password is entered in the request body over HTTPS. Do not save the command with the actual password in shell history; use an interactive secure prompt or a temporary request file with restrictive file permissions if your environment supports it.

Example request shape:

```bash
curl --fail-with-body -X POST "https://YOUR_PROJECT_REF.supabase.co/functions/v1/bootstrap-admin" \
  -H "Content-Type: application/json" \
  -H "x-bootstrap-secret: YOUR_ONE_TIME_SECRET" \
  --data '{"full_name":"Webnest Studio Admin","password":"CHOOSE_A_STRONG_PASSWORD"}'
```

A successful response confirms the username `admin_2026_2108`. The endpoint checks the `app_settings.admin_bootstrap_completed` flag and also checks whether an Admin already exists. It cannot create a second initial Admin.

## 4. Disable bootstrap immediately

Remove the one-time secret as soon as the endpoint reports success:

```bash
supabase secrets unset BOOTSTRAP_SECRET
```

You may also undeploy the `bootstrap-admin` function after successful setup. The database completion flag remains true, so a subsequent invocation is rejected even if the function remains deployed.

## 5. Sign in

Open the Webnest Nexus login page and sign in with:

- Username: `admin_2026_2108`
- Password: the password you supplied during bootstrap.

The app reads the user's role from `public.profiles` and opens the Admin workspace. The role is never selected on the login screen.

## Account recovery without a mailbox

Synthetic internal auth emails are not real inboxes, so email-based password recovery is intentionally not used.

- For an employee: an Admin verifies the employee through a separate trusted channel, uses **Employee Management → Reset password**, then shares the temporary password over a verified private channel. The employee must set a new password at next sign-in.
- For the initial Admin: use the Supabase project owner's secure dashboard/administrative recovery procedure. Do not create a public reset endpoint or expose the service-role key. If the owner cannot access the Supabase project, recover project ownership through Supabase support before attempting database-level changes.

Do not send temporary passwords in public team channels or store them in employee notes.
