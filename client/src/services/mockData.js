/**
 * Mock data untuk demo mode.
 * Simulasi data yang nantinya berasal dari Supabase.
 * Import dari sini oleh komponen UI saat VITE_DEMO_MODE=true.
 */

// ── STATUS PENGHUNI ──────────────────────────────────────────────
// Status tinggal sebuah profil terhadap unit yang dirujuk via unit_id.
export const OCCUPANCY_STATUS = {
  owner_occupied: 'Tetap / Owner - Dihuni',       // pemilik tinggal sendiri
  owner_vacant: 'Tetap / Owner - Tidak Dihuni',    // pemilik, unit kosong
  owner_rented: 'Tetap / Owner - Dikontrakkan',    // pemilik, disewakan ke tenant
  tenant: 'Kontrak',                                // penyewa (yang ngontrak)
};

// ── UNITS ────────────────────────────────────────────────────────
// owner_id = profil pemilik unit. Berbeda dari penghuni (occupant) yang
// dirujuk lewat profile.unit_id. Untuk unit yang dikontrakkan, pemilik
// (owner) bukan penghuni — penghuni adalah profil dengan status 'tenant'.
export const mockUnits = [
  { id: 1, block: 'A', unit_number: '01', floor: 1, size: 72, is_occupied: true, owner_id: 'demo-rt' },
  { id: 2, block: 'A', unit_number: '02', floor: 1, size: 72, is_occupied: true, owner_id: 'demo-warga' },
  { id: 3, block: 'A', unit_number: '03', floor: 1, size: 72, is_occupied: true, owner_id: 'p-4' },
  { id: 4, block: 'A', unit_number: '04', floor: 2, size: 84, is_occupied: true, owner_id: 'p-5' },
  { id: 5, block: 'A', unit_number: '05', floor: 2, size: 84, is_occupied: true, owner_id: 'p-6' },
  { id: 6, block: 'A', unit_number: '06', floor: 2, size: 84, is_occupied: false, owner_id: null },
  { id: 7, block: 'A', unit_number: '07', floor: 3, size: 96, is_occupied: true, owner_id: 'p-7' },
  { id: 8, block: 'A', unit_number: '08', floor: 3, size: 96, is_occupied: true, owner_id: 'p-8' },
  { id: 9, block: 'A', unit_number: '09', floor: 3, size: 96, is_occupied: true, owner_id: 'p-9' },
  { id: 10, block: 'A', unit_number: '10', floor: 3, size: 96, is_occupied: false, owner_id: null },
  { id: 11, block: 'B', unit_number: '01', floor: 1, size: 72, is_occupied: true, owner_id: 'p-10' },
  { id: 12, block: 'B', unit_number: '02', floor: 1, size: 72, is_occupied: true, owner_id: 'p-11' },
  { id: 13, block: 'B', unit_number: '03', floor: 1, size: 72, is_occupied: true, owner_id: 'p-12' },
  { id: 14, block: 'B', unit_number: '04', floor: 2, size: 84, is_occupied: true, owner_id: 'p-13' },
  { id: 15, block: 'B', unit_number: '05', floor: 2, size: 84, is_occupied: true, owner_id: 'p-14' },
];


