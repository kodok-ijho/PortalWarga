# UAT Validation Report - Portal Warga Palm Village

Tanggal audit: 2026-07-10  
Basis audit: `docs/production/UAT_CHECKLIST.md`, `docs/production/TASKLIST.md`, repo lokal, Supabase MCP, n8n MCP  
Mode audit: non-destructive validation. Audit ini tidak membuat/mengubah tagihan, pembayaran, user approval, atau data produksi.

## Post-Audit Remediation Status

This report preserves findings from the 2026-07-10 baseline audit. Current remediation status is tracked in `docs/production/PLAN_UAT_FIXING.md`.

As of 2026-07-11:

- Phase F1 payment-proof contract alignment is complete.
- Phase F2 QRIS production UX alignment is complete.
- Phase F3 n8n cleanup and reliability review is complete.
- Phase F4 controlled UAT billing data preparation is complete; `2026-07` contains 53 unique unit bills and Bills Generate idempotency is verified.
- `PV API - Role Check Test` (`gXFYbb1et7uZg3gb`) and inactive duplicate Midtrans webhook (`biwUoQE1fbZK9dgn`) have been archived.
- Recorded `Users Pending` and `Bills Matrix` failures were classified as obsolete credential/version noise or manual cancellation; current executions were verified healthy after the final workflow versions were published.

## Executive Summary

Status keseluruhan: **PARTIAL / belum siap sign-off production penuh**.

Fondasi utama sudah berjalan:

- Frontend production build berhasil.
- `VITE_DEMO_MODE=false` pada `client/.env`.
- Supabase production/staging target berisi data unit nyata Palm Village.
- n8n API workflows utama sudah aktif.
- Google OAuth + App JWT sudah pernah berhasil dipakai untuk login admin/warga berdasarkan bukti manual dan execution logs.

Namun UAT belum bisa dinyatakan lulus penuh karena:

- Data transaksi produksi saat audit masih kosong: `ipl_bills=0`, `payments=0`, `expenses=0`.
- Skenario tagihan, manual transfer, QRIS, running balance, dan laporan belum terbukti end-to-end dengan data nyata.
- Ada mismatch aturan upload bukti transfer: tasklist menyebut `2 MB` dan MIME tertentu, UI menerima `3 MB`, `WEBP`, dan `PDF`.
- Masih ada teks/fallback "Simulasi" pada UI QRIS walaupun backend Midtrans sudah dibuat.
- Workflow test `PV API - Role Check Test` masih aktif.
- Phase 13 Production Launch di tasklist belum dikerjakan.

## Evidence Snapshot

### Frontend Build

Perintah:

```bash
npm run build
```

Hasil: **PASS**

- Vite build berhasil.
- PWA service worker berhasil dibuat.
- Tidak ada compile error.
- Warning tersisa:
  - `mockData.js` masih static-import di beberapa halaman, sehingga dynamic import tidak efektif memisahkan chunk.
  - `dataHelpers.js` juga static/dynamic imported campur.
  - Chunk `Reports` cukup besar, sekitar `437 kB` sebelum gzip.

### Environment

Hasil cek:

```text
VITE_DEMO_MODE=false
```

Status: **PASS**

Catatan: nilai secret lain tidak dicetak untuk menghindari exposure.

### Supabase Data

Hasil audit database:

```text
units_count=53
profiles_count=3
approved_profiles=2
pending_profiles=1
bills_count=0
payments_count=0
expenses_count=0
audit_logs_count=10
```

Distribusi unit:

```text
CB1=10
CB2=15
CB3=11
CB4=17
```

Distribusi profil:

```text
admin / approved / active = 1
warga / approved / active = 1
warga / pending_approval / active = 1
```

Status: **PARTIAL**

Data master sudah ada, tetapi data transaksi belum ada sehingga UAT keuangan belum dapat dibuktikan penuh.

### n8n Workflows

Workflow aktif yang relevan:

- `PV API - Auth Google`
- `PV API - Auth Me`
- `PV API - Users Pending`
- `PV API - Users Approve`
- `PV API - Users Reject`
- `PV API - Units List`
- `PV API - Residents List`
- `PV API - Settings Get`
- `PV API - Settings Update`
- `PV API - Bills Generate`
- `PV API - Bills Matrix`
- `PV API - Payments Manual Submit`
- `PV API - Payments Manual Approve`
- `PV API - Payments Manual Reject`
- `PV API - Payments Cash Create`
- `PV API - Payments QRIS Create`
- `PV API - Payments Midtrans Webhook`
- `PV API - Reports Running Balance`
- `PV API - Reports Monthly Finance`
- `PV API - Health Check`

Temuan operasional:

