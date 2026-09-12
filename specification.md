# Specification.md — Portal Warga Multi-Tenant SaaS

> **Repository pengembangan:** https://github.com/kodok-ijho/RuangWarga-dev
> Semua commit, push, dan pull dilakukan ke repo ini.

Dokumen ini adalah spesifikasi teknis turunan dari `requirement.md`, dengan basis kode
existing di `github.com/kodok-ijho/PortalWarga` (repo asal, read-only reference) →
pengembangan dilanjutkan di `github.com/kodok-ijho/RuangWarga-dev`
(React 18 + Vite 5 + TailwindCSS + Supabase/PostgreSQL + Mayar QRIS + n8n).

> Catatan: skema di bawah adalah **rancangan baru** untuk versi multi-tenant. Skema lama
> PortalWarga (`profiles`, `units`, `ipl_bills`, `payments`, `expenses`, `events`, `rsvp`,
> `forum_*`) dijadikan referensi struktur, bukan disalin mentah — beberapa tabel diberi
> nama baru & kolom baru agar generik lintas vertikal. Agent yang mengerjakan task
> disarankan membaca ulang `supabase/schema.sql` di repo sebelum implementasi untuk
> memastikan nama kolom persis (mis. penulisan `full_name` vs `fullname`).

## 0. Prinsip Urutan Bangun: Platform-First

Sesuai `requirement.md` §3.1, spesifikasi ini disusun dengan asumsi urutan implementasi
sebagai berikut — **bukan urutan penyajian dokumen semata, tapi urutan nyata pengerjaan**:

1. §2 (model data tenant & subscription), §6 (RLS fondasi), §7.1 (Platform Owner Dashboard),
   §7.2 (Tenant Owner Dashboard) — **dibangun lebih dulu**, sebelum modul operasional apapun.
2. §3, §4, §5 (skema operasional generik & khusus arisan) — dibangun setelah fondasi di
   atas berjalan, dimulai dari template RT/RW.
3. §8, §9 (perhitungan blok, integrasi pembayaran subscription) — melengkapi fondasi di
   langkah 1, bisa dikerjakan paralel dengan langkah 1 karena sama-sama bagian dari
   "pabrik", bukan "produk".
4. §5.1 (Modul Listing Publik/Iklan) — dibangun **setelah** langkah 2 selesai untuk
   minimal tenant tipe `rt_rw` dan `kos`, karena bergantung pada data yang mereka
   hasilkan (unit kosong, keanggotaan warga terverifikasi).

## 1. Arsitektur Tingkat Tinggi

```
┌─────────────────────────────────────────────────────────┐
│                  Vercel (React SPA + PWA)                │
│   Landing/Signup → Onboarding Wizard → Tenant Dashboard   │
└───────────────────────┬───────────────────────────────────┘
                        │ Supabase JS SDK (dengan tenant context)
                        ▼
┌─────────────────────────────────────────────────────────┐
│              Supabase Cloud (1 project, shared DB)        │
│  Auth (Google OAuth) · PostgreSQL + RLS (tenant_id)        │
│  Edge Functions (QRIS Mayar, subscription billing)         │
└───────────────────────┬───────────────────────────────────┘
                        ▼
                 Mayar (QRIS Gateway)
                 — dipakai untuk 2 arus uang:
                   1) tagihan IPL/sewa/kontribusi (tenant → anggota)
                   2) subscription platform (tenant → platform owner)
```

Perbedaan utama dari arsitektur lama: **satu Supabase project melayani semua tenant**,
bukan satu project per kompleks perumahan.

## 2. Model Data — Tenant & Subscription (Baru)

