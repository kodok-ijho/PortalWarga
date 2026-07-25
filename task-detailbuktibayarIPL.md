# 🛠️ Task Detail Bukti Pembayaran IPL (kaidah Kiro)

> **Dokumen Daftar Tugas Implementasi & Verifikasi Kode**  
> **Sistem:** Portal Warga Palm Village  
> **Modul:** Matriks Pembayaran & Detail Bukti Bayar IPL  
> **Tanggal:** 26 Juli 2026  

---

## 1. 📝 Daftar Tugas Implementasi (Task Overview)

Berikut adalah urutan tugas eksekusi perbaikan bug detail bukti bayar IPL:

```
┌───────────┐      ┌───────────┐      ┌───────────┐      ┌───────────┐      ┌───────────┐
│  TASK-01  │ ───► │  TASK-02  │ ───► │  TASK-03  │ ───► │  TASK-04  │ ───► │  TASK-05  │
│ Matrix Map│      │ Data Layer│      │ Modal Context│    │ Date & Payment│   │ Testing   │
└───────────┘      └───────────┘      └───────────┘      └───────────┘      └───────────┘
```

| Task ID | Nama Tugas | File Target | Estimasi | Status |
| :--- | :--- | :--- | :---: | :---: |
| **TASK-01** | Implementasi Period-Key Lookup pada Rendering Cell Matriks | `client/src/pages/PaymentMatrix.jsx` | 20 mnt | 🚀 Ready |
| **TASK-02** | Penyelarasan Array Period `getBillMatrix` & `normalizeBillMatrixRows` | `client/src/services/mockData.js`, `client/src/services/dataService.js` | 25 mnt | 🚀 Ready |
| **TASK-03** | Refactoring Context Unit & Pengecekan Hak Akses Warga di Modal | `client/src/pages/PaymentMatrix.jsx` | 20 mnt | 🚀 Ready |
| **TASK-04** | Perbaikan Resolusi Payment Object & Tanggal Bayar (`getResolvedPaymentDate`) | `client/src/pages/PaymentMatrix.jsx`, `client/src/services/dataService.js` | 15 mnt | 🚀 Ready |
| **TASK-05** | Pengujian & Verifikasi Lintasan Peran (Warga vs Admin/Bendahara) | Test Suite & Manual Run | 20 mnt | 🚀 Ready |

---

## 2. 🔍 Detail Langkah Pengerjaan Per Task

