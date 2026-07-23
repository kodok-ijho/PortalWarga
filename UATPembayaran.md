# UAT Pembayaran Transfer Warga

Dokumen ini berisi skenario UAT end-to-end untuk pembayaran IPL warga menggunakan metode Transfer Bank dengan upload bukti bayar, mulai dari UI warga, API n8n, upload bukti ke Google Drive, penyimpanan metadata di Supabase, sampai verifikasi staf dengan hasil diterima atau ditolak.

## Ruang Lingkup

- Warga memilih tagihan IPL milik unitnya sendiri dari halaman Matriks Pembayaran.
- Warga mengirim pembayaran metode `bank_transfer` dengan bukti JPG/PNG.
- Frontend mengirim `multipart/form-data` ke n8n endpoint `/payments/manual/submit`.
- n8n memvalidasi JWT, role, kepemilikan tagihan, status tagihan, file upload, dan nominal.
- n8n mengunggah bukti ke Google Drive folder privat, lalu mengatur permission file menjadi public-by-link.
- n8n menyimpan payment pending dan metadata file Drive ke Supabase.
- Bendahara/Admin membuka halaman Verifikasi Pembayaran, melihat bukti, lalu approve atau reject.
- Sistem memperbarui status `payments`, `ipl_bills`, dan audit log sesuai hasil verifikasi.

Di luar ruang lingkup: QRIS, pembayaran tunai, pencatatan manual oleh bendahara untuk warga offline, dan pengeluaran.

## Laporan Eksekusi UAT - 23 Juli 2026

Status keseluruhan: **PASS**. Seluruh skenario pembayaran transfer pada matriks ini sudah dieksekusi dan lulus, termasuk skenario positif, negatif, timeout, privacy, dan cleanup file Drive. QRIS tetap tersedia di backend tetapi hanya disembunyikan dari UI warga dan staf.

### Ringkasan Hasil

| Layer | Hasil | Bukti UAT |
| --- | --- | --- |
| Build frontend | PASS | `npm run build` berhasil, 697 modul dan service worker PWA terbentuk |
| UI warga | PASS | Playwright: QRIS tidak tampil, Transfer Bank tampil, validasi file wajib/MIME/2 MB, kompresi, multi-bulan, alasan reject, bayar ulang, timeout, dan tanpa console error |
| API tanpa token | PASS | Submit, approve, reject, dan matriks berhenti di `401 UNAUTHORIZED` sebelum Drive/DB |
| API warga | PASS | Matriks `200` dengan 53 unit; submit PNG/JPEG `200`; file kosong `400`; unit lain `403`; QRIS manipulasi `400`; bill paid `400`; nominal salah `400`; duplicate pending `409` |
| API staf | PASS | Admin live approve dan reject masing-masing `200`; role warga ditolak `403` pada approve/reject |
| Supabase | PASS | Trigger submit/approve/reject, nominal server-side, dan unique live payment per bill lulus pengujian transaksional |
| Google Drive read | PASS | Dua file retest baru dapat dibuka tanpa token aplikasi: `HTTP 200`, masing-masing `image/png` dan `image/jpeg` |
| Google Drive upload baru | PASS | Execution submit `243523` dan `243524` sukses mengunggah PNG/JPEG baru dan menyimpan file id/URL/metadata di database |
| Privasi folder Drive | PASS | URL parent folder tanpa sesi dialihkan ke halaman login Google dan tidak mengekspos kedua file retest; node share memakai `reader`, `anyone`, `allowFileDiscovery=false` hanya pada file |
| Fail-safe upload | PASS setelah perbaikan | Upload gagal mengembalikan JSON `ok:false`, code `DRIVE_UPLOAD_FAILED`; tidak ada payment/bill baru |
| Cleanup failure | PASS | Share failure execution `243560` dan DB failure execution `243562` mengembalikan error JSON dan menghapus file Drive permanen; URL file setelah cleanup `404` |
| Integritas akhir database | PASS | Lima pemeriksaan anomali bernilai `0`: metadata Drive pending, linkage bill, duplicate live payment, completed-bill, dan rejected-link |

### Skenario yang Dieksekusi Langsung

