# Portal Palm Village — Rencana Kerja: Laporan Keuangan Running Balance & RBAC 4 Level

> **Versi**: 2.0  
> **Tanggal**: Juli 2025  
> **Scope**: Implementasi metode Running Balance pada laporan keuangan + restrukturisasi RBAC dari 3 level ke 4 level  
> **Basis kode**: React 18 + Vite + TailwindCSS + Supabase (demo mode dengan mock data)

---

## 1. Goal Utama

### 1.1 Running Balance pada Laporan Keuangan

Mengubah sistem laporan keuangan dari **neraca bulanan terisolasi** menjadi **running balance berkelanjutan**, dimana:

- **Saldo bersih bulan lalu** menjadi **pemasukan (saldo awal/carry-forward)** di bulan ini
- Laporan dimulai dari **Januari 2025** sebagai bulan pertama (saldo awal = Rp 0)
- Bendahara dan warga bisa melakukan **pengecekan silang** antara uang fisik (real) dan laporan digital
- Setiap bulan menampilkan: `Saldo Awal + Pemasukan IPL - Pengeluaran = Saldo Akhir`
- Saldo akhir bulan N otomatis = saldo awal bulan N+1

#### Formula Running Balance

```
Bulan Januari 2025:
  Saldo Awal     = Rp 0 (bulan pertama)
  + Pemasukan    = Total kas masuk IPL Januari 2025
  - Pengeluaran  = Total pengeluaran Januari 2025
  = Saldo Akhir  = Saldo Awal + Pemasukan - Pengeluaran

Bulan Februari 2025:
  Saldo Awal     = Saldo Akhir Januari 2025  ← RUNNING BALANCE
  + Pemasukan    = Total kas masuk IPL Februari 2025
  - Pengeluaran  = Total pengeluaran Februari 2025
  = Saldo Akhir  = Saldo Awal + Pemasukan - Pengeluaran

...dan seterusnya setiap bulan.
```

#### Validasi Silang (Cross-Check)

Bendahara bisa mencocokkan **uang fisik di kas** dengan **saldo akhir di laporan**. Jika tidak cocok, maka ada transaksi yang belum tercatat. Warga (khususnya Pengurus) juga bisa memonitor ini melalui halaman Laporan.

---

### 1.2 Restrukturisasi RBAC dari 3 Level ke 4 Level

Mengubah role dari `admin | rt_rw | resident` menjadi **4 level** yang lebih granular:

| Level | Role (enum)  | Nama Tampilan | Deskripsi                            |
| ----- | ------------ | ------------- | ------------------------------------ |
| 1     | `warga`      | Warga         | Penghuni biasa                       |
| 2     | `pengurus`   | Pengurus      | Pengurus RT/RW non-bendahara         |
| 3     | `bendahara`  | Bendahara     | Pengurus yang mengelola keuangan     |
| 4     | `admin`      | Admin         | Super admin dengan akses penuh       |

---

### 1.3 Matriks Akses per Role

| Fitur                              | Warga | Pengurus | Bendahara | Admin |
| ---------------------------------- | :---: | :------: | :-------: | :---: |
| **Beranda (Dashboard)**            |  ✅   |    ✅    |    ✅     |  ✅   |
| **Data Penghuni** (view)           |  ✅   |    ✅    |    ✅     |  ✅   |
| **Matriks Bayar** (lihat semua)    |  ✅   |    ✅    |    ✅     |  ✅   |
| **Matriks Bayar** - bayar sendiri  | QRIS + Transfer |  QRIS + Transfer | QRIS + Transfer | QRIS + Transfer |
| **Matriks Bayar** - catat semua warga (transfer) | ❌ | ✅ | ✅ | ✅ |
| **Matriks Bayar** - catat semua warga (tunai) | ❌ | ❌ | ✅ | ✅ |
| **Matriks Bayar** - lihat bukti bayar | Rumahnya saja | ✅ Semua | ✅ Semua | ✅ Semua |
| **Pengeluaran** (view only)        |  ❌   |    ✅    |    ✅     |  ✅   |
| **Pengeluaran** (CRUD)             |  ❌   |    ❌    |    ✅     |  ✅   |
| **Laporan Keuangan** (view)        |  ❌   |    ✅    |    ✅     |  ✅   |
| **Pengaturan IPL** (view only)     |  ❌   |    ✅    |    ✅     |  ✅   |
| **Pengaturan IPL** (edit)          |  ❌   |    ❌    |    ❌     |  ✅   |
| **Manajemen User** (gmail-based)   |  ❌   |    ❌    |    ❌     |  ✅   |
| **Log Sistem** (login/access/txn)  |  ❌   |    ❌    |    ❌     |  ✅   |

---

### 1.4 Bukti Pembayaran per Metode

| Metode     | Bukti Pembayaran                                             |
| ---------- | ----------------------------------------------------------- |
| **QRIS**   | Otomatis via webhook (Mayar). Saat ini demo: konfirmasi UI. Bukti = referensi transaksi QRIS dari payment gateway |
| **Transfer** | Upload foto/screenshot bukti transfer dari bank/e-wallet (wajib) |
| **Tunai**  | Upload foto tanda terima yang ditandatangani bendahara (wajib) |

---

## 2. Konteks Teknis Saat Ini

### 2.1 State Kode Saat Ini

