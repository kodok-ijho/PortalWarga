# Portal Warga Palm Village - n8n API Routing and Workflow Registry

> Purpose: lock the n8n workflow naming, route prefix, public/protected boundary, and endpoint registry before implementation.
>
> Task: `TASKLIST.md` Phase 2 Task 2.1.
>
> Status: routing contract, standard response, App JWT verification, Google auth, role check, and audit log patterns implemented.

---

## 1. Route Prefix

Canonical public route pattern:

```text
{N8N_WEBHOOK_PUBLIC_BASE}/portal-v1/{resource}/{action}
```

Frontend environment recommendation:

```env
VITE_N8N_API_BASE_URL=https://<n8n-public-host>/webhook/portal-v1
```

Frontend call pattern:

```javascript
api.post('/auth/google', payload)
api.post('/auth/me', payload)
api.post('/users/pending', payload)
```

n8n webhook path pattern:

```text
portal-v1/{resource}/{action}
```

Rules:

- Use lowercase kebab-free route segments unless an external provider requires otherwise.
- Use action-style routes because n8n webhooks are workflow-centric.
- Prefer `POST` for protected app endpoints to simplify n8n webhook handling and request bodies.
- Public provider callbacks may be `POST` only.
- Do not include secrets in URL query parameters.
- All protected endpoints must read `Authorization: Bearer <App JWT>`.

---

## 2. Existing n8n Workflow Audit

Checked via n8n MCP on 2026-07-08:

- No existing workflow name starts with `PV API -`.
- No existing workflow name starts with `PV UTIL -`.
- No existing workflow name starts with `PV JOB -`.
- No existing workflow matched query `portal`.
- Existing unrelated workflows such as `NARA login`, `NARA register`, `RAGA`, and `auth-workflow` must not be modified for this project.

The `PV` workflow namespace is available.

---

## 3. Workflow Naming Convention

Use these prefixes:

| Prefix | Purpose |
| --- | --- |
| `PV API -` | User-facing/API webhook workflows |
| `PV UTIL -` | Reusable auth, response, role, Supabase, audit helper workflows |
| `PV JOB -` | Scheduled/automation workflows |
| `PV OPS -` | Operational/admin maintenance workflows if needed |

Naming rules:

- Workflow names use Title Case after the prefix.
- Route paths use lowercase.
- One public API workflow should map to one route group/action.
- Do not mix provider webhooks and user-authenticated APIs in the same workflow.

---

## 4. Endpoint Registry

### 4.1 Public Endpoints

| Workflow | Method | Route | Purpose | Auth |
| --- | --- | --- | --- | --- |
| `PV API - Auth Google` | `POST` | `/portal-v1/auth/google` | Exchange Google ID token for pending state or App JWT | Public, validates Google token |
| `PV API - Payments Midtrans Webhook` | `POST` | `/portal-v1/payments/midtrans/webhook` | Receive Midtrans payment notification | Public, validates Midtrans signature |

### 4.2 Protected Auth/Profile Endpoints

| Workflow | Method | Route | Minimum Role | Purpose |
| --- | --- | --- | --- | --- |
| `PV API - Auth Me` | `POST` | `/portal-v1/auth/me` | `warga` | Return current approved profile |

### 4.3 User Approval and Management

| Workflow | Method | Route | Minimum Role | Purpose |
| --- | --- | --- | --- | --- |
| `PV API - Users Pending` | `POST` | `/portal-v1/users/pending` | `pengurus` | List pending approval users |
| `PV API - Users Approve` | `POST` | `/portal-v1/users/approve` | `pengurus` | Approve user and assign unit/role |
| `PV API - Users Reject` | `POST` | `/portal-v1/users/reject` | `pengurus` | Reject pending user |

### 4.4 Units and Residents

| Workflow | Method | Route | Minimum Role | Purpose |
| --- | --- | --- | --- | --- |
| `PV API - Units List` | `POST` | `/portal-v1/units/list` | `warga` | List unit metadata with role-based fields |
| `PV API - Units Upsert` | `POST` | `/portal-v1/units/upsert` | `admin` | Create/update unit metadata |
| `PV API - Residents List` | `POST` | `/portal-v1/residents/list` | `warga` | List resident directory/management data by role |

### 4.5 Billing

| Workflow | Method | Route | Minimum Role | Purpose |
| --- | --- | --- | --- | --- |
| `PV API - Bills List` | `POST` | `/portal-v1/bills/list` | `warga` | List bills scoped by role and ownership |
| `PV API - Bills Generate` | `POST` | `/portal-v1/bills/generate` | `bendahara` | Dry-run or commit monthly bills |

### 4.6 Manual Payments and Files

