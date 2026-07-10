# Portal Warga Palm Village - n8n App JWT Verification Plan

> Purpose: implementation blueprint untuk Task 2.3 `Implement App JWT Verification Pattern`.
>
> Status: implemented and validated through `PV API - Auth Me` as of 2026-07-08.

---

## 1. Goal

Every protected n8n API endpoint must verify:

1. `Authorization: Bearer <App JWT>` exists.
2. JWT signature is valid.
3. JWT `exp` and `nbf` are valid.
4. JWT `iss` equals `portal-palm-village`.
5. JWT `aud` equals `portal-palm-village-web`.
6. JWT `sub` exists and maps to a profile id.
7. Supabase profile exists.
8. `profiles.is_active = true`.
9. `profiles.approval_status = 'approved'`.
10. Role and ownership checks are performed by the endpoint-specific workflow after this utility step.

JWT claims are useful for routing, but Supabase profile state is final.

---

## 2. Current Credential Check

Checked through n8n MCP on 2026-07-08:

| Needed credential | Status | Notes |
| --- | --- | --- |
| `PV App JWT` (`jwtAuth`) | Ready | Used by `PV API - Auth Me` to verify HS256 App JWTs. |
| `PV Supabase Service Role` (`supabaseApi`) | Ready | Table lookup confirmed against Portal Palm Village Supabase tables. |
| NARA Supabase credential | Do not use | `Supabase Account NARA` connects but appears to point to another project. |

Protected workflow implementation may proceed using only the Portal credentials above.

---

## 3. Required n8n Credentials

### 3.1 App JWT Credential

Create a new n8n credential:

```text
Credential type: JWT
Name: PV App JWT
Algorithm: HS256
Secret/key: generated strong random secret
```

Rules:

- Use the same credential for signing App JWT in `/auth/google` and verifying it in protected endpoints.
- Keep the secret only in n8n credential storage.
- Do not put the secret in frontend env vars or documentation.
- Rotate later by supporting old and new secrets during a short migration window if needed.

### 3.2 Supabase Service Credential

Create or fix a n8n credential:

```text
Credential type: Supabase API
Name: PV Supabase Service Role
Host/URL: https://<portal-project-ref>.supabase.co
Service role key/API key: Supabase service role key
```

Rules:

- This must target the Portal Palm Village Supabase project, not NARA or another project.
- Use service role only in n8n.
- Never expose service role key to frontend or docs.
- After creation, validate by loading tables; expected table names include `profiles`, `units`, `ipl_bills`, `payments`, `expenses`, and `audit_logs`.

---

## 4. Workflow Design

Recommended utility workflow:

```text
PV UTIL - Verify App JWT
```

Recommended test API workflow:

```text
PV API - Auth Me
```

For n8n implementation, the practical first implementation should be inside `PV API - Auth Me` first. After the pattern is proven, copy or refactor the shared block into `PV UTIL - Verify App JWT` if sub-workflows are clean enough.

### 4.1 Node Chain

```text
Webhook: POST /portal-v1/auth/me
  -> Code: Extract Bearer Token
  -> IF: Token Present?
      false -> Code: 401 UNAUTHORIZED response -> Respond to Webhook
      true  -> JWT: Verify Token
             -> Code: Validate App Claims
             -> Supabase: Get Profile by id = jwt.sub
             -> Code: Validate Profile State + Normalize currentUser
             -> Respond to Webhook
```

If the JWT node fails on invalid signature/expired token, route node error to a standard `401` response.

### 4.2 JWT Node

Use n8n node:

```text
n8n-nodes-base.jwt
operation: verify
credential: PV App JWT
algorithm: HS256
token: {{$json.token}}
options:
  ignoreExpiration: false
  ignoreNotBefore: false
  clockTolerance: 30
```

The JWT node verifies signature and expiration. Claim-specific checks still happen in a Code node because the node type does not expose required `issuer` and `audience` verify options.

### 4.3 Claim Validation

Required:

```javascript
payload.iss === 'portal-palm-village'
payload.aud === 'portal-palm-village-web'
typeof payload.sub === 'string' && payload.sub.length > 0
```

If any check fails:

```json
{
  "ok": false,
  "data": null,
  "error": {
    "code": "INVALID_TOKEN",
    "message": "Sesi tidak valid. Silakan login ulang.",
    "details": {}
  }
}
```

### 4.4 Supabase Profile Lookup

Use n8n Supabase node:

```text
n8n-nodes-base.supabase
resource: row
operation: get
credential: PV Supabase Service Role
tableId: profiles
filters:
  id = {{$json.jwt.sub}}
```