```sql
-- Jenis tenant yang didukung
CREATE TYPE tenant_type AS ENUM ('rt_rw', 'kos', 'arisan', 'kelas');

CREATE TABLE tenants (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,               -- "Palm Village RT 05", "Kos Melati"
  type            tenant_type NOT NULL,
  owner_id        uuid NOT NULL REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Harga blok, dikonfigurasi per tipe tenant oleh Platform Owner
CREATE TABLE block_pricing (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_type     tenant_type NOT NULL,
  block_size      integer NOT NULL CHECK (block_size IN (5, 10)),
  price_per_block numeric(12,2) NOT NULL,
  is_active       boolean NOT NULL DEFAULT true,
  UNIQUE (tenant_type, block_size)
);

-- Opsi durasi periode subscription
CREATE TABLE subscription_periods (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  duration_months   integer NOT NULL CHECK (duration_months IN (3, 6, 12)),
  discount_percent  numeric(5,2) NOT NULL DEFAULT 0,
  is_active         boolean NOT NULL DEFAULT true
);

CREATE TYPE subscription_status AS ENUM ('trial', 'active', 'read_only');

CREATE TABLE tenant_subscriptions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  status              subscription_status NOT NULL DEFAULT 'trial',
  period_id           uuid REFERENCES subscription_periods(id),      -- null saat trial
  next_period_id      uuid REFERENCES subscription_periods(id),      -- pilihan utk renewal
  trial_started_at    timestamptz NOT NULL DEFAULT now(),
  trial_ends_at       timestamptz NOT NULL,                           -- trial_started_at + 15 hari
  current_period_start timestamptz,
  current_period_end   timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Blok yang dibeli dalam 1 subscription (bisa campuran ukuran)
CREATE TABLE tenant_subscription_blocks (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id   uuid NOT NULL REFERENCES tenant_subscriptions(id) ON DELETE CASCADE,
  block_size        integer NOT NULL CHECK (block_size IN (5, 10)),
  quantity          integer NOT NULL CHECK (quantity > 0),
  price_snapshot    numeric(12,2) NOT NULL   -- harga per blok saat dibeli (histori harga)
);

-- Riwayat transaksi pembayaran subscription (platform owner ↔ tenant)
CREATE TABLE subscription_payments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id   uuid NOT NULL REFERENCES tenant_subscriptions(id),
  amount            numeric(12,2) NOT NULL,
  qris_ref          text,
  status            text NOT NULL DEFAULT 'pending', -- pending | paid | failed
  paid_at           timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);
```

### Kapasitas Terpakai vs Kapasitas Dibeli

- `active_units` dihitung dinamis dari `COUNT(*)` anggota/unit aktif dalam tenant (bukan
  kolom tersimpan), untuk ditampilkan sebagai indikator "X dari Y unit terpakai".
- `purchased_capacity` = `SUM(block_size * quantity)` dari `tenant_subscription_blocks`
  pada subscription yang sedang berjalan.
- Validasi FR-9/FR-11: sistem **tidak memblokir** penambahan anggota melebihi kapasitas
  blok yang dibeli (agar tidak mengganggu operasional harian), namun menampilkan
  peringatan dan mewajibkan penyesuaian blok saat **renewal** berikutnya (sesuai FR-11 —
  keputusan penyesuaian ada di tangan user, bukan otomatis).

## 3. Perubahan Skema Data Operasional (Generik Lintas Vertikal)

Tabel-tabel operasional existing PortalWarga diberi kolom `tenant_id` dan sebagian
diganti nama agar generik:

```sql
-- Menggantikan/memperluas peran "units" lama
CREATE TABLE tenant_units (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  label             text NOT NULL,          -- "Blok A/12", "Kamar 3", "Slot Anggota"
  status            text NOT NULL DEFAULT 'active', -- active | vacant | occupied (kos) | inactive
  metadata          jsonb DEFAULT '{}'::jsonb        -- field spesifik vertikal (lihat §4)
);

-- Menggantikan "profiles" lama, tetap 1 baris per user tapi kini terikat tenant
CREATE TABLE tenant_members (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id           uuid NOT NULL REFERENCES auth.users(id),
  unit_id           bigint REFERENCES tenant_units(id),
  full_name         text NOT NULL,
  phone             text,
  role              text NOT NULL,   -- admin | bendahara | pengurus | anggota
  status            text NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  occupancy_status  text,             -- khusus kos: pemilik/penyewa; khusus rt_rw: existing value
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);

-- Menggantikan "ipl_bills" lama — generik untuk IPL, sewa, kontribusi arisan/kelas
CREATE TABLE billing_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  unit_id           bigint REFERENCES tenant_units(id),
  member_id         uuid REFERENCES tenant_members(id),
  period            text NOT NULL,        -- 'YYYY-MM'
  amount            numeric(12,2) NOT NULL,
  late_fee          numeric(12,2) DEFAULT 0,
  due_date          date,
  status            text NOT NULL DEFAULT 'unpaid', -- unpaid | pending_verification | paid
  qris_ref          text,
  contract_start    date,     -- khusus kos
  contract_end      date,     -- khusus kos
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- Payments tetap seperti pola lama, tambah tenant_id
CREATE TABLE payments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  billing_item_id   uuid REFERENCES billing_items(id),
  member_id         uuid REFERENCES tenant_members(id),
  amount            numeric(12,2) NOT NULL,
  method            text NOT NULL,  -- qris | transfer | tunai
  transaction_id    text,
  status            text NOT NULL DEFAULT 'pending',
  proof_url         text,           -- bukti transfer (existing feature)
  paid_at           timestamptz,
  metadata          jsonb DEFAULT '{}'::jsonb
);

-- expenses tetap seperti pola lama, tambah tenant_id
CREATE TABLE expenses (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  category          text NOT NULL,
  amount            numeric(12,2) NOT NULL,
  description       text,
  receipt_url       text,
  recorded_by       uuid REFERENCES tenant_members(id),
  created_at        timestamptz NOT NULL DEFAULT now()
);
```

## 4. Field Spesifik Vertikal (via `tenant_units.metadata` & `tenant.type`)

Alih-alih tabel terpisah untuk tiap vertikal, field yang tidak generik disimpan sebagai
JSONB di `metadata` agar skema inti tetap satu:

| Tenant type | Contoh isi `tenant_units.metadata` |
|---|---|
| `rt_rw` | `{ "blok": "A", "no_rumah": "12", "status_hunian": "pemilik" }` |
| `kos` | `{ "no_kamar": "3", "lantai": 2, "fasilitas": ["ac","kamar_mandi_dalam"] }` |
| `arisan` | `{ "urutan_pernah_menang": [1,3], "sudah_dapat_giliran": false }` |
| `kelas` | `{ "nama_siswa": "...", "kelas": "6A" }` |

## 5. Tabel Khusus Arisan (Aktif hanya jika `tenant.type = 'arisan'`)

```sql
CREATE TABLE arisan_rounds (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  period            text NOT NULL,          -- 'YYYY-MM' atau nomor putaran
  status            text NOT NULL DEFAULT 'collecting', -- collecting | ready_to_draw | drawn
  winner_member_id  uuid REFERENCES tenant_members(id),
  drawn_at          timestamptz,
  drawn_by          uuid REFERENCES tenant_members(id),   -- admin yang menjalankan kocok
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE arisan_participants (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  member_id         uuid NOT NULL REFERENCES tenant_members(id),
  has_won           boolean NOT NULL DEFAULT false,
  won_at_round_id   uuid REFERENCES arisan_rounds(id),
  UNIQUE (tenant_id, member_id)
);
```

**Logika pengocokan (fungsi/Edge Function):**
1. Validasi seluruh peserta aktif telah membayar kontribusi periode berjalan
   (cek `billing_items.status = 'paid'` untuk periode tsb).
2. Ambil kandidat: peserta dengan `has_won = false`.
3. Pilih pemenang secara acak (`ORDER BY random() LIMIT 1`) dari kandidat.
4. Update `arisan_rounds.winner_member_id`, `arisan_participants.has_won = true`.
5. Jika seluruh peserta sudah `has_won = true`, sediakan aksi "mulai siklus baru"
   yang me-reset seluruh `has_won` ke `false`.

## 5.1 Modul Listing Publik / Iklan (Req FR-22–FR-30)

Berbeda dari seluruh tabel sebelumnya, modul ini **sengaja dirancang untuk bocor lintas
tenant** — datanya memang ditujukan untuk dilihat publik tanpa login. Dibangun setelah
minimal template `rt_rw` dan `kos` berjalan (lihat Spec §0 poin 4).

