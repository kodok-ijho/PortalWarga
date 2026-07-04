# Portal Palm Village — Task List
# Laporan Keuangan Running Balance & RBAC 4 Level

> **Cara baca**: Setiap task adalah unit kerja yang bisa dikerjakan oleh satu agent.  
> **Dependency**: Task harus dikerjakan sesuai urutan fase. Dalam satu fase, task yang tidak saling bergantung bisa dikerjakan paralel.  
> **Referensi**: Lihat `PLANNING.md` untuk konteks dan `REQUIREMENTS.md` untuk spesifikasi teknis detail.

---

## Fase 0: Fondasi RBAC (HARUS SELESAI SEBELUM FASE LAIN)

> Semua task di fase ini mengubah fondasi role system. Fase 1-3 bergantung pada hasil fase ini.

### Task 0.1: Update Role System di mockData.js

**File**: `client/src/services/mockData.js`  
**Estimasi**: Sedang  
**Dependency**: Tidak ada

**Langkah-langkah:**

1. Tambah konstanta role hierarchy:
   ```javascript
   const ROLE_LEVEL = { warga: 1, pengurus: 2, bendahara: 3, admin: 4 };
   ```

2. Tambah helper functions:
   - `hasMinRole(userRole, minRole)` → boolean
   - `isStaffRole(role)` → `hasMinRole(role, 'pengurus')`
   - `isBendaharaOrAbove(role)` → `hasMinRole(role, 'bendahara')`
   - `isAdminRole(role)` → `role === 'admin'`

3. Update `roleLabel()`:
   ```
   admin → 'Admin', bendahara → 'Bendahara', pengurus → 'Pengurus', warga → 'Warga'
   ```

4. Update `roleColor()`:
   ```
   admin → 'bg-gold-500 text-forest-900'
   bendahara → 'bg-emerald-600 text-white'
   pengurus → 'bg-forest-800 text-gold-400'
   warga → 'bg-forest-100 text-forest-700 border border-forest-200'
   ```

5. Update `mockProfiles`:
   - `demo-admin`: role tetap `'admin'`, full_name → `'Pak Hendra (Admin)'`
   - `demo-rt` → rename ke `demo-bendahara`: role → `'bendahara'`, full_name → `'Budi Santoso (Bendahara)'`
   - Tambah profil baru `demo-pengurus`: role `'pengurus'`, full_name `'Ibu Ratna (Pengurus RT)'`, unit_id: salah satu unit yang tersedia, email `'pengurus@palmvillage.id'`
   - `demo-warga`: role → `'warga'` (dari `'resident'`)
   - Semua profil warga lain (p-4 sampai p-14): role → `'warga'` (dari `'resident'`)

6. Update `mockUnits` jika perlu: `owner_id: 'demo-rt'` → `owner_id: 'demo-bendahara'`

7. Export semua fungsi baru

**Validasi**: 
- `hasMinRole('admin', 'warga')` === true
- `hasMinRole('warga', 'bendahara')` === false
- `roleLabel('bendahara')` === 'Bendahara'
- Tidak ada referensi `'rt_rw'` atau `'resident'` tersisa di file ini

---

### Task 0.2: Update AuthContext.jsx — 4 Demo Accounts

**File**: `client/src/context/AuthContext.jsx`  
**Estimasi**: Kecil  
**Dependency**: Task 0.1

**Langkah-langkah:**

1. Update `DEMO_ACCOUNTS` menjadi 4 akun:
   - `admin@palmvillage.id` → role `'admin'`, id `'demo-admin'`
   - `bendahara@palmvillage.id` → role `'bendahara'`, id `'demo-bendahara'`, unit_id: 1
   - `pengurus@palmvillage.id` → role `'pengurus'`, id `'demo-pengurus'`, unit_id sesuai profil baru
   - `warga@palmvillage.id` → role `'warga'`, id `'demo-warga'`, unit_id: 2

2. Hapus entry `rt@palmvillage.id` yang lama

