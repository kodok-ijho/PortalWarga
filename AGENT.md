# AGENT.md — RuangWarga-dev (Portal Warga → Multi-Tenant SaaS)

Panduan kerja untuk AI coding agent (Antigravity CLI) di repo ini.
Baca file ini SEBELUM membuat rencana atau mengubah kode apa pun.

**WAJIB dibaca berurutan sebelum kerja apa pun:**
1. File ini (AGENT.md)
2. `requirement.md` — kebutuhan bisnis & fungsional (FR/NFR)
3. `specification.md` — desain teknis turunan requirement
4. `task.md` — breakdown task per phase, INI YANG MENENTUKAN URUTAN KERJA

> ⚠️ README.md di root masih mendeskripsikan versi **lama** (single-tenant, per
> kompleks perumahan). Proyek sedang **pivot** menjadi SaaS multi-tenant
> (RT/RW, Kos, Arisan, Kelas). Kalau README dan 3 file di atas bertentangan,
> **ikuti requirement.md/specification.md/task.md**, bukan README. Jangan
> gunakan README sebagai sumber kebenaran arsitektur saat ini.

---

## 1. Konteks Proyek (Ringkas)

RuangWarga-dev sedang ditransformasi dari aplikasi tunggal "Portal Warga Palm
Village" (1 Supabase project = 1 kompleks perumahan) menjadi **platform SaaS
multi-tenant** ala model SumoPod: 1 infrastruktur, banyak tenant, 4 vertikal
bisnis yang dilayani:

1. **RT/RW & Koordinator Perumahan** (fitur existing, jadi template pertama)
2. **Kos-kosan/Kontrakan**
3. **Arisan**
4. **Kelas** (iuran kelompok kecil)

Filosofi pembangunan: **"pabrik dulu, baru produk"** — fondasi platform
(tenant, subscription, billing, dua dashboard level) dibangun tuntas dulu
sebelum modul vertikal apa pun disentuh, termasuk migrasi fitur RT/RW lama.

## 2. Tech Stack

| Kategori         | Teknologi                                       |
|------------------|---------------------------------------------------|
| Frontend         | React 18.2 + Vite 5.0                              |
| Styling          | TailwindCSS 3.4 (class custom `.pv-*`, tema Forest/Gold) |
| State/data       | @tanstack/react-query 5.17                         |
| Charts           | Recharts 3.9                                       |
| Backend & Auth   | Supabase (PostgreSQL + Auth + RLS)                 |
| Edge Functions   | Supabase (Deno/TypeScript)                         |
| Payment Gateway  | **Mayar QRIS** (rencana baru — bukan DOKU/Midtrans, itu versi lama) |
| Automation       | n8n (self-hosted, sebagian mungkin digantikan Edge Functions di versi baru — cek task.md Phase 4) |
| Deployment       | Vercel (frontend) + Supabase Cloud (backend)       |

`legacy-backend/` (Express + MongoDB) tetap **DEPRECATED**, jangan disentuh.

## 3. ATURAN PALING PENTING: Urutan Phase Bersifat Mengikat

`task.md` membagi pekerjaan jadi **Phase 0–11**, dan urutannya **bukan saran,
tapi prasyarat teknis**:

| Phase | Isi | Syarat |
|---|---|---|
| **Phase 0** | Persiapan & Audit Kode Existing (T0.1–T0.4) | Wajib selesai dulu sebelum phase lain — ini yang memastikan agent tidak salah asumsi nama kolom/tabel dari kode lama |
| **Phase 1** | Fondasi Data: Tenant & Subscription | — |
| **Phase 2** | Autentikasi, Tenant Context & Onboarding Dasar | — |
| **Phase 3** | Platform Owner Dashboard | — |
| **Phase 4** | Subscription & Billing Platform | Setelah Phase 4, "fondasi platform" dianggap selesai (milestone utama) |
| **Phase 5** | Perilaku Read-Only Lintas Platform (`useSubscriptionGate()`, pola disable UI) | Sengaja dikerjakan SEBELUM modul vertikal apa pun, supaya pola ini matang duluan |
| **Phase 6** | Template Vertikal Pertama: RT/RW | Tidak boleh mulai sebelum Phase 1–5 tuntas |
| **Phase 7** | Template Vertikal: Kos-kosan | — |
| **Phase 8** | Template Vertikal: Arisan | — |
| **Phase 9** | Template Vertikal: Kelas | — |
| **Phase 10** | Modul Listing Publik / Iklan | Tidak boleh mulai sebelum Phase 6–9 (semua vertikal) selesai |
| **Phase 11** | QA, Migrasi, & Rilis | — |

- **Jangan mulai Phase N+1 sebelum Phase N lulus "Definition of Done"**-nya
  masing-masing (tercantum di akhir setiap phase di `task.md`).
