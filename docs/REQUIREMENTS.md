# Portal Palm Village — Dokumen Requirement Teknis
# Laporan Keuangan Running Balance & RBAC 4 Level

> **Audience**: AI Agent yang akan mengeksekusi implementasi  
> **Stack**: React 18 + Vite + TailwindCSS + Supabase (demo mode)  
> **Bahasa kode**: JavaScript/JSX  
> **File utama yang terdampak**: Tabel di akhir dokumen

---

## 1. RBAC — Restrukturisasi Role 4 Level

### 1.1 Enum Role Baru

```
LAMA: admin | rt_rw | resident
BARU: admin | bendahara | pengurus | warga
```

**Mapping migrasi:**
- `admin` → `admin` (tetap)
- `rt_rw` → dipecah menjadi `pengurus` dan `bendahara`
- `resident` → `warga`

### 1.2 Perubahan di `mockData.js`

#### 1.2.1 Konstanta OCCUPANCY_STATUS
Tidak berubah (tetap: `owner_occupied`, `owner_vacant`, `owner_rented`, `tenant`).

#### 1.2.2 mockProfiles — Update Role Field
```javascript
// SEBELUM:
{ id: 'demo-admin', role: 'admin', ... }     // tetap
{ id: 'demo-rt',    role: 'rt_rw', ... }      // → 'pengurus' ATAU 'bendahara'
{ id: 'demo-warga', role: 'resident', ... }   // → 'warga'

// SESUDAH (4 akun demo):
{ id: 'demo-admin',     role: 'admin',     full_name: 'Pak Hendra (Admin)', ... }
{ id: 'demo-bendahara', role: 'bendahara', full_name: 'Budi Santoso (Bendahara)', ... }
{ id: 'demo-pengurus',  role: 'pengurus',  full_name: 'Ibu Ratna (Pengurus RT)', ... }
{ id: 'demo-warga',     role: 'warga',     full_name: 'Siti Rahayu', ... }
```

Profil warga lainnya (p-4 sampai p-14): ubah `role: 'resident'` → `role: 'warga'`.

#### 1.2.3 Helper Functions — Role Labels & Colors

```javascript
// roleLabel()
export function roleLabel(role) {
  const map = {
    admin: 'Admin',
    bendahara: 'Bendahara',
    pengurus: 'Pengurus',
    warga: 'Warga',
  };
  return map[role] || role;
}

// roleColor()
export function roleColor(role) {
  const map = {
    admin: 'bg-gold-500 text-forest-900',
    bendahara: 'bg-emerald-600 text-white',
    pengurus: 'bg-forest-800 text-gold-400',
    warga: 'bg-forest-100 text-forest-700 border border-forest-200',
  };
  return map[role] || 'bg-gray-100 text-gray-600';
}
```

#### 1.2.4 Helper — Role Hierarchy Check

```javascript
// Hierarchy: admin(4) > bendahara(3) > pengurus(2) > warga(1)
const ROLE_LEVEL = { warga: 1, pengurus: 2, bendahara: 3, admin: 4 };

export function hasMinRole(userRole, minRole) {
  return (ROLE_LEVEL[userRole] || 0) >= (ROLE_LEVEL[minRole] || 0);
}

export function isStaffRole(role) {
  return hasMinRole(role, 'pengurus');
}

export function isBendaharaOrAbove(role) {
  return hasMinRole(role, 'bendahara');
}

export function isAdminRole(role) {
  return role === 'admin';
}
```

### 1.3 Perubahan di `AuthContext.jsx`

#### 1.3.1 DEMO_ACCOUNTS — Tambah Bendahara

```javascript
const DEMO_ACCOUNTS = {
  'admin@palmvillage.id': {
    password: 'demo123',
    profile: {
      id: 'demo-admin',
      full_name: 'Pak Hendra (Admin)',
      phone: '0812-1000-0001',
      role: 'admin',
      unit_id: null,
      occupancy_status: null,
      is_active: true,
    },
  },
  'bendahara@palmvillage.id': {
    password: 'demo123',
    profile: {
      id: 'demo-bendahara',
      full_name: 'Budi Santoso (Bendahara)',
      phone: '0813-2000-0002',
      role: 'bendahara',
      unit_id: 1,
      occupancy_status: 'owner_occupied',
      is_active: true,
    },
  },
  'pengurus@palmvillage.id': {
    password: 'demo123',
    profile: {
      id: 'demo-pengurus',
      full_name: 'Ibu Ratna (Pengurus RT)',
      phone: '0814-3000-0003',
      role: 'pengurus',
      unit_id: 3, // assign ke unit yang ada
      occupancy_status: 'owner_occupied',
      is_active: true,
    },
  },
  'warga@palmvillage.id': {
    password: 'demo123',
    profile: {
      id: 'demo-warga',
      full_name: 'Siti Rahayu',
      phone: '0812-3000-0003',
      role: 'warga',
      unit_id: 2,
      occupancy_status: 'owner_occupied',
      is_active: true,
    },
  },
};
```

