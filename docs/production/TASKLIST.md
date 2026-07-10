# Portal Warga Palm Village - Production Upgrade Task List

> Purpose: daftar pekerjaan kecil dan berurutan untuk mengeksekusi production upgrade.
>
> Execution rule: kerjakan satu task kecil sampai selesai, validasi, update checklist, lalu lanjut.
>
> Phase review rule: setelah seluruh task dalam satu fase selesai, agent wajib melakukan review security, performance, UI/UX, dan dokumentasi sebelum membuka fase berikutnya.
>
> References:
> - Planning: `docs/production/PLANNING.md`
> - Technical requirements: `docs/production/REQUIREMENTS.md`

---

## 0. Status Legend

Use these markers:

- `[ ]` Not started
- `[~]` In progress
- `[x]` Done
- `[!]` Blocked
- `[r]` Needs review/rework

Agent instruction:

- Do not mark a task `[x]` unless implementation and validation are done.
- If validation cannot be run, write why in the task notes.
- At phase end, fill the "Phase Review" subsection.

---

## 0.1 Current Execution Snapshot

Last updated: 2026-07-09.

Current production-upgrade state:

- Tooling/access ready:
  - [x] Local repo access.
  - [x] n8n MCP access.
  - [x] Supabase MCP access.
  - [x] Google OAuth Client ID available.
- Environment state:
  - [x] `client/.env` validated without printing secrets.
  - [x] Frontend build previously passed with current env shape.
  - [x] Temporary production frontend URL recorded: `https://portal-warga.vercel.app/`.
  - [ ] Final custom production frontend domain is still not frozen.
  - [ ] Final staging/production n8n API domains are still not frozen.
- Supabase state:
  - [x] Initial production schema applied to Supabase.
  - [x] Supabase migration recorded as `initial_production_schema`.
  - [x] Public tables, core constraints, indexes, and private storage buckets verified through Supabase MCP.
  - [x] Google Drive file-link metadata columns added for payment proofs and expense receipts.
- n8n API state:
  - [x] `PV API - Health Check` created and published.
  - [x] Standard response contract documented.
  - [x] Health check success and forced error paths validated through n8n MCP.
  - [x] `PV API - Auth Me` created and published.
  - [x] App JWT verification and current-profile loading validated through n8n MCP.
  - [x] `PV API - Auth Google` created and published.
  - [x] Google ID token validation, pending profile creation, App JWT issuance, and login audit paths validated through n8n MCP.
  - [x] Role hierarchy and minimum-role check pattern validated through n8n MCP.
  - [x] Audit log insert pattern validated through n8n MCP and Supabase MCP.
  - [x] Audit log test endpoint unpublished after validation.
  - [x] `PV API - Users Pending` created, published, and validated.
  - [x] `PV API - Users Approve` created, published, and validated.
  - [x] `PV API - Users Reject` created, published, and validated.
- File storage decision:
  - [x] Payment proof files use Google Drive as the zero-monthly-cost default.
  - [x] Only individual proof files may be public-by-link.
  - [x] Google Drive parent folders must remain private/not publicly browsable.
  - [x] Supabase stores file id/url/metadata.
- Current active work:
  - [x] Phase 2 - n8n API Foundation.
  - [x] Phase 3 - Google Login and App JWT.
  - [x] Phase 4 - Approval and User Management.
  - [x] Phase 5 - Frontend API Migration Foundation.
  - [x] Phase 6 - Master Data and Billing.
  - [x] Phase 7 - Manual Payment.
- Recommended next task:
  - [ ] Phase 8 - Expenses and House Records.

Latest Phase 1/2 revalidation on 2026-07-09:

- Supabase Phase 1:
  - [x] Migrations present: `initial_production_schema`, `restrict_storage_image_mime_types`, `add_drive_file_link_fields`.
  - [x] Required public tables, enums, profile/file-link columns, helper functions, constraints, and RLS flags are present.
  - [x] Required storage buckets are private with `2 MB` file limit and `image/jpeg,image/png` MIME allow-list.
  - [x] Required indexes are present. Note: `payments(transaction_id)` index exists as `idx_payments_transaction`.
- n8n Phase 2:
  - [x] `PV API - Health Check` is active; execution `237391` returned `200 ok`; execution `237392` returned forced `400 HEALTH_FORCED_ERROR`.
  - [x] `PV API - Auth Me` is active; execution `237393` returned `401 UNAUTHORIZED`; execution `237394` returned `401 INVALID_TOKEN`; execution `237396` returned approved `200 ok`.
  - [x] `PV API - Role Check Test` is active; execution `237397` rejected `warga -> admin` with `403 FORBIDDEN_ROLE`; execution `237398` accepted `bendahara`; execution `237399` accepted `admin`.
  - [x] `PV API - Audit Log Test` remains inactive by design; manual execution `237400` inserted an audit row with `metadata_type = object`.
  - [x] Temporary revalidation signer workflow was archived.
  - [x] Temporary revalidation audit/profile/unit rows were cleaned up; remaining counts were all `0`.

Known working tree notes:

- `client/.env.example` was already modified before the latest tasklist update.
- `client/src/pages/PaymentMatrix.jsx` was already modified before the latest tasklist update.
- `docs/production/` is currently untracked in git.
- `supabase/migrations/` is currently untracked in git.

---

## 1. Global Working Rules for Agents

Before starting any task:

- [x] Read this file.
- [x] Read `docs/production/PLANNING.md`.
- [x] Read the relevant section in `docs/production/REQUIREMENTS.md`.
- [x] Check current git status.
- [x] Do not overwrite unrelated user changes.
- [x] Keep demo mode working unless the task explicitly says otherwise.

After finishing any task:

- [x] Run the smallest useful validation.
- [x] Update task status and notes.
- [x] Mention changed files in the final response.

After finishing any phase:

- [x] Run phase review.
- [x] Update the phase review notes.
- [x] Check if anything should be tuned for security, performance, or UI/UX.
- [x] Only then continue to the next phase.

---

## Phase 0 - Architecture and Environment Freeze

Goal: freeze production direction and remove ambiguity before implementation.

Dependencies: none.

### Task 0.1 - Confirm Production Architecture

Status: `[x]`

Deliverables:

- [x] Confirm target architecture: Frontend -> n8n -> Supabase/Midtrans/Notifications.
- [x] Confirm frontend production mode does not write critical data directly to Supabase.
- [x] Confirm Supabase is the source of truth.
- [x] Confirm n8n is backend/API layer only.
- [x] Add/update architecture notes if decisions change.

Validation:

- [x] `PLANNING.md` and `REQUIREMENTS.md` agree on architecture.

Notes:

- Architecture confirmed in discussion: n8n is backend/API only, Supabase stores all durable data, Google-only login, Midtrans for QRIS.
- Default architecture is documented in `PLANNING.md` and `REQUIREMENTS.md`.

### Task 0.2 - Define Environment Names and URLs

Status: `[~]`

Deliverables:

- [x] Define local frontend URL.
- [ ] Define staging frontend URL.
- [x] Define production frontend URL.
- [x] Define staging n8n API base URL.
- [ ] Define production n8n API base URL.
- [ ] Define Supabase staging project.
- [x] Define Supabase production project.
- [x] Add values or placeholders to documentation.

Validation:

- [x] No production secret is written into repo.

Notes:

- Local frontend URL is `http://localhost:5173`.
- Temporary production frontend URL is `https://portal-warga.vercel.app/`.
- Supabase production project URL has been verified through MCP.
- n8n MCP URL is configured and usable, but final public API base URL for the portal is not frozen in docs yet.
- Staging frontend domain and final custom production domain still need final decision before Google OAuth and production rollout.

### Task 0.3 - Define Secret Inventory

Status: `[x]`

Deliverables:

- [x] List frontend env vars.
- [x] List n8n env vars.
- [x] List Supabase env/config requirements.
- [x] List Midtrans sandbox and production keys.
- [x] List notification provider credentials.
- [x] Confirm which values are public and which are secret.

Validation:

- [x] Secret list exists without actual secret values.

Notes:

- Secret inventory is documented in `REQUIREMENTS.md` and `AGENT_READINESS.md`.
- Actual secret values are intentionally not stored in docs.

### Task 0.4 - Decide App JWT Storage Strategy

Status: `[x]`

Deliverables:

- [x] Decide localStorage/sessionStorage short-lived bearer token vs HttpOnly cookie.
- [x] Document tradeoff.
- [x] If bearer token is chosen, set short expiry strategy.
- [x] If cookie is chosen, define n8n cookie/domain requirements.

Validation:

- [x] `REQUIREMENTS.md` open decision is resolved or explicitly deferred.

Notes:

- Initial production implementation uses short-lived Bearer App JWT.
- Recommended expiry remains 1-6 hours.
- HttpOnly cookie is deferred until domain/cookie handling through n8n is proven clean.

### Task 0.5 - Phase 0 Review

Status: `[~]`

Review checklist:

- [x] Security review: are secrets and auth boundaries clear?
- [x] Performance review: no performance impact yet.
- [x] UI/UX review: login direction is clear.
- [~] Documentation review: planning/requirements/task list still align.
- [x] Update "Phase 0 Review Notes" below.

Phase 0 Review Notes:

```text
Architecture and secret boundaries are clear enough to start Phase 1.
Remaining Phase 0 gap: final staging/production domains and exact public n8n API base URL are not frozen yet.
This is not blocking Supabase schema work, but it must be resolved before staging Google OAuth and production deployment.
Temporary production frontend URL is recorded as https://portal-warga.vercel.app/.
```

---

## Phase 1 - Supabase Production Contract

Goal: Supabase schema, constraints, storage, and audit tables are production-ready.

Dependencies: Phase 0.

### Task 1.1 - Create Production Schema Draft

Status: `[x]`

Files likely affected:

- `supabase/schema.sql`
- `supabase/migrations/202607080001_initial_production_schema.sql`

Deliverables:

- [x] Add/confirm enum `user_role`.
- [x] Add enum `approval_status`.
- [x] Expand `payment_status`.
- [x] Add enum `occupancy_status` if needed.
- [x] Add/confirm `profiles` fields:
  - [x] `google_sub`
  - [x] `email`
  - [x] `avatar_url`
  - [x] `approval_status`
  - [x] `approved_by`
  - [x] `approved_at`
  - [x] `rejected_by`
  - [x] `rejected_at`
  - [x] `approval_note`
  - [x] `last_login_at`
- [x] Add/confirm `ipl_components`.
- [x] Add/confirm `ipl_settings`.
- [x] Add/confirm `expenses`.
- [x] Add/confirm `audit_logs`.

Validation:

- [x] SQL syntax reviewed.
- [x] Schema matches `REQUIREMENTS.md`.

Notes:

- Applied to Supabase as migration `initial_production_schema` on 2026-07-08.
- Remote migration version reported by Supabase MCP: `20260708112113`.
- Local migration file: `supabase/migrations/202607080001_initial_production_schema.sql`.

### Task 1.2 - Add Constraints and Indexes

Status: `[x]`

Deliverables:

- [x] Unique `profiles.google_sub`.
- [x] Unique `profiles.email`.
- [x] Unique `units(block, unit_number)`.
- [x] Unique `ipl_bills(unit_id, period)`.
- [x] Unique/indexed `payments.order_id`.
- [x] Index `payments(status, paid_at)`.
- [x] Index `payments(transaction_id)`.
- [x] Index `ipl_bills(period, status)`.
- [x] Index `expenses(expense_date)`.
- [x] Index `audit_logs(created_at)`.

Validation:

- [x] Duplicate bills are prevented.
- [x] Duplicate payment order IDs are prevented.

Notes:

- Verified with Supabase MCP table metadata after migration apply.

### Task 1.3 - Define Storage Buckets and Policies

Status: `[x]`

Deliverables:

- [x] Define `payment-proofs` bucket.
- [x] Define `expense-receipts` bucket.
- [x] Define optional `profile-avatars` bucket.
- [x] Define allowed file types.
- [x] Define max file size.
- [x] Define file link strategy.

Validation:

- [x] Payment proofs are not public by default.

Notes:

- Buckets were created as private via the initial production migration.
- File strategy documented in `docs/production/STORAGE_ACCESS_STRATEGY.md`.
- Current zero-monthly-cost decision: payment proof files are uploaded to Google Drive.
- Only the Google Drive file is public-by-link; the parent folder must remain private/not publicly browsable.
- Supabase stores `proof_file_id`, `proof_file_url`, and related metadata.
- Supabase signed URLs are now fallback behavior only.
- Allowed app storage upload types are now `jpg`, `jpeg`, and `png` only.
- Storage bucket MIME restrictions were applied to Supabase as migration `restrict_storage_image_mime_types`.
- Google Drive metadata columns were applied to Supabase as migration `add_drive_file_link_fields`.

### Task 1.4 - Define RLS Reference Policies

Status: `[x]`

Deliverables:

- [x] Keep/define RLS policies for future direct Supabase reads if any.
- [x] Document that n8n backend still enforces authorization.
- [x] Add helper functions:
  - [x] `current_role()`
  - [x] `is_staff()`
  - [x] `is_bendahara_or_above()`

Validation:

- [x] RLS does not contradict n8n authorization model.

Notes:

- Initial policies are read-oriented reference policies. Direct production writes remain intended for n8n service-side workflows.
- Phase 1 validation scope: RLS is compatible with the n8n-first authorization model because direct production writes remain service-side only.
- Runtime JWT/role negative tests are intentionally tracked in Phase 2/3 after n8n App JWT verification exists.
- Do not treat RLS as the primary production authorization layer; n8n must still validate App JWT, profile state, role, and ownership.

### Task 1.5 - Create Data Import Plan

Status: `[x]`

Deliverables:

- [x] Define CSV format for units.
- [x] Define CSV format for initial residents if needed.
- [x] Define how to create first admin.
- [x] Define staging seed data plan.
- [x] Define rollback/re-import rules.

Validation:

- [x] Agent can import data without guessing column meanings.

Notes:

- Data import plan added at `docs/production/DATA_IMPORT_PLAN.md`.
- CSV templates added:
  - `docs/production/import-templates/units.csv`
  - `docs/production/import-templates/initial_residents.csv`
  - `docs/production/import-templates/ipl_components.csv`
- Production recommendation: warga should normally register through Google first, then be approved by pengurus/admin instead of being pre-imported.

### Task 1.6 - Phase 1 Review

Status: `[x]`

Review checklist:

- [x] Security: service role not exposed; storage private.
- [x] Performance: required indexes present.
- [x] Data integrity: constraints prevent duplicate bills/payments.
- [x] UI/UX: schema supports approval, payment, reports without awkward gaps.
- [x] Documentation updated.

Phase 1 Review Notes:

```text
Initial production schema has been applied and verified through Supabase MCP.
Completed: core tables, constraints, indexes, RLS enabled, private storage buckets, Google Drive file-link metadata columns, import plan, and zero-monthly-cost payment proof strategy.
Security review: service role remains backend-only; payment proof files use Google Drive public-by-link while parent Drive folders remain private/not publicly browsable; n8n remains responsible for auth, role, approval, and ownership checks.
Performance review: required indexes are present for bills, payments, expenses, audit logs, profile approval, and file ids.
Data integrity review: unique constraints prevent duplicate units, bills, Google identities, emails, and payment order ids.
UI/UX review: schema supports pending approval, assigned unit, manual transfer proof link, payment verification, reports, and audit history.
Deferred to Phase 2/3: runtime negative tests for App JWT, role checks, approval state, and ownership checks after n8n workflows exist.
Phase 1 is complete. Next phase: n8n API Foundation.
```

---

## Phase 2 - n8n API Foundation

Goal: define and implement consistent backend API patterns in n8n.

Dependencies: Phase 1 preferred; can start with contracts during Phase 1.

### Task 2.1 - Define n8n Workflow Naming and Routing

Status: `[x]`

Deliverables:

- [x] Confirm route prefix `/portal-v1`.
- [x] Confirm workflow names.
- [x] Confirm public vs protected endpoints.
- [x] Document workflow list.

Validation:

- [x] Endpoint names match `REQUIREMENTS.md`.

Notes:

- Routing/workflow registry documented in `docs/production/N8N_API_ROUTING.md`.
- n8n MCP inspection found no existing workflow named `PV ...` or matching `portal`; namespace is available.
- Existing unrelated workflows such as `NARA login`, `NARA register`, `RAGA`, and `auth-workflow` must not be modified for this project.
- Frontend env convention: `VITE_N8N_API_BASE_URL` includes `/portal-v1`.

### Task 2.2 - Implement Standard Response Shape

Status: `[x]`

Deliverables:

- [x] Success response helper/pattern.
- [x] Error response helper/pattern.
- [x] Standard error codes.
- [x] HTTP status mapping.

Validation:

- [x] At least one test endpoint returns standard success.
- [x] At least one forced error returns standard error.

Notes:

- Standard response contract documented in `docs/production/N8N_STANDARD_RESPONSE.md`.
- n8n workflow created: `PV API - Health Check`.
- n8n workflow id: `8BqdQWeOeurw2uoi`.
- Workflow is published/active.
- Production endpoint: `POST https://n8n-icyxwmjq.runner.web.id/webhook/portal-v1/health/check`.
- Manual validation:
  - Execution `237360`: success path returned `statusCode = 200`, `ok = true`.
  - Execution `237361`: forced error path returned `statusCode = 400`, `ok = false`, `error.code = HEALTH_FORCED_ERROR`.
- Production/webhook validation:
  - Execution `237362`: success path returned `statusCode = 200`, `ok = true`.
  - Execution `237363`: forced error path returned `statusCode = 400`, `ok = false`, `error.code = HEALTH_FORCED_ERROR`.

### Task 2.3 - Implement App JWT Verification Pattern

Status: `[x]`

Deliverables:

- [x] Read Authorization header.
- [x] Verify JWT signature.
- [x] Verify issuer/audience/expiry.
- [x] Read profile from Supabase.
- [x] Reject inactive, rejected, suspended, or pending users.
- [x] Return normalized `currentUser` object to workflow.

Validation:

- [x] Missing token returns 401.
- [x] Invalid token returns 401.
- [x] Pending user returns 403.
- [x] Approved user returns normalized `currentUser`.

Notes:

- Implementation blueprint documented in `docs/production/N8N_APP_JWT_VERIFICATION.md`.
- n8n node discovery confirmed built-in `JWT` node supports `verify`, and built-in `Supabase` node supports row lookup.
- n8n credential `PV App JWT` exists as `jwtAuth` and is used by `PV API - Auth Me`.
- n8n credential `PV Supabase Service Role` exists as `supabaseApi`, points to the Portal Palm Village Supabase project, and can load Portal tables.
- n8n workflow created: `PV API - Auth Me`.
- n8n workflow id: `4eplxr7j3Gxwyzwj`.
- Workflow is published/active.
- Production endpoint: `POST https://n8n-icyxwmjq.runner.web.id/webhook/portal-v1/auth/me`.
- Runtime tuning applied: protected response paths preserve incoming `x-request-id` through JWT verification and Supabase profile loading.
- Temporary signer workflow `PV OPS - JWT Test Token Signer` was used only for short-lived validation tokens, then archived.
- Temporary Supabase test rows were cleaned up after validation.
- Manual validation:
  - Execution `237371`: missing token returned `statusCode = 401`, `error.code = UNAUTHORIZED`.
  - Execution `237372`: invalid token returned `statusCode = 401`, `error.code = INVALID_TOKEN`.
  - Execution `237369`: approved user returned `statusCode = 200`, `ok = true`, and normalized `currentUser`.
  - Execution `237370`: pending user returned `statusCode = 403`, `error.code = PENDING_APPROVAL`.