| Skenario | Hasil | Catatan |
| --- | --- | --- |
| PAY-POS-009, PAY-POS-010 | PASS | Approve API live mengubah payment ke `completed`, bill ke `paid`, verifier/note/audit terisi |
| PAY-POS-011 | PASS | Reject API live mengubah payment ke `rejected`, alasan tersimpan, bill kembali `pending`, `payment_id=null`, audit terisi |
| PAY-POS-014 | PASS | Link bukti pilot existing dapat dibuka sebagai gambar tanpa token aplikasi |
| PAY-POS-001, PAY-POS-004 | PASS retest | Submit PNG dengan catatan dan JPEG tanpa catatan menghasilkan payment `pending_verification`, linkage bill, serta metadata Drive lengkap |
| PAY-POS-006, PAY-POS-007, PAY-POS-008 | PASS retest | `/payments/list` memuat kedua payment beserta proof URL saat pending; file PNG/JPEG dapat dibaca langsung dari Drive |
| PAY-POS-009, PAY-POS-010, PAY-POS-011 | PASS retest | Admin menerima payment PNG dan menolak payment JPEG; status payment, bill, verifier, alasan, dan audit konsisten |
| PAY-POS-013 | PASS retest | Parent folder tetap meminta login dan tidak mengekspos file; permission publik diterapkan pada file dengan discovery dimatikan |
| PAY-POS-015 | PASS retest | Matrix execution `243529` (`year=2025`, tahun buku Juli-Juni) menampilkan Januari `paid` dan Februari `overdue` setelah reject |
| PAY-POS-002 | PASS | Submit bill overdue periode `2026-05` execution `243533`; `amount=140000`, `late_fee=7000`, payment tersimpan `147000` dan `pending_verification` |
| PAY-POS-003 | PASS | UI memilih dua bulan berurutan dan membuka modal `2 tagihan IPL`; submit API berurutan execution `243531`/`243532` menghasilkan dua payment Drive terpisah |
| PAY-POS-005 | PASS | Playwright mengompresi PNG `5.823.888` byte menjadi JPEG `84.266` byte, dimensi `1204x940`, MIME `image/jpeg` |
| PAY-POS-012 | PASS | UI warga menampilkan alasan reject dan tombol `Pilih Tagihan untuk Bayar Ulang`; matrix hanya mengekspos payment unit sendiri |
| PAY-NEG-002 | PASS | UI dan API menolak submit tanpa bukti |
| PAY-NEG-003, PAY-NEG-005 | PASS | UI/API menolak `text/plain` dengan `INVALID_FILE_TYPE` |
| PAY-NEG-004 | PASS | UI/API menolak PNG 5,82 MB dengan `FILE_TOO_LARGE` |
| PAY-NEG-006 | PASS | Warga unit 13 ditolak saat memakai bill unit 31, `403 FORBIDDEN` |
| PAY-NEG-008 | PASS | Endpoint protected tanpa token mengembalikan `401` |
| PAY-NEG-009 | PASS | Manipulasi `method=qris` ditolak `400`; QRIS tidak muncul di UI warga |
| PAY-NEG-010 | PASS | Bill berstatus paid ditolak `ALREADY_PAID` |
| PAY-NEG-011 | PASS | Bill dengan `payment_id` pending ditolak `409 PAYMENT_ALREADY_SUBMITTED` sebelum Drive |
| PAY-NEG-013 | PASS | Nominal kurang ditolak `PAYMENT_AMOUNT_MISMATCH` |
| PAY-NEG-016, PAY-NEG-017 | PASS fail-safe dan operasional | Credential invalid sebelumnya gagal aman tanpa menulis DB; setelah reconnect, submit positif lulus tanpa mengubah kontrak error |
| PAY-NEG-015 | PASS | Playwright mensimulasikan API stall; client membatalkan request dengan code `API_TIMEOUT` tanpa menampilkan sukses palsu |
| PAY-NEG-018 | PASS | Execution `243560`: permission invalid menghasilkan `DRIVE_PERMISSION_FAILED`, cleanup sukses permanen, URL file `404`, tidak ada payment baru |
| PAY-NEG-019 | PASS | Execution `243562`: insert payment invalid menghasilkan `PAYMENT_NOT_CREATED`, cleanup sukses permanen, URL file `404`, tidak ada payment aktif |
| PAY-NEG-020 | PASS | Trigger database menjamin payment dan bill berubah dalam transaksi yang sama |
| PAY-NEG-023, PAY-NEG-024 | PASS | Token warga ditolak `403 FORBIDDEN_ROLE` untuk approve/reject |

Seluruh skenario pada matriks positif dan negatif sudah memiliki hasil PASS. Data uji pilot boleh di-reset kemudian sesuai prosedur reset data, dengan memperhatikan file Drive yang masih menjadi bukti untuk payment yang dipertahankan.

### Bukti Retest Credential Google Drive

| Jalur | Submit/Drive | Verifikasi | Hasil Akhir |
| --- | --- | --- | --- |
| Approve PNG | Payment `934db824-5506-46cb-a8cc-b13f25873823`; bill `1661524a-b404-48e1-a87a-25a67d501c8e`; Drive file `14Yj0Il6PP63-PabB6erg4Ia1WqmLGXom`; `98.816` byte; `image/png` | Approve execution `243527`; request id `uat-drive-retest-approve-20260722` | Payment `completed`; bill Januari `paid`; `payment_id` tetap terhubung |
| Reject JPEG | Payment `4bd571b5-4549-4ad6-af9c-394c91410697`; bill `8855f457-a118-4b2f-9918-b51083165a85`; Drive file `1Bxe4-MZxZhsfHYEDztFsdEHSHzABQ4wn`; `330.752` byte; `image/jpeg`; catatan submit kosong | Reject execution `243526`; request id `uat-drive-retest-reject-final-20260722` | Payment `rejected`; alasan tersimpan; bill Februari `overdue`; `payment_id=null` |
| Refresh matrix | Execution `243529`; request id `uat-drive-retest-matrix-fy2025-20260722` | API `200`, unit `CB1/8` | Januari `paid`; Februari `overdue` |
| Overdue + late fee | Payment `6dfe23e7-6787-4ac0-a4c2-045dd5d81cd4`; bill `5e995459-cdb5-492d-91b4-3727a08a5736`; Drive file `1zALQjJ6k0aeDvwa7-1kqWHWmoOAfCgVu` | Submit execution `243533`; request id `uat-late-fee-20260722` | Payment `147000` (`140000+7000`), `pending_verification` |
| Multi-month | Payments `2431273a-e28c-43cc-a2b5-1afaaea08d5d` dan `962e066e-02b3-44a5-ba91-7643a09b08b2` | Submit executions `243531` dan `243532`; request id `uat-multimonth-july/august-20260722` | Saat submit, dua payment pending memiliki file Drive dan linkage bill; keduanya kemudian dipakai sebagai fixture failure injection, direject, linkage bill dilepas, dan file Drive dihapus permanen |
| Failure cleanup | File `1wzdZCKHBinjnSasfC_kXZrHNE7-pmFpJ` dan `1_hm5xtyS4miiOL3P43ANRVEk0cjrutr5` | Manual executions `243560` dan `243562` | Error terstruktur; cleanup permanen; kedua URL sesudahnya `404` |