// ── PROFILES (penghuni) ─────────────────────────────────────────
// occupancy_status lihat OCCUPANCY_STATUS di atas. Untuk unit yang
// dikontrakkan, ada 2 profil: pemilik (owner_rented) + tenant.
export const mockProfiles = [
  {
    id: 'demo-admin',
    full_name: 'Pak Hendra (Pengelola)',
    phone: '0812-1000-0001',
    role: 'admin',
    unit_id: null,
    occupancy_status: null,
    is_active: true,
    email: 'admin@palmvillage.id',
  },
  {
    id: 'demo-rt',
    full_name: 'Budi Santoso (Ketua RT 01)',
    phone: '0813-2000-0002',
    role: 'rt_rw',
    unit_id: 1,
    occupancy_status: 'owner_occupied',
    is_active: true,
    email: 'rt@palmvillage.id',
  },
  {
    id: 'demo-warga',
    full_name: 'Siti Rahayu',
    phone: '0812-3000-0003',
    role: 'resident',
    unit_id: 2,
    occupancy_status: 'owner_occupied',
    is_active: true,
    email: 'warga@palmvillage.id',
  },
  {
    id: 'p-4',
    full_name: 'Ahmad Hidayat',
    phone: '0856-4000-0004',
    role: 'resident',
    unit_id: 3,
    occupancy_status: 'owner_rented', // pemilik unit 3, dikontrakkan ke p-4b
    is_active: true,
    email: 'ahmad.h@palmvillage.id',
  },
  {
    // Contoh TENANT: menempati unit 3 milik Ahmad Hidayat (p-4)
    id: 'p-4b',
    full_name: 'Eko Prasetyo (Penyewa)',
    phone: '0838-4100-0040',
    role: 'resident',
    unit_id: 3,
    occupancy_status: 'tenant',
    is_active: true,
    email: 'eko.p@palmvillage.id',
  },
  {
    id: 'p-5',
    full_name: 'Dewi Lestari',
    phone: '0878-5000-0005',
    role: 'resident',
    unit_id: 4,
    occupancy_status: 'owner_occupied',
    is_active: true,
    email: 'dewi.l@palmvillage.id',
  },
  {
    id: 'p-6',
    full_name: 'Rudi Pratama',
    phone: '0819-6000-0006',
    role: 'resident',
    unit_id: 5,
    occupancy_status: 'owner_occupied',
    is_active: true,
    email: 'rudi.p@palmvillage.id',
  },
  {
    id: 'p-7',
    full_name: 'Lina Kusuma',
    phone: '0821-7000-0007',
    role: 'resident',
    unit_id: 7,
    occupancy_status: 'owner_occupied',
    is_active: true,
    email: 'lina.k@palmvillage.id',
  },
  {
    id: 'p-8',
    full_name: 'Agus Wijaya',
    phone: '0857-8000-0008',
    role: 'resident',
    unit_id: 8,
    occupancy_status: 'owner_rented', // pemilik unit 8, dikontrakkan ke p-8b
    is_active: false, // sudah pindah
    email: 'agus.w@palmvillage.id',
  },
  {
    // Contoh TENANT: menempati unit 8 milik Agus Wijaya (p-8)
    id: 'p-8b',
    full_name: 'Maya Sari (Penyewa)',
    phone: '0833-8200-0080',
    role: 'resident',
    unit_id: 8,
    occupancy_status: 'tenant',
    is_active: true,
    email: 'maya.s@palmvillage.id',
  },
  {
    id: 'p-9',
    full_name: 'Rina Wulandari',
    phone: '0896-9000-0009',
    role: 'resident',
    unit_id: 9,
    occupancy_status: 'owner_occupied',
    is_active: true,
    email: 'rina.w@palmvillage.id',
  },
  {
    id: 'p-10',
    full_name: 'Dian Permata',
    phone: '0813-1111-0010',
    role: 'resident',
    unit_id: 11,
    occupancy_status: 'owner_occupied',
    is_active: true,
    email: 'dian.p@palmvillage.id',
  },
  {
    id: 'p-11',
    full_name: 'Fajar Setiawan',
    phone: '0858-2222-0011',
    role: 'resident',
    unit_id: 12,
    occupancy_status: 'owner_occupied',
    is_active: true,
    email: 'fajar.s@palmvillage.id',
  },
  {
    id: 'p-12',
    full_name: 'Maya Anggraeni',
    phone: '0877-3333-0012',
    role: 'resident',
    unit_id: 13,
    occupancy_status: 'owner_occupied',
    is_active: true,
    email: 'maya.a@palmvillage.id',
  },
  {
    id: 'p-13',
    full_name: 'Doni Cahyadi',
    phone: '0822-4444-0013',
    role: 'resident',
    unit_id: 14,
    occupancy_status: 'owner_occupied',
    is_active: true,
    email: 'doni.c@palmvillage.id',
  },
  {
    id: 'p-14',
    full_name: 'Nurul Fadilah',
    phone: '0815-5555-0014',
    role: 'resident',
    unit_id: 15,
    occupancy_status: 'owner_occupied',
    is_active: true,
    email: 'nurul.f@palmvillage.id',
  },
];