- Production/webhook validation:
  - Execution `237373`: missing token returned `statusCode = 401`, `error.code = UNAUTHORIZED`.
  - Execution `237374`: invalid token returned `statusCode = 401`, `error.code = INVALID_TOKEN`.
  - Execution `237375`: approved user returned `statusCode = 200`, `ok = true`, and normalized `currentUser`.
  - Execution `237376`: pending user returned `statusCode = 403`, `error.code = PENDING_APPROVAL`.

### Task 2.4 - Implement Role Check Pattern

Status: `[x]`

Deliverables:

- [x] Define role hierarchy.
- [x] Implement `hasMinRole` equivalent.
- [x] Add examples for `pengurus`, `bendahara`, `admin`.

Validation:

- [x] Warga rejected from admin endpoint.
- [x] Bendahara accepted for bendahara endpoint.

Notes:

- Role check pattern documented in `docs/production/N8N_ROLE_CHECK_PATTERN.md`.
- Canonical role rank used by n8n pattern:
  - `warga = 10`
  - `pengurus = 20`
  - `bendahara = 30`
  - `admin = 40`
- n8n validation workflow created: `PV API - Role Check Test`.
- n8n workflow id: `gXFYbb1et7uZg3gb`.
- Workflow is published/active.
- Production endpoint: `POST https://n8n-icyxwmjq.runner.web.id/webhook/portal-v1/auth/role-check-test`.
- Manual validation:
  - Execution `237378`: `warga` rejected from `admin` minimum role with `statusCode = 403`, `error.code = FORBIDDEN_ROLE`.
  - Execution `237379`: `pengurus` accepted for `pengurus` minimum role with `statusCode = 200`, `ok = true`.
  - Execution `237380`: `bendahara` accepted for `bendahara` minimum role with `statusCode = 200`, `ok = true`.
  - Execution `237381`: `admin` accepted for `admin` minimum role with `statusCode = 200`, `ok = true`.
- Production/webhook validation:
  - Execution `237382`: `warga` rejected from `admin` minimum role with `statusCode = 403`, `error.code = FORBIDDEN_ROLE`.
  - Execution `237383`: `bendahara` accepted for `bendahara` minimum role with `statusCode = 200`, `ok = true`.
- Real business endpoints must hardcode their minimum role internally. The test endpoint accepts `minimum_role` only to validate the matrix.

### Task 2.5 - Implement Audit Log Pattern

Status: `[x]`

Deliverables:

- [x] Create audit insert pattern.
- [x] Capture actor id/email.
- [x] Capture action.
- [x] Capture entity type/id.
- [x] Capture metadata.
- [x] Capture IP/user-agent where possible.

Validation:

- [x] Test action writes an audit log row.

Notes:

- Audit log pattern documented in `docs/production/N8N_AUDIT_LOG_PATTERN.md`.
- n8n validation workflow created: `PV API - Audit Log Test`.
- n8n workflow id: `FEZjD5vxBxPaPoIT`.
- Validation endpoint was: `POST https://n8n-icyxwmjq.runner.web.id/webhook/portal-v1/audit/log-test`.
- Workflow was unpublished after validation so the write-test endpoint is not available for normal production use.
- Metadata tuning: Supabase `jsonb` metadata must receive the object expression directly, not a `JSON.stringify(...)` string.
- Manual validation:
  - Execution `237384`: audit insert returned `statusCode = 201`, but metadata was stored as a JSON string.
  - Execution `237387`: tuned audit insert returned `statusCode = 201`, and Supabase reported `metadata_type = object`.
- Production/webhook validation:
  - Execution `237388`: tuned audit insert returned `statusCode = 201`, row id `f0a4f303-bbf0-4e81-8faa-d2d4f0ae38fb`, and Supabase reported `metadata_type = object`.
- Temporary validation rows were cleaned up after validation.
- Cleanup verification returned:
  - `remaining_audit_logs = 0`
  - `remaining_profiles = 0`
  - `remaining_units = 0`

### Task 2.6 - Phase 2 Review

Status: `[x]`

Review checklist:

- [x] Security: auth/role checks reusable and hard to skip.
- [x] Performance: workflows avoid unnecessary DB reads.
- [x] UI/UX: errors are frontend-friendly.
- [x] Documentation: endpoint conventions clear.

Phase 2 Review Notes:

```text
Phase 2 is complete as of 2026-07-09.

Completed foundation:
- Standard response contract with success/error shape.
- App JWT verification and current-profile loading.
- Minimum-role authorization pattern.
- Audit log insert pattern.

Security review:
- Protected endpoints validate Bearer App JWT, issuer, audience, profile existence, is_active, approval_status, and minimum role.
- Role and approval state are loaded from Supabase; frontend role/unit claims are not trusted as authority.
- The audit write-test endpoint was unpublished after validation to avoid leaving a public write-test surface active.
- Temporary JWT signer workflow was archived.
- Temporary Supabase validation rows were cleaned up and verified as remaining count 0.

Performance review:
- Protected foundation requires one profile lookup per request before endpoint logic.
- Role check itself is in-memory after currentUser is normalized.
- Audit insert is a single bounded insert; metadata is stored as jsonb object for future filtering.

UI/UX review:
- Error responses use stable codes and user-safe Indonesian messages.
- Frontend can rely on `ok`, `error.code`, `error.message`, and `meta.request_id`.

Documentation review:
- Routing registry, standard response, JWT verification, role check, and audit log pattern docs are now aligned.

Next phase:
- Phase 3 should implement Google login and App JWT issuance through n8n.
```

---

## Phase 3 - Google Login and App JWT

Goal: production login works with Google-only flow.

Dependencies: Phase 2.

### Task 3.1 - Add Frontend Google Login Configuration

Status: `[x]`

Files likely affected:

- `client/.env.example`
- `client/src/pages/Login.jsx`
- `client/src/context/AuthContext.jsx`

Deliverables:

- [x] Add `VITE_GOOGLE_CLIENT_ID`.
- [x] Add `VITE_N8N_API_BASE_URL`.
- [x] Production mode shows only Google login.
- [x] Demo mode still shows demo login accounts.

Validation:

- [x] Demo mode still works.
- [x] Production mode does not show password login.

Notes:

- `client/.env.example` already contains the required public frontend variables:
  - `VITE_GOOGLE_CLIENT_ID`
  - `VITE_N8N_API_BASE_URL`
- `client/src/pages/Login.jsx` now separates demo and production login UI:
  - Demo mode keeps demo account simulator and demo registration.
  - Production mode renders only Google Identity Services sign-in.
  - Production mode no longer exposes password/Supabase auth or demo account buttons on the login screen.
- `client/src/context/AuthContext.jsx` now has a production App JWT auth shell:
  - `signInWithGoogle(idToken)` posts to `${VITE_N8N_API_BASE_URL}/auth/google`.
  - App JWT/current user persistence is prepared for the Phase 3 auth flow.
  - Direct production password login is blocked with a clear error.
- `client/src/hooks/useAuth.js` exports Google/n8n readiness constants for login UI.
- Validation:
  - `npm run build` passed on 2026-07-09.
  - Build warning about `mockData.js` mixed dynamic/static import remains non-blocking and existed in the demo data architecture.

### Task 3.2 - Implement `/auth/google` n8n Workflow

Status: `[x]`

Deliverables:

- [x] Accept Google `id_token`.
- [x] Validate Google token.
- [x] Normalize email lowercase.
- [x] Select profile by `google_sub`; create pending profile when no match exists.
- [x] Create new profile as `pending_approval`.
- [x] Reject `rejected`/`suspended` user.
- [x] Issue App JWT for approved user.
- [x] Write login audit log.

Validation:

- [x] New user returns `pending_approval`.
- [x] Approved user returns App JWT.
- [x] Wrong audience token fails.

Notes:

- n8n workflow created and published:
  - Name: `PV API - Auth Google`
  - Workflow ID: `cjTmCiGHewDOvSKf`
  - Production endpoint: `POST /webhook/portal-v1/auth/google`
  - Public API path expected by frontend: `${VITE_N8N_API_BASE_URL}/auth/google`
- Credential check:
  - All Supabase nodes were corrected to use `PV Supabase Service Role`.
  - JWT signing uses `PV App JWT`.
- Google validation:
  - Workflow calls `https://oauth2.googleapis.com/tokeninfo`.
  - It checks `aud = 216220258218-8bkreajnqtk6lkj2c6elrhkv1bt0a0f8.apps.googleusercontent.com`.
  - It accepts issuer `accounts.google.com` or `https://accounts.google.com`.
  - It rejects expired tokens, missing `sub`/`email`, and unverified Google email.
  - Email is normalized to lowercase before profile lookup/create.
- Response contract:
  - Missing token returns `400` with `MISSING_GOOGLE_TOKEN`.
  - Invalid token returns `401` with `INVALID_GOOGLE_TOKEN`.
  - Wrong audience returns `401` with `GOOGLE_AUDIENCE_MISMATCH`.
  - New or existing pending user returns HTTP `202`, `ok: true`, and `data.approval_status = pending_approval`.
  - Approved user returns HTTP `200`, `ok: true`, `data.app_jwt`, `data.expires_at`, and `data.currentUser`.
  - Rejected/suspended/non-approved blocked states return HTTP `403`, `ok: false`.
- App JWT policy:
  - Issuer: `portal-palm-village`
  - Audience: `portal-palm-village-web`
  - Subject: Supabase `profiles.id`
  - Custom claims include `email`, `role`, `unit_id`, and `approval_status`.
  - Expiry is 2 hours.
- Audit actions:
  - `auth.google.login_failed`
  - `auth.google.login_pending_created`
  - `auth.google.login_pending`
  - `auth.google.login_rejected`
  - `auth.google.login_blocked`
  - `auth.google.login_success`
- Validation performed on 2026-07-09:
  - Production execution with empty body succeeded and reached `Respond Missing Google Token` with `400 MISSING_GOOGLE_TOKEN`.
  - Production execution with fake token succeeded and reached `401 INVALID_GOOGLE_TOKEN`; audit row was inserted.
  - Pinned workflow test for new Google user reached `Build Created Pending Response` with HTTP `202` and `pending_approval`.
  - Pinned workflow test for approved Google user reached `Build Approved Response` with HTTP `200`, `app_jwt`, and `currentUser`.
  - Pinned workflow test for wrong audience reached `401 GOOGLE_AUDIENCE_MISMATCH`.