- **Frontend**: React 18 + Vite + TailwindCSS, berjalan di **demo mode** (VITE_DEMO_MODE=true)
- **Data**: Semua data mock di `client/src/services/mockData.js` (844 baris)
- **Auth**: Demo auth di `AuthContext.jsx` dengan 3 akun: admin, rt_rw, resident
- **RBAC**: 3 level (`admin`, `rt_rw`, `resident`), gate di frontend (isStaff check)
- **Laporan**: Sudah ada neraca sederhana per bulan (tanpa running balance)
- **Payment Matrix**: Sudah mendukung multi-bulan runut, QRIS/transfer/tunai
- **Expenses**: CRUD sudah ada untuk staff (admin & rt_rw)
- **Settings**: Komponen IPL, denda, penerima tagihan
- **Supabase schema**: Sudah ada di `supabase/schema.sql` tapi belum connected

### 2.2 Apa yang Perlu Diubah

1. **RBAC**: Enum `user_role` dari `('admin', 'rt_rw', 'resident')` → `('admin', 'bendahara', 'pengurus', 'warga')`
2. **Auth/Demo Accounts**: Tambah akun demo bendahara, ubah role mapping
3. **Header/Nav**: Navigasi dinamis per 4 role, bukan 2 (staff/non-staff)
4. **Laporan**: Implementasi running balance dengan carry-forward dari Januari 2025
5. **Expenses**: Pisahkan view-only (pengurus) vs CRUD (bendahara)
6. **PaymentMatrix**: Pisahkan kemampuan per role (warga=sendiri, pengurus=transfer, bendahara=tunai+transfer)
7. **Settings**: Pisahkan view-only (pengurus) vs edit (admin)
8. **Bukti bayar**: Detail view di matriks bayar, scope per role
9. **User Management**: Halaman baru admin-only, berbasis Gmail
10. **Log Sistem**: Halaman baru admin-only (login log, access log, transaction log)
11. **Mock Data**: Generate data pengeluaran Jan 2025-sekarang untuk demo running balance

---

## 3. Prinsip Arsitektur

1. **Demo-first**: Semua perubahan harus bekerja di demo mode. Integrasi Supabase nanti.
2. **Role hierarchy**: `admin > bendahara > pengurus > warga` — role lebih tinggi mewarisi akses role di bawahnya.
3. **Single source of truth**: Running balance dihitung dari data yang ada (bills + payments + expenses), bukan disimpan sebagai angka terpisah.
4. **Backward compatible**: Mock data existing (2025-2026) tetap valid, hanya ditambah data pengeluaran untuk running balance demo.
5. **Agent-executable**: Setiap file yang dihasilkan perencanaan ini harus bisa dieksekusi oleh AI agent secara mandiri tanpa ambiguitas.

---

## 4. Dependensi Antar Komponen

```
┌─────────────────────────────────────────────────────────┐
│                    PERUBAHAN RBAC                        │
│  (mockData role enum + AuthContext + demo accounts)      │
│         ▲ HARUS SELESAI DULU sebelum yang lain          │
└────┬──────────┬──────────┬──────────┬──────────┬────────┘
     │          │          │          │          │
     ▼          ▼          ▼          ▼          ▼
┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
│Header/ │ │Payment │ │Expenses│ │Settings│ │Reports │
│Nav     │ │Matrix  │ │View/   │ │View/   │ │Running │
│per role│ │per role│ │Edit    │ │Edit    │ │Balance │
└────────┘ └────────┘ └────────┘ └────────┘ └───┬────┘
                                                 │
                                                 ▼
                                         ┌──────────────┐
                                         │Mock Expenses │
                                         │Jan 2025-Now  │
                                         │(data source) │
                                         └──────────────┘
                                         
                    TERPISAH (admin-only, bisa paralel):
                    ┌──────────────┐  ┌──────────────┐
                    │User Mgmt     │  │Logging       │
                    │(halaman baru)│  │(halaman baru)│
                    └──────────────┘  └──────────────┘
```

---

## 5. Risiko & Mitigasi

| Risiko | Mitigasi |
| ------ | -------- |
| Breaking change di enum role | Ubah semua referensi `rt_rw` → `pengurus`/`bendahara` sekaligus |
| Mock data inconsistency | Unit test sederhana untuk validasi running balance = saldo akhir |
| QRIS bukti bayar belum jelas | Sementara: referensi transaksi sebagai bukti; nanti dari Mayar webhook |
| Performance laporan banyak bulan | Lazy compute, memoize per periode |

---

## 6. Definisi Selesai (Definition of Done)

- [x] Role 4 level berfungsi: login sebagai warga/pengurus/bendahara/admin menampilkan menu & akses yang benar
- [x] Laporan keuangan menampilkan running balance dari Januari 2025 sampai bulan terkini
- [x] Saldo akhir bulan N = saldo awal bulan N+1 (tervalidasi di semua bulan)
- [x] Warga hanya bisa bayar rumahnya sendiri via QRIS/transfer
- [x] Pengurus bisa catat IPL semua warga via transfer + lihat pengeluaran & laporan (view only)
- [x] Bendahara bisa catat IPL via tunai + CRUD pengeluaran
- [x] Admin bisa edit settings + manage user (Gmail) + akses log
- [x] Bukti bayar (QRIS/transfer/tunai) bisa dilihat di detail matriks bayar
- [x] Semua fitur berjalan di demo mode tanpa Supabase
- [x] **Inovasi Phase 5 Selesai**: Mobile menu solid 100% dengan React Portal, edit profil mandiri, verifikasi transfer dengan zoom & client-side image compression (<500 KB), alur approval warga baru, notifikasi proaktif, dan arsitektur login Google JWT n8n.
