# Portal Warga Palm Village — Rencana Pengembangan (v1.4.1)

> Dokumentasi arsitektur dan peta jalan pengembangan (Roadmap) Portal Warga Palm Village. Backend mengandalkan **Supabase (PostgreSQL + Auth + RLS)** dengan **n8n Automation Engine** untuk integrasi Payment Gateway **DOKU QRIS Production** dan Notifikasi Email/WhatsApp Transaksional.

## Ringkasan Perubahan & Fitur Terbaru (v1.4.1)

1. **Payment Gateway DOKU QRIS Production**: Integrasi penuh pembuatan QRIS checkout via signature RSA-SHA256 asimetris dan webhook auto-settlement.
2. **Universal Resident Payment Access**: QRIS dibuka untuk seluruh warga dan pengurus tanpa pembatasan hak akses.
3. **Resilient Cancellation Flow**: Tombol `✕ Batalkan Pembayaran` yang instan dan non-blocking, memudahkan warga berganti metode bayar ke Transfer Bank atau Tunai.
4. **Automated Transactional Emails**: Worker n8n otomatis mendistribusikan email bukti kuitansi ke Warga dan notifikasi pembayaran masuk ke Admin, Bendahara, dan Pengurus.
5. **Solid React Portal UI & Versioning**: Mobile drawer bebas clipping/transform, badge versi `v1.4.1` terpasang di seluruh view, dan tampilan bersih dari label vendor.

---

## 1. Stack Teknologi

| Lapisan | Teknologi | Catatan |
|---|---|---|
| Frontend | React 18 + Vite + TailwindCSS | PWA ready, mobile-first responsive |
| Data Fetching | React Query (`@tanstack/react-query`) | Caching, dynamic invalidation & polling |
| Backend & Database | **Supabase** (PostgreSQL + Auth + RLS) | Real-time DB, RLS 4-Tier, PostgREST API |
| Payment Gateway | **DOKU QRIS Production** | Merchant Direct API, Signature Asimetris RSA-SHA256 |
| Automation & API Engine | **n8n** (`n8n-icyxwmjq.runner.web.id`) | QRIS Create, Webhook Receiver, MIME Email Worker |
| Notifikasi | Transaksional Email (MIME) + WhatsApp (Gateway) | Otomatisasi via webhook & worker n8n |
| PWA & Storage | VitePWA + Supabase Storage | Penyimpanan bukti transfer & kuitansi terenkripsi |

---

## 2. Arsitektur Sistem

```
┌─────────────────┐        Direct RLS REST/JWT       ┌────────────────────────┐
│   React / Vite  │ ───────────────────────────────▶ │     Supabase Cloud     │
│   (Frontend)    │ ◀─────────────────────────────── │ PostgreSQL + Auth + RLS│
└────────┬────────┘                                  └───────────┬────────────┘
         │                                                       │
         │ API Request (QRIS Create / Session)                   │ DB Triggers &
         │                                                       │ Webhooks
         ▼                                                       ▼
┌─────────────────┐        RSA-SHA256 Signature      ┌────────────────────────┐
│  DOKU Gateway   │ ◀──────────────────────────────▶ │     n8n Automation     │
│(QRIS Production)│ ───────────────────────────────▶ │   • QRIS Create API    │
└─────────────────┘        Payment Webhook           │   • Webhook Receiver   │
                                                     │   • Transactional Mail │
                                                     │   • Billing Cron Jobs  │
                                                     └────────────────────────┘
```            │  • konfirmasi & update   │
                                        │    status pembayaran     │
                                        │  • cron generate tagihan │
                                        │    bulanan per unit      │
                                        │  • kirim WA + Email      │
                                        │  • cek denda jatuh tempo │
                                        └──────────────────────────┘
