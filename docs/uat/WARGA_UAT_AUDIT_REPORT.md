# Laporan Audit Awal Warga UAT

> Tanggal: 10 Agustus 2026  
> Diperbarui: 11 Agustus 2026 09:20 +07  
> Baseline: `15f878c322f12ba2d731cb15aae04f8f19b8ff7c` pada `main`  
> Scope: preflight/static audit dan QC prasyarat UAT  
> Status: rotasi dan publishable UAT terverifikasi; Gate A/B tetap blocked pada DDL/n8n; tidak ada data, email, execution, atau workflow UAT yang dibuat

## Ringkasan keputusan

Identitas endpoint Supabase staging telah dibuktikan secara read-only: host berbeda dari `.env` default dan cocok dengan allowlist UAT. Rotasi legacy kini terverifikasi karena legacy anon/service-role lama ditolak 401 sementara modern server secret diterima 200 pada host UAT; key dan body tidak dicetak. Publishable key UAT juga valid pada endpoint Auth settings/health (200). Respons 401 pada root PostgREST berasal dari database baru yang belum memiliki schema/role hasil migration dan tidak lagi dipakai sebagai indikator validitas key. Jalur DDL staging belum tersedia dan n8n belum menyediakan workflow/credential UAT. Tidak ada request atau mutasi ke Supabase production, query row staging, workflow production yang diedit, atau email yang dikirim.

Production tidak diuji end-to-end. Laporan ini bukan sertifikasi keamanan atau fungsional production.

## Bukti yang dijalankan

| Pemeriksaan | Hasil | Catatan |
| --- | --- | --- |
| Git baseline + `git fetch origin` | Pass | `main` 0 behind/0 ahead; existing dirty worktree dipertahankan |
| Graphify architecture query | Pass (orientation) | Menunjukkan rantai auth production; tidak ada vocabulary UAT |
| Source route/proxy/schema inventory | Pass (static) | Gap live-vs-source dicatat sebagai risiko |
| `npm run test:uat` | Pass | 9 proxy, mode-switch, raw protected-env, dan append-only key assertions |
| `npm run security:uat` | Pass | Tidak ada privileged client secret; anon JWT diklasifikasikan browser-safe |
| `npm run preflight:schema:uat` | Pass | 17 migration, 21 tabel, 1 bucket config, tidak ada production rows; overlay UAT terpisah |
| `npm run build` | Pass with warnings | Warning chunk >500 kB dan dynamic import existing |
| `npm --prefix client run build:uat` synthetic | Pass | Build berhasil hanya dengan env sintetis |
| `build:uat` tanpa env/allowlist | Pass (fail-closed) | Startup berhenti sebelum menerima request |
| Supabase staging identity/key rotation | Pass read-only | Host UAT berbeda dari default; legacy key 401, modern server secret 200, dan publishable pada Auth settings/health 200; tidak ada body/key dicetak |
| n8n `UAT -` inventory | Blocked | Exact-prefix `UAT -` = 0 dan credential UAT/staging = 0; hasil fuzzy adalah workflow production dan hanya dibaca |

### QC dan gate ulang 10 Agustus 2026

- `npm run test:uat`: 6/6 lulus, termasuk penolakan namespace production, override header browser, path injection, dan hostname silang.
- `npm run security:uat`: lulus setelah build UAT; tidak ditemukan pola privileged secret pada client/source/bundle yang dipindai.
- Syntax check seluruh guard/scanner: lulus; `git diff --check`: lulus.
- Build production: lulus dengan warning chunk/dynamic import existing. Build UAT sintetis: lulus. Build UAT tanpa `APP_ENV=uat` dan `VITE_APP_ENV=uat`: gagal seperti yang diwajibkan (fail-closed).
- Graphify, dengan vocabulary `[api, auth, jwt, validate, verify, webhook, workflow]`, hanya menunjukkan rantai auth production. Guard UAT baru diverifikasi langsung melalui source dan test karena belum ada pada graph lama.
- Supabase MCP hanya diperiksa melalui metadata project URL/branch. Tidak ada operasi tabel, schema, auth, storage, migration, atau data yang dijalankan.
- n8n hanya diperiksa melalui metadata workflow/credential. Satu SMTP generik dan tiga header-auth generik tidak dianggap credential UAT atau SMTP sandbox tanpa bukti operator.