3. Update `DEMO_USERS` (otomatis dari DEMO_ACCOUNTS values)

**Validasi**: Login dengan 4 email berbeda menghasilkan 4 role berbeda.

---

### Task 0.3: Update Header.jsx — Navigasi per 4 Role

**File**: `client/src/components/Header.jsx`  
**Estimasi**: Sedang  
**Dependency**: Task 0.1

**Langkah-langkah:**

1. Import `hasMinRole`, `isAdminRole` dari `mockData.js`

2. Hapus variabel `mainNav` dan `staffNav` yang lama

3. Buat konfigurasi navigasi baru:
   ```
   Base (semua role):     Beranda, Penghuni, Matriks Bayar
   Pengurus+ (staff):     + Rumah, Pengeluaran, Laporan, Pengaturan
   Admin saja:            + Kelola User, Log Sistem
   ```

4. Buat fungsi `getNavItems(role)` yang mengembalikan array menu sesuai role

5. Import icon baru yang dibutuhkan (AiOutlineTeam, AiOutlineFileText atau sejenisnya)

6. Update logika `isStaff` → gunakan `isStaffRole(role)` dari mockData

**Validasi**: 
- Login sebagai warga → 3 menu (Beranda, Penghuni, Matriks Bayar)
- Login sebagai pengurus → 7 menu (+ Rumah, Pengeluaran, Laporan, Pengaturan)
- Login sebagai bendahara → 7 menu (sama dengan pengurus)
- Login sebagai admin → 9 menu (+ Kelola User, Log Sistem)

---

### Task 0.4: Update Login.jsx — Info 4 Akun Demo

**File**: `client/src/pages/Login.jsx`  
**Estimasi**: Kecil  
**Dependency**: Task 0.2

**Langkah-langkah:**

1. Update tampilan info akun demo di halaman login
2. Tampilkan 4 akun: admin, bendahara, pengurus, warga
3. Setiap akun tampilkan: email, password, dan deskripsi singkat role-nya

**Validasi**: Halaman login menampilkan 4 akun demo dengan informasi yang benar.

---

## Fase 1: Running Balance & Laporan Keuangan

> Fase ini mengimplementasikan inti running balance. Bisa dikerjakan setelah Fase 0 selesai.

### Task 1.1: Generate Mock Expenses dari Januari 2025

**File**: `client/src/services/mockData.js`  
**Estimasi**: Sedang  
**Dependency**: Fase 0 selesai

**Langkah-langkah:**

1. Buat fungsi generator `generateMonthlyExpenses()` yang menghasilkan data pengeluaran deterministik dari Januari 2025 sampai bulan saat ini

2. Spesifikasi per bulan:
   - **Setiap bulan**: Kebersihan Rp 750.000 + Keamanan Rp 1.800.000 (total tetap Rp 2.550.000)
   - **Bulan genap**: + Listrik & Air Rp 1.250.000
   - **Setiap 3 bulan** (Mar, Jun, Sep, Des): + Perawatan Fasilitas Rp 500.000
   - **Setiap 6 bulan** (Jun, Des): + Administrasi Rp 300.000

3. Format data expense:
   ```javascript
   {
     id: `exp-gen-${year}-${String(month).padStart(2,'0')}-${index}`,
     date: `${year}-${String(month).padStart(2,'0')}-05`,
     category: '...',
     amount: ...,
     description: '... (periode Bulan Tahun)',
     receipt_file: `kwitansi-${category}-${period}.pdf`,
     recorded_by: 'Budi Santoso (Bendahara)',
     created_at: `${year}-${String(month).padStart(2,'0')}-05T08:00:00Z`,
   }
   ```

4. Gabungkan dengan `mockExpenses` yang sudah ada (jangan hapus data existing)

5. Pastikan tidak ada duplikasi ID

