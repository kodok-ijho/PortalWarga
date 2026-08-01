# Task Aktivasi Midtrans QRIS Sandbox

Status: `[~] Implementasi Sandbox diizinkan rilis pada 1 Agustus 2026; UAT lanjutan tetap berjalan`

Tujuan: mengaktifkan pembayaran IPL melalui Midtrans QRIS Sandbox khusus role `admin` dan akun Admin Demo (`admin_viewer`) selama proses review Midtrans. Role `warga`, `pengurus`, dan `bendahara` belum memperoleh akses QRIS.

Aturan rilis: batch versi `1.3.12` telah mendapat perintah eksplisit untuk di-push. Perubahan Midtrans/QRIS berikutnya tetap tidak boleh di-push tanpa perintah eksplisit baru dari pemilik proyek.

## Kondisi awal

- Workflow n8n create QRIS aktif: `PV API - Payments QRIS Create`, ID `Gt84N4815U8eXyIP`.
- Workflow n8n webhook aktif: `PV API - Payments Midtrans Webhook`, ID `dBVwg3tPDSfuxXZl`.
- Credential n8n `PV Midtrans Sandbox Key` tersedia.
- Database sudah memiliki `qris`, `order_id`, `transaction_id`, `metadata`, dan status pembayaran yang diperlukan.
- `PaymentMatrix.jsx` dan `QrisCheckoutModal` sudah terhubung untuk alur QRIS.
- Workflow aktif setelah publish terakhir: create `61f9025f-799c-457f-a6b7-f83540bafd7b`, webhook `411fb593-19ce-4101-b194-faaf448293fd`.
- Rilis GitHub versi `1.3.12` telah diotorisasi secara eksplisit oleh pemilik proyek.

## Urutan pengerjaan

### 1. Validasi konfigurasi Sandbox

- [x] Pastikan nama variabel sudah benar: `MIDTRANS_SERVER_KEY` dan `MIDTRANS_CLIENT_KEY`.
- [x] Pastikan endpoint tetap `https://app.sandbox.midtrans.com`.
- [x] Simpan Server Key hanya pada backend/n8n credential; jangan memakai prefix `VITE_` dan jangan memasukkannya ke bundle frontend. Build sudah diperiksa dan tidak memuat nama/pola Server Key.
- [~] Credential `PV Midtrans Sandbox Key` sudah terpasang pada node create dan webhook, tetapi nilai secret tidak dapat dibaca melalui MCP; perlu dikonfirmasi dengan UAT Sandbox.
- [x] `.env` tetap di-ignore Git dan Server Key tidak ditulis ke audit metadata atau dokumentasi.

Selesai jika request backend dapat terautentikasi ke Midtrans Sandbox tanpa membocorkan Server Key.

### 2. Audit dan hardening endpoint create QRIS

Workflow: `Gt84N4815U8eXyIP`, endpoint `/portal-v1/payments/qris/create`.

- [x] Izinkan hanya role `admin` dan akun Admin Demo resmi (`admin_viewer`); tolak `warga`, `pengurus`, `bendahara`, dan akun lain.
- [x] Ambil role, user ID, status akun, dan unit dari JWT/profil database, bukan dari body frontend.
- [x] Admin/Admin Demo hanya boleh mengirim tagihan dari satu unit yang sama dalam satu transaksi.
- [x] Hitung nominal dari database (`amount + late_fee`), bukan dari nominal request.
- [x] Tolak bill yang lunas, dibatalkan, atau sudah memiliki `payment_id` aktif; unique index database juga menangani race condition.
- [x] Pastikan `resident_id` untuk pembayaran staff tetap menunjuk warga/pemilik tagihan; simpan staff sebagai actor pada metadata/audit.
- [x] Buat parent dan child `order_id` yang unik dengan timestamp dan suffix acak.
- [x] Kirim `enabled_payments: ['qris']` agar Snap hanya menawarkan QRIS.
- [x] Sertakan item detail, customer detail seperlunya, dan response konsisten: `token`, `redirect_url`, `parent_order_id`, `total_amount`, dan bills.
- [x] Jika create Midtrans gagal, child payment dibersihkan berdasarkan parent order ID dan endpoint mengembalikan error aman.

Selesai jika Admin dan Admin Demo dapat membuat transaksi yang valid, sedangkan role lain ditolak secara backend.

### 3. Hardening database dan transaksi multi-bulan

- [x] Verifikasi unique index `uq_payments_one_live_per_bill` pada `ipl_bill_id`; index mencakup `draft`, `pending`, `pending_verification`, dan `completed`.
- [x] Tidak perlu migration tambahan karena index/constraint yang diperlukan sudah tersedia di database.
- [~] Alur multi-bill memakai child insert dan linking berurutan, dengan unique index serta kompensasi saat Midtrans gagal; transaksi database penuh masih perlu diuji pada concurrent UAT.
- [x] Workflow webhook memetakan `pending`, `completed`, `failed`, `expired`, `cancelled`, dan `refunded` serta mengosongkan link bill untuk status final non-paid.
- [~] RLS dan kewenangan baca perlu dikonfirmasi melalui UAT role.

Selesai jika request ganda tidak menggandakan transaksi dan tidak ada kondisi sebagian tagihan tertaut.

### 4. Hardening webhook Midtrans

Workflow: `dBVwg3tPDSfuxXZl`, endpoint `/portal-v1/payments/midtrans/webhook`.

