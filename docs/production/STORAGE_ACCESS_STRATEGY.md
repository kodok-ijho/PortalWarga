# Portal Warga Palm Village - Storage Access Strategy

> Purpose: define how app files are uploaded, viewed, and recorded in production while keeping monthly cost as close to zero as possible.
>
> Source of truth:
> - `docs/production/TASKLIST.md`
> - `docs/production/REQUIREMENTS.md`
> - `supabase/migrations/202607080001_initial_production_schema.sql`
>
> Decision date: 2026-07-08.
>
> Current decision: payment proof files use Google Drive as the primary storage. The file itself may be public-by-link, but the parent Drive folder must not be publicly browsable.

---

## 1. What "File" Means

CSV import files are operational files, not app storage files.

CSV rules:

- CSV files are handled by admin/operator only.
- CSV files should not be uploaded into the public app storage buckets.
- CSV imports must follow `docs/production/DATA_IMPORT_PLAN.md`.

App storage files are files referenced by app data:

- Payment proof files: stored in Google Drive by default, with public-by-link file access.
- Expense receipt files: may also use Google Drive for zero monthly cost; access policy can be stricter later if needed.
- Supabase Storage buckets remain available as fallback/future option.

---

## 2. Access Model

Production default for payment proofs:

1. Frontend sends the resized image to n8n.
2. n8n verifies App JWT, approval status, role, and ownership before accepting upload.
3. n8n uploads the file into a private Google Drive folder.
4. n8n sets permission on that Drive file only: anyone with the link can view.
5. n8n stores file metadata in Supabase:
   - `payments.proof_file_provider = 'google_drive'`
   - `payments.proof_file_id`
   - `payments.proof_file_url`
   - `payments.proof_file_name`
   - `payments.proof_file_mime_type`
   - `payments.proof_file_size`
6. Frontend/admin pages display the stored file link when business rules allow the payment row to be viewed.
7. n8n writes an `audit_logs` row for upload and metadata attachment.

Important distinction:

- The Google Drive file may be public-by-link.
- The parent Google Drive folder must not be shared publicly.
- Do not expose a folder URL in the app.
- Supabase stores the file link and metadata, not the folder link.

Supabase Storage fallback:

- Supabase buckets remain private.
- If the project later needs stricter access, n8n can switch back to Supabase Storage signed URLs without changing the payment domain model too much.

---

## 3. Role Rules

CSV import files:

| Action | Allowed Role |
| --- | --- |
| Prepare CSV | Admin/operator |
| Upload/import CSV | Admin/operator |
| View CSV source data | Admin/operator |

Payment proof files:

| Action | Warga | Pengurus | Bendahara | Admin |
| --- | --- | --- | --- | --- |
| Upload own transfer proof | Yes | Yes | Yes | Yes |
| View own payment proof link | Yes | Yes | Yes | Yes |
| View all payment proof links in app | No | No | Yes | Yes |
| Approve/reject proof | No | No | Yes | Yes |

Public-by-link note:

- Anyone who receives the Google Drive file link can view the image.
- The application still controls who can discover the link from Supabase/n8n UI.

Expense receipt files:

| Action | Warga | Pengurus | Bendahara | Admin |
| --- | --- | --- | --- | --- |
| Upload expense receipt | No | No | Yes | Yes |
| View expense receipt | No | Yes | Yes | Yes |
| Delete/replace receipt | No | No | Yes | Yes |

Profile avatar files:

| Action | Rule |
| --- | --- |
| Google avatar URL | Prefer storing remote URL in `profiles.avatar_url` without copying the file unless needed |
| Uploaded avatar | User can upload own avatar later if the feature is built |
| Staff access | Staff can view avatar through normal profile endpoints |

---

## 4. Link Expiry and Sharing

Google Drive payment proof default:

- Google Drive file links do not expire by default.
- This is accepted for payment proof files under the current zero-monthly-cost decision.
- The file link should be treated as public-by-link, not secret.
- The folder must remain private to avoid public browsing of all files.

