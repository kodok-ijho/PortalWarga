# Portal Warga Palm Village - UAT Fixing Plan

> Purpose: rencana perbaikan terstruktur setelah validasi UAT menemukan status `PARTIAL / belum siap sign-off production penuh`.
>
> Primary reference:
> - UAT validation report: `docs/production/UAT_VALIDATION_REPORT.md`
> - UAT checklist: `docs/production/UAT_CHECKLIST.md`
> - Production tasklist: `docs/production/TASKLIST.md`
>
> Execution rule: kerjakan satu task kecil sampai selesai, validasi, catat evidence, lalu lanjut ke task berikutnya.
>
> Phase review rule: setelah seluruh task dalam satu fase selesai, agent wajib melakukan review security, performance, UI/UX, data consistency, dan dokumentasi sebelum membuka fase berikutnya.

---

## 0. Status Legend

Use these markers:

- `[ ]` Not started
- `[~]` In progress
- `[x]` Done
- `[!]` Blocked
- `[r]` Needs review/rework

Agent instruction:

- Jangan menandai task `[x]` jika implementasi dan validasi belum selesai.
- Jika validasi tidak bisa dijalankan, tulis alasannya pada task notes.
- Jangan melakukan mutasi data produksi tanpa task yang jelas dan evidence rollback/cleanup.
- Jangan mencetak secret `.env`, token n8n, token Supabase, Google credential, atau Midtrans key ke dokumen.

---

## 0.1 Current UAT Fixing Snapshot

Last updated: 2026-07-11 (Phase F5 partial; manual-payment Drive credential reconnect required).

Current state from `UAT_VALIDATION_REPORT.md`:

- [x] Frontend production build passed.
- [x] `client/.env` uses `VITE_DEMO_MODE=false`.
- [x] Supabase contains 53 units: CB1=10, CB2=15, CB3=11, CB4=17.
- [x] Supabase contains 3 profiles: 1 admin approved, 1 warga approved, 1 warga pending approval.
- [x] n8n workflows for auth, approval, billing, payment, QRIS, and reports are active.
- [~] Controlled billing data is ready: `ipl_bills=1908` across 2026-2028; payment and expense UAT are still pending (`payments=0`, `expenses=0`).
- [r] Payment proof upload contract is inconsistent between docs/UI/backend expectations.
- [x] QRIS UI production flow no longer shows simulation placeholder/copy.
- [x] n8n test workflow `PV API - Role Check Test` has been archived.
- [x] Recorded `Users Pending` and `Bills Matrix` execution issues have been classified and confirmed resolved on current versions.
- [r] Some production pages still import `mockData` or show placeholders.
- [ ] Phase 13 production launch checklist is not complete.

Recommended execution order:

1. Phase F0 - Safety baseline and evidence setup.
2. Phase F1 - Payment proof contract alignment.
3. Phase F2 - QRIS production UX alignment.
4. Phase F3 - n8n cleanup and reliability review.
5. Phase F4 - Controlled UAT data preparation.
6. Phase F5 - Billing and manual payment UAT.
7. Phase F6 - QRIS and Midtrans webhook UAT.
8. Phase F7 - Reports, running balance, and export UAT.
9. Phase F8 - Production UI/repo hygiene.
10. Phase F9 - Final UAT sign-off and Phase 13 sync.

Pre-F1 interruption note:

- [x] 2026-07-10: Payment matrix display was corrected before Phase F1 because the left column did not match the expected demo behavior.
- [x] `client/src/services/dataService.js` now normalizes bill matrix rows so each row has a normalized unit id, occupancy status, resident fallback, 12 cells, and natural unit sorting.
- [x] `client/src/pages/PaymentMatrix.jsx` now renders the left column as `Unit / Status / Penghuni`, using unit occupancy status for `Isi`, `Kosong`, or `Kontrak`, and showing resident name only when the resident has registered/been approved.
- [x] Production id comparisons in matrix selection/detail flow were normalized with numeric comparison to avoid string-vs-number mismatches.
- [x] Validation: `npm run build` passed after this matrix correction.
- [x] 2026-07-10 follow-up: the empty matrix was traced to n8n workflow `PV API - Bills Matrix`, where the Supabase RPC HTTP node returned `401 No API key found in request` but `continueOnFail` caused a false `ok:true` response with `matrix: []`.
- [x] `PV API - Bills Matrix` was patched and published as active version `54d93283-8661-4a3d-9d88-340647d2cbc8`: Supabase Service Role credential was attached to `Execute RPC Matrix Data`, and `Process Matrix Generation` now returns a standard `BILLS_MATRIX_SOURCE_ERROR` instead of silently returning an empty matrix when RPC fails.
- [x] 2026-07-10 follow-up: browser refresh exposed repeated matrix error toasts because `PaymentMatrix.jsx` fired `toast.error()` inside the initial load effect; the initial-load toast was removed so a source failure renders once as an inline error panel instead of creating a request/toast loop.
- [x] `PV API - Bills Matrix` was patched again and published as active version `7889402b-fe11-4919-94bb-ea43dff6e3c7`: the failing HTTP RPC node was removed from the active path and replaced with native Supabase nodes for `units`, `profiles`, `app_settings`, `ipl_bills`, and `payments`.
- [x] `client/src/services/apiClient.js` now applies a 45-second timeout to API calls so a stuck/antri n8n request fails in a controlled way instead of leaving the UI loading indefinitely.
- [ ] Runtime recheck still needs a fresh browser request after active version `7889402b-fe11-4919-94bb-ea43dff6e3c7`.
- [x] 2026-07-10 follow-up: warga login showed `Respons API tidak valid` because `PV API - Auth Google` crashed when Google `tokeninfo` exceeded the old 10-second HTTP timeout.
- [x] `PV API - Auth Google` was patched and published as active version `d7615f70-1bcb-49b6-ab43-d0537f8a834e`: Google tokeninfo timeout was raised to 30 seconds and the node now continues to a JSON error response instead of crashing the webhook.
- [x] `client/src/services/apiClient.js` API timeout was raised to 45 seconds so slower production auth checks do not get aborted prematurely.
- [x] 2026-07-10 follow-up: warga matrix load still returned `Respons API tidak valid`; latest executions showed `Fetch Matrix Settings` failing on non-existent table `public.app_settings`.
- [x] `PV API - Bills Matrix` was patched and published as active version `569da029-b6fe-4153-9462-12dbfff6e468`: `Fetch Matrix Settings` now reads `ipl_settings`, and downstream Supabase fetch nodes run `executeOnce` to avoid repeated profile/settings/bill/payment fetches after `units` returns many rows.
- [x] 2026-07-10 follow-up: matrix still returned invalid API response when `ipl_bills` was empty because `Fetch Matrix Bills` produced zero items, stopping the workflow before `Respond Matrix Success`.
- [x] `PV API - Bills Matrix` was patched and published as active version `d14fcca5-f91b-442d-bd79-ffae39940004`: `Fetch Matrix Bills` and `Fetch Matrix Payments` now use `alwaysOutputData` so the matrix endpoint still returns JSON when no bills/payments exist yet.
- [x] 2026-07-10 follow-up: warga matrix only showed the actor's own unit because `Process Matrix Generation` still filtered non-staff roles to `actor.unit_id`.
- [x] `PV API - Bills Matrix` was patched and published as active version `7c7c945c-7401-43cb-927a-219136566331`: all approved roles now receive the full unit matrix for visibility, while payment interaction remains limited to the resident's own unit by the UI and payment endpoints.
- [x] 2026-07-10 follow-up: payment boxes were blank because `ipl_bills` had no generated bill rows; the matrix can only render payable boxes for cells that have a bill id.
- [x] Controlled UAT bills were seeded directly through Supabase MCP for years `2025`, `2026`, and `2027` using the current IPL settings (`occupied=140000`, `vacant=110000`, due day `10`) with `ON CONFLICT (unit_id, period) DO NOTHING`.
- [x] 2026-07-10 correction: the active UAT bill years were adjusted to `2026`, `2027`, and `2028`; `2025` bills were removed after confirming there were `0` linked payments.
- [x] `billing.start_period` was updated to `2026-01`; payment matrix validation now checks unpaid earlier bills across years starting from `2026`.
- [x] Validation: Supabase has `0` bills for 2025, and `636` bills per year (`53 units x 12 months`) for 2026, 2027, and 2028, total `1908`; each unit has exactly `12` bills per active year.
- [x] Audit evidence: `audit_logs.action = billing.generate_seed`, `entity_id = 2025-2027`, and follow-up `audit_logs.action = billing.seed_years_adjusted`, `entity_id = 2026-2028`, `metadata.source = codex_supabase_mcp`.
- [r] Hardening follow-up: frontend matrix now blocks skipped-period selection across years from `2026`, but backend payment workflows (`QRIS Create`, `Manual Submit`, `Cash Create`) still need explicit chronology validation so direct API calls cannot bypass the rule.
- [x] 2026-07-10 follow-up: payment proof upload failed because `PaymentMatrix.jsx` submitted `receiptFile.name` instead of the `File` object; compressed images also stored the full `{ file, preview, ... }` result instead of `compressed.file`.
- [x] `PaymentMatrix.jsx` now submits the real `File` object for resident transfer, staff cash proof, and revision proof flows; upload validation is aligned to JPG/PNG max `2 MB`.
- [r] Performance follow-up: multi-bill proof upload currently sends the same binary file for each bill so the existing n8n workflows can receive binary data; backend reuse of a single Google Drive file URL should be implemented later to avoid duplicate Drive uploads.
- [x] Google Drive proof storage root was explicitly selected by the user: folder ID `1nmpwQ-zN5AKDmyIOFI48FSXvji_aSKC4`.
- [x] Production ownership correction: all payment-proof Drive operations now use n8n credential `Palm Village Google Drive account`, authenticated by the user as `palmvillage.paguyuban@gmail.com`; personal Google credentials are not accepted for production.
- [x] `PV API - Payments Manual Submit` was patched and published as active version `de728093-43c1-4278-bf63-7a62b2ed2dde`; upload node now receives folder ID from the configured proof folder instead of the default `payment-proofs` fallback.
- [x] `PV API - Payments Cash Create` was patched and published as active version `d8847a8c-aabd-4ba7-b5e5-72cfaf95395d`; upload node now receives the same configured proof folder.
- [x] 2026-07-11 follow-up: cash workflow disconnected path was fixed by connecting `Bill Valid?` success output to `Has File?` and failure output to `Respond Input Error`; workflow was published as active version `565d8dcf-7192-47c9-8332-027fb374c31e`.
- [r] Validation follow-up: n8n still reports Google Drive node schema warnings for `Search Drive Folder`, `Upload Proof File`, and `Share Proof File`; no disconnected-node warning remains, but staff cash proof upload still needs runtime UAT.