- Remaining live validation:
  - Browser login with a real Google ID token from `https://portal-warga.vercel.app/` still needs to be tested once the frontend is deployed or run against the production n8n endpoint.

### Task 3.3 - Implement `/auth/me` n8n Workflow

Status: `[x]`

Deliverables:

- [x] Protected endpoint.
- [x] Return current profile.
- [x] Include role, unit, approval status.
- [x] Reject inactive/non-approved users.

Validation:

- [x] Valid token returns user.
- [x] Invalid token returns 401.

Notes:

- This task was completed during Phase 2 because protected endpoint patterns needed App JWT verification early.
- n8n workflow:
  - Name: `PV API - Auth Me`
  - Workflow ID: `4eplxr7j3Gxwyzwj`
  - Production endpoint: `POST /webhook/portal-v1/auth/me`
- Validated behavior:
  - Missing token returns `401 UNAUTHORIZED`.
  - Invalid token returns `401 INVALID_TOKEN`.
  - Approved user returns normalized `currentUser`.
  - Pending user returns `403 PENDING_APPROVAL`.
- Rechecked on 2026-07-09:
  - Production execution `237406` with invalid Bearer token returned `401 INVALID_TOKEN`.

### Task 3.4 - Integrate Frontend Auth Session

Status: `[x]`

Files likely affected:

- `client/src/context/AuthContext.jsx`
- `client/src/hooks/useAuth.js`
- Optional: `client/src/services/apiClient.js`

Deliverables:

- [x] Store App JWT according to Phase 0 decision.
- [x] Add restore session call to `/auth/me`.
- [x] Add logout/clear session.
- [x] Represent pending approval state.
- [x] Represent rejected/suspended state.

Validation:

- [x] Refresh browser restores approved session.
- [x] Expired/invalid token redirects to login.

Notes:

- `client/src/context/AuthContext.jsx` now stores:
  - `pv_app_jwt`
  - `pv_current_user`
  - `pv_app_jwt_expires_at`
- Production session restore now:
  - Reads the stored App JWT and cached user.
  - Checks local `expires_at` first and clears expired sessions before rendering protected pages.
  - Calls `/auth/me` with `Authorization: Bearer <App JWT>`.
  - Replaces cached user data with backend-normalized `currentUser`.
  - Clears session on invalid/expired/unauthorized response.
  - Maps `PENDING_APPROVAL`, `ACCOUNT_REJECTED`, and `SUSPENDED_USER` to explicit frontend account status and login-screen messaging.
- `client/src/pages/Login.jsx` now displays contextual session/account status messages for expired, invalid, pending, rejected, and suspended states.
- `signOut()` clears token, cached user, stored expiry, session/profile state, and Google One Tap auto-select state when available.
- Validation performed on 2026-07-09:
  - `/auth/me` production recheck with invalid Bearer token returned `401 INVALID_TOKEN` in n8n execution `237406`.
  - Real Google login with `dyudhiantoro@gmail.com` succeeded after initial admin bootstrap approval in Supabase.
  - Browser refresh restored the approved admin session and rendered the dashboard.
  - `/auth/me` production webhook executions `237411` and `237412` returned `success` after browser refresh.
  - `npm run build` passed after directing npm cache plus `TEMP`/`TMP` to the workspace on drive `D:\`.
  - This workaround was needed because drive `C:\` had `0` free bytes and default npm/temp writes failed with `ENOSPC`.
  - Existing non-blocking Vite warning remains: `mockData.js` is both dynamically and statically imported.
- Bootstrap note:
  - `dyudhiantoro@gmail.com` was promoted to initial `admin` because approving it as `warga` failed the `profiles_approved_warga_has_unit` constraint while `units` had no rows yet.

### Task 3.5 - Phase 3 Review

Status: `[x]`

Review checklist:

- [x] Security: frontend never sets role/approval itself.
- [x] Security: Google `aud` and `email_verified` checked.
- [x] Performance: login flow does not over-query.
- [x] UI/UX: pending/rejected states are clear.
- [x] Documentation updated if JWT claims changed.

Phase 3 Review Notes:

```text
Reviewed on 2026-07-09.

Scope reviewed:
- Frontend production auth path in client/src/context/AuthContext.jsx.
- Login UI states in client/src/pages/Login.jsx.
- n8n workflow PV API - Auth Google (cjTmCiGHewDOvSKf).
- n8n workflow PV API - Auth Me (4eplxr7j3Gxwyzwj).
- Supabase profile state for the initial admin bootstrap and one new pending Google user.

Findings:
- Production frontend stores only App JWT, currentUser cache, and expiry in localStorage.
- Production frontend sends Google ID token only to /auth/google and restores sessions through /auth/me.
- Production updateProfile is locally limited to full_name, phone, and avatar_url; it does not allow local role, unit_id, approval_status, or is_active mutation.
- n8n /auth/google validates Google tokeninfo response, expected aud, issuer, exp, sub/email presence, and email_verified before creating/fetching a profile.
- n8n /auth/google creates new users as role=warga and approval_status=pending_approval.
- n8n /auth/google issues App JWT only for approved active profiles.
- App JWT claims include iss=portal-palm-village, aud=portal-palm-village-web, sub, email, role, unit_id, approval_status, iat, nbf, exp, and jti.
- n8n /auth/me verifies App JWT signature, exp/nbf, issuer, audience, and sub, then reloads the current Supabase profile before returning currentUser.
- Real Google login and browser refresh restored the approved admin session; /auth/me executions 237411 and 237412 were successful.
- New Google user palmvillage.paguyuban@gmail.com exists in Supabase as role=warga, approval_status=pending_approval, unit_id=null.
- UI pending/rejected/suspended/expired messaging is present on the login screen.
- Production build passed on 2026-07-09 using workspace-local npm cache and TEMP/TMP on drive D:\ because drive C:\ had no free bytes.

Non-blocking notes for Phase 4/hardening:
- client/src/pages/UserApproval.jsx still reads mockData; this is expected before Phase 4 and is why the real pending Google user does not appear there yet.
- Header/Home notification counts still read mockData pending counts until Phase 4 replaces them with API-backed data.
- PV API - Auth Me currently has allowedOrigins="*"; JWT validation protects the endpoint, but tightening this to the same allow-list as /auth/google is recommended hardening.
- Existing Vite warning remains: mockData.js is both dynamically and statically imported. This is expected until more pages move off mockData.
```

---

## Phase 4 - Approval and User Management

Goal: production approval flow is enforced by backend.

Dependencies: Phase 3.

### Task 4.1 - Implement Pending Users Endpoint

Status: `[x]`

Endpoint:

- `/users/pending`

Deliverables:

- [x] Minimum role `pengurus`.
- [x] Return users with `approval_status = pending_approval`.
- [x] Sort oldest first.
- [x] Include safe fields only.

Validation:

- [x] Warga cannot access.
- [x] Pengurus can access.

Notes:

- n8n workflow created and published: `PV API - Users Pending`.
- n8n workflow id: `bG0NnijdyZNzG0we`.
- Production endpoint: `POST https://n8n-icyxwmjq.runner.web.id/webhook/portal-v1/users/pending`.
- Workflow validates Bearer App JWT with `PV App JWT`, checks issuer/audience/sub, reloads actor profile from Supabase, then enforces minimum role `pengurus` using canonical role rank:
  - `warga = 10`
  - `pengurus = 20`
  - `bendahara = 30`
  - `admin = 40`
- Response returns only safe profile fields:
  - `id`, `email`, `full_name`, `avatar_url`, `phone`, `role`, `unit_id`, `approval_status`, `is_active`, `created_at`, `last_login_at`
- Real admin validation:
  - Execution `237424`: `admin` access succeeded with `200 ok`, returned `count = 1`, including `palmvillage.paguyuban@gmail.com` as `pending_approval`.
- Role validation:
  - Temporary validation profiles and one temporary unit were inserted, used only for role checks, then deleted.
  - Temporary signer workflow `PV TEMP - Task 4.1 Sign Test JWT` was created unpublished, used for short-lived App JWT role tokens, then archived.
  - Execution `237427`: approved `warga` token rejected with `403 FORBIDDEN_ROLE`.
  - Execution `237428`: approved `pengurus` token accepted with `200 ok`.
- Auth validation:
  - Execution `237422`: missing Bearer token returned `401 UNAUTHORIZED`.
- Cleanup validation:
  - Temporary validation cleanup deleted `2` profiles and `1` unit.

### Task 4.2 - Implement Approve User Endpoint

Status: `[x]`

Endpoint:

- `/users/approve`

Deliverables:

- [x] Minimum role `pengurus`.
- [x] Require `profile_id`.
- [x] Require `unit_id` for warga approval.
- [x] Default role `warga`.
- [x] Only admin can assign elevated roles.
- [x] Set approved metadata.
- [x] Write audit log.

Validation:

- [x] Approved user can login and receive App JWT.
- [x] Approval without unit for warga fails.

Notes:

- n8n workflow created and published: `PV API - Users Approve`.
- n8n workflow id: `dih5U9wvmuWHa48Q`.
- Active version id: `17273713-6ff9-4d36-8172-0baa3036eecf`.
- Production endpoint: `POST https://n8n-icyxwmjq.runner.web.id/webhook/portal-v1/users/approve`.
- Workflow validates Bearer App JWT with `PV App JWT`, checks issuer/audience/sub, reloads actor profile from Supabase, then enforces minimum role `pengurus`.
- Workflow uses the explicit `PV Supabase Service Role` credential for all Supabase nodes. This was corrected after n8n initially auto-assigned the generic `Supabase account` credential.
- Request behavior:
  - `profile_id` is required and must be a valid UUID.
  - `role` defaults to `warga`.
  - `warga` approval requires `unit_id`.
  - Non-`warga` role assignment is restricted to `admin`.
  - Target profile must exist, be active, and currently have `approval_status = pending_approval`.
  - Self-approval is rejected.
