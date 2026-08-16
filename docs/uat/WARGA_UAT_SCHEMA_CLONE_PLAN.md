# Warga UAT Schema Clone Plan

> Target: Supabase staging yang diverifikasi melalui `client/uat.env`  
> Source of truth: `supabase/migrations/`  
> Production data/file/auth export: dilarang  
> Remote apply status: belum dijalankan

## Keputusan sumber schema

- Gunakan 17 migration berurutan dari `202607080001_initial_production_schema.sql` sampai `202608050002_transactional_email_outbox_v2.sql`.
- Jangan gunakan `supabase/schema.sql`; file tersebut menyatakan dirinya legacy/reference only.
- Jangan menjalankan `pg_dump --data`, export CSV, copy storage object, clone `auth.users`, atau menyalin row production.
- Baseline migration hanya membuat schema, RLS, function, trigger, index, konfigurasi non-PII, kategori forum, dan bucket private.
- Setelah migration utama, jalankan `supabase/uat/202608110001_uat_safety_overlay.sql` hanya pada staging. Overlay menandai environment UAT dan menonaktifkan payment-smoke notification sampai SMTP sandbox terbukti.

## Gate sebelum apply

1. Pastikan target host berbeda dari `.env` default dan cocok dengan allowlist staging.
2. Pastikan service-role/legacy JWT staging sudah dirotasi; jangan memakai entry privileged berawalan `VITE_`.
3. Gunakan Supabase CLI yang linked ke staging, PostgreSQL connection staging, atau MCP yang project reference-nya tepat. MCP saat ini tidak memenuhi gate ini.
4. Capture inventory staging kosong tanpa menampilkan key atau body data.
5. Jalankan `npm run preflight:schema:uat` dan review manifest hash.

### Arti rotasi untuk project UAT kosong

1. Pada dashboard project UAT buka **Project Settings → JWT Keys**.
2. Migrasikan legacy JWT secret ke signing-key system, pilih **Rotate keys**, lalu revoke key sebelumnya. Karena project UAT belum memiliki user/data, tidak ada sesi warga yang perlu dipertahankan.
3. Pertahankan publishable key untuk browser. Buat secret API key baru hanya untuk komponen server bila diperlukan; jangan beri prefix `VITE_`.
4. Nilai legacy yang wajib dipertahankan di file lokal sesuai instruksi pemilik boleh tetap tersimpan, tetapi harus sudah revoked dan tidak boleh dimuat oleh aplikasi.
5. Rotasi key tidak memberikan akses DDL. Untuk menerapkan migration tetap diperlukan MCP yang diarahkan ke project UAT, Supabase management token, atau PostgreSQL connection/password staging.

## Urutan apply dan verifikasi

1. Apply 17 migration satu per satu sesuai nama file; berhenti pada error pertama.
2. Apply UAT safety overlay terpisah.
3. Apply `supabase/uat/202608110002_uat_run_contract.sql`. Helper run/inventory/cleanup hanya diberikan ke `service_role`; browser tidak mendapat execute grant.
4. Jalankan `supabase/uat/verify_empty_before_seed.sql`; seluruh tabel bisnis/auth/storage/outbox/`uat_runs` harus bernilai nol.
5. Verifikasi `payment-proofs` private dan Midtrans tetap sandbox.
6. Baru setelah Gate A/B lulus, buat data sintetis memakai `uat_run_id`/`is_demo`.

## Kontrak run dan cleanup

- Format label: `WUAT-YYYYMMDD-<suffix>`; ID database menggunakan UUID.
- Seluruh entitas sintetis memakai pasangan `uat_run_id` + `is_demo=true`; marker tidak dapat diubah setelah insert.
- Trigger email mewariskan marker dari profile/payment/outbox. Komponen dan incident operasional UAT harus memakai prefix `uat:<uat_run_id>:`.
- `inventory_uat_run()` menghitung residu per tabel serta prefix Storage dan Auth identity terkait tanpa mengembalikan row/PII.
- `cleanup_uat_run()` membutuhkan konfirmasi persis `DELETE UAT <uat_run_id>`, hanya berjalan saat marker environment UAT valid, dan menghapus child-to-parent dalam satu transaksi.
- Storage object harus dihapus melalui Storage API, Auth identity melalui Auth Admin API, email sandbox melalui provider sandbox, dan execution n8n melalui n8n sebelum cleanup database. Fungsi akan fail-closed bila Storage/Auth masih tersisa.

## Blocker aktif

- Supabase CLI dan `psql` tidak tersedia di workspace.
- Supabase MCP terhubung ke project default lain, bukan target UAT.
- Direct PostgreSQL dan Session pooler V3 UAT sudah terverifikasi; password V3 berbeda dari credential yang terekspos. Runner dapat resolve 3 alamat pooler dan TCP 5432/6543 terbuka, tetapi CLI timeout/terminated dan seluruh PostgreSQL SSLRequest tidak mendapat respons. Gunakan MCP yang di-scope ke project UAT atau SQL Editor UAT; jangan gunakan MCP saat ini karena menunjuk production.
- Rotasi legacy sudah terverifikasi read-only: nilai legacy lokal ditolak 401 dan modern server secret diterima 200 pada host UAT; nilai key/body tidak dicetak.
- Publishable key UAT valid pada endpoint Auth settings/health (200). Root PostgREST 401 sebelum schema tersedia bukan indikator key invalid.
- Karena itu tidak ada migration remote yang diterapkan pada sesi ini.
