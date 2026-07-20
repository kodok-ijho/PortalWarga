# Portal Warga Palm Village - n8n Role Check Pattern

> Purpose: reusable role authorization blueprint for protected n8n API workflows.
>
> Task: `TASKLIST.md` Phase 2 Task 2.4.
>
> Status: implemented and validated with `PV API - Role Check Test` on 2026-07-09. The validation-only workflow was archived on 2026-07-11 after the evidence below was recorded.

---

## 1. Goal

Every protected endpoint must run authorization in this order:

1. Read `Authorization: Bearer <App JWT>`.
2. Verify App JWT signature, expiry, issuer, audience, and subject.
3. Load the current profile from Supabase by JWT `sub`.
4. Reject inactive, rejected, suspended, pending, or missing profiles.
5. Check the endpoint minimum role.
6. Continue business logic only after role check passes.

JWT claims are useful for request context, but Supabase profile state is final.

---

## 2. Role Hierarchy

Canonical role levels:

```javascript
const ROLE_LEVEL = {
  warga: 10,
  pengurus: 20,
  bendahara: 30,
  admin: 40,
};
```

Helper logic:

```javascript
function hasMinRole(userRole, minimumRole) {
  const userLevel = ROLE_LEVEL[userRole] || 0;
  const minimumLevel = ROLE_LEVEL[minimumRole] || 999;

  return userLevel >= minimumLevel;
}
```

Rules:

- `warga` is the base approved resident role.
- `pengurus` can access resident-management and reporting endpoints.
- `bendahara` can access finance/payment mutation endpoints.
- `admin` can access every role-gated endpoint and should be required for settings or elevated role assignment.
- If `minimum_role` is missing, endpoint code must use a safe explicit default, not trust frontend input. For test workflow only, the default is `bendahara`.

---

## 3. Standard Error

When the token is valid but role is too low:

```json
{
  "ok": false,
  "data": null,
  "error": {
    "code": "FORBIDDEN_ROLE",
    "message": "Akses tidak cukup untuk aksi ini.",
    "details": {
      "required_role": "admin",
      "current_role": "warga"
    }
  },
  "meta": {
    "request_id": "req_123",
    "timestamp": "2026-07-09T00:00:00.000Z"
  }
}
```

HTTP status must be `403`.

---

## 4. n8n Node Pattern

Recommended node chain for a protected role-gated workflow:

```text
Webhook: POST /portal-v1/<resource>/<action>
  -> Code: Extract Bearer Token and Request Context
  -> IF: Token Present?
      false -> Code: 401 UNAUTHORIZED response -> Respond to Webhook
      true  -> JWT: Verify App JWT
             -> Code: Validate App Claims
             -> Supabase: Fetch Current Profile
             -> Code: Validate Profile State and Normalize currentUser
             -> Code: Check Minimum Role
             -> IF: Role Allowed?
                  false -> Code: 403 FORBIDDEN_ROLE response -> Respond to Webhook
                  true  -> Continue endpoint business logic
```

Implementation notes:

- Keep `x-request-id` through every branch.
- Do not read role, unit id, or approval status from frontend as authority.
- Use the same role check block for all endpoints, with hardcoded minimum role per workflow.
- For future endpoint workflows, prefer a workflow-level constant such as `const MINIMUM_ROLE = 'bendahara';` instead of accepting `minimum_role` from the request body.

---

## 5. Validation Workflow

Workflow:

```text
PV API - Role Check Test
```

n8n workflow id:

```text
gXFYbb1et7uZg3gb
```

Former production validation endpoint (archived; no longer active):

```text
POST https://n8n-icyxwmjq.runner.web.id/webhook/portal-v1/auth/role-check-test
```

Request body used for validation:

```json
{
  "minimum_role": "admin",
  "request_id": "phase2-role-prod-warga-admin"
}
```

The validation endpoint accepts `minimum_role` only so the role matrix can be tested through one workflow. Real business endpoints must set the required role internally.

Cleanup record:

- Workflow `gXFYbb1et7uZg3gb` was archived on 2026-07-11 during UAT Fixing Phase F3.
- Keep this section as implementation evidence; do not call the archived endpoint from frontend or production integrations.

---

## 6. Validation Record

Validated on 2026-07-09 through n8n MCP:

| Execution | Mode | Scenario | Result |
| --- | --- | --- | --- |
| `237378` | manual | `warga` requests `admin` minimum | `403 FORBIDDEN_ROLE` |
| `237379` | manual | `pengurus` requests `pengurus` minimum | `200 ok` |
| `237380` | manual | `bendahara` requests `bendahara` minimum | `200 ok` |
| `237381` | manual | `admin` requests `admin` minimum | `200 ok` |
| `237382` | production/webhook | `warga` requests `admin` minimum | `403 FORBIDDEN_ROLE` |
| `237383` | production/webhook | `bendahara` requests `bendahara` minimum | `200 ok` |

Workflow is published/active as of 2026-07-09.

Operational cleanup:

- Temporary signer workflow used for validation was archived.
- Temporary Supabase profiles/unit rows used for validation were deleted and verified as remaining count `0`.

---

## 7. Next Use

Use this pattern in Phase 3 and later:

- `/auth/google`: no App JWT yet, but must assign roles safely from DB and issue App JWT only after profile checks.
- `/users/pending`: minimum role `pengurus`.
- `/users/approve`: minimum role `pengurus`, with extra elevated-role restrictions.
- `/bills/generate`: minimum role `bendahara`.
- `/payments/cash/create`: minimum role `bendahara`.
- `/settings/update`: minimum role `admin`.
