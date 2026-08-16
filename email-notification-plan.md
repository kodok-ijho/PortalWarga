# Rencana Notifikasi Email Transaksional yang Andal

> Sistem: Portal Warga Palm Village
> Status: Draft untuk review — belum untuk deployment
> Tanggal: 5 Agustus 2026
> Requirement: `email-notification-requirement.md`

## 1. Sasaran Rencana

Rencana ini mengubah prototype notifikasi email menjadi pipeline production yang:

- terpisah dari keberhasilan transaksi bisnis;
- tahan retry dan dapat memulihkan event yang gagal dicapture;
- mencegah duplikasi secara effectively-once;
- mempunyai dead-letter, replay, monitoring, dan alert independen;
- dapat dirilis bertahap serta dihentikan tanpa kehilangan transaksi bisnis.

Rencana ini belum mengotorisasi perubahan database, workflow n8n, credential, atau production.

## 2. Baseline dan Kesenjangan Saat Ini

Artifact lokal saat ini:

- `supabase/migrations/202608050001_transactional_email_outbox.sql`;
- `docs/production/n8n-workflows/pv-notifications-transactional-email.workflow.js`;
- `docs/production/EMAIL_NOTIFICATIONS.md`.

Ketiganya diperlakukan sebagai prototype, bukan desain production yang sudah disetujui. Kesenjangan utama:

1. Trigger enqueue dapat membuat transaksi bisnis gagal bila terjadi exception database.
2. Claim melalui fetch lalu update belum atomik untuk banyak worker.
3. Worker yang berhenti setelah Gmail sukses tetapi sebelum status tersimpan dapat mengirim duplikat.
4. Belum ada reconciler untuk event bisnis yang tidak masuk outbox.
5. Belum ada dead-letter/replay terkontrol, heartbeat, dan alert independen.
6. Payload PII belum mempunyai kebijakan retensi/cleanup.
7. Source workflow mutasi production belum seluruhnya tersedia di repository, sehingga actor dan seluruh jalur event belum dapat dibuktikan konsisten.

## 3. Arsitektur Target

```mermaid
flowchart TD
    A[API / n8n business workflow] --> B[(profiles / payments)]
    B --> C[Fail-open capture]
    C --> D[(Durable email outbox)]
    B --> E[Reconciler berkala]
    E --> D
    D --> R[Stale lease recovery + Sent search]
    R --> D
    D --> F[Atomic claim RPC + lease]
    F --> G[Template renderer]
    G --> H[Gmail API raw MIME + deterministic Message-ID]
    H --> I[Persist sent/provider ID]
    H -->|timeout ambigu| J[Search Gmail Sent by Message-ID]
    J -->|ditemukan| I
    J -->|tidak ditemukan| K[Retry backoff / dead-letter]
    K --> D
    K --> L[Watchdog]
    M[Heartbeat & backlog metrics] --> L
    L --> N[Provider alert sekunder]
    N --> O[denmas.dyudhiantoro@gmail.com]
```

### 3.1. Pemisahan transaksi bisnis dan notifikasi

Capture dijalankan tanpa network call. Path normal tetap menulis outbox sedekat mungkin dengan transaksi bisnis, tetapi exception internal capture ditangani agar tidak membatalkan transaksi utama. Karena fail-open membuka kemungkinan event terlewat, reconciler menjadi komponen wajib, bukan opsional.

Status API dan UI selalu mengikuti hasil pendaftaran/pembayaran/verifikasi. Email diperlakukan sebagai side effect asynchronous.

### 3.2. Outbox versi production

Schema prototype diperluas secara backward-compatible dengan identitas event, versi template, `message_id`, provider ID, error class, lease owner/token/expiry, reconciliation metadata, dan status dead-letter. Dedupe key dibentuk deterministik dari:

```text
event_type + entity_id + business_transition/version + recipient_normalized + template_version
```

Payload dibuat minimum dan immutable untuk pekerjaan yang sudah dikirim. Riwayat attempt/replay dipisahkan bila diperlukan agar record utama tidak kehilangan audit.

### 3.3. Reconciler

Reconciler membaca perubahan `profiles` dan `payments` secara bertahap menggunakan watermark dengan overlap window. Ia membangun kembali event key yang seharusnya ada, lalu melakukan idempotent insert. Untuk status yang dapat berubah lebih dari sekali, identitas transisi harus memakai versi/waktu transisi yang stabil, bukan hanya status akhir.

