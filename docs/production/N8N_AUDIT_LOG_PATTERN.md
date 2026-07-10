# Portal Warga Palm Village - n8n Audit Log Pattern

> Purpose: reusable audit logging blueprint for significant backend actions.
>
> Task: `TASKLIST.md` Phase 2 Task 2.5.
>
> Status: implemented and validated with `PV API - Audit Log Test` as of 2026-07-09.

---

## 1. Goal

Every significant backend action must write an `audit_logs` row after authentication, profile validation, and role/ownership checks pass.

Required examples:

- `auth.login_success`
- `auth.login_pending`
- `auth.login_rejected`
- `user.approve`
- `user.reject`
- `user.suspend`
- `bill.generate`
- `payment.qris_create`
- `payment.webhook_received`
- `payment.complete`
- `payment.manual_submit`
- `payment.manual_approve`
- `payment.manual_reject`
- `expense.create`
- `expense.update`
- `expense.delete`
- `settings.update`

---

## 2. Target Table

Current Supabase table:

```text
public.audit_logs
```

Required fields used by the n8n pattern:

| Column | Source |
| --- | --- |
| `actor_id` | `currentUser.id`, nullable for public provider callbacks |
| `actor_email` | `currentUser.email`, nullable for provider callbacks |
| `action` | Stable action string such as `payment.manual_approve` |
| `entity_type` | Entity category such as `payment`, `bill`, `profile`, `settings` |
| `entity_id` | Entity id as text when available |
| `metadata` | JSON object with safe context only |
| `ip_address` | Best-effort request IP |
| `user_agent` | Best-effort request user agent |

Rules:

- `metadata` must be a JSON object, not a stringified JSON value.
- Do not store App JWT, Google token, Midtrans server key, Supabase service role key, or raw secrets in audit metadata.
- Public provider payloads may be summarized in metadata, but raw payload storage should be deliberate and reviewed for sensitive fields.
- Audit failure policy must be explicit per endpoint. Financial/admin mutations should normally fail closed if audit insert fails.

---

## 3. n8n Node Pattern

Recommended node chain inside protected workflows:

```text
Webhook
  -> Verify App JWT
  -> Load Current User
  -> Check Minimum Role
  -> Validate business input
  -> Execute business mutation
  -> Code: Build Audit Row
  -> Supabase: Insert audit_logs row
  -> Build standard success response
  -> Respond to Webhook
```

Best-effort request context:

```javascript
const ipAddress =
  headers['x-forwarded-for']?.split(',')[0]?.trim() ||
  headers['cf-connecting-ip'] ||
  headers['x-real-ip'] ||
  null;

const userAgent = headers['user-agent'] || null;
```

Audit metadata shape:

```json
{
  "request_id": "req_123",
  "source_workflow": "PV API - Payments Manual Approve",
  "minimum_role": "bendahara",
  "actor_role": "bendahara"
}
```

---

## 4. Supabase Insert Rule

In n8n Supabase row insert, set `metadata` as an object expression:

```text
={{ $json.audit.metadata }}
```

Do not use this for `jsonb` metadata:

```text
={{ JSON.stringify($json.audit.metadata) }}
```

The stringified form stores a JSON string inside `jsonb`, which makes filtering and future reporting harder.

---

## 5. Validation Workflow

Workflow:

```text
PV API - Audit Log Test
```

n8n workflow id:

```text
FEZjD5vxBxPaPoIT
```

Validation endpoint:

```text
POST https://n8n-icyxwmjq.runner.web.id/webhook/portal-v1/audit/log-test
```

This endpoint was published only for validation and then unpublished after the production webhook test passed. It should stay unpublished unless a future agent intentionally reuses it for controlled validation.

---

## 6. Validation Record

Validated on 2026-07-09 through n8n MCP and Supabase MCP:

| Execution | Mode | Scenario | Result |
| --- | --- | --- | --- |
| `237384` | manual | First audit insert | `201 ok`, but `metadata` stored as JSON string |
| `237387` | manual | Tuned audit insert | `201 ok`, `metadata_type = object` |
| `237388` | production/webhook | Tuned audit insert | `201 ok`, `metadata_type = object` |

Final validated row before cleanup:

```text
audit_log_id: f0a4f303-bbf0-4e81-8faa-d2d4f0ae38fb
action: phase2.audit_pattern.test
entity_type: phase2_validation
entity_id: phase2-audit-production-object
metadata_type: object
```

Operational cleanup:

- `PV API - Audit Log Test` was unpublished after validation.
- Temporary signer workflow used for validation was archived.
- Temporary audit rows, profiles, and unit rows used for validation were deleted.
- Cleanup verification returned remaining counts `0` for Phase 2 audit logs, profiles, and unit rows.

---

## 7. Next Use

Use this pattern in Phase 3 and later:

- `/auth/google`: write `auth.login_success`, `auth.login_pending`, or `auth.login_rejected`.
- `/users/approve`: write `user.approve`.
- `/users/reject`: write `user.reject`.
- Payment endpoints: write submit, approve, reject, complete, QRIS create, and webhook events.
- Settings endpoint: write `settings.update`.