// ── IPL SETTINGS ─────────────────────────────────────────────────
// Konfigurasi IPL yang bisa diubah admin di halaman Settings.
//
// Catatan: besaran IPL per bulan TIDAK lagi disimpan sebagai nilai terpisah.
// Ia selalu = penjumlahan semua `ipl_components` (lihat computeIPLAmount).
// Jadi komponen IPL adalah satu-satunya sumber kebenaran besaran iuran.
export const mockSettings = {
  due_day: 10, // tanggal jatuh tempo tiap bulan
  late_fee_enabled: true,
  late_fee_type: 'percent', // 'percent' | 'fixed'
  late_fee_value: 5, // 5% atau nilai fixed (Rp)
  bill_recipient: 'occupant', // 'occupant' | 'owner' — ke siapa tagihan ditujukan
  ipl_components: [
    { name: 'Kebersihan', amount: 150000 },
    { name: 'Keamanan', amount: 200000 },
    { name: 'Lampu Jalan', amount: 100000 },
    { name: 'Administrasi', amount: 50000 },
  ],
};

/**
 * Hitung besaran IPL per bulan = penjumlahan semua komponen IPL.
 * Ini adalah satu-satunya cara menentukan nominal IPL; tidak ada lagi
 * field `ipl_amount` terpisah yang bisa menyimpang dari total komponen.
 * @param {Array<{amount: number}>} [components] - default mockSettings.ipl_components
 * @returns {number}
 */
export function computeIPLAmount(components = mockSettings.ipl_components) {
  return components.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
}

// ── IPL BILLS ────────────────────────────────────────────────────
// Tagihan di-generate untuk beberapa periode (2025 + 2026) supaya
// matriks pembayaran multi-tahun & laporan relevan.
//
// Aturan SEKUENSIAL LINTAS TAHUN: setiap unit punya satu garis "batas bayar"
// yang berjalan kontinu dari 2025-01. Semua periode sebelum batas → paid.
// Semua periode setelah batas → pending/overdue.
// Ini menjamin tunggakan hanya muncul di BELAKANG, tidak di tengah, dan
// konsisten lintas tahun (tidak mungkin Jan-Mar 2026 lunas tapi Nov 2025 belum).
const now = new Date();
const currentYear = now.getFullYear();
const currentMonth = now.getMonth() + 1; // 1-based
const periods = [
  // 2025 — sebagian besar lunas (tahun lalu)
  '2025-01','2025-02','2025-03','2025-04','2025-05','2025-06',
  '2025-07','2025-08','2025-09','2025-10','2025-11','2025-12',
  // 2026 — campuran (tahun berjalan)
  '2026-01','2026-02','2026-03','2026-04','2026-05','2026-06',
];

export const mockIPLBills = [];
let billId = 1;

const occupiedUnits = mockUnits.filter((u) => u.is_occupied);
const residentsWithUnit = mockProfiles.filter((p) => p.unit_id && p.is_active);

// ── Tentukan batas bayar absolut per unit ────────────────────────
// Menggunakan deterministik pseudo-random berdasarkan unit.id
// agar hasil konsisten setiap kali halaman di-reload.
// cutoffMonth: bulan terakhir yang sudah dibayar (1-based dari 2025-01)
//   2025-01 = 1, 2025-02 = 2, ..., 2025-12 = 12, 2026-01 = 13, ..., 2026-06 = 18
const unitCutoffs = {}; // { unitId: cutoffMonth }
for (const unit of occupiedUnits) {
  const seed = unit.id * 7 + 3; // deterministik per unit
  // Range 10-17: sebagian lunas 2025 penuh + sebagian 2026, ada yang menunggak di 2025
  unitCutoffs[unit.id] = 10 + (seed % 8);
}

function periodToIndex(period) {
  const [y, m] = period.split('-').map(Number);
  return (y - 2025) * 12 + m; // 2025-01 → 1, 2025-12 → 12, 2026-01 → 13, dst.
}