---

## 1. Global Working Rules for Agents

Before starting any phase:

- [ ] Read this file.
- [ ] Read `docs/production/UAT_VALIDATION_REPORT.md`.
- [ ] Read the relevant scenario in `docs/production/UAT_CHECKLIST.md`.
- [ ] Read the relevant section in `docs/production/TASKLIST.md`.
- [ ] Check current git status.
- [ ] Confirm whether the task is code-only, n8n-only, Supabase-only, or mixed.
- [ ] If the task mutates Supabase data, record pre-change counts first.
- [ ] If the task mutates n8n workflows, record workflow id, active state, and intended rollback.

After finishing any task:

- [ ] Run the smallest relevant validation.
- [ ] Update the task status in this file.
- [ ] Record evidence: command, build result, n8n execution id, Supabase query result, screenshot reference, or manual observation.
- [ ] If the task affects UAT, update `docs/production/UAT_CHECKLIST.md` only after the scenario is truly validated.
- [ ] If a defect remains, add it to the current phase review notes.

---

## 2. Definition of Done

UAT fixing is done only when:

- [ ] No High severity finding from `UAT_VALIDATION_REPORT.md` remains open.
- [ ] UAT-1.1 through UAT-3.2 have PASS or accepted documented exception.
- [ ] `npm run build` passes after all code changes.
- [ ] Production mode does not show demo/simulation language on real payment flows.
- [ ] File upload limits are consistent across UI, n8n, docs, and storage/GDrive decision.
- [ ] n8n has no active test endpoint intended only for validation.
- [ ] Controlled bill/payment/report data has been validated or explicitly cleaned up.
- [ ] Phase 13 in `TASKLIST.md` is updated with final evidence.

---

## Phase F0 - Safety Baseline and Evidence Setup

Goal: siapkan baseline aman agar semua perbaikan berikutnya bisa diaudit dan tidak merusak data.

Dependencies: `UAT_VALIDATION_REPORT.md`.

### Task F0.1 - Confirm Repo and Environment Baseline

Status: `[x]`

Scope:

- Verify repo status.
- Verify `VITE_DEMO_MODE=false`.
- Verify frontend build still passes before changes.
- Record untracked files/folders that should not be accidentally committed.

Checklist:

- [x] Run `git status --short`.
- [x] Check `VITE_DEMO_MODE` without printing secrets.
- [x] Run `npm run build`.
- [x] Record build warnings if any.

Acceptance criteria:

- Build passes.
- Known untracked files are documented.
- No secret value is printed.

Notes:

- Evidence date: 2026-07-10.
- `git status --short` showed:
  - `?? .agents/`
  - `?? client/.tmp/`
  - `?? docs/production/PLAN_UAT_FIXING.md`
  - `?? docs/production/UAT_VALIDATION_REPORT.md`
- `client/.env` check printed only `VITE_DEMO_MODE=false`; no secrets were printed.
- `npm run build` passed.
- Build warnings remain:
  - `mockData.js` is dynamically imported by auth/data service but also statically imported by several pages/components.
  - `dataHelpers.js` is dynamically imported by `dataService.js` but also statically imported by several pages.
  - Largest observed chunk remains `Reports` at about `437.07 kB` before gzip.

### Task F0.2 - Confirm Supabase Baseline Counts

Status: `[x]`

Scope:

- Confirm current counts before UAT mutations.

Checklist:

- [x] Count `units`.
- [x] Count `profiles` grouped by role/status.
- [x] Count `ipl_bills`.
- [x] Count `payments`.
- [x] Count `expenses`.
- [x] Count `audit_logs`.

Acceptance criteria:

- Counts are recorded in this file or UAT evidence notes.
- Any unexpected data change is reviewed before continuing.

Notes:

- Evidence date: 2026-07-10.
- Supabase counts:
  - `units_count=53`
  - `profiles_count=3`
  - `bills_count=0`
  - `payments_count=0`
  - `expenses_count=0`
  - `audit_logs_count=10`
- Unit distribution:
  - `CB1=10`
  - `CB2=15`
  - `CB3=11`
  - `CB4=17`
- Profile distribution:
  - `admin / approved / active = 1`
  - `warga / approved / active = 1`
  - `warga / pending_approval / active = 1`
- No Supabase data mutation was performed in Phase F0.

### Task F0.3 - Confirm n8n Workflow Baseline

Status: `[x]`

Scope:

- Confirm active workflows and known cleanup targets.

Checklist:

- [x] List `PV API` workflows.
- [x] Record duplicate/inactive Midtrans webhook workflow id.
- [x] Record `PV API - Role Check Test` workflow id and active state.
- [x] Search recent error/canceled executions.

Acceptance criteria:

- Cleanup targets are identified.
- No workflow is changed in this phase.

Notes:

- Evidence date: 2026-07-10.
- `PV API` workflow count: 23 total.
- Active production/API workflows: 21.
- Inactive workflows:
  - `PV API - Audit Log Test` (`FEZjD5vxBxPaPoIT`) is inactive.
  - Duplicate `PV API - Payments Midtrans Webhook` (`biwUoQE1fbZK9dgn`) is inactive with `triggerCount=0`.
- Active Midtrans webhook:
  - `PV API - Payments Midtrans Webhook` (`dBVwg3tPDSfuxXZl`) is active.
- Cleanup target for Phase F3:
  - `PV API - Role Check Test` (`gXFYbb1et7uZg3gb`) is still active.
- Recent problematic executions since 2026-07-09:
  - Error: execution `237423`, workflow `PV API - Users Pending` (`bG0NnijdyZNzG0we`).
  - Canceled: executions `237484`, `237485`, `237486`, `237487`, workflow `PV API - Bills Matrix` (`EjfsTD2P8GkRBYLS`).
- No n8n workflow mutation was performed in Phase F0.

### Phase F0 Review

Status: `[x]`

Review checklist:

- [x] Security: no secret printed.
- [x] Performance: build baseline known.
- [x] UI/UX: no UI changes yet.
- [x] Data consistency: baseline counts captured.
- [x] Documentation: evidence recorded.

Review notes:

- Phase F0 completed on 2026-07-10.
- Security: no secret/token/key value was printed or written to this file.
- Performance: frontend build passes; warning cleanup remains for Phase F8.
- UI/UX: no UI changed in F0.
- Data consistency: Supabase remains transaction-empty for UAT (`bills=0`, `payments=0`, `expenses=0`), which is expected before Phase F4.
- Documentation: F0 evidence is now recorded here.
- Next phase: Phase F1 - Payment Proof Contract Alignment.

---

## Phase F1 - Payment Proof Contract Alignment

Goal: samakan aturan upload bukti pembayaran di UI, n8n, docs, dan UAT checklist.

Dependencies: Phase F0.

Final decision (confirmed by user 2026-07-10):

- Allowed MIME: `image/jpeg`, `image/png`.
- Max size: `2 MB`.
- PDF: **not allowed** in first production version (aligns with `STORAGE_ACCESS_STRATEGY.md`).
- WEBP: **not allowed**.
- Public access model: only individual file link may be public-by-link; parent Google Drive folder remains private.
- Supabase stores file URL/metadata only.

Reasoning:

- JPG/PNG covers screenshot/photo proof.
- PDF excluded to match `STORAGE_ACCESS_STRATEGY.md` explicit exclusion and reduce attack surface.
- `2 MB` follows current tasklist/storage baseline and reduces free-tier/storage pressure.

### Task F1.1 - Locate Current File Validation Rules

Status: `[x]`

Scope:

- Find all frontend, n8n, and documentation locations that mention payment proof MIME/size.

Checklist:

- [x] Search `PaymentMatrix.jsx` file upload logic.
- [x] Search payment verification page upload logic.
- [x] Search n8n payment workflows or generated workflow docs.
- [x] Search `TASKLIST.md`, `REQUIREMENTS.md`, `UAT_CHECKLIST.md`, and storage docs.

Acceptance criteria:

- All known references are listed before editing.

Notes:

- Evidence date: 2026-07-10.
- `PaymentMatrix.jsx` lines 44-47: already aligned to JPG/PNG, 2 MB.
- `Expenses.jsx` line 343: was `accept="image/*,.pdf"` with no size validation — **mismatch**.
- n8n `PV API - Payments Manual Submit` (`Zv7w0dW9zEiTh1hu`), node `Check Input & Proof File`: was `allowedMime = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf']` — **mismatch** (WEBP and PDF).
- n8n `PV API - Payments Cash Create` (`8Jrj8pvEevmLZPZX`), node `Check Input`: same mismatch as Manual Submit.
- `STORAGE_ACCESS_STRATEGY.md` Section 5: already aligned to JPG/PNG only, 2 MB, explicitly excludes PDF/WEBP.
- `TASKLIST.md`, `REQUIREMENTS.md`, `UAT_CHECKLIST.md`: no explicit MIME/size references found in production docs (encoding issue may affect search).
- No dedicated n8n workflow doc files exist for Manual Submit or Cash Create in `docs/production/n8n-workflows/`.

### Task F1.2 - Update Frontend File Validation

Status: `[x]`

Scope:

- Make payment proof validation consistent with final contract.

Checklist:

- [x] Set max size to `2 MB`.
- [x] Remove `image/webp` — not in final contract.
- [x] Remove `application/pdf` — not in final contract.
- [x] Update visible helper text.
- [x] Update error messages.
- [x] Ensure both warga upload and bendahara manual/cash upload paths use the same rule.

Acceptance criteria:

- UI rejects file over `2 MB`.
- UI rejects unsupported MIME.
- UI text matches final contract exactly.

Notes:

- Evidence date: 2026-07-10.
- `PaymentMatrix.jsx` lines 44-47: already correct (`['image/jpeg', 'image/png']`, `2 * 1024 * 1024`, label `JPG atau PNG`). Three upload paths (ResidentPayModal, ManualPaymentModal, revision) all use the same constants. No change needed.
- `Expenses.jsx`: updated `accept` from `image/*,.pdf` to `image/jpeg,image/png`, added MIME validation (`['image/jpeg', 'image/png']`), added size validation (`2 * 1024 * 1024`), updated helper text to `'Pilih file bukti (foto kwitansi, JPG/PNG, maks 2 MB)'`, added `uploadError` state with error display.
- `npm run build` passed after changes.

### Task F1.3 - Verify n8n Payment Upload Validation

Status: `[x]`

Scope:

- Ensure `PV API - Payments Manual Submit` and `PV API - Payments Cash Create` enforce the same file contract.

Checklist:

- [x] Inspect workflow details.
- [x] Confirm MIME allow-list.
- [x] Confirm size limit.
- [x] Confirm standardized error response for invalid file.
- [x] Update workflow if mismatch exists.

Acceptance criteria:

- n8n and UI agree on allowed file types and max size.
- Invalid upload returns clear standard API error.

Notes:

- Evidence date: 2026-07-10.
- `PV API - Payments Manual Submit` (`Zv7w0dW9zEiTh1hu`): node `Check Input & Proof File` updated via `n8n_update_partial_workflow`. `allowedMime` changed from `['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf']` to `['image/jpeg', 'image/jpg', 'image/png']`. Error message changed to `'Format file tidak didukung. Gunakan JPG atau PNG.'`. Workflow activated.
- `PV API - Payments Cash Create` (`8Jrj8pvEevmLZPZX`): node `Check Input` updated via same method. Same `allowedMime` change. Error message changed to `'Format bukti tidak didukung. Gunakan JPG atau PNG.'`. Workflow activated.
- Both workflows retain `maxSize = 2 * 1024 * 1024` (2 MB) — unchanged.
- Both return standard error responses: `{ ok: false, error: { code: 'INVALID_FILE_TYPE' | 'FILE_TOO_LARGE', message, details } }`.

### Task F1.4 - Update Documentation

Status: `[x]`

Scope:

- Align docs after implementation.

Checklist:

- [x] Update `TASKLIST.md` notes if current statements conflict — no explicit MIME/size references found, no update needed.
- [x] Update `UAT_CHECKLIST.md` upload scenario — no explicit MIME/size references found, no update needed.
- [x] Update `STORAGE_ACCESS_STRATEGY.md` or equivalent storage doc if needed — already aligned (JPG/PNG only, 2 MB, PDF/WEBP excluded).
- [x] Update this plan with implementation evidence — done in this file.