- Ada workflow duplicate inactive: `PV API - Payments Midtrans Webhook`.
- `PV API - Role Check Test` masih aktif. Ini sebaiknya dimatikan/diarsipkan sebelum production.
- Dalam execution logs sejak 2026-07-09 ada banyak sukses untuk auth, approval, units, pending users, manual payment, dan bill matrix.
- Ada 1 execution error lama pada `PV API - Users Pending`.
- Ada beberapa execution `Bills Matrix` berstatus `canceled`.

Status: **PARTIAL**

Workflow utama tersedia dan aktif, tetapi butuh cleanup test workflow dan review execution error/canceled.

## UAT Result Matrix

| UAT ID | Skenario | Status | Ringkasan |
|---|---|---:|---|
| UAT-1.1 | Pendaftaran Akun Warga Baru | PARTIAL PASS | Ada `pending_approval=1`, workflow `Auth Google` aktif dan logs sukses. Perlu bukti UAT terbaru dengan akun test yang dicatat. |
| UAT-1.2 | Persetujuan Akun & Asosiasi Unit oleh Admin | PARTIAL PASS | Workflow approve aktif, execution sukses ada, unit tersedia 53. Tidak diuji ulang secara mutasi saat audit agar tidak mengubah data. |
| UAT-1.3 | Login Pertama Warga Terdaftar | PARTIAL PASS | Pernah terbukti manual oleh user; ada `approved warga=1`; `/auth/me` workflow aktif. Tidak diuji browser ulang oleh audit. |
| UAT-1.4 | Pembatasan Hak Akses | PARTIAL PASS | UI reports punya staff-only guard; role test pernah tercatat di tasklist. Butuh negative test browser/API terbaru sebelum sign-off. |
| UAT-2.1 | Pembuatan Tagihan Bulanan | BLOCKED | Workflow aktif, tetapi `ipl_bills=0`; belum ada controlled test bill. |
| UAT-2.2 | Upload Bukti Transfer Manual | PARTIAL / NEED FIX | Workflow aktif dan logs sukses, tetapi belum ada bill aktif saat audit. Ada mismatch file rule UI vs tasklist/backend. |
| UAT-2.3 | Verifikasi Bukti Manual | BLOCKED | Workflow approve/reject aktif dan logs sukses, tetapi DB saat audit `payments=0`; tidak ada pending payment nyata untuk diverifikasi. |
| UAT-2.4 | Pembayaran QRIS Midtrans | PARTIAL / NEED FIX | Workflow QRIS create dan webhook aktif. DB belum punya payment/order bukti end-to-end. UI masih menyebut simulasi. |
| UAT-3.1 | Running Balance | BLOCKED | Workflow aktif, tetapi `payments=0` dan `expenses=0`; tidak bisa memvalidasi formula dengan data nyata. |
| UAT-3.2 | Export Laporan Keuangan | PARTIAL PASS | UI punya export CSV dan print/PDF. Perlu data transaksi nyata agar isi laporan dapat diverifikasi. |

## Detailed Findings

### F-001 - Data transaksi belum tersedia untuk UAT keuangan

Severity: **High**  
Area: Billing, Payment, Report  
Evidence:

- `ipl_bills=0`
- `payments=0`
- `expenses=0`

Dampak:

- UAT-2.1 sampai UAT-3.2 tidak bisa lulus penuh.
- Running balance dan laporan hanya bisa divalidasi secara struktur, bukan secara akuntansi.

Rencana perbaikan:

1. Buat 1 periode UAT, misalnya `2026-07`.
2. Jalankan dry-run generate bills.
3. Validasi jumlah preview sesuai 53 unit.
4. Jalankan generate bills non-dry-run untuk periode UAT bila disetujui.
5. Buat minimal 3 skenario pembayaran:
   - manual transfer pending lalu approved,
   - manual transfer rejected,
   - QRIS sandbox paid via webhook.
6. Tambahkan minimal 1 expense UAT.
7. Validasi report dan running balance.

### F-002 - Rule upload bukti transfer tidak konsisten

Severity: **High**  
Area: Payment UX, Backend contract, UAT checklist  
Evidence:

- Tasklist menyebut bucket limit `2 MB` dan allow-list `image/jpeg,image/png`.
- Tasklist Phase 9 menyebut manual submit allowed images/PDF max `2 MB`.
- UI `PaymentMatrix.jsx` menerima `image/jpeg,image/png,image/webp,application/pdf` dengan limit `3 MB`.
- UI menampilkan teks `Format: JPG, PNG, WEBP, atau PDF. Maks 3 MB.`

Dampak:

- User bisa memilih file yang mungkin ditolak backend/storage.
- UAT upload file bisa gagal dengan pesan yang terasa tidak konsisten.

Rencana perbaikan:

1. Putuskan aturan final production:
   - rekomendasi: JPG/PNG/PDF max 2 MB, atau
   - bila ingin gratis dan fleksibel via Google Drive: JPG/PNG/PDF max 3 MB harus disamakan di backend.
2. Samakan validasi UI, n8n workflow, storage/GDrive rule, dan dokumentasi.
3. Tambahkan test negatif:
   - file terlalu besar,
   - MIME tidak didukung,
   - upload tanpa file.

### F-003 - UI QRIS masih menyebut simulasi

Severity: **Medium**  
Area: Payment UX  
Evidence:

- Tombol masih bertuliskan `Lanjut ke Checkout Midtrans (Simulasi)`.
- Panel QRIS masih menampilkan placeholder `[QR Code]`.
- Teks: `(Integrasi Midtrans aktif saat backend terhubung)`.

Dampak:

- Membingungkan user dan admin saat sandbox/prod Midtrans sudah aktif.
- Bisa dianggap belum production-ready walaupun backend sudah tersedia.

Rencana perbaikan:

1. Saat production mode, ubah label menjadi `Lanjut ke Checkout Midtrans`.
2. Hilangkan placeholder QR statis untuk mode production.
3. Tampilkan loading state saat request QRIS create.
4. Redirect/open `redirect_url` dari Midtrans.
5. Tampilkan status pending/paid/expired sesuai callback/webhook.

### F-004 - Test workflow masih aktif di n8n

Severity: **Medium**  
Area: Security, Operations  
Evidence:

- `PV API - Role Check Test` masih `active=true`.
- `PV API - Audit Log Test` sudah inactive.

Dampak:

- Endpoint test sebaiknya tidak aktif di production.
- Walaupun protected, surface area API tetap bertambah.

Rencana perbaikan:

1. Arsipkan/nonaktifkan `PV API - Role Check Test` setelah bukti role check dipindahkan ke dokumen.
2. Pastikan tidak ada URL test tertanam di frontend.
3. Jalankan smoke test protected endpoint setelah cleanup.

### F-005 - Execution error/canceled perlu direview

Severity: **Medium**  
Area: n8n Reliability  
Evidence:

- 1 execution error pada `PV API - Users Pending` sejak 2026-07-09.
- Beberapa execution `Bills Matrix` berstatus `canceled`.

Dampak:

- Bisa hanya akibat pengujian lama, tetapi perlu dipastikan bukan timeout/bug query.

Rencana perbaikan:

1. Buka detail execution error/canceled.
2. Klasifikasikan sebagai expected test noise atau real bug.
3. Jika real bug, tambahkan defensive timeout/error response.
4. Catat final result di UAT evidence.

### F-006 - Phase 13 Production Launch belum berjalan

Severity: **High**  
Area: Launch readiness  
Evidence:

- `TASKLIST.md` Phase 13 masih `[ ]`.
- Production launch checklist belum ditandatangani.
- Phase 0 masih punya gap domain/env final.

Dampak:

- Task 1-12 boleh dianggap build-complete, tetapi belum launch-ready.

Rencana perbaikan:

1. Freeze production URL frontend, n8n API base URL, Supabase project, Google OAuth origin, Midtrans mode/key.
2. Verifikasi tidak ada staging/sandbox value di env production.
3. Jalankan smoke test production.
4. Aktifkan monitoring awal.
5. Isi sign-off Phase 13.

### F-007 - Beberapa halaman masih mock/placeholder

Severity: **Medium**  
Area: Product completeness, UX  
Evidence:

- `Expenses.jsx`, `Houses.jsx`, `Residents.jsx`, `Forum.jsx`, `Calendar.jsx` masih memakai `Placeholder` atau import `mockData`.
- `Header.jsx`, `Users.jsx`, `Logs.jsx`, `PaymentMatrix.jsx`, `PaymentVerification.jsx` masih static-import `mockData`.

Dampak:

- Build tetap lolos, tetapi bundle production masih membawa mock data.
- Beberapa fitur mungkin terlihat belum selesai jika diakses user.

Rencana perbaikan:

1. Pisahkan fitur Phase 1-12 yang wajib production dari fitur future.
2. Untuk fitur future, sembunyikan menu atau tampilkan empty state yang jelas.
3. Untuk fitur production, pindahkan import ke `dataService`/API nyata.
4. Hilangkan static import `mockData` dari halaman production.

### F-008 - Repo hygiene perlu dirapikan

Severity: **Low**  
Area: DevOps  
Evidence:

- `git status --short` menunjukkan:
  - `.agents/` untracked
  - `client/.tmp/` untracked

Dampak:

- Bisa ikut terbawa commit/deploy jika tidak diabaikan.

