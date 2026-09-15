# Laporan Review Keamanan Row Level Security (RLS) Menyeluruh
> Ref: Task T11.5, requirement.md NFR-1, specification.md §6, AGENTS.md §5, §6
> Tanggal Audit: 15 September 2026
> Database: Supabase Dev `Ruangwarga-dev` (`jqbegedjsylhrqpknwor`) — PostgreSQL v17.6

Dokumen ini merupakan hasil audit resmi terhadap konfigurasi Row Level Security (RLS) pada seluruh tabel di skema `public` platform RuangWarga SaaS Multi-Tenant.

---

## 1. Ringkasan Eksekutif

- **Total Tabel:** 17 tabel di skema `public`
- **Tabel dengan RLS Aktif (`rls_enabled = true`):** 17 dari 17 (100%)
- **Tabel tanpa RLS (`rls_enabled = false`):** 0 tabel (0%)
- **Celah Kebocoran Cross-Tenant:** TIDAK DITEMUKAN.
- **Verifikasi Pengecualian Publik `public_listings` & `listing_pricing`:** Diverifikasi SENGAJA terbuka untuk publik sesuai rancangan spesifikasi (FR-27, Spec §6.1). Tidak ada tabel operasional internal yang terbuka publik secara tidak sengaja.

---

## 2. Checklist RLS Seluruh Tabel

| No | Nama Tabel | RLS Aktif | Scope Akses SELECT | Scope Akses INSERT/UPDATE/DELETE | Status Keamanan |
|:--:|---|:---:|---|---|:---:|
| 1 | `tenants` | ✅ Ya | Anggota tenant terkait & Platform Admin | INSERT: Pemilik (`owner_id = auth.uid()`)<br>UPDATE: Admin tenant (`is_tenant_admin(id)`) | **SECURE** |
| 2 | `tenant_subscriptions` | ✅ Ya | Anggota tenant terkait & Platform Admin | UPDATE: Admin tenant (`is_tenant_admin(tenant_id)`) | **SECURE** |
| 3 | `tenant_subscription_blocks` | ✅ Ya | Anggota tenant terkait & Platform Admin | Dikelola via sistem / Platform Admin | **SECURE** |
| 4 | `subscription_periods` | ✅ Ya | Publik (Katalog durasi 3, 6, 12 bulan) | Dikelola eksklusif oleh Platform Admin | **SECURE** |
| 5 | `block_pricing` | ✅ Ya | Publik (Katalog tarif blok kapasitas) | Dikelola eksklusif oleh Platform Admin | **SECURE** |
| 6 | `subscription_payments` | ✅ Ya | Anggota tenant terkait & Platform Admin | Dikelola via Edge Function / Webhook | **SECURE** |
| 7 | `platform_admins` | ✅ Ya | Eksklusif Platform Admin | Dikelola langsung oleh superuser database | **SECURE** |
| 8 | `tenant_units` | ✅ Ya | Anggota tenant terkait & Platform Admin | Admin tenant saat status BUKAN `read_only` | **SECURE** |
| 9 | `tenant_members` | ✅ Ya | Anggota tenant terkait & user ybs | INSERT: Self-register / Owner<br>UPDATE: Admin saat status BUKAN `read_only` | **SECURE** |
| 10 | `billing_items` | ✅ Ya | Anggota tenant terkait & Platform Admin | Admin tenant saat status BUKAN `read_only` | **SECURE** |
| 11 | `payments` | ✅ Ya | Anggota tenant terkait & Platform Admin | Anggota & Admin saat status BUKAN `read_only` | **SECURE** |
| 12 | `expenses` | ✅ Ya | Anggota tenant terkait & Platform Admin | Admin tenant saat status BUKAN `read_only` | **SECURE** |
| 13 | `arisan_rounds` | ✅ Ya | Anggota tenant arisan & Platform Admin | Admin arisan saat status BUKAN `read_only` | **SECURE** |
| 14 | `arisan_participants` | ✅ Ya | Anggota tenant arisan & Platform Admin | Admin arisan saat status BUKAN `read_only` | **SECURE** |
| 15 | `public_listings` | ✅ Ya | **PUBLIK (SENGAJA)**: `status = 'active' AND expires_at > now()`<br>Internal: Pemilik, Admin tenant, Platform Admin | Anggota tenant approved saat status BUKAN `read_only`<br>UPDATE/DELETE: Pemilik atau Admin tenant | **SECURE (Intended Public)** |
| 16 | `listing_pricing` | ✅ Ya | Publik (Katalog tarif pasang iklan) | Dikelola eksklusif oleh Platform Admin | **SECURE** |
| 17 | `listing_payments` | ✅ Ya | Pemilik postingan listing & Platform Admin | Pemilik postingan listing | **SECURE** |

---

## 3. Analisis Khusus Pengecualian Publik: `public_listings`

Sesuai **AGENTS.md Bagian 5 & 6** dan **specification.md §6.1**, modul listing publik adalah pengecualian yang disengaja dari isolasi ketat multi-tenant:

```sql
-- Policy: public_read_active_listings pada public.public_listings
CREATE POLICY "public_read_active_listings" ON public.public_listings
  FOR SELECT USING (
    (status = 'active' AND expires_at > now())
    OR (posted_by IN (SELECT tm.id FROM tenant_members tm WHERE tm.user_id = auth.uid()))
    OR (tenant_id IN (SELECT tm2.tenant_id FROM tenant_members tm2 WHERE tm2.user_id = auth.uid() AND tm2.role = 'admin' AND tm2.status = 'approved'))
    OR is_platform_admin()
  );
```

### Validasi Keamanan:
1. **Hanya listing aktif dan belum kedaluwarsa** yang dapat dibaca tanpa autentikasi (`(status = 'active' AND expires_at > now())`).
2. Listing dengan status `expired` atau `rented_or_sold` **otomatis disaring keluar** dari akses publik.
3. Data sensitif tenant (nomor rekening bank kas, data iuran warga internal, laporan keuangan) **TIDAK PERNAH terekspos** ke tabel `public_listings`.
4. Tabel relasional listing (`listing_payments`) **TIDAK terbuka publik** — hanya bisa dilihat oleh pemilik postingan dan Platform Admin.

---

## 4. Penegakan Read-Only Gate pada Operasi Tulis (Mutasi)

Seluruh tabel operasional tenant (`tenant_units`, `tenant_members`, `billing_items`, `payments`, `expenses`, `arisan_rounds`, `arisan_participants`, `public_listings`) telah dilengkapi klausa penegak read-only:

```sql
-- Contoh pada tabel billing_items & tenant_units:
AND tenant_subscription_status(tenant_id) <> 'read_only'::subscription_status
```

### Efek Penegakan:
- Saat langganan tenant habis masa berlaku (`trial_ends_at < now()` atau `current_period_end < now()`), status menjadi `read_only`.
- Percobaan `INSERT`, `UPDATE`, atau `DELETE` pada tabel operasional akan langsung ditolak oleh PostgreSQL engine dengan error policy violation, bahkan jika user berhasil membypass UI frontend.

---

## 5. Kesimpulan

Konfigurasi keamanan database telah memenuhi seluruh standar **NFR-1 (Isolasi Data Antar Tenant)** dan **FR-15 (Perilaku Read-Only)**. Sistem aman untuk diluncurkan ke tahap rilis produksi (Phase 11 DoD).