for (const period of periods) {
  for (const unit of occupiedUnits) {
    // Penerima tagihan ditentukan oleh setting global bill_recipient:
    // bisa penghuni (occupant) atau pemilik (owner).
    const recipient = getBillRecipient(unit.id);
    const [y, m] = period.split('-').map(Number);
    const dueDate = new Date(y, m - 1, mockSettings.due_day);
    const amount = computeIPLAmount();

    // Jangan generate tagihan untuk periode masa depan yang belum ada
    const isPast = now > new Date(y, m, 0); // akhir bulan periode
    const isCurrent = y === currentYear && m === currentMonth;
    if (!isPast && !isCurrent) continue;

    // Status sekuensial kontinu: bandingkan index periode dengan cutoff
    const idx = periodToIndex(period);
    const cutoff = unitCutoffs[unit.id];
    let status;
    if (idx <= cutoff) {
      status = 'paid';
    } else {
      // Periode setelah cutoff: overdue jika sudah lewat jatuh tempo, else pending
      status = (isPast || (isCurrent && now.getDate() > mockSettings.due_day))
        ? 'overdue'
        : 'pending';
    }

    mockIPLBills.push({
      id: `bill-${billId}`,
      unit_id: unit.id,
      resident_id: recipient?.id || null,
      period,
      amount,
      late_fee:
        status === 'overdue' && mockSettings.late_fee_enabled
          ? mockSettings.late_fee_type === 'percent'
            ? Math.round(amount * (mockSettings.late_fee_value / 100))
            : mockSettings.late_fee_value
          : 0,
      due_date: dueDate.toISOString().split('T')[0],
      status,
      qris_ref: status === 'paid' ? `QRI-${billId}` : null,
      payment_id: status === 'paid' ? `pay-${billId}` : null,
    });
    billId++;
  }
}

// ── PAYMENTS ─────────────────────────────────────────────────────
export const mockPayments = mockIPLBills
  .filter((b) => b.status === 'paid')
  .map((b) => ({
    id: b.payment_id,
    ipl_bill_id: b.id,
    resident_id: b.resident_id,
    amount: b.amount,
    method: 'qris',
    transaction_id: `TXN-${b.payment_id}`,
    status: 'completed',
    paid_at: b.due_date, // bayar sebelum/tepat jatuh tempo
  }));

// ── HELPERS ─────────────────────────────────────────────────────

/** Ambil unit berdasarkan ID */
export function getUnitById(unitId) {
  return mockUnits.find((u) => u.id === unitId) || null;
}

/** Ambil profil berdasarkan ID */
export function getProfileById(profileId) {
  return mockProfiles.find((p) => p.id === profileId) || null;
}

// ── RELASI OWNER vs OCCUPANT ─────────────────────────────────────

/** Ambil PEMILIK (owner) suatu unit. Pakai unit.owner_id bila ada,
 *  fallback ke profil pertama dengan unit_id==unitId & status owner_*.
 *  Mengembalikan objek profil atau null. */
export function getUnitOwner(unitId) {
  const unit = getUnitById(unitId);
  if (!unit) return null;
  if (unit.owner_id) {
    const p = getProfileById(unit.owner_id);
    if (p) return p;
  }
  // Fallback: profil pertama yang merefer unit ini & ber-status owner
  return (
    mockProfiles.find(
      (p) => p.unit_id === unitId && p.occupancy_status && p.occupancy_status.startsWith('owner_')
    ) || null
  );
}

/** Ambil PENGHUNI (occupant) suatu unit — tenant kalau ada, else owner.
 *  Occupant = orang yang BENAR-BENAR tinggal di unit. */
export function getUnitOccupant(unitId) {
  const tenant = mockProfiles.find(
    (p) =>
      p.unit_id === unitId &&
      p.is_active &&
      (p.occupancy_status === 'tenant' || p.occupancy_status === 'owner_occupied')
  );
  return tenant || null;
}

/** Ambil PENERIMA TAGIHAN untuk unit, sesuai setting global bill_recipient.
 *  - 'owner'    → selalu pemilik
 *  - 'occupant' → penghuni (kalau ada), fallback ke pemilik */
export function getBillRecipient(unitId) {
  if (mockSettings.bill_recipient === 'owner') {
    return getUnitOwner(unitId);
  }
  return getUnitOccupant(unitId) || getUnitOwner(unitId);
}

/** Label status penghuni */
export function occupancyStatusLabel(status) {
  return OCCUPANCY_STATUS[status] || '—';
}

/** Warna badge status penghuni */
export function occupancyStatusColor(status) {
  const map = {
    owner_occupied: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    owner_vacant: 'bg-gray-100 text-gray-500 border border-gray-200',
    owner_rented: 'bg-amber-50 text-amber-700 border border-amber-200',
    tenant: 'bg-sky-50 text-sky-700 border border-sky-200',
  };
  return map[status] || 'bg-gray-100 text-gray-600 border border-gray-200';
}