Audit log mencatat empat event yang saling terkait: dua `payment.manual_submit`, satu `payment.manual_approve`, dan satu `payment.manual_reject`, seluruhnya dengan payment id dan request id yang dapat ditelusuri. Bukti yang masih dipertahankan adalah payment approve, payment reject, dan payment overdue dengan late fee; dua fixture multi-month untuk failure injection sudah dibersihkan bersama file Drive-nya secara permanen.

### Temuan, Penyebab, dan Solusi

| Temuan | Penyebab | Dampak | Solusi / Status |
| --- | --- | --- | --- |
| Upload Drive sempat gagal | Refresh token credential n8n tidak lagi valid | Submit positif berhenti sebelum payment dibuat | **Selesai**: credential dihubungkan ulang; dua upload baru dan dua pembacaan file lulus |
| API sebelumnya memberi `200` tanpa body saat Drive gagal | Node Google Drive menghentikan workflow sebelum response node | Frontend hanya menampilkan `Respons API tidak valid` | Workflow submit sudah diperbaiki: retry 3 kali, validasi upload/share, lalu respons JSON `DRIVE_UPLOAD_FAILED` / `DRIVE_PERMISSION_FAILED` |
| Data lama pernah memiliki beberapa payment untuk satu bill | Sebelum migration integrity, bill belum dikunci secara transaksional | Bukti dan payment duplikat pernah terbentuk | Migration `payment_verification_integrity` aktif; unique index dan trigger diuji PASS, tidak ada duplicate live saat ini |
| Dokumen awal meminta `ipl_bills.status=pending_verification` | Enum `bill_status` tidak memiliki nilai tersebut | Ekspektasi UAT tidak sama dengan desain produksi | Kontrak diperjelas: `payments.status=pending_verification`, `ipl_bills.payment_id` mengunci bill, API matriks menurunkan status tampilan dari payment |
| Warga tidak menerima alasan reject | Matrix awal hanya mengirim status bill, sedangkan `/payments/list` dibatasi untuk staf | Warga melihat overdue tetapi tidak dapat melihat alasan reject | Matrix sekarang mengirim payment terbatas untuk unit warga sendiri; UI menampilkan alasan dan aksi bayar ulang |
| Cleanup awal hanya memindahkan file ke Trash | File Drive di Trash masih dapat diakses melalui link publik | File gagal berpotensi tetap terbuka | Cleanup node memakai credential aktif dan `deletePermanently=true`; verifikasi URL menghasilkan `404` |
| Credential cleanup berbeda dari credential upload | Node baru otomatis memakai credential lama yang disconnected | Failure injection awal tidak dapat menghapus file | Kedua cleanup node dipasang ke `Palm Village Google Drive account` yang aktif |

### Rencana Lanjutan

1. Reset data dan file uji sesuai prosedur pilot bila data UAT tidak diperlukan lagi.
2. Aktifkan Gmail API pada Google Cloud project `216220258218`, lalu ulangi skenario email gagal dan email pemulihan.
3. Pertahankan failure injection di workflow test/staging, bukan sebagai jalur produksi yang dapat dipanggil pengguna.

## UAT Fitur Smoke Test Berkala - 23 Juli 2026

Status fitur: **PASS UNTUK CREDENTIAL EMAIL; FORCED FAILURE/RECOVERY PRODUKSI MASIH MENUNGGU SESI ADMIN LIVE**. Konfigurasi UI, API, scheduler, pemeriksaan Supabase/Google Drive, cleanup file, penyimpanan status, deteksi kegagalan, pembatasan role, dan pengiriman Gmail API sudah terpasang. Workflow produksi memakai credential OAuth `EnIxToznQ10K4jXR`.

### Konfigurasi Produksi

| Komponen | Nilai |
| --- | --- |
| Workflow n8n | `PV Monitoring - Payment Smoke Test` (`IYTejdLNw2Fyp0Fk`) |
| Webhook manual | `/portal-v1/monitoring/payment-smoke/run` |
| Scheduler | Setiap jam pada menit ke-5; workflow membaca konfigurasi database untuk menentukan apakah sudah jatuh tempo |
| Frekuensi UI | Setiap 6 jam, harian, atau setiap Senin |
| Timezone | `Asia/Jakarta` |
| Email notifikasi | `dyudhiantoro@gmail.com` |
| Folder Drive uji | Folder monitoring terpisah; file dihapus permanen setelah upload dan share diperiksa |
| Penyimpanan konfigurasi | `ipl_settings.key = monitoring.payment_smoke_config` |
| Penyimpanan status | `ipl_settings.key = monitoring.payment_smoke_status` |
| Notifikasi | Kegagalan pertama, pengulangan setelah 24 jam bila masih gagal, dan email pemulihan opsional |

### Hasil Skenario Monitoring

