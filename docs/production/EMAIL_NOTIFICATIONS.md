# Email Notifications v2

> Status: implementasi lokal, belum diaktifkan di production
> Tanggal: 5 Agustus 2026

Notifikasi email memakai durable outbox dan worker asynchronous. Kegagalan email tidak mengubah hasil pendaftaran, pembayaran, atau verifikasi. Event yang gagal dicapture dipulihkan oleh reconciler.

## Jaminan pengiriman

Pipeline memberikan **effectively-once**, bukan exactly-once absolut:

- `dedupe_key` dan `message_id` deterministik mencegah duplikasi logis;
- claim batch dilakukan atomik dengan lease token;
- timeout Gmail diperiksa pada Sent melalui Message-ID sebelum retry;
- retry memakai backoff dan berakhir di `dead_letter`;
- reconciler memulihkan event bisnis yang tidak mempunyai outbox.

Gmail tetap merupakan sistem eksternal. Pada kasus provider menerima email tetapi pencarian Sent belum konsisten, duplikasi residual masih mungkin terjadi dan harus dimonitor.

## Komponen

| Artifact | Fungsi |
| --- | --- |
| `supabase/migrations/202608050001_transactional_email_outbox.sql` | Prototype schema v1 |
| `supabase/migrations/202608050002_transactional_email_outbox_v2.sql` | Outbox production v2, fail-open capture, RPC, DLQ, incident, retention |
| `pv-notifications-transactional-email-v2.workflow.js` | Dispatcher Gmail effectively-once |
| `pv-notifications-stale-claim-recovery.workflow.js` | Recovery expired lease melalui pencarian Gmail Sent |
| `pv-notifications-reconcile.workflow.js` | Recovery gap profiles/payments |
| `pv-notifications-reconcile-payments.workflow.js` | Branch payment reconciler yang tidak bergantung pada hasil query profile |
| `pv-notifications-watchdog.workflow.js` | Alert dan recovery notification independen |
| `pv-notifications-cleanup.workflow.js` | Cleanup sent/dead-letter |
| `EMAIL_NOTIFICATIONS_EVENT_CONTRACT.json` | Kontrak event, recipient, payload, dan dedupe |
| `EMAIL_NOTIFICATIONS_PRODUCTION_INVENTORY.md` | Source workflow production yang tersedia/hilang |
| `supabase/tests/transactional_email_outbox_v2.sql` | Test fail-open, dedupe, lease, outcome, dan reconciliation |
| `EMAIL_NOTIFICATIONS_TEST_REPORT.md` | Bukti static validation dan daftar blocker environment |

Workflow v1 `pv-notifications-transactional-email.workflow.js` tetap disimpan sebagai prototype/rollback reference dan tidak boleh aktif bersamaan dengan v2.

## Penerima

| Aktivitas | Penerima |
| --- | --- |
| Pengguna baru mendaftar | Pengguna baru dan Admin aktif/approved |
| Pembayaran IPL dicatat | Actor `recorded_by` dan warga pemilik tagihan |
| Pembayaran menunggu verifikasi | Admin dan Bendahara aktif/approved |
| Verifikasi pengguna selesai | Pengguna dan actor `approved_by`/`rejected_by` |
| Verifikasi pembayaran selesai | Warga dan actor `verified_by` |
| Insiden pipeline | `denmas.dyudhiantoro@gmail.com` melalui SMTP sekunder |

Satu orang yang masuk melalui beberapa kategori tetap dideduplikasi per event/template.

## Credential dan environment

Credential n8n:

- `PV Supabase Service Role`;
- `Gmail account PalmVillage.Paguyuban`;
- `PV Alert SMTP Secondary` — wajib merupakan provider/account berbeda dari Gmail utama.

Environment:

- `PV_SUPABASE_URL`;
- `PV_EMAIL_FROM` — default `palmvillage.paguyuban@gmail.com`; verifikasi akun dan izin Raw Gmail API sebelum go-live;
- `PV_ALERT_FROM` — sender yang sudah diizinkan provider sekunder;
- `PV_ENVIRONMENT`;
- `PV_EMAIL_SENT_RETENTION_DAYS`, default 30;
- `PV_EMAIL_DEAD_LETTER_RETENTION_DAYS`, default 90;
- `N8N_INSTANCE_ID` untuk identitas worker.

