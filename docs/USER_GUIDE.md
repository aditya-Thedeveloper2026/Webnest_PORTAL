# User guide

## Sign in

All users use the same login screen and enter the username/password supplied by the Admin. The role is read from the protected employee profile. There is no role selector and no self-registration.

Newly created or reset accounts must choose a private password at first sign-in. If the account has been disabled, contact the Admin.

## Admin workspace

- **Dashboard:** live counts for employees, clients, leads, projects, quotations, payments and commissions.
- **Employees:** create BD/Technical accounts, activate/deactivate accounts, change roles and issue temporary password resets. Existing passwords are never displayed.
- **Clients:** shared directory and client creation.
- **Projects:** review submissions, approve/reject with a reason, reassign accepted projects and approve/reject completion.
- **Pricing catalogue:** add items, disable items and create a new catalogue version. Prices must be verified and configured before client use.
- **Quotations:** review quotations created from project price snapshots.
- **Discount approvals:** approve/reject employee requests. Approved discounts are allocated proportionally over line items.
- **Commissions:** update future policy rates, approve earned commissions, apply reasoned adjustments and record payouts.
- **Payments:** record client receipts independently from commissions.
- **Reports and audit logs:** export operational CSV data and review important administrative actions.

## Business Development workspace

- View shared client records and add clients.
- Create leads and track the lead pipeline.
- Use **Create project** to open the Nexus guided wizard.
- Save/resume project drafts, answer conditional questions and submit projects for Admin review.
- Create a quotation from a priced, reviewed project and request a discount for Admin approval.
- View only personal commission records.

BD users cannot publish a submission to the technical queue. Admin approval is required.

## Technical workspace

- Browse **Available projects** published by Admin.
- Accept a project. PostgreSQL enforces first-eligible acceptance; if another employee has accepted it, the action returns an assigned message.
- View assigned projects and submit work for completion review.
- Use **Self-sourced projects** to capture a client/project of your own. The database sets the acquisition source from your Technical role; after Admin review it remains assigned to you.
- View only personal commission records.

## Nexus project discovery

The wizard asks about client details, service type, plan/type, requirements, additional context and pricing. It preserves answers when moving backward/forward and persists the draft in Supabase. “I don't know” answers are valid and appear as discovery topics in the PDF.

The animated 3D asset loads only if the GLB file is supplied. Until then, the app shows an animated CSS fallback and does not claim that fallback is a 3D model.

## Commission policy

- Business Development: 15%.
- Technical, company-provided: 35%.
- Technical, self-acquired: 45%.

Commission is earned only after Admin approves project completion. The commission screen is limited to the logged-in employee for non-Admins. Payment of the client invoice is not a prerequisite for commission earning.

## Client proposal PDF

The wizard creates a proposal containing the client overview, project understanding, questionnaire answers, scope, available pricing/tax details, assumptions and next steps. It deliberately excludes all employee commission information and internal margins. Cloud archival uses a private Supabase Storage bucket.
