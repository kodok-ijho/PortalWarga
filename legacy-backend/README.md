# Legacy Backend (DEPRECATED)

> ⚠️ **Folder ini sudah tidak dipakai.** Dibiarkan hanya sebagai referensi historis.

Backend Node.js/Express + MongoDB versi lama dari Portal Warga Palm Village. Mulai v2, seluruh backend diganti dengan:

- **Supabase** (PostgreSQL + Auth + Row Level Security) → data & autentikasi
- **n8n** (`n8n-icyxwmjq.runner.web.id`) → otomasi (webhook Mayar, cron tagihan, notifikasi)
- **Supabase Edge Functions** → logika sinkron (generate QRIS)

## Kenapa di-deprecate?

Backend lama memiliki sejumlah bug fundamental (JWT payload tanpa `role`, password plaintext tanpa hashing hook, login memanggil `comparePassword` yang tidak ada, `.remove()` Mongoose 7 deprecated, integrasi Mayar masih TODO kosong) dan boilerplate Express yang sudah tidak diperlukan dengan adanya Supabase + RLS.

Lihat [`../PLAN.md`](../PLAN.md) §Ringkasan Perubahan untuk detailnya.

## Jangan dijalankan

Folder ini tidak di-maintain. Jangan gunakan sebagai backend aktif. Untuk pengembangan, ikuti `PLAN.md` Phase 0+.