Secret tidak boleh dimasukkan ke source atau execution output.

## Gate sebelum deployment

1. Export semua workflow production yang berstatus blocker pada inventory.
2. Patch dan validasi `recorded_by`, `verified_by`, `approved_by`, dan `rejected_by` dari session server-side.
3. Verifikasi sender Gmail aktual dan izin raw Gmail API.
4. Buat serta uji credential `PV Alert SMTP Secondary`.
5. Terapkan migration v1 lalu v2 di staging dan jalankan test SQL.
6. Import keenam workflow v2 dalam keadaan inactive.
7. Jalankan shadow/hold dan review recipient serta volume backfill.
8. Lakukan failure-injection UAT.
9. Canary allowlist sebelum pengiriman penuh.

Tidak ada backfill historis yang boleh dikirim tanpa persetujuan owner.

## Pemeriksaan operasional

Queue:

```sql
select event_type, status, attempts, error_class, created_at, available_at,
       lease_expires_at, sent_at, terminal_at
from public.email_notification_outbox
order by created_at desc
limit 100;
```

Backlog dan dead-letter:

```sql
select status, count(*) as total, min(created_at) as oldest
from public.email_notification_outbox
group by status
order by status;
```

Heartbeat:

```sql
select component, worker_id, last_success_at, last_error, last_metrics
from public.email_notification_runs
order by component;
```

Incident:

```sql
select incident_key, status, first_seen_at, last_seen_at,
       last_alerted_at, recovered_at, details
from public.email_notification_incidents
order by updated_at desc;
```

## Runbook singkat

### Gmail utama gagal

1. Jangan mengubah data payment/profile.
2. Pastikan watchdog mengirim alert melalui SMTP sekunder.
3. Nonaktifkan dispatcher bila terjadi hot loop; biarkan outbox tersimpan.
4. Perbaiki/rotasi credential Gmail.
5. Aktifkan dispatcher dan pantau retry/backlog.

### Backlog meningkat

1. Periksa heartbeat dispatcher dan reconciler.
2. Periksa error class, quota, serta oldest pending.
3. Jangan menjalankan blind replay atas row `processing` yang hasilnya ambigu.
4. Cari Message-ID pada Gmail Sent sebelum melepaskan lease.

### Dead-letter

1. Periksa recipient, template, dan error class.
2. Koreksi konfigurasi/alamat bila diperlukan.
3. Replay hanya melalui operasi berizin dengan alasan dan audit.
4. Pastikan alert tidak ditandai terkirim bila SMTP sekunder gagal.

### Stop-send darurat

Nonaktifkan workflow dispatcher v2 saja. Capture dan reconciler dapat tetap berjalan sehingga event tidak hilang. Jangan menghapus outbox.

## Rollback

- Nonaktifkan workflow v2 bila template/provider bermasalah.
- Jangan mengaktifkan v1 dan v2 bersamaan.
- Schema v2 bersifat additive; rollback awal tidak melakukan drop tabel/kolom.
- Pertahankan outbox, attempts, incident, dan audit untuk investigasi.
- Setelah perbaikan, lakukan Sent reconciliation sebelum replay.

## UAT wajib

- Registrasi dan approval/reject pengguna.
- Payment manual/cash oleh setiap role yang diizinkan.
- QRIS create/status/webhook dan callback berulang.
- Enqueue gagal tetapi transaksi bisnis commit.
- Dua dispatcher paralel tidak mengklaim row sama.
- Gmail menerima email lalu worker gagal menyimpan status.
- Credential Gmail gagal dan alert sekunder diterima.
- Cooldown mencegah alert storm dan recovery notification terkirim.
- Cleanup hanya menghapus row melewati retensi.

Production rollout belum boleh dinyatakan selesai sampai semua gate dan UAT di atas memiliki bukti.