**Validasi**: 
- `getExpensesForPeriod('2025-01')` mengembalikan minimal 2 record
- `getExpensesForPeriod('2025-06')` mengembalikan 4-5 record
- Total pengeluaran Januari 2025 = Rp 2.550.000

---

### Task 1.2: Implementasi Fungsi Running Balance

**File**: `client/src/services/mockData.js`  
**Estimasi**: Sedang  
**Dependency**: Task 1.1

**Langkah-langkah:**

1. Implementasi `computeRunningBalance(targetYear, targetMonth)`:
   - Iterasi dari Januari 2025 (bulan pertama, saldo awal = 0) sampai bulan target
   - Setiap bulan: `saldoAwal + pemasukan - pengeluaran = saldoAkhir`
   - `saldoAkhir` bulan ini = `saldoAwal` bulan berikutnya
   - Return array objek per bulan

2. Implementasi `getMonthBalance(year, month)`:
   - Panggil `computeRunningBalance` sampai bulan target
   - Return objek bulan terakhir dari chain

3. Pastikan menggunakan `getPaymentsByMonth()` dan `getExpensesForPeriod()` yang sudah ada

4. Export kedua fungsi

**Validasi**:
- `computeRunningBalance(2025, 1)` → 1 elemen, openingBalance = 0
- `computeRunningBalance(2025, 3)` → 3 elemen
- Element ke-2 `openingBalance` === element ke-1 `closingBalance`
- Tidak ada gap atau lompatan di chain

---

### Task 1.3: Redesign Reports.jsx dengan Running Balance

**File**: `client/src/pages/Reports.jsx`  
**Estimasi**: Besar  
**Dependency**: Task 1.2

**Langkah-langkah:**

1. Update guard akses:
   ```javascript
   if (!hasMinRole(role, 'pengurus')) return <Navigate to="/" replace />;
   ```

2. Import `computeRunningBalance`, `getMonthBalance` dari mockData

3. Tambah state untuk range tahun (default: 2025 sampai tahun saat ini)

4. **Section 1 — Summary Cards** (bagian atas):
   - 4 kartu: Saldo Awal, Pemasukan IPL, Pengeluaran, Saldo Akhir
   - Data dari `getMonthBalance(year, month)`
   - Saldo negatif → warna merah

5. **Section 2 — Tabel Running Balance** (baru):
   - Tabel dengan kolom: No | Periode | Saldo Awal | Pemasukan | Pengeluaran | Saldo Akhir
   - Data dari `computeRunningBalance(year, month)` untuk semua bulan sampai bulan terpilih
   - Baris bulan terpilih di-highlight
   - Saldo negatif ditandai warna merah
   - Format mata uang Rupiah di semua kolom
   - Footer: total keseluruhan

6. **Section 3 — Grafik Tren Saldo** (baru):
   - Gunakan recharts `AreaChart` atau `LineChart`
   - X-axis: bulan-bulan (Jan 2025 - bulan terpilih)
   - Y-axis: nominal Rupiah
   - 3 area/garis: Pemasukan (hijau), Pengeluaran (merah), Saldo Akhir (biru/emas)
   - Tooltip: tampilkan detail per bulan

7. **Section 4 — Perbandingan per Blok** (retained):
   - BarChart per blok (sudah ada)
   - PieChart status pembayaran (sudah ada)

8. **Section 5 — Detail Bulan Terpilih** (updated):
   - Kas Masuk IPL (tabel, sudah ada)
   - Pengeluaran Bendahara (list, sudah ada)
   - **Neraca Arus Kas** — update dengan running balance:
     ```
     Saldo Awal (dari bulan lalu)  + Rp A
     Pemasukan IPL bulan ini       + Rp X
     Pengeluaran bulan ini         - Rp Y
     ─────────────────────────────
     Saldo Akhir                   = Rp (A + X - Y)
     ```

9. Pastikan export CSV dan print/PDF masih berfungsi (update content-nya)

