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

// ── BILL STATUS ──────────────────────────────────────────────────
export function billStatusLabel(status) {
  const map = { pending: 'Belum Bayar', paid: 'Lunas', overdue: 'Terlambat', partial: 'Sebagian', waiting_verification: 'Menunggu Verifikasi' };
  return map[status] || status;
}

export function billStatusColor(status) {
  const map = {
    pending: 'bg-amber-100 text-amber-700',
    paid: 'bg-emerald-100 text-emerald-700',
    overdue: 'bg-red-100 text-red-700',
    partial: 'bg-blue-100 text-blue-700',
    waiting_verification: 'bg-purple-100 text-purple-700',
  };
  return map[status] || 'bg-gray-100 text-gray-700';
}

// ── ROLE HELPERS ─────────────────────────────────────────────────
const ROLE_HIERARCHY = ['warga', 'pengurus', 'bendahara', 'admin'];

export function hasMinRole(userRole, minRole) {
  return ROLE_HIERARCHY.indexOf(userRole) >= ROLE_HIERARCHY.indexOf(minRole);
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

export function roleLabel(role) {
  const map = { warga: 'Warga', pengurus: 'Pengurus RT', bendahara: 'Bendahara', admin: 'Admin' };
  return map[role] || role || '-';
}

export function roleColor(role) {
  const map = {
    admin: 'bg-purple-100 text-purple-700 border-purple-200',
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

// ── MONTH CONSTANTS ──────────────────────────────────────────────
export const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des',
];

export const MONTHS_LONG = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];