### 1.4 Perubahan di `Header.jsx` — Navigasi per Role

```javascript
// Menu visible per role:
const NAV_CONFIG = {
  warga: [
    { to: '/',                label: 'Beranda',      icon: AiOutlineHome, end: true },
    { to: '/residents',       label: 'Penghuni',     icon: AiOutlineUser },
    { to: '/payment-matrix',  label: 'Matriks Bayar', icon: AiOutlineTable },
  ],
  pengurus: [
    // semua menu warga +
    { to: '/houses',          label: 'Rumah',        icon: AiOutlineHome },
    { to: '/expenses',        label: 'Pengeluaran',  icon: AiOutlineWallet },
    { to: '/reports',         label: 'Laporan',      icon: AiOutlineBarChart },
    { to: '/settings',        label: 'Pengaturan',   icon: AiOutlineSetting },
  ],
  bendahara: [
    // sama dengan pengurus (CRUD expenses dihandle di halaman, bukan navigasi)
  ],
  admin: [
    // semua menu bendahara +
    { to: '/users',           label: 'Kelola User',  icon: AiOutlineTeam },
    { to: '/logs',            label: 'Log Sistem',   icon: AiOutlineFileText },
  ],
};

// Resolusi menu: mulai dari role teratas, akumulasi ke bawah
function getNavItems(role) {
  const base = NAV_CONFIG.warga;
  if (role === 'warga') return base;
  const staff = [...base, ...NAV_CONFIG.pengurus];
  if (role === 'pengurus') return staff;
  if (role === 'bendahara') return staff; // sama, CRUD di-handle di halaman
  if (role === 'admin') return [...staff, ...NAV_CONFIG.admin];
  return base;
}
```

### 1.5 Perubahan di `Layout.jsx`

Tidak ada perubahan struktural. Route guard tetap berdasarkan `isAuthenticated`.
Akses per halaman di-gate di masing-masing page component.

### 1.6 Perubahan di Supabase Schema (untuk referensi, belum dieksekusi)

```sql
-- Ubah enum
ALTER TYPE user_role RENAME VALUE 'rt_rw' TO 'pengurus';
ALTER TYPE user_role RENAME VALUE 'resident' TO 'warga';
ALTER TYPE user_role ADD VALUE 'bendahara' AFTER 'pengurus';

-- Update helper functions
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean AS $$
  SELECT public.current_role() IN ('admin', 'bendahara', 'pengurus');
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.is_bendahara_or_above()
RETURNS boolean AS $$
  SELECT public.current_role() IN ('admin', 'bendahara');
$$ LANGUAGE sql SECURITY DEFINER STABLE;
```

---

## 2. Running Balance — Laporan Keuangan

### 2.1 Konsep

Running balance = saldo akhir bulan sebelumnya menjadi saldo awal bulan ini. Dimulai dari **Januari 2025** dengan saldo awal **Rp 0**.

### 2.2 Data Source untuk Running Balance

1. **Pemasukan (Kas Masuk)**: Pembayaran IPL yang `paid_at` jatuh di bulan tersebut (dari `mockPayments`). Menggunakan fungsi `getPaymentsByMonth(year, month)` yang sudah ada.

2. **Pengeluaran (Kas Keluar)**: Pengeluaran bendahara yang `date` jatuh di bulan tersebut (dari `mockExpenses`). Menggunakan fungsi `getExpensesForPeriod(period)` yang sudah ada.

3. **Saldo Awal**: Dihitung secara kumulatif dari Januari 2025.

### 2.3 Fungsi Baru di `mockData.js`