Backfill awal berjalan dry-run, dibatasi rentang tanggal, lalu memerlukan persetujuan sebelum membuat email eligible.

### 3.4. Atomic claim dan lease

Dispatcher tidak memakai pola `SELECT pending` lalu `UPDATE` terpisah. RPC database memilih batch dengan `FOR UPDATE SKIP LOCKED`, mengubah status, menghasilkan lease token, dan mengembalikan row dalam satu transaksi. Persist outcome wajib memeriksa token agar worker lama tidak menimpa hasil worker baru.

### 3.5. Effectively-once pada Gmail

Pengiriman memakai raw MIME/Gmail API agar `Message-ID` deterministik dapat ditetapkan. Pada hasil sukses, provider ID dan waktu disimpan. Pada timeout ambigu, dispatcher tidak langsung resend; ia lebih dulu mencari pesan pada folder Sent berdasarkan Message-ID.

Ini menurunkan risiko duplikasi secara signifikan, tetapi tidak mengubah Gmail menjadi sistem exactly-once. Risiko residual dicatat pada runbook dan dimonitor.

### 3.6. Alert independen

Watchdog terpisah memonitor dead-letter, backlog, heartbeat, credential error, serta kegagalan reconciler. Alert ke `denmas.dyudhiantoro@gmail.com` wajib menggunakan provider/credential kedua. Menggunakan credential Gmail utama untuk alert tidak memenuhi requirement karena alert ikut gagal saat credential utama rusak atau quota habis.

Provider sekunder dipilih pada gate implementasi; kandidat dapat berupa Resend, Postmark, atau SMTP mailbox terpisah. Secret tetap berada di credential store.

## 4. Strategi Implementasi

### Fase 0 — Inventory dan keputusan

- Ekspor semua workflow production terkait ke repository.
- Bandingkan jalur manual, cash, QRIS, approval, dan reject.
- Verifikasi field actor pada setiap jalur.
- Kunci matriks penerima, sender utama, provider alert sekunder, retensi, dan SLO.

Gate: tidak ada migrasi/deployment sebelum source production dan keputusan kritis lengkap.

### Fase 1 — Fondasi data

- Rancang migration outbox v2 secara additive.
- Tambahkan attempt history, operational heartbeat, dan audit replay bila dipisah.
- Buat RPC atomic claim, renew/release lease, persist outcome, dan safe replay.
- Buat index, privilege, retention, serta query monitoring.

Gate: migration, RLS/privilege, konkurensi, dan rollback lulus di environment pengujian.

### Fase 2 — Capture dan recovery

- Implement fail-open capture untuk profil dan pembayaran.
- Lengkapi actor pada source workflow production.
- Implement reconciler dengan watermark, overlap, dry-run, dan batch limit.
- Jalankan backfill dry-run untuk mengukur volume dan gap tanpa mengirim email.

Gate: failure injection membuktikan mutasi bisnis tetap commit dan reconciler memulihkan event.

### Fase 3 — Dispatcher effectively-once

- Render template terversi dan aman.
- Kirim raw MIME dengan deterministic Message-ID.
- Implement Gmail Sent reconciliation pada hasil ambigu.
- Implement retry classification, exponential backoff+jitter, dead-letter, dan replay.

Gate: test dua worker, crash-window, timeout ambigu, dan duplicate insert lulus.

### Fase 4 — Monitoring dan alert

- Implement heartbeat, backlog/age metrics, anomaly capture, dan watchdog.
- Konfigurasikan provider alert sekunder.
- Terapkan grouping, cooldown, recovery notification, dan redaction.
- Validasi alert dengan credential Gmail utama sengaja dinonaktifkan di staging.

Gate: alert benar-benar diterima melalui jalur sekunder sebelum canary.

### Fase 5 — Staging, canary, dan production

- Jalankan UAT seluruh event dan role pada staging.
- Aktifkan capture production lebih dulu dengan dispatcher dalam mode hold/shadow.
- Audit jumlah event versus outbox dan penerima.
- Aktifkan pengiriman hanya untuk allowlist/canary.
- Naikkan bertahap ke seluruh recipient setelah metrik stabil.

Gate: owner menyetujui hasil UAT dan canary; tidak ada backlog/anomaly yang belum dijelaskan.