| ID | Skenario | Hasil | Bukti / Catatan |
| --- | --- | --- | --- |
| MON-POS-001 | Admin membuka panel monitoring | PASS | Browser UAT menampilkan panel, toggle, frekuensi, jam, email, recovery, Jalankan Sekarang, status, dan rincian pemeriksaan |
| MON-POS-002 | Admin menyimpan jadwal dan email valid | PASS | Browser UAT memverifikasi payload `smoke_test` dan refresh konfigurasi |
| MON-POS-003 | Admin menjalankan smoke test manual | PASS | UI menampilkan `Terakhir PASS`, durasi, dan empat hasil dependency |
| MON-POS-004 | Upload, share, cleanup permanen, dan persist status | PASS | Execution `243570` dan `243573`; file uji berhasil diunggah, diberi permission, dihapus permanen, lalu status disimpan |
| MON-POS-005 | Tampilan mobile | PASS | Playwright viewport `390x844`, seluruh kontrol dapat digunakan dan tidak ada overflow horizontal |
| MON-NEG-001 | Email konfigurasi tidak valid | PASS | UI menolak sebelum request update dikirim |
| MON-NEG-002 | Role non-admin membuka pengaturan | PASS | Panel tidak tampil untuk pengurus; warga diarahkan keluar dari halaman pengaturan |
| MON-NEG-003 | Dependency Drive gagal | PASS | Execution `243572` menghasilkan status FAIL dan masuk ke cabang notifikasi |
| MON-NEG-004 | SMTP gagal mengirim | FAIL / BLOCKED | Execution terisolasi `243574`, `243576`, dan final retest `243578`: `534-5.7.9 Application-specific password required`; email tidak terkirim |
| MON-NEG-006 | Gmail OAuth gagal mengirim sebelum API diaktifkan | PASS resolved | Diagnostic `243580` mengidentifikasi `SERVICE_DISABLED`; setelah API diaktifkan, retest `243581` berhasil |
| MON-POS-006 | Credential Gmail API dapat mengirim email | PASS | Execution `243581`; message ID `19f8f9b772c85f4d`; Gmail mengembalikan label `SENT` |
| MON-POS-007 | Email alert failure dari workflow produksi diterima | PENDING LIVE UAT | Credential sudah PASS, tetapi forced failure pada workflow produksi memerlukan sesi Admin live untuk memanggil webhook protected |
| MON-POS-008 | Email recovery dari workflow produksi diterima setelah kembali PASS | PENDING LIVE UAT | Dijalankan bersama MON-POS-007 setelah sesi Admin tersedia |
| MON-NEG-005 | Anti-spam kegagalan berulang | PASS validasi workflow | Alert hanya pada kegagalan pertama atau setelah 24 jam; belum ada pengiriman live karena credential email masih ditolak |

### Penyebab dan Solusi Email

Percobaan awal melalui `SMTP account` ditolak karena bukan App Password. Workflow produksi kemudian dipindahkan ke Gmail API dengan credential `EnIxToznQ10K4jXR`. Diagnostic execution `243580` menemukan Gmail API belum aktif pada project `216220258218`; setelah API diaktifkan, execution `243581` berhasil mengirim email. Forced failure dan recovery production belum dijalankan karena endpoint monitoring dilindungi App JWT dan membutuhkan sesi Admin live.

Rencana perbaikan untuk Gmail API:

1. Aktifkan Gmail API melalui `https://console.developers.google.com/apis/api/gmail.googleapis.com/overview?project=216220258218`. **Selesai.**
2. Retest credential dan pastikan message mendapat label `SENT`. **Selesai pada execution `243581`.**
3. Dengan sesi Admin live, jalankan forced FAIL dan pastikan `notification_sent=true` serta email alert diterima.
4. Pulihkan dependency ke kondisi normal, jalankan ulang, dan pastikan email recovery diterima.

Seluruh workflow sementara untuk pengujian SMTP/Gmail sudah diarsipkan. Workflow monitoring produksi tetap aktif pada version `db989b48-7132-436c-9604-947067fb1f53`, node notifikasi memakai Gmail API dengan credential `EnIxToznQ10K4jXR`, dan hasil terakhir dependency Drive/database tetap PASS.

## Aktor dan Akses

| Aktor | Role | Akses UAT |
| --- | --- | --- |
| Warga | `warga` | Upload bukti transfer untuk tagihan unit sendiri |
| Pengurus | `pengurus` | Tidak boleh approve/reject pembayaran |
| Bendahara | `bendahara` | Melihat semua bukti, approve/reject |
| Admin | `admin` | Melihat semua bukti, approve/reject |

## Endpoint yang Diuji

| Endpoint | Method | Content-Type | Minimum Role | Tujuan |
| --- | --- | --- | --- | --- |
| `/payments/manual/submit` | POST | `multipart/form-data` | `warga` | Submit bukti transfer dan membuat pembayaran `pending_verification` |
| `/payments/list` | POST | `application/json` | `bendahara` | Memuat daftar pembayaran untuk verifikasi |
| `/payments/manual/approve` | POST | `application/json` | `bendahara` | Menerima pembayaran pending |
| `/payments/manual/reject` | POST | `application/json` | `bendahara` | Menolak pembayaran pending |

## Field Data yang Wajib Terpasang

### Request Submit

Frontend wajib mengirim:

| Field | Sumber UI | Validasi |
| --- | --- | --- |
| `bill_id` | tagihan yang dipilih di matriks | wajib, milik unit warga |
| `method` | pilihan metode | wajib `bank_transfer` |
| `amount` | total tagihan + denda bila ada | harus sesuai tagihan |
| `file` | input Bukti Transfer | wajib JPG/PNG, max 2 MB sesuai UI |
| `note` | catatan opsional | opsional |
| `paid_at` | jika ada dari flow staf/manual | opsional untuk warga |

### Google Drive

Setelah submit valid:

| Field | Ekspektasi |
| --- | --- |
| Folder tujuan | folder payment proof privat, bukan folder publik |
| File | dibuat satu file bukti transfer |
| Permission file | public-by-link untuk file itu saja |
| Parent folder | tetap private dan tidak bisa di-list publik |
| Link | `https://drive.google.com/file/d/{fileId}/view...` atau format view URL valid |

### Database Supabase

Tabel `payments` wajib berisi:

| Kolom | Ekspektasi Submit Valid |
| --- | --- |
| `ipl_bill_id` | sama dengan tagihan yang dipilih |
| `resident_id` | warga pemilik unit/tagihan |
| `amount` | sesuai nominal tagihan |
| `method` | `bank_transfer` |
| `status` | `pending_verification` |
| `proof_file_provider` | `google_drive` |
| `proof_file_id` | Drive file id valid |
| `proof_file_url` | URL file Drive valid |
| `proof_file_name` | nama file bukti |
| `proof_file_mime_type` | `image/jpeg` atau `image/png` |
| `proof_file_size` | > 0 dan <= limit backend |
| `metadata.note` | sama dengan catatan UI, jika diisi |

Tabel `ipl_bills` wajib berubah:

| Momen | Ekspektasi |
| --- | --- |
| Setelah submit | `status` tetap `pending`/`overdue`, `payment_id` mengarah ke payment baru; status tampilan matriks diturunkan dari `payments.status = pending_verification` |
| Setelah approve | `status = paid`, `payment_id` tetap mengarah ke payment approved |
| Setelah reject | `status = pending` atau `overdue`, `payment_id = null` |

Audit log wajib mencatat minimal:

| Event | Ekspektasi |
| --- | --- |
| Submit | `payment.manual_submit` atau event ekuivalen, berisi user, bill/payment id, file metadata |
| Approve | `payment.manual_approve` atau event ekuivalen, berisi verifier dan payment id |
| Reject | `payment.manual_reject` atau event ekuivalen, berisi verifier, payment id, alasan |
| Failure Drive | tidak boleh menulis payment sukses; audit error boleh ada |

## Data Uji Minimum

| Data | Nilai Contoh |
| --- | --- |
| Warga | user role `warga`, sudah approved, punya `unit_id` |
| Unit | satu unit aktif dengan tagihan unpaid |
| Tagihan 1 | periode berjalan, status `pending`, belum punya `payment_id` |
| Tagihan 2 | periode overdue, status `overdue`, punya denda bila applicable |
| Bukti valid JPG | `bukti-transfer-valid.jpg`, ukuran < 2 MB |
| Bukti valid PNG | `bukti-transfer-valid.png`, ukuran < 2 MB |
| Bukti invalid MIME | `.pdf`, `.txt`, atau file rename dengan MIME bukan image |
| Bukti oversized | JPG/PNG > 2 MB |
| Warga lain | user role `warga` dengan `unit_id` berbeda |
| Staf valid | user role `bendahara` atau `admin` |
| Staf invalid | user role `pengurus` |

## Matriks Skenario Positif