Rencana perbaikan:

1. Tentukan apakah `.agents/` memang perlu disimpan.
2. Tambahkan `client/.tmp/` ke `.gitignore` bila hanya temporary.
3. Bersihkan artifact lokal sebelum release.

### F-009 - UAT checklist/document encoding terlihat rusak di beberapa output

Severity: **Low**  
Area: Documentation  
Evidence:

- Beberapa output terminal menampilkan karakter mojibake seperti `ðŸ`.

Dampak:

- Tidak memblokir aplikasi, tetapi mengganggu dokumen audit dan review agent lain.

Rencana perbaikan:

1. Normalisasi dokumen menjadi UTF-8.
2. Kurangi emoji di dokumen operasional bila tooling sering merusak encoding.
3. Pastikan file dibuka/simpan sebagai UTF-8.

## Recommended Fix Plan

### Fix Sprint 1 - Production UAT Data Path

Goal: UAT keuangan bisa dibuktikan end-to-end dengan data nyata.

Tasks:

1. Buat periode UAT `2026-07`.
2. Jalankan dry-run generate bills.
3. Review preview 53 unit.
4. Generate bills periode UAT.
5. Jalankan manual transfer submit dengan file valid.
6. Approve 1 manual payment.
7. Reject 1 manual payment.
8. Jalankan QRIS sandbox create.
9. Simulasikan/terima webhook paid dari Midtrans sandbox.
10. Tambahkan 1 expense operasional.
11. Validasi bill matrix, payment verification, running balance, monthly report.
12. Catat evidence ID: bill id, payment id, n8n execution id, report period.

Acceptance criteria:

- `ipl_bills > 0`
- `payments > 0`
- Minimal 1 payment `completed`
- Minimal 1 payment rejected/failed atau revision path terbukti
- Running balance cocok manual calculation
- Export CSV/PDF memuat angka yang sama dengan UI

### Fix Sprint 2 - Payment UX and Contract Alignment

Goal: Upload proof dan QRIS tidak membingungkan user.

Tasks:

1. Samakan MIME dan max size final di UI, n8n, docs.
2. Ubah teks QRIS production agar tidak menyebut simulasi.
3. Hilangkan placeholder QR statis pada production flow.
4. Pastikan Midtrans redirect URL dibuka/diarahkan dengan jelas.
5. Tambahkan error state untuk payment expired/failure.

Acceptance criteria:

- File invalid ditolak sebelum submit dengan pesan jelas.
- File valid diterima backend.
- Tombol QRIS tidak menyebut simulasi di production.
- User melihat status pembayaran setelah kembali dari Midtrans.

### Fix Sprint 3 - Security and Ops Cleanup

Goal: Surface area production lebih bersih.

Tasks:

1. Nonaktifkan/arsipkan `PV API - Role Check Test`.
2. Hapus/arsipkan duplicate inactive Midtrans webhook bila tidak diperlukan.
3. Review execution error/canceled.
4. Pastikan semua protected workflow punya JWT + DB profile check + role check.
5. Verifikasi log/audit untuk significant actions.

Acceptance criteria:

- Tidak ada workflow test aktif.
- Tidak ada duplicate production webhook yang membingungkan.
- Error lama sudah diklasifikasi.
- Smoke test protected endpoints lulus.

### Fix Sprint 4 - Phase 13 Launch Readiness

Goal: Production launch checklist siap ditandatangani.

Tasks:

1. Freeze production frontend URL.
2. Freeze n8n production API base URL.
3. Verify Google OAuth authorized origins.
4. Verify Supabase production project and backups.
5. Verify Midtrans production/sandbox mode sesuai keputusan launch.
6. Verify env production bebas staging/sandbox value yang tidak sengaja.
7. Jalankan smoke test dari browser.
8. Update `TASKLIST.md` Phase 13.

Acceptance criteria:

- Phase 13 task 13.1 sampai 13.5 terisi evidence.
- UAT checklist semua critical path PASS.
- Tidak ada High severity finding terbuka.

## Suggested Next Execution Order

1. Perbaiki mismatch upload proof dan UI QRIS.
2. Cleanup n8n test/duplicate workflow.
3. Buat controlled UAT data untuk tagihan dan pembayaran.
4. Jalankan ulang UAT-2.1 sampai UAT-3.2.
5. Update `UAT_CHECKLIST.md` dengan evidence.
6. Jalankan Phase 13 production launch checklist.

## Current Sign-off Decision

Rekomendasi saat ini: **jangan production sign-off dulu**.

Alasannya bukan karena fondasi gagal, tetapi karena jalur transaksi finansial belum dibuktikan dengan data nyata dan masih ada mismatch kecil yang bisa membuat pengalaman user/admin tersendat.
