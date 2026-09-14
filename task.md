# Task.md — Portal Warga Multi-Tenant SaaS

> **Repository pengembangan:** https://github.com/kodok-ijho/RuangWarga-dev
> Semua commit, push, dan pull dilakukan ke repo ini.
Breakdown task implementasi, disusun bertahap (phase) agar bisa dikerjakan agent coding
secara berurutan. Setiap task mengacu ke `requirement.md` (FR/NFR) dan `specification.md`
(bagian §) yang relevan.

> Konvensi: kerjakan phase secara berurutan. Jangan mulai Phase N+1 sebelum Phase N lulus
> kriteria "Definition of Done". Setiap task idealnya jadi 1 PR/commit terpisah agar mudah
> di-review.

> **Prinsip urutan (Req §3.1): Platform-First.** Fondasi "pabrik" (tenant, subscription,
> billing platform, Platform Owner Dashboard, Tenant Owner Dashboard) dibangun dan
> divalidasi selesai lebih dulu (Phase 1-4), **sebelum** modul operasional vertikal
> manapun -- termasuk migrasi fitur RT/RW existing dari PortalWarga -- mulai dikerjakan
> (Phase 5 dst). Fitur RT/RW existing diperlakukan sebagai template vertikal pertama yang
> dipasang di atas fondasi, bukan sebagai titik awal pengerjaan.

---

## Phase 0 -- Persiapan & Audit Kode Existing

- [x] **T0.1** -- Clone/pull `github.com/kodok-ijho/PortalWarga`, baca ulang
  `supabase/schema.sql`, `client/src/context/AuthContext.jsx`, dan seluruh isi
  `client/src/pages/` untuk memetakan nama kolom, nama tabel, dan konvensi penamaan
  aktual (jangan asumsikan nama dari dokumen ini -- verifikasi ke file sumber).
- [x] **T0.2** -- Buat branch baru `feature/platform-foundation` dari `main` (bukan
  `feature/multi-tenant` -- penamaan branch sengaja menegaskan bahwa yang dibangun duluan
  adalah fondasi platform, bukan fitur multi-tenant untuk RT/RW).
- [x] **T0.3** -- Setup Supabase project baru khusus untuk pengembangan fondasi platform
  (jangan langsung ubah project production existing PortalWarga single-tenant).
- [x] **T0.4** -- Dokumentasikan hasil audit T0.1 sebagai catatan tambahan (mis.
  `docs/audit-notes.md`) -- mencatat perbedaan nyata antara skema lama vs rancangan di
  `specification.md`, agar task berikutnya disesuaikan bila ada perbedaan.

**Definition of Done Phase 0:** Branch siap, Supabase dev project aktif, catatan audit ada.

---

## Phase 1 -- Fondasi Data: Tenant & Subscription (Spec §0, §2, §6)

Phase ini murni membangun "pabrik" -- tidak ada satu pun fitur RT/RW/kos/arisan/kelas yang
disentuh di sini. Tujuannya: tenant bisa dibuat, subscription bisa dilacak, isolasi data
bisa dibuktikan bekerja -- semua dengan data dummy/kosong.

- [x] **T1.1** -- Buat migration SQL: tabel `tenants`, enum `tenant_type`. (Spec §2)
- [x] **T1.2** -- Buat migration SQL: `block_pricing`, `subscription_periods`,
  `tenant_subscriptions`, `tenant_subscription_blocks`, `subscription_payments`, enum
  `subscription_status`. (Spec §2)
- [x] **T1.3** -- Buat migration SQL: `platform_admins` dan fungsi `is_platform_admin()`.
  (Spec §7.1) -- ini fondasi akses Platform Owner Dashboard, harus ada sebelum dashboard-nya
  dibangun di Phase 3.
- [x] **T1.4** -- Buat migration SQL kerangka tabel operasional generik: `tenant_units`,
  `tenant_members` (skema penuh mengikuti Spec §3, tapi *tanpa* data/fitur billing dulu --
  billing menyusul di Phase 5). Sesuaikan dengan nama kolom asli dari hasil audit T0.1.
- [x] **T1.5** -- Buat helper functions: `current_tenant_ids()`, `is_tenant_admin()`,
  `tenant_subscription_status()`. (Spec §6)
- [x] **T1.6** -- Buat trigger `handle_new_tenant()` -- otomatis membuat baris
  `tenant_subscriptions` (status `trial`, `trial_ends_at = now() + interval '15 days'`)
  setiap kali baris baru masuk ke `tenants`. (Req FR-4)