| ID | Skenario | Langkah | Ekspektasi UI | Ekspektasi API/Drive/DB |
| --- | --- | --- | --- | --- |
| PAY-POS-001 | Submit transfer 1 tagihan pending dengan JPG | Login warga, buka Matriks Pembayaran, pilih 1 sel pending milik unit sendiri, klik Bayar via Transfer, upload JPG valid, isi catatan, klik Kirim Bukti Transfer | Toast sukses: bukti dikirim dan menunggu verifikasi; seleksi kosong; matriks refresh | API `/payments/manual/submit` 200; file terupload ke Drive; `payments.status=pending_verification`; `ipl_bills.payment_id` terisi; metadata Drive terisi |
| PAY-POS-002 | Submit transfer 1 tagihan overdue dengan denda | Pilih tagihan overdue tertua yang valid, upload PNG valid, submit | Modal menampilkan total termasuk denda; submit sukses | Amount tersimpan sesuai `amount + late_fee`; bill terkunci dengan `payment_id`; payment pending dibuat |
| PAY-POS-003 | Submit transfer multi-bulan berurutan | Pilih beberapa bulan berurutan pada unit sendiri, upload 1 bukti valid, submit | Daftar periode dan total tampil benar; submit sukses | Untuk setiap bill terpilih dibuat payment pending atau linkage sesuai desain backend; tidak ada bill yang tertinggal; metadata Drive tersedia untuk semua payment terkait |
| PAY-POS-004 | Submit dengan catatan kosong | Upload bukti valid tanpa catatan | Submit tetap sukses | `metadata.note` kosong/null tetapi payment tetap valid |
| PAY-POS-005 | Kompresi gambar client-side | Upload JPG/PNG valid berukuran relatif besar tapi <= 2 MB | Nama file dan ukuran tampil; tidak ada error format | File yang dikirim API adalah file hasil kompresi bila compressor berhasil; MIME tetap image |
| PAY-POS-006 | Link bukti tampil di detail tagihan warga | Setelah submit, buka detail tagihan pending/rejected/paid terkait | Detail menampilkan lampiran bukti dan link bukti | UI memakai `proof_file_url`; jika Drive URL valid, link membuka file |
| PAY-POS-007 | Bendahara melihat antrean pending | Login bendahara, buka Verifikasi Pembayaran tab Menunggu | Payment warga muncul dengan nama, unit, periode, nominal, dan link bukti | `/payments/list` mengembalikan payment pending dengan `_bill`, `_profile`, dan metadata file |
| PAY-POS-008 | Preview bukti Drive di verifikasi | Klik detail payment pending yang memiliki `proof_file_url` Google Drive | Preview gambar tampil melalui thumbnail Drive atau link dapat dibuka di tab baru | `proof_file_url` berformat Drive file URL; thumbnail URL terbentuk dari file id |
| PAY-POS-009 | Approve pembayaran pending | Bendahara klik Terima/Approve payment valid | Toast sukses; payment hilang dari tab Menunggu dan muncul di Terverifikasi; matriks bill menjadi lunas | `/payments/manual/approve` 200; `payments.status=completed` di DB atau `verified` di UI; `ipl_bills.status=paid`; audit approve tercatat |
| PAY-POS-010 | Admin approve pembayaran pending | Login admin, approve payment pending | Sama seperti bendahara | Role admin diterima backend; status DB dan audit benar |
| PAY-POS-011 | Reject pembayaran pending dengan alasan | Bendahara buka payment pending, klik Reject, isi alasan jelas, submit | Toast pembayaran ditolak; payment pindah ke tab Ditolak; alasan terlihat di detail | `/payments/manual/reject` 200; `payments.status=rejected`; `rejection_reason`/note tersimpan; `ipl_bills.status=pending/overdue`; `payment_id=null`; audit reject tercatat |
| PAY-POS-012 | Warga melihat payment rejected | Login warga pemilik, buka detail tagihan yang ditolak | Status ditolak dan alasan tampil; warga dapat memahami bukti perlu diperbaiki | API hanya mengembalikan data milik warga; alasan reject sesuai DB |
| PAY-POS-013 | Parent folder Drive tetap private | Dari browser incognito, coba buka URL parent folder Drive | Folder tidak bisa di-list publik | Hanya file bukti yang public-by-link; tidak ada folder URL tersimpan di DB/UI |
| PAY-POS-014 | File Drive tetap bisa dibuka via link payment | Dari link `proof_file_url`, buka di tab baru/incognito | File bukti bisa dilihat | Permission file public-by-link aktif |
| PAY-POS-015 | Refresh setelah approve/reject konsisten | Refresh halaman Matriks dan Verifikasi setelah approve/reject | Status tetap sama, tidak balik ke pending lama | DB adalah sumber kebenaran; tidak ada stale state dari frontend |

## Matriks Skenario Negatif