**Validasi**:
- Buka halaman Laporan → summary cards menampilkan saldo awal dari bulan lalu
- Tabel running balance menampilkan chain dari Jan 2025
- Saldo akhir bulan N = saldo awal bulan N+1 (visual check)
- Grafik tren menampilkan 3 garis/area
- Neraca arus kas menampilkan saldo awal sebagai baris pertama

---

## Fase 2: Akses Control per Halaman

> Task-task di fase ini bisa dikerjakan paralel satu sama lain, setelah Fase 0 selesai.

### Task 2.1: Update PaymentMatrix.jsx — Akses per Role

**File**: `client/src/pages/PaymentMatrix.jsx`  
**Estimasi**: Besar  
**Dependency**: Fase 0 selesai

**Langkah-langkah:**

1. Import `hasMinRole`, `isBendaharaOrAbove`, `isStaffRole` dari mockData

2. Update variabel kontrol:
   ```javascript
   const canRecordForOthers = isStaffRole(role);      // pengurus+
   const canRecordCash = isBendaharaOrAbove(role);     // bendahara+
   const isMyUnit = role === 'warga' && row.unit.id === myUnitId;
   ```

3. Update `canInteract` logic:
   - **Warga**: hanya bisa klik sel di baris unit sendiri
   - **Pengurus+**: bisa klik sel semua unit

4. Update footer bayar:
   - **Warga**: tombol "Bayar via QRIS →" (tetap)
   - **Pengurus** (bukan bendahara): tombol "Catat Pembayaran →" → buka modal TANPA opsi tunai
   - **Bendahara+**: tombol "Catat Pembayaran →" → buka modal DENGAN opsi tunai

5. Update `ManualPaymentModal`:
   - Terima prop `role` 
   - Jika `!canRecordCash`: grid 2 kolom (Transfer, QRIS), default 'bank_transfer'
   - Jika `canRecordCash`: grid 3 kolom (Tunai, Transfer, QRIS), default 'cash'

6. **Tambah PaymentDetailPopover/Modal**:
   - Buat komponen baru yang muncul saat klik sel **Lunas** di matriks
   - Tampilkan: periode, jumlah, tanggal bayar, metode, bukti bayar (file name), dicatat oleh, catatan
   - **Warga**: hanya bisa lihat detail di baris unit sendiri
   - **Pengurus+**: bisa lihat detail semua unit
   - Jika tidak ada bukti bayar (QRIS otomatis): tampilkan referensi transaksi

7. Update `ResidentPayModal` (modal warga):
   - Tetap 2 metode: QRIS + Transfer
   - Tidak perlu perubahan besar, hanya pastikan role check benar

**Validasi**:
- Login sebagai warga → hanya bisa klik sel di baris "Rumah Saya"
- Login sebagai pengurus → bisa catat semua warga, modal TANPA opsi tunai
- Login sebagai bendahara → bisa catat semua warga, modal DENGAN opsi tunai
- Klik sel Lunas → popover/modal menampilkan detail pembayaran + bukti

---

### Task 2.2: Update Expenses.jsx — View vs CRUD per Role

**File**: `client/src/pages/Expenses.jsx`  
**Estimasi**: Kecil  
**Dependency**: Fase 0 selesai

**Langkah-langkah:**

1. Import `hasMinRole`, `isBendaharaOrAbove` dari mockData

2. Update guard:
   ```javascript
   if (!hasMinRole(role, 'pengurus')) return <Navigate to="/" replace />;
   ```

3. Tentukan kemampuan edit:
   ```javascript
   const canEdit = isBendaharaOrAbove(role);
   ```

4. Conditional rendering:
   - Tombol "Catat Pengeluaran": `{canEdit && <button>...</button>}`
   - Tombol Edit per item: `{canEdit && <button>...</button>}`
   - Tombol Delete per item: `{canEdit && <button>...</button>}`
   - Tombol lihat bukti (AiOutlinePaperClip): tetap visible untuk semua (pengurus+)