- [x] **T1.7** -- Terapkan RLS dasar pada `tenants`, `tenant_members`, `tenant_units`,
  `tenant_subscriptions`, `tenant_subscription_blocks`, `subscription_payments`:
  - SELECT/INSERT/UPDATE tenant data hanya untuk anggota tenant terkait
  - SELECT lintas-tenant penuh hanya untuk `is_platform_admin()`
  - `block_pricing`/`subscription_periods`: SELECT publik (untuk ditampilkan di halaman
    pricing), tapi INSERT/UPDATE/DELETE hanya untuk `is_platform_admin()`
- [x] **T1.8** -- Seed data awal `block_pricing` (angka sementara/dummy, dapat diubah
  Platform Owner nanti via dashboard di Phase 3) dan `subscription_periods` (3, 6, 12 bulan).
- [x] **T1.9** -- Tulis test SQL/pgTAP (atau minimal manual test script) yang memverifikasi
  isolasi tenant: user tenant A tidak bisa `SELECT`/`INSERT` ke data tenant B, dan user
  biasa tidak bisa mengakses data lintas tenant yang seharusnya hanya untuk
  `is_platform_admin()`.

**Definition of Done Phase 1:** Semua migration jalan tanpa error di Supabase dev project;
tenant dummy bisa dibuat manual via SQL/Supabase Studio; trigger `handle_new_tenant()`
terbukti otomatis membuat baris `tenant_subscriptions` berstatus `trial`; test isolasi
tenant (T1.9) lulus.

---

## Phase 2 -- Autentikasi, Tenant Context & Onboarding Dasar (Req FR-0.3, FR-0.4, FR-1--FR-4; Spec §7, §7.2)

Masih bagian fondasi: alur signup sampai tenant baru berdiri (trial aktif), tanpa fitur
operasional apapun di dalamnya.

- [x] **T2.1** -- Perluas `AuthContext.jsx` dan buat `TenantContext.jsx` baru (Spec §7)
  yang menyimpan `activeTenantId`, tipe tenant aktif, dan status subscription-nya.
- [x] **T2.2** -- Handle kasus user dengan >1 tenant (mis. satu orang jadi admin di
  beberapa tenant, lihat FR-0.3) -- tentukan default tenant aktif saat login, dengan opsi
  berpindah lewat `MyTenants.jsx` (dibangun di T2.6) dan `TenantSwitcher.jsx`.
- [x] **T2.3** -- Buat halaman `ChooseTenantType.jsx` -- pilihan 4 tipe tenant dengan
  penjelasan singkat tiap opsi.
- [x] **T2.4** -- Implementasi signup flow: setelah OAuth Google sukses & pilih tipe
  tenant, panggil RPC/insert untuk membuat baris `tenants` baru + `tenant_members` (role
  admin, status approved untuk diri sendiri). Trigger `handle_new_tenant()` (T1.6) akan
  otomatis mengaktifkan trial.
- [x] **T2.5** -- Buat `tenantTemplates.js` (Spec §7) dan hook `useTenantTemplate()` untuk
  mengganti istilah UI (Rumah/Kamar/Slot, IPL/Sewa/Kontribusi/Iuran, dst) secara dinamis --
  disiapkan di sini walau baru benar-benar dipakai luas mulai Phase 5.
- [x] **T2.6** -- Buat halaman `MyTenants.jsx` (Spec §7.2, FR-0.3) -- daftar tenant milik
  user login, dengan opsi pindah tenant aktif dan tombol menuju `AddNewTenant.jsx`.
- [x] **T2.7** -- Buat halaman `AddNewTenant.jsx` (Spec §7.2) -- entry point membuat tenant
  baru tanpa logout, memicu ulang T2.3--T2.4.
- [x] **T2.8** -- Setelah tenant dipilih di `MyTenants.jsx`, arahkan ke placeholder route
  `/t/:tenantId/dashboard` (isi sebenarnya baru dibangun mulai Phase 5 -- untuk saat ini
  cukup halaman kosong yang menampilkan nama tenant, tipe, dan status subscription, sebagai
  bukti bahwa context sudah mengalir dengan benar).

**Definition of Done Phase 2:** User baru bisa signup, memilih tipe tenant, tenant baru
otomatis berstatus `trial`, muncul di `MyTenants.jsx`, dan bisa dipilih untuk masuk ke
placeholder dashboard operasionalnya. User dengan >1 tenant bisa berpindah antar tenant.