### QC dan gate ulang 11 Agustus 2026

- `client/uat.env` dipertahankan sesuai instruksi pemilik, ditambahkan ke `.gitignore`, dan tidak diubah/dihapus selama implementasi loader.
- Mode UAT menonaktifkan auto-load `.env` dan membaca `client/uat.env` melalui allowlist tiga nilai Supabase browser-safe. Service-role dan legacy JWT tidak diteruskan ke Vite/browser.
- Mode normal/production tetap memakai `.env`. Bundle UAT memuat host staging dan tidak memuat host default; bundle production menunjukkan kebalikannya. Keduanya tidak memuat nama privileged variable atau namespace webhook backend.
- Endpoint Auth health/settings staging merespons 200 dengan browser-safe key. Body respons tidak dicetak; tidak ada query tabel, schema, storage, auth identity, atau data warga.
- Build UAT dengan transport n8n sintetis lulus. Tanpa credential server n8n, build UAT gagal tertutup sebagaimana diwajibkan.
- `npm run test:uat`: 9/9 lulus. Secret scan, syntax check, dan `git diff --check`: lulus.
- Recheck metadata n8n: exact-prefix workflow `UAT -` tetap 0, credential UAT/staging tetap 0, dan satu SMTP generik belum dapat dibuktikan sebagai sandbox.
- Client kini memprioritaskan publishable key modern. Bundle UAT tidak memuat legacy anon/service-role/JWT secret; bundle production tidak memuat host atau publishable key UAT.
- Loader UAT kini memetakan nama raw yang ada di `client/uat.env` (`SUPABASE_URL`) ke define browser-safe dan memprioritaskan entry append-only `SUPABASE_UAT_PUBLISHABLE_KEY`; nilai privileged tetap tidak dipilih.
- UAT synthetic build lulus dengan host UAT; bundle UAT tidak memuat host production atau privileged values. Build UAT tanpa `N8N_BASIC_AUTH_*`/`N8N_UAT_KEY` gagal fail-closed. Setelahnya production build dijalankan ulang.
- Rencana dry-run clone schema, safety overlay, dan empty-state verifier tersedia di `docs/uat/WARGA_UAT_SCHEMA_CLONE_PLAN.md`; belum ada remote migration.
- Kontrak staging-only `uat_run_id`/`is_demo`, inventory residu, dan cleanup child-to-parent telah disiapkan lokal. Helper hanya diberikan ke `service_role` dan fail-closed pada environment non-UAT atau residu Storage/Auth; belum diterapkan remote.
- Rotasi legacy diverifikasi tanpa data read: legacy anon/service-role 401 dan modern server secret 200. Publishable key UAT valid pada Auth settings/health (200); root PostgREST 401 pada schema kosong bukan indikator key invalid.
- Supabase MCP dikonfirmasi mengarah ke host production/default, sehingga tidak digunakan untuk tabel, migration, auth, storage, atau data UAT.
- Entry publishable append-only terverifikasi valid melalui Auth. Entry DB URL pertama adalah HTTPS Project URL, bukan PostgreSQL connection string. Loader/validator mendukung suffix versi `_V2`, `_V3`, dan seterusnya agar baris lama tidak perlu diubah/dihapus.
- Direct PostgreSQL URL versi berikutnya terverifikasi menunjuk UAT, tetapi CLI dry-run tidak dapat me-resolve endpoint direct IPv6 dengan resolver native maupun DNS-over-HTTPS. Tidak ada migration diterapkan; jalur berikutnya adalah Session pooler IPv4 UAT.
- Pada 13 Agustus, Session pooler V3 dan rotasi password terverifikasi. DNS/TCP pooler tersedia, tetapi CLI dry-run serta probe PostgreSQL SSL pada seluruh IP/port tidak memperoleh handshake. Tidak ada apply; jalur remote berikutnya harus MCP project-scoped UAT atau SQL Editor UAT.