```sql
CREATE TYPE listing_type AS ENUM ('room_vacancy', 'umkm');
CREATE TYPE listing_status AS ENUM ('active', 'rented_or_sold', 'expired');

CREATE TABLE public_listings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  unit_id         bigint REFERENCES tenant_units(id),    -- diisi utk room_vacancy (opsional prefill)
  posted_by       uuid NOT NULL REFERENCES tenant_members(id), -- owner kos ATAU warga individual
  type            listing_type NOT NULL,
  title           text NOT NULL,
  description     text,
  category        text,                    -- khusus umkm: "makanan", "laundry", "jasa", dst
  price           numeric(12,2),           -- harga sewa (kos) / harga mulai dari (umkm)
  photos          jsonb DEFAULT '[]'::jsonb,
  contact_phone   text NOT NULL,           -- nomor WA yang dihubungi calon penyewa/pembeli
  location_hint   text,                    -- area umum (kecamatan/kota) -- bukan alamat detail
  is_featured     boolean NOT NULL DEFAULT false,
  featured_until  timestamptz,
  status          listing_status NOT NULL DEFAULT 'active',
  expires_at      timestamptz NOT NULL,    -- created_at + masa aktif (mis. 30 hari)
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Harga listing, dikonfigurasi Platform Owner (mirip pola block_pricing)
CREATE TABLE listing_pricing (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_type    listing_type NOT NULL,
  is_featured     boolean NOT NULL,        -- baris terpisah utk harga biasa vs featured
  duration_days   integer NOT NULL DEFAULT 30,
  price           numeric(12,2) NOT NULL,
  UNIQUE (listing_type, is_featured, duration_days)
);

CREATE TABLE listing_payments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id      uuid NOT NULL REFERENCES public_listings(id) ON DELETE CASCADE,
  amount          numeric(12,2) NOT NULL,
  qris_ref        text,
  status          text NOT NULL DEFAULT 'pending', -- pending | paid | failed
  paid_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
```

**Alur bisnis (Req FR-27, FR-28, FR-29):**
1. **Kos**: saat `tenant_units.status = 'vacant'`, UI menawarkan tombol "Iklankan kamar
   ini" yang mem-prefill `public_listings` dari data kamar (nomor kamar, fasilitas dari
   `metadata`). Owner lengkapi foto/harga/kontak, lalu bayar via `listing_payments`.
2. **RT/RW**: warga isi form manual dari dashboard mereka (bukan prefill, karena tidak ada
   sumber data existing untuk usaha warga).
3. Kedua jenis listing melalui alur bayar QRIS yang sama (Edge Function serupa
   `create-subscription-payment`/`verify-subscription-payment` di Spec §9, dengan target
   tabel `listing_payments`).
4. Job terjadwal harian menandai listing `expired` saat `expires_at` terlewati, mirip pola
   scheduled job di Spec §Phase 6 (task.md T4.6).

## 6. Row Level Security (RLS) — Pola Umum

Helper function:

```sql
CREATE OR REPLACE FUNCTION current_tenant_ids()
RETURNS SETOF uuid AS $$
  SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid() AND status = 'approved';
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_tenant_admin(t_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM tenant_members
    WHERE tenant_id = t_id AND user_id = auth.uid() AND role = 'admin' AND status = 'approved'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION tenant_subscription_status(t_id uuid)
RETURNS subscription_status AS $$
  SELECT status FROM tenant_subscriptions WHERE tenant_id = t_id;
$$ LANGUAGE sql STABLE SECURITY DEFINER;
```

Pola policy pada tabel transaksional (contoh `billing_items`, `payments`):

```sql
-- SELECT selalu diizinkan untuk anggota tenant terkait (termasuk saat read_only — FR-15)
CREATE POLICY select_own_tenant ON billing_items
  FOR SELECT USING (tenant_id IN (SELECT current_tenant_ids()));

-- INSERT/UPDATE hanya jika status subscription bukan read_only
CREATE POLICY write_when_active ON billing_items
  FOR INSERT WITH CHECK (
    tenant_id IN (SELECT current_tenant_ids())
    AND tenant_subscription_status(tenant_id) IN ('trial', 'active')
  );

CREATE POLICY update_when_active ON billing_items
  FOR UPDATE USING (
    tenant_id IN (SELECT current_tenant_ids())
    AND tenant_subscription_status(tenant_id) IN ('trial', 'active')
  );
```

