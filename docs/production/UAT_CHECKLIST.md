# User Acceptance Testing (UAT) Checklist - Portal Warga Palm Village

Dokumen ini berisi daftar skenario pengujian untuk memverifikasi fungsionalitas sistem secara end-to-end sebelum rilis produksi.

---

## 1. Alur Pendaftaran & Autentikasi (Auth & Registration Flow)

| ID | Skenario Pengujian | Langkah Pengujian | Hasil yang Diharapkan | Status |
| :--- | :--- | :--- | :--- | :---: |
| **UAT-1.1** | Pendaftaran User Baru via Google Auth | 1. Buka halaman Login.<br>2. Klik tombol **Sign in with Google**.<br>3. Selesaikan login Google. | User diarahkan ke halaman **Pending Approval** ("Menunggu Verifikasi Pengurus"). Akun belum bisa mengakses dashboard warga. | `[ ]` |
| **UAT-1.2** | Persetujuan User & Asosiasi Unit oleh Admin | 1. Login sebagai Admin/Pengurus.<br>2. Masuk ke menu **User Approval**.<br>3. Pilih pendaftar baru, tentukan Peran (**Warga**) dan **Asosiasi Unit** (contoh: `CB3-3A`), lalu klik **Approve**. | Status user di database berubah menjadi `approved`. User dikirimi email/WA notifikasi persetujuan akun. | `[ ]` |
| **UAT-1.3** | Login Pertama Warga Terpilih | 1. Buka kembali halaman Login.<br>2. Login menggunakan akun Google warga yang baru saja disetujui. | Warga berhasil masuk ke Dashboard dan melihat data unitnya sendiri (`CB3-3A`). | `[ ]` |
| **UAT-1.4** | Autentikasi Keamanan (Negative Test) | 1. Akses halaman `/reports` langsung via URL menggunakan akun dengan peran **Warga**. | Warga otomatis ditolak dan diarahkan kembali ke Dashboard (akses dibatasi hanya untuk Pengurus/Admin). | `[ ]` |

---

## 2. Pembuatan Tagihan Bulanan (Billing Generation Flow)

| ID | Skenario Pengujian | Langkah Pengujian | Hasil yang Diharapkan | Status |
| :--- | :--- | :--- | :--- | :---: |
| **UAT-2.1** | Pembuatan Tagihan Baru oleh Bendahara | 1. Login sebagai Bendahara/Admin.<br>2. Masuk ke halaman **Settings** / **Billing**.<br>3. Klik tombol **Generate Bills** untuk periode berjalan (contoh: `2026-07`). | Tagihan untuk seluruh unit aktif berhasil dibuat sesuai komponen tarif IPL (IPL Bulanan + Dana Keamanan). | `[ ]` |
| **UAT-2.2** | Verifikasi Tampilan Matrix Tagihan Warga | 1. Login sebagai Warga unit `CB3-3A`.<br>2. Buka menu **Daftar Tagihan** (Payment Matrix). | Warga melihat tagihan periode `2026-07` dengan status **Belum Bayar** (Pending) sebesar Rp 600.000. | `[ ]` |

---

## 3. Pembayaran Transfer Manual (Manual Bank Transfer Flow)

| ID | Skenario Pengujian | Langkah Pengujian | Hasil yang Diharapkan | Status |
| :--- | :--- | :--- | :--- | :---: |
| **UAT-3.1** | Upload Bukti Transfer oleh Warga | 1. Login sebagai Warga.<br>2. Klik **Bayar Manual** pada tagihan `2026-07`.<br>3. Upload file bukti transfer (JPG/PNG/PDF) dan kirim. | - Status tagihan berubah menjadi **Menunggu Verifikasi**.<br>- File bukti transfer terunggah aman ke Google Drive.<br>- WA/Email notifikasi otomatis masuk ke Pengurus/Bendahara. | `[ ]` |
| **UAT-3.2** | Verifikasi & Persetujuan oleh Bendahara | 1. Login sebagai Bendahara.<br>2. Buka menu **Verifikasi Pembayaran**.<br>3. Klik tombol **Lihat Bukti Transfer** (buka link Drive).<br>4. Klik **Setujui** (Approve). | - Status tagihan warga berubah menjadi **Lunas** (Paid).<br>- WA/Email notifikasi otomatis dikirim ke warga menyatakan pembayaran berhasil. | `[ ]` |

---

## 4. Pembayaran QRIS Midtrans (Midtrans QRIS Integration Flow)

| ID | Skenario Pengujian | Langkah Pengujian | Hasil yang Diharapkan | Status |
| :--- | :--- | :--- | :--- | :---: |
| **UAT-4.1** | Pembuatan QRIS Token | 1. Login sebagai Warga.<br>2. Klik **Bayar via QRIS** pada tagihan.<br>3. Selesaikan proses checkout. | Pop-up Midtrans Snap terbuka dan menampilkan kode QRIS Sandbox. | `[ ]` |
| **UAT-4.2** | Simulasi Pembayaran QRIS Berhasil | 1. Gunakan simulator Midtrans Sandbox untuk membayar Order ID bersangkutan.<br>2. Tunggu n8n menerima webhook dari Midtrans. | - Status tagihan otomatis berubah menjadi **Lunas**.<br>- WA/Email notifikasi otomatis terkirim ke warga.<br>- Log audit log mencatat transaksi QRIS lunas. | `[ ]` |

---

## 5. Laporan Keuangan Keuangan (Financial Reports Flow)

| ID | Skenario Pengujian | Langkah Pengujian | Hasil yang Diharapkan | Status |
| :--- | :--- | :--- | :--- | :---: |
| **UAT-5.1** | Tampilan Running Balance Real-Time | 1. Login sebagai Pengurus/Admin.<br>2. Buka menu **Laporan Keuangan** -> tab **Saldo Berjalan**. | Sistem menghitung kumulatif bulanan (dimulai dari Jan 2025 dengan saldo awal Rp 15.000.000) berdasarkan data pembayaran rill. | `[ ]` |
| **UAT-5.2** | Export Laporan & Print | 1. Klik **Export CSV** pada laporan bulanan.<br>2. Klik tombol **Cetak Laporan** (Print). | - File CSV berhasil diunduh dengan data yang cocok.<br>- Tampilan cetak bersih tanpa header/tombol navigasi (media print CSS aktif). | `[ ]` |

---

## 6. Pengingat Otomatis & Denda Keterlambatan (Schedulers & Automations)

| ID | Skenario Pengujian | Langkah Pengujian | Hasil yang Diharapkan | Status |
| :--- | :--- | :--- | :--- | :---: |
| **UAT-6.1** | Trigger Pengingat Tagihan (Tanggal 5) | 1. Jalankan workflow `PV Schedule - Bill Reminder` secara manual via n8n atau POST `/schedule/bill-reminders` dengan `dry_run: true`. | Respons menampilkan daftar warga dengan tagihan pending yang siap dikirimi pengingat (tidak ada pesan riil terkirim). | `[ ]` |
| **UAT-6.2** | Trigger Denda Keterlambatan (Tanggal 11) | 1. Jalankan workflow `PV Schedule - Overdue and Late Fee` secara manual via POST `/schedule/overdue-late-fees` dengan `dry_run: false`. | - Tagihan lewat jatuh tempo otomatis dikenakan denda 5%.<br>- Status berubah menjadi **Overdue**.<br>- Notifikasi peringatan terkirim ke warga bersangkutan. | `[ ]` |