/** Format rupiah */
export function formatRupiah(amount) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Format periode YYYY-MM → "Juni 2026" */
export function formatPeriod(period) {
  const months = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
  ];
  const [y, m] = period.split('-');
  return `${months[parseInt(m, 10) - 1]} ${y}`;
}

/** Format tanggal YYYY-MM-DD → "10 Jun 2026" */
export function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** Label status tagihan */
export function billStatusLabel(status) {
  const map = {
    pending: 'Menunggu',
    paid: 'Lunas',
    overdue: 'Terlambat',
    cancelled: 'Dibatalkan',
  };
  return map[status] || status;
}

/** Warna badge status tagihan */
export function billStatusColor(status) {
  const map = {
    pending: 'bg-amber-50 text-amber-700 border-amber-200',
    paid: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    overdue: 'bg-red-50 text-red-700 border-red-200',
    cancelled: 'bg-gray-100 text-gray-500 border-gray-200',
  };
  return map[status] || 'bg-gray-100 text-gray-600 border-gray-200';
}

/** Label role */
export function roleLabel(role) {
  const map = { admin: 'Admin', rt_rw: 'RT/RW', resident: 'Warga' };
  return map[role] || role;
}

/** Warna badge role */
export function roleColor(role) {
  const map = {
    admin: 'bg-gold-500 text-forest-900',
    rt_rw: 'bg-forest-800 text-gold-400',
    resident: 'bg-forest-100 text-forest-700 border border-forest-200',
  };
  return map[role] || 'bg-gray-100 text-gray-600';
}

// ── PENGELUARAN (expenses) ────────────────────────────────────────
// Kategori & data pengeluaran bendahara. Bukti pembayaran disimpan
// sebagai nama file (string) — saat Supabase terhubung, file asli
// disimpan di Supabase Storage dan field ini berisi path/URL-nya.
export const mockExpenseCategories = [
  'Kebersihan',
  'Keamanan',
  'Perawatan Fasilitas',
  'Listrik & Air',
  'Administrasi',
  'Acara Warga',
  'Lain-lain',
];

export const mockExpenses = [
  {
    id: 'exp-1',
    date: '2026-06-05',
    category: 'Kebersihan',
    amount: 750000,
    description: 'Honor petugas kebersihan 2 orang (awal Juni)',
    receipt_file: 'kwitansi-kebersihan-jun.pdf',
    recorded_by: 'Budi Santoso (Ketua RT 01)',
    created_at: '2026-06-05T08:00:00Z',
  },
  {
    id: 'exp-2',
    date: '2026-06-08',
    category: 'Listrik & Air',
    amount: 1250000,
    description: 'Pembayaran token listrik lampu jalan kompleks',
    receipt_file: 'struk-listrik-jun.jpg',
    recorded_by: 'Budi Santoso (Ketua RT 01)',
    created_at: '2026-06-08T10:30:00Z',
  },
  {
    id: 'exp-3',
    date: '2026-06-12',
    category: 'Perawatan Fasilitas',
    amount: 500000,
    description: 'Servis pompa air taman bermain',
    receipt_file: null,
    recorded_by: 'Pak Hendra (Pengelola)',
    created_at: '2026-06-12T14:00:00Z',
  },
  {
    id: 'exp-4',
    date: '2026-05-20',
    category: 'Keamanan',
    amount: 1800000,
    description: 'Honor satpam 3 orang (Mei)',
    receipt_file: 'honor-satpam-mei.pdf',
    recorded_by: 'Budi Santoso (Ketua RT 01)',
    created_at: '2026-05-20T09:00:00Z',
  },
];

// Tambah pengeluaran baru
export function addExpense(data) {
  const expense = {
    id: 'exp-' + Date.now(),
    date: data.date,
    category: data.category,
    amount: Number(data.amount),
    description: data.description,
    receipt_file: data.receipt_file || null,
    recorded_by: data.recorded_by || 'Staff',
    created_at: new Date().toISOString(),
  };
  mockExpenses.push(expense);
  return expense;
}

// Update pengeluaran
export function updateExpense(id, data) {
  const idx = mockExpenses.findIndex((e) => e.id === id);
  if (idx < 0) return null;
  Object.assign(mockExpenses[idx], data, { amount: Number(data.amount ?? mockExpenses[idx].amount) });
  return mockExpenses[idx];
}

