# Portal Warga Palm Village - Data Import Plan

> Purpose: operational plan for importing initial production/staging data into Supabase.
>
> Source of truth:
> - Schema migration: `supabase/migrations/202607080001_initial_production_schema.sql`
> - Execution tracker: `docs/production/TASKLIST.md`
>
> Rule: do not import production data until the CSV has been reviewed by a human maintainer.

---

## 1. Import Principles

1. Supabase is the durable source of truth.
2. n8n should become the preferred import executor once Phase 2 API patterns exist.
3. Direct Supabase SQL import is acceptable only for controlled bootstrap tasks.
4. Import must be idempotent where possible.
5. Production imports must not contain passwords or Supabase service role keys.
6. Do not hardcode generated ids in CSV files.
7. Prefer natural keys:
   - `units`: `(block, unit_number)`
   - `profiles`: `google_sub` after Google login, or `email` only for bootstrap lookup
   - `ipl_bills`: `(unit_id, period)`, resolved from `(block, unit_number, period)`
8. Do not delete production rows during re-import unless a separate reviewed rollback task explicitly says so.

---

## 2. Import Order

Recommended order for a fresh environment:

1. Apply production schema migration.
2. Import `units`.
3. Configure `ipl_settings` if defaults need changes.
4. Configure `ipl_components`.
5. Bootstrap first admin after the admin Google profile exists.
6. Let warga register through Google and enter `pending_approval`.
7. Approve warga through the approval workflow.
8. Generate bills through n8n after unit/profile ownership is clean.

Do not import payments before bills exist.

---

## 3. CSV Template: Units

Template file:

```text
docs/production/import-templates/units.csv
```

Columns:

| Column | Required | Type | Rule |
| --- | --- | --- | --- |
| `block` | Yes | text | Trim spaces; examples: `A`, `B`, `C` |
| `unit_number` | Yes | text | Keep as text; examples: `01`, `12`, `A-01` |
| `floor` | No | integer | Empty if not applicable |
| `size` | No | decimal | Square meter or agreed local unit |
| `occupancy_status` | Yes | enum | `owner_occupied`, `owner_vacant`, `owner_rented`, `tenant`, `unknown` |
| `is_occupied` | Yes | boolean | `true` or `false` |
| `notes` | No | text | No sensitive personal data unless approved |

Idempotency:

- Upsert by `unique(block, unit_number)`.
- Re-import may update `floor`, `size`, `occupancy_status`, `is_occupied`, and `notes`.
- Do not import `id`; Supabase generates it.

Validation before import:

- No duplicate `(block, unit_number)` in the CSV.
- `occupancy_status` values match the enum exactly.
- `is_occupied` is only `true` or `false`.
- `block` and `unit_number` are non-empty after trim.

Recommended SQL pattern for reviewed manual import:

```sql
create temporary table import_units (
  block text not null,
  unit_number text not null,
  floor int,
  size numeric(8,2),
  occupancy_status public.occupancy_status not null,
  is_occupied boolean not null,
  notes text
);

-- Load CSV into import_units using Supabase CSV import or psql copy.

insert into public.units (
  block,
  unit_number,
  floor,
  size,
  occupancy_status,
  is_occupied,
  notes
)
select
  trim(block),
  trim(unit_number),
  floor,
  size,
  occupancy_status,
  is_occupied,
  nullif(trim(coalesce(notes, '')), '')
from import_units
on conflict (block, unit_number) do update set
  floor = excluded.floor,
  size = excluded.size,
  occupancy_status = excluded.occupancy_status,
  is_occupied = excluded.is_occupied,
  notes = excluded.notes,
  updated_at = now();
```

---

## 4. CSV Template: Initial Residents

Preferred production path:

- Do not pre-import residents.
- Let each resident login with Google first.
- n8n creates a `profiles` row with `approval_status = pending_approval`.
- Pengurus/admin approves the resident and assigns `unit_id`.

Optional controlled import is allowed only when `google_sub` is known and verified.

Template file:

```text
docs/production/import-templates/initial_residents.csv
```

Columns:

| Column | Required | Type | Rule |
| --- | --- | --- | --- |
| `google_sub` | Yes for import | text | Must come from verified Google identity |
| `email` | Yes | text | Lowercase only |
| `full_name` | Yes | text | Human-readable display name |
| `phone` | No | text | Normalize later for WhatsApp, preferably `62...` |
| `block` | Required for approved warga | text | Resolves to `units.block` |
| `unit_number` | Required for approved warga | text | Resolves to `units.unit_number` |
| `role` | Yes | enum | `warga`, `pengurus`, `bendahara`, `admin` |
| `approval_status` | Yes | enum | Usually `approved` or `pending_approval` |
| `is_active` | Yes | boolean | `true` or `false` |
| `approval_note` | No | text | Import note or source reference |

Production restrictions:

- Do not import a fake `google_sub` for real users.
- Do not set a real resident to `approved` unless their identity and unit have been verified.
- Only `admin` may assign elevated roles (`pengurus`, `bendahara`, `admin`).
- Approved `warga` must have a valid unit because the database enforces it.

