# RuangWarga Development Rules

## Project Identity
- **Nama project:** RuangWarga (sebelumnya PortalWarga)
- **Repository pengembangan:** https://github.com/kodok-ijho/RuangWarga-dev
- **Repository asal (read-only):** https://github.com/kodok-ijho/PortalWarga
- **Misi:** Transformasi PortalWarga (single-tenant) → RuangWarga (multi-tenant SaaS platform)

## Dokumen Perencanaan
Selalu baca ketiga dokumen ini sebelum mulai mengerjakan task apapun:
- `requirement.md` — Business requirements, FR-0 s/d FR-30, NFR, prioritas
- `specification.md` — Spesifikasi teknis, database schema, RLS, routing, billing
- `task.md` — 12-phase implementation plan (Phase 0–11), ~60 tasks

## Architecture (Target — Supabase-First)
- **Frontend:** React 18 + Vite 5 + TailwindCSS (SPA, PWA)
- **Auth:** Supabase Auth (Google OAuth)
- **Database:** Supabase PostgreSQL + Row Level Security (RLS)
- **Server-side logic:** Supabase Edge Functions (Deno/TypeScript)
- **Background jobs:** n8n (notifikasi, scheduled tasks, automation)
- **Payment:** Mayar QRIS
- **Hosting:** Vercel
- **Demo mode:** `VITE_DEMO_MODE=true` dengan `mockData.js`

## Architecture (Current — Sedang Dimigrasi)
- Auth via n8n (custom App JWT) — akan dimigrasi ke Supabase Auth
- API via `api/n8n.js` proxy → n8n webhooks — akan dimigrasi ke akses langsung Supabase
- RLS ada di schema tapi di-bypass oleh n8n service role key

## Konvensi Koding
- **Bahasa komunikasi:** Bahasa Indonesia
- **Commit message:** Bahasa Indonesia, format: `<type>: <deskripsi>`
- **Setiap task = 1 PR/commit terpisah** agar mudah di-review
- **Jangan ubah kode yang bukan bagian dari task aktif**
- **Pertahankan semua comment dan docstring** yang tidak terkait perubahan

## Prinsip Utama
1. **Platform-first:** Fondasi multi-tenant (Phase 1–5) harus selesai sebelum modul vertikal
2. **Ikuti kode actual:** Bila ada konflik antara spec dan kode existing, ikuti kode actual dan catat penyimpangan di `docs/audit-notes.md`
3. **RLS sebagai keamanan utama:** Isolasi tenant di-enforce di level database, bukan di application code
4. **Backward compatible:** Perubahan skema harus punya migration path, jangan break data existing

## Tenant Types
- `rt_rw` — Kompleks perumahan / RT/RW
- `kos` — Kos-kosan / kontrakan
- `arisan` — Grup arisan
- `kelas` — Kelas / les / sekolah

## Roles (per tenant)
- `admin` — Pemilik/ketua tenant
- `bendahara` — Keuangan tenant
- `pengurus` — Pengurus tenant
- `anggota` — Warga/penghuni/peserta/siswa

## Environment
- Agent berjalan di **proot-distro Ubuntu** di atas **Termux** di **Android**
- Path project: `/root/project/ruangwarga`
- Push ke GitHub menggunakan credential store (sudah dikonfigurasi)
- MCP tersedia: GitHub, Supabase, Sequential Thinking, Memory, Context7, Graphify

## File Penting di Codebase
- `client/src/App.jsx` — Route definitions, RoleGuard
- `client/src/context/AuthContext.jsx` — Auth system (606 baris)
- `client/src/services/dataService.js` — Unified data layer (2038 baris)
- `client/src/services/dataHelpers.js` — RBAC functions (340 baris)
- `client/src/services/apiClient.js` — API client (151 baris)
- `supabase/migrations/202607080001_initial_production_schema.sql` — Production DB schema
- `api/n8n.js` — Vercel serverless proxy ke n8n
