# Portal Warga Palm Village — Rencana Pengembangan (v2, di-polish)

> Revisi dari PLAN.md v1. Backend Express/MongoDB diganti dengan **Supabase (Postgres + Auth + RLS)** + **n8n** untuk otomasi. Peluncuran bertahap (MVP), RBAC 3 level, notifikasi WhatsApp + Email, kepatuhan UU PDP.

## Ringkasan Perubahan dari v1

1. **Stack backend diganti total**: Express/MongoDB → **Supabase (Postgres + Auth + RLS)** + **n8n** untuk otomasi. Backend Node yang lama akan di-deprecate (diarsipkan, bukan dihapus).
2. **Peluncuran bertahap (MVP)**: Phase 1 = Login + Daftar Penghuni + Tagihan/QRIS. Kalender & Forum menyusul di Phase 2.
3. **RBAC 4 level**: `admin`, `bendahara`, `pengurus`, `warga` (diperluas dari 3 level untuk pemisahan hak akses pengeluaran dan verifikasi kas).
4. **Notifikasi WhatsApp + Email** via n8n & Proactive Notifications Alert di UI (banner & bell badge).
5. **Frontend diperbaiki & di-enhance**: struktur dipecah, mobile menu 100% solid dengan React Portal, update profil mandiri via modal, integrasi `@supabase/supabase-js` + React Query.
6. Penambahan: kepatuhan **UU PDP No.27/2022**, denda keterlambatan, generasi tagihan otomatis tiap bulan.
7. **Inovasi Phase 5**: Alur verifikasi pendaftaran warga baru, kompresi gambar bukti transfer otomatis sisi klien (<500 KB), verifikasi pembayaran transfer dengan high-res zoom, dan neraca kumulatif Running Balance real-time.

---

## 1. Stack Teknologi

| Lapisan | Teknologi | Catatan |
|---|---|---|
| Frontend | React 18 + Vite + TailwindCSS | Diperbaiki dari scaffold existing |
| Data fetching | React Query (`@tanstack/react-query`) | caching, invalidation |
| Supabase client | `@supabase/supabase-js` | akses Postgres + Auth dari frontend |
| Backend data & auth | **Supabase** (Postgres + Auth + Row Level Security) | CRUD otomatis via PostgREST, RBAC di level DB |
| Logika sinkron/QRIS | **Supabase Edge Functions** (Deno/TS) | generate QRIS Mayar |
| Otomasi/event | **n8n** (`n8n-icyxwmjq.runner.web.id`) | webhook Mayar, cron tagihan bulanan, notifikasi WA+email |
| Pembayaran | **API Mayar** (QRIS) | sandbox → produksi |
| Notifikasi | WhatsApp (Fonnte/Wablas) + Email (SMTP) | via node n8n |
| Kalender UI | `@fullcalendar/react` | Phase 2 |

---

## 2. Arsitektur Sistem