```javascript
/**
 * Hitung running balance dari Januari 2025 sampai bulan target.
 * Mengembalikan array objek per bulan secara berurutan.
 * 
 * @param {number} targetYear - tahun target (misal 2026)
 * @param {number} targetMonth - bulan target 1-12 (misal 6 = Juni)
 * @returns {Array<{
 *   period: string,          // "YYYY-MM"
 *   year: number,
 *   month: number,
 *   openingBalance: number,  // saldo awal = closingBalance bulan sebelumnya
 *   totalIncome: number,     // total kas masuk IPL bulan ini
 *   totalExpense: number,    // total pengeluaran bulan ini
 *   closingBalance: number,  // saldo akhir = openingBalance + totalIncome - totalExpense
 *   incomeCount: number,     // jumlah transaksi pemasukan
 *   expenseCount: number,    // jumlah transaksi pengeluaran
 * }>}
 */
export function computeRunningBalance(targetYear, targetMonth) {
  const result = [];
  let cumulativeBalance = 0; // Saldo awal Januari 2025 = 0

  // Iterasi dari Januari 2025 sampai bulan target
  const startYear = 2025;
  const startMonth = 1;

  let y = startYear;
  let m = startMonth;

  while (y < targetYear || (y === targetYear && m <= targetMonth)) {
    const period = `${y}-${String(m).padStart(2, '0')}`;
    
    // Kas masuk: pembayaran IPL yang paid_at di bulan ini
    const payments = getPaymentsByMonth(y, m);
    const totalIncome = payments.reduce((s, p) => s + p.amount, 0);
    
    // Kas keluar: pengeluaran di bulan ini  
    const expenses = getExpensesForPeriod(period);
    const totalExpense = expenses.reduce((s, e) => s + e.amount, 0);
    
    const openingBalance = cumulativeBalance;
    const closingBalance = openingBalance + totalIncome - totalExpense;
    
    result.push({
      period,
      year: y,
      month: m,
      openingBalance,
      totalIncome,
      totalExpense,
      closingBalance,
      incomeCount: payments.length,
      expenseCount: expenses.length,
    });
    
    cumulativeBalance = closingBalance;
    
    // Next month
    m++;
    if (m > 12) { m = 1; y++; }
  }
  
  return result;
}

/**
 * Ambil running balance untuk SATU bulan spesifik.
 * Menghitung seluruh chain dari Jan 2025 untuk mendapatkan saldo awal yang benar.
 */
export function getMonthBalance(year, month) {
  const chain = computeRunningBalance(year, month);
  return chain[chain.length - 1] || null;
}
```

### 2.4 Mock Data Pengeluaran — Extend ke Januari 2025

Saat ini `mockExpenses` hanya berisi 4 record (Mei-Juni 2026). Untuk demo running balance, perlu ditambah data pengeluaran **Januari 2025 - sekarang** secara deterministik.

```javascript
// Generator pengeluaran bulanan untuk demo
// Setiap bulan ada 2-4 pengeluaran dengan kategori acak
// Total pengeluaran per bulan: Rp 2.000.000 - Rp 5.000.000
// Ini membuat running balance realistis

const DEMO_MONTHLY_EXPENSES = [
  // Pengeluaran tetap setiap bulan:
  { category: 'Kebersihan', amount: 750000, desc: 'Honor petugas kebersihan' },
  { category: 'Keamanan', amount: 1800000, desc: 'Honor satpam' },
  // Pengeluaran variabel (muncul di bulan-bulan tertentu):
  { category: 'Listrik & Air', amount: 1250000, desc: 'Token listrik lampu jalan' },
  { category: 'Perawatan Fasilitas', amount: 500000, desc: 'Perawatan taman & fasilitas' },
  { category: 'Administrasi', amount: 300000, desc: 'ATK & administrasi' },
];
```

**Spesifikasi generator:**
- Bulan Januari 2025 sampai bulan saat ini
- Setiap bulan **minimal** 2 pengeluaran (kebersihan + keamanan)
- Bulan genap: tambah pengeluaran listrik
- Setiap 3 bulan: tambah perawatan fasilitas
- Setiap 6 bulan: tambah administrasi
- ID: `exp-gen-{year}-{month}-{index}`
- `recorded_by`: 'Budi Santoso (Bendahara)'
- `date`: tanggal 5 setiap bulan (untuk konsistensi)

### 2.5 Perubahan di `Reports.jsx`

#### 2.5.1 Layout Baru — Running Balance View

Halaman laporan harus menampilkan:

1. **Summary Cards** (atas) — untuk bulan terpilih:
   - Saldo Awal (carry-forward dari bulan lalu)
   - Pemasukan IPL bulan ini
   - Pengeluaran bulan ini
   - Saldo Akhir (= saldo awal + pemasukan - pengeluaran)