---

## Phase 3 -- Platform Owner Dashboard (Req FR-0.1, FR-0.2; Spec §7.1)

Dashboard internal untuk kamu sendiri sebagai Platform Owner. Dibangun sebelum modul
vertikal apapun karena kamu butuh alat ini untuk mengawasi tenant-tenant percobaan yang
mulai bermunculan dari Phase 2.

- [x] **T3.1** -- Buat halaman `PlatformTenantList.jsx` -- list semua tenant (tipe, status
  subscription, tanggal daftar), dengan filter dan pencarian. Akses dibatasi
  `is_platform_admin()`.
- [x] **T3.2** -- Buat halaman `PlatformPricingConfig.jsx` -- CRUD `block_pricing` dan
  `subscription_periods`, menggantikan seed manual dari T1.8.
- [x] **T3.3** -- Buat halaman `PlatformRevenue.jsx` -- MRR total dan breakdown per tipe
  tenant serta per status (trial/active/read_only). Karena belum ada transaksi subscription
  sungguhan sampai Phase 4 selesai, halaman ini boleh dibangun dengan data kosong/nol dulu,
  lalu divalidasi ulang setelah Phase 4.
- [x] **T3.4** -- Tambahkan routing `/platform/*` terpisah dari `/account/*` dan
  `/t/:tenantId/*`, dengan guard frontend + RLS ganda (RLS sebagai penegak utama).

**Definition of Done Phase 3:** Platform Owner bisa login dan melihat seluruh tenant yang
sudah dibuat di Phase 2, bisa mengubah harga blok & periode, dan halaman revenue tampil
(meski datanya nol untuk sementara).

---

## Phase 4 -- Subscription & Billing Platform (Req FR-7--FR-14; Spec §2, §7.2, §8, §9)

Melengkapi fondasi: tenant sekarang bisa benar-benar subscribe dan bayar, trial bisa
berakhir jadi `read_only`, dan renewal bisa dilakukan. Setelah phase ini selesai, seluruh
mesin platform (tanpa fitur RT/RW/kos/arisan/kelas apapun) sudah berfungsi penuh.

- [x] **T4.1** -- Implementasi util `calculateOptimalBlocks(estimasiUnit, tenantType)`
  sesuai Spec §8, lengkap dengan unit test (kasus: kelipatan pas 10, sisa < 5, sisa antara
  5--9, angka sangat kecil seperti 3).
- [x] **T4.2** -- Buat halaman `ChoosePlan.jsx` -- tampilkan rekomendasi kombinasi blok
  dari T4.1, izinkan user override manual jumlah blok besar/kecil, pilih durasi periode
  (3/6/12 bulan), tampilkan total harga.
- [x] **T4.3** -- Implementasi banner trial countdown di placeholder dashboard tenant
  (dari T2.8) -- tampil selama status `trial`, menghitung mundur dari `trial_ends_at`.
- [x] **T4.4** -- Buat Edge Function `create-subscription-payment` -- generate QRIS Mayar
  untuk pembayaran subscription sesuai kombinasi blok+periode yang dipilih. (Spec §9)
- [x] **T4.5** -- Buat Edge Function `verify-subscription-payment` -- webhook handler
  Mayar, update `subscription_payments.status`, lalu update `tenant_subscriptions` (status
  -> `active`, set `current_period_start`/`current_period_end` sesuai `period_id`).
- [x] **T4.6** -- Buat scheduled job (Supabase cron/Edge Function) yang mengecek
  `tenant_subscriptions` setiap hari:
  - Jika `trial` dan `trial_ends_at` terlewati tanpa subscription baru -> set `read_only`
  - Jika `active` dan `current_period_end` terlewati tanpa renewal -> set `read_only`
- [x] **T4.7** -- Buat halaman `SubscriptionStatus.jsx` (Spec §7.2) -- status berjalan,
  kapasitas terpakai vs dibeli, riwayat pembayaran subscription, dan form renewal (bebas
  pilih ulang blok & periode sesuai FR-11).
- [x] **T4.8** -- Kembali ke `PlatformRevenue.jsx` (T3.3) -- validasi ulang dengan data
  transaksi sungguhan dari langkah T4.4--T4.5.