| Workflow | Method | Route | Minimum Role | Purpose |
| --- | --- | --- | --- | --- |
| `PV API - Payments Manual Submit` | `POST` | `/portal-v1/payments/manual/submit` | `warga` | Submit transfer proof and create pending verification payment |
| `PV API - Payments Cash Create` | `POST` | `/portal-v1/payments/cash/create` | `bendahara` | Record cash payment |
| `PV API - Payments Manual Approve` | `POST` | `/portal-v1/payments/manual/approve` | `bendahara` | Approve pending manual payment |
| `PV API - Payments Manual Reject` | `POST` | `/portal-v1/payments/manual/reject` | `bendahara` | Reject pending manual payment |
| `PV API - Files Payment Proof Upload` | `POST` | `/portal-v1/files/payment-proof/upload` | `warga` | Upload payment proof to Google Drive, set file public-by-link, store metadata |
| `PV API - Files Expense Receipt Upload` | `POST` | `/portal-v1/files/expense-receipt/upload` | `bendahara` | Upload expense receipt to Google Drive, store metadata |

### 4.7 QRIS

| Workflow | Method | Route | Minimum Role | Purpose |
| --- | --- | --- | --- | --- |
| `PV API - Payments QRIS Create` | `POST` | `/portal-v1/payments/qris/create` | `warga` | Create Midtrans QRIS transaction |

QRIS is optional if the project keeps a strict zero-monthly-cost / low-cost manual transfer mode. Midtrans QRIS can still incur transaction fees.

### 4.8 Expenses, Reports, and Settings

| Workflow | Method | Route | Minimum Role | Purpose |
| --- | --- | --- | --- | --- |
| `PV API - Expenses Create` | `POST` | `/portal-v1/expenses/create` | `bendahara` | Create expense record |
| `PV API - Reports Running Balance` | `POST` | `/portal-v1/reports/running-balance` | `pengurus` | Monthly running balance |
| `PV API - Reports Monthly Finance` | `POST` | `/portal-v1/reports/monthly-finance` | `pengurus` | Monthly finance report details |
| `PV API - Settings Update` | `POST` | `/portal-v1/settings/update` | `admin` | Update app/IPL settings |

### 4.9 Operational Test Endpoint

| Workflow | Method | Route | Minimum Role | Purpose |
| --- | --- | --- | --- | --- |
| `PV API - Health Check` | `POST` | `/portal-v1/health/check` | Public | Verify standard response shape and runtime connectivity |
| `PV API - Role Check Test` | `POST` | `/portal-v1/auth/role-check-test` | Dynamic test input | Validate App JWT plus minimum-role matrix |
| `PV API - Audit Log Test` | `POST` | `/portal-v1/audit/log-test` | `pengurus` by default | Validate audit insert pattern |

Use public health only if it returns no secrets and no DB-private details. Otherwise require admin JWT.

Current Google login implementation decision:

- `PV API - Auth Google` is public but validates Google `id_token`.
- It creates a `pending_approval` profile when `google_sub` is not found.
- It rejects rejected, suspended, inactive, and otherwise non-approved blocked states.
- It signs App JWT only for approved active profiles.
- It writes login audit logs for valid, invalid, pending, blocked, and successful login paths.
- Workflow id: `cjTmCiGHewDOvSKf`.
- Production path: `/webhook/portal-v1/auth/google`.
- Full current endpoint: `https://n8n-icyxwmjq.runner.web.id/webhook/portal-v1/auth/google`.

Current implementation decision:

- `PV API - Health Check` is public.
- It returns no database data, no secrets, and no private environment details.
- It exists to validate standard response shape and frontend connectivity.
- Workflow id: `8BqdQWeOeurw2uoi`.
- Production path: `/webhook/portal-v1/health/check`.
- Full current endpoint: `https://n8n-icyxwmjq.runner.web.id/webhook/portal-v1/health/check`.

Current role-check validation decision:

- `PV API - Role Check Test` is protected by App JWT.
- It exists to validate role hierarchy before real business endpoints are built.
- It accepts `minimum_role` only for controlled validation; real endpoints must hardcode their minimum role.
- Workflow id: `gXFYbb1et7uZg3gb`.
- Production path: `/webhook/portal-v1/auth/role-check-test`.
- Full current endpoint: `https://n8n-icyxwmjq.runner.web.id/webhook/portal-v1/auth/role-check-test`.

Current audit-log validation decision:

- `PV API - Audit Log Test` was used to validate `audit_logs` inserts.
- It was unpublished after validation because it writes to the database.
- Workflow id: `FEZjD5vxBxPaPoIT`.
- Validation path: `/webhook/portal-v1/audit/log-test`.

---

## 5. Utility Workflows

Utilities should be implemented as reusable sub-workflows or consistently copied blocks if sub-workflows are impractical in n8n.