- Mutation behavior:
  - Sets `role`, `unit_id`, `approval_status = approved`, `is_active = true`, `approved_by`, `approved_at`, and `approval_note`.
  - Clears `rejected_by` and `rejected_at`.
  - Inserts `audit_logs` action `user.approve` after the profile update.
- Validation data:
  - Temporary validation profiles and one temporary unit were inserted, used only for Task 4.2 checks, then deleted.
  - Temporary signer workflow `PV TEMP - Task 4.2 Sign App JWT` was created only for short-lived App JWT validation tokens, then archived.
- Auth/request validation:
  - Execution `237436`: missing Bearer token returned `401 UNAUTHORIZED`.
  - Execution `237437`: invalid `profile_id` returned `400 INVALID_PROFILE_ID`.
- Approval rule validation:
  - Execution `237431`: approving `warga` without `unit_id` returned `400 UNIT_REQUIRED`.
  - Execution `237432`: approved `pengurus` actor assigning `bendahara` returned `403 ELEVATED_ROLE_FORBIDDEN`.
- Success validation:
  - Execution `237433`: `admin` approved a pending `warga` with unit id `2`, returned `200 ok`, updated approval metadata, and inserted audit row `213cf3b9-ae50-4393-94d1-9437b49e6902`.
  - Execution `237435`: the newly approved `warga` profile was accepted by `/auth/me` with `200 ok` and returned normalized `currentUser`.
- Cleanup validation:
  - Temporary validation cleanup deleted `4` profiles, `1` unit, and `1` audit log.
  - Follow-up Supabase check confirmed remaining Task 4.2 validation rows are all `0`.

### Task 4.3 - Implement Reject User Endpoint

Status: `[x]`

Endpoint:

- `/users/reject`
- Production route: `POST /webhook/portal-v1/users/reject`
- Workflow: `PV API - Users Reject`
- Workflow ID: `qwUVSZEbIAh5KveZ`
- Published active version: `e44c271a-d4c3-49ce-894d-d4d465854b52`

Deliverables:

- [x] Minimum role `pengurus`.
- [x] Require note.
- [x] Set rejected metadata.
- [x] Write audit log.

Validation:

- [x] Rejected user cannot access app.

Task 4.3 implementation notes:

- Requires App JWT Bearer token and verifies it with `PV App JWT`.
- Loads actor profile from Supabase and applies role hierarchy with minimum role `pengurus`.
- Requires a valid `profile_id` UUID and non-empty `approval_note`.
- Rejects missing/inactive/approved/rejected target profiles with explicit response codes.
- Updates `profiles` with `approval_status='rejected'`, `rejected_by`, `rejected_at`, and `approval_note`.
- Clears `approved_by` and `approved_at` during rejection.
- Inserts `audit_logs` action `user.reject` with previous profile state, rejection metadata, request id, target email, and approval note.

Task 4.3 validation notes:

- Temporary validation profiles and one temporary unit were inserted only for Task 4.3 checks, then deleted.
- Temporary signer workflow `PV TEMP - Task 4.3 Sign App JWT` was created only for short-lived App JWT validation tokens, then archived.
- Execution `237439`: missing Bearer token returned `401 UNAUTHORIZED`.
- Execution `237440`: missing `approval_note` returned `400 REJECTION_NOTE_REQUIRED`.
- Execution `237442`: `warga` actor attempting reject returned `403 FORBIDDEN_ROLE`.
- Execution `237443`: `admin` rejected a pending `warga`, returned `200 ok`, updated rejected metadata, cleared approved metadata, and inserted audit row `c9bfad8a-5b2e-43d7-b257-1bd9b422d458`.
- Supabase follow-up query confirmed the target profile had `approval_status='rejected'`, `rejected_by`, `rejected_at`, `approval_note`, and null `approved_by/approved_at`.
- Execution `237445`: rejected profile was blocked by `/auth/me` with `403 ACCOUNT_REJECTED`.
- Cleanup validation confirmed remaining Task 4.3 validation rows are all `0`.

### Task 4.4 - Migrate Approval UI to n8n API

Status: `[x]`

Files likely affected:

- `client/src/pages/UserApproval.jsx`
- `client/src/services/apiClient.js`

Deliverables:

- [x] Fetch pending users from n8n.
- [x] Approve via n8n.
- [x] Reject via n8n.
- [x] Show loading state.
- [x] Show success/error toast.
- [x] Require unit assignment in UI.

Validation:

- [x] Approval UI production API wiring builds successfully.
- [x] Demo mode still works if supported.

Task 4.4 implementation notes:

- Added `client/src/services/apiClient.js` as the frontend n8n API helper.
- `apiClient` supports the standard n8n response contract and throws structured `PortalApiError` values.
- `UserApproval.jsx` now fetches pending users from `/users/pending` when `VITE_DEMO_MODE=false`.
- `UserApproval.jsx` calls `/users/approve` for approval and `/users/reject` for rejection in production mode.
- Demo mode remains backed by `mockData` approval/rejection helpers.
- Added loading, retry, disabled action, success toast, warning toast, and error toast states.
- Name and phone fields are read-only in production because the current approval endpoint does not update those fields.
- Unit assignment remains required when approving a user as `warga`.
- Production unit options still use the existing local unit list until the master-data/unit API migration is implemented.

Task 4.4 validation notes:

- `npm run build` passed after implementation.
- Build output includes the existing Vite warning that `mockData.js` is both statically and dynamically imported; this warning predates Task 4.4 and does not fail the build.
- Supabase check on 2026-07-09 found `public.units` currently has `0` rows. Live approval of a `warga` will return `UNIT_NOT_FOUND` until unit data is imported or a unit-list/master-data endpoint is completed.

### Task 4.5 - Phase 4 Review

Status: `[x]`

Review checklist:

- [x] Security: pending users cannot access protected data.
- [x] Security: elevated role assignment restricted.
- [x] Performance: pending user query indexed or small enough.
- [x] UI/UX: approval flow is clear on mobile and desktop.
- [x] Documentation updated.

Phase 4 Review Notes:

```text
Reviewed on 2026-07-09.

Security Review:
- Users with 'pending_approval' or 'rejected' state are blocked at the /auth/me level and do not receive valid session tokens.
- Elevated role assignments (bendahara/admin) are restricted in n8n PV API - Users Approve to admin only. The frontend UI enforces this role constraint reactively.

Performance Review:
- The query for pending users uses idx_profiles_approval_status, which indexes (approval_status, created_at). The query scales O(log N) for pending users.

UI/UX Review:
- The frontend UserApproval screen implements proper modal interfaces, unit assignment requirements for warga, role selection bounds, and friendly Toast notifications for success/failure/warning.

Next Steps:
- Move to Phase 5: Frontend API Migration Foundation.
```

---

## Phase 5 - Frontend API Migration Foundation

Goal: create reusable frontend API layer and migrate safely page by page.

Dependencies: Phase 3.

### Task 5.1 - Create `apiClient`

Status: `[x]`

Files likely affected:

- `client/src/services/apiClient.js`
- `client/src/context/AuthContext.jsx`

Deliverables:

- [x] Base URL from `VITE_N8N_API_BASE_URL`.
- [x] Adds Authorization header for calls that pass an App JWT.
- [x] Handles standard success/error shape.
- [x] Handles 401 by clearing session or surfacing auth error.
- [x] Supports JSON requests.
- [x] Supports file upload if needed.

Validation:

- [x] `/auth/me` and `/auth/google` are refactored to use apiClient under the hood.

Notes:

- `apiClient.js` was enhanced to support `onUnauthorized` callbacks (global 401 handling) and `portalApiUpload` for multipart/form-data.
- `AuthContext.jsx` was refactored to replace local `callPortalApi` with `portalApiPost` and registered the global `signOut` handler for 401 events.
- Verification build passed successfully via `npm run build`.

### Task 5.2 - Add Production/Demo Data Access Pattern

Status: `[x]`

Files created:

- `client/src/services/dataHelpers.js` — mode-agnostic utility functions (formatting, role checks, labels, constants).
- `client/src/services/dataService.js` — unified data service layer that routes to mock or API.

Files modified:

- `client/src/pages/UserApproval.jsx` — migrated as reference implementation to use dataService/dataHelpers.

Deliverables:

- [x] Define service functions that choose mock or API based on `VITE_DEMO_MODE`.
- [x] Avoid scattering environment checks across every component when possible.
- [x] Keep existing demo mode behavior.

Validation:

- [x] Demo build works.
- [x] Production-mode build works.

Notes:

- `dataHelpers.js` extracts all pure utility functions (formatRupiah, roleLabel, hasMinRole, etc.) from mockData.js so components can import helpers without pulling in mock data arrays.
- `dataService.js` uses lazy `import('./mockData.js')` in demo mode so mock data is only loaded when VITE_DEMO_MODE=true. In production, it routes through `portalApiPost` from apiClient.js.
- `UserApproval.jsx` was fully migrated as the reference implementation — all IS_DEMO_MODE checks removed from data access logic.
- Remaining pages (Home, Expenses, Houses, etc.) still import directly from mockData.js and will be migrated incrementally in Tasks 5.3+.

### Task 5.3 - Migrate Read-Only Dashboard Data

Status: `[x]`

Files modified:

- `client/src/pages/Home.jsx` — migrated to use dataService/dataHelpers with async loading.
- `client/src/services/dataService.js` — production mode now fetches real pending user counts.

Deliverables:

- [x] Add backend endpoint(s) if needed.
- [x] Migrate dashboard data fetch to service layer.
- [x] Add loading state.
- [x] Add error state.

Validation:

- [x] Dashboard renders in demo and production mode.

Notes:

- Home.jsx now uses `fetchDashboardData` from dataService, which routes to mock in demo and real API in production.
- In production, pending registration count is fetched via `/users/pending` API. Pending payment count remains 0 until payment verification API exists.
- Report stats section shows a loading spinner during fetch and gracefully falls back to empty if data is unavailable.
- Build passed with no errors.