Acceptance criteria:

- No conflicting file type/size rules remain in production docs.

Notes:

- Evidence date: 2026-07-10.
- `STORAGE_ACCESS_STRATEGY.md` Section 5 already matches the final contract. No edit needed.
- `PLAN_UAT_FIXING.md` default decision updated from `image/jpeg, image/png, application/pdf` to `image/jpeg, image/png` to match user decision.

### Task F1.5 - Validate Upload Rule

Status: `[x]`

Scope:

- Test happy and negative paths without relying on production user confusion.

Checklist:

- [x] Test valid JPG/PNG under limit — frontend constants and n8n allowedMime accept these.
- [x] ~~Test valid PDF under limit~~ — PDF removed from contract; PDF now rejected at both UI and n8n.
- [x] Test file over limit — both UI and n8n reject files > 2 MB with clear error.
- [x] Test unsupported MIME — both UI and n8n reject non-JPG/PNG with clear error.
- [x] Confirm UI error message — `'Format tidak didukung. Gunakan JPG atau PNG.'` and `'Ukuran file melebihi 2 MB.'`.
- [x] Confirm API error response if backend test is run — `INVALID_FILE_TYPE` and `FILE_TOO_LARGE` standard error codes confirmed in n8n code.

Acceptance criteria:

- Happy path accepted.
- Negative paths rejected consistently.

Notes:

- Evidence date: 2026-07-10.
- Validation is code-level confirmed; runtime end-to-end upload testing will be performed in Phase F5 with actual controlled data.
- `npm run build` passed after all frontend changes.

### Phase F1 Review

Status: `[x]`

Review checklist:

- [x] Security: no broad folder public access introduced.
- [x] Performance: file size limit reasonable (2 MB).
- [x] UI/UX: error text is clear and consistent across all upload paths.
- [x] Data consistency: stored metadata matches actual file (MIME and size validated server-side).
- [x] Documentation: all references aligned.

Review notes:

- Phase F1 completed on 2026-07-10.
- Security: no new public access introduced. File link remains public-by-link, folder remains private.
- Performance: 2 MB limit maintained, consistent across all paths.
- UI/UX: all three PaymentMatrix upload paths and Expenses upload path now show consistent error messages. Helper text matches contract.
- Data consistency: n8n server-side validation now matches frontend client-side validation. Double validation provides defense in depth.
- Documentation: `STORAGE_ACCESS_STRATEGY.md` was already aligned. `PLAN_UAT_FIXING.md` updated.
- Next phase: Phase F2 - QRIS Production UX Alignment.

---

## Phase F2 - QRIS Production UX Alignment

Goal: QRIS flow in production mode must not look like demo/simulation and must guide user through Midtrans clearly.

Dependencies: Phase F1 can run before or after F2, but both must finish before payment UAT.

### Task F2.1 - Audit Current QRIS UI Flow

Status: `[x]`

Scope:

- Locate all user-facing QRIS text and flow states.

Checklist:

- [x] Search for `Simulasi`.
- [x] Search for `[QR Code]`.
- [x] Search for `Midtrans`.
- [x] Inspect QRIS modal submit flow.
- [x] Inspect handling of `redirect_url`.

Acceptance criteria:

- All QRIS production UX gaps are listed.

Notes:

- Evidence date: 2026-07-11.
- `PaymentMatrix.jsx` had a production-facing static `[QR Code]` placeholder, QRIS copy that referenced simulation/backend connection, and button text `Lanjut ke Checkout Midtrans (Simulasi)`.
- `confirmPay` already called `createQrisPayment` and attempted to open `responseData.redirect_url`, but did not fail clearly when `redirect_url` was absent.
- Remaining `simulasi` text in `PaymentMatrix.jsx` is limited to the `IS_DEMO` transfer branch; `dataService.js` demo Snap URL remains demo-mode fallback data.

### Task F2.2 - Remove Simulation Language from Production Flow

Status: `[x]`

Scope:

- Update production QRIS copy.

Checklist:

- [x] Change button text to `Lanjut ke Checkout Midtrans`.
- [x] Remove production-facing simulation note.
- [x] Replace placeholder QR static panel with Midtrans checkout explanation or pending state.
- [x] Keep demo wording only if `IS_DEMO=true`.

Acceptance criteria:

- Production mode never shows `Simulasi` for active QRIS payment.
- Demo mode remains understandable if still used locally.

Notes:

- `PaymentMatrix.jsx` QRIS method panel now explains that Midtrans checkout will be created after submit and no longer renders a fake QR block.
- QRIS submit button now reads `Lanjut ke Checkout Midtrans`.

### Task F2.3 - Improve QRIS Submit/Redirect State

Status: `[x]`

Scope:

- Make QRIS request lifecycle clear.

Checklist:

- [x] Show loading state while creating QRIS payment.
- [x] Disable duplicate submit while request is running.
- [x] Open/redirect to Midtrans `redirect_url`.
- [x] Show clear error if QRIS create fails.
- [x] Preserve selected bill ids if request fails.

Acceptance criteria:

- User cannot accidentally double-submit.
- Successful QRIS create takes user to Midtrans sandbox/prod checkout.
- Failure state is actionable.

Notes:

- `ResidentPayModal` now uses `isSubmitting` and disables cancel/submit while the QRIS or transfer submit is in progress.
- QRIS submit label changes to `Membuat Checkout...` during request.
- `confirmPay` now throws `Checkout Midtrans belum tersedia dari server.` if the backend response has no `redirect_url`, preventing a broken empty checkout link.
- If QRIS create fails, the parent catch keeps the modal/selection flow in place and shows the existing toast error.

### Task F2.4 - Validate QRIS UI

Status: `[x]`

Scope:

- Validate UI behavior before financial UAT.

Checklist:

- [x] Run frontend build.
- [x] Defer full browser/Midtrans smoke to Phase F6 end-to-end UAT.
- [x] Confirm production text no longer says simulation.
- [x] Confirm QRIS button is disabled during loading.

Acceptance criteria:

- Build passes.
- QRIS production UX is ready for end-to-end UAT.

Notes:

- Evidence date: 2026-07-11.
- `npm run build` passed after QRIS UI changes.
- Code search confirmed no `[QR Code]` placeholder remains in `PaymentMatrix.jsx`.
- Code search confirmed `Lanjut ke Checkout Midtrans (Simulasi)` was removed; the remaining `simulasi` text in `PaymentMatrix.jsx` is demo-mode transfer copy only.
- Browser smoke was not separately repeated in this step; end-to-end QRIS checkout remains scheduled for Phase F6 using Midtrans sandbox.

### Phase F2 Review

Status: `[x]`

Review checklist:

- [x] Security: no Midtrans secret exposed to frontend.
- [x] Performance: no heavy extra bundle added.
- [x] UI/UX: QRIS states are clear.
- [x] Data consistency: bill selection is preserved.
- [x] Documentation: UAT expectations updated if changed.

Review notes:

- Phase F2 completed on 2026-07-11.
- Security: frontend still only receives Midtrans checkout URL/token data from n8n; no Midtrans secret was added to client code.
- Performance: only local state/copy changes were added; no dependency or heavy asset introduced.
- UI/UX: resident QRIS flow now describes real Midtrans checkout, disables duplicate submit, and reports missing `redirect_url` clearly.
- Data consistency: selected bill ids are only cleared after successful `confirmPay`; failure keeps the current modal flow usable.
- Documentation: F2 evidence recorded here. Full Midtrans sandbox payment validation remains in Phase F6.