// Hapus pengeluaran
export function deleteExpense(id) {
  const idx = mockExpenses.findIndex((e) => e.id === id);
  if (idx < 0) return false;
  mockExpenses.splice(idx, 1);
  return true;
}

// Ambil pengeluaran untuk periode (YYYY-MM)
export function getExpensesForPeriod(period) {
  return mockExpenses.filter((e) => e.date.startsWith(period));
}

// Hitung total pengeluaran untuk periode
export function getTotalExpenses(period) {
  return getExpensesForPeriod(period).reduce((s, e) => s + e.amount, 0);
}

/** Ambil semua tagihan untuk tahun tertentu */
export function getBillsForYear(year) {
  return mockIPLBills.filter((b) => b.period.startsWith(String(year)));
}

/**
 * Ambil daftar tahun yang punya data tagihan (untuk dropdown tahun).
 */
export function getAvailableYears() {
  const years = [...new Set(mockIPLBills.map((b) => b.period.split('-')[0]))];
  return years.sort().reverse().map(Number);
}

/**
 * Bangun matriks pembayaran: baris = unit, kolom = 12 bulan.
 * Setiap sel berisi { status, bill } atau null bila tidak ada tagihan.
 *
 * @param {number} year
 * @param {object} opts - { scopeUnitId } untuk warga (hanya unit sendiri)
 * @returns array baris: { unit, resident, cells: [12] }
 */
export function getBillMatrix(year, opts = {}) {
  const { scopeUnitId } = opts;
  const units = scopeUnitId
    ? mockUnits.filter((u) => u.id === scopeUnitId)
    : mockUnits.filter((u) => u.is_occupied);

  const billsForYear = getBillsForYear(year);

  return units.map((unit) => {
    // Resident pada baris matriks = penerima tagihan sesuai setting.
    // (bisa owner atau occupant — lihat getBillRecipient)
    const resident = getBillRecipient(unit.id);
    const cells = [];
    for (let m = 1; m <= 12; m++) {
      const period = `${year}-${String(m).padStart(2, '0')}`;
      const bill = billsForYear.find(
        (b) => b.unit_id === unit.id && b.period === period
      );
      cells.push(bill ? { status: bill.status, bill } : null);
    }
    return {
      unit,
      resident: resident || null,
      cells,
    };
  });
}

/** Nama bulan pendek (Indonesia) */
export const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des',
];

/** Nama bulan panjang (Indonesia) */
export const MONTHS_LONG = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

/**
 * Hitung laporan keuangan IPL untuk periode (YYYY-MM) tertentu.
 * @returns { totalBilled, totalCollected, totalOutstanding, collectionRate, byBlock, details }
 */
export function computeReport(period) {
  const bills = mockIPLBills.filter((b) => b.period === period);
  const totalBilled = bills.reduce((s, b) => s + b.amount, 0);
  const paidBills = bills.filter((b) => b.status === 'paid');
  const totalCollected = paidBills.reduce((s, b) => s + b.amount, 0);
  const totalOutstanding = totalBilled - totalCollected;
  const collectionRate = totalBilled > 0 ? (totalCollected / totalBilled) * 100 : 0;

  // Breakdown per blok
  const byBlock = {};
  for (const b of bills) {
    const unit = getUnitById(b.unit_id);
    const block = unit?.block || '?';
    if (!byBlock[block]) {
      byBlock[block] = { block, billed: 0, collected: 0, count: 0, paid: 0 };
    }
    byBlock[block].billed += b.amount;
    byBlock[block].count += 1;
    if (b.status === 'paid') {
      byBlock[block].collected += b.amount;
      byBlock[block].paid += 1;
    }
  }

  // Detail per unit
  const details = bills.map((b) => {
    const unit = getUnitById(b.unit_id);
    const resident = getProfileById(b.resident_id);
    const payment = b.payment_id
      ? mockPayments.find((p) => p.id === b.payment_id)
      : null;
    return {
      billId: b.id,
      block: unit?.block || '-',
      unitNumber: unit?.unit_number || '-',
      residentName: resident?.full_name || '-',
      amount: b.amount,
      status: b.status,
      paidAt: payment?.paid_at || null,
    };
  });

  return {
    totalBilled,
    totalCollected,
    totalOutstanding,
    collectionRate,
    billCount: bills.length,
    paidCount: paidBills.length,
    byBlock: Object.values(byBlock).sort((a, b) => a.block.localeCompare(b.block)),
    details,
  };
}

