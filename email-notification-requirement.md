# Requirement Notifikasi Email Transaksional

> Sistem: Portal Warga Palm Village
> Status: Draft untuk review
> Tanggal: 5 Agustus 2026
> Ruang lingkup: pendaftaran pengguna, pencatatan dan verifikasi IPL, serta alert operasional email

## 1. Tujuan

Sistem wajib mengirim notifikasi email atas aktivitas penting tanpa membuat proses utama gagal ketika layanan email, credential, workflow, atau jaringan sedang bermasalah.

Tujuan utama:

1. Pendaftaran pengguna dan mutasi pembayaran IPL tetap sukses sesuai hasil transaksi database, terlepas dari hasil pengiriman email.
2. Satu event bisnis menghasilkan paling banyak satu email logis per penerima, dengan mekanisme pemulihan untuk kegagalan sementara dan hasil kirim yang ambigu.
3. Kegagalan terminal atau gangguan sistem email memberi alert ke `denmas.dyudhiantoro@gmail.com` melalui jalur yang independen dari pengirim utama.
4. Seluruh workflow production yang memproduksi event terkait tersedia dan terversi di repository sebelum perubahan dipromosikan.

## 2. Istilah dan Batas Jaminan

- **Event bisnis**: perubahan data yang sah, misalnya profil baru, pembayaran baru, atau perubahan status verifikasi.
- **Outbox**: antrean database persisten yang menyimpan pekerjaan email.
- **Deduplikasi logis**: kombinasi event bisnis, versi/transisi, template, dan penerima hanya boleh mempunyai satu record outbox aktif.
- **Effectively-once**: sistem mencegah duplikasi pada sisi aplikasi dan memeriksa hasil kirim yang ambigu sebelum retry.
- **Exactly-once absolut** tidak dapat dijamin end-to-end karena Gmail merupakan sistem eksternal dan proses dapat terhenti sesudah Gmail menerima pesan tetapi sebelum database menyimpan hasilnya.
- **Fail-open capture**: kegagalan membuat pekerjaan email tidak membatalkan transaksi bisnis. Event yang terlewat wajib dipulihkan oleh reconciler.

## 3. Aktor dan Sistem

- **Warga/pengguna**: pendaftar, pemilik tagihan, atau pencatat pembayaran.
- **Admin**: memverifikasi pengguna dan dapat mencatat atau memverifikasi pembayaran.
- **Bendahara**: dapat mencatat atau memverifikasi pembayaran.
- **Pengurus**: dapat mencatat pembayaran bila capability production memang mengizinkan.
- **Supabase**: sumber kebenaran event bisnis dan penyimpanan outbox.
- **n8n dispatcher**: mengambil, membentuk, mengirim, dan mencatat hasil email.
- **Gmail utama**: pengirim notifikasi transaksional Portal Warga.
- **Provider alert sekunder**: credential/provider independen untuk alert operasional.

## 4. Matriks Event dan Penerima

Matriks berikut adalah baseline yang harus dikunci pada gate desain. Bila satu orang masuk melalui beberapa kategori, sistem hanya mengirim satu email untuk event dan template yang sama.

| Event | Penerima wajib | Tujuan |
| --- | --- | --- |
| Pengguna baru mendaftar | Pengguna baru | Konfirmasi pendaftaran diterima |
| Pengguna baru mendaftar | Seluruh Admin aktif dan approved | Tindakan verifikasi diperlukan |
| Pembayaran IPL dicatat oleh warga/admin/bendahara/pengurus | Actor pencatat dan warga pemilik tagihan | Konfirmasi pencatatan; dedupe bila orangnya sama |
| Pembayaran IPL menunggu verifikasi | Seluruh Admin dan Bendahara aktif dan approved | Tindakan verifikasi diperlukan |
| Verifikasi pengguna disetujui/ditolak | Pengguna yang diverifikasi dan actor Admin | Hasil verifikasi dan konfirmasi tindakan |
| Verifikasi pembayaran disetujui/ditolak | Warga pemilik tagihan dan actor Admin/Bendahara | Hasil verifikasi dan konfirmasi tindakan |
| Kegagalan terminal/insiden pipeline | `denmas.dyudhiantoro@gmail.com` | Tindakan operasional |

Aturan penerima:

- Email kosong/tidak valid tidak boleh menghentikan transaksi bisnis; kasusnya dicatat sebagai anomaly.
- Penerima harus disnapshot saat outbox dibuat agar perubahan email setelah event tidak mengubah tujuan historis.
- Actor berasal dari identitas server-side yang tervalidasi, bukan field bebas dari frontend.
- Event otomatis QRIS memakai warga pemilik tagihan sebagai penerima konfirmasi; tidak ada actor manusia palsu.
- Daftar Admin/Bendahara hanya mencakup profil aktif, approved, dan memiliki email valid.
- Broadcast ke seluruh Admin/Bendahara harus dikonfirmasi pada gate penerima untuk mengendalikan volume dan notification fatigue.

## 5. Kebutuhan Fungsional

### REQ-EMAIL-001 — Pendaftaran pengguna baru

- Given profil baru berhasil tersimpan.
- When transaksi pendaftaran commit.
- Then sistem membuat notifikasi konfirmasi untuk pengguna baru dan notifikasi tindakan untuk setiap Admin yang memenuhi syarat.
- And email menjelaskan status awal serta tidak memuat credential atau token autentikasi.

### REQ-EMAIL-002 — Pencatatan pembayaran IPL

- Given pembayaran IPL berhasil dibuat melalui warga, Admin, Bendahara, Pengurus, cash/manual, atau QRIS.
- When record pembayaran menjadi sumber kebenaran yang valid.
- Then sistem membuat notifikasi kepada actor pencatat dan warga pemilik tagihan sesuai matriks penerima.
- And bila pembayaran perlu verifikasi, sistem membuat notifikasi tindakan untuk Admin/Bendahara.
- And satu pembayaran tidak menghasilkan email ulang hanya karena update metadata yang tidak relevan.

### REQ-EMAIL-003 — Hasil verifikasi pengguna

- When status approval pengguna berubah ke status terminal yang didukung, minimal `approved` atau `rejected`.
- Then pengguna menerima hasil dan actor Admin menerima konfirmasi tindakan.
- And perubahan field lain tanpa transisi status tidak menghasilkan email verifikasi.

### REQ-EMAIL-004 — Hasil verifikasi pembayaran IPL

- When status pembayaran berubah ke status terminal yang didukung, minimal `completed` atau `rejected`.
- Then warga pemilik tagihan dan actor Admin/Bendahara menerima notifikasi hasil.
- And email memuat periode, nominal, status, waktu, dan catatan verifikasi yang aman ditampilkan.

### REQ-EMAIL-005 — Transaksi bisnis tidak bergantung pada email

- Exception saat capture/enqueue tidak boleh me-rollback pendaftaran, pencatatan pembayaran, atau verifikasi yang valid.
- API harus mengembalikan hasil berdasarkan transaksi bisnis, bukan hasil kirim email.
- UI tidak boleh menampilkan transaksi gagal hanya karena email gagal.
- Kegagalan capture harus menghasilkan telemetry yang dapat ditemukan reconciler/watchdog.

### REQ-EMAIL-006 — Outbox persisten dan deduplikasi

- Setiap pekerjaan mempunyai `event_key`, `recipient`, `template/version`, payload minimal, status, attempt, waktu tersedia, dan audit waktu.
- Unique constraint mencegah dua pekerjaan logis untuk kombinasi event, penerima, dan template/version yang sama.
- Enqueue dan replay bersifat idempotent.
- Perubahan template tidak boleh secara tidak sengaja mengirim ulang event historis.

### REQ-EMAIL-007 — Pemulihan event yang terlewat

- Reconciler berkala membandingkan event eligible pada `profiles` dan `payments` dengan outbox.
- Event tanpa pekerjaan outbox dibuat ulang memakai dedupe key yang sama.
- Reconciler memiliki checkpoint/watermark, overlap window, pagination, dan batas batch.
- Backfill awal harus mempunyai rentang waktu eksplisit dan mode dry-run agar tidak membanjiri penerima.

### REQ-EMAIL-008 — Claim dan konkurensi dispatcher

- Pengambilan pekerjaan menggunakan operasi database atomik, misalnya RPC dengan `FOR UPDATE SKIP LOCKED`.
- Claim mempunyai `lease_token`, `claimed_by`, dan batas kedaluwarsa.
- Hanya worker pemilik lease aktif yang boleh menyimpan hasil.
- Banyak worker tidak boleh memproses pekerjaan yang sama secara bersamaan.

### REQ-EMAIL-009 — Pengiriman effectively-once