## Requirement coverage

| Requirement | Status | Bukti/batasan |
| --- | --- | --- |
| WUAT-REQ-001 | Pass | Baseline reproducible dan existing changes dipertahankan |
| WUAT-REQ-002 | Partial | Pemisahan bundle staging/default dan guard local pass; routing live n8n belum dapat dibuktikan |
| WUAT-REQ-003 | Partial | Client exposure dikarantina, scan pass, legacy key lama revoked, dan publishable valid; `N8N_UAT_KEY` masih diperlukan |
| WUAT-REQ-004 | Blocked | Belum ada workflow `UAT -`/credential staging/sandbox |
| WUAT-REQ-005 | Blocked | Rotasi terverifikasi, tetapi jalur DDL staging belum tersedia dan MCP menunjuk production |
| WUAT-REQ-006 | Not Tested | Identity endpoint staging tersedia; fixture/auth warga belum boleh dibuat sebelum Gate A/B lulus |
| WUAT-REQ-007 | Static Fail / High | `canViewHouses` mensyaratkan staff; warga tidak mendapat akses route sesuai requirement |
| WUAT-REQ-008 | Static Risk / Medium | Limit client dan bucket baseline 2 MB; alur private signed URL belum diuji |
| WUAT-REQ-009 | Not Tested / High risk | Schema `payments` masih satu bill per row; atomic multi-allocation belum terbukti |
| WUAT-REQ-010 | Not Tested | Workflow staging dan fixture tidak tersedia |
| WUAT-REQ-011 | Blocked | SMTP sandbox hosted belum tersedia/terbukti |
| WUAT-REQ-012 | Partial | Proxy negative tests pass; horizontal/vertical authorization live belum diuji |
| WUAT-REQ-013 | Pass | Laporan severity dan rekomendasi ini tersedia |
| WUAT-REQ-014 | Not Applicable / Blocked | Tidak ada entitas UAT; verifikasi nol residu remote tidak dapat dijalankan |
| WUAT-REQ-015 | Pass | Tidak ada production mutation, commit, push, deploy, atau remediation backlog |

## Temuan severity

### Critical — release blocker

**F-CRIT-001 — Privileged staging secret pernah berada di client source path.**

`client/src/staging.env` pernah memuat service-role dan legacy JWT staging dengan prefix `VITE_`. File lama tidak lagi menjadi sumber aktif. File protected `client/uat.env` memuat entry privileged yang tidak dimuat oleh loader UAT dan file kini ignored. Risiko key lama telah dimitigasi: request read-only ke host UAT membuktikan legacy anon/service-role lama ditolak 401 dan modern server secret diterima 200. Nilai lama tetap tidak boleh digunakan atau dikirim ke browser.

### High

**F-HIGH-001 — Jalur DDL staging belum siap.** Publishable dan modern server secret staging valid, tetapi API key bukan credential PostgreSQL/DDL dan server secret tidak boleh dipakai browser. Supabase MCP menunjuk host production/default, Supabase CLI/psql tidak tersedia, dan entry `SUPABASE_UAT_DB_URL` saat ini hanya HTTPS Project URL. Clone schema, seed, cleanup, serta test data tetap diblokir sampai PostgreSQL connection string UAT tersedia.

**F-HIGH-002 — Tidak ada isolasi workflow UAT yang dapat diuji.** Inventory n8n menemukan 91 workflow production/generik, tetapi 0 nama `UAT -` dan 0 credential UAT. Email sandbox, `portal-uat-v1`, `X-UAT-Key`, kill switch, dan execution cleanup belum tersedia.