| ID | Skenario | Langkah | Ekspektasi UI | Ekspektasi API/Drive/DB |
| --- | --- | --- | --- | --- |
| PAY-NEG-001 | Submit tanpa memilih tagihan | Login warga, langsung klik aksi bayar bila tersedia atau tidak memilih sel | UI memberi warning pilih minimal 1 bulan; modal tidak terbuka | Tidak ada request API; tidak ada file Drive; DB tidak berubah |
| PAY-NEG-002 | Submit tanpa bukti transfer | Pilih tagihan, buka modal, klik Kirim Bukti Transfer tanpa file | Error `Bukti transfer wajib diunggah`; tombol tetap aman | Tidak ada request API; Drive/DB tidak berubah |
| PAY-NEG-003 | Upload format tidak didukung | Upload PDF/TXT/HEIC | Error `Format tidak didukung. Gunakan JPG atau PNG`; file input dikosongkan | Tidak ada request submit; Drive/DB tidak berubah |
| PAY-NEG-004 | Upload file > 2 MB | Upload JPG/PNG lebih dari 2 MB | Error `Ukuran file melebihi 2 MB`; file input dikosongkan | Tidak ada request submit; Drive/DB tidak berubah |
| PAY-NEG-005 | File extension image tapi MIME bukan image | Rename `.txt` menjadi `.jpg`, upload | UI/browser atau backend menolak; tidak boleh sukses | API mengembalikan error validasi MIME; Drive/DB tidak berubah |
| PAY-NEG-006 | Warga mencoba bayar tagihan unit lain | Manipulasi request `bill_id` milik unit lain | UI tidak mengizinkan seleksi unit lain | API 403/validation error; Drive tidak upload; DB tidak berubah |
| PAY-NEG-007 | Warga belum approved atau inactive | Login user pending/suspended lalu submit | Akses ditolak atau diarahkan sesuai auth state | API 401/403; Drive/DB tidak berubah |
| PAY-NEG-008 | Token kosong/expired | Hapus token lalu submit | User diminta login ulang atau toast error auth | API 401; Drive/DB tidak berubah |
| PAY-NEG-009 | Submit method selain `bank_transfer` dari request manipulasi | Kirim `method=qris`, `cash`, atau string lain ke `/payments/manual/submit` | UI normal tidak menyediakan opsi itu untuk warga | API 400/403; Drive/DB tidak berubah |
| PAY-NEG-010 | Submit bill yang sudah paid | Manipulasi `bill_id` yang statusnya paid | UI sel paid membuka detail, tidak bisa dipilih | API menolak duplicate/invalid state; Drive/DB tidak berubah |
| PAY-NEG-011 | Submit bill yang sudah pending verification | Submit ulang bill sama sebelum diverifikasi | UI sel pending membuka detail, tidak bisa dipilih | API menolak duplicate pending; tidak ada payment ganda; Drive tidak membuat file baru atau file orphan dibersihkan |
| PAY-NEG-012 | Pilih bulan tidak berurutan | Pilih bulan berikutnya saat ada tunggakan sebelumnya | UI memperbarui seleksi dan memberi warning tunggakan sebelumnya | Tidak ada request untuk seleksi tidak valid; DB tidak berubah |
| PAY-NEG-013 | Manipulasi amount lebih kecil | Kirim amount lebih rendah dari tagihan | UI memakai amount dari data bill | API menghitung ulang atau menolak; DB tidak menyimpan amount manipulasi |
| PAY-NEG-014 | Manipulasi amount lebih besar | Kirim amount lebih besar dari tagihan | UI memakai amount dari data bill | API menghitung ulang atau menolak; DB tidak menyimpan amount manipulasi |
| PAY-NEG-015 | API timeout saat submit | Matikan n8n/network atau simulasi timeout | Toast `Koneksi ke API terlalu lama` atau error sejenis; form tidak dianggap sukses | Jika Drive/DB belum sukses, tidak ada perubahan; jika partial, backend harus rollback/cleanup |
| PAY-NEG-016 | Google Drive credential invalid | Cabut credential Drive lalu submit | UI menerima error dari API, bukan sukses | API gagal aman; tidak ada insert payment/bill update; audit error boleh tercatat |
| PAY-NEG-017 | Google Drive upload gagal | Simulasikan upload node gagal | Toast gagal submit | Tidak ada `payments` baru; `ipl_bills.payment_id` tetap kosong; file orphan tidak ada atau dibersihkan |
| PAY-NEG-018 | Google Drive share permission gagal | Upload berhasil tapi set permission gagal | Toast gagal submit | Payment tidak ditulis; bill tidak berubah; file orphan dibersihkan atau tercatat untuk cleanup |
| PAY-NEG-019 | Supabase insert payment gagal setelah Drive upload | Simulasikan DB insert error | Toast gagal submit | Tidak ada bill update; file Drive orphan dibersihkan atau masuk daftar cleanup; audit error tercatat |
| PAY-NEG-020 | Supabase bill update gagal setelah payment insert | Simulasikan update bill gagal | Toast gagal submit | Tidak boleh ada payment pending tanpa bill link; transaksi DB rollback atau cleanup wajib |
| PAY-NEG-021 | Pengurus buka halaman Verifikasi | Login pengurus, akses `/payment-verification` | Redirect ke home | API approve/reject tidak boleh dipanggil; bila dipanggil manual harus 403 |
| PAY-NEG-022 | Warga buka halaman Verifikasi | Login warga, akses `/payment-verification` | Redirect ke home | API approve/reject manual harus 403 |
| PAY-NEG-023 | Approve tanpa role bendahara/admin | Kirim `/payments/manual/approve` pakai token warga/pengurus | Tidak ada tombol di UI | API 403; payment tetap pending; bill tetap menunjuk payment pending |
| PAY-NEG-024 | Reject tanpa role bendahara/admin | Kirim `/payments/manual/reject` pakai token warga/pengurus | Tidak ada tombol di UI | API 403; payment tetap pending; bill tetap menunjuk payment pending |
| PAY-NEG-025 | Reject tanpa alasan | Bendahara klik reject lalu submit alasan kosong | UI error `Silakan isi alasan penolakan` | Tidak ada request reject; DB tidak berubah |
| PAY-NEG-026 | Approve payment yang sudah approved | Kirim approve ulang ke payment completed | UI payment tidak ada di tab Menunggu | API menolak atau idempotent aman; tidak ada audit ganda yang menyesatkan |
| PAY-NEG-027 | Reject payment yang sudah approved | Kirim reject ke payment completed | UI tidak menyediakan aksi reject | API menolak; bill tetap paid; payment tetap completed |
| PAY-NEG-028 | Approve payment rejected | Kirim approve ke payment rejected | UI rejected tidak menyediakan approve kecuali flow revisi baru | API menolak; bill tetap pending/overdue |
| PAY-NEG-029 | Bukti Drive tidak dapat dipreview | Gunakan `proof_file_url` invalid atau permission tertutup | UI menampilkan fallback link/error preview tanpa crash | Data tetap bisa dibuka dari link bila valid; jika invalid, test harus fail untuk setup Drive |
| PAY-NEG-030 | Response API tidak valid JSON | Simulasikan n8n return HTML/null | UI menampilkan `Respons API tidak valid` atau error umum | DB/Drive tidak boleh berubah pada request gagal |

## Checklist Detail per Layer

### UI Warga

- [x] Halaman Matriks menampilkan hanya aksi `Bayar via Transfer` untuk warga.
- [x] Opsi QRIS tidak tampil di modal pembayaran.
- [x] Metode yang tampil adalah `Transfer Bank`.
- [x] Upload hanya menerima JPG/PNG.
- [x] File > 2 MB ditolak sebelum submit.
- [x] Submit tanpa file ditolak.
- [x] Setelah submit sukses, modal tertutup, seleksi kosong, dan matriks refresh.
- [x] Tagihan yang sedang `pending_verification` tidak bisa dipilih ulang.
- [x] Detail tagihan menampilkan bukti dan status pending/rejected/paid sesuai state.