Policy serupa diterapkan pada `payments` (INSERT pembayaran baru), `tenant_members`
(approval anggota baru), dan `arisan_rounds` (menjalankan kocok) — semuanya diblok saat
`read_only`, sesuai FR-15.

### 6.1 RLS Khusus `public_listings` — Pengecualian Isolasi Tenant

Berbeda dari pola di atas, tabel ini **sengaja membuka akses SELECT ke siapa saja**,
termasuk yang belum login, karena listing memang ditujukan publik (Req FR-23, FR-24):

```sql
-- SELECT terbuka untuk SIAPA SAJA (termasuk anonymous/belum login), asal masih aktif
CREATE POLICY public_read_active_listings ON public_listings
  FOR SELECT USING (status = 'active' AND expires_at > now());

-- INSERT tetap dibatasi: harus anggota tenant terkait, dan tenant TIDAK sedang read_only
CREATE POLICY tenant_member_can_post_listing ON public_listings
  FOR INSERT WITH CHECK (
    tenant_id IN (SELECT current_tenant_ids())
    AND tenant_subscription_status(tenant_id) IN ('trial', 'active')
  );

-- UPDATE (mis. tandai rented_or_sold) hanya oleh yang memposting
CREATE POLICY owner_can_update_listing ON public_listings
  FOR UPDATE USING (posted_by IN (
    SELECT id FROM tenant_members WHERE user_id = auth.uid()
  ));

-- listing_pricing: SELECT publik (agar harga bisa ditampilkan sebelum bayar),
-- tulis hanya is_platform_admin()
CREATE POLICY public_read_listing_pricing ON listing_pricing FOR SELECT USING (true);
```

Catatan penting untuk agent: RLS ini adalah **pengecualian yang disengaja**, bukan celah
keamanan yang perlu ditambal. Jangan menyamakan pola ini dengan tabel operasional lain.

## 7. Frontend — Perubahan Struktur

```
client/src/
├── context/
│   ├── AuthContext.jsx        (existing, tambah tenant context)
│   ├── TenantContext.jsx      (BARU — tenant aktif, type, subscription status)
│   └── ToastContext.jsx       (existing)
├── config/
│   └── tenantTemplates.js     (BARU — mapping istilah & field per tenant.type)
├── pages/
│   ├── platform/                    (BARU — level Platform Owner, lihat §7.1)
│   │   ├── PlatformTenantList.jsx
│   │   ├── PlatformRevenue.jsx
│   │   └── PlatformPricingConfig.jsx
│   ├── account/                     (BARU — level Tenant Owner, lihat §7.2)
│   │   ├── MyTenants.jsx
│   │   ├── AddNewTenant.jsx
│   │   └── SubscriptionStatus.jsx
│   ├── onboarding/
│   │   ├── ChooseTenantType.jsx   (BARU)
│   │   ├── SetupWizard.jsx        (BARU)
│   │   └── ChoosePlan.jsx         (BARU — pilih blok & periode)
│   ├── Residents.jsx → generik jadi Members.jsx (existing, diadaptasi)
│   ├── PaymentMatrix.jsx        (existing, diadaptasi generik)
│   ├── Arisan/
│   │   ├── ArisanRounds.jsx     (BARU)
│   │   └── ArisanDraw.jsx       (BARU)
│   ├── listing/                     (BARU — Modul Listing Publik, lihat §7.3)
│   │   ├── PostListing.jsx           (dari dalam dashboard tenant, buat listing baru)
│   │   └── MyListings.jsx            (dari dalam dashboard tenant, kelola listing sendiri)
│   └── ... (Reports, Expenses, Settings — existing, diadaptasi generik)
├── pages-public/                    (BARU — halaman publik TANPA tenant context, lihat §7.3)
│   ├── RoomListingDirectory.jsx      (/listing/kos)
│   ├── RoomListingDetail.jsx         (/listing/kos/:id)
│   ├── UmkmListingDirectory.jsx      (/listing/umkm)
│   └── UmkmListingDetail.jsx         (/listing/umkm/:id)
```

