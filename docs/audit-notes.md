# Audit Notes — RuangWarga Multi-Tenant SaaS
> Dokumen resmi hasil audit Phase 0 (Task T0.1 – T0.4).
> Tanggal Audit: 13 September 2026
> Branch Pengembangan: `feature/platform-foundation`
> Repository Target: `https://github.com/kodok-ijho/RuangWarga-dev`
> Database Dev Target: Supabase `Ruangwarga-dev` (`jqbegedjsylhrqpknwor`) — PostgreSQL v17.6

---

## 1. Ringkasan Eksekutif Hasil Audit

Sesuai mandat **AGENT.md Aturan 4 ("Verifikasi ke Kode Aktual, Bukan ke Dokumen")**, audit ini membandingkan langsung implementasi kode nyata pada basis kode `PortalWarga` v1.4.3 dengan rancangan pada `specification.md` dan kebutuhan di `requirement.md`.

Hasil audit menemukan bahwa perbedaan utama antara kode legacy dan rancangan masa depan berpusat pada **tiga pilar**:
1. **Perubahan Skema Data:** Dari relasi perumahan flat tunggal (`units` ber-ID bigint, `profiles.role` tunggal) menjadi model tenant-scoped UUID dengan kolom fleksibel (`metadata` JSONB).
2. **Pergeseran Arsitektur Auth:** Dari *n8n custom App JWT* menuju *Supabase Auth native* dengan *Row Level Security (RLS)* murni di level database.
3. **Restrukturisasi Routing:** Dari rute flat (seperti `/residents`, `/payment-matrix`) menuju 4-lapisan rute terisolasi (`/platform/*`, `/account/*`, `/t/:tenantId/*`, `/listing/*`).

---

## 2. Pemetaan Komparasi Skema Database

### 2.1. Tabel Unit & Entitas Fisik
| Karakteristik | Skema Aktual (`units`) | Rancangan Baru (`tenant_units`) | Catatan Penyesuaian |
|---|---|---|---|
| **Primary Key** | `bigint generated always as identity` | `uuid default gen_random_uuid()` | **PENTING:** Seluruh foreign key ke unit di masa depan harus bermigrasi ke UUID. |
| **Isolasi Tenant** | Tidak ada (`tenant_id` nihil) | `tenant_id uuid not null references tenants(id)` | Wajib ada index `(tenant_id, unit_identifier)`. |
| **Identitas Unit** | Kolom terpisah: `block text`, `unit_number text`, `floor int` | `unit_identifier text not null`, `label text` | Pada tipe `rt_rw`, blok & nomor unit digabung ke `unit_identifier` (misal: "A1/05") dan detail nomor disimpan di `metadata`. |
| **Status Huni** | Enum `occupancy_status`: `owner_occupied`, `owner_vacant`, `owner_rented`, `tenant`, `unknown` | Kolom `is_active boolean`, status huni spesifik masuk ke `metadata` JSONB | Untuk Kos: `metadata.status` ('occupied', 'vacant', 'maintenance'). |
| **Metadata JSONB** | Tidak ada | `metadata jsonb not null default '{}'::jsonb` | Menampung: ukuran luas, daya listrik, nomor token, fasilitas per vertikal. |

### 2.2. Tabel Anggota & Profil Pengguna
| Karakteristik | Skema Aktual (`profiles`) | Rancangan Baru (`tenant_members`) | Catatan Penyesuaian |
|---|---|---|---|
| **Definisi Entitas** | 1 akun = 1 baris profil di sistem | 1 baris = keanggotaan pengguna di 1 tenant tertentu | Pengguna yang memiliki 3 kos/arisan memiliki 3 record `tenant_members`. |
| **User Identity** | `google_sub text unique`, `email text unique` | `user_id uuid references auth.users(id)` | Identitas auth dipegang oleh `auth.users` Supabase, bukan manual `google_sub`. |
| **Role Otoritas** | `public.user_role as enum ('admin', 'bendahara', 'pengurus', 'warga')` | `role text not null check (role in ('admin', 'bendahara', 'pengurus', 'anggota'))` | Nama peran terendah diubah dari `warga` (spesifik perumahan) menjadi `anggota` (generik). Label UI disesuaikan via `tenantTemplates.js`. |
| **Status Approval** | Enum `approval_status`: `pending_approval`, `approved`, `rejected`, `suspended` | `status text not null check (status in ('active', 'pending', 'inactive'))` | Disederhanakan menjadi 3 state. Riwayat approval dicatat di audit. |