- Setiap email memakai `Message-ID` RFC yang deterministik berdasarkan identitas pekerjaan dan domain yang dikontrol.
- Provider message ID, Message-ID aplikasi, waktu kirim, dan hasil provider disimpan untuk audit.
- Sebelum retry atas timeout atau hasil ambigu, dispatcher mencari pesan pada Gmail Sent menggunakan Message-ID deterministik.
- Bila pesan ditemukan, pekerjaan ditandai `sent` tanpa mengirim ulang.
- Bila pencarian tidak meyakinkan, retry mengikuti kebijakan; kemungkinan duplikasi residual didokumentasikan dan dimonitor.

### REQ-EMAIL-010 — Retry, dead-letter, dan replay

- Kegagalan sementara memakai exponential backoff dengan jitter dan jumlah percobaan terbatas.
- Error permanen seperti alamat ditolak dapat langsung masuk dead-letter sesuai klasifikasi.
- Setelah batas retry, pekerjaan berstatus terminal `dead_letter` dan tidak diproses otomatis lagi.
- Replay hanya dapat dilakukan operator berwenang, wajib menyimpan alasan dan actor, serta tetap memakai deduplikasi/reconciliation.
- Replay tidak boleh mengubah record bisnis sumber.

### REQ-EMAIL-011 — Alert operasional independen

- Alert dikirim ke `denmas.dyudhiantoro@gmail.com` ketika ada dead-letter, credential Gmail invalid, dispatcher tidak heartbeat, backlog melewati ambang, reconciler gagal, atau alert delivery gagal.
- Alert memakai provider atau credential yang tidak bergantung pada credential Gmail utama.
- Alert berisi environment, kategori, jumlah terdampak, ID referensi, error yang telah disanitasi, first/last seen, dan petunjuk tindakan.
- Alert tidak memuat JWT, API key, bukti pembayaran, atau payload PII lengkap.
- Alert menerapkan grouping, cooldown, dan recovery notification untuk mencegah alert storm.

### REQ-EMAIL-012 — Monitoring dan status operasional

- Dispatcher, reconciler, cleanup, dan watchdog menyimpan heartbeat serta hasil eksekusi.
- Dashboard/query operasional menampilkan pending, processing, retry, sent, dead-letter, umur antrean tertua, dan tingkat kegagalan.
- Claim kedaluwarsa dipulihkan dengan aman, tanpa blind resend bila hasil Gmail sebelumnya ambigu.
- Correlation ID menghubungkan event bisnis, outbox, eksekusi workflow, dan provider message.

### REQ-EMAIL-013 — Retensi dan privasi

- Payload hanya menyimpan field yang diperlukan untuk template dan troubleshooting.
- Nilai sensitif serta credential tidak disimpan dalam payload atau log.
- Rekomendasi awal: record `sent` dipurge/anonymize setelah 30 hari dan dead-letter setelah 90 hari; angka final dikunci sebelum production.
- Cleanup berjalan berbatas batch, dapat diaudit, dan tidak menghapus record yang sedang diproses.
- Subject/body email mengikuti prinsip data minimum dan escaping HTML.

### REQ-EMAIL-014 — Konfigurasi dan credential

- Sender utama, reply-to, portal URL, timezone, batch size, retry, retention, dan alert threshold berasal dari konfigurasi environment.
- Credential hanya disimpan pada credential store n8n/secret manager dan tidak masuk source control.
- Sender utama ditetapkan `palmvillage.paguyuban@gmail.com` melalui credential `Gmail account PalmVillage.Paguyuban`. Alamat akun dan izin Gmail Raw API tetap harus diverifikasi di n8n sebelum aktivasi.
- Provider/credential alert sekunder wajib dipilih dan diuji sebelum go-live.

### REQ-EMAIL-015 — Source of truth workflow

- Workflow production yang terkait registrasi, approval/reject user, manual/cash/QRIS payment, dan approval/reject payment harus diekspor ke repository.
- Source repository dan workflow production mempunyai versi/checksum yang dapat dibandingkan.
- Field actor seperti `created_by`, `recorded_by`, `verified_by`, `approved_by`, atau `rejected_by` harus dipetakan dan diuji pada setiap jalur.
- Tidak ada perubahan production yang hanya tersimpan di editor n8n tanpa source terversi.

## 6. Kebutuhan Non-Fungsional

### Keandalan