- **Jangan lompat ke Phase 6 (RT/RW) atau vertikal lain** sebelum **Phase 0–5**
  (audit, lalu fondasi platform: tenant, subscription, RLS, Platform Owner
  Dashboard, Tenant Owner Dashboard, pola read-only) benar-benar tuntas. RLS
  dan tenant context dari fondasi adalah dasar keamanan seluruh modul vertikal.
- **Jangan mulai Phase 10 (Modul Listing Publik)** sebelum Phase 6–9 (keempat
  vertikal) selesai — modul ini bergantung pada data yang dihasilkan tenant
  `rt_rw` dan `kos`.
- Setiap task (`T1.1`, `T2.3`, dst.) idealnya **1 PR/commit terpisah** agar
  mudah direview. Jangan gabungkan banyak task jadi satu commit besar.
- Sebelum mengerjakan task apa pun, cek dulu apakah task sebelumnya di phase
  yang sama (atau phase sebelumnya) sudah selesai. Kalau belum jelas statusnya,
  tanyakan ke user, jangan asumsikan.

## 4. ATURAN KEDUA PALING PENTING: Verifikasi ke Kode Aktual, Bukan ke Dokumen

`specification.md` dan `task.md` eksplisit menyebut bahwa skema di dalamnya
adalah **rancangan**, bukan fakta final:

- Sebelum implementasi apa pun yang menyentuh skema (`supabase/schema.sql`),
  konteks auth (`AuthContext.jsx`), atau struktur `pages/`, **baca ulang file
  aslinya di repo** untuk memastikan nama kolom/tabel/konvensi persis (misal
  `full_name` vs `fullname`). Jangan asumsikan dari dokumen.
- Kalau ditemukan perbedaan antara rancangan (`specification.md`) dan kode
  aktual: **ikuti kode aktual**, dan catat penyesuaian itu di
  `docs/audit-notes.md` (dibuat di Phase 0 / T0.4). Jangan diam-diam
  menyimpang tanpa mencatat alasannya.
- Task T0.1–T0.4 (audit kode existing) adalah prasyarat sebelum menyentuh apa
  pun — kalau belum ada `docs/audit-notes.md` dan project baru mulai, agent
  sebaiknya mengerjakan/melengkapi Phase 0 dulu.

## 5. Model Data Baru (Ringkasan dari specification.md §2–§5)

Skema **baru** (menggantikan `profiles`/`ipl_bills`/dst lama secara bertahap):

- `tenants` — 1 baris per pelanggan (RT/RW/kos/arisan/kelas), punya `type` enum.
- `tenant_subscriptions`, `tenant_subscription_blocks`, `block_pricing`,
  `subscription_periods`, `subscription_payments` — mesin billing platform.
- `tenant_units` (generik: rumah/kamar/slot), `tenant_members` (generik:
  warga/penyewa/peserta/siswa), `billing_items` (generik: IPL/sewa/kontribusi/iuran).
- `payments`, `expenses` — pola lama tetap, tambah kolom `tenant_id`.
- Field yang tidak generik antar vertikal disimpan di `tenant_units.metadata`
  (JSONB), bukan kolom/tabel terpisah per vertikal.
- Tabel khusus arisan: `arisan_rounds`, `arisan_participants` — hanya aktif
  untuk `tenant.type = 'arisan'`.
- Modul Listing Publik (Phase 10, opsional/nanti): `public_listings`,
  `listing_pricing`, `listing_payments` — **sengaja bocor lintas tenant**
  karena memang untuk publik, ini BUKAN celah keamanan yang perlu ditambal.

## 6. RLS — Prinsip Wajib

- Isolasi tenant ditegakkan di **level database (RLS)**, bukan hanya di
  routing frontend. Setiap tabel operasional baru wajib punya RLS sejak awal
  dibuat, mengikuti pola `current_tenant_ids()` / `is_tenant_admin()` /
  `tenant_subscription_status()` di specification.md §6.
- Pola umum: SELECT selalu boleh untuk anggota tenant terkait (termasuk saat
  `read_only`); INSERT/UPDATE hanya boleh jika status subscription bukan
  `read_only`. Pakai hook `useSubscriptionGate()` (dibangun di T5.1) untuk
  logika ini di frontend — jangan bikin pola disable ad-hoc sendiri-sendiri
  per halaman.
- **Pengecualian yang disengaja**: `public_listings` dan `listing_pricing`
  boleh SELECT publik tanpa login. Jangan menyamakan pola ini dengan tabel
  lain, dan jangan "memperbaiki" ini seolah itu bug keamanan.
- Akses lintas-tenant penuh (mis. Platform Owner Dashboard) hanya untuk
  `is_platform_admin()` — jangan pernah expose data lintas tenant ke Tenant
  Admin manapun.
- Setiap kali menambah tabel operasional baru, tulis test yang memverifikasi
  isolasi tenant bekerja di level DB (bukan cuma dicoba manual sekali).