/** Hitung denda berdasarkan settings untuk sebuah nominal */
export function computeLateFee(amount) {
  if (!mockSettings.late_fee_enabled) return 0;
  return mockSettings.late_fee_type === 'percent'
    ? Math.round(amount * (mockSettings.late_fee_value / 100))
    : mockSettings.late_fee_value;
}

// ── HELPERS: aturan urut pembayaran + input manual ──────────────

/**
 * Aturan urut LINTAS TAHUN: sebuah tagihan (unitId, period) hanya bisa
 * dibayar jika SEMUA tagihan periode sebelumnya (di tahun manapun) sudah lunas.
 *
 * @param {number} unitId
 * @param {string} period - "YYYY-MM"
 * @param {string[]} [extraPaidPeriods] - daftar periode yang sedang diseleksi
 *   untuk dibayar dalam transaksi berjalan, dianggap "sudah lunas" agar bulan
 *   berikutnya bisa ikut diseleksi (mendukung pembayaran multi-bulan runut).
 * @returns boolean
 */
export function canPayBill(unitId, period, extraPaidPeriods = []) {
  const extraSet = new Set(extraPaidPeriods);
  const earlierUnpaid = mockIPLBills.filter(
    (b) =>
      b.unit_id === unitId &&
      b.period < period &&
      b.status !== 'paid' &&
      !extraSet.has(b.period)
  );
  return earlierUnpaid.length === 0;
}

/**
 * Ambil payment record untuk sebuah bill (untuk tampil nominal + tanggal bayar).
 */
export function getPaymentForBill(billId) {
  return mockPayments.find((p) => p.ipl_bill_id === billId) || null;
}

/**
 * Catat pembayaran manual oleh bendahara (cash / transfer bank).
 * @param {string} billId
 * @param {object} opts - { method, paidAt, recordedBy, note, receiptFile }
 */
export function recordManualPayment(billId, { method, paidAt, recordedBy, note, receiptFile }) {
  const bill = mockIPLBills.find((b) => b.id === billId);
  if (!bill) return null;
  const paymentId = `pay-manual-${Date.now()}`;
  bill.status = 'paid';
  bill.late_fee = 0;
  bill.payment_id = paymentId;
  const payment = {
    id: paymentId,
    ipl_bill_id: bill.id,
    resident_id: bill.resident_id,
    amount: bill.amount,
    method,
    transaction_id: `MANUAL-${paymentId}`,
    status: 'completed',
    paid_at: paidAt,
    receipt_file: receiptFile || null,
    metadata: { recorded_by: recordedBy || 'staff', note: note || '' },
  };
  mockPayments.push(payment);
  return payment;
}

/**
 * Catat pembayaran warga multi-bulan (QRIS / transfer bank dengan bukti).
 * @param {string[]} billIds
 * @param {object} opts - { method: 'qris'|'bank_transfer', receiptFile?, note?, payerName? }
 */
export function recordResidentPayment(billIds, { method, receiptFile = null, note = '', payerName = '' } = {}) {
  let count = 0;
  const paidAt = new Date().toISOString().split('T')[0];
  for (const billId of billIds) {
    const bill = mockIPLBills.find((b) => b.id === billId);
    if (!bill || bill.status === 'paid') continue;
    const paymentId = `pay-resident-${Date.now()}-${count}`;
    bill.status = 'paid';
    bill.late_fee = 0;
    bill.payment_id = paymentId;
    mockPayments.push({
      id: paymentId,
      ipl_bill_id: bill.id,
      resident_id: bill.resident_id,
      amount: bill.amount,
      method,
      transaction_id: `${method === 'qris' ? 'TXN' : 'MANUAL'}-${paymentId}`,
      status: 'completed',
      paid_at: paidAt,
      receipt_file: receiptFile || null,
      metadata: { note: note || '', payer: payerName || '' },
    });
    count++;
  }
  return count;
}

/** Format nominal ringkas untuk sel matriks: 500000 → "500k" */
export function formatShort(amount) {
  if (amount >= 1000000) return `${(amount / 1000000).toFixed(amount % 1000000 ? 1 : 0)}jt`;
  if (amount >= 1000) return `${Math.round(amount / 1000)}k`;
  return String(amount);
}
