# Event Finance API Contract

> Status: local contract for the event finance feature. Do not publish n8n workflows from this document without staging validation.
>
> Scope: event master, event assignment, non-IPL income, event-aware expenses, event finance report.

## Guardrails

- All endpoints are `POST` under `/portal-v1`.
- All endpoints are protected by App JWT and must reload the actor profile from Supabase.
- Frontend capability is UX only. Backend checks global role and active `event_members` assignment on every request.
- Event roles stay assignment-scoped. Do not add `event_treasurer` or `coordinator_member` to the global `user_role` enum.
- Delete means soft delete for events, incomes, and expenses.
- Existing IPL, QRIS, Midtrans, bills, payments, RSVP, and legacy expense payloads must remain compatible.

## Standard Response

Success:

```json
{
  "ok": true,
  "data": {},
  "error": null,
  "meta": {
    "request_id": "req_123",
    "timestamp": "2026-08-01T00:00:00.000Z"
  }
}
```

Error:

```json
{
  "ok": false,
  "data": null,
  "error": {
    "code": "FORBIDDEN",
    "message": "Akun tidak memiliki akses ke event ini.",
    "details": {}
  },
  "meta": {
    "request_id": "req_123",
    "timestamp": "2026-08-01T00:00:00.000Z"
  }
}
```

## Endpoint Registry

| Workflow | Route | Minimum server-side permission | Data key |
| --- | --- | --- | --- |
| `PV API - Events List` | `/events/list` | Admin/Bendahara all, assigned users scoped | `events` |
| `PV API - Events Detail` | `/events/detail` | Same as list | `event` |
| `PV API - Events Create` | `/events/create` | Admin only | `event` |
| `PV API - Events Update` | `/events/update` | Admin only | `event` |
| `PV API - Events Delete` | `/events/delete` | Admin only | `event` |
| `PV API - Event Members List` | `/events/members/list` | Admin all, assigned users self/event scoped | `members` |
| `PV API - Event Members Assign` | `/events/members/assign` | Admin only | `member` |
| `PV API - Event Members Revoke` | `/events/members/revoke` | Admin only | `member` |
| `PV API - Events My Access` | `/events/my-access` | Any approved active user | `global`, `events` |
| `PV API - Incomes List` | `/incomes/list` | Admin/Bendahara general and all events, assigned event users scoped | `incomes` |
| `PV API - Incomes Create` | `/incomes/create` | Admin/Bendahara general and all events, event treasurer assigned event only | `income` |
| `PV API - Incomes Update` | `/incomes/update` | Same as create; source and target event must both be authorized | `income` |
| `PV API - Incomes Delete` | `/incomes/delete` | Same as update | `income` |
| `PV API - Reports Event Finance` | `/reports/event-finance` | Admin/Bendahara all, assigned users scoped read | `report` |

Existing routes to extend carefully:

| Existing workflow | Required additive behavior |
| --- | --- |
| `PV API - Expenses List` | Accept optional `scope`, `event_id`, `from`, `to`, and exclude `deleted_at` by default. No filter must preserve legacy general behavior. |
| `PV API - Expenses Create` | Existing payload without `scope/event_id` remains general. Event payload requires event finance write permission. |
| `PV API - Expenses Update` | Existing payload remains compatible. Moving event scope requires permission on both previous and next scope. |
| `PV API - Expenses Delete` | Soft delete by setting `deleted_at/deleted_by`; do not hard delete financial records. |
| `PV API - Reports Running Balance` | Add separated totals for IPL income, non-IPL general income, event income, general expenses, event expenses. |
| `PV API - Reports Monthly Finance` | Add separated event/non-IPL breakdown without changing legacy fields consumed by existing Reports UI. |

## Request Payloads

`/events/list`

```json
{
  "status": "active",
  "include_deleted": false
}
```

`/events/create` and `/events/update`

```json
{
  "event_id": "uuid-for-update-only",
  "event_code": "HUT-PV-2026",
  "title": "HUT Palm Village 2026",
  "description": "Kegiatan warga",
  "event_date": "2026-08-17T00:00:00.000Z",
  "end_date": "2026-08-17T12:00:00.000Z",
  "location": "Club House",
  "status": "active"
}
```

`/events/members/assign`

```json
{
  "event_id": "uuid",
  "profile_id": "uuid",
  "assignment_role": "event_treasurer"
}
```

`/incomes/create` and `/incomes/update`

```json
{
  "income_id": "uuid-for-update-only",
  "income_date": "2026-08-01",
  "scope": "event",
  "event_id": "uuid",
  "category": "Sponsor",
  "source_name": "Sponsor A",
  "amount": 1500000,
  "payment_method": "bank_transfer",
  "reference_number": "TRX-001",
  "description": "Sponsor acara"
}
```

`/reports/event-finance`

```json
{
  "event_id": "uuid",
  "from": "2026-08-01",
  "to": "2026-08-31",
  "category": "Sponsor"
}
```

## Validation Rules

- `event_id` must be a UUID and must reference an event with `deleted_at is null`.
- New income/expense transactions are rejected for `cancelled` or `archived` events.
- `amount` must be positive.
- `scope = general` requires `event_id = null`.
- `scope = event` requires `event_id`.
- `category`, `source_name`, and `description` must not be blank.
- Upload endpoints keep the current JPG/PNG and 2 MB limits.
- Audit metadata must not include App JWT, provider credentials, or file binary content.

## Audit Actions

Required mutation audit actions:

- `event.create`, `event.update`, `event.delete`
- `event_member.assign`, `event_member.revoke`
- `income.create`, `income.update`, `income.delete`
- `expense.create`, `expense.update`, `expense.delete`

Financial/admin mutation workflows should fail closed if the audit insert fails.

## Implementation Status

- Local schema migration exists: `supabase/migrations/202608010001_event_finance_foundation.sql`.
- Frontend service/UI contracts exist for the routes above.
- Production n8n workflow source for these event endpoints is not present in this repository yet.
- Do not mark API tasks complete until workflows are created, published in the intended environment, and negative tests pass.