5. Jika `!canEdit`, tampilkan banner info di atas:
   ```jsx
   {!canEdit && (
     <div className="pv-card p-3 bg-amber-50 border-amber-200 text-amber-700 text-sm">
       ℹ️ Anda melihat data pengeluaran dalam mode read-only. 
       Hanya Bendahara yang dapat mencatat/mengubah pengeluaran.
     </div>
   )}
   ```

**Validasi**:
- Login sebagai pengurus → bisa lihat pengeluaran, tidak ada tombol Catat/Edit/Delete
- Login sebagai bendahara → bisa lihat + CRUD pengeluaran
- Login sebagai warga → redirect ke beranda

---

### Task 2.3: Update Settings.jsx — View vs Edit per Role

**File**: `client/src/pages/Settings.jsx`  
**Estimasi**: Kecil  
**Dependency**: Fase 0 selesai

**Langkah-langkah:**

1. Import `hasMinRole`, `isAdminRole` dari mockData

2. Update guard:
   ```javascript
   if (!hasMinRole(role, 'pengurus')) return <Navigate to="/" replace />;
   ```

3. Tentukan kemampuan edit:
   ```javascript
   const canEdit = isAdminRole(role);
   ```

4. Jika `!canEdit`:
   - Semua input → tambah `disabled` attribute
   - Tombol "Simpan Pengaturan" → hidden
   - Tombol "Tambah" komponen → hidden
   - Tombol "Hapus" komponen → hidden
   - Toggle denda → disabled
   - Radio penerima tagihan → disabled

5. Tampilkan banner info:
   ```jsx
   {!canEdit && (
     <div className="pv-card p-3 bg-blue-50 border-blue-200 text-blue-700 text-sm">
       ℹ️ Anda melihat pengaturan dalam mode read-only. 
       Hanya Admin yang dapat mengubah pengaturan.
     </div>
   )}
   ```

**Validasi**:
- Login sebagai pengurus → bisa lihat settings, semua input disabled, no save button
- Login sebagai bendahara → sama (view only)
- Login sebagai admin → bisa edit semua
- Login sebagai warga → redirect ke beranda

---

## Fase 3: Halaman Baru (Admin-Only)

> Task-task di fase ini bisa dikerjakan paralel satu sama lain. Butuh Fase 0 selesai.

### Task 3.1: Buat Halaman User Management (Users.jsx)

**File**: `client/src/pages/Users.jsx` (BARU)  
**Estimasi**: Besar  
**Dependency**: Fase 0 selesai

**Langkah-langkah:**

1. Buat file `client/src/pages/Users.jsx`

2. Guard: `if (!isAdminRole(role)) return <Navigate to="/" replace />;`

3. **Daftar User** — Tabel dengan kolom:
   - Nama Lengkap
   - Email (Gmail)
   - Role (badge berwarna)
   - Unit (Blok/No)
   - Status (Aktif/Nonaktif)
   - Aksi (Edit, Nonaktifkan)

4. **Tombol "Tambah User"** → buka modal form:
   - Email: input text, validasi harus `@gmail.com`
   - Nama: autocomplete dari `mockProfiles` yang belum punya akun, atau input manual
   - Role: dropdown (warga, pengurus, bendahara, admin)
   - Unit: dropdown dari `mockUnits` (opsional)

5. **Edit User** → modal form:
   - Ubah role (dropdown)
   - Ubah status aktif/nonaktif (toggle)
   - Ubah unit assignment (dropdown)

6. **Nonaktifkan User** → konfirmasi dialog → set `is_active = false`

7. **Mock functions** di mockData.js:
   ```javascript
   export function getUserList() { return mockProfiles.filter(p => p.email); }
   export function addMockUser(data) { ... } // push ke mockProfiles
   export function updateMockUser(id, data) { ... } // update di mockProfiles
   export function deactivateMockUser(id) { ... } // set is_active = false
   ```

8. Styling: konsisten dengan halaman lain (pv-card, pv-btn, dll)