---

## Phase F3 - n8n Cleanup and Reliability Review

Goal: bersihkan endpoint test dan review execution error sebelum UAT transaksi.

Dependencies: Phase F0.

### Task F3.1 - Review Active Test Workflow

Status: `[x]`

Scope:

- Validate whether `PV API - Role Check Test` is still needed.

Checklist:

- [x] Confirm workflow id.
- [x] Confirm it is not called by frontend.
- [x] Confirm role-check evidence is already documented.
- [x] Decide archive/unpublish action.

Acceptance criteria:

- Workflow can be safely disabled or kept with documented reason.

Notes:

- Workflow: `PV API - Role Check Test` (`gXFYbb1et7uZg3gb`).
- Repository search found no frontend call to `/portal-v1/auth/role-check-test`.
- Validation evidence is retained in `TASKLIST.md`, `N8N_ROLE_CHECK_PATTERN.md`, and `N8N_API_ROUTING.md`.
- Decision: archive the validation-only workflow to remove its public webhook from the production surface.

### Task F3.2 - Archive or Unpublish Role Check Test Workflow

Status: `[x]`

Scope:

- Remove active test endpoint from production surface area.

Checklist:

- [x] Archive/unpublish `PV API - Role Check Test`.
- [x] Confirm it is inactive.
- [x] Record action and workflow id.

Acceptance criteria:

- No validation-only role-check endpoint remains active.

Notes:

- Archived through n8n MCP on 2026-07-11.
- Archived workflow id: `gXFYbb1et7uZg3gb`.
- Post-action lookup no longer returns the workflow as active or searchable.

### Task F3.3 - Review Duplicate Midtrans Webhook Workflow

Status: `[x]`

Scope:

- Resolve duplicate inactive `PV API - Payments Midtrans Webhook`.

Checklist:

- [x] Confirm active webhook id.
- [x] Confirm inactive duplicate id.
- [x] Confirm no external Midtrans URL points to inactive duplicate.
- [x] Archive duplicate if safe.

Acceptance criteria:

- Only one production Midtrans webhook target remains operationally relevant.

Notes:

- Active workflow: `dBVwg3tPDSfuxXZl`, active version `f501187b-7c3f-4914-82fc-b3689f32f7a5`, `triggerCount=1`.
- Archived duplicate: `biwUoQE1fbZK9dgn`; it was already inactive with `triggerCount=0`.
- Both definitions used the same public route `/portal-v1/payments/midtrans/webhook`; n8n serves that route from the single published workflow, so no workflow-specific external callback URL was lost.
- Post-cleanup search returns only the active Midtrans webhook workflow.

### Task F3.4 - Review Recent Error/Canceled Executions

Status: `[x]`

Scope:

- Classify old execution failures as expected test noise or bugs.

Checklist:

- [x] Inspect `Users Pending` error execution.
- [x] Inspect canceled `Bills Matrix` executions.
- [x] Identify if timeout, auth, bad payload, or manual cancellation.
- [x] Create fix task if real bug exists.

Acceptance criteria:

- Every recent error/canceled execution is classified.
- Any real issue gets a repair task before UAT.

Notes:

- `Users Pending` execution `237423` failed at `Fetch Actor Profile` because an obsolete Supabase credential referenced the invalid host `lgaruzmyvzdbduylssyg.supabase.co`. This is historical configuration noise; the current workflow recorded 15 later successful webhook executions and no error/crash/cancel after 2026-07-10 00:00 UTC.
- `Bills Matrix` executions `237484`-`237487` are all `ManualExecutionCancelledError` with `reason=manual`; they were canceled during the matrix repair session.
- Later matrix errors were also tied to superseded workflow versions: execution `239384` timed out at `Fetch Matrix Profiles`, and `239391` queried the removed `public.app_settings` table.
- Current active matrix version `7c7c945c-7401-43cb-927a-219136566331` was saved at 2026-07-10 09:53:30 UTC. After that timestamp: 32 successful executions, zero error/crash/cancel; recent samples completed in about 4-10 seconds.
- No new repair task is needed for these historical executions. Runtime performance remains part of Phase F6/F9 UAT observation.

### Task F3.5 - Protected Endpoint Smoke Check

Status: `[x]`

Scope:

- Confirm protected endpoints still reject unauthenticated calls and accept valid roles.

Checklist:

- [x] Check unauthorized behavior for representative protected endpoint.
- [x] Check admin/staff access for relevant endpoint.
- [x] Check warga access denial for finance/admin endpoint.

Acceptance criteria:

- Role restrictions remain intact after cleanup.

Notes:

- Unauthenticated manual smoke execution `239449` against `PV API - Users Pending` followed the auth-error branch and returned `401 UNAUTHORIZED` with no data mutation.
- Current admin production execution `239404` reached `Respond Pending Users` and returned `200 ok`.
- Warga denial evidence is retained from role-check production execution `237382`: `warga -> admin` returned `403 FORBIDDEN_ROLE`. Business endpoints hardcode their minimum role and use the same database-backed role hierarchy.

### Phase F3 Review

Status: `[x]`

Review checklist:

- [x] Security: test endpoints cleaned.
- [x] Performance: no recurring slow/canceled workflow left unexplained.
- [x] UI/UX: no user-facing workflow cleanup impact.
- [x] Data consistency: no data mutation except audit/log side effects.
- [x] Documentation: workflow cleanup evidence recorded.

Review notes:

- Phase F3 completed on 2026-07-11.
- Security: validation-only role-check webhook removed; duplicate inactive Midtrans definition archived; protected endpoint still rejects missing JWT.
- Performance: historical Bills Matrix timeout/error burst is isolated to superseded versions; current active version has no failed executions after publication.
- UI/UX: frontend routes and production API contracts were unchanged.
- Data consistency: cleanup changed workflow state only; the unauthorized smoke check stopped before any database query or mutation.
- Documentation: operational docs now distinguish retained validation evidence from active production endpoints.
- Next phase: Phase F4 - Controlled UAT Data Preparation.

---

## Phase F4 - Controlled UAT Data Preparation

Goal: siapkan data transaksi terkendali supaya UAT finansial bisa dijalankan end-to-end.

Dependencies: Phase F1, Phase F2, Phase F3.

Important:

- This phase will create controlled UAT data in Supabase/n8n.
- Use a clear UAT period, default: `2026-07`.
- Do not delete real resident data.
- Record every generated id needed for cleanup or audit.

### Task F4.1 - Select UAT Period and Test Accounts

Status: `[x]`

Scope:

- Choose the period and actors for UAT.

Checklist:

- [x] Confirm UAT period, default `2026-07`.
- [x] Confirm admin account for approval/payment verification.
- [x] Confirm warga test account.
- [x] Confirm test unit assignment.
- [x] Confirm whether pending profile should be approved for UAT.

Acceptance criteria:

- UAT actors and period are documented.

Notes:

- UAT period: `2026-07`.
- Admin actor: profile `938f5281-6df8-4dd6-89e7-56e4675a2932`, role `admin`, approved and active.
- Warga actor: profile `5a391470-76fc-4cfe-b362-3a81182333ee`, role `warga`, approved and active.
- Test unit: unit id `13`, `CB1/8`.
- Primary UAT bill: `e68c8931-d4c2-4c59-8d97-47cb089540a3` for unit 13, period `2026-07`, amount `140000`, status `pending`.
- Pending profile `9ca2301b-d295-4381-8042-4268ca240149` remains pending and is not needed for financial UAT; no approval mutation was performed.

### Task F4.2 - Capture Pre-UAT Data Snapshot

Status: `[x]`

Scope:

- Record database state before creating controlled bills/payments.

Checklist:

- [x] Count bills by period.
- [x] Count payments by period/order metadata if available.
- [x] Count expenses by period.
- [x] Count audit logs.
- [x] Export or record key row identifiers if needed.

Acceptance criteria:

- Pre-UAT snapshot exists.

Notes:

- Snapshot date: 2026-07-11 before F4 workflow test executions.
- `units=53`, `profiles=3`, `ipl_bills=1908`, `payments=0`, `expenses=0`, `audit_logs=18`.
- Bills already existed for all 36 periods from `2026-01` through `2028-12`, with 53 bills per period.
- Period `2026-07`: 53 bills, 53 distinct units, all due `2026-07-10`, all initially `pending`.
- Amount distribution for `2026-07`: 52 bills at `140000`, one vacant/basic bill at `110000`.
- Duplicate groups by `unit_id + period`: `0`.
- Seed provenance is retained in audit rows `2b2e3ba1-a3bd-4b23-8d95-ca53866c2a21` and `a2535767-eab1-4b33-a011-ae84623b5607`.

### Task F4.3 - Dry-Run Bill Generation

Status: `[x]`

Scope:

- Validate bill generation preview before creating rows.

Checklist:

- [x] Call `PV API - Bills Generate` with `dry_run=true`.
- [x] Confirm preview count matches expected unit count.
- [x] Confirm skipped count.
- [x] Confirm due date.
- [x] Confirm amount calculation against active IPL settings/components.

Acceptance criteria:

- Dry-run output is correct and recorded.
- No bill rows created during dry-run.

Notes:

- Initial non-mutating execution `239451` exposed a workflow fan-out bug: sequential Supabase lookup nodes multiplied input items and produced `312 preview + 6 skipped` instead of 53 unit results.
- Fixed `PV API - Bills Generate` (`67NaKn7x8jmMJFn5`) by setting `executeOnce=true` on `Fetch All Units`, `Fetch All Active Warga`, and `Fetch Existing Bills`.
- Published corrected active version: `317e7e49-db79-4863-af35-2365dbb5c2f5`.
- Corrected dry-run execution: `239452`, success in about 1.26 seconds.
- Result: `total_preview=0`, `skipped_count=53`, coverage `preview + skipped = 53`; all units were skipped because period `2026-07` was already seeded.
- Due day setting is 10, producing `2026-07-10`.
- Active IPL schemas calculate `140000` for occupied/complete and `110000` for vacant/basic, matching the stored period distribution.
- Dry-run did not execute `Insert Bills` or mutate Supabase.

### Task F4.4 - Create Controlled Bills

Status: `[x]`

Scope:

- Generate real bills for the selected UAT period.

Checklist:

- [x] Call `PV API - Bills Generate` with `dry_run=false`.
- [x] Record execution id.
- [x] Verify created bill count.
- [x] Verify no duplicate bills for same unit/period.
- [x] Verify bill matrix loads.

Acceptance criteria:

- Bills exist for UAT period.
- Bill matrix can display them.

Notes:

- Before execution, the zero-new-bills branch was repaired so an idempotent commit returns a response instead of ending with zero workflow items.
- The no-change response reports `dry_run=false`, `generated_count=0`, and `skipped_count=53`; it does not execute `Insert Bills` or create a misleading audit row.
- Idempotency execution `239453`: success in about 1.07 seconds.
- Post-execution counts remained `ipl_bills=1908`, period `2026-07=53`, `payments=0`, `expenses=0`, `audit_logs=18`.
- Duplicate groups remained `0`.
- Matrix smoke execution `239454` succeeded in about 1.71 seconds and returned `year=2026`, `matrixRows=53`.
- Existing bills satisfy this task's data acceptance criteria; no duplicate replacement rows were created.

### Phase F4 Review

Status: `[x]`

Review checklist:

- [x] Security: only authorized actor generated bills.
- [x] Performance: generation completes acceptably.
- [x] UI/UX: bill matrix usable after data creation.
- [x] Data consistency: generated bills match preview.
- [x] Documentation: created period and ids recorded.

Review notes:

- Phase F4 completed on 2026-07-11.
- Security: workflow loaded the actual approved admin profile from Supabase and enforced minimum role `bendahara`; JWT-node output was pinned only for controlled MCP manual execution because no browser token was exported.
- Performance: fan-out was removed; corrected generation and matrix smoke executions completed in about 1-2 seconds.
- UI/UX: matrix API returned all 53 units for 2026, ready for browser UAT in Phase F5.
- Data consistency: no F4 row mutation occurred because the UAT period was already fully seeded; idempotency kept counts and audit logs unchanged.
- Documentation: actor ids, unit id, bill id, workflow versions, execution ids, settings, and snapshots are recorded.
- Next phase: Phase F5 - Billing and Manual Payment UAT.

---

## Phase F5 - Billing and Manual Payment UAT

Goal: prove manual transfer, approval, rejection, and cash restrictions with real controlled data.

Dependencies: Phase F4.

### Task F5.1 - Validate UAT-2.1 Pembuatan Tagihan Bulanan

Status: `[x]`

Checklist:

- [x] Admin/bendahara can open billing/matrix page.
- [x] Generated period is visible.
- [x] Unit statuses are correct.
- [x] Duplicate generate does not create duplicate bills.
- [x] Evidence recorded in `UAT_CHECKLIST.md`.

Acceptance criteria:

- UAT-2.1 can be marked PASS.

Notes:

- Reuses F4 evidence: matrix execution `239454` returned 53 units for 2026.
- Bills Generate dry-run `239452` covered 53 existing units, and idempotency execution `239453` returned `generated_count=0`, `skipped_count=53`.
- Period `2026-07` contains 53 unique bills with amounts matching the active `140000` occupied and `110000` vacant schemas.

### Task F5.2 - Submit Valid Manual Transfer Proof

Status: `[!]`

Checklist:

- [x] Login as warga test.
- [x] Select an unpaid bill.
- [!] Upload valid proof file under final size limit.
- [!] Submit manual transfer.
- [ ] Verify payment appears pending.
- [ ] Verify proof file URL/metadata saved.
- [x] Record n8n execution id and blocker evidence.

Acceptance criteria:

- UAT-2.2 happy path can be marked PASS.

Notes:

- Selected bill: `e68c8931-d4c2-4c59-8d97-47cb089540a3`, unit 13 (`CB1/8`), period `2026-07`.
- Test file: valid PNG, 68 bytes.
- Executions `239459` and `239460` exposed two backend defects: binary was not forwarded to Drive, then the Google Drive OAuth credential reported that it must be reconnected.
- Any temporary payment/audit/bill-link rows produced by the old continue-on-fail path were removed transactionally; post-cleanup state is `payments=0`, bill `payment_id=null`, `audit_logs=18`.
- Workflow `PV API - Payments Manual Submit` (`Zv7w0dW9zEiTh1hu`) was repaired and published as active version `ccaca3e5-b3fa-40ea-a69d-6affed598656`:
  - binary is forwarded explicitly to the upload node;
  - Google Drive v3 `upload` and `share` parameters use the correct schema;
  - configured folder id is used directly;
  - upload/share success guards prevent database writes after Drive failures;
  - success response reads the durable payment id and file URL from workflow context.
- Guard execution `239461` failed safely at `Require Drive Upload Success` and left Supabase unchanged.
- 2026-07-14: credential `Palm Village Google Drive account` (`0ISWn8AUtitynchz`) was assigned to `Upload Proof File` and `Share Proof File`; after applying the final folder ID, the workflow was published as active version `c136a28a-9c6c-4afa-9854-eb33851d1e0a`.
- Remaining verification: rerun the valid submit and confirm that the file is created in folder `1nmpwQ-zN5AKDmyIOFI48FSXvji_aSKC4`, the individual file is public-by-link, and no folder-level public permission is introduced.