Routing tingkat atas mencerminkan 4 lapisan yang terpisah jelas:

```
/platform/*     → Platform Owner Dashboard (§7.1) — akses khusus Platform Owner
/account/*      → Tenant Owner Dashboard (§7.2) — akses siapa saja yang punya ≥1 tenant
/t/:tenantId/*  → Dashboard operasional tenant (Residents, PaymentMatrix, Arisan, dst)
/listing/*      → Halaman publik Modul Listing (§7.3) — TANPA login, TANPA tenant context
```

### 7.1 Platform Owner Dashboard (Req FR-0.1, FR-0.2)

Dashboard internal, hanya untuk Platform Owner. Tidak dipasarkan/terlihat oleh Tenant
Admin manapun (mirip SumoPod yang tidak mengekspos dashboard internalnya ke publik).

| Halaman | Fungsi | Sumber data |
|---|---|---|
| `PlatformTenantList.jsx` | List semua tenant, filter by type/status, cari tenant tertentu | `tenants` JOIN `tenant_subscriptions` |
| `PlatformRevenue.jsx` | MRR total & breakdown per tipe tenant, tren dari waktu ke waktu | Agregat `subscription_payments` + `tenant_subscription_blocks` |
| `PlatformPricingConfig.jsx` | CRUD `block_pricing` & `subscription_periods` | `block_pricing`, `subscription_periods` |

Akses dijaga RLS: hanya `user_id` yang terdaftar di tabel `platform_admins` (baru, lihat
di bawah) yang bisa `SELECT`/`UPDATE` tabel-tabel ini secara lintas tenant.

```sql
CREATE TABLE platform_admins (
  user_id   uuid PRIMARY KEY REFERENCES auth.users(id)
);

CREATE OR REPLACE FUNCTION is_platform_admin()
RETURNS boolean AS $$
  SELECT EXISTS (SELECT 1 FROM platform_admins WHERE user_id = auth.uid());
$$ LANGUAGE sql STABLE SECURITY DEFINER;
```

### 7.2 Tenant Owner Dashboard (Req FR-0.3, FR-0.4)

Dashboard akun untuk pendaftar (Tenant Admin) sebagai pelanggan platform — terpisah dari
dashboard operasional yang mereka pakai sehari-hari untuk mengelola warga/kamar/arisan.

| Halaman | Fungsi | Sumber data |
|---|---|---|
| `MyTenants.jsx` | List tenant yang dimiliki/dikelola user login saat ini, mirip "My Apps" SumoPod | `tenant_members` WHERE `user_id = auth.uid()` JOIN `tenants` |
| `AddNewTenant.jsx` | Entry point membuat tenant baru tanpa logout — memicu ulang alur `ChooseTenantType.jsx` → `SetupWizard.jsx` | insert ke `tenants`, `tenant_members` |
| `SubscriptionStatus.jsx` | Status langganan tenant yang sedang dipilih (trial/active/read_only), riwayat `subscription_payments`, form renewal | `tenant_subscriptions`, `tenant_subscription_blocks`, `subscription_payments` |

Memilih salah satu tenant di `MyTenants.jsx` menyimpan `activeTenantId` ke
`TenantContext.jsx` dan mengarahkan ke `/t/:tenantId/dashboard` (lapisan operasional).

### 7.3 Modul Listing Publik (Req FR-22–FR-30)

Dua sisi berbeda: **sisi posting** (di dalam dashboard tenant, perlu login) dan **sisi
publik** (halaman terpisah, tanpa login, tanpa tenant context sama sekali).

**Sisi posting (di dalam `/t/:tenantId/*`):**

| Halaman | Fungsi | Muncul untuk tipe tenant |
|---|---|---|
| `PostListing.jsx` | Form buat listing baru — prefill dari `tenant_units` untuk `room_vacancy`, form kosong untuk `umkm`; menampilkan harga dari `listing_pricing` sebelum lanjut bayar | `kos` (room_vacancy), `rt_rw` (umkm) |
| `MyListings.jsx` | List listing milik tenant/anggota ybs, status aktif/expired, tombol perpanjang atau tandai tersewa/terjual | `kos`, `rt_rw` |