**F-HIGH-003 — Direktori Rumah ditolak untuk role warga pada frontend.** `canViewHouses` menggunakan minimum role `pengurus`, sementara requirement meminta warga approved dapat membuka `/houses`. Dampak aktual live belum diuji; ini static product finding dan backlog remediation, bukan diperbaiki pada fase audit.

**F-HIGH-004 — Endpoint demo aktif.** Workflow `PV API - Auth Demo` tercatat aktif dan client masih memanggil `/auth/demo`. Risiko privilege/demo credential harus diaudit lebih lanjut; tidak dinonaktifkan tanpa approval remediasi.

### Medium

**F-MED-001 — Batas bukti pembayaran tidak mencapai target 5 MB.** Client dan migration bucket baseline menggunakan 2 MB. Ini dapat memblokir bukti warga 2–5 MB dan belum diuji pada staging.

**F-MED-002 — Kontrak pembayaran multi-bulan atomik belum ada pada schema baseline.** Model production yang tersedia mengikat payment ke satu bill; parent/child allocation, idempotency, dan rollback seluruh submission belum terbukti.

**F-MED-003 — Fallback preview membentuk public object URL.** Client memiliki fallback `/storage/v1/object/public/payments/...`, sedangkan bucket migration yang ditemukan private dan bernama `payment-proofs`. Konsistensi signed URL/ownership perlu diperbaiki setelah approval.

**F-MED-004 — QC build memberi chunk warning.** Main bundle sekitar 550 kB dan Reports sekitar 445 kB; Vite juga memperingatkan dynamic import yang sekaligus static import. Tidak memblokir preflight, tetapi berdampak pada perangkat warga.

### Low / process

**F-LOW-001 — Client sebelumnya tidak memiliki test/security script.** Sesi ini menambahkan test proxy dan scanner prasyarat UAT; cakupan aplikasi bisnis tetap belum diuji.

## Rekomendasi berurutan (belum diimplementasikan)

1. Sediakan PostgreSQL connection string staging yang project reference-nya sama dengan endpoint UAT terverifikasi; jangan gunakan Supabase MCP saat ini karena menunjuk production.
2. Operator n8n membuat credential staging, SMTP sandbox, dan transport/header auth UAT; workflow `UAT -` dibuat inactive dengan namespace `portal-uat-v1` dan kill switch.
3. Clone migration/schema saja ke staging, tambahkan marker `uat_run_id`/`is_demo` serta RPC/cleanup child-to-parent melalui dry-run dan review.
4. Jalankan seed sintetis dengan `ngatormatic@gmail.com`, staff `denmas.dyudhiantoro@gmail.com`, unit/tagihan demo, lalu functional + negative authorization test dari POV warga.
5. Capture checksum production workflow sebelum/sesudah, audit email sandbox/execution, dan bersihkan seluruh residu; cabut key sesi.
6. Setelah laporan ini disetujui terpisah, kerjakan backlog product remediation sesuai severity—bukan sebelum approval.

## Cleanup dan release gate

Pembaruan 11 Agustus: `client/uat.env` dipertahankan sesuai instruksi pemilik dan sekarang ignored. Loader hanya membaca nilai browser-safe pada mode UAT; nilai privileged tidak digunakan. Mode normal/production kembali ke `.env`. Rotasi legacy dan publishable key terverifikasi. Gate A tetap blocked pada ketiadaan jalur DDL staging dan `N8N_UAT_KEY`; Gate B tetap blocked pada workflow/credential n8n UAT.

Tidak ada row/file/auth identity/email/execution UAT yang dibuat, sehingga tidak ada remote cleanup yang boleh dipalsukan sebagai Pass. Dua snapshot karantina lokal yang memuat secret lama telah dihapus dan tidak dapat dipulihkan melalui Git karena berasal dari file ignored/untracked; `.env.server.local` ignored hanya mempertahankan konfigurasi server lokal yang dipisahkan dari client. Workflow production tetap aktif dan tidak disentuh; workflow UAT belum ada. Gate A (isolation) dan Gate B (workflow) tetap blocked, sehingga Gate C–E tidak dapat dimulai secara aman.