| Workflow | Purpose |
| --- | --- |
| `PV UTIL - Standard Response` | Normalize `{ ok, data, error }` response shape |
| `PV UTIL - Verify App JWT` | Verify token signature, issuer, audience, expiry |
| `PV UTIL - Load Current User` | Read profile from Supabase and check active/approved state |
| `PV UTIL - Role Check` | Enforce minimum role hierarchy |
| `PV UTIL - Audit Log` | Insert audit event into `audit_logs` |
| `PV UTIL - Supabase Request` | Shared Supabase request pattern if using REST |
| `PV UTIL - Google Drive Upload` | Upload image and set file public-by-link |

Standard response contract is documented in `docs/production/N8N_STANDARD_RESPONSE.md`.
App JWT verification blueprint is documented in `docs/production/N8N_APP_JWT_VERIFICATION.md`.
Role check pattern is documented in `docs/production/N8N_ROLE_CHECK_PATTERN.md`.
Audit log pattern is documented in `docs/production/N8N_AUDIT_LOG_PATTERN.md`.

---

## 6. Scheduled Jobs

| Workflow | Trigger | Purpose |
| --- | --- | --- |
| `PV JOB - Monthly Billing` | Schedule | Generate monthly bills after dry-run/approval pattern exists |
| `PV JOB - Payment Reminder` | Schedule | Send reminder before due date |
| `PV JOB - Overdue Reminder` | Schedule | Mark overdue/send reminder without duplicate fees |
| `PV JOB - Workflow Backup` | Schedule | Optional export/backup if not covered by existing n8n backup workflow |

---

## 7. Tags

Recommended n8n tags:

- `Portal Palm Village`
- `PV API`
- `PV UTIL`
- `PV JOB`
- `Production`
- `Staging`
- `Public`
- `Protected`

Do not rely on tags for security. Tags are operational organization only.

---

## 8. Implementation Order

1. `[x]` `PV API - Health Check`
2. `[x]` `PV UTIL - Standard Response` pattern documented
3. `[x]` `PV API - Auth Me` with inline App JWT verification and current-user loading
4. `[x]` `PV UTIL - Verify App JWT` pattern proven inline in `PV API - Auth Me`
5. `[x]` `PV UTIL - Load Current User` pattern proven inline in `PV API - Auth Me`
6. `[x]` `PV UTIL - Role Check` pattern proven inline in `PV API - Role Check Test`
7. `[x]` `PV UTIL - Audit Log` pattern proven inline in `PV API - Audit Log Test`
8. `[x]` `PV API - Auth Google`
9. `[ ]` `PV API - Users Pending`
10. `[ ]` `PV API - Users Approve`
11. `[ ]` `PV API - Users Reject`

Manual payment and Google Drive upload workflows should start after the auth/role foundation is proven.

---

## 9. Validation Notes

- Endpoint names match `docs/production/REQUIREMENTS.md`.
- Public vs protected boundaries are explicit.
- Existing n8n workflows were inspected and no `PV` namespace conflict was found.
- `PV API - Health Check` was created, validated, and published on 2026-07-08.
- Health check success and forced error paths were validated through n8n MCP.
- `PV API - Auth Me` was created, validated, and published on 2026-07-08.
- `PV API - Auth Google` was created, validated, and published on 2026-07-09.
- Google auth validation covered missing token, invalid token, pinned new-user pending response, pinned approved-user App JWT response, and pinned wrong-audience rejection.
- `PV API - Auth Me` workflow id: `4eplxr7j3Gxwyzwj`.
- `PV API - Auth Me` production path: `/webhook/portal-v1/auth/me`.
- Auth Me validation covered missing token, invalid token, approved user, and pending user in manual and production execution modes.
- `PV API - Role Check Test` was created, validated, and published on 2026-07-09.
- `PV API - Role Check Test` workflow id: `gXFYbb1et7uZg3gb`.
- Role validation covered `warga` rejected from `admin`, `pengurus` accepted for `pengurus`, `bendahara` accepted for `bendahara`, and `admin` accepted for `admin`.
- Role production validation executions:
  - `237382`: `warga` rejected from `admin` with `403 FORBIDDEN_ROLE`.
  - `237383`: `bendahara` accepted for `bendahara` with `200 ok`.
- `PV API - Audit Log Test` was created and validated on 2026-07-09.
- `PV API - Audit Log Test` workflow id: `FEZjD5vxBxPaPoIT`.
- Audit validation covered actor id/email, action, entity type/id, metadata, IP address, and user-agent capture.
- Audit production validation execution `237388` inserted row `f0a4f303-bbf0-4e81-8faa-d2d4f0ae38fb` with `metadata_type = object`.
- `PV API - Audit Log Test` was unpublished after validation.
- Temporary Phase 2 Supabase validation rows were cleaned up; remaining audit/profile/unit counts were all `0`.