## 7. Empat Lapisan Routing — Jangan Dicampur

```
/platform/*     → Platform Owner Dashboard (§7.1) — akses khusus Platform Owner
/account/*      → Tenant Owner Dashboard (§7.2) — siapa saja yang punya ≥1 tenant
/t/:tenantId/*  → Dashboard operasional tenant (RT/RW, Kos, Arisan, Kelas)
/listing/*      → Halaman publik Modul Listing — TANPA login, TANPA tenant context
```

Jangan mencampur logika dari satu lapisan ke lapisan lain (misal: jangan
memasukkan `TenantContext` ke halaman `/listing/*` yang memang harus bisa
diakses tanpa tenant context sama sekali).

## 8. Cara Kerja yang Diharapkan

1. **Rencana dulu sebelum eksekusi**, sebutkan task ID dari `task.md` yang
   sedang dikerjakan (mis. "Mengerjakan T3.2") supaya jelas posisinya dalam
   roadmap.
2. **Satu task = satu unit kerja**, jangan gabung beberapa task berbeda phase
   dalam satu sesi tanpa alasan jelas.
3. **Tunjukkan diff sebelum apply** untuk: migration SQL apa pun, RLS policy,
   Edge Functions pembayaran (Mayar QRIS), dan file konteks tenant/auth.
4. **Ikuti konvensi visual existing**: class Tailwind `.pv-*`, warna Forest
   (`forest-800` = `#1a3d2e`) dan Gold (`gold-500` = `#d4af37`), font Inter +
   Playfair Display — konsisten dengan versi lama, kecuali diminta ganti.
5. Kalau menemukan poin yang ditandai **"keputusan terbuka"** di `task.md`
   (lihat "Catatan untuk Agent Coding" — mis. perilaku user multi-tenant,
   multi-properti kos, angka pricing final), **jangan asumsikan sendiri** —
   tandai sebagai asumsi eksplisit dan konfirmasi ke user sebelum lanjut.

## 9. Keamanan & Credential — Hard Rules

- Jangan pernah menulis Mayar API key/secret, private key, JWT, atau token
  transaksi ke README, source code, `VITE_*`, atau commit ke repo.
- Simpan credential backend server-side (n8n Credentials atau Supabase Edge
  Function secrets), bukan di variable `VITE_*`.
- Edge Function pembayaran subscription (`create-subscription-payment`,
  `verify-subscription-payment`) menangani uang platform ↔ tenant — perlakukan
  sebagai kode paling sensitif di repo, wajib review manual sebelum merge.

## 10. Testing (Mulai dari Nol, Prioritas ke Logika Finansial & Isolasi Data)

Belum ada test suite. Agent wajib:

1. Pakai **Vitest** (cocok dengan Vite).
2. Prioritas testing pertama:
   - `calculateOptimalBlocks()` (T4.1) — kombinasi blok harga, wajib unit test
     mencakup kelipatan pas, sisa kecil, angka sangat kecil.
   - Logika pengocokan arisan (T8.5/T8.8) — pastikan pemenang tidak pernah
     terpilih dua kali dalam satu siklus.
   - Kalkulasi billing/tagihan berkala (reuse dari IPL, sekarang generik).
3. **Test isolasi tenant** (T1.9, T5.3) — wajib ada test yang memverifikasi
   INSERT/UPDATE/SELECT lintas tenant ditolak di level database, setiap kali
   tabel operasional baru ditambahkan.
4. Sebelum anggap task selesai: `npm run lint` lolos, `npm run build` lolos,
   test relevan lolos (`npx vitest run`).
5. Jangan menulis test yang menyentuh Mayar/Supabase production sungguhan.

## 11. Batasan Tambahan

- Jangan ubah project Supabase **production** existing (single-tenant) secara
  langsung — Phase 0 (T0.3) mengharuskan setup Supabase dev project terpisah
  untuk pengembangan fondasi platform.
- Jangan kembangkan `legacy-backend/`.
- Jangan push langsung ke `main`. Branch kerja mengikuti T0.2:
  `feature/platform-foundation` (bukan `feature/multi-tenant`).
- Jangan install package baru tanpa menyebut alasan di ringkasan.

## 12. Format Ringkasan Setelah Task Selesai

- Task ID dari `task.md` yang dikerjakan (mis. T2.4)
- File yang diubah/dibuat
- Alasan singkat, dikaitkan ke FR/NFR atau bagian spec yang relevan
- Status lint/build/test
- Apakah ada perubahan RLS/skema/credential (tandai jelas — butuh review ekstra)
- Apakah ada asumsi yang diambil untuk poin "keputusan terbuka" — sebutkan
  eksplisit dan minta konfirmasi
- Apakah Definition of Done phase terkait sudah terpenuhi atau masih parsial
