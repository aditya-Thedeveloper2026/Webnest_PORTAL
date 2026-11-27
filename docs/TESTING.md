# Testing plan

## Automated checks included

Run:

```bash
npm test
```

The smoke test validates expected files, JavaScript syntax and a few repository-level security invariants. It is not an integration or penetration test.

## Required Supabase integration tests

Create three separate accounts: Admin, BD and Technical. Use ordinary Auth sessions, never a service-role key, for the employee checks.

### Authentication and employee management

1. Sign in with the initial Admin username.
2. Confirm public sign-up is unavailable.
3. Confirm invalid credentials produce a generic response.
4. Confirm repeated login attempts are rate-limited.
5. As Admin, create one BD and one Technical employee.
6. Confirm each employee can sign in and must change their temporary password.
7. Disable an employee and verify that refresh and all RLS-protected operations fail.
8. Change an employee role and verify that the next profile lookup/routes reflect the database role.
9. Reset a password; verify the employee must change it at next sign-in.
10. Confirm employees cannot change `profiles.role`, `status`, `username` or `auth_email` through the Data API.

### RLS negative tests

As BD:

- Read the shared active client directory.
- Read own leads/projects/commissions.
- Attempt to read another BD candidate's lead and commission using a known UUID; the result must be denied or empty.
- Attempt to read `payments`, `commission_policies` and `audit_logs`; access must be denied.
- Attempt to write a different `acquisition_source`, technical owner, status or project pricing total; it must fail or be overwritten by the database.

As Technical:

- Read only own assigned project records.
- Read `available_projects` without seeing internal financial fields.
- Attempt to read another Technical employee's assigned project and commission by changing an ID; it must fail or return no rows.
- Attempt to update own acquisition source, commission, project status or pricing; it must fail.
- Attempt to invoke employee creation/discount approval/payout RPCs; it must be denied.

### Project workflow and concurrency

1. Create a client and start one Website, one Application and one AI Agent project wizard.
2. Test each conditional branch and select “I don't know”.
3. Move backward and forward; confirm answers remain.
4. Save a draft, reload, and resume it.
5. Confirm the normalized `project_requirements` rows match question IDs and selected answers.
6. Submit; verify the project is `PENDING_REVIEW` and Admin receives a notification.
7. Reject with a reason; verify it returns to the originator for revision.
8. Approve a BD-submitted project; verify it becomes `AVAILABLE`.
9. Open two independent Technical sessions and click Accept at nearly the same time. Exactly one must receive the assignment. The other must receive “This project has already been assigned to another employee.”
10. Create a Technical self-sourced project. Verify the database records `TECHNICAL_SELF_SOURCED`, assigns the originator, and does not allow the browser to alter the source.
11. Approve the self-sourced submission; verify it enters development under the originator.
12. Submit completion, then test Admin rejection and approval.

### Pricing / discounts / quotations

1. Create a new pricing catalogue version and verify old versions remain.
2. Configure one commissionable development item, one non-commissionable hosting/domain item and one third-party expense.
3. Configure applicable line-level tax rates and verify the calculator applies them after discount allocation.
4. Verify changing a price in a later version does not change an old project or quotation snapshot.
5. Request a discount, reject it, then approve a discount within the estimate. Ensure an over-subtotal discount is rejected.
6. Recalculate and verify the discount is allocated proportionally over items and the commission base excludes non-commissionable items and taxes.
7. Create a quotation from a submitted/reviewed project. Verify version numbering, snapshot totals and Admin approval/rejection.

### Commission calculations

Use fixed inputs that are easy to calculate:

- Eligible amount ₹5,000 at 15% → BD ₹750.
- Eligible amount ₹5,000 at 35% → Technical company-provided ₹1,750.
- Eligible amount ₹5,000 at 45% → Technical self-acquired ₹2,250.

Also verify:

- Hosting and third-party expense items are excluded from the eligible base.
- GST is excluded.
- An approved discount reduces the eligible base only by its proportional share allocated to commissionable line items.
- Completion pending review does not create earned commission.
- Completion approval creates exactly one relevant commission per employee/role.
- Client payment is not needed for commission earning.
- Later commission policy changes do not change historical `rate_snapshot` or amount.
- Payout is possible only after commission approval.
- Adjustment requires a reason, is audited, and cannot make a commission negative.

### Proposal PDF and storage

- Generate a multi-page proposal with many questionnaire answers.
- Confirm text does not overlap or clip.
- Confirm line items, taxes and final estimate are represented when pricing exists.
- Search the generated PDF text for “commission”, “payout”, “margin” and verify no internal figures are present.
- Confirm `project-brochures` is private and unrelated employees cannot read/download another project's object.
- Confirm a failed Storage upload does not claim the cloud archive succeeded.

### Browser and responsive tests

- Desktop Chrome/Edge: Admin, BD and Technical role layouts.
- Mobile viewport: login, tables, forms and project wizard; no horizontal page overflow.
- Keyboard: every field/button focusable, labels associated with controls.
- Reduced-motion preference: Nexus animations are reduced and no 3D load is required.
- Hidden tab: optional GLB render loop pauses.
- Missing GLB/WebGL: fallback remains usable.
- Reload direct role URLs and verify session/role checks work.

## Evidence to retain

Before production, record the Supabase project ref, migration versions, Edge Function deploy versions, test account roles, pass/fail results, screenshots of role isolation, concurrent claim results and reviewed tax/commission calculations. Do not record passwords, service-role keys or bootstrap secrets.