### 2.3. Tabel Tagihan & Penagihan
| Karakteristik | Skema Aktual (`ipl_bills`) | Rancangan Baru (`billing_items`) | Catatan Penyesuaian |
|---|---|---|---|
| **Lingkup Tagihan** | Khusus IPL perumahan bulanan | Generik: IPL, sewa kamar kos, iuran arisan, kas kelas | Kolom `category` ditambahkan untuk membedakan jenis tagihan. |
| **Target Penagihan** | Wajib per `unit_id` (relasi rumah) | Opsional per `unit_id` atau per `member_id` | **Kritis:** Pada `arisan` dan `kelas`, tagihan langsung terikat ke `member_id` tanpa memerlukan `unit_id`. |
| **Format Periode** | `check (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')` | `period text not null` | Format 'YYYY-MM' dipertahankan untuk tagihan bulanan (RT/RW & Kos), tapi teks fleksibel untuk putaran arisan. |
| **Status Tagihan** | Enum `bill_status`: `pending`, `paid`, `overdue`, `cancelled` | `status text check (status in ('pending', 'paid', 'overdue', 'cancelled', 'waived'))` | Penambahan status `waived` (pembebasan tagihan). |

### 2.4. Tabel Pembayaran & Verifikasi
| Karakteristik | Skema Aktual (`payments`) | Rancangan Baru (`payments`) | Catatan Penyesuaian |
|---|---|---|---|
| **Foreign Key** | `ipl_bill_id uuid references ipl_bills(id)` | `billing_item_id uuid references billing_items(id)` | Mengganti rujukan tabel dari `ipl_bills` ke `billing_items`. |
| **Scope Tenant** | Implisit via bill | Eksplisit `tenant_id uuid not null references tenants(id)` | Memastikan query pembayaran terfilter aman via RLS tenant. |
| **Payment Gateway** | Kolom `order_id`, `transaction_id` disiapkan untuk Midtrans/DOKU | Disiapkan untuk Mayar QRIS (`provider = 'mayar'`) | Payload webhook Mayar akan disimpan di `metadata` JSONB. |

---

## 3. Pemetaan Autentikasi & Otorisasi

### 3.1. Alur Auth Saat Ini (PortalWarga)
```
Browser Google OAuth 
  → POST /api/n8n/auth/google 
  → n8n Workflow membaca Google ID Token 
  → n8n terbitkan App JWT custom (HS256) 
  → LocalStorage: pv_app_jwt, pv_current_user
```
* **Kelemahan Kritis:** Supabase tidak memvalidasi JWT ini. RLS bawaan Supabase di-bypass karena seluruh API dipanggil via proxy n8n menggunakan `service_role_key`.

### 3.2. Target Alur Auth (RuangWarga SaaS Multi-Tenant)
```
Browser Supabase Client 
  → supabase.auth.signInWithOAuth({ provider: 'google' }) 
  → Supabase Auth menerbitkan JWT resmi Supabase (sub = auth.users.id) 
  → Browser query langsung ke Supabase dengan Bearer JWT 
  → PostgreSQL RLS memeriksa auth.uid() & current_tenant_ids()
```
* **Keuntungan:** Keamanan isolasi tenant 100% ditegakkan di level database, tidak bergantung pada middleware aplikasi. Kecepatan respon queries meningkat signifikan karena memangkas 2 lapis hop jaringan (menghilangkan latensi n8n & Vercel proxy untuk read/write standar).