**Validasi**:
- Login sebagai admin → bisa akses /users
- Login sebagai role lain → redirect ke beranda
- Tabel menampilkan semua profil yang punya email
- Tambah user → muncul di tabel
- Email non-Gmail → error validasi

---

### Task 3.2: Buat Halaman Log Sistem (Logs.jsx)

**File**: `client/src/pages/Logs.jsx` (BARU)  
**Estimasi**: Besar  
**Dependency**: Fase 0 selesai

**Langkah-langkah:**

1. Buat file `client/src/pages/Logs.jsx`

2. Guard: `if (!isAdminRole(role)) return <Navigate to="/" replace />;`

3. **Tab/Segment 3 jenis log**:
   - Login Log
   - Access Log
   - Transaction Log

4. **Toggle per jenis log** (di header tab):
   - Switch on/off untuk setiap jenis log
   - State disimpan di `mockLogSettings` (mockData.js)
   - Jika off: tampilkan pesan "Log ini dinonaktifkan"

5. **Mock Log Data** — tambah di mockData.js:
   ```javascript
   export const mockLogSettings = {
     loginLogEnabled: true,
     accessLogEnabled: true,
     transactionLogEnabled: true,
   };

   export const mockLoginLogs = [
     { id: 'log-1', userId: 'demo-admin', email: 'admin@palmvillage.id',
       timestamp: '2026-07-01T08:00:00Z', status: 'success', ip: '192.168.1.10' },
     { id: 'log-2', userId: 'demo-warga', email: 'warga@palmvillage.id',
       timestamp: '2026-07-01T09:30:00Z', status: 'success', ip: '192.168.1.15' },
     { id: 'log-3', userId: null, email: 'unknown@test.com',
       timestamp: '2026-07-01T10:00:00Z', status: 'failed', ip: '10.0.0.5' },
     // ... generate 15-20 entries
   ];

   export const mockAccessLogs = [
     { id: 'acc-1', userId: 'demo-warga', page: '/payment-matrix',
       timestamp: '2026-07-01T09:31:00Z' },
     // ... generate 20-30 entries
   ];

   export const mockTransactionLogs = [
     { id: 'txn-1', userId: 'demo-bendahara', action: 'record_payment',
       amount: 500000, targetBillId: 'bill-1', method: 'cash',
       timestamp: '2026-07-01T10:00:00Z' },
     { id: 'txn-2', userId: 'demo-warga', action: 'pay_ipl',
       amount: 500000, targetBillId: 'bill-5', method: 'bank_transfer',
       timestamp: '2026-07-01T11:00:00Z' },
     { id: 'txn-3', userId: 'demo-bendahara', action: 'add_expense',
       amount: 750000, category: 'Kebersihan',
       timestamp: '2026-07-01T14:00:00Z' },
     // ... generate 15-20 entries
   ];
   ```

6. **Tabel Log** — per jenis:
   - Filter: range tanggal, search email/user
   - Kolom Login Log: Waktu, Email, Status (badge), IP
   - Kolom Access Log: Waktu, User, Halaman
   - Kolom Transaction Log: Waktu, User, Aksi, Detail, Jumlah

7. Styling: konsisten dengan halaman lain

**Validasi**:
- Login sebagai admin → bisa akses /logs
- Tab switching menampilkan log yang benar
- Toggle off → pesan "Log dinonaktifkan"
- Toggle on → tabel log muncul

---

### Task 3.3: Update App.jsx — Tambah Route Baru

**File**: `client/src/App.jsx`  
**Estimasi**: Kecil  
**Dependency**: Task 3.1 dan Task 3.2

**Langkah-langkah:**

1. Lazy import `Users` dan `Logs`:
   ```javascript
   const Users = lazy(() => import('./pages/Users'));
   const Logs = lazy(() => import('./pages/Logs'));
   ```