2. **Tabel Running Balance** — multi-bulan:
   - Tabel dengan kolom: Periode | Saldo Awal | Pemasukan | Pengeluaran | Saldo Akhir
   - Tampilkan semua bulan dari Jan 2025 sampai bulan terpilih
   - Baris terakhir (bulan terpilih) di-highlight
   - Saldo negatif ditandai warna merah

3. **Grafik Tren** — Line/Area chart:
   - X-axis: bulan (Jan 2025 - sekarang)
   - Y-axis: nominal (Rupiah)
   - 3 garis: Pemasukan, Pengeluaran, Saldo Akhir

4. **Detail Bulan Terpilih** — panel bawah (retained dari saat ini):
   - Kas Masuk IPL (tabel per transaksi)
   - Pengeluaran Bendahara (list per item)
   - Neraca bulan ini (dengan saldo awal dari running balance)

#### 2.5.2 Perubahan Neraca Arus Kas

```
SEBELUM:
  Pemasukan (kas masuk IPL)     + Rp X
  Pengeluaran (biaya ops)       - Rp Y
  Selisih (Saldo Bersih)        = Rp Z

SESUDAH (Running Balance):
  Saldo Awal (dari bulan lalu)  + Rp A    ← BARU (carry-forward)
  Pemasukan IPL bulan ini       + Rp X
  Pengeluaran bulan ini         - Rp Y
  ─────────────────────────────
  Saldo Akhir                   = Rp A + X - Y
  
  Catatan: Saldo akhir ini menjadi Saldo Awal bulan berikutnya.
```

### 2.6 Perubahan Akses Laporan

```javascript
// SEBELUM: role !== 'admin' && role !== 'rt_rw' → redirect
// SESUDAH: 
if (!hasMinRole(role, 'pengurus')) {
  return <Navigate to="/" replace />;
}
```

---

## 3. Payment Matrix — Perubahan per Role

### 3.1 Aturan Interaksi per Role

```javascript
// Warga: bayar rumah sendiri saja (QRIS + Transfer)
// Pengurus: catat IPL semua warga via Transfer (+ upload bukti transfer)
// Bendahara: catat IPL semua warga via Transfer + Tunai (+ upload bukti)
// Admin: sama dengan Bendahara

const canRecordForOthers = hasMinRole(role, 'pengurus');
const canRecordCash = hasMinRole(role, 'bendahara');
```

### 3.2 Modal Pembayaran — Metode per Role

| Role       | QRIS | Transfer (+ bukti) | Tunai (+ bukti tanda terima) |
| ---------- | :--: | :-----------------: | :--------------------------: |
| Warga      | ✅ (rumahnya)  | ✅ (rumahnya)  | ❌ |
| Pengurus   | ✅ (semua)     | ✅ (semua)     | ❌ |
| Bendahara  | ✅ (semua)     | ✅ (semua)     | ✅ (semua) |
| Admin      | ✅ (semua)     | ✅ (semua)     | ✅ (semua) |

### 3.3 Bukti Bayar di Detail Matriks

Ketika user klik sel **Lunas** di matriks bayar:

```javascript
// Tampilkan modal/popover dengan info pembayaran:
{
  period: "Januari 2025",
  amount: "Rp 500.000",
  paidAt: "10 Jan 2025",
  method: "Transfer Bank",         // atau "QRIS" atau "Tunai"
  receiptFile: "bukti-transfer.jpg", // nama file bukti
  recordedBy: "Budi Santoso",       // siapa yang mencatat
  note: "Transfer dari BCA",        // catatan opsional
}
```

**Aturan visibilitas bukti bayar:**
- **Warga**: Hanya bisa lihat bukti bayar **rumahnya sendiri**
- **Pengurus/Bendahara/Admin**: Bisa lihat bukti bayar **semua warga**

### 3.4 Perubahan ManualPaymentModal

```javascript
// Metode yang tersedia di modal bergantung pada role:
function ManualPaymentModal({ bills, role, onConfirm, onClose }) {
  const canCash = hasMinRole(role, 'bendahara');
  
  // Grid metode:
  // Pengurus: 2 kolom (Transfer, QRIS)
  // Bendahara+: 3 kolom (Tunai, Transfer, QRIS)
  const methods = canCash
    ? [
        { value: 'cash', label: '💵 Tunai' },
        { value: 'bank_transfer', label: '🏦 Transfer' },
        { value: 'qris', label: '📱 QRIS' },
      ]
    : [
        { value: 'bank_transfer', label: '🏦 Transfer' },
        { value: 'qris', label: '📱 QRIS' },
      ];
  
  // Default method: transfer untuk pengurus, cash untuk bendahara
  const [method, setMethod] = useState(canCash ? 'cash' : 'bank_transfer');
  ...
}
```

