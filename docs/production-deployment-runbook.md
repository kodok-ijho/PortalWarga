# Production Deployment & Smoke Test Runbook — RuangWarga Multi-Tenant SaaS
> Ref: Task T11.6, Phase 11 Definition of Done, requirement.md, specification.md

Runbook ini memberikan panduan langkah demi langkah untuk merilis RuangWarga SaaS Multi-Tenant ke Supabase Production dan Vercel, serta prosedur smoke test komprehensif.

---

## 1. Persiapan & Checklist Lingkungan Produksi

### A. Supabase Production Project
1. **Migration SQL:**
   Jalankan seluruh migration secara berurutan di Supabase Production SQL Editor:
   - `202609130001_create_tenants_table.sql`
   - `202609130002_create_subscription_schema.sql`
   - `202609130003_create_platform_admins.sql`
   - `202609130004_create_generic_operational_schema.sql`
   - `202609130005_create_rls_helpers_and_triggers.sql`
   - `202609130006_create_handle_new_tenant_trigger.sql`
   - `202609130007_comprehensive_rls_policies.sql`
   - `202609130008_seed_pricing_and_periods.sql`
   - `202609140001_check_subscription_expirations.sql`
   - `202609140002_enforce_readonly_rls.sql`
   - `202609140003_create_billing_and_financial_schema.sql`
   - `202609140004_add_tenant_settings.sql`
   - `202609140005_tenant_invite_and_approval_schema.sql`
   - `202609140006_auto_generate_kos_billing.sql`
   - `202609140007_checkout_kos_room.sql`
   - `202609140008_create_arisan_schema.sql`
   - `202609140009_arisan_contribution_functions.sql`
   - `202609140010_draw_arisan_winner.sql`
   - `202609140011_start_new_arisan_cycle.sql`
   - `202609140012_create_public_listings_schema.sql`
   - `202609140013_public_listings_rls.sql`
   - `202609140014_seed_listing_pricing.sql`
   - `202609150001_create_listing_payment_functions.sql`
   - `202609150002_check_listing_expirations.sql`
   - `202609150003_migrate_single_tenant_to_multi_tenant.sql` (opsional jika ada instance lama)

2. **Supabase Edge Functions:**
   Deploy Edge Functions ke Supabase production CLI:
   ```bash
   supabase functions deploy create-subscription-payment --project-ref <prod-project-ref>
   supabase functions deploy verify-subscription-payment --project-ref <prod-project-ref>
   supabase functions deploy check-subscription-expirations --project-ref <prod-project-ref>
   supabase functions deploy create-listing-payment --project-ref <prod-project-ref>
   supabase functions deploy verify-listing-payment --project-ref <prod-project-ref>
   supabase functions deploy check-listing-expirations --project-ref <prod-project-ref>
   ```

3. **Supabase Secrets:**
   Set environment secret untuk payment gateway Mayar dan Cron Job:
   ```bash
   supabase secrets set MAYAR_API_KEY="<production-key>" MAYAR_WEBHOOK_TOKEN="<production-token>" --project-ref <prod-project-ref>
   ```

4. **Platform Admin Awal:**
   Daftarkan user ID super admin pertama ke tabel `public.platform_admins`:
   ```sql
   INSERT INTO public.platform_admins (user_id, role, notes)
   VALUES ('<uuid-super-admin>', 'super_admin', 'Platform Owner Utama');
   ```

### B. Vercel Production Deployment
Set environment variables di dashboard Vercel (**Project Settings > Environment Variables**):
```env
VITE_DEMO_MODE=false
VITE_SUPABASE_URL=https://<prod-project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<production-anon-key>
```

---

## 2. Prosedur Smoke Test Produksi (Phase 11 DoD)

### Skenario 1: Platform Owner & Guard
- Akses `/platform` dengan akun non-admin -> harus dicegat layar **403 Akses Dibatasi**.
- Akses `/platform` dengan akun Platform Admin -> harus terbuka dashboard Platform Owner (`PlatformTenantList`, `PlatformPricingConfig`, `PlatformRevenue`).