### TASK-01: Implementasi Period-Key Lookup pada Rendering Cell Matriks
- **Tujuan**: Mencegah mismatch sel saat mengeklik kolom bulan pada Matriks Pembayaran.
- **Langkah-langkah**:
  1. Buka [PaymentMatrix.jsx](file:///C:/Users/dhaniy/orca/workspaces/PortalPalmVillage/https-github.com-kodok-ijho-PortalWarga/client/src/pages/PaymentMatrix.jsx).
  2. Cari iterasi kolom bulan `{row.cells.map((cell, mIdx) => ...)}`.
  3. Ganti pengambilan `cell` dari indeks array `mIdx` menjadi pencocokan berbasis `matrixMonths[mIdx].period`:
     ```javascript
     const targetPeriod = matrixMonths[mIdx].period;
     const cell = row.cells.find((c) => c?.bill?.period === targetPeriod) || null;
     ```
  4. Pastikan handler `onClick` mengesekusi `cell.bill` dan `cell.payment` yang telah terelasi dengan `targetPeriod` secara presisi.

### TASK-02: Penyelarasan Array Period di Data Layer
- **Tujuan**: Memastikan data layer menghasilkan array `cells` dengan rentang periode 12 bulan yang seragam (Juli `year` s.d. Juni `year+1`).
- **Langkah-langkah**:
  1. Buka [mockData.js](file:///C:/Users/dhaniy/orca/workspaces/PortalPalmVillage/https-github.com-kodok-ijho-PortalWarga/client/src/services/mockData.js) pada fungsi `getBillMatrix(year, opts)`.
  2. Perbarui perulangan pembentukan `cells` agar menggunakan array rentang periode 12 bulan tahun buku (Juli tahun berjalan s.d. Juni tahun berikutnya).
  3. Buka [dataService.js](file:///C:/Users/dhaniy/orca/workspaces/PortalPalmVillage/https-github.com-kodok-ijho-PortalWarga/client/src/services/dataService.js) pada fungsi `normalizeBillMatrixRows`.
  4. Pastikan `normalizeBillMatrixRows` mempertahankan objek `period` asli pada tiap cell tanpa memotong atau mengacak urutan.

### TASK-03: Refactoring Context Unit & Pengecekan Hak Akses Warga di Modal
- **Tujuan**: Menjamin modal detail menampilkan informasi unit rumah yang diklik dan memberikan hak akses bukti bayar bagi Warga pemilik unit.
- **Langkah-langkah**:
  1. Buka `PaymentDetailModal` di [PaymentMatrix.jsx](file:///C:/Users/dhaniy/orca/workspaces/PortalPalmVillage/https-github.com-kodok-ijho-PortalWarga/client/src/pages/PaymentMatrix.jsx).
  2. Oper objek `unit` langsung dari `row.unit` saat membuka modal (`setDetailModal({ bill: cell.bill, payment, unit: row.unit })`).
  3. Gunakan `unit` yang dikirim dari props modal sebagai sumber utama penayangan nomor rumah (`Blok ${unit.block}/${unit.unit_number}`).
  4. Perbarui evaluasi `isMyUnit`:
     ```javascript
     const resolvedUnitId = unit?.id ?? bill?.unit_id ?? payment?.unit_id;
     const isMyUnit = String(resolvedUnitId) === String(myUnitId);
     ```

### TASK-04: Perbaikan Resolusi Payment Object & Tanggal Bayar
- **Tujuan**: Memastikan `paid_at` selalu terisi dan tidak menampilkan strip (`-`).
- **Langkah-langkah**:
  1. Di `PaymentMatrix.jsx`, perbarui `getResolvedPaymentDate`:
     ```javascript
     function getResolvedPaymentDate(payment, bill) {
       return (
         payment?.paid_at ||
         payment?.paidAt ||
         payment?.completed_at ||
         payment?.verified_at ||
         payment?.metadata?.paid_at ||
         bill?.paid_at ||
         bill?.due_date || // Fallback aman
         ''
       );
     }
     ```
  2. Pastikan `mergePaymentDetails` mengambil `proof_file_url` dan `receipt_file` dari `payment` secara utuh.

---

## 3. 🧪 Skenario Pengujian & Test Checklist

- [ ] **Test 1: Verifikasi Keselarasan Bulan & Unit (No Data Skew)**
  - Login sebagai Admin atau Warga.
  - Buka Matriks Pembayaran untuk Tahun Buku 2026/2027.
  - Klik sel pada kolom **Agt '26** untuk rumah **A/02** (Siti Rahayu).
  - *Ekspektasi*: Modal menampilkan `Blok A/02` dan Periode IPL `Agustus 2026`.
  - Klik sel pada kolom **Sep '26** untuk rumah **A/02**.
  - *Ekspektasi*: Modal menampilkan `Blok A/02` dan Periode IPL `September 2026`.

- [ ] **Test 2: Verifikasi Akses Bukti Bayar Warga (Warga Own-Unit Proof)**
  - Login sebagai Warga (`warga@palmvillage.id`).
  - Buka Matriks Pembayaran -> Pilih rumah sendiri (`Blok A/02`).
  - Klik sel periode yang berstatus `Menunggu Verifikasi` atau `Lunas`.
  - *Ekspektasi*: Bukti transfer (gambar / attachment) tampil dengan jelas, **bukan** tulisan "Tidak ada file bukti transfer...".

- [ ] **Test 3: Verifikasi Tanggal Bayar**
  - Pada modal detail yang sama, periksa field **Tanggal Bayar**.
  - *Ekspektasi*: Menampilkan tanggal terformat yang valid (misalnya `10 Agu 2026`), bukan `-`.

- [ ] **Test 4: Verifikasi Proteksi Unit Lain (Warga Security)**
  - Login sebagai Warga (`warga@palmvillage.id`).
  - Klik sel lunas pada unit milik warga lain (misal `Blok A/01`).
  - *Ekspektasi*: Menampilkan modal detail dengan proteksi `"🔒 Anda tidak memiliki izin untuk melihat bukti pembayaran unit lain"`.

---
*Dokumen ini merupakan panduan tugas eksekusi dan skenario pengujian perbaikan detail bukti bayar IPL.*