## 5. Strategi Deployment Aman

Urutan deployment yang disarankan:

1. Simpan export/checksum workflow production.
2. Terapkan schema/RPC additive yang belum dipakai.
3. Deploy reconciler, dispatcher, watchdog dalam keadaan non-sending.
4. Deploy fail-open capture.
5. Validasi event-to-outbox dalam mode hold.
6. Uji jalur alert sekunder.
7. Jalankan canary allowlist.
8. Aktifkan pengiriman penuh.
9. Aktifkan cleanup setelah masa observasi dan retensi disetujui.

Tidak ada backfill historis yang boleh otomatis dikirim saat deployment.

## 6. Rollback dan Pemulihan

- **Masalah dispatcher/template**: hentikan pengiriman, pertahankan capture dan outbox; perbaiki lalu replay aman.
- **Masalah capture**: nonaktifkan trigger/capture versi baru; transaksi bisnis tetap berjalan dan reconciler memulihkan gap setelah perbaikan.
- **Masalah schema/RPC**: arahkan worker kembali ke versi kompatibel; jangan drop kolom/tabel saat rollback awal.
- **Email salah penerima/isi**: stop dispatcher segera, simpan queue dalam hold, identifikasi scope melalui event key dan template version.
- **Credential utama gagal**: biarkan retry/backoff berjalan, watchdog mengirim alert melalui provider sekunder.

Rollback tidak boleh menghapus outbox, dead-letter, atau audit. Destructive rollback memerlukan prosedur dan persetujuan terpisah.

## 7. Observability dan Operasi

Metrik minimum:

- jumlah event eligible versus outbox tercipta;
- pending/retry/processing/sent/dead-letter per event type;
- umur pending tertua dan latency end-to-end;
- error rate serta klasifikasi auth/quota/network/recipient/template;
- stale lease dan hasil Gmail reconciliation;
- heartbeat dispatcher, reconciler, cleanup, dan watchdog;
- jumlah alert open/recovered serta status delivery alert.

Runbook wajib mencakup pengecekan backlog, rotasi credential, safe replay, penanganan Gmail quota, data correction, penghentian dispatcher, dan pemulihan setelah outage.

## 8. Keamanan, Privasi, dan Retensi

- Service role hanya digunakan pada worker backend terpercaya.
- RPC dan tabel tidak diberi akses ke client biasa.
- Email/payload/log/alert memakai minimisasi data dan redaction.
- Template melakukan HTML escaping dan memakai portal URL dari konfigurasi.
- Credential utama dan sekunder tidak dicatat di source atau execution output.
- Cleanup awal direkomendasikan: sent 30 hari, dead-letter 90 hari; final sesuai gate requirement.
- Audit ringkas tanpa body email dapat dipertahankan lebih lama bila diperlukan untuk operasi.

## 9. Test dan UAT Minimum

- Registrasi sukses dengan email utama tersedia/tidak tersedia.
- Manual/cash payment oleh warga, Admin, Bendahara, dan Pengurus sesuai capability.
- QRIS create/status/webhook termasuk callback berulang.
- Approval/reject user dan payment, termasuk update metadata tanpa transisi.
- Alamat email invalid, provider 4xx/5xx, auth gagal, quota, dan network timeout.
- Dua dispatcher paralel, lease expiry, worker crash sebelum/sesudah Gmail accept.
- Reconciler overlap dan backfill dry-run.
- Alert independen ketika Gmail utama sengaja gagal.
- Replay dead-letter, hold/release queue, dan cleanup retensi.
- Verifikasi tidak ada credential/PII berlebihan pada log dan alert.

## 10. Definition of Done

Implementasi dinyatakan siap production apabila:

1. Seluruh requirement dan acceptance criteria disetujui serta lulus.
2. Workflow production terkait telah diekspor, dibandingkan, dan terversi.
3. Mutasi bisnis tetap sukses pada semua failure injection email.
4. Dedupe, atomic claim, crash-window reconciliation, dead-letter, dan replay lulus.
5. Alert independen diterima di `denmas.dyudhiantoro@gmail.com` saat Gmail utama gagal.
6. Security review, retensi, observability, runbook, rollback drill, dan UAT selesai.
7. Canary production stabil dan mendapat persetujuan owner sebelum rollout penuh.