**Sisi publik (`/listing/*`, di luar seluruh struktur tenant):**

| Halaman | Fungsi | Sumber data |
|---|---|---|
| `RoomListingDirectory.jsx` (`/listing/kos`) | Grid semua kamar kosong dari **seluruh tenant kos**, filter area/harga | `public_listings` WHERE `type='room_vacancy' AND status='active'` — lintas tenant |
| `RoomListingDetail.jsx` (`/listing/kos/:id`) | Detail kamar + foto + tombol kontak WhatsApp | `public_listings` |
| `UmkmListingDirectory.jsx` (`/listing/umkm`) | Direktori UMKM dari **seluruh tenant rt_rw**, filter kategori/area | `public_listings` WHERE `type='umkm' AND status='active'` — lintas tenant |
| `UmkmListingDetail.jsx` (`/listing/umkm/:id`) | Detail usaha + foto + tombol kontak WhatsApp | `public_listings` |

Halaman-halaman `/listing/*` **tidak memuat `TenantContext.jsx`** — ini murni etalase
publik lintas tenant, konsisten dengan RLS pengecualian di Spec §6.1. Listing berstatus
`is_featured = true` ditampilkan lebih menonjol/di posisi awal pada kedua halaman direktori.

**`tenantTemplates.js`** memetakan istilah UI per `tenant.type`, contoh:

```js
export const TENANT_TEMPLATES = {
  rt_rw:   { unitLabel: "Rumah", billLabel: "IPL", memberLabel: "Warga" },
  kos:     { unitLabel: "Kamar", billLabel: "Sewa", memberLabel: "Penyewa" },
  arisan:  { unitLabel: "Slot",  billLabel: "Kontribusi", memberLabel: "Peserta" },
  kelas:   { unitLabel: "Slot",  billLabel: "Iuran", memberLabel: "Siswa" },
};
```

## 8. Perhitungan Harga Blok (Contoh Ilustratif, Angka Final Ditentukan Platform Owner)

```
kapasitas_dibutuhkan = jumlah_anggota_estimasi
kombinasi_optimal    = fungsi minimasi biaya dari block_pricing (linear/greedy):
  - Prioritaskan blok besar (10 unit) untuk kelipatan penuh
  - Sisa < 10 dipenuhi dengan blok kecil (5 unit) — bisa lebih dari 1 blok kecil bila perlu
  - Bandingkan total harga vs alternatif all-blok-besar dibulatkan ke atas,
    pilih yang termurah untuk direkomendasikan ke user (user tetap bisa override manual)
```

Fungsi ini diimplementasikan sebagai util murni (`calculateOptimalBlocks(estimasiUnit, tenantType)`)
agar mudah diuji unit-test terpisah dari UI.

## 9. Integrasi Pembayaran Subscription (Mayar QRIS)

Alur teknis mengikuti pola existing PortalWarga untuk QRIS IPL, namun target record
berbeda (`subscription_payments` bukan `payments`):

```
Tenant Admin pilih blok+periode → Generate QRIS (Mayar, Edge Function baru:
  create-subscription-payment) → Scan & Bayar
                                        │
                                        ▼
                              Webhook Mayar → Edge Function
                              verify-subscription-payment
                                        │
                          ┌─────────────┼─────────────┐
                          ▼             ▼             ▼
                   Update subscription_payments.status = 'paid'
                   Update tenant_subscriptions.status = 'active'
                   Set current_period_start/end sesuai period_id
```

## 10. Ketergantungan pada Kode Existing yang Perlu Ditinjau Ulang Agent

- `client/src/services/mockData.js` — perlu varian mock data per `tenant.type` untuk mode
  demo tetap berjalan di semua vertikal.
- `client/src/context/AuthContext.jsx` — dual-mode auth (Demo + Supabase) perlu diperluas
  agar tenant context ikut ter-resolve saat login.
- `supabase/schema.sql` — dasar RLS & trigger (`handle_new_user()`, `touch_updated_at()`)
  bisa direuse polanya, ditambah trigger baru untuk auto-membuat `tenant_subscriptions`
  saat tenant baru dibuat (`handle_new_tenant()`).