### Skenario 2: Vertikal 1 — RT/RW & Perumahan
1. Login dan buat tenant baru bertipe `rt_rw` di `/account/add-tenant`.
2. Selesaikan Setup Wizard di `/t/:tenantId/setup`:
   - Isi profil komplek (RT/RW).
   - Inisiasi rumah/kavling (`bulkCreateTenantUnits`).
   - Tentukan pos iuran IPL dan tanggal jatuh tempo.
3. Masuk ke `/t/:tenantId/dashboard`:
   - Verifikasi terminologi: Unit = "Rumah", Warga = "Warga", Tagihan = "IPL".
   - Generate tagihan IPL bulanan baru (`generateTenantBillingItems`).
   - Catat bukti bayar warga dan verifikasi transfer kas.

### Skenario 3: Vertikal 2 — Kos-kosan & Kontrakan
1. Buat tenant baru bertipe `kos` di `/account/add-tenant`.
2. Buka Setup Wizard kos:
   - Tentukan tarif sewa default bulanan dan tanggal jatuh tempo.
   - Tambah kamar kos dengan nomor pintu dan fasilitas.
3. Tetapkan kontrak sewa kamar (`assignRoomContract`):
   - Kamar berubah menjadi `occupied`.
   - Auto-generate tagihan sewa bulanan berjalan dengan benar.
4. Uji alur checkout kamar (`checkoutKosRoom`) -> kamar kembali menjadi `vacant`.

### Skenario 4: Vertikal 3 — Kelompok Arisan
1. Buat tenant baru bertipe `arisan` di `/account/add-tenant`.
2. Buka Setup Wizard arisan:
   - Masukkan nama kelompok dan nominal kontribusi per putaran.
   - Daftarkan anggota ke slot arisan.
3. Buat putaran baru (`createArisanRound`) dan generate tagihan iuran putaran.
4. Jalankan pengundian pemenang (`ArisanDraw`):
   - Mesin pengundian memilih pemenang secara acak.
   - Pemenang tidak dapat dipilih ganda dalam satu siklus (0% double-winner).

### Skenario 5: Vertikal 4 — Kelas & Bimbingan Belajar
1. Buat tenant baru bertipe `kelas` di `/account/add-tenant`.
2. Buka Setup Wizard kelas:
   - Tentukan nama kursus/mata pelajaran dan tarif SPP per slot siswa.
3. Daftarkan slot siswa dan generate tagihan SPP bulanan (`generateKelasSppBilling`).
4. Verifikasi penerimaan SPP oleh pengelola kelas.

### Skenario 6: Modul Listing Publik
1. Buka dashboard tenant kos atau RT/RW, akses halaman `/t/:tenantId/post-listing`.
2. Posting iklan kamar kos atau UMKM warga, selesaikan simulasi invoice QRIS pembayaran iklan.
3. Buka jendela peramban penyamaran (Incognito / tanpa login sama sekali):
   - Akses `/listing/kos` -> direktori kamar kos aktif tampil dengan listing featured di posisi prioritas teratas.
   - Akses `/listing/umkm` -> direktori UMKM warga tampil dan dapat difilter per kategori.
   - Klik salah satu listing -> rincian lengkap beserta tombol WhatsApp terbuka normal.

---

## 3. Kriteria Definition of Done (DoD) Phase 11
- [x] T11.1: Regression test seluruh 4 vertikal (42 tests pass).
- [x] T11.2: Regression test fondasi platform (22 tests pass).
- [x] T11.3: Regression test Modul Listing publik (22 tests pass).
- [x] T11.4: Script migrasi PortalWarga single-tenant ke multi-tenant RuangWarga (`202609150003_migrate_single_tenant_to_multi_tenant.sql` & `docs/migration-guide.md`).
- [x] T11.5: Review keamanan RLS menyeluruh 17 tabel publik (`docs/rls-security-review.md`).
- [ ] T11.6: Eksekusi deploy produksi & smoke test live (menunggu konfirmasi otorisasi Platform Owner).