### API n8n

- [x] `VITE_N8N_API_BASE_URL` mengarah ke base URL n8n yang benar.
- [x] `/payments/manual/submit` menerima `multipart/form-data` field `file`, `bill_id`, `method`, `amount`, `note`, `paid_at`.
- [x] JWT diverifikasi sebelum upload Drive.
- [x] Role dan approval status diverifikasi sebelum upload Drive.
- [x] Kepemilikan bill diverifikasi sebelum upload Drive.
- [x] Status bill dicek agar tidak duplicate paid/pending.
- [x] Backend tidak mempercayai amount dari frontend tanpa validasi ulang.
- [x] Error Drive tidak boleh lanjut ke insert/update DB.
- [x] Error DB setelah Drive upload harus rollback DB dan cleanup/menandai file orphan.
- [x] Response sukses berformat `{ ok: true, data: ... }`.
- [x] Response gagal berformat `{ ok: false, error: { code, message } }`.

### Google Drive

- [ ] Credential n8n yang digunakan adalah akun organisasi Palm Village.
- [x] File bukti masuk ke folder payment proof yang benar.
- [x] Nama file cukup unik dan dapat ditelusuri ke bill/payment.
- [x] Hanya file yang public-by-link.
- [x] Parent folder tidak public dan tidak muncul di UI.
- [x] `proof_file_id` di DB sama dengan file id di URL Drive.
- [x] Link file bisa dibuka dari UI bendahara/admin.
- [x] File orphan dari skenario gagal dibersihkan atau dicatat untuk cleanup.

### Database Supabase

- [x] Insert `payments` terjadi setelah upload/share Drive sukses.
- [x] `payments.method = bank_transfer`.
- [x] `payments.status = pending_verification` setelah submit.
- [x] `payments.proof_file_provider = google_drive`.
- [x] `proof_file_id`, `proof_file_url`, `proof_file_name`, `proof_file_mime_type`, `proof_file_size` terisi.
- [x] `ipl_bills.status` tetap `pending`/`overdue` dan status tampilan pending verification diturunkan dari payment.
- [x] `ipl_bills.payment_id = payments.id` setelah submit.
- [x] Approve mengubah payment menjadi completed/verified dan bill menjadi paid.
- [x] Reject mengubah payment menjadi rejected, menyimpan alasan, dan mengembalikan bill ke pending/overdue.
- [x] Audit log tercatat untuk submit, approve, reject, dan failure penting.

## Query Verifikasi Supabase

Gunakan query berikut dengan mengganti placeholder sesuai data uji.

```sql
-- Cek payment pending setelah submit
select
  id,
  ipl_bill_id,
  resident_id,
  amount,
  method,
  status,
  proof_file_provider,
  proof_file_id,
  proof_file_url,
  proof_file_name,
  proof_file_mime_type,
  proof_file_size,
  metadata,
  created_at
from public.payments
where ipl_bill_id = '<BILL_ID>'
order by created_at desc
limit 5;
```

```sql
-- Cek status tagihan setelah submit/approve/reject
select
  id,
  unit_id,
  resident_id,
  period,
  amount,
  late_fee,
  status,
  payment_id
from public.ipl_bills
where id = '<BILL_ID>';
```

```sql
-- Cek tidak ada payment ganda pending untuk satu bill
select ipl_bill_id, status, count(*)
from public.payments
where ipl_bill_id = '<BILL_ID>'
group by ipl_bill_id, status;
```

```sql
-- Cek metadata bukti Google Drive
select id, proof_file_provider, proof_file_id, proof_file_url
from public.payments
where proof_file_provider = 'google_drive'
  and proof_file_id is not null
  and proof_file_url is not null
order by created_at desc
limit 20;
```

## Kriteria Kelulusan

UAT pembayaran transfer dinyatakan PASS jika:

- Semua skenario positif PASS.
- Semua skenario negatif tidak menulis data sukses palsu.
- Tidak ada payment pending tanpa file Drive valid.
- Tidak ada payment `pending_verification` tanpa `ipl_bills.payment_id` yang menunjuk payment tersebut.
- Tidak ada file Drive public folder; hanya file bukti yang public-by-link.
- Approve dan reject konsisten di UI setelah refresh.
- Audit log cukup untuk menelusuri siapa submit, siapa approve/reject, dan alasan reject.

UAT dinyatakan BLOCKED jika:

- n8n API base URL belum dikonfigurasi.
- Credential Google Drive tidak aktif.
- Folder payment proof belum tersedia atau permission salah.
- Supabase migration metadata Drive belum terpasang.
- Akun role warga/bendahara/admin untuk UAT belum tersedia.

## Catatan Risiko

- Saat pembayaran multi-bulan memakai satu bukti yang sama, backend harus memastikan metadata Drive direferensikan konsisten untuk semua payment terkait dan tidak mengunggah file duplikat tanpa kebutuhan.
- Jika file berhasil terupload ke Drive tetapi DB gagal, perlu mekanisme cleanup agar tidak ada file orphan.
- Google Drive public-by-link berarti siapa pun yang memiliki link dapat melihat file; aplikasi harus menjaga agar link hanya ditemukan oleh pihak yang berhak.
