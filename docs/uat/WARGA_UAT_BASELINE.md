# Baseline dan Checklist Eksekusi Warga UAT

> Dicatat: 2026-08-10T22:38:54+07:00  
> Scope: WUAT-001 dan inventaris awal WUAT-002  
> Production: metadata read-only saja; tidak ada data atau workflow production yang dimutasi

## Baseline repository

| Item | Nilai |
| --- | --- |
| Working directory | `D:\DenmasGanteng\Palm Village\Portal Warga Palm Village\PortalPalmVillage` |
| Branch | `main` |
| HEAD | `15f878c322f12ba2d731cb15aae04f8f19b8ff7c` |
| Upstream | `origin/main` |
| Divergence setelah `git fetch origin` | 0 behind / 0 ahead |
| Node.js | `v22.23.2` |
| npm | `11.5.2` |
| Vite | `^5.0.0` dari `client/package.json` |
| Supabase CLI | Tidak tersedia |
| Lockfile | `package-lock.json`, `client/package-lock.json` |

Working tree telah kotor sebelum implementasi UAT. Perubahan/aset existing yang wajib dipertahankan meliputi perubahan Graphify, `.tmp/`, tiga dokumen Warga UAT, `client/src/staging.env`, tiga dokumen email notification, serta memory/cache Graphify. Tidak dilakukan `pull`, `reset`, `checkout`, commit, push, atau deploy.

## Arsitektur aktual yang terverifikasi

- Frontend memakai same-origin `/api/n8n` secara default melalui `client/src/services/apiClient.js`.
- Proxy development di `client/vite.config.js` masih hardcode `/webhook/portal-v1`.
- Proxy Vercel di `api/n8n.js` dan `client/api/n8n.js` juga hardcode production. Perbedaan kedua file hanya format module CJS versus ESM.
- App JWT diteruskan oleh proxy melalui `X-Portal-Authorization`; Basic Auth tetap server-side.
- Route `/houses` ada, tetapi item navigasi Rumah hanya ditampilkan untuk staff.
- Upload bukti warga masih dibatasi 2 MB sebelum kompresi.
- Endpoint `/auth/demo` masih dipanggil oleh client dan workflow production terkait aktif.
- Schema/migration repository mempunyai profiles, units, bills, payments, audit, dan email outbox, tetapi belum mempunyai kontrak UAT yang lengkap.

## Deviasi terhadap proposed plan

| ID | Deviasi aktual | Dampak/gate | Status |
| --- | --- | --- | --- |
| DEV-001 | `client/src/staging.env` mengandung service-role dan legacy JWT staging dengan prefix `VITE_` | Critical exposure risk; Gate A gagal | Terbukti secara static, nilai tidak ditampilkan |
| DEV-002 | `client/src/staging.env` belum di-ignore oleh Git | High accidental commit risk; Gate A gagal | Terbukti |
| DEV-003 | Koneksi Supabase MCP tidak cocok dengan URL staging | Remote staging tidak boleh diakses melalui koneksi tersebut | Blocked; tidak ada query data/schema remote |
| DEV-004 | Tidak ada workflow bernama `UAT -` atau credential berlabel UAT | Gate B belum dimulai | Terbukti melalui metadata n8n read-only |
| DEV-005 | Tidak ada credential SMTP sandbox yang dapat dibuktikan; hanya credential SMTP generik | Email UAT tidak boleh diaktifkan | Blocked |
| DEV-006 | Belum ada `portal-uat-v1`, `X-UAT-Key`, environment guard, atau kill switch pada source | Gate A gagal | Terbukti |
| DEV-007 | Schema repository belum memiliki propagasi `uat_run_id`, marker `is_demo`, parent/child allocation, dan cleanup contract | WUAT-005/006 belum siap | Terbukti secara static |
| DEV-008 | Workflow `PV API - Payments List` tidak tersedia untuk pembacaan MCP | Baseline checksum workflow itu belum dapat diambil | Keterbatasan akses |
| DEV-009 | Client belum mempunyai script lint/test; hanya build | QC otomatis belum lengkap | Terbukti dari package scripts |
| DEV-010 | Fallback client membentuk URL bucket `payments` publik | Kandidat temuan High bila path dapat digunakan | Static risk; belum diuji dan tidak diperbaiki pada fase audit |

