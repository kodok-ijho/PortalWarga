---
name: supabase-migration
description: >-
  Panduan membuat migration SQL untuk Supabase, termasuk penamaan file,
  checklist RLS, template test isolasi tenant, dan pola rollback.
  Aktifkan skill ini setiap kali mengerjakan task yang melibatkan perubahan database schema.
---

# Supabase Migration Skill

## Penamaan File Migration

Format: `supabase/migrations/YYYYMMDDNNNN_nama_deskriptif.sql`

```
supabase/migrations/202609120001_add_tenant_invites.sql
supabase/migrations/202609120002_add_listing_suspended_status.sql
```

- `YYYYMMDD` = tanggal pembuatan
- `NNNN` = nomor urut hari itu (0001, 0002, ...)
- Nama file = snake_case, deskriptif, bahasa Inggris

## Template Migration SQL

```sql
-- Migration: <deskripsi singkat>
-- Task: T<X.Y>
-- Date: <YYYY-MM-DD>

BEGIN;

-- ============================================================
-- 1. SCHEMA CHANGES
-- ============================================================

-- <DDL statements di sini>

-- ============================================================
-- 2. RLS POLICIES
-- ============================================================

-- Selalu ikuti pola ini:
-- SELECT: anggota tenant bisa baca data tenant-nya
-- INSERT/UPDATE/DELETE: hanya saat subscription BUKAN read_only

-- SELECT policy
CREATE POLICY "<table>_select_member" ON <table>
  FOR SELECT USING (
    tenant_id IN (SELECT current_tenant_ids())
  );

-- INSERT policy (dengan subscription gate)
CREATE POLICY "<table>_insert_active" ON <table>
  FOR INSERT WITH CHECK (
    tenant_id IN (SELECT current_tenant_ids())
    AND NOT tenant_subscription_status(tenant_id)
  );

-- ============================================================
-- 3. GRANTS
-- ============================================================

-- Pastikan RLS aktif
ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;

COMMIT;
```

## Checklist Sebelum Commit Migration

- [ ] File ada di `supabase/migrations/` dengan format nama benar
- [ ] Dibungkus `BEGIN; ... COMMIT;`
- [ ] `ENABLE ROW LEVEL SECURITY` untuk setiap tabel baru
- [ ] SELECT policy: filter by `current_tenant_ids()`
- [ ] INSERT/UPDATE/DELETE policy: tambah check `NOT tenant_subscription_status(tenant_id)` (read_only gate)
- [ ] Tidak ada `DROP TABLE` tanpa backup/rename strategy
- [ ] Backward compatible: tabel/kolom lama tidak dihapus langsung, gunakan `ALTER TABLE RENAME` atau buat view alias
- [ ] Catat di `docs/audit-notes.md` jika ada penyimpangan dari specification.md

## Pola Rollback

Setiap migration yang mengubah struktur tabel harus punya komentar rollback:

```sql
-- ROLLBACK:
-- ALTER TABLE tenant_units DROP COLUMN IF EXISTS contract_end;
-- DROP POLICY IF EXISTS "tenant_units_select_member" ON tenant_units;
```

## Test Isolasi Tenant (Template)

Setelah migration, selalu verifikasi RLS dengan query berikut (jalankan via Supabase MCP `execute_sql`):

```sql
-- Test 1: User di tenant A tidak bisa lihat data tenant B
SET request.jwt.claims = '{"sub": "user-tenant-a"}';
SELECT count(*) FROM <table> WHERE tenant_id = '<tenant-b-id>';
-- Expected: 0

-- Test 2: Tenant read_only tidak bisa INSERT
SET request.jwt.claims = '{"sub": "user-read-only-tenant"}';
INSERT INTO <table> (tenant_id, ...) VALUES ('<read-only-tenant-id>', ...);
-- Expected: ERROR (policy violation)
```
