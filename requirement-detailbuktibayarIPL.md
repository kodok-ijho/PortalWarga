# 📋 Requirement Detail Bukti Pembayaran IPL (kaidah Kiro)

> **Dokumen Spesifikasi Kebutuhan Sistem & User Stories**  
> **Sistem:** Portal Warga Palm Village  
> **Modul:** Matriks Pembayaran & Detail Bukti Bayar IPL  
> **Tanggal:** 26 Juli 2026  

---

## 1. 📖 Deskripsi Persyaratan (Requirement Overview)

Dokumen ini mendefinisikan kebutuhan fungsional dan non-fungsional untuk perbaikan modul **Detail Bukti Pembayaran IPL** pada Matriks Pembayaran. Tujuan utama dari spesifikasi ini adalah memastikan **konsistensi data (unit & periode)**, **kesetaraan tampilan bukti bayar antara Warga dan Staff untuk unit milik Warga**, serta **penampilan tanggal bayar yang akurat**.

---

## 2. 👤 User Stories

### US-01: Warga Melihat Bukti Transfer Milik Sendiri
**Sebagai** Warga Palm Village  
**Saya ingin** membuka detail bukti pembayaran IPL bulan apa pun (termasuk Agustus & September) pada unit rumah saya melalui Matriks Pembayaran  
**Agar** saya dapat memastikan bukti transfer yang saya unggah telah tersimpan dengan benar dan dapat saya periksa kembali sewaktu-waktu.

### US-02: Staff/Admin Mengakses Bukti Bayar Seluruh Unit
**Sebagai** Bendahara / Admin / Pengurus RT  
**Saya ingin** membuka detail bukti pembayaran IPL pada unit rumah mana pun  
**Agar** saya dapat memverifikasi keabsahan bukti bayar dan mencocokkan nominal serta tanggal pembayaran warga.

### US-03: Ketersediaan Tanggal Pembayaran & Informasi Rumah yang Akurat
**Sebagai** Warga maupun Staff  
**Saya ingin** detail modal pembayaran menampilkan nomor Blok/Unit yang tepat dan tanggal pembayaran yang valid  
**Agar** tidak ada keraguan atau ketidakcocokan data finansial.

---

## 3. 🎯 Spesifikasi Kebutuhan Fungsional (Format EARS / Given-When-Then)

### REQ-1: Presisi Pemetaan Sel Matriks Pembayaran (Period Key Matching)
- **Given** Pengguna membuka halaman Matriks Pembayaran pada tahun buku tertentu.
- **When** Pengguna mengeklik sel pada kolom bulan tertentu (misalnya `Agt '26` atau `Sep '26`).
- **Then** Sistem **WAJIB** mengambil dan menampilkan tagihan (`bill`) yang memiliki kode `period` persis sesuai dengan kolom bulan tersebut (`2026-08` atau `2026-09`), bukan berdasarkan urutan index array numerik `cells[mIdx]`.

### REQ-2: Paritas Fitur Bukti Transfer untuk Unit Sendiri (Own-Unit Proof Visibility)
- **Given** Seorang Warga mengeklik sel dengan status `Lunas`, `Menunggu Verifikasi`, atau `Ditolak` pada unit rumahnya sendiri (`unit_id === myUnitId`).
- **When** Modal Detail Bukti Pembayaran IPL terbuka.
- **Then** Sistem **WAJIB** menampilkan komponen lampiran bukti transfer (thumbnail gambar / link unduh) secara identik seperti yang dilihat oleh Admin/Bendahara, selama file bukti transfer tersedia untuk pembayaran tersebut.

### REQ-3: Konsistensi Data Unit & Blok Rumah (Unit Identity Integrity)
- **Given** Pengguna mengeklik sel pembayaran pada baris rumah tertentu (misalnya Rumah `CB1 No 8`).
- **When** Modal Detail Bukti Pembayaran IPL terbuka.
- **Then** Sistem **WAJIB** menampilkan nomor blok dan unit yang sesuai dengan baris rumah yang diklik (`Blok C/08` atau `CB1/08`), tanpa ada pergeseran (*skew*) ke unit lain (seperti `Blok B/03`).

### REQ-4: Resolusi Tanggal Pembayaran (Payment Date Resolution)
- **Given** Modal Detail Bukti Pembayaran IPL dibuka untuk tagihan yang telah memiliki rekaman pembayaran (`payment`).
- **When** Sistem memuat informasi tanggal bayar.
- **Then** Sistem **WAJIB** menampilkan tanggal transaksi bayar secara terformat (misalnya `10 Agu 2026`). Jika `paid_at` pada payment tidak tersedia, sistem menggunakan fallback bertingkat (`created_at` / `due_date`), sehingga tidak menampilkan tanda strip (`-`).

---

## 4. 🛡️ Spesifikasi Hak Akses (RBAC Matrix)

| Aksi / Tampilan | Warga (Unit Sendiri) | Warga (Unit Lain) | Pengurus / Bendahara / Admin |
| :--- | :---: | :---: | :---: |
| **Buka Detail Modal (Sel Lunas/Verif/Tolak)** | ✅ Buka | ✅ Buka | ✅ Buka |
| **Lihat Rincian Tagihan & Periode** | ✅ Tampil | ✅ Tampil | ✅ Tampil |
| **Lihat Tanggal Pembayaran** | ✅ Tampil | ✅ Tampil | ✅ Tampil |
| **Lihat File Bukti Transfer (Image/PDF)** | ✅ Tampil | 🔒 Terkunci (Pesan Akses) | ✅ Tampil |
| **Verifikasi / Tolak Bukti Bayar** | ❌ Tidak Ada | ❌ Tidak Ada | ✅ Tampil (Khusus Bendahara/Admin) |

---

## 5. ✅ Kriteria Penerimaan & Kebutuhan Non-Fungsional

### Kriteria Penerimaan (Acceptance Criteria)
1. **Pengujian Sel Agustus & September**:
   - Mengeklik sel Agustus pada Unit Warga menampilkan periode `Agustus 2026` (`2026-08`).
   - Mengeklik sel September pada Unit Warga menampilkan periode `September 2026` (`2026-09`).
2. **Pengujian Tampilan Bukti Transfer**:
   - Login sebagai `warga@palmvillage.id` -> Buka Matriks Pembayaran -> Klik sel lunas/verifikasi pada rumah sendiri -> Bukti transfer (thumbnail/link) terlihat jelas.
3. **Pengujian Informasi Unit**:
   - Menampilkan nomor unit rumah yang diklik secara 100% cocok.
4. **Pengujian Tanggal Bayar**:
   - Tanggal bayar terisi dengan format tanggal Indonesia (mis. `08 Agu 2026`), bukan `-`.

### Kebutuhan Non-Fungsional (Non-Functional Requirements)
- **Performansi**: Loading detail modal dari klik sel < 100ms.
- **Keamanan (UU PDP)**: Warga tidak dapat mengakses file bukti transfer milik warga unit lain melalui Manipulasi URL / Param Injection.

---
*Dokumen ini merupakan spesifikasi kebutuhan resmi perbaikan Detail Bukti Pembayaran IPL.*
