/**
 * dataHelpers.js
 *
 * Mode-agnostic utility functions for formatting, labels, and role checks.
 * These are safe to import in both demo and production modes because they
 * contain no mock data — only pure helper logic.
 *
 * Components should import helpers from here instead of from mockData.js
 * when they only need formatting/label utilities.
 */

// ── STATUS PENGHUNI ──────────────────────────────────────────────
export const OCCUPANCY_STATUS = {
  owner_occupied: 'Tetap / Owner - Dihuni',
  owner_vacant: 'Tetap / Owner - Tidak Dihuni',
  owner_rented: 'Tetap / Owner - Dikontrakkan',
  tenant: 'Kontrak',
};

// ── FORMATTING ───────────────────────────────────────────────────
export function formatRupiah(amount) {
  if (amount == null || isNaN(amount)) return 'Rp 0';
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatShort(amount) {
  if (amount == null || isNaN(amount)) return 'Rp 0';
  if (amount >= 1_000_000) return `Rp ${(amount / 1_000_000).toFixed(1)}jt`;
  if (amount >= 1_000) return `Rp ${(amount / 1_000).toFixed(0)}rb`;
  return formatRupiah(amount);
}

export function formatPeriod(period) {
  if (!period) return '-';
  const [y, m] = period.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des'];
  return `${months[parseInt(m, 10) - 1] || m} ${y}`;
}

export function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  const datePart = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  const timePart = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  return `${datePart} ${timePart}`;
}


// ── BILL STATUS ──────────────────────────────────────────────────
export function billStatusLabel(status) {
  const map = {
    pending: 'Belum Bayar',
    paid: 'Lunas',
    overdue: 'Terlambat',
    partial: 'Sebagian',
    waiting_verification: 'Menunggu Verifikasi',
    pending_verification: 'Menunggu Verifikasi',
    rejected: 'Ditolak',
    cancelled: 'Dibatalkan',
    failed: 'Gagal',
    expired: 'Kedaluwarsa',
  };
  return map[status] || status;
}

export function billStatusColor(status) {
  const map = {
    pending: 'bg-amber-100 text-amber-700',
    paid: 'bg-emerald-100 text-emerald-700',
    overdue: 'bg-red-100 text-red-700',
    partial: 'bg-blue-100 text-blue-700',
    waiting_verification: 'bg-purple-100 text-purple-700',
    pending_verification: 'bg-orange-100 text-orange-700',
    rejected: 'bg-red-100 text-red-700',
    cancelled: 'bg-gray-100 text-gray-500',
    failed: 'bg-red-100 text-red-700',
    expired: 'bg-gray-100 text-gray-500',
  };
  return map[status] || 'bg-gray-100 text-gray-700';
}

// ── ROLE HELPERS ─────────────────────────────────────────────────
// Keep payment status values consistent across API response shapes.
export function normalizePaymentStatus(status, { method = '', hasProof = false } = {}) {
  const value = String(status || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (['completed', 'success', 'successful', 'paid', 'verified'].includes(value)) {
    return 'verified';
  }
  if (
    [
      'pending_verification',
      'waiting_verification',
      'awaiting_verification',
      'submitted',
      'menunggu_verifikasi',
    ].includes(value)
  ) {
    return 'pending_verification';
  }
  if (['rejected', 'declined', 'denied'].includes(value)) {
    return 'rejected';
  }
  // Older transfer records can remain `pending` after proof upload.
  if (value === 'pending' && String(method).toLowerCase() === 'bank_transfer' && hasProof) {
    return 'pending_verification';
  }
  return status || '';
}

export function isPendingVerificationStatus(status, options) {
  return normalizePaymentStatus(status, options) === 'pending_verification';
}

const ROLE_HIERARCHY = ['warga', 'pengurus', 'bendahara', 'admin', 'admin_viewer'];
const READ_ONLY_ROLES = new Set(['admin_viewer']);

export function hasMinRole(userRole, minRole) {
  return ROLE_HIERARCHY.indexOf(userRole) >= ROLE_HIERARCHY.indexOf(minRole);
}

export function canModifyData(role) {
  return ROLE_HIERARCHY.includes(role) && !READ_ONLY_ROLES.has(role);
}

export function isStaffRole(role) {
  return hasMinRole(role, 'pengurus');
}

export function isBendaharaOrAbove(role) {
  return hasMinRole(role, 'bendahara');
}

export function canViewFinancialReports(role) {
  return ['pengurus', 'bendahara', 'admin', 'admin_viewer'].includes(role);
}

export function isAdminRole(role) {
  return role === 'admin';
}

export function roleLabel(role) {
  const map = { warga: 'Warga', pengurus: 'Koordinator Palm Village', bendahara: 'Bendahara', admin: 'Admin', admin_viewer: 'Admin Viewer' };
  return map[role] || role || '-';
}

export function roleColor(role) {
  const map = {
    admin: 'bg-purple-100 text-purple-700 border-purple-200',
    admin_viewer: 'bg-slate-100 text-slate-700 border-slate-200',
    bendahara: 'bg-teal-100 text-teal-700 border-teal-200',
    pengurus: 'bg-blue-100 text-blue-700 border-blue-200',
    warga: 'bg-forest-100 text-forest-700 border-forest-200',
  };
  return map[role] || 'bg-gray-100 text-gray-500 border-gray-200';
}

// ── OCCUPANCY STATUS ─────────────────────────────────────────────
export function occupancyStatusLabel(status) {
  return OCCUPANCY_STATUS[status] || status || '-';
}

export function occupancyStatusColor(status) {
  const map = {
    owner_occupied: 'bg-emerald-100 text-emerald-700',
    owner_vacant: 'bg-amber-100 text-amber-700',
    owner_rented: 'bg-blue-100 text-blue-700',
    tenant: 'bg-indigo-100 text-indigo-700',
  };
  return map[status] || 'bg-gray-100 text-gray-500';
}

// ── IPL SCHEMA HELPERS ───────────────────────────────────────────
export function computeSchemaAmount(schema) {
  if (!schema || !schema.components) return 0;
  return schema.components.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
}

export function getSchemaById(schemas, schemaId) {
  if (!schemas || !schemas.length) return null;
  return schemas.find((s) => s.id === schemaId) || schemas[0];
}

// ── MONTH CONSTANTS ──────────────────────────────────────────────
export const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des',
];

export const MONTHS_LONG = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];