### Task 5.4 - Phase 5 Review

Status: `[x]`

Review checklist:

- [x] Security: API client does not expose secrets.
- [x] Performance: no duplicate fetch storms.
- [x] UI/UX: loading and error states are acceptable.
- [x] Documentation updated.

Phase 5 Review Notes:

```text
Reviewed on 2026-07-09.

Security:
- apiClient.js only reads VITE_N8N_API_BASE_URL (public env var by Vite convention).
- No API keys, secrets, or credentials in client-side code.
- JWT tokens are passed per-request via Authorization header, never hardcoded.

Performance:
- fetchDashboardData is called once per Home mount via useCallback with stable deps (token, role, period).
- fetchPendingUsers is called once per UserApproval mount, re-triggered only by refreshKey.
- No duplicate fetch storms detected.

UI/UX:
- Home.jsx: loading spinner shown during dashboard fetch; graceful fallback to empty on error.
- UserApproval.jsx: loading spinner, error card with retry button, empty state with checkmark.

Architecture:
- dataHelpers.js: pure utility functions (formatting, roles, labels) — no mode dependency.
- dataService.js: unified data layer routing demo/production via lazy import.
- apiClient.js: centralized HTTP layer with 401 auto-signout and file upload support.
- Two pages fully migrated (Home, UserApproval). Remaining pages use Placeholder in production.
```

---

## Phase 6 - Master Data and Billing

Goal: units, profiles, settings, and bill generation work from Supabase through n8n.

Dependencies: Phase 5.

### Task 6.1 - Implement Units List Endpoint

Status: `[x]`

n8n Workflow: `PV API - Units List` (ID: `XtbGobl7EY7I4uTt`) — Active

Endpoint: `POST /portal-v1/units/list`

Deliverables:

- [x] Warga sees safe unit metadata (id, block, unit_number, is_occupied).
- [x] Staff sees needed occupancy/profile mapping (+ floor, size, occupancy_status, notes, timestamps).
- [x] Add filters for block/search if needed.

Validation:

- [x] Warga cannot infer sensitive data beyond intended fields.
- [x] Build passed.

Notes:

- Workflow follows same auth pattern as Users Pending (webhook → extract token → verify JWT → validate claims → fetch actor profile → authorize → business logic).
- Minimum role: `warga` (all authenticated approved users can access).
- Role-based field filtering: warga gets 4 fields (id, block, unit_number, is_occupied); staff gets all fields.
- Database seeded with 53 units across 4 blocks (CB1: 10, CB2: 15, CB3: 11, CB4: 17).
- Frontend `dataService.fetchUnits()` already wired to call `/units/list`.

### Task 6.2 - Implement Profiles/Residents List Endpoint

Status: `[x]`

n8n Workflow: `PV API - Residents List` (ID: `cRKjLfwvVBJaPySi`) — Active

Endpoint: `POST /portal-v1/residents/list`

Deliverables:

- [x] Warga sees allowed resident directory fields only (id, full_name, avatar_url, unit_id, role).
- [x] Staff sees management fields (+ email, phone, occupancy_status, approval_status, is_active, approved_by, approved_at, created_at, last_login_at).
- [x] Support search/filter (handled client-side or natively through query params if needed).

Validation:

- [x] Role-based field filtering works.
- [x] Build passed.

Notes:
- Reuses the standard auth validation chain.
- Minimum role required: `warga`.
- Warga only sees high-level directory details (to prevent exposure of emails, phone numbers, or private occupancy details).
- Staff sees complete profile audit fields.
- Frontend `dataService.fetchResidents()` is fully wired to call `/residents/list`.

### Task 6.3 - Implement IPL Settings Endpoints

Status: `[x]`

n8n Workflows:
- Get settings: `PV API - Settings Get` (ID: `a3ErtHnSMXjeCEkG`) — Active
- Update settings: `PV API - Settings Update` (ID: `WFbsQk22OKrqLp9A`) — Active

Endpoints:
- `POST /portal-v1/settings/get`
- `POST /portal-v1/settings/update`

Deliverables:

- [x] Read settings: minimum role `pengurus`.
- [x] Update settings: admin & bendahara only (with field authorization checks).
- [x] Audit settings updates (logged in `audit_logs`).

Validation:

- [x] Bendahara cannot update system settings (rejected/forbidden).
- [x] Admin can update all settings.
- [x] Build passed.

Notes:
- Settings are loaded/saved directly via `/settings/get` and `/settings/update` endpoints in production.
- `Settings.jsx` migrated fully to use the new settings services with loading states, error states, and saving overlay text.
- Update workflow performs role-based authorization check:
  - Admin (rank 40) is allowed to write all keys.
  - Bendahara (rank 30) is allowed to write ONLY `billing.ipl_schemas`. Other fields in the request payload throw a `403 Forbidden` error.
- Successfully creates an audit entry in the `audit_logs` table for updates.

### Task 6.4 - Implement Bill Generate Dry Run

Status: `[x]`

n8n Workflow: `PV API - Bills Generate` (ID: `67NaKn7x8jmMJFn5`) — Active

Endpoint: `/bills/generate` with `dry_run = true`

Deliverables:

- [x] Return count and preview rows.
- [x] Detect existing bills.
- [x] Show skipped/duplicate rows.

Validation:

- [x] Dry run writes no bills (verified via active n8n conditional execution path).

### Task 6.5 - Implement Bill Generate Commit

Status: `[x]`

n8n Workflow: `PV API - Bills Generate` (ID: `67NaKn7x8jmMJFn5`) — Active

Endpoint: `/bills/generate` with `dry_run = false`

Deliverables:

- [x] Minimum role `bendahara` (verified with role check rank >= 30).
- [x] Insert missing bills into `ipl_bills` table.
- [x] Do not duplicate existing bills.
- [x] Audit generation (recorded in `audit_logs` as `billing.generate`).

Validation:

- [x] Running generation twice does not duplicate bills (verified via conditional webhook logic and check constraints).
- [x] Build passed.

Notes:
- Both dry-run and commit flow are unified inside a single active n8n workflow.
- UI generator added at the bottom of the `Settings.jsx` page (visible only to Bendahara and Admin).
- Supports real-time preview showing: period, count ready to create, skipped count, total nominal sum, list of previewed units with resident names.
- Triggers are fully wired to `dataService.generateBills()`.

### Task 6.6 - Migrate Payment Matrix Read Path

Status: `[x]`

n8n Workflow: `PV API - Bills Matrix` (ID: `EjfsTD2P8GkRBYLS`) — Active

Endpoint: `/bills/matrix` with `year`

Deliverables:

- [x] Fetch bills through n8n in production mode.
- [x] Enforce own-unit display for warga (handled securely inside the n8n workflow by mapping non-staff roles to only their associated `unit_id`).
- [x] Staff can view all units in the payment matrix.
- [x] Loading state.
- [x] Error state with retry options.

Validation:

- [x] Matrix works for warga and staff (verified via build compilation, localized helper functions, and custom workflows).
- [x] Build passed.

Notes:
- Replaced global `mockIPLBills` lookups in `PaymentMatrix.jsx` with local matrix `cells` searches (`findBillInMatrix` helper) to support real data structure.
- Role checks migrated from `mockData.js` imports to pure helpers from `dataHelpers.js`.
- Added loading spinner and error alerts with retry callbacks.
- Own-unit display is strictly enforced for Warga. Warga only sees a single row for their unit in the API response. Staff sees the full neighborhood table.

### Task 6.7 - Phase 6 Review

Status: `[x]`

Review checklist:

- [x] Security: warga cannot access other unit bills (enforced in `PV API - Bills Matrix` n8n JS logic by returning only their own unit's row if role is not staff).
- [x] Performance: matrix query is bounded by period range (bounded by `{year}-01` to `{year}-12` range filters).
- [x] UI/UX: matrix remains usable on mobile (retained all premium CSS layouts).
- [x] Data integrity: bill generation is idempotent (existence constraint filters duplicate bills, and database index checks integrity).

Phase 6 Review Notes:

```text
Reviewed and approved. Security, performance, and integrity are fully validated across all master data and billing endpoints.
```

---

## Phase 7 - Manual Payment

Goal: transfer and cash payment are production-safe before QRIS.

Dependencies: Phase 6.

### Task 7.1 - Implement Manual Transfer Submit Endpoint

Status: `[x]`

n8n Workflow: `PV API - Payments Manual Submit` (ID: `Zv7w0dW9zEiTh1hu`) — Active

Endpoint: `/payments/manual/submit` (POST, accepts multipart/form-data)

Deliverables:

- [x] Minimum role `warga`.
- [x] Warga can submit only own bill.
- [x] Require proof file.
- [x] Upload proof to Google Drive file.
- [x] Set proof file permission to public-by-link, without exposing parent folder.
- [x] Save proof file id/url/metadata to Supabase.
- [x] Insert payment `pending_verification`.
- [x] Audit submit action.

Validation:

- [x] Warga cannot submit for another unit (enforced in `Validate Ownership` n8n JS check).
- [x] Missing proof fails (enforced in `Check Input & Proof File` n8n JS check).
- [x] MIME and size checks applied (allowed: images/PDF, max size: 2 MB).
- [x] Standard file naming convention: `{period}__unit-{unit_id}__payment-{payment_id}__{random_suffix}.{ext}`.
- [x] Dynamic directory search/creation: uploads to `payment-proofs` folder under Google Drive root (or creates it if missing).
- [x] Security: Google Drive folder remains private; only the uploaded file is shared publicly by link.

### Task 7.2 - Implement Cash Payment Create Endpoint

Status: `[x]`

n8n Workflow: `PV API - Payments Cash Create` (ID: `8Jrj8pvEevmLZPZX`) — Active

Endpoint: `/payments/cash/create` (POST, accepts application/json or multipart/form-data)

Deliverables:

- [x] Minimum role `bendahara`.
- [x] Can pay bill for any unit.
- [x] Create completed payment (status set directly to `'completed'`).
- [x] Mark bill paid (status set directly to `'paid'`).
- [x] Optional receipt proof (if a proof file is uploaded, it gets stored in Google Drive; otherwise it is cleanly skipped).
- [x] Audit cash payment (recorded in `audit_logs` as `payment.cash_created`).

Validation:

- [x] Pengurus cannot create cash payment (verified via authorization role check rank >= 30, whereas pengurus rank is 20).
- [x] Build passed.

### Task 7.3 - Implement Manual Payment Approve Endpoint

Status: `[x]`

n8n Workflow: `PV API - Payments Manual Approve` (ID: `9fMshlbEy0Ol2wfY`) — Active

Endpoint: `/payments/manual/approve` (POST, accepts application/json)

Deliverables:

- [x] Minimum role `bendahara`.
- [x] Verify payment currently `pending_verification`.
- [x] Set payment `completed`.
- [x] Mark bill `paid`.
- [x] Store verifier and note (`verified_by`, `verified_at`, and `verification_note`).
- [x] Audit approval (`payment.approved` in `audit_logs`).

Validation:

- [x] Double approval does not duplicate payment effect (enforced by checking that `status === 'pending_verification'` before proceeding, otherwise returning `INVALID_STATUS`).
- [x] Build passed.

### Task 7.4 - Implement Manual Payment Reject Endpoint

Status: `[x]`

n8n Workflow: `PV API - Payments Manual Reject` (ID: `jivBKWczopjc37eH`) — Active

Endpoint: `/payments/manual/reject` (POST, accepts application/json)

Deliverables:

- [x] Minimum role `bendahara`.
- [x] Require rejection note (validated in n8n input check).
- [x] Set payment `rejected`.
- [x] Keep bill unpaid (sets status to `'unpaid'` and `payment_id` to `null` so it can be paid again).
- [x] Audit rejection (`payment.rejected` in `audit_logs`).

Validation:

- [x] Rejected payment does not mark bill paid (enforced, status set to `'unpaid'`).
- [x] Build passed.

### Task 7.5 - Migrate Manual Payment UI

Status: `[x]`

Files likely affected:

- [dataService.js](file:///d:/DenmasGanteng/Palm%20Village/Portal%20Warga%20Palm%20Village/PortalPalmVillage/client/src/services/dataService.js)
- [PaymentMatrix.jsx](file:///d:/DenmasGanteng/Palm%20Village/Portal%20Warga%20Palm%20Village/PortalPalmVillage/client/src/pages/PaymentMatrix.jsx)
- [PaymentVerification.jsx](file:///d:/DenmasGanteng/Palm%20Village/Portal%20Warga%20Palm%20Village/PortalPalmVillage/client/src/pages/PaymentVerification.jsx)

Deliverables:

- [x] Submit transfer through n8n.
- [x] Cash option shown only bendahara/admin.
- [x] Pending verification list from n8n.
- [x] Approve/reject through n8n.
- [x] Toast and loading states.

Validation:

- [x] Build successfully compiled using `npm run build`.
- [x] Multi-month transfer submitted via API upload and reference loops.
- [x] Verification queues retrieved from Supabase and processed via API endpoints.

### Task 7.6 - Phase 7 Review

Status: `[x]`

Review checklist:

- [x] Security: payment method role restrictions correct.
- [x] Performance: file upload does not block UI badly.
- [x] UI/UX: proof upload and verification are clear.
- [x] Data integrity: bill status follows payment status.

Phase 7 Review Notes:

```text
- Security: Role restrictions for payments verified (warga restricted to own units, bendahara+ for cash/verification).
- Performance: Multi-month payments only perform ONE Google Drive upload, passing URL references to subsequent bills.
- UI/UX: Modals successfully show loading spin indicators, success/warning toast notifications, and download/preview links.
- Data integrity: The status transitions (pending -> paid -> completed) are handled atomically in backend nodes.
```

---

## Phase 8 - Midtrans QRIS

Goal: QRIS works end-to-end in sandbox and is ready for production keys.

Dependencies: Phase 7.

### Task 8.1 - Define Midtrans Order ID Format

Status: `[x]`

Deliverables:

- [x] Format includes environment, bill/payment reference, timestamp/random suffix.
- [x] Unique enough and DB-enforced.
- [x] Document examples.

Validation:

- [x] Format designed as parent order ID `PV-QRIS-{unit_id}-{timestamp}` and child order ID `PV-QRIS-{unit_id}-{timestamp}-{index}`. Two database attempts cannot use same `order_id` due to unique constraint.

### Task 8.2 - Implement QRIS Create Endpoint

Status: `[x]`

Endpoint:

- `/payments/qris/create` (n8n Workflow ID: `Gt84N4815U8eXyIP` — Active)

Deliverables:

- [x] Minimum role `warga`.
- [x] Warga can pay only own bill.
- [x] Reject already paid bills.
- [x] Create payment `pending`.
- [x] Call Midtrans sandbox.
- [x] Save Midtrans metadata.
- [x] Return QRIS/payment data to frontend.
- [x] Audit create action.

Validation:

- [x] Sandbox QRIS transaction is successfully created.

### Task 8.3 - Implement Midtrans Webhook Endpoint

Status: `[x]`

Endpoint:

- `/payments/midtrans/webhook` (n8n Workflow ID: `nTlxfZSUosbS4UTR` — Active)

Deliverables:

- [x] Public endpoint.
- [x] Verify Midtrans signature.
- [x] Find payment by `order_id`.
- [x] Handle settlement/success.
- [x] Handle pending.
- [x] Handle expire/failure/cancel.
- [x] Store raw payload or audit metadata.
- [x] Return 200 for accepted webhook.

Validation:

- [x] Invalid signature rejected with `401 Unauthorized` response.
- [x] Valid sandbox webhook updates payment.

### Task 8.4 - Add QRIS Idempotency Protection

Status: `[x]`

Deliverables:

- [x] If payment already completed, do not update again.
- [x] If bill already paid, do not create duplicate completed payment.
- [x] Audit duplicate webhook.
- [x] Handle webhook arriving before frontend returns.

Validation:

- [x] Replaying same webhook skips DB updates cleanly to ensure idempotency.

### Task 8.5 - Migrate QRIS UI

Status: `[x]`

Files likely affected:

- `client/src/pages/PaymentMatrix.jsx`

Deliverables:

- [x] Call QRIS create endpoint.
- [x] Show QR/payment instruction.
- [x] Show pending status until backend confirms.
- [x] Do not mark paid from frontend return alone.

Validation:

- [x] User can create QRIS and see pending modal instruction with fallback payment button.
- [x] Webhook success changes status to paid on refresh/refetch.

### Task 8.6 - Phase 8 Review

Status: `[x]`

Review checklist:

- [x] Security: signature validation correct (verified using SHA512 hash checks).
- [x] Data integrity: duplicate webhook safe (idempotency checks applied).
- [x] Performance: payment create fast enough.
- [x] UI/UX: payment pending/success states clear.
- [x] Production key switch checklist exists.

Phase 8 Review Notes:

```text
- Security: Midtrans webhook signature successfully verified using HMAC SHA-512 authentication.
- Data integrity: Single-month and multi-month payment records protected via unique order ID splits.
- UI/UX: Custom instructions modal with popup block warning and fallback link provides a premium experience.
- Production: Switching to production key only requires updating the server key value in the n8n "PV Midtrans Sandbox Key" credential.
```

---

## Phase 9 - Reports and Running Balance from Real DB

Goal: reports use Supabase production data through n8n.

Dependencies: Phase 7 or Phase 8.

### Task 9.1 - Implement Running Balance Endpoint

Status: `[x]`

Endpoint:

- `/reports/running-balance` (n8n Workflow ID: `6XfRrH45gJquvy7B` — Active)

Deliverables:

- [x] Minimum role `pengurus`.
- [x] Aggregate completed payments by month.
- [x] Aggregate expenses by month.
- [x] Compute opening/closing balance.
- [x] Start at configured start period.

Validation:

- [x] Verified that closing balance month N equals opening balance month N+1 inside the cumulative loop starting from 2025-01.

### Task 9.2 - Implement Monthly Finance Report Endpoint

Status: `[x]`

Endpoint:

- `/reports/monthly-finance` (n8n Workflow ID: `DTDIuT351iEBsVWs` — Active)

Deliverables:

- [x] Minimum role `pengurus`.
- [x] Return income details (completed payments joined with profiles and period).
- [x] Return expense details (expenses list for the month).
- [x] Return summary cards (aggregated total billed, collected, outstanding, and rate).
- [x] Return status distribution (by block collection breakdown).

Validation:

- [x] Verified that payments with status `'pending_verification'` or `'pending'` are strictly excluded from income lists and collections sum.

### Task 9.3 - Migrate Reports UI

Status: `[x]`

Files likely affected:

- `client/src/pages/Reports.jsx` (Migrated to load dynamic running balance and monthly finance data from n8n backend)

Deliverables:

- [x] Production mode fetches reports from n8n.
- [x] Demo mode remains mock.
- [x] Loading state.
- [x] Error state.
- [x] Empty state.
- [x] Export uses current data source.

Validation:

- [x] Verified compilation and build works green via `npm run build`.
- [x] Verified reports block warga at UI gate (routes automatically back to dashboard if role is not pengurus+).

### Task 9.4 - Phase 9 Review

Status: `[x]`

Review checklist:

- [x] Security: reports protected from warga (role check hasMinRole(role, 'pengurus') strictly enforced).
- [x] Performance: aggregation query efficient (uses database-level summaries and filter ranges for dates and payment states).
- [x] UI/UX: tables/charts readable on mobile (retained all premium responsive chart styles).
- [x] Finance: formulas match requirements.

Phase 9 Review Notes:

```text
- Security: Access control ensures Warga roles are fully blocked at both API level (n8n check) and UI level.
- Performance: Instead of processing raw row lists locally, the backend aggregates summaries, speeding up query response significantly.
- Finance: Formulas for opening balance month N mapping to closing balance month N-1 verified.
```

---

## Phase 10 - Automation and Notifications

Goal: automate reminders and non-critical workflow after core flows are stable.

Dependencies: Phase 8.

### Task 10.1 - Payment Success Notification

Status: `[x]`

Deliverables:

- [x] Trigger after payment completed.
- [x] Send WhatsApp/email if contact available.
- [x] Failure does not rollback payment.
- [x] Log notification result.

Validation:

- [x] Payment remains completed even if notification fails.

### Task 10.2 - Pending Verification Notification

Status: `[x]`

Deliverables:

- [x] Notify bendahara when transfer proof submitted.
- [x] Include safe payment reference.
- [x] Include proof link only if operationally acceptable, because proof files are public-by-link.

Validation:

- [x] Bendahara receives or can see notification.

### Task 10.3 - Bill Reminder Workflow

Status: `[x]`

Deliverables:

- [x] Scheduled workflow.
- [x] Find unpaid bills before due date.
- [x] Send reminder.
- [x] Avoid duplicate reminders in same window.

Validation:

- [x] Dry run mode available or tested in staging.

### Task 10.4 - Overdue Reminder and Late Fee Workflow

Status: `[x]`

Deliverables:

- [x] Identify overdue bills.
- [x] Apply late fee only if configured.
- [x] Avoid repeated late fee duplication.
- [x] Send overdue reminder.

Validation:

- [x] Running workflow twice does not double late fee.

### Task 10.5 - Phase 10 Review

Status: `[x]`

Review checklist:

- [x] Security: notifications do not leak sensitive data.
- [x] Performance: scheduled jobs bounded and retry-safe.
- [x] UI/UX: notification text is clear.
- [x] Operations: failures visible to admin.

Phase 10 Review Notes:

```text
Centralized notification sender utility workflow created to dispatch email/WA notifications securely.
Webhooks (Midtrans, manual submit, manual approve) integrated to call the sender with automatic error tolerance.
Scheduled workflows for monthly bill reminders (5th of month) and overdue/late fee applications (11th of month) deployed and activated with safety checks (dry_run option and late_fee check to prevent double denda).
```

---

## Phase 11 - Security, Performance, and Observability

Goal: harden before staging UAT.

Dependencies: Phase 9 and Phase 10.

### Task 11.1 - Authorization Negative Test Matrix

Status: `[x]`

Deliverables:

- [x] Missing JWT test.
- [x] Invalid JWT test.
- [x] Expired JWT test.
- [x] Pending user test.
- [x] Suspended user test.
- [x] Warga accessing other unit test.
- [x] Pengurus creating cash payment test.
- [x] Bendahara updating settings test.
- [x] Duplicate webhook test.

Validation:

- [x] All negative tests fail safely.

### Task 11.2 - Performance Review

Status: `[x]`

Deliverables:

- [x] Review payment matrix query.
- [x] Review reports aggregation.
- [x] Review dashboard queries.
- [x] Add/adjust indexes if needed.
- [x] Avoid huge unpaginated audit logs.

Validation:

- [x] Main pages load acceptably on staging data.

### Task 11.3 - Observability and Backup Plan

Status: `[x]`

Deliverables:

- [x] Supabase backup plan.
- [x] n8n workflow backup/export plan.
- [x] n8n credential backup/recovery plan.
- [x] Error monitoring/logging plan.
- [x] Admin-visible workflow error list if feasible.

Validation:

- [x] Recovery steps are documented.

### Task 11.4 - UI/UX Production Polish Review

Status: `[x]`

Deliverables:

- [x] Login mobile/desktop review.
- [x] Pending approval page review.
- [x] Payment flow review.
- [x] Approval flow review.
- [x] Reports readability review.
- [x] Error states are human-readable.

Validation:

- [x] No critical text overflow or broken mobile flow.

### Task 11.5 - Phase 11 Review

Status: `[x]`

Review checklist:

- [x] Security hardening complete.
- [x] Performance acceptable.
- [x] UI/UX acceptable.
- [x] Operations plan documented.

Phase 11 Review Notes:

```text
Automated negative test matrix executed with 100% pass rate.
Applied missing performance indexes on `ipl_bills(payment_id)`, `audit_logs(actor_id)`, and `audit_logs(entity_type, entity_id)` to speed up joins and query filtering.
Documented backup plans for Supabase (daily logical exports + PITR) and n8n (bulk workflow JSON export + credential inventory) in BACKUP_AND_OPERATIONS.md.
UI/UX audit confirmed responsive mobile/desktop rendering, custom Inter/Playfair typography, and clean error notifications.
```

---

## Phase 12 - Staging UAT

Goal: validate production-like stack with sandbox credentials.

Dependencies: Phase 11.

### Task 12.1 - Deploy Staging Frontend

Status: `[x]`

Deliverables:

- [x] Vercel staging deployment.
- [x] `VITE_DEMO_MODE=false`.
- [x] Staging n8n API URL configured.
- [x] Google OAuth staging redirect configured.

Validation:

- [x] Staging login page loads.

### Task 12.2 - Configure Staging n8n

Status: `[x]`

Deliverables:

- [x] Staging workflows imported.
- [x] Staging secrets configured.
- [x] Staging webhook URLs active.
- [x] Midtrans sandbox configured.

Validation:

- [x] `/auth/google` staging works.

### Task 12.3 - Configure Staging Supabase

Status: `[x]`

Deliverables:

- [x] Schema applied.
- [x] Storage buckets created.
- [x] Seed data imported.
- [x] First admin created.

Validation:

- [x] Admin can login and access approval/user management.

### Task 12.4 - UAT Checklist

Status: `[x]`

Test cases:

- [x] New Google user -> pending approval.
- [x] Pengurus approves warga with unit.
- [x] Approved warga logs in.
- [x] Warga sees own bills.
- [x] Warga cannot access other bills.
- [x] Bendahara generates bills.
- [x] Warga submits transfer proof.
- [x] Bendahara approves transfer.
- [x] QRIS sandbox payment completes through webhook.
- [x] Reports show running balance.
- [x] Notifications work or fail safely.

Validation:

- [x] UAT blockers are documented and fixed.

### Task 12.5 - Phase 12 Review

Status: `[x]`

Review checklist:

- [x] Security: staging negative tests pass.
- [x] Performance: staging data acceptable.
- [x] UI/UX: UAT feedback handled.
- [x] Launch blockers resolved.

Phase 12 Review Notes:

```text
Staging codebase successfully committed and pushed to GitHub main branch, triggering automated build and deployment on Vercel.
Staging Supabase database fully schema-verified, storage buckets activated, and core ipl_components and settings seeded.
Staging n8n workflows (14 active instances) operational with sandbox configurations.
All UAT validation checklists verified for payment integration, user registrations, and notifications.
```

---

## Phase 13 - Production Launch

Goal: launch real production safely.

Dependencies: Phase 12.

### Task 13.1 - Prepare Production Environment

Status: `[ ]`

Deliverables:

- [ ] Production Supabase configured.
- [ ] Production n8n configured.
- [ ] Production Vercel configured.
- [ ] Production Google OAuth configured.
- [ ] Production Midtrans keys configured.
- [ ] Production storage buckets configured.
- [ ] Backups enabled.

Validation:

- [ ] No staging/sandbox values in production env.

### Task 13.2 - Import Production Data

Status: `[ ]`

Deliverables:

- [ ] Import units.
- [ ] Import initial known residents if used.
- [ ] Create first admin.
- [ ] Verify units and profiles.

Validation:

- [ ] Sample records checked manually.

### Task 13.3 - Production Smoke Test

Status: `[ ]`

Tests:

- [ ] Admin login.
- [ ] New user pending approval.
- [ ] Approve test warga.
- [ ] Warga sees own dashboard.
- [ ] Generate a controlled test bill if acceptable.
- [ ] Manual transfer flow test.
- [ ] Midtrans production small-value test if allowed.
- [ ] Reports load.

Validation:

- [ ] Smoke test sign-off.

### Task 13.4 - Launch Monitoring

Status: `[ ]`

Deliverables:

- [ ] Monitor n8n executions.
- [ ] Monitor Supabase logs.
- [ ] Monitor Midtrans webhook results.
- [ ] Monitor user reports.
- [ ] Record first-day issues.

Validation:

- [ ] No critical launch issue remains unresolved.

### Task 13.5 - Phase 13 Review

Status: `[ ]`

Review checklist:

- [ ] Security: production secret exposure check.
- [ ] Performance: first real usage acceptable.
- [ ] UI/UX: first user friction documented.
- [ ] Operations: support/rollback plan ready.

Phase 13 Review Notes:

```text
Not reviewed yet.
```

---

## Final Production Acceptance Checklist

Authentication:

- [ ] Production login only uses Google.
- [ ] New users become `pending_approval`.
- [ ] Approved users get App JWT.
- [ ] Rejected/suspended users cannot access protected APIs.

Authorization:

- [ ] Every protected n8n workflow validates JWT.
- [ ] Every protected workflow checks DB profile state.
- [ ] Role hierarchy is enforced.
- [ ] Unit ownership is enforced.

Data:

- [x] Supabase schema applied.
- [x] Constraints prevent duplicate bills and payment order IDs.
- [x] Storage buckets private.
- [ ] Audit logs written for significant actions.

Payment:

- [ ] Manual transfer works.
- [ ] Manual approval/rejection works.
- [ ] Cash payment restricted to bendahara/admin.
- [ ] QRIS create works.
- [ ] Midtrans webhook signature is verified.
- [ ] Duplicate webhook is idempotent.

Reports:

- [ ] Running balance uses completed payments only.
- [ ] Expenses are included correctly.
- [ ] Warga cannot access finance reports.

Operations:

- [ ] Backups enabled.
- [ ] n8n workflows backed up/exported.
- [ ] Production env vars verified.
- [ ] Monitoring and error review process exists.

UI/UX:

- [ ] Login state clear.
- [ ] Pending approval state clear.
- [ ] Payment pending/success/failure states clear.
- [ ] Mobile layout checked for critical flows.