- [x] Perbarui dokumentasi agar memakai workflow ID aktif.
- [x] Hapus pola mengambil Server Key melalui `httpbin.org/headers`; credential hanya dipakai pada request status API Midtrans Sandbox.
- [x] Verifikasi webhook dilakukan melalui authenticated Midtrans Sandbox status API dengan pencocokan `order_id`, `status_code`, `gross_amount`, dan `transaction_status`. Pola SHA-512 lokal tidak dipakai karena secret credential tidak tersedia aman di Code node n8n.
- [x] Cocokkan nominal webhook dengan nominal child payment yang tersimpan dan validasi status provider sebelum menetapkan lunas.
- [x] Tangani settlement/capture, pending, deny/failure, expire, cancel, dan refund secara eksplisit.
- [x] Update seluruh child payment berdasarkan parent order ID dan sinkronkan bill; kegagalan notifikasi tidak membatalkan response webhook.
- [x] Terapkan idempotency untuk webhook duplikat dan status final.
- [x] Simpan audit payload yang sudah disanitasi; Server Key dan `signature_key` tidak disimpan.

Selesai jika signature tidak valid tidak mengubah database dan replay webhook tidak membuat duplikasi.

### 5. Tambahkan service QRIS di frontend

File utama: `client/src/services/dataService.js`.

- [x] Tambahkan `createQrisPayment(token, { bill_ids })` ke `/payments/qris/create`.
- [x] Kirim satu request untuk semua bill yang dipilih; nominal dan role tidak dikirim sebagai sumber kebenaran.
- [x] Normalisasi response untuk dipakai oleh `QrisCheckoutModal`.
- [x] Error response backend diteruskan melalui mekanisme `PortalApiError` yang sudah dipakai service API.

### 6. Aktifkan pilihan QRIS di Payment Matrix

File utama: `client/src/pages/PaymentMatrix.jsx`.

- [x] Tambahkan pilihan `QRIS via Midtrans` pada alur pembayaran Admin.
- [x] Izinkan Admin Demo menggunakan QRIS sebagai satu-satunya pengecualian dari mode read-only.
- [x] Tunai/transfer tetap tersedia sesuai hak role dan tidak ikut terbuka untuk Admin Demo.
- [x] Ganti blokir QRIS pada `confirmPay` dan `confirmManual` dengan pemanggilan service QRIS.
- [x] Pasang state dan render `QrisCheckoutModal`.
- [x] Selaraskan field response, termasuk `total_amount`/`total` dan daftar bills.
- [x] Sediakan redirect fallback jika popup browser diblokir.
- [x] Cegah double-submit, kosongkan selection setelah create sukses, dan status lunas tidak pernah ditetapkan dari frontend.

Selesai jika QRIS muncul dan dapat dimulai oleh Admin serta Admin Demo saja.

### 7. Tampilkan status pending dan hasil webhook

- [x] Tampilkan status QRIS pending segera setelah transaksi dibuat.
- [x] Refetch saat checkout ditutup dan saat tab kembali aktif.
- [x] Polling 10 detik hanya selama modal checkout terbuka dan dibersihkan saat unmount.
- [x] Status lunas hanya berasal dari data backend setelah webhook.
- [~] Tampilan khusus expired/failed/cancelled dan tombol retry aman perlu dikonfirmasi pada UAT.

### 8. Pengujian otomatis dan security regression

- [x] Test logic akses Admin dan Admin Demo serta penolakan role lain dengan pin data n8n; UAT memakai JWT nyata tetap berjalan.
- [x] Test pembayaran atas nama warga dan validasi `resident_id` tetap menunjuk pemilik tagihan.
- [ ] Test multi-bulan satu unit, duplicate create, concurrent create, dan Midtrans failure.
- [ ] Test signature webhook valid/tidak valid, replay, out-of-order, expire, cancel, dan refund.
- [ ] Test popup terblokir, timeout, session expired, dan double-submit.
- [x] Jalankan build frontend dan periksa bundle agar Server Key tidak ikut terbawa.

### 9. UAT Sandbox per role

- [ ] `admin`: uji QRIS pada unit yang dipilih.
- [ ] `admin_viewer`/Admin Demo: uji QRIS dan pastikan fitur tulis lain tetap ditolak.
- [ ] `warga`, `pengurus`, dan `bendahara`: pastikan pilihan QRIS tidak muncul dan request langsung ditolak.
- [ ] Pastikan alur tunai/transfer yang sudah ada tidak mengalami regresi.
- [ ] Uji desktop, mobile, PWA, popup/redirect, refresh, dan webhook duplikat.
- [ ] Simpan bukti UAT tanpa credential atau data pribadi sensitif.

### 10. Dokumentasi dan release gate

- [ ] Perbarui flow transaksi, kontrak endpoint, role matrix, mapping status, troubleshooting, dan webhook ID aktif.
- [ ] Jalankan build/test terakhir.
- [x] Pastikan credential Midtrans tetap lokal dan tidak masuk staging.
- [x] Perintah eksplisit untuk rilis batch versi `1.3.12` telah diterima pada 1 Agustus 2026.
- [x] Pertahankan release gate: perubahan Midtrans berikutnya harus menunggu perintah eksplisit baru.

## Definition of Done

- [ ] QRIS Sandbox berfungsi untuk Admin dan Admin Demo.
- [ ] `warga`, `pengurus`, dan `bendahara` tidak dapat membuat transaksi QRIS selama masa review.
- [ ] Midtrans hanya menampilkan QRIS.
- [ ] Webhook aman dan idempotent; webhook adalah sumber status lunas.
- [ ] Pembayaran staff menyimpan relasi warga/unit dengan benar.
- [ ] Tidak ada secret di frontend, repository, log, atau audit metadata.
- [ ] Build, test, dan UAT Sandbox lulus.
- [ ] Tidak ada perubahan Midtrans yang di-push ke GitHub tanpa izin eksplisit.