**Definition of Done Phase 4 (= Fondasi Platform Selesai):** Tenant baru otomatis trial 15
hari; setelah trial habis tanpa bayar, status otomatis `read_only`; tenant dapat
subscribe/renew kapan saja via QRIS dan status kembali `active` otomatis setelah
pembayaran terverifikasi; Platform Owner bisa melihat MRR riil dari transaksi ini. **Ini
adalah milestone utama -- setelah lulus, "pabrik" dianggap berdiri dan siap dipasangi
modul vertikal.**

---

## Phase 5 -- Perilaku Read-Only Lintas Platform (Req FR-15)

Sengaja dikerjakan sebelum ada modul vertikal apapun, supaya pola disable/read-only sudah
jadi kebiasaan/pola yang matang saat modul vertikal dibangun di phase-phase berikutnya
(lebih gampang mewajibkan pola dari awal daripada menambal belakangan di banyak halaman).

- [x] **T5.1** -- Buat komponen/hook generik (mis. `useSubscriptionGate()`) yang
  mengembalikan boolean "aksi transaksi diizinkan" berdasarkan
  `tenant.subscriptionStatus`. Semua modul vertikal nanti wajib memakai hook ini untuk
  tombol aksi transaksi mereka -- didefinisikan sekali di sini, dipakai berulang.
