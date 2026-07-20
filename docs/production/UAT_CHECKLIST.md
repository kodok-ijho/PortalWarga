# Panduan UAT (User Acceptance Testing) - Portal Warga Palm Village

Dokumen ini adalah panduan langkah demi langkah untuk menguji seluruh fitur sistem sebelum diluncurkan ke produksi. Gunakan panduan ini untuk memverifikasi kesiapan aplikasi.

---

## 📋 DAFTAR PENGUJIAN

### 🔐 1. Alur Pendaftaran & Keamanan (Auth & Security)

#### **UAT-1.1: Pendaftaran Akun Warga Baru**
*   **Tujuan:** Memastikan warga baru tidak langsung masuk sebelum disetujui Pengurus.
*   **Prasyarat:** Menggunakan akun Google yang belum terdaftar di aplikasi.
*   **Langkah-langkah:**
    1.  Buka halaman Login aplikasi.
    2.  Klik tombol **Sign in with Google**.
    3.  Pilih akun Google Anda untuk login.
*   **Hasil yang Diharapkan:**
    *   [ ] Sistem mendeteksi akun baru dan menampilkan halaman **Pending Approval** ("Menunggu Verifikasi Pengurus").
    *   [ ] Akun warga baru tidak dapat mengakses menu internal (seperti tagihan, laporan, dll).

---

#### **UAT-1.2: Persetujuan Akun & Asosiasi Unit oleh Admin**
*   **Tujuan:** Menyetujui pendaftaran warga dan mengaitkannya ke unit rumah rill.
*   **Prasyarat:** Login menggunakan akun berstatus **Admin** / **Pengurus**.
*   **Langkah-langkah:**
    1.  Masuk ke menu **User Approval** (Persetujuan Warga).
    2.  Cari nama pendaftar baru dari langkah UAT-1.1.
    3.  Pilih **Unit Rumah** (contoh: `CB3-3A`) dan set Peran ke **Warga**.
    4.  Klik tombol **Approve** (Setujui).
*   **Hasil yang Diharapkan:**
    *   [ ] Akun warga berhasil disetujui.
    *   [ ] Notifikasi otomatis (Email/WhatsApp) terkirim kepada warga.

---

#### **UAT-1.3: Login Pertama Warga Terdaftar**
*   **Tujuan:** Memastikan warga yang disetujui dapat masuk dan melihat unitnya.
*   **Prasyarat:** Akun warga dari UAT-1.1 sudah disetujui di UAT-1.2.
*   **Langkah-langkah:**
    1.  Buka halaman Login.
    2.  Login kembali menggunakan akun Google Warga tersebut.
*   **Hasil yang Diharapkan:**
    *   [ ] Login berhasil tanpa hambatan.
    *   [ ] Dashboard menampilkan informasi unit rumah yang sesuai (`CB3-3A`).

---

#### **UAT-1.4: Pembatasan Hak Akses (Security Guard)**
*   **Tujuan:** Mencegah kebocoran data dan akses menu terlarang oleh Warga.
*   **Prasyarat:** Login menggunakan akun berstatus **Warga**.
*   **Langkah-langkah:**
    1.  Coba buka link laporan secara langsung dengan mengetik `/reports` pada browser address bar.
*   **Hasil yang Diharapkan:**
    *   [ ] Akses ditolak secara aman.
    *   [ ] Browser otomatis mengembalikan halaman ke Dashboard Warga.

---

### 💵 2. Tagihan & Pembayaran (Billing & Payments)

#### **UAT-2.1: Pembuatan Tagihan Bulanan**
*   **Tujuan:** Bendahara dapat membuat tagihan bulanan untuk seluruh komplek secara massal.
*   **Prasyarat:** Login sebagai **Bendahara** atau **Admin**.
*   **Langkah-langkah:**
    1.  Masuk ke halaman **Settings** -> bagian **Billing Generation**.
    2.  Pilih periode tagihan (contoh: `2026-07`) dan klik **Generate**.
*   **Hasil yang Diharapkan:**
    *   [x] Tagihan tersedia otomatis untuk seluruh 53 unit rumah; duplicate generate aman dan tidak membuat baris baru.
    *   [x] Tarif dihitung rill berdasarkan komponen aktif (IPL + Keamanan).

*   **Evidence 2026-07-11:** PASS melalui execution `239452`, `239453`, dan matrix `239454`. Periode `2026-07` berisi 53 tagihan unik.

---