2. Tambah route di dalam `<Route element={<ProtectedLayout />}>`:
   ```jsx
   <Route path="/users" element={<Suspense fallback={<PageLoader />}><Users /></Suspense>} />
   <Route path="/logs" element={<Suspense fallback={<PageLoader />}><Logs /></Suspense>} />
   ```

**Validasi**: Navigasi ke /users dan /logs berfungsi (guard redirect untuk non-admin).

---

### Task 3.4: Update Home.jsx — Dashboard per Role

**File**: `client/src/pages/Home.jsx`  
**Estimasi**: Kecil  
**Dependency**: Fase 0 selesai

**Langkah-langkah:**

1. Import `hasMinRole`, `isBendaharaOrAbove`, `isAdminRole` dari mockData

2. Update konten dashboard sesuai role:
   - **Warga**: Tampilkan ringkasan unit sendiri, status IPL terakhir, shortcut bayar
   - **Pengurus**: + ringkasan kas masuk bulan ini, total tunggakan
   - **Bendahara**: + saldo akhir running balance bulan ini
   - **Admin**: + jumlah user aktif, ringkasan log terbaru

3. Update semua referensi `isStaff` → gunakan helper role baru

**Validasi**: Dashboard menampilkan konten yang berbeda per role.

---

## Fase 4: Validasi & Polish

> Fase terakhir untuk memastikan semua bekerja dengan baik.

### Task 4.1: Update Supabase Schema (Referensi)

**File**: `supabase/schema.sql`  
**Estimasi**: Kecil  
**Dependency**: Semua fase selesai

**Langkah-langkah:**

1. Update enum `user_role` → tambahkan komentar bahwa enum baru = `admin | bendahara | pengurus | warga`

2. Update `is_staff()` function → include `pengurus`

3. Tambah `is_bendahara_or_above()` function

4. Update RLS policies yang referensi `is_staff()` jika perlu

5. Tambah tabel baru:
   - `login_logs` (userId, email, timestamp, status, ip)
   - `access_logs` (userId, page, timestamp)
   - `transaction_logs` (userId, action, amount, targetId, method, timestamp)
   - `log_settings` (loginLogEnabled, accessLogEnabled, transactionLogEnabled)

6. Tambah komentar: "Perubahan ini belum dieksekusi. Apply setelah migrasi ke Supabase."

**Validasi**: File SQL valid secara syntax.

---

### Task 4.2: Audit Referensi Role Lama

**File**: Semua file di `client/src/`  
**Estimasi**: Kecil  
**Dependency**: Fase 0-3 selesai

**Langkah-langkah:**

1. Grep seluruh project untuk string `'rt_rw'` → harus 0 match (kecuali komentar/docs)
2. Grep seluruh project untuk string `'resident'` → harus 0 match di context role (bisa ada di context lain)
3. Grep untuk `isStaff` yang masih hardcode `role === 'admin' || role === 'rt_rw'` → ganti semua dengan helper functions
4. Pastikan semua `if (role !== 'admin' && role !== 'rt_rw')` sudah diganti

**Validasi**: Tidak ada referensi role lama yang tersisa di kode.

---

### Task 4.3: Tes End-to-End Manual (Checklist)

**Dependency**: Semua task selesai

**Checklist per role:**

#### Login sebagai Warga (`warga@palmvillage.id / demo123`):
- [ ] Menu: Beranda, Penghuni, Matriks Bayar (3 item)
- [ ] Matriks Bayar: hanya bisa klik sel di baris "Rumah Saya"
- [ ] Bayar IPL: modal dengan QRIS + Transfer
- [ ] Klik sel Lunas rumah sendiri: detail pembayaran + bukti muncul
- [ ] Klik sel Lunas rumah orang lain: detail muncul TANPA bukti bayar
- [ ] Tidak bisa akses /expenses, /reports, /settings, /users, /logs → redirect