- [x] **T5.2** -- Definisikan pola UI standar: tombol disabled + tooltip untuk
  Admin/Pengurus/Bendahara saat `read_only`, dan pola pesan generik untuk Anggota ("...
  Silakan hubungi pengurus.") yang bisa dipakai lintas vertikal tanpa istilah teknis
  "subscription"/"platform" bocor ke tampilan anggota.
- [x] **T5.3** -- Pastikan RLS (Phase 1, T1.7, dan RLS billing yang akan ditambah di Phase
  6) menjadi lapisan penegakan utama -- siapkan test template yang bisa dipakai ulang tiap
  kali tabel operasional baru ditambahkan di phase vertikal, untuk memverifikasi
  INSERT/UPDATE tetap ditolak database saat `read_only`, bukan hanya disembunyikan di
  frontend.

**Definition of Done Phase 5:** Hook dan pola UI siap dipakai; ada minimal 1 tabel dummy
percobaan (boleh tabel sisa dari Phase 1) yang membuktikan pola disable + RLS bekerja
sebelum dipakai di modul vertikal sungguhan.

---

## Phase 6 -- Template Vertikal Pertama: RT/RW (Req FR-16; Spec §3, §4)

Modul vertikal pertama yang dipasang di atas fondasi -- migrasi fitur PortalWarga existing
ke struktur generik. Ini pembuktian bahwa fondasi Phase 1--5 memang bisa menampung produk
sungguhan, bukan hanya tenant kosong.

- [x] **T6.1** -- Lengkapi migration SQL `billing_items`, `payments`, `expenses` (Spec §3)
  yang sempat ditunda dari Phase 1 -- generik dari awal, langsung dipasangi RLS mengikuti
  pola Phase 1/5 (SELECT selalu terbuka utk anggota tenant, tulis diblok saat `read_only`).
- [x] **T6.2** -- Buat `SetupWizard.jsx` khusus varian `rt_rw` (nama komplek, jumlah unit,
  komponen IPL) dan sambungkan ke alur onboarding dari Phase 2. *(Dipindah ke awal karena
  T6.4 membutuhkan komponen IPL yang didefinisikan di wizard ini.)*
- [x] **T6.3** -- Implementasi generate link/kode undangan unik per tenant dan halaman
  approval anggota (reuse pola invite code existing bila ada, sesuaikan tenant-aware).
  *(Dipindah ke awal karena warga/anggota harus ada sebelum tagihan dan matriks pembayaran
  bermakna.)*
- [x] **T6.4** -- Generate tagihan IPL berkala (bulanan) berdasarkan komponen IPL yang
  diinput saat `SetupWizard.jsx` (T6.2) -- reuse logic existing PortalWarga.
- [ ] **T6.5** -- Adaptasi komponen tagihan existing PortalWarga (`ipl_bills`/matriks
  pembayaran) agar membaca dari `billing_items` generik dan tampil sesuai istilah tenant
  (`billLabel`) dari `tenantTemplates.js` (T2.5).
- [ ] **T6.6** -- Adaptasi alur verifikasi pembayaran (upload bukti transfer, approval
  bendahara/admin) agar generik terhadap `billing_items`, dan memakai `useSubscriptionGate()`
  dari T5.1 untuk disable saat `read_only`.
- [ ] **T6.7** -- Adaptasi halaman Laporan Keuangan & Pengeluaran (`expenses`) agar
  tenant-aware (filter otomatis berdasarkan `tenant_id` dari context, bukan hardcoded).
- [ ] **T6.8** -- Isi `/t/:tenantId/dashboard` (placeholder dari T2.8) dengan dashboard
  operasional RT/RW sungguhan.

**Definition of Done Phase 6:** Tenant tipe `rt_rw` end-to-end: signup -> setup wizard ->
undang warga -> approve warga -> generate tagihan IPL -> warga bayar QRIS -> verifikasi ->
muncul di laporan keuangan. Feature parity dengan PortalWarga existing tercapai, kini
berjalan di atas fondasi multi-tenant.

---

## Phase 7 -- Template Vertikal: Kos-kosan (Req FR-17)

- [ ] **T7.1** -- Buat `SetupWizard.jsx` varian `kos` (nama kos, jumlah kamar, harga sewa
  default, siklus tagih).
- [ ] **T7.2** -- Tambah field kontrak (`contract_start`, `contract_end`) pada form
  pembuatan tagihan/unit di `billing_items` (kolom sudah disiapkan di Spec §3).
- [ ] **T7.3** -- Implementasi job/scheduled function yang auto-generate tagihan sewa
  bulanan selama kontrak aktif.
- [ ] **T7.4** -- Implementasi alur "checkout" -- set `tenant_units.status = 'vacant'`,
  hentikan auto-generate tagihan untuk unit tsb.
- [ ] **T7.5** -- Sesuaikan `tenantTemplates.js` & UI Members/PaymentMatrix agar istilah
  otomatis berubah jadi Kamar/Penyewa/Sewa untuk tenant tipe `kos`.
- [ ] **T7.6** -- *(Keputusan terbuka, lihat "Catatan untuk Agent Coding")* Tentukan &
  implementasikan apakah satu pemilik dengan multi-properti kos memakai 1 tenant dengan
  pengelompokan properti, atau beberapa tenant terpisah.

**Definition of Done Phase 7:** Tenant tipe `kos` end-to-end: signup -> setup wizard ->
input kamar & kontrak sewa -> auto-generate tagihan bulanan -> penyewa bayar -> checkout
saat kontrak selesai.

---

## Phase 8 -- Template Vertikal: Arisan (Req FR-18; Spec §5)

- [ ] **T8.1** -- Buat `SetupWizard.jsx` varian `arisan` (nama grup, jumlah peserta,
  nominal kontribusi, frekuensi kocok).
- [ ] **T8.2** -- Buat migration SQL: `arisan_rounds`, `arisan_participants` (Spec §5),
  dengan RLS mengikuti pola `useSubscriptionGate()` untuk aksi kocok.
- [ ] **T8.3** -- Buat halaman `ArisanRounds.jsx` -- list periode/putaran, status
  (collecting/ready_to_draw/drawn).
- [ ] **T8.4** -- Implementasi pengumpulan kontribusi arisan menggunakan `billing_items`
  (period sama untuk semua anggota, bukan per-unit).
- [ ] **T8.5** -- Implementasi fungsi/Edge Function pengocokan sesuai algoritma di Spec §5:
  validasi seluruh peserta lunas -> filter kandidat `has_won = false` -> pilih acak ->
  catat pemenang.
- [ ] **T8.6** -- Buat halaman `ArisanDraw.jsx` -- tombol "Jalankan Kocok" (disabled saat
  `read_only` via `useSubscriptionGate()`), tampilan hasil kocok, riwayat transparan untuk
  semua anggota.
- [ ] **T8.7** -- Implementasi aksi "Mulai Siklus Baru" -- reset `has_won` seluruh peserta
  setelah satu putaran penuh selesai.
- [ ] **T8.8** -- Tulis test untuk memastikan pemenang tidak pernah terpilih dua kali dalam
  satu siklus (unit test terhadap fungsi pemilihan acak, bukan hanya manual test).

**Definition of Done Phase 8:** Tenant tipe `arisan` dapat mengumpulkan kontribusi,
menjalankan kocok, melihat riwayat pemenang, dan memulai siklus baru setelah semua
anggota mendapat giliran.

---

## Phase 9 -- Template Vertikal: Kelas (Req FR-19)

- [ ] **T9.1** -- Buat `SetupWizard.jsx` varian `kelas` (nama kelas, jumlah siswa, nominal
  iuran).
- [ ] **T9.2** -- Reuse pola generik dari Phase 6 (RT/RW) untuk billing berkala -- kelas
  tidak butuh mekanisme kocok, jadi sebagian besar adalah konfigurasi ulang istilah, bukan
  fitur baru.
- [ ] **T9.3** -- Sesuaikan `tenantTemplates.js` & UI agar istilah otomatis berubah jadi
  Siswa/Iuran untuk tenant tipe `kelas`.

**Definition of Done Phase 9:** Tenant tipe `kelas` end-to-end: signup -> setup wizard ->
input siswa -> generate iuran berkala -> pembayaran -> laporan.

---

## Phase 10 -- Modul Listing Publik / Iklan (Req FR-22--FR-30; Spec §5.1, §6.1, §7.3)

Dibangun setelah seluruh template vertikal selesai (Phase 6 RT/RW, Phase 7 Kos, Phase 8
Arisan, Phase 9 Kelas), karena: (1) bergantung pada data yang dihasilkan tenant `rt_rw`
(keanggotaan warga terverifikasi) dan `kos` (status kamar kosong dari `tenant_units`), dan
(2) memastikan pola generik `billing_items`/`tenant_units`/`tenantTemplates.js` sudah
teruji di seluruh 4 vertikal sebelum membangun modul add-on lintas tenant ini. Modul ini
adalah pengecualian sengaja terhadap prinsip isolasi tenant yang ditegakkan sejak Phase 1
-- datanya memang ditujukan publik.

- [ ] **T10.1** -- Buat migration SQL: enum `listing_type`, `listing_status`, tabel
  `public_listings`, `listing_pricing`, `listing_payments`. (Spec §5.1)
- [ ] **T10.2** -- Terapkan RLS khusus sesuai Spec §6.1 -- SELECT publik untuk siapa saja
  (termasuk anonymous) pada listing berstatus `active`, INSERT dibatasi anggota tenant
  yang tidak `read_only`, UPDATE dibatasi ke pemilik listing. Tulis test yang memverifikasi
  SELECT memang bisa diakses tanpa autentikasi (berbeda dari seluruh test isolasi tenant
  sebelumnya).
- [ ] **T10.3** -- Seed data awal `listing_pricing` (harga listing biasa vs featured per
  jenis, angka sementara/dummy -- lihat catatan angka final di akhir dokumen).
- [ ] **T10.4** -- Buat halaman `PostListing.jsx` di dalam dashboard tenant (`/t/:tenantId/*`):
  - Untuk tipe `kos`: prefill dari `tenant_units` yang berstatus `vacant`
  - Untuk tipe `rt_rw`: form kosong diisi manual oleh warga
  - Tampilkan harga dari `listing_pricing` sebelum lanjut ke pembayaran
- [ ] **T10.5** -- Buat halaman `MyListings.jsx` -- kelola listing milik tenant/anggota ybs,
  tombol perpanjang, tombol tandai `rented_or_sold`.
- [ ] **T10.6** -- Buat Edge Function pembayaran listing (reuse pola
  `create-subscription-payment`/`verify-subscription-payment` dari Phase 4, target tabel
  `listing_payments`, update `public_listings.status`/`is_featured` setelah bayar sukses).
- [ ] **T10.7** -- Buat scheduled job harian yang menandai `public_listings` berstatus
  `expired` saat `expires_at` terlewati (pola sama seperti T4.6).
- [ ] **T10.8** -- Buat 4 halaman publik TANPA tenant context (routing `/listing/*`,
  Spec §7.3): `RoomListingDirectory.jsx`, `RoomListingDetail.jsx`,
  `UmkmListingDirectory.jsx`, `UmkmListingDetail.jsx`. Pastikan halaman-halaman ini bisa
  diakses tanpa login sama sekali (uji dalam mode incognito/tanpa sesi).
- [ ] **T10.9** -- Implementasi tampilan prioritas untuk listing `is_featured = true` pada
  kedua halaman direktori (tampil di posisi awal atau dengan penanda visual berbeda).
- [ ] **T10.10** -- Terapkan `useSubscriptionGate()` (dari T5.1) pada `PostListing.jsx` --
  tenant berstatus `read_only` tidak dapat membuat listing baru, sesuai FR-26.

**Definition of Done Phase 10:** Pemilik kos bisa mengiklankan kamar kosong dan warga RT
bisa mengiklankan UMKM-nya, keduanya melalui alur bayar terpisah dari subscription utama;
halaman `/listing/kos` dan `/listing/umkm` bisa diakses publik tanpa login dan menampilkan
listing dari lintas tenant; listing otomatis kedaluwarsa sesuai masa aktifnya.

---

## Phase 11 -- QA, Migrasi, & Rilis

- [ ] **T11.1** -- Regression test seluruh 4 vertikal (rt_rw, kos, arisan, kelas) dari
  signup sampai transaksi pertama berhasil.
- [ ] **T11.2** -- Regression test fondasi platform (Phase 1--5): trial expiry, read_only,
  renewal, isolasi tenant, akses Platform Owner Dashboard.
- [ ] **T11.3** -- Regression test Modul Listing (Phase 10): posting listing kos & umkm,
  halaman publik dapat diakses tanpa login, listing lintas tenant tampil dengan benar,
  listing expired otomatis tersembunyi dari direktori publik.
- [ ] **T11.4** -- Siapkan script migrasi opsional untuk instance PortalWarga single-tenant
  existing (bila ada pelanggan lama) ke struktur multi-tenant baru -- pemetaan data lama
  ke `tenants`/`tenant_units`/`tenant_members`/`billing_items`.
- [ ] **T11.5** -- Review keamanan RLS menyeluruh (checklist: setiap tabel punya RLS aktif
  dan sesuai maksudnya -- termasuk memverifikasi ulang bahwa `public_listings` memang
  SENGAJA terbuka publik dan bukan tabel lain yang ke-skip secara tidak sengaja).
- [ ] **T11.6** -- Deploy ke Supabase production project & Vercel, smoke test di production.

**Definition of Done Phase 11:** Aplikasi multi-tenant live, minimal 1 tenant per vertikal
berhasil dibuat & dites end-to-end di production, Modul Listing berfungsi dan dapat diakses
publik, tidak ada regresi fitur existing.

---

## Catatan untuk Agent Coding

- Task ini disusun berdasarkan hasil diskusi produk (lihat `requirement.md`) dan
  rancangan awal (`specification.md`). Bila ditemukan ketidaksesuaian antara rancangan dan
  kode aktual di repo (nama kolom, struktur folder, pola existing), **ikuti kode aktual**
  dan catat penyesuaian di `docs/audit-notes.md` (lihat T0.4) -- jangan diam-diam menyimpang
  tanpa dicatat.
- **Jangan lompat ke Phase 6 (RT/RW) atau phase vertikal lain sebelum Phase 1--5 (fondasi
  platform) benar-benar lulus Definition of Done masing-masing.** Ini bukan sekadar
  urutan pengerjaan yang disarankan, tapi prasyarat teknis: RLS dan context tenant dari
  fondasi menjadi dasar keamanan semua modul vertikal.
- **Jangan mulai Phase 10 (Modul Listing) sebelum Phase 6 (RT/RW), Phase 7 (Kos),
  Phase 8 (Arisan), dan Phase 9 (Kelas) selesai** -- modul ini bergantung langsung pada
  data yang dihasilkan tenant `rt_rw` dan `kos`, serta memvalidasi bahwa pola generik
  sudah teruji di seluruh 4 vertikal.
- Poin yang masih terbuka/belum diputuskan eksplisit oleh product owner (tandai sebagai
  asumsi dan konfirmasi sebelum lanjut bila ragu):
  - Perilaku user yang menjadi admin di lebih dari satu tenant (T2.2)
  - Apakah satu pemilik kos dengan multi-properti memakai 1 tenant atau beberapa tenant
    terpisah (T7.6, disinggung di requirement FR-17, keputusan detail belum final)
  - Angka nominal pasti untuk `block_pricing` dan `discount_percent` tiap periode (masih
    ilustratif di specification.md §8, perlu angka final dari Platform Owner sebelum T1.8)
  - Angka nominal pasti untuk `listing_pricing` (harga listing biasa vs featured, masih
    ilustratif di specification.md §5.1, perlu angka final dari Platform Owner sebelum T10.3)
  - Moderasi konten listing (deteksi spam/konten terlarang) belum masuk cakupan fase awal
    -- lihat `requirement.md` §6 (Out of Scope); untuk sementara moderasi dilakukan manual
    oleh Platform Owner melalui akses langsung ke database/`PlatformTenantList.jsx`