Supabase Storage fallback:

- If Supabase signed URLs are used later, default signed read URL expiry is `600` seconds.
- If Supabase signed upload URLs are used later, default signed upload URL expiry is `300` seconds.
- Do not store Supabase signed URLs in database.

---

## 5. Allowed File Types and Size

Allowed extensions:

- `jpg`
- `jpeg`
- `png`

Allowed MIME types:

- `image/jpeg`
- `image/png`

Max file size:

- 2 MB per file.

Rules:

- Client should resize/compress before upload.
- n8n must still validate MIME type and file size server-side.
- Do not allow `pdf`, `webp`, executable files, archives, or office documents in the first production version.
- Use a random suffix in object paths so two files with the same original name do not collide.

---

## 6. Standard Google Drive Naming

"Path file standar" previously meant a Supabase Storage object key. With Google Drive primary storage, the equivalent is a stable file naming convention plus Drive metadata.

Google Drive folder layout:

- Root folder: `Portal Warga Palm Village`
- Child folder: `payment-proofs`
- Optional child folders by period: `payment-proofs/{period}`

Payment proof file name:

```text
{period}__unit-{unit_id}__payment-{payment_id}__{random_suffix}.{ext}
```

Example:

```text
2026-08__unit-12__payment-2b842a6d-6dd3-4ad4-84f0-a36e7fd0373e__f8k2p9.jpg
```

Database fields:

- `payments.proof_file_provider`: `google_drive`
- `payments.proof_file_id`: Drive file id
- `payments.proof_file_url`: public-by-link Drive view URL
- `payments.proof_file_name`: generated file name
- `payments.proof_file_mime_type`: MIME type
- `payments.proof_file_size`: byte size
- `payments.proof_file_path`: legacy/fallback field; leave null for Google Drive uploads unless needed

---

## 7. n8n Endpoint Contracts

Recommended endpoints:

```text
POST /portal-v1/files/payment-proof/upload
POST /portal-v1/files/expense-receipt/upload
```

Payment proof upload request:

```jsonc
{
  "entity_id": "payment_or_expense_uuid",
  "file_name": "bukti-transfer.jpg",
  "mime_type": "image/jpeg",
  "file_size": 1240000,
  "file": "multipart-form-data-or-base64-depending-on-n8n-implementation"
}
```

Payment proof upload response:

```json
{
  "ok": true,
  "data": {
    "provider": "google_drive",
    "file_id": "drive-file-id",
    "file_url": "https://drive.google.com/file/d/.../view",
    "file_name": "2026-08__unit-12__payment-id__random.jpg"
  },
  "error": null
}
```

Read behavior:

- No signed read URL is needed for Google Drive public-by-link files.
- The app reads `proof_file_url` from Supabase/n8n payment data and opens it directly.
- The app must never expose the parent Drive folder URL.

Server-side validation:

- Reject missing JWT.
- Reject pending/rejected/suspended users.
- Reject unsupported MIME.
- Reject files above 2 MB.
- Reject user-provided full Drive paths or folder links.
- For warga, allow only own payment proof.
- For bendahara/admin, allow payment proof review.
- For expense receipt read, allow pengurus+.
- For expense receipt write, allow bendahara/admin.

---

## 8. Audit Log Actions

Recommended actions:

| Action | When |
| --- | --- |
| `file.google_drive_upload` | n8n uploads a file to Google Drive |
| `file.google_drive_permission_set` | n8n sets file permission to public-by-link |
| `payment.proof_uploaded` | payment proof file metadata is attached to a payment |
| `expense.receipt_uploaded` | expense receipt file metadata is attached to an expense |
| `file.access_denied` | a user requests a file they cannot access |

Audit metadata should include:

- `provider`
- `drive_file_id`
- `drive_view_url`
- `entity_type`
- `entity_id`
- `mime_type`
- `file_size`

For Google Drive public-by-link, storing the view URL is intentional.