## Baseline workflow production relevan

Checksum memakai FNV-1a-64 atas workflow ter-sanitasi yang dikembalikan n8n MCP. Nilai ini hanya untuk deteksi perubahan dalam sesi audit dan tidak memuat credential value.

| Workflow | Active | Version | Checksum |
| --- | --- | --- | --- |
| PV API - Auth Google | Ya | `14973ebd-c2a1-433f-a878-9ca98995e456` | `8d335b15671b4f50` |
| PV API - Auth Me | Ya | `4825264d-e85b-45cc-afee-40155655bafc` | `660dfe7b693afdec` |
| PV API - Users Approve | Ya | `6af39845-0ed7-46c5-aef7-6e0adb55d57c` | `30d3ad569b285dd5` |
| PV API - Users Reject | Ya | `7c934918-f907-4b05-aa65-9dfe754c1fc6` | `82e9a5799b2f8183` |
| PV API - Units List | Ya | `875615c2-3475-4d11-be64-50b5df233df0` | `1ccb935022c87fb3` |
| PV API - Residents List | Ya | `764cdd0f-42d8-4e86-93ad-3cc0529e0f80` | `c29ce5e78f724bba` |
| PV API - Bills Matrix | Ya | `7e7f45dc-2354-4f68-a2fe-0c70db9acbcc` | `57838b5c8abff386` |
| PV API - Payments Manual Submit | Ya | `e861f40f-5552-44ca-ba11-2ab2b4d32710` | `132428c70da03d7a` |
| PV API - Payments Manual Approve | Ya | `f8020951-818b-4499-9847-3150143baa85` | `358c352cab36ad98` |
| PV API - Payments Manual Reject | Ya | `f8c03514-56b5-4e9f-a4f9-581467221ee1` | `b2346d77b36eba60` |
| PV Notifications - Transactional Email v2 | Ya | `27c7e5c0-3311-43ae-bbe2-9dbebdda7fdf` | `44650a50eefaed84` |
| PV Notifications - Cleanup | Ya | `ad98d548-afd8-4d31-ab5a-63f50ce0f859` | `294085a29942330c` |

`PV API - Payments List` aktif menurut inventory, tetapi definition-nya tidak tersedia melalui MCP sehingga tidak diberi checksum palsu.

## Checklist implementasi dan gate

- [x] WUAT-001: baseline Git, origin, environment, dan existing changes.
- [ ] WUAT-002: lengkapi endpoint-to-workflow-to-data matrix dan akses workflow yang tidak tersedia.
- [ ] WUAT-003: karantina secret lama, rotasi remote staging, relokasi, dan secret scan.
- [ ] Gate A: buktikan hanya browser-safe key di client dan koneksi staging terverifikasi.
- [ ] WUAT-004: implement proxy lokal `portal-uat-v1` + `X-UAT-Key` server-side + fail-closed tests.
- [ ] WUAT-005/006: schema/storage staging, `uat_run_id`, `is_demo`, serta cleanup contract.
- [ ] WUAT-007-011: workflow `UAT -` inactive, credential staging/sandbox, validation, checksum production tetap.
- [ ] WUAT-012-017: seed sintetis, UAT warga, dan negative authorization.
- [ ] WUAT-018: build/test/security/reliability QC dan pengulangan sampai prasyarat UAT bersih.
- [ ] WUAT-019: laporan audit severity dan rekomendasi tanpa product remediation.
- [ ] WUAT-020/021: cleanup nol residu, workflow inactive, key dicabut.
- [ ] WUAT-022: review pemilik tanpa commit/push/deploy.

## Keputusan keselamatan

1. Koneksi Supabase MCP yang tidak cocok staging tidak akan dipakai lagi dalam sesi ini.
2. Nilai key lama dari `client/src/staging.env` tidak akan digunakan untuk request.
3. Tidak ada workflow production yang akan diedit, dipublish, atau dinonaktifkan.
4. Tidak ada email yang akan dikirim sebelum SMTP sandbox hosted terbukti.
5. Backlog produk yang ditemukan hanya masuk laporan audit sampai approval remediasi terpisah.
