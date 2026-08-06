# Go/No-Go Notifikasi Email

Tanggal pemeriksaan: 6 Agustus 2026

## Keputusan saat ini

**NO-GO untuk aktivasi atau rollout production.**

Artifact lokal, migration, dan workflow sudah siap untuk validasi staging, tetapi bukti runtime eksternal belum tersedia.

## Gate yang harus ditutup

| Gate | Bukti wajib | Status |
| --- | --- | --- |
| Database staging | Migration v1/v2 berhasil diterapkan tanpa rollback bisnis | BLOCKED — akses PostgreSQL/Supabase staging belum tersedia |
| SQL matrix | `supabase/tests/transactional_email_outbox_v2.sql` menghasilkan `PASS` | BLOCKED — belum ada database runtime |
| Workflow baseline | Export JSON live untuk approval, manual/cash payment, QRIS create/webhook | BLOCKED — source live belum tersedia; API n8n merespons 401 tanpa API key |
| Actor mapping | `recorded_by`, `verified_by`, `approved_by`, `rejected_by` berasal dari session/JWT server-side | BLOCKED — workflow live belum dapat direview |
| Gmail sender | Credential `Gmail account PalmVillage.Paguyuban` mengirim dari `palmvillage.paguyuban@gmail.com` | BLOCKED — credential live belum diuji |
| Independent alert | Credential `PV Alert SMTP Secondary` mengirim alert dan recovery ke `denmas.dyudhiantoro@gmail.com` | BLOCKED — credential belum dibuat/diuji |
| Failure/concurrency UAT | Enqueue failure, timeout, stale lease, duplicate callback, retry, dead-letter, replay, dan dua worker lulus | BLOCKED — membutuhkan staging dan provider |
| Canary/rollback | Shadow, canary, stop-send, rollback drill, dan observasi stabil | BLOCKED — gate sebelumnya belum lulus |

## Input yang diperlukan dari owner

Jangan kirim secret melalui chat atau commit repository. Sediakan melalui secret manager atau akses sementara:

1. Export JSON workflow n8n live atau API key n8n untuk workflow ID yang tercantum di inventory.
2. Akses Supabase/PostgreSQL staging untuk menjalankan migration dan SQL test.
3. Konfirmasi credential Gmail sudah terhubung ke `palmvillage.paguyuban@gmail.com` dan memiliki izin Gmail Raw API.
4. Credential `PV Alert SMTP Secondary` yang independen dari Gmail utama.

## Keputusan setelah gate

- Semua gate runtime lulus: **GO staging shadow**.
- Shadow dan failure UAT lulus: **GO canary terbatas**.
- Canary stabil serta rollback drill lulus: **GO rollout bertahap**.
- Salah satu gate gagal: tetap **NO-GO**, tahan dispatcher; transaksi bisnis tetap boleh berjalan karena capture bersifat fail-open.
