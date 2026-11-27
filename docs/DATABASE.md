# Database guide

Apply the ordered migrations in `supabase/migrations/` with `supabase db push`.

## Main entities

| Area | Tables |
|---|---|
| Identity | `profiles`, `employee_details`, `employee_roles`, `app_settings`, `login_attempts` |
| Clients and leads | `clients`, `leads`, `lead_activities` |
| Projects | `projects`, `project_requirements`, `project_assignments`, `project_milestones`, `project_activity_logs`, `project_brochures` |
| Pricing | `pricing_versions`, `pricing_categories`, `pricing_items`, `pricing_rules`, `tax_settings` |
| Quotations | `quotations`, `quotation_items`, `quotation_approvals` |
| Discounts | `discount_requests` |
| Commissions | `commission_policies`, `commissions`, `commission_transactions`, `commission_payouts` |
| Client receipts | `payments` |
| Operations | `notifications`, `audit_logs` |

All money fields ending in `_paise` are integer paise. The UI converts to and from INR for display/input only. PostgreSQL functions remain authoritative.

## Roles and policies

`profiles.role` is an enum with `ADMIN`, `BUSINESS_DEVELOPMENT` and `TECHNICAL`. The current role helpers are `current_role()`, `is_admin()` and `is_active_employee()`. RLS is enabled on the application tables.

- Admin may read and manage authorized business records.
- Employees may read the shared client directory but not the administrative payment, audit or global commission data.
- BD candidates read/write their own leads and their created projects; their own commission rows are visible.
- Technical candidates read their own assigned projects and their commission rows.
- Technical users discover safe available-project fields through `available_projects`, a narrow view that does not expose financial columns.
- `login_attempts` and `app_settings` are not granted to browser roles.

## Important RPCs

| Function | Purpose |
|---|---|
| `accept_available_project(uuid)` | Atomic first-claim technical assignment |
| `submit_project_for_review(uuid)` | Submit own draft/rejected project to Admin |
| `admin_review_project(uuid,text,text)` | Approve/reject a project; self-sourced work remains assigned to its originator |
| `submit_project_completion(uuid)` | Technical employee requests completion review |
| `approve_project_completion(uuid)` | Admin approves completion and creates commission snapshots |
| `save_project_pricing(uuid,jsonb)` | Calculates prices, taxes, discounts and eligible base from catalogue data |
| `create_pricing_version(text,text)` | Copies the current catalogue into a new active version |
| `create_quotation_from_project(uuid,date)` | Creates a versioned quotation from saved project snapshots |
| `admin_review_quotation(uuid,text,text)` | Approves/rejects a quotation |
| `admin_review_discount(uuid,text,text)` | Approves/rejects a discount with validation and audit |
| `admin_set_commission_policy(text,text,numeric)` | Creates a future commission rate policy |
| `admin_approve_commission(uuid,text)` | Moves an earned commission to approved |
| `admin_record_commission_payout(uuid,uuid[],text,text)` | Records payment of approved commissions |
| `admin_adjust_commission(uuid,bigint,text)` | Audited commission adjustment |
| `admin_record_payment(uuid,bigint,text,text,text)` | Records a client receipt separately from commission |
| `admin_reassign_project(uuid,uuid,text)` | Admin override of technical assignment |
| `admin_reject_project_completion(uuid,text)` | Returns a completion submission to development |
| `record_brochure_version(uuid,text,text)` | Records a proposal PDF storage version |
| `complete_my_password_change()` | Clears the temporary-password flag after an authenticated password update |

## Commission policy snapshots

The seed policy contains:

- Business Development: 15%.
- Technical, company-provided: 35%.
- Technical, self-acquired: 45%.

At Admin completion approval, the current applicable rate and `eligible_amount_paise` are copied to `commissions.rate_snapshot` and `commissions.eligible_amount_paise`. The amount is calculated and stored in paise. Later policy changes do not rewrite these values.

Eligible base:

```text
eligible amount = commissionable development + feature line amounts
                - proportional share of approved discounts

commission = round(eligible amount × policy rate / 100)
```

Items marked non-commissionable (such as hosting, domains and third-party expenses) are excluded. Tax is excluded. The commission engine does not use client payment receipts as an earning condition.

## Pricing versions and tax

The migration seeds website starter items: Basic Website ₹999, Business Website ₹1,999 and Premium Website ₹2,999 as an initial configurable catalogue value (the Premium plan metadata records an indicative ₹4,999 upper reference). These are not guaranteed project totals. Hosting prices are not invented or seeded. Admins should add validated hosting entries after confirming provider, billing term and renewal costs.

Each pricing item has its own `tax_rate` and `is_taxable` flag so different tax treatments can be represented. The initial starter items use 18%. The quote calculator applies tax item-by-item after proportional discount allocation. Update item rates in the catalogue when the applicable tax configuration requires it; consult a qualified tax professional for the actual treatment. The `tax_settings` table stores the initial configurable policy baseline.

Every project pricing calculation stores a JSON price snapshot and the catalogue version. Quotation rows also preserve item and tax snapshots. Historical totals should not be recalculated merely because the current catalogue changes.

## Storage

The migration creates a private `project-brochures` bucket with a 10 MB PDF limit. Objects are stored under `{project_uuid}/proposal-v{n}.pdf`. Storage policies require project membership or Admin access. Keep this bucket private.
