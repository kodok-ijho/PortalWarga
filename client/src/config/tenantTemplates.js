/**
 * Konfigurasi istilah (naming) & template vertikal per tenant.type
 * Ref: specification.md §7, requirement.md FR-2, FR-7, FR-16 s/d FR-21
 */

export const TENANT_TEMPLATES = {
  rt_rw: {
    type: 'rt_rw',
    name: 'RT/RW & Perumahan',
    icon: '🏘️',
    unitLabel: 'Rumah',
    unitPluralLabel: 'Rumah / Kavling',
    billLabel: 'IPL',
    billPluralLabel: 'Iuran IPL & Kas',
    memberLabel: 'Warga',
    memberPluralLabel: 'Daftar Warga',
    adminLabel: 'Ketua RT/RW',
    treasurerLabel: 'Bendahara RT/RW',
    communityLabel: 'Kompleks Lingkungan',
    emptyUnitLabel: 'Rumah Kosong',
    occupiedUnitLabel: 'Dihuni',
    paymentActionLabel: 'Bayar IPL',
    headerResidentUnit: 'Rumah / Warga',
    contractLabel: 'Status Huni',
    feeLabel: 'Iuran IPL',
    unitPlaceholder: 'Misal: Blok A/12',
    features: {
      hasMultiYearMatrix: true,
      hasRoomStatus: false,
      hasArisanDraw: false,
      hasStudentAttendance: false,
      hasPublicListing: true, // Modul listing UMKM warga
    },
  },
  kos: {
    type: 'kos',
    name: 'Kos-kosan & Kontrakan',
    icon: '🏢',
    unitLabel: 'Kamar',
    unitPluralLabel: 'Kamar / Pintu',
    billLabel: 'Sewa',
    billPluralLabel: 'Tagihan Sewa Kamar',
    memberLabel: 'Penyewa',
    memberPluralLabel: 'Daftar Penyewa',
    adminLabel: 'Pemilik Kos',
    treasurerLabel: 'Pengelola Kos',
    communityLabel: 'Properti Kos',
    emptyUnitLabel: 'Kamar Kosong',
    occupiedUnitLabel: 'Tersewa',
    paymentActionLabel: 'Bayar Uang Sewa',
    headerResidentUnit: 'Kamar / Penyewa',
    contractLabel: 'Kontrak Sewa',
    feeLabel: 'Tarif Sewa',
    unitPlaceholder: 'Misal: Kamar 101',
    features: {
      hasMultiYearMatrix: false,
      hasRoomStatus: true,
      hasArisanDraw: false,
      hasStudentAttendance: false,
      hasPublicListing: true, // Modul listing kamar kosong
    },
  },
  arisan: {
    type: 'arisan',
    name: 'Kelompok Arisan',
    icon: '🎲',
    unitLabel: 'Slot',
    unitPluralLabel: 'Slot Undian',
    billLabel: 'Kontribusi',
    billPluralLabel: 'Iuran Kontribusi',
    memberLabel: 'Peserta',
    memberPluralLabel: 'Peserta Arisan',
    adminLabel: 'Ketua / Admin Arisan',
    treasurerLabel: 'Bendahara Arisan',
    communityLabel: 'Grup Arisan',
    emptyUnitLabel: 'Slot Tersedia',
    occupiedUnitLabel: 'Slot Terisi',
    paymentActionLabel: 'Setor Kontribusi',
    headerResidentUnit: 'Slot / Peserta',
    contractLabel: 'Keikutsertaan',
    feeLabel: 'Kontribusi Arisan',
    unitPlaceholder: 'Misal: Nomor Undian 01',
    features: {
      hasMultiYearMatrix: false,
      hasRoomStatus: false,
      hasArisanDraw: true,
      hasStudentAttendance: false,
      hasPublicListing: false,
    },
  },
  kelas: {
    type: 'kelas',
    name: 'Kelas & Kursus',
    icon: '📚',
    unitLabel: 'Slot',
    unitPluralLabel: 'Slot Siswa',
    billLabel: 'Iuran',
    billPluralLabel: 'SPP / Iuran Kursus',
    memberLabel: 'Siswa',
    memberPluralLabel: 'Daftar Siswa',
    adminLabel: 'Pengajar / Pengelola',
    treasurerLabel: 'Bagian Administrasi',
    communityLabel: 'Kelas Belajar',
    emptyUnitLabel: 'Slot Terbuka',
    occupiedUnitLabel: 'Siswa Terdaftar',
    paymentActionLabel: 'Bayar Iuran Kursus',
    headerResidentUnit: 'Slot / Siswa',
    contractLabel: 'Pendaftaran',
    feeLabel: 'Iuran SPP',
    unitPlaceholder: 'Misal: Kursi 01 / Siswa A',
    features: {
      hasMultiYearMatrix: false,
      hasRoomStatus: false,
      hasArisanDraw: false,
      hasStudentAttendance: true,
      hasPublicListing: false,
    },
  },
};

export const DEFAULT_TEMPLATE = TENANT_TEMPLATES.rt_rw;

/**
 * Helper untuk mendapatkan template vertikal berdasarkan tipe tenant
 * @param {string} tenantType - 'rt_rw' | 'kos' | 'arisan' | 'kelas'
 * @returns {object} Template konfigurasi vertikal
 */
export function getTenantTemplate(tenantType) {
  return TENANT_TEMPLATES[tenantType] || DEFAULT_TEMPLATE;
}