#### Login sebagai Pengurus (`pengurus@palmvillage.id / demo123`):
- [ ] Menu: 7 item (termasuk Pengeluaran, Laporan, Pengaturan)
- [ ] Matriks Bayar: bisa catat pembayaran semua warga
- [ ] Catat pembayaran: modal Transfer + QRIS (TANPA Tunai)
- [ ] Klik sel Lunas: detail + bukti bayar semua warga
- [ ] Pengeluaran: view-only (tidak ada tombol Catat/Edit/Delete), ada banner info
- [ ] Laporan: bisa akses, running balance terlihat
- [ ] Pengaturan: view-only (semua input disabled), ada banner info
- [ ] Tidak bisa akses /users, /logs → redirect

#### Login sebagai Bendahara (`bendahara@palmvillage.id / demo123`):
- [ ] Menu: 7 item (sama dengan pengurus)
- [ ] Matriks Bayar: bisa catat pembayaran semua warga
- [ ] Catat pembayaran: modal Tunai + Transfer + QRIS (3 opsi)
- [ ] Pengeluaran: CRUD (bisa Catat, Edit, Delete)
- [ ] Laporan: bisa akses, running balance terlihat
- [ ] Pengaturan: view-only
- [ ] Tidak bisa akses /users, /logs → redirect

#### Login sebagai Admin (`admin@palmvillage.id / demo123`):
- [ ] Menu: 9 item (+ Kelola User, Log Sistem)
- [ ] Semua yang Bendahara bisa + edit Pengaturan
- [ ] Kelola User: bisa tambah/edit/nonaktifkan user (validasi Gmail)
- [ ] Log Sistem: 3 tab, toggle on/off, tabel log

#### Running Balance (cross-role):
- [ ] Buka Laporan → Tabel running balance dari Jan 2025
- [ ] Saldo akhir bulan N = saldo awal bulan N+1 (semua bulan)
- [ ] Grafik tren menampilkan 3 garis
- [ ] Neraca arus kas menampilkan saldo awal dari bulan lalu
- [ ] Bulan Januari 2025 saldo awal = Rp 0

---

## Ringkasan Fase

| Fase | Jumlah Task | Estimasi Total | Bisa Paralel |
| ---- | :---------: | :------------: | :----------: |
| 0 — Fondasi RBAC | 4 task | Sedang | Partial (0.1 dulu, lalu 0.2-0.4 paralel) |
| 1 — Running Balance | 3 task | Besar | Sequential (1.1 → 1.2 → 1.3) |
| 2 — Akses Control | 3 task | Sedang | Full paralel (setelah Fase 0) |
| 3 — Halaman Baru | 4 task | Besar | Partial (3.1-3.2 paralel, 3.3 setelahnya) |
| 4 — Validasi | 3 task | Kecil | Sequential |
| **TOTAL** | **17 task** | | |

---

## Dependency Graph

```
Fase 0 (FONDASI)
├── Task 0.1 (mockData role) ─┬── Task 0.2 (AuthContext) ── Task 0.4 (Login)
│                             ├── Task 0.3 (Header nav)
│                             │
│   ┌─────────────────────────┘ (Fase 0 selesai)
│   │
│   ├── Fase 1 (RUNNING BALANCE) ── sequential
│   │   └── Task 1.1 → Task 1.2 → Task 1.3
│   │
│   ├── Fase 2 (AKSES CONTROL) ── paralel
│   │   ├── Task 2.1 (PaymentMatrix)
│   │   ├── Task 2.2 (Expenses)
│   │   └── Task 2.3 (Settings)
│   │
│   └── Fase 3 (HALAMAN BARU) ── partial paralel
│       ├── Task 3.1 (Users.jsx) ──┐
│       ├── Task 3.2 (Logs.jsx)  ──┼── Task 3.3 (App.jsx routes)
│       └── Task 3.4 (Home.jsx)    │
│                                   │
└── Fase 4 (VALIDASI) ── sequential ┘
    ├── Task 4.1 (schema.sql update)
    ├── Task 4.2 (audit referensi lama)
    └── Task 4.3 (tes E2E manual)
```