---

## 4. Pemetaan Routing & Komponen Frontend

### 4.1. Pemisahan 4 Layer Routing (AGENT.md §7)
Kode saat ini di `App.jsx` memiliki rute yang seluruhnya datar (`/residents`, `/houses`, `/payment-matrix`, `/reports`, `/settings`, `/expenses`, `/events`, `/users`).

Struktur target yang wajib ditegakkan:
1. `/platform/*` → **Platform Owner Dashboard**
   - Rute: `/platform/tenants`, `/platform/subscriptions`, `/platform/pricing`, `/platform/audit-logs`.
   - Guard: `is_platform_admin()` (khusus superadmin sistem).
2. `/account/*` → **Tenant Owner Dashboard**
   - Rute: `/account/tenants`, `/account/subscription`, `/account/billing`, `/account/create-tenant`.
   - Guard: Pengguna terautentikasi yang memiliki peran admin di minimal 1 tenant.
3. `/t/:tenantId/*` → **Dashboard Operasional Tenant**
   - Rute: `/t/:tenantId/dashboard`, `/t/:tenantId/members`, `/t/:tenantId/units`, `/t/:tenantId/bills`, `/t/:tenantId/reports`.
   - Guard: Anggota terverifikasi dari `tenantId` terkait.
4. `/listing/*` → **Modul Direktori Publik**
   - Rute: `/listing/rooms`, `/listing/rooms/:id`, `/listing/umkm`, `/listing/umkm/:id`.
   - Guard: **Publik Tanpa Login** dan **Tanpa Tenant Context**.

---

## 5. Keputusan Teknis untuk Fase Fondasi (Phase 1–5)

1. **Strategi Pembangunan "Pabrik Dulu, Baru Produk":**
   - Phase 1 murni mendirikan tabel fondasi: `tenants`, `tenant_subscriptions`, `tenant_subscription_blocks`, `block_pricing`, `subscription_periods`, `subscription_payments`.
   - Tidak ada tabel operasional lama (`profiles`, `units`, `ipl_bills`) yang diubah atau dihapus di Phase 1. Hal ini menjamin tidak ada breaking changes prematur.
2. **Format Identitas & Foreign Key:**
   - Semua tabel multi-tenant baru menggunakan `UUID` sebagai Primary Key.
   - Semua tabel berelasi menyertakan `tenant_id uuid not null`.
3. **Penegakan RLS Subscription Status:**
   - Seluruh tabel operasional di masa depan akan mengonsumsi helper function `tenant_subscription_status(tenant_id)`.
   - Mode `read_only` memblokir operasi INSERT, UPDATE, dan DELETE pada tabel operasional, namun SELECT tetap diizinkan.
4. **Kesiapan Mode Demo (`VITE_DEMO_MODE=true`):**
   - Struktur `mockData.js` tetap dipertahankan dan akan dilengkapi generator mock multi-tenant saat Phase 2 & 6 berjalan, sehingga pengujian UI lokal tetap independen.

---

## 6. Verifikasi Definition of Done (DoD) Phase 0

- [x] **Branch siap:** Branch `feature/platform-foundation` telah dibuat dari `main` dan dipush ke `https://github.com/kodok-ijho/RuangWarga-dev.git`.
- [x] **Supabase dev project aktif:** Project `Ruangwarga-dev` (`jqbegedjsylhrqpknwor`) telah terverifikasi aktif, sehat, dan terkoneksi langsung dengan Supabase MCP.
- [x] **Catatan audit lengkap:** Dokumen ini (`docs/audit-notes.md`) memetakan seluruh perbedaan nyata kode aktual vs spesifikasi dan menjadi acuan presisi untuk Phase 1 ke depan.

**Status Phase 0: LULUS DEFINITION OF DONE (100% COMPLETE)**