#### **UAT-2.2: Upload Bukti Transfer Manual**
*   **Tujuan:** Warga membayar menggunakan transfer bank konvensional dan mengunggah buktinya.
*   **Prasyarat:** Login sebagai **Warga** yang memiliki tagihan belum lunas.
*   **Langkah-langkah:**
    1.  Buka dashboard Warga, pilih tagihan bulanan.
    2.  Klik tombol **Bayar Manual**.
    3.  Pilih file bukti transfer JPG/PNG berukuran maksimal 2 MB.
    4.  Klik **Submit**.
*   **Hasil yang Diharapkan:**
    *   [ ] Status tagihan di matrix berubah menjadi **Menunggu Verifikasi**.
    *   [ ] Bukti transfer terunggah aman ke Google Drive.
    *   [ ] Bendahara menerima notifikasi pengajuan verifikasi baru.

*   **Evidence 2026-07-14:** Credential organisasi `Palm Village Google Drive account`, yang diautentikasi sebagai `palmvillage.paguyuban@gmail.com`, sudah dipasang pada node upload/share. Folder tujuan final adalah `1nmpwQ-zN5AKDmyIOFI48FSXvji_aSKC4` dan workflow manual sudah dipublish sebagai versi `c136a28a-9c6c-4afa-9854-eb33851d1e0a`. Runtime valid-upload masih perlu diulang sebelum UAT ini berstatus PASS. Negative tests PASS: `239455` invalid MIME, `239456` >2 MB, `239457` tanpa file, `239458` tanpa JWT. Guard `239461` memastikan kegagalan Drive tidak menulis payment.

---

#### **UAT-2.3: Verifikasi Bukti Manual oleh Bendahara**
*   **Tujuan:** Memvalidasi bukti transfer warga dan menandai tagihan lunas.
*   **Prasyarat:** Ada tagihan berstatus **Menunggu Verifikasi** dari UAT-2.2. Login sebagai **Bendahara**.
*   **Langkah-langkah:**
    1.  Masuk ke menu **Verifikasi Pembayaran**.
    2.  Klik bukti transfer untuk mencocokkan mutasi bank.
    3.  Klik tombol **Approve** (Setujui).
*   **Hasil yang Diharapkan:**
    *   [ ] Status tagihan berubah menjadi **Lunas**.
    *   [ ] Warga menerima email/WA konfirmasi pembayaran lunas secara otomatis.

---

#### **UAT-2.4: Pembayaran Instan QRIS Midtrans**
*   **Tujuan:** Membayar instan via QRIS Snap Sandbox.
*   **Prasyarat:** Login sebagai **Warga** dengan tagihan pending.
*   **Langkah-langkah:**
    1.  Klik **Bayar via QRIS** pada tagihan.
    2.  Pop-up Midtrans Snap akan muncul dengan QR Code.
    3.  Bayar QR Code menggunakan simulator Sandbox Midtrans.
*   **Hasil yang Diharapkan:**
    *   [ ] Pop-up otomatis menutup setelah pembayaran sukses.
    *   [ ] Status tagihan langsung terupdate menjadi **Lunas** (real-time via webhook).

---

### 📊 3. Laporan Keuangan (Financial Reports)

#### **UAT-3.1: Saldo Kumulatif Berjalan**
*   **Tujuan:** Menampilkan riwayat saldo rill secara bulanan sejak transisi awal.
*   **Prasyarat:** Login sebagai **Pengurus** atau **Admin**.
*   **Langkah-langkah:**
    1.  Buka menu **Laporan Keuangan** -> pilih tab **Running Balance**.
*   **Hasil yang Diharapkan:**
    *   [ ] Saldo awal Januari 2025 dihitung dari Rp 15.000.000.
    *   [ ] Saldo penutupan bulan N secara berurutan menjadi saldo awal bulan N+1.

---

#### **UAT-3.2: Export Laporan Keuangan**
*   **Tujuan:** Mengunduh atau mencetak data keuangan untuk arsip fisik.
*   **Prasyarat:** Berada di halaman **Laporan Keuangan**.
*   **Langkah-langkah:**
    1.  Klik tombol **Export CSV** untuk menyimpan data.
    2.  Klik tombol **Cetak Laporan** (Print).
*   **Hasil yang Diharapkan:**
    *   [ ] File CSV terunduh bersih dengan kalkulasi angka yang tepat.
    *   [ ] Printer preview menampilkan lembar laporan bersih tanpa sidebar menu.