---

## 4. Halaman Expenses — View vs Edit per Role

### 4.1 Aturan Akses

```javascript
// SEBELUM: if (!isStaff) return <Navigate to="/" />
// SESUDAH:
if (!hasMinRole(role, 'pengurus')) {
  return <Navigate to="/" replace />;
}

const canEdit = hasMinRole(role, 'bendahara'); // CRUD hanya bendahara+
```

### 4.2 UI Conditional

```javascript
// Tombol "Catat Pengeluaran" → hanya jika canEdit
{canEdit && (
  <button onClick={() => setModalForm('add')} className="pv-btn-primary text-xs">
    <AiOutlinePlus /> Catat Pengeluaran
  </button>
)}

// Tombol Edit & Delete per item → hanya jika canEdit
{canEdit && (
  <div className="flex gap-1">
    <button onClick={() => setModalForm(exp)} ...><AiOutlineEdit /></button>
    <button onClick={() => handleDelete(exp)} ...><AiOutlineDelete /></button>
  </div>
)}
```

---

## 5. Halaman Settings — View vs Edit per Role

### 5.1 Aturan Akses

```javascript
// SEBELUM: if (role !== 'admin' && role !== 'rt_rw') return redirect
// SESUDAH:
if (!hasMinRole(role, 'pengurus')) {
  return <Navigate to="/" replace />;
}

const canEdit = isAdminRole(role); // Hanya admin yang bisa edit
```

### 5.2 UI Conditional

```javascript
// Jika !canEdit: semua input menjadi disabled/readonly
// Tombol "Simpan Pengaturan" hanya muncul jika canEdit
// Banner info: "Anda melihat pengaturan dalam mode read-only"
```

---

## 6. Halaman User Management (BARU — Admin Only)

### 6.1 Route & Guard

```javascript
// Route: /users
// Guard: if (!isAdminRole(role)) return <Navigate to="/" replace />;
```

### 6.2 Fitur

- **Daftar User**: Tabel semua user (profiles) dengan kolom: Nama, Email (Gmail), Role, Unit, Status
- **Tambah User**: Form dengan field: Email (wajib Gmail), Nama Warga (autocomplete dari residents tanpa akun), Role (dropdown 4 level)
- **Edit User**: Ubah role, ubah status aktif/nonaktif
- **Hapus User**: Soft delete (set `is_active = false`)
- **Validasi Email**: Hanya `@gmail.com` yang diterima

### 6.3 Mock Data

```javascript
// Extend mockProfiles dengan field `email` (sudah ada di data saat ini)
// Tambah fungsi CRUD:
export function addUser(data) { ... }
export function updateUser(id, data) { ... }
export function deactivateUser(id) { ... }
export function getUserList() { ... }
```

---

## 7. Halaman Log Sistem (BARU — Admin Only)

### 7.1 Route & Guard

```javascript
// Route: /logs
// Guard: if (!isAdminRole(role)) return <Navigate to="/" replace />;
```

### 7.2 Tiga Jenis Log

| Log               | Deskripsi                                          | Data yang dicatat |
| ----------------- | ------------------------------------------------- | ----------------- |
| **Login Log**     | Siapa login kapan                                  | userId, email, timestamp, IP (mock), status (success/fail) |
| **Access Log**    | Halaman apa yang diakses                           | userId, page, timestamp |
| **Transaction Log** | Transaksi keuangan (bayar IPL, catat pengeluaran) | userId, action, amount, targetBillId, timestamp |

### 7.3 Konfigurasi On/Off

Admin bisa mengaktifkan/menonaktifkan masing-masing jenis log via toggle di halaman log.

```javascript
// Mock settings:
export const mockLogSettings = {
  loginLogEnabled: true,
  accessLogEnabled: true,
  transactionLogEnabled: true,
};
```

### 7.4 Mock Log Data

```javascript
export const mockLogs = {
  login: [
    { id: 'log-1', userId: 'demo-admin', email: 'admin@palmvillage.id', timestamp: '...', status: 'success' },
    ...
  ],
  access: [
    { id: 'acc-1', userId: 'demo-warga', page: '/payment-matrix', timestamp: '...' },
    ...
  ],
  transaction: [
    { id: 'txn-1', userId: 'demo-bendahara', action: 'record_payment', amount: 500000, billId: 'bill-1', timestamp: '...' },
    ...
  ],
};
```