- Target awal: minimal 99% pekerjaan eligible masuk outbox dalam 5 menit, termasuk hasil reconciler.
- Target awal: minimal 95% email non-error-permanen berstatus sent dalam 5 menit dan 99% dalam 30 menit.
- Tidak ada kehilangan event permanen akibat kegagalan capture tunggal.
- Restart atau overlapping execution tidak boleh menyebabkan concurrent processing atas pekerjaan yang sama.

### Performa

- Capture normal menambah overhead minimum pada transaksi bisnis dan tidak melakukan panggilan jaringan.
- Dispatcher dan reconciler memakai pagination, index, serta batch yang dapat dikonfigurasi.
- Backlog tidak boleh menyebabkan scan tabel penuh pada setiap menit.

### Keamanan

- Tabel dan RPC outbox tidak dapat diakses `anon` atau `authenticated` biasa.
- Fungsi `security definer` memakai `search_path` eksplisit dan privilege minimum.
- Input template di-escape; URL tidak dibangun dari payload yang tidak tepercaya.
- Log dan alert menerapkan redaction untuk email bila detail penuh tidak diperlukan.

### Auditabilitas

- Riwayat status, attempt, error class, claim, reconciliation, replay, dan purge dapat ditelusuri.
- Waktu disimpan dalam UTC dan ditampilkan sebagai WIB untuk pengguna.
- Metrik tidak bergantung hanya pada execution history n8n yang dapat terhapus.

## 7. Acceptance Criteria Utama

### AC-EMAIL-01 — Fail-open

1. Simulasikan enqueue gagal.
2. Pendaftaran/pembayaran/verifikasi tetap commit dan API sukses sesuai transaksi bisnis.
3. Reconciler menemukan event yang hilang dan membuat pekerjaan outbox setelah komponen pulih.

### AC-EMAIL-02 — Deduplikasi dan konkurensi

1. Jalankan dua dispatcher dan dua reconciler bersamaan pada event yang sama.
2. Hanya satu outbox logis per penerima/template yang tersedia.
3. Hanya satu lease sah dan tidak ada pengiriman paralel untuk pekerjaan yang sama.

### AC-EMAIL-03 — Timeout ambigu

1. Simulasikan Gmail menerima pesan tetapi respons worker terputus sebelum status tersimpan.
2. Retry mencari Message-ID pada Sent.
3. Pesan ditemukan dan outbox ditandai sent tanpa kirim ulang.
4. Batas kasus yang tidak dapat dibuktikan dicatat sebagai risiko residual.

### AC-EMAIL-04 — Alert independen

1. Nonaktifkan credential Gmail utama sampai pekerjaan dead-letter.
2. Alert diterima `denmas.dyudhiantoro@gmail.com` melalui credential/provider sekunder.
3. Alert terkelompok, tidak membocorkan rahasia, dan recovery notification dikirim setelah pulih.

### AC-EMAIL-05 — Matriks penerima

1. Jalankan registrasi, manual payment oleh setiap role yang diizinkan, QRIS, approval/reject user, dan approval/reject payment.
2. Penerima sesuai matriks dan penerima yang sama tidak mendapat email ganda untuk event/template sama.
3. Update metadata tanpa transisi bisnis tidak menghasilkan email.

### AC-EMAIL-06 — Operasional dan retensi

1. Dashboard menunjukkan antrean, umur tertua, retry, dead-letter, dan heartbeat yang akurat.
2. Replay berizin berhasil tanpa mengubah data bisnis dan memiliki audit.
3. Cleanup menghapus/anonymize data melewati retensi tanpa menyentuh pekerjaan aktif.

## 8. Di Luar Ruang Lingkup

- Jaminan exactly-once absolut dari provider email eksternal.
- Email marketing, newsletter, atau blast non-transaksional.
- Notifikasi WhatsApp/SMS/push kepada warga.
- Perubahan hak akses bisnis pendaftaran atau pembayaran.
- Menjadikan email sebagai syarat keberhasilan transaksi.

## 9. Gate Keputusan Sebelum Implementasi

- [ ] Owner menyetujui matriks penerima, terutama broadcast Admin/Bendahara.
- [ ] Alamat sender utama aktual diverifikasi.
- [ ] Provider dan credential alert sekunder dipilih.
- [ ] Retensi 30/90 hari atau nilai penggantinya disetujui.
- [ ] SLO, retry maksimum, batch, dan ambang alert disetujui.
- [ ] Rentang backfill awal disetujui agar tidak mengirim email historis tanpa sengaja.