```
┌──────────────┐    direct (RLS-secured)     ┌──────────────────┐
│  React/Vite  │ ───────────────────────────▶│     Supabase     │
│  (Frontend)  │ ◀───────────────────────────│ Postgres+Auth+RLS│
└──────┬───────┘                             └────────┬─────────┘
       │ Edge Function (generate QRIS)               │ DB webhook/trigger
       ▼                                             ▼
┌──────────────┐   webhook pembayaran   ┌──────────────────────────┐
│  Mayar QRIS  │ ─────────────────────▶ │           n8n            │
└──────────────┘                        │  • konfirmasi & update   │
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

## 5. Workflow n8n (4 workflow)

1. **Webhook Mayar** → verifikasi signature → update `payments` + `ipl_bills.status` → kirim WA+Email konfirmasi.
2. **Cron Tagihan Bulanan** (sekali tiap awal bulan) → baca `units` aktif → insert `ipl_bills` untuk periode berjalan.
3. **Cek Denda Jatuh Tempo** (harian) → tagihan lewat `due_date` & belum `paid` → hitung denda → set `overdue` → notifikasi.
4. **Notifikasi** (sub-workflow terpusat) → template WA (Fonnte/Wablas) + Email (SMTP) → log pengiriman.

---

## 6. Implementation Plan (Tahapan)

| Phase | Fokus | Output |
|---|---|---|
| **0 — Migrasi & Fondasi** | Buat project Supabase; definisikan skema tabel + RLS; arsip backend Express lama ke `legacy-backend/`; perbaiki config frontend rusak (`vite.config.js`, `postcss.config.js`, `index.css`, path logo, hapus import mati); install deps (`@supabase/supabase-js`, `react-query`, `react-icons`); pecah `App.jsx` → `pages/`,`components/`,`services/`,`hooks/`,`context/`; setup Supabase client + AuthContext. | Repo bersih, frontend bisa jalan (halaman welcome + nav), Supabase siap. |
| **1 — MVP: Auth + Penghuni + Tagihan/QRIS** | Halaman Login/Logout (Supabase Auth); proteksi route berbasis role; halaman Daftar Penghuni (tabel, search, filter, export CSV); halaman Tagihan (list, filter status); Edge Function generate QRIS Mayar; tombol Bayar + tampilkan QR + polling status; workflow n8n Webhook Mayar + cron tagihan + denda + notifikasi WA/Email; seed data penghuni via CSV. | **MVP siap diuji & dipakai warga.** |
| **2 — Fitur Esensial Warga** | Model + RLS `announcements`, `helpdesk_tickets`, `events`/`rsvp`; Papan Pengumuman RT (broadcast WA/Email); Helpdesk Lapor RT (pengaduan & tracking status); Kalender Acara (FullCalendar + RSVP); Forum silaturahmi warga. | Fitur esensial lingkungan lengkap & interaktif. |
| **3 — Polish, Deploy & Launch** | Hardening (rate-limit, validasi, UU PDP review, RBAC test menyeluruh); unit/integration test critical path (auth, pembayaran, RLS); deploy frontend ke Vercel/Netlify + custom domain + HTTPS; dokumentasi (README, panduan warga & admin); soft launch 1 RT → kumpulkan feedback → perbaiki → peluncuran resmi + monitoring. | Sistem produksi stabil. |

---

## 7. Daftar Tugas (Task List)

### Phase 0 — Migrasi & Fondasi

- **T1**: Buat project Supabase (DB + Auth), kumpulkan URL/keys ke `.env` (frontend `VITE_SUPABASE_*`).
- **T2**: Definisikan skema Postgres (migration SQL) + RLS policy untuk semua tabel sesuai role.
- **T3**: Arsipkan backend Express lama ke `legacy-backend/`; update README stack baru.
- **T4**: Perbaiki frontend config: buat `vite.config.js`, `postcss.config.js`, `src/index.css` (direktif Tailwind), perbaiki path logo & hapus import mati.
- **T5**: Install deps frontend: `@supabase/supabase-js`, `@tanstack/react-query`, `react-icons`, dll.
- **T6**: Restrukturisasi frontend: pecah `App.jsx` → `pages/`, `components/`, `services/supabaseClient.js`, `hooks/`, `context/AuthContext.jsx`; layout (Header/Footer) jadi komponen.
- **T7**: Setup Supabase client + `AuthContext` (sesi, role) + provider React Query.

### Phase 1 — MVP

- **T8**: Halaman Login/Register/Logout (Supabase Auth); proteksi route berbasis role (route guard).
- **T9**: Halaman Daftar Penghuni — tabel, search, filter blok/status, detail profil, export CSV (admin).
- **T10**: Skema + seed data penghuni/unit (impor CSV awal); RBAC test.
- **T11**: Halaman Tagihan IPL — list tagihan milik warga + filter status; (admin: semua unit).
- **T12**: Edge Function `generate-qris` → panggil Mayar API → simpan `qris_ref` di `ipl_bills`.
- **T13**: Tombol "Bayar" → panggil Edge Function → tampilkan QR → polling status via React Query.
- **T14**: Workflow n8n #1 (Webhook Mayar) → update `payments`+`ipl_bills` → konfirmasi.
- **T15**: Workflow n8n #2 (cron tagihan bulanan) + #3 (cek denda jatuh tempo).
- **T16**: Workflow n8n #4 (notifikasi WA + Email) untuk jatuh tempo, sukses bayar, denda.
- **T17**: Struk/riwayat pembayaran (download PDF).

### Phase 2 — Fitur Esensial Warga (Pengumuman, Lapor RT, Kalender)

- **T18**: **Papan Pengumuman RT (Broadcast Info Lingkungan)** — Skema + RLS `announcements`; halaman Berita & Pengumuman; kemampuan Admin & Pengurus RT membuat pengumuman penting (tag: Darurat, Kegiatan, Keuangan) dengan pin di dashboard utama & broadcast notifikasi via n8n (WA/Email).
- **T19**: **Helpdesk / Lapor RT (Pengaduan & Aspirasi Warga)** — Skema + RLS `helpdesk_tickets`; halaman Lapor RT untuk warga mengajukan keluhan (kebersihan, keamanan, lampu jalan mati, fasilitas umum); tracking status tiket (Open, In Progress, Resolved) & balasan diskusi antar warga dengan Pengurus RT/Admin.
- **T20**: **Kalender Acara & RSVP Kegiatan** — Skema + RLS `events` + `rsvp`; halaman Kalender Kegiatan (FullCalendar) untuk agenda kerja bakti, rapat RT, posyandu, dan perayaan; fitur RSVP partisipasi warga & export agenda ke `.ics` / Google Calendar.
- **T21 (opsional)**: **Forum Komunitas Warga** — Skema + RLS forum (`categories`/`threads`/`posts` nested); wadah diskusi silaturahmi antar warga dengan moderasi (pin/lock/hapus) untuk Admin/RT.

### Phase 3 — Polish, Deploy & Launch

- **T21**: Hardening — validasi input (Zod di Edge Function), rate-limit, audit RLS, review kepatuhan UU PDP.
- **T22**: Unit + integration test critical path (auth, alur bayar QRIS, RLS per role) — target ~50–60% coverage critical path.
- **T23**: Deploy frontend ke Vercel/Netlify; konfigurasi env, custom domain, HTTPS.
- **T24**: Dokumentasi — README update, panduan warga (PDF), panduan admin (moderasi & manajemen).
- **T25**: Soft launch ke 1 RT → kumpulkan feedback → perbaikan bug.
- **T26**: Peluncuran resmi + monitoring (log n8n, Supabase logs, alert uptime).

---

## 8. Catatan

- **Prioritas**: Selesaikan Phase 0 & 1 dulu (MVP: Login + Penghuni + Tagihan/QRIS) karena paling krusial. Kalender/Forum boleh menyusul.
- Backend Express lama **tidak dipakai lagi** — diarsipkan ke `legacy-backend/`, bukan dihapus (jaga-jaga referensi).
- Setiap task bersifat incremental; selesai satu → commit (jika repo git diinisialisasi).
- n8n sudah tersedia di `n8n-icyxwmjq.runner.web.id`; webhook Mayar mengarah ke sana.

---

*Rencana ini acuan dinamis — dapat disesuaikan sesuai temuan teknis & umpan balik stakeholder selama pengembangan.*