Expected selected fields:

```text
id
email
full_name
avatar_url
phone
role
unit_id
approval_status
is_active
last_login_at
```

### 4.5 Profile State Checks

Reject:

| Condition | HTTP | Code |
| --- | --- | --- |
| profile missing | `401` | `INVALID_TOKEN` |
| `is_active = false` | `403` | `SUSPENDED_USER` |
| `approval_status = pending_approval` | `403` | `PENDING_APPROVAL` |
| `approval_status = rejected` | `403` | `ACCOUNT_REJECTED` |
| any other non-approved state | `403` | `FORBIDDEN` |

Return normalized `currentUser`:

```json
{
  "id": "profile_uuid",
  "email": "warga@example.com",
  "full_name": "Nama Warga",
  "avatar_url": "https://...",
  "phone": "0812...",
  "role": "warga",
  "unit_id": 12,
  "approval_status": "approved",
  "is_active": true
}
```

---

## 5. Standard Responses

Use `docs/production/N8N_STANDARD_RESPONSE.md`.

Missing token:

```json
{
  "ok": false,
  "data": null,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Sesi tidak ditemukan. Silakan login.",
    "details": {}
  },
  "meta": {
    "request_id": "req_123",
    "timestamp": "2026-07-08T00:00:00.000Z"
  }
}
```

Approved token:

```json
{
  "ok": true,
  "data": {
    "currentUser": {
      "id": "profile_uuid",
      "email": "warga@example.com",
      "role": "warga",
      "unit_id": 12,
      "approval_status": "approved",
      "is_active": true
    }
  },
  "error": null,
  "meta": {
    "request_id": "req_123",
    "timestamp": "2026-07-08T00:00:00.000Z"
  }
}
```

---

## 6. Validation Checklist

- [x] n8n lists `PV App JWT` as `jwtAuth`.
- [x] n8n lists `PV Supabase Service Role` as `supabaseApi`.
- [x] Supabase credential table load-options include Portal tables.
- [x] Missing token returns HTTP `401`, `error.code = UNAUTHORIZED`.
- [x] Invalid token returns HTTP `401`, `error.code = INVALID_TOKEN`.
- [x] Pending user returns HTTP `403`, `error.code = PENDING_APPROVAL`.
- [x] Approved user returns `currentUser`.
- [ ] Expired token returns HTTP `401`, `error.code = TOKEN_EXPIRED` or `INVALID_TOKEN`.

Validated workflow:

```text
Workflow: PV API - Auth Me
Workflow id: 4eplxr7j3Gxwyzwj
Production endpoint: POST https://n8n-icyxwmjq.runner.web.id/webhook/portal-v1/auth/me
```

Validation executions:

- Manual `237371`: missing token -> `401 UNAUTHORIZED`.
- Manual `237372`: invalid token -> `401 INVALID_TOKEN`.
- Manual `237369`: approved user -> `200 ok`, returns normalized `currentUser`.
- Manual `237370`: pending user -> `403 PENDING_APPROVAL`.
- Production `237373`: missing token -> `401 UNAUTHORIZED`.
- Production `237374`: invalid token -> `401 INVALID_TOKEN`.
- Production `237375`: approved user -> `200 ok`, returns normalized `currentUser`.
- Production `237376`: pending user -> `403 PENDING_APPROVAL`.

Operational cleanup:

- Temporary signer workflow `PV OPS - JWT Test Token Signer` was archived after use.
- Temporary Supabase validation profile/unit rows were deleted and verified as remaining count `0`.

---

## 7. Next Agent Action

Task 2.4, Task 2.5, and Phase 3 Task 3.2 are now complete. Continue with Phase 3 frontend/session validation and admin approval endpoints:

1. Test browser Google login from `https://portal-warga.vercel.app/` or local dev with a real Google ID token.
2. Confirm new Google users become `pending_approval`.
3. Confirm approved Google users receive an App JWT and `/auth/me` accepts it.
4. Implement the user approval workflows (`/users/pending`, `/users/approve`, `/users/reject`).
5. Re-run auth/session validation after approval workflows exist.

Related completed Phase 3 workflow:

- `PV API - Auth Google`
- Workflow id: `cjTmCiGHewDOvSKf`
- Production endpoint: `POST https://n8n-icyxwmjq.runner.web.id/webhook/portal-v1/auth/google`

Related completed Phase 2 docs:

- `docs/production/N8N_ROLE_CHECK_PATTERN.md`
- `docs/production/N8N_AUDIT_LOG_PATTERN.md`