---

## 8. Detail Bukti Bayar di Matriks

### 8.1 Data Model Pembayaran (sudah ada, perlu extend)

```javascript
// Extend payment record dengan receipt info:
{
  id: 'pay-xxx',
  ipl_bill_id: 'bill-xxx',
  resident_id: 'demo-warga',
  amount: 500000,
  method: 'bank_transfer',       // 'qris' | 'bank_transfer' | 'cash'
  transaction_id: 'TXN-xxx',
  status: 'completed',
  paid_at: '2025-01-10',
  receipt_file: 'bukti-tf-jan.jpg',  // Sudah ada di mockData
  metadata: {
    recorded_by: 'Budi Santoso',
    note: 'Transfer dari BCA',
    payer: 'Siti Rahayu',
  },
}
```

### 8.2 UI Detail Bukti Bayar

Komponen baru `PaymentDetailModal` atau popover yang muncul saat klik sel Lunas:

```javascript
function PaymentDetailPopover({ bill, payment, role, myUnitId }) {
  // Cek apakah boleh lihat bukti:
  const canViewReceipt = 
    hasMinRole(role, 'pengurus') ||  // Staff bisa lihat semua
    bill.unit_id === myUnitId;       // Warga hanya rumah sendiri
  
  return (
    <div>
      <p>Periode: {formatPeriod(bill.period)}</p>
      <p>Jumlah: {formatRupiah(bill.amount)}</p>
      <p>Tanggal Bayar: {formatDate(payment.paid_at)}</p>
      <p>Metode: {methodLabel(payment.method)}</p>
      {canViewReceipt && payment.receipt_file && (
        <div>
          <p>Bukti Bayar:</p>
          {/* Preview file atau link download */}
          <span>{payment.receipt_file}</span>
        </div>
      )}
      {payment.metadata?.recorded_by && (
        <p>Dicatat oleh: {payment.metadata.recorded_by}</p>
      )}
      {payment.metadata?.note && (
        <p>Catatan: {payment.metadata.note}</p>
      )}
    </div>
  );
}
```

### 8.3 Bukti Bayar per Metode — Detail Teknis

| Metode | Bukti yang ditampilkan | Keterangan |
| ------ | ---------------------- | ---------- |
| **QRIS** | `transaction_id` (referensi QRIS) | Saat Mayar terintegrasi: bukti otomatis dari webhook. Demo: tampilkan `TXN-xxx` |
| **Transfer** | `receipt_file` (nama file upload) | Foto/screenshot bukti transfer. Demo: nama file saja. Supabase: preview dari Storage |
| **Tunai** | `receipt_file` (nama file upload) | Foto tanda terima yang ditandatangani bendahara. Demo: nama file saja |

---

## 9. Daftar File yang Terdampak

| File | Perubahan | Prioritas |
| ---- | --------- | --------- |
| `client/src/services/mockData.js` | Role enum, helpers, mock expenses extend, running balance functions, log data | 🔴 P0 |
| `client/src/context/AuthContext.jsx` | 4 demo accounts, role mapping | 🔴 P0 |
| `client/src/components/Header.jsx` | Nav per 4 role | 🔴 P0 |
| `client/src/pages/Reports.jsx` | Running balance UI, summary cards, tabel multi-bulan, grafik tren | 🔴 P0 |
| `client/src/pages/PaymentMatrix.jsx` | Akses per role, metode per role, bukti bayar detail | 🟡 P1 |
| `client/src/pages/Expenses.jsx` | View-only untuk pengurus, CRUD untuk bendahara | 🟡 P1 |
| `client/src/pages/Settings.jsx` | View-only untuk pengurus, edit untuk admin | 🟡 P1 |
| `client/src/pages/Users.jsx` | **BARU** — User management admin-only | 🟢 P2 |
| `client/src/pages/Logs.jsx` | **BARU** — Log sistem admin-only | 🟢 P2 |
| `client/src/App.jsx` | Tambah route /users dan /logs | 🟢 P2 |
| `client/src/pages/Home.jsx` | Update dashboard cards per role | 🟢 P2 |
| `client/src/pages/Login.jsx` | Update info akun demo (4 akun) | 🟡 P1 |
| `supabase/schema.sql` | Update enum role, RLS policies (referensi) | ⚪ Nanti |
