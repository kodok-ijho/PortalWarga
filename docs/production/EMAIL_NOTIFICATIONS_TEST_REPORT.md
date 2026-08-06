# Test Report Notifikasi Email

> Tanggal: 5 Agustus 2026
> Environment: repository lokal
> Status: static validation passed; database/provider UAT belum dijalankan

## Lulus

- `npm run build` — Vite production build berhasil.
- `node --check` untuk seluruh workflow `pv-notifications-*` — berhasil.
- Kontrak `EMAIL_NOTIFICATIONS_EVENT_CONTRACT.json` — JSON valid.
- Static scan artifact baru — tidak menemukan trailing whitespace atau pola secret umum.
- SQL migration v2 — dollar-quote seimbang dan seluruh function/RPC yang direncanakan terdefinisi secara tekstual.
- Test matrix tersedia di `supabase/tests/transactional_email_outbox_v2.sql` untuk fail-open, actor, dedupe, atomic claim, stale lease, outcome, replay, incident cooldown/recovery, privilege, dan reconciliation.

## Belum lulus / blocker

- Migration belum dijalankan pada PostgreSQL/Supabase staging karena CLI/database connection tidak tersedia pada environment ini.
- SQL test belum dieksekusi; hasil static check bukan bukti eksekusi database.
- Credential Gmail raw API belum diverifikasi.
- `PV Alert SMTP Secondary` belum dibuat dan belum diuji mengirim ke `denmas.dyudhiantoro@gmail.com`.
- Export live n8n untuk payment manual/cash, QRIS create/webhook, dan user approval belum tersedia di repository.
- Failure injection, load/concurrency test dua worker, staging shadow, canary, dan production rollout belum dijalankan.

## Keputusan deployment

Jangan mengaktifkan workflow v2 atau menerapkan migration ke production sebelum seluruh blocker di atas ditutup dan owner menyetujui Gate B–D pada `email-notification-task.md`.
