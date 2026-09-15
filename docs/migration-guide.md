# Panduan Migrasi: PortalWarga (Single-Tenant) ke RuangWarga (Multi-Tenant SaaS)
> Ref: Task T11.4, requirement.md FR-0, specification.md §2, §3, §4, §10, docs/audit-notes.md

Dokumen ini berisi panduan resmi bagi Platform Owner / Administrator database untuk memigrasikan instance database **PortalWarga Palm Village** (single-tenant v1.4.3) ke arsitektur **RuangWarga SaaS Multi-Tenant**.

---

## 1. Ringkasan Perubahan & Pemetaan Data

| Entitas Lama (PortalWarga) | Entitas Baru (RuangWarga Multi-Tenant) | Logika Transformasi & Pemetaan |
|---|---|---|
| Kompleks Perumahan (Hardcoded) | `public.tenants` | Dibuat baris baru bertipe `rt_rw`, dilengkapi konfigurasi `settings` (JSONB). |
| Langganan (Tidak ada) | `public.tenant_subscriptions` | Status otomatis diaktifkan (`status = 'active'`) dengan masa berlaku 1 tahun. |
| `public.units` (Bigint PK) | `public.tenant_units` (UUID PK) | Kolom `block` dan `unit_number` digabung ke format label (contoh: `A/12`). Detail lain (`floor`, `size`, `notes`) disimpan di `metadata` JSONB. |
| `public.profiles` (User + Role) | `public.tenant_members` (Relasi Member) | `profiles.id` dipetakan ke `user_id`. Role `warga` dipetakan menjadi `anggota`. Status `approved`/`rejected` diselaraskan. |
| `public.ipl_components` & `ipl_settings` | `tenants.settings->ipl_components` | Daftar komponen iuran (`Keamanan`, `Kebersihan`, dll.) diagregasi ke array JSONB pada setting tenant. |
| `public.ipl_bills` | `public.billing_items` | Tagihan IPL dimasukkan dengan `unit_id` & `member_id` baru, kategori `ipl`, status `unpaid`/`paid`/`cancelled`. |
| `public.payments` | `public.payments` | Kolom `tenant_id` diisi, dan relasi `billing_item_id` dihubungkan ke `billing_items.id`. |
| `public.expenses` | `public.expenses` | Kolom `tenant_id` diisi dengan ID tenant perumahan ybs. |

---

## 2. Prasyarat Sebelum Eksekusi

1. **Backup Database:** Buat full dump/snapshot database sebelum menjalankan migrasi:
   ```bash
   pg_dump -h <db-host> -U postgres -d postgres -F c -b -v -f backup_pre_migration.dump
   ```
2. **Akses Superuser / Service Role:** Migrasi membutuhkan wewenang eksekusi `SECURITY DEFINER` untuk membaca dan memperbarui data lintas tabel.
3. **Pastikan Migrasi Fondasi Sudah Di-apply:** Seluruh migration `202609130001` sampai `202609150002` telah dijalankan di database target.

---

## 3. Cara Menjalankan Migrasi

### Opsi A: Menggunakan Stored Procedure (Direkomendasikan)
File migration `supabase/migrations/202609150003_migrate_single_tenant_to_multi_tenant.sql` menyediakan fungsi `public.migrate_legacy_portal_warga()`.

Jalankan query berikut di Supabase SQL Editor:

```sql
-- Parameter: (nama_tenant, email_owner_opsional, status_langganan_default)
SELECT public.migrate_legacy_portal_warga(
  'Palm Village RT 05',
  'ketua.rt@palmvillage.id',
  'active'
);
```

**Contoh Output Berhasil:**
```json
{
  "success": true,
  "tenant_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "tenant_name": "Palm Village RT 05",
  "owner_id": "99887766-5544-3322-1100-aabbccddeeff",
  "has_legacy_tables": true,
  "units_migrated": 84,
  "members_migrated": 112,
  "bills_migrated": 450,
  "payments_linked": 420,
  "expenses_linked": 35,
  "migrated_at": "2026-09-15T08:30:00.000Z"
}
```

Jika database target adalah instalasi baru yang tidak memiliki tabel legacy (`units`/`profiles`), fungsi akan mengembalikan respon informatif tanpa error:
```json
{
  "success": false,
  "has_legacy_tables": false,
  "message": "Tabel legacy (units / profiles) tidak ditemukan pada schema aktif. Tidak ada data yang perlu dimigrasikan."
}
```

---

## 4. Verifikasi Pasca Migrasi

Lakukan pengecekan integritas data dengan query berikut:

1. **Verifikasi Tenant & Langganan:**
   ```sql
   SELECT t.id, t.name, t.type, s.status AS subscription_status, s.current_period_end
   FROM public.tenants t
   LEFT JOIN public.tenant_subscriptions s ON s.tenant_id = t.id
   WHERE t.name = 'Palm Village RT 05';
   ```

2. **Verifikasi Unit dan Anggota:**
   ```sql
   SELECT 
     (SELECT count(*) FROM public.tenant_units WHERE tenant_id = t.id) AS total_units,
     (SELECT count(*) FROM public.tenant_members WHERE tenant_id = t.id) AS total_members
   FROM public.tenants t
   WHERE t.name = 'Palm Village RT 05';
   ```

3. **Verifikasi Tagihan dan Pembayaran:**
   ```sql
   SELECT 
     (SELECT count(*) FROM public.billing_items WHERE tenant_id = t.id) AS total_bills,
     (SELECT count(*) FROM public.payments WHERE tenant_id = t.id) AS total_payments,
     (SELECT count(*) FROM public.expenses WHERE tenant_id = t.id) AS total_expenses
   FROM public.tenants t
   WHERE t.name = 'Palm Village RT 05';
   ```

4. **Verifikasi Akses Frontend:**
   - Login menggunakan akun Admin RT yang dimigrasi.
   - Buka `/account/tenants` ➔ tenant "Palm Village RT 05" harus muncul.
   - Masuk ke `/t/<tenant_id>/dashboard` ➔ metrik unit, warga, dan keuangan harus sesuai dengan data sebelumnya.

---

## 5. Rollback

Jika migrasi perlu dibatalkan sebelum cut-off produksi:

```sql
-- 1. Hapus data yang dimigrasikan untuk tenant terkait
DELETE FROM public.tenants WHERE name = 'Palm Village RT 05';
-- (Seluruh baris terkait di tenant_units, tenant_members, billing_items akan terhapus via CASCADE / ON DELETE CASCADE).

-- 2. Lepaskan fungsi migrasi jika sudah tidak diperlukan
DROP FUNCTION IF EXISTS public.migrate_legacy_portal_warga(text, text, text);
```