```

**Prinsip:** Frontend tidak menulis backend sendiri. Semua data lewat Supabase (dengan RLS). n8n hanya untuk event-driven & scheduled jobs.

---

## 3. Requirement Document

### 3.1 Fungsional

1. **Autentikasi** — login/register via Supabase Auth; sesi aman (HttpOnly cookie session); reset password via email/OTP.
2. **Daftar Penghuni** — tabel pencarian + filter (blok/unit/status); detail profil + riwayat iuran; export CSV (admin). RBAC: warga lihat terbatas, admin/RT lihat semua.
3. **Tagihan & Pembayaran IPL via QRIS Mayar**
   - Tagihan per unit per bulan, status `pending`/`paid`/`overdue`/`cancelled`.
   - Tombol "Bayar" → Edge Function panggil Mayar → tampilkan QRIS.
   - Webhook Mayar → **n8n** konfirmasi → update status + notifikasi sukses.
   - **Generasi tagihan otomatis tiap awal bulan** oleh cron n8n.
   - **Denda keterlambatan** (configurable % setelah jatuh tempo).
   - Riwayat pembayaran & struk (download PDF).
4. **Kalender Acara** (Phase 2) — CRUD oleh admin/RT; RSVP warga; export `.ics`.
5. **Forum Diskusi** (Phase 2) — kategori, thread, komentar nested; moderasi (pin/lock/hapus) oleh admin/RT; notifikasi balasan.
6. **Notifikasi** (n8n) — tagihan jatuh tempo, pembayaran sukses, denda, pengingat.

### 3.2 Non-Fungsional

- **Responsive** desktop & mobile.
- **Keamanan**: RLS Postgres (data isolation per role), secret via env, validasi input (Zod di Edge Function), rate-limit.
- **UU PDP No.27/2022**: minimum data collection, consent, hak akses & hapus data warga, retensi transaksi finansial sesuai ketentuan, tidak ekspos data sensitif ke pihak ke-3.
- **Performansi**: API < 2s; caching React Query; index DB pada kolom yang sering di-query.
- **Skalabilitas**: mudah tambah fitur (e-voting, surat elektronik) tanpa ubah fondasi.
- **Deploy**: Frontend → Vercel/Netlify; Supabase Cloud; n8n sudah self-hosted.
- **Maintainability**: struktur folder rapi, README + env example, dokumentasi endpoint (Supabase auto-docs), test critical path.

### 3.3 Asumsi & Kendala

- Data awal penghuni diimpor dari CSV/Excel manajemen.
- API Mayar tersedia dengan sandbox.
- Domain custom + HTTPS (mis. `portal.palmvillage.id`).
- Akun admin awal dibuat manual di Supabase Auth.

---

## 4. Skema Data (Supabase / Postgres)

Tabel utama (semua dengan RLS policy per role):

- **`profiles`** (extend `auth.users`): `id`, `full_name`, `phone`, `role` enum(`admin`,`rt_rw`,`resident`), `unit_id`, `is_active`.
- **`units`**: `id`, `block`, `unit_number`, `floor`, `size`, `is_occupied`.
- **`ipl_bills`**: `id`, `unit_id`, `resident_id`, `period` (YYYY-MM), `amount`, `due_date`, `late_fee`, `status`, `qris_ref`, `payment_id`.
- **`payments`**: `id`, `ipl_bill_id`, `resident_id`, `amount`, `method`, `transaction_id`, `status`, `paid_at`, `metadata` (jsonb).
- **`events`** (Phase 2): `id`, `title`, `description`, `event_date`, `location`, `created_by`.
- **`rsvp`** (Phase 2): `id`, `event_id`, `resident_id`, `status`.
- **`forum_categories`, `forum_threads`, `forum_posts`** (Phase 2): termasuk `is_pinned`, `is_locked`, `parent_id` untuk nested comment.

---

## 5. Workflow n8n (Production Integrations)

1. **`PV API - Payments QRIS Create DOKU Production`**: Validasi sesi JWT → generate RSA-SHA256 signature → call DOKU Gateway API → insert payment & link bills → return checkout QRIS.
2. **`PV API - Payments QRIS DOKU Production Webhook`**: Terima notifikasi webhook DOKU → verifikasi signature & digest → update `payments` (`settlement`) & `ipl_bills` (`paid`) → trigger notifikasi email.
3. **`PV Notifications - Transactional Email v2`**: Terima trigger webhook pembayaran → siapkan data breakdown (Nama Pemilik, Nomor Unit, Metode, Periode, Nominal) → generate MIME Email → kirim Kuitansi ke Warga & Notifikasi Pembayaran Masuk ke Admin/Bendahara/Pengurus.
4. **Cron Tagihan Bulanan (Phase 3)**: Scheduled trigger tanggal 1 tiap bulan → baca unit aktif → generate tagihan `ipl_bills` periode berjalan.
5. **Cron Denda Keterlambatan (Phase 3)**: Scheduled trigger tanggal 11 tiap bulan → cek tagihan belum lunas → kalkulasi denda & update status `overdue`.

---

## 6. Implementation Plan (Tahapan)

| Phase | Fokus | Status | Output |
|---|---|:---:|---|
| **0 — Migrasi & Fondasi** | Skema Supabase, RLS 4-Tier, React 18 + Vite, TailwindCSS, Mobile Portal Drawer | ✅ Selesai | Fondasi sistem siap, RBAC database aktif |
| **1 — Core RBAC & Keuangan** | Autentikasi Google OAuth 2.0, Approval User, Verifikasi Transfer + Zoom, Running Balance, Pengeluaran & Audit Logs | ✅ Selesai | Operasional RT/RW dan bendahara berjalan |
| **2 — Payment Gateway & Transaksional** | Integrasi DOKU QRIS Production, Resilient Cancellation Flow, Webhook Auto-Settlement, Transactional Email Worker, Version Badge (`v1.4.1`) | ✅ Selesai | Pembayaran QRIS & kuitansi otomatis aktif |
| **3 — Otomasi Billing & Komunitas** | Cron auto-generate tagihan awal bulan, cron denda keterlambatan, WhatsApp Gateway notification, Kalender Acara, Forum Diskusi | 🚧 Up Next | Otomasi penuh operasional bulanan & interaksi warga |
| **4 — Enterprise & Multi-Complex** | Web Push Notification (FCM), Multi-Cluster, Mobile App Native Wrapper, AI Financial Dashboard | ⏳ Planned | Skalabilitas multi-lingkungan |

---

## 7. Daftar Tugas & Status Pengerjaan

### Phase 1 & 2 — Selesai & Beroperasi Penuh ✅

- [x] **T1 - T7**: Setup Supabase DB, RLS 4-Level (`admin`, `bendahara`, `pengurus`, `warga`), React Vite client & AuthContext.
- [x] **T8 - T10**: Google OAuth 2.0 Sign-In, Alur Approval Pendaftaran User baru oleh Pengurus, Direktori Warga & Ekspor CSV.
- [x] **T11 - T13**: Matriks Pembayaran Lintas Tahun, Verifikasi Transfer dengan Image Compression & High-Res Zoom, Laporan Neraca Running Balance.
- [x] **T14 - T17**: Integrasi DOKU QRIS Production via n8n (RSA-SHA256 asymmetric signature auth).
- [x] **T18 - T20**: Webhook DOKU Production auto-update status tagihan (`paid`) & pembatalan tagihan non-blocking (`✕ Batalkan Pembayaran`).
- [x] **T21 - T23**: Worker Email Transaksional otomatis via n8n (Kuitansi Warga & Notifikasi Admin/Bendahara/Pengurus).
- [x] **T24**: Tampilan bersih tanpa vendor branding dan badge versi aplikasi (`v1.4.1`) di seluruh halaman.

### Phase 3 — Otomasi Bulanan & Interaksi Komunitas (Current Roadmap) 🚧

- [ ] **T25**: **Cron Generator Tagihan Otomatis** — n8n cron scheduled tanggal 1 awal bulan untuk membuat tagihan seluruh unit aktif.
- [ ] **T26**: **Cron Denda Overdue** — n8n cron scheduled tanggal 11 untuk cek jatuh tempo dan penerapan persentase denda keterlambatan.
- [ ] **T27**: **WhatsApp Notification Gateway** — Pengiriman pengingat tagihan dan kuitansi instan ke nomor WhatsApp warga via Fonnte/Wablas.
- [ ] **T28**: **Papan Pengumuman & Berita Lingkungan** — Broadcast pengumuman penting RT/RW dengan pin di dashboard utama.
- [ ] **T29**: **Kalender Acara & RSVP Kegiatan** — Agenda kerja bakti, rapat warga, dan posyandu dengan konfirmasi kehadiran warga.
- [ ] **T30**: **Forum Aspirasi & Diskusi Warga** — Ruang diskusi tertutup warga dengan nested comments dan moderasi pengurus.

---

## 8. Catatan Keamanan & Operasional

- **Credential Isolation**: Seluruh Private Key RSA, Client Secret, dan Service Account dikelola terpusat di server n8n dan tidak pernah dimasukkan ke bundle frontend.
- **RLS Enforced**: Seluruh akses data database Supabase dibatasi ketat oleh PostgreSQL Row-Level Security berdasarkan token JWT pengguna.
- **Non-Blocking Billing Flow**: Mekanisme pembatalan QRIS menjamin tidak ada tagihan yang terkunci atau macet saat warga berganti metode pembayaran.

---

*Dokumen ini diperbarui secara berkala mengikuti iterasi rilis Portal Warga Palm Village.*
