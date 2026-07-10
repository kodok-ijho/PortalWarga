# Portal Warga Palm Village - n8n Standard Response Contract

> Purpose: kontrak response untuk semua workflow API n8n Portal Palm Village.
>
> Task: `TASKLIST.md` Phase 2 Task 2.2.
>
> Status: implemented and validated with `PV API - Health Check`.

---

## 1. Canonical Shape

All n8n API workflows must respond with this shape:

```json
{
  "ok": true,
  "data": {},
  "error": null,
  "meta": {
    "request_id": "req_123",
    "timestamp": "2026-07-08T16:13:21.222Z"
  }
}
```

Error response:

```json
{
  "ok": false,
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Input tidak valid.",
    "details": {
      "field": "bill_id"
    }
  },
  "meta": {
    "request_id": "req_123",
    "timestamp": "2026-07-08T16:13:27.458Z"
  }
}
```

Rules:

- `ok` is the frontend decision flag.
- `data` contains endpoint-specific payload only when `ok = true`.
- `error` is `null` when `ok = true`.
- `error.code` is stable and machine-readable.
- `error.message` is safe to show to users.
- `error.details` is optional and must not contain secrets, tokens, raw provider keys, or private stack traces.
- `meta.request_id` is used for support/debugging and should be passed from `x-request-id` when available.
- `meta.timestamp` is ISO 8601 UTC timestamp from n8n runtime.

---

## 2. Request ID Rule

Priority order:

1. `headers["x-request-id"]`
2. `body.request_id`
3. `query.request_id`
4. Generated fallback: `health_<timestamp>_<random>`

Future frontend API client should generate a lightweight request id for every call and send it in `x-request-id`.

---

## 3. HTTP Status Mapping

| HTTP | Use for | Standard code examples |
| --- | --- | --- |
| `200` | Successful read/update/action | `OK` |
| `201` | Resource created | `CREATED` |
| `202` | Accepted async work | `ACCEPTED` |
| `400` | Bad request or forced validation test | `BAD_REQUEST`, `VALIDATION_ERROR`, `HEALTH_FORCED_ERROR` |
| `401` | Missing/invalid/expired App JWT | `UNAUTHORIZED`, `TOKEN_EXPIRED`, `INVALID_TOKEN` |
| `403` | Authenticated but not allowed | `FORBIDDEN`, `PENDING_APPROVAL`, `SUSPENDED_USER`, `FORBIDDEN_ROLE` |
| `404` | Entity not found or hidden by ownership rule | `NOT_FOUND` |
| `409` | Conflict or duplicate operation | `CONFLICT`, `DUPLICATE_PAYMENT`, `BILL_ALREADY_PAID` |
| `422` | Business rule validation failed | `UNPROCESSABLE_ENTITY`, `APPROVAL_REQUIRED`, `INVALID_PAYMENT_STATE` |
| `429` | Rate/abuse protection if added later | `RATE_LIMITED` |
| `500` | Internal workflow or DB failure | `INTERNAL_ERROR` |
| `502` | External provider failed | `PROVIDER_ERROR` |
| `503` | Temporary service unavailable | `SERVICE_UNAVAILABLE` |

Use the matching HTTP status in the `Respond to Webhook` node, not only inside JSON.

---

## 4. n8n Implementation Pattern

Recommended shape:

```text
Webhook trigger
  -> Normalize/Validate input
  -> Business logic
  -> Build standard response
  -> Respond to Webhook
```

Webhook trigger requirements:

- `responseMode = responseNode`
- Protected endpoints read `Authorization: Bearer <App JWT>`
- Public endpoints must not expose private data
- Prefer `POST` for app endpoints

Respond node requirements:

- `respondWith = json`
- `responseBody = {{ $json.response }}`
- `options.responseCode = {{ $json.statusCode }}`
- Headers:
  - `Content-Type: application/json; charset=utf-8`
  - `Cache-Control: no-store`

---

## 5. Implemented Health Check

Workflow:

```text
PV API - Health Check
```

n8n workflow id:

```text
8BqdQWeOeurw2uoi
```

Production endpoint:

```text
POST https://n8n-icyxwmjq.runner.web.id/webhook/portal-v1/health/check
```

Public access decision:

- Public endpoint is allowed because it returns no database data, no secrets, and no environment details beyond the route/workflow name.

Normal request body:

```json
{}
```

Expected result:

```json
{
  "ok": true,
  "data": {
    "service": "portal-palm-village",
    "workflow": "PV API - Health Check",
    "route": "/portal-v1/health/check",
    "status": "ok",
    "execution_mode": null
  },
  "error": null,
  "meta": {
    "request_id": "task-2-2-prod-success",
    "timestamp": "2026-07-08T16:13:21.222Z"
  }
}
```

Forced error request body:

```json
{
  "force_error": true
}
```

Expected result:

```json
{
  "ok": false,
  "data": null,
  "error": {
    "code": "HEALTH_FORCED_ERROR",
    "message": "Forced health-check error for standard response validation.",
    "details": {
      "route": "/portal-v1/health/check"
    }
  },
  "meta": {
    "request_id": "task-2-2-prod-error",
    "timestamp": "2026-07-08T16:13:27.458Z"
  }
}
```

---

## 6. Validation Record

Validated on 2026-07-08 through n8n MCP:

| Execution | Mode | Scenario | Result |
| --- | --- | --- | --- |
| `237360` | manual | success response | `statusCode = 200`, `ok = true` |
| `237361` | manual | forced error response | `statusCode = 400`, `ok = false` |
| `237362` | production/webhook | success response | `statusCode = 200`, `ok = true` |
| `237363` | production/webhook | forced error response | `statusCode = 400`, `ok = false` |

Workflow is published/active as of 2026-07-08.

---

## 7. Frontend Handling Rule

Frontend API client should handle every n8n API response like this:

```javascript
if (!payload.ok) {
  throw new ApiError(payload.error.message, {
    code: payload.error.code,
    details: payload.error.details,
    requestId: payload.meta?.request_id,
  });
}

return payload.data;
```

Do not infer success only from HTTP status. Use both HTTP status and `ok`.

---

## 8. Next Use

Task 2.3 `Verify App JWT` must reuse the same response contract:

- Missing token: HTTP `401`, `ok = false`, `error.code = "UNAUTHORIZED"`.
- Invalid signature: HTTP `401`, `ok = false`, `error.code = "INVALID_TOKEN"`.
- Expired token: HTTP `401`, `ok = false`, `error.code = "TOKEN_EXPIRED"`.
- Pending approval: HTTP `403`, `ok = false`, `error.code = "PENDING_APPROVAL"`.