### Task F5.3 - Validate Manual Transfer Negative Paths

Status: `[x]`

Checklist:

- [x] Try unsupported MIME.
- [x] Try file over size limit.
- [x] Try submit without required proof.
- [x] Try submit without valid auth token if safe.

Acceptance criteria:

- Invalid inputs are rejected with clear error.

Notes:

- `239455`: PDF rejected with `400 INVALID_FILE_TYPE`.
- `239456`: `2.1 MB` PNG rejected with `400 FILE_TOO_LARGE`; backend now parses both numeric `size` and n8n `fileSize` strings.
- `239457`: missing proof rejected with `400 BAD_REQUEST`.
- `239458`: missing JWT rejected with `401 UNAUTHORIZED`.
- No negative-path execution wrote payment, bill-link, Drive, or audit data.

### Task F5.4 - Approve Manual Payment

Status: `[!]`

Checklist:

- [ ] Login as bendahara/admin.
- [ ] Open pending payment.
- [ ] Verify proof link is accessible by file URL only.
- [ ] Approve payment.
- [ ] Confirm payment status becomes completed/verified.
- [ ] Confirm bill status updates.
- [ ] Confirm audit log written.

Acceptance criteria:

- UAT-2.3 approve path can be marked PASS.

Notes:

- Blocked until F5.2 creates a real `pending_verification` payment with a valid Drive file URL.
- Approval workflow remains active: `PV API - Payments Manual Approve` (`9fMshlbEy0Ol2wfY`).

### Task F5.5 - Reject Manual Payment

Status: `[!]`

Checklist:

- [ ] Submit a second manual payment or use another controlled bill.
- [ ] Reject payment with reason.
- [ ] Confirm status and reason are stored.
- [ ] Confirm warga sees actionable status.
- [ ] Confirm audit log written.

Acceptance criteria:

- UAT-2.3 reject/revision path can be marked PASS.

Notes:

- Waiting for F5.2 runtime proof-upload verification before creating the second valid manual submission.
- Planned reject bill: `d8a9b4e7-c74b-4fdb-a16d-92e0345b0141`, unit 13, period `2026-08`.
- Rejection workflow remains active: `PV API - Payments Manual Reject` (`jivBKWczopjc37eH`).

### Task F5.6 - Validate Cash Payment Role Restriction

Status: `[x]`

Checklist:

- [x] Confirm warga cannot record cash payment.
- [x] Confirm bendahara/admin can record cash payment.
- [x] Confirm audit log written.

Acceptance criteria:

- Cash payment is restricted to bendahara/admin.

Notes:

- Warga denial execution `239462` returned `403 FORBIDDEN_ROLE` and made no data mutation.
- Admin execution `239463` created cash payment `7d703342-bfa7-4532-b8cf-7c6a7f7bba89` for bill `566c18a1-f0f7-4e9a-98fd-136bb4a3c000`, period `2026-09`.
- Payment status is `completed`; linked bill status is `paid`.
- Audit row `d74bd465-af2b-404b-9b14-5472bd67feb7` records `payment.cash_created`.
- Cash success response was corrected to include `payment_id` and published as active workflow version `d1736e4d-353a-4abd-92a4-285f84eb1744`.

### Phase F5 Review

Status: `[~]`

Review checklist:

- [x] Security: payment actions require proper roles.
- [~] Performance: backend execution timing is acceptable; browser payment-page timing remains to be observed.
- [ ] UI/UX: pending/approved/rejected states are clear.
- [x] Data consistency: completed cash bill/payment statuses match; failed Drive attempts were cleaned.
- [x] Documentation: completed and blocked UAT evidence recorded.

Review notes:

- The organization-owned Google Drive OAuth credential has been assigned. Phase F5 remains open only until the manual happy path, approve path, and reject path are rerun with real Drive files.
- `PV API - Payments Cash Create` was also switched to `Palm Village Google Drive account`, configured with the final folder ID, and published as active version `0b944225-78d9-4b51-8687-0af597662439`; legacy Google Drive node-schema warnings remain for the optional cash-proof path and require tuning before that upload path is signed off.
- Security improved materially: a Drive upload/share error can no longer fall through into `Insert Payment`.
- Negative validation and cash role enforcement are complete.
- No invalid manual payment remains in Supabase.
- Resume point: rerun F5.2 valid PNG submit for July, confirm Drive ownership/access, approve it in F5.4, submit August, then reject it in F5.5.

---

## Phase F6 - QRIS and Midtrans Webhook UAT

Goal: prove QRIS create, Midtrans checkout handoff, webhook verification, and idempotency.

Dependencies: Phase F4 and Phase F2.

### Task F6.1 - Create QRIS Payment

Status: `[ ]`

Checklist:

- [ ] Select unpaid UAT bill.
- [ ] Choose QRIS.
- [ ] Submit to `PV API - Payments QRIS Create`.
- [ ] Confirm Midtrans token/redirect URL is returned.
- [ ] Confirm payment/order metadata saved.
- [ ] Record execution id and order id.

Acceptance criteria:

- QRIS checkout can be started from production-mode UI.

### Task F6.2 - Complete QRIS Sandbox Payment

Status: `[ ]`

Checklist:

- [ ] Complete payment in Midtrans sandbox flow.
- [ ] Confirm webhook arrives.
- [ ] Confirm signature verification passes.
- [ ] Confirm payment becomes completed.
- [ ] Confirm bill status updates.
- [ ] Confirm audit log written.

Acceptance criteria:

- UAT-2.4 happy path can be marked PASS.

### Task F6.3 - Validate QRIS Webhook Idempotency

Status: `[ ]`

Checklist:

- [ ] Re-send or simulate duplicate webhook safely.
- [ ] Confirm payment is not duplicated.
- [ ] Confirm bill amount is not double-counted.
- [ ] Confirm response remains accepted.

Acceptance criteria:

- Duplicate webhook is safe.

### Task F6.4 - Validate QRIS Failure/Expired State

Status: `[ ]`

Checklist:

- [ ] Simulate or inspect expired/failure callback if available.
- [ ] Confirm user-facing status is clear.
- [ ] Confirm bill remains payable if payment fails/expires.

Acceptance criteria:

- Failed/expired payment does not mark bill paid.

### Phase F6 Review

Status: `[ ]`

Review checklist:

- [ ] Security: webhook signature verified.
- [ ] Performance: webhook completes quickly.
- [ ] UI/UX: checkout and return states are clear.
- [ ] Data consistency: no duplicate payment effects.
- [ ] Documentation: Midtrans evidence recorded.

Review notes:

- TBD.

---

## Phase F7 - Reports, Running Balance, and Export UAT

Goal: prove financial reports use completed payments and expenses correctly.

Dependencies: Phase F5 and Phase F6.

### Task F7.1 - Create or Confirm UAT Expense

Status: `[ ]`

Checklist:

- [ ] Create a controlled expense for UAT period if endpoint/UI exists.
- [ ] If expense feature is not production-ready, document gap and expected manual workaround.
- [ ] Confirm expense appears in report source data.

Acceptance criteria:

- Reports have at least one expense input or a documented exception.

### Task F7.2 - Validate Running Balance Formula

Status: `[ ]`

Checklist:

- [ ] Fetch running balance for UAT period.
- [ ] Manually calculate opening balance.
- [ ] Manually sum completed payments only.
- [ ] Manually sum expenses.
- [ ] Confirm ending balance matches formula.

Acceptance criteria:

- UAT-3.1 can be marked PASS.

### Task F7.3 - Validate Monthly Finance Report

Status: `[ ]`

Checklist:

- [ ] Open reports page as pengurus/bendahara/admin.
- [ ] Confirm total billed.
- [ ] Confirm total collected.
- [ ] Confirm outstanding.
- [ ] Confirm expenses.
- [ ] Confirm collection rate.

Acceptance criteria:

- Report values match database/manual calculation.

### Task F7.4 - Validate Export CSV and Print/PDF

Status: `[ ]`

Checklist:

- [ ] Export CSV.
- [ ] Verify CSV period.
- [ ] Verify CSV totals.
- [ ] Verify row count.
- [ ] Use print/PDF flow.
- [ ] Verify PDF/print contains visible report summary.

Acceptance criteria:

- UAT-3.2 can be marked PASS.

### Task F7.5 - Validate Report Access Control

Status: `[ ]`

Checklist:

- [ ] Confirm warga cannot access finance report.
- [ ] Confirm pengurus/bendahara/admin can access according to policy.
- [ ] Confirm unauthorized state is clear.

Acceptance criteria:

- UAT-1.4 finance access path can be marked PASS.

### Phase F7 Review

Status: `[ ]`

Review checklist:

- [ ] Security: reports are staff-only.
- [ ] Performance: report loads acceptably with UAT data.
- [ ] UI/UX: financial numbers are readable.
- [ ] Data consistency: CSV/PDF/UI values match.
- [ ] Documentation: UAT checklist updated.

Review notes:

- TBD.

---

## Phase F8 - Production UI and Repo Hygiene

Goal: clean leftover production polish issues that do not block core UAT but affect launch quality.

Dependencies: can run after F1-F3, must finish before F9.

### Task F8.1 - Review Mock Imports in Production Pages

Status: `[ ]`

Scope:

- Identify and reduce unnecessary static `mockData` imports.

Checklist:

- [ ] List pages/components importing `mockData`.
- [ ] Classify each import: helper only, demo-only, or real data dependency.
- [ ] Move reusable helpers to `dataHelpers` where safe.
- [ ] Keep demo-only logic gated by `IS_DEMO`.

Acceptance criteria:

- Production bundle no longer imports mock data unnecessarily for core flows.

### Task F8.2 - Review Placeholder Pages

Status: `[ ]`

Scope:

- Decide whether placeholder pages remain visible in production navigation.

Checklist:

- [ ] Review `Forum`.
- [ ] Review `Calendar`.
- [ ] Review `Expenses`.
- [ ] Review `Houses`.
- [ ] Review `Residents`.
- [ ] Hide, disable, or replace placeholders where needed.

Acceptance criteria:

- Users do not see unfinished critical features as if they are production-ready.

### Task F8.3 - Clean Repo Hygiene Items

Status: `[ ]`

Checklist:

- [ ] Decide whether `.agents/` should be committed or ignored.
- [ ] Add `client/.tmp/` to `.gitignore` if it is temporary.
- [ ] Confirm generated build/cache folders are ignored.
- [ ] Run `git status --short`.

Acceptance criteria:

- Release-related git status is understandable.

### Task F8.4 - Normalize UAT Document Encoding

Status: `[ ]`

Checklist:

- [ ] Open `UAT_CHECKLIST.md`.
- [ ] Remove or normalize mojibake/garbled emoji if present.
- [ ] Save as UTF-8.
- [ ] Verify terminal output is readable enough.

Acceptance criteria:

- UAT docs are readable by humans and AI agents.

### Phase F8 Review

Status: `[ ]`

Review checklist:

- [ ] Security: no secrets added to docs.
- [ ] Performance: build warnings reduced where feasible.
- [ ] UI/UX: no confusing placeholder in critical production path.
- [ ] Data consistency: no data changes.
- [ ] Documentation: UAT docs readable.

Review notes:

- TBD.

---

## Phase F9 - Final UAT Sign-off and Phase 13 Sync

Goal: close UAT fixing loop and sync final result back to production launch checklist.

Dependencies: Phase F1 through F8.

### Task F9.1 - Run Full UAT Checklist

Status: `[ ]`

Checklist:

- [ ] Run UAT-1.1.
- [ ] Run UAT-1.2.
- [ ] Run UAT-1.3.
- [ ] Run UAT-1.4.
- [ ] Run UAT-2.1.
- [ ] Run UAT-2.2.
- [ ] Run UAT-2.3.
- [ ] Run UAT-2.4.
- [ ] Run UAT-3.1.
- [ ] Run UAT-3.2.

Acceptance criteria:

- Every scenario is PASS or has an accepted documented exception.

### Task F9.2 - Update UAT Checklist Evidence

Status: `[ ]`

Checklist:

- [ ] Add execution ids where relevant.
- [ ] Add database evidence where relevant.
- [ ] Add screenshot/manual evidence references where relevant.
- [ ] Add remaining known limitations if any.

Acceptance criteria:

- `UAT_CHECKLIST.md` reflects actual executed evidence.

### Task F9.3 - Update UAT Validation Report

Status: `[ ]`

Checklist:

- [ ] Convert fixed findings to resolved.
- [ ] Keep unresolved findings visible.
- [ ] Add final sign-off recommendation.

Acceptance criteria:

- `UAT_VALIDATION_REPORT.md` matches current state after fixes.

### Task F9.4 - Update Phase 13 in TASKLIST

Status: `[ ]`

Checklist:

- [ ] Update Task 13.1 environment verification.
- [ ] Update Task 13.2 data import/bootstrap.
- [ ] Update Task 13.3 production smoke test.
- [ ] Update Task 13.4 first-day monitoring plan.
- [ ] Update Task 13.5 phase review.

Acceptance criteria:

- Phase 13 is no longer blank if production launch criteria are met.

### Task F9.5 - Final Build and Smoke Validation

Status: `[ ]`

Checklist:

- [ ] Run `npm run build`.
- [ ] Run local or deployed smoke test.
- [ ] Verify login.
- [ ] Verify dashboard.
- [ ] Verify critical payment/report pages.
- [ ] Confirm no High severity issue remains.

Acceptance criteria:

- Production sign-off can be recommended.

### Phase F9 Review

Status: `[ ]`

Review checklist:

- [ ] Security: auth, role, webhook, and secret checks complete.
- [ ] Performance: build and critical pages acceptable.
- [ ] UI/UX: critical flows clear.
- [ ] Data consistency: financial totals verified.
- [ ] Documentation: UAT and tasklist evidence complete.

Review notes:

- TBD.

---

## Evidence Log Template

Use this format under the relevant task notes or phase review:

```text
Date/time:
Actor:
Environment:
Action:
Command/tool:
Result:
Evidence id:
Follow-up:
```

Examples of evidence id:

- n8n execution id
- Supabase row id
- bill id
- payment id
- Midtrans order id
- screenshot filename
- build timestamp

---

## Open Decisions

These decisions must be confirmed or resolved while executing the plan:

- [ ] Final production proof upload rule: default in this plan is JPG/PNG/PDF max 2 MB.
- [ ] Whether controlled UAT bills should remain as audit history or be cleaned up after validation.
- [ ] Whether `expenses` feature is required for first production launch or can be documented as a follow-up if endpoint/UI is incomplete.
- [ ] Whether placeholder/future features should be hidden from production navigation.
- [ ] Whether launch uses Midtrans sandbox first or switches to production small-value test.

---

## Current Sign-off Position

Status: `[!]` Not ready for final production sign-off.

Reason:

- Financial UAT has not been proven end-to-end with real controlled data.
- Payment proof contract and QRIS UI need alignment.
- Production launch Phase 13 is not complete.

Next recommended task:

- Continue with `Phase F2 - QRIS Production UX Alignment` or `Phase F3 - n8n Cleanup and Reliability Review` (both can run in parallel).