Recommended n8n behavior:

1. Read CSV.
2. Validate every row.
3. Resolve `(block, unit_number)` to `units.id`.
4. Reject rows with missing unit when `role = warga` and `approval_status = approved`.
5. Upsert by `google_sub`.
6. Write `audit_logs` action `user.import`.

---

## 5. First Admin Bootstrap

Preferred bootstrap flow:

1. Deploy `/auth/google` enough to create pending profiles.
2. The first admin logs in with Google.
3. n8n creates a pending `profiles` row.
4. A trusted operator opens Supabase SQL Editor.
5. The trusted operator promotes that profile by email.

SQL template:

```sql
update public.profiles
set
  role = 'admin',
  approval_status = 'approved',
  is_active = true,
  approved_at = now(),
  approval_note = 'Bootstrap first admin',
  updated_at = now()
where email = lower('admin@example.com')
returning id, email, full_name, role, approval_status, is_active;
```

Expected result:

- Exactly one row returned.
- If zero rows are returned, the admin has not completed Google login yet or the email is wrong.
- If more than one row is ever returned, stop and investigate. Email is expected to be unique.

Do not store the admin email in committed code unless it is intentionally public operational documentation.

---

## 6. IPL Settings and Components

The initial migration creates default `ipl_settings`:

| Key | Default |
| --- | --- |
| `billing.default_due_day` | `{"day": 10}` |
| `billing.start_period` | `{"period": "2025-01"}` |
| `payment.midtrans_environment` | `{"environment": "sandbox"}` |

Optional component template:

```text
docs/production/import-templates/ipl_components.csv
```

Columns:

| Column | Required | Type | Rule |
| --- | --- | --- | --- |
| `name` | Yes | text | Component name, e.g. `IPL Bulanan` |
| `amount` | Yes | decimal | Must be `>= 0` |
| `is_active` | Yes | boolean | `true` or `false` |
| `sort_order` | Yes | integer | Lower number appears first |

Import rule:

- Components are operational configuration, not historical bills.
- Changing a component affects future bill generation only.
- Existing bills should not be retroactively changed without a separate finance approval task.

---

## 7. Staging Seed Data Plan

Staging can use fake data to test flows:

1. Import 5-20 fake units.
2. Import fake `ipl_components`.
3. Create one fake admin, one pengurus, one bendahara, and one warga only if their `google_sub` values are from controlled test Google accounts.
4. Generate bills through the future n8n bill-generation workflow.
5. Test manual payment and QRIS using Midtrans sandbox only.

Staging rules:

- Never use real payment credentials in staging.
- Never use real resident personal data unless explicitly approved.
- Prefix test notes with `STAGING`.
- It is acceptable to reset staging data if no real user data exists.

---

## 8. Rollback and Re-import Rules

Units:

- Re-import is safe when using `(block, unit_number)` upsert.
- Do not delete units with bills, payments, or profiles.
- If a unit is no longer used, set `is_occupied = false` and `occupancy_status = 'unknown'` or a more accurate state.

Profiles:

- Do not bulk delete real profiles.
- To disable access, set `is_active = false` or `approval_status = 'suspended'`.
- Re-import may update `full_name`, `phone`, `unit_id`, and approval metadata only through a reviewed admin workflow.

Bills:

- Re-importing bills is discouraged.
- Bill generation must be idempotent through `unique(unit_id, period)`.
- If a bill was generated incorrectly, prefer a reviewed adjustment/cancellation process over delete.

Payments:

- Never delete completed production payments.
- Corrections require audit logs and explicit finance approval.

Expenses:

- Avoid deleting production expenses.
- If soft delete is needed later, add a schema migration with `voided_at`, `voided_by`, and `void_reason`.

Storage:

- Payment proof imports should prefer Google Drive metadata:
  - `proof_file_provider = google_drive`
  - `proof_file_id`
  - `proof_file_url`
  - `proof_file_name`
  - `proof_file_mime_type`
  - `proof_file_size`
- Only individual Google Drive files may be public-by-link.
- Parent Google Drive folders must remain private/not publicly browsable.
- Imported Supabase Storage paths are fallback only and must point to existing private bucket objects.

---

## 9. Pre-import Checklist

- [ ] Confirm target environment: staging or production.
- [ ] Confirm the schema migration is applied.
- [ ] Confirm CSV delimiter is comma.
- [ ] Confirm CSV encoding is UTF-8.
- [ ] Confirm there are no duplicate natural keys.
- [ ] Confirm enum values match exactly.
- [ ] Confirm real personal data is approved for the target environment.
- [ ] Confirm backup/export exists if importing into production with existing data.
- [ ] Dry-run validation passes.
- [ ] Human maintainer signs off.

---

## 10. Post-import Checklist

- [ ] Count imported rows.
- [ ] Spot-check sample units.
- [ ] Spot-check sample approved warga has correct unit.
- [ ] Confirm no unexpected elevated roles.
- [ ] Confirm audit log rows exist if import was run through n8n.
- [ ] Confirm frontend/admin UI can read imported data once endpoints exist.
- [ ] Record import date, operator, file name, and row count in deployment notes.
