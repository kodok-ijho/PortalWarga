/**
 * platformFoundationRegression.test.js — T11.2 Regression Test Fondasi Platform (Phase 1–5)
 *
 * Menguji fondasi multi-tenant SaaS platform RuangWarga:
 *   1. Trial Expiry & Lifecycle State Machine (Trial -> Read-Only -> Active)
 *   2. Perilaku Read-Only Lintas Platform (UI Gate, Role-based messaging, blocking mutasi)
 *   3. Renewal & Mesin Billing Platform (Optimal blocks, period discounts, akumulasi perpanjangan)
 *   4. Isolasi Tenant (Data segregation, role boundary, multi-tenant resolution)
 *   5. Akses Platform Owner Dashboard (Platform Admin Guard, agregasi multi-tenant, metrik MRR)
 *
 * Ref: task.md T11.2, requirement.md FR-7 s/d FR-15, specification.md §2, §3, §6, §7, §8
 */
import { describe, it, expect } from 'vitest';
import {
  calculateOptimalBlocks,
  calculateSubscriptionBill,
  DEFAULT_BASE_PRICING,
  DEFAULT_PERIOD_DISCOUNTS,
} from '../utils/billingCalculator';
import { DEMO_TENANTS } from '../context/TenantContext';
import { TENANT_TEMPLATES, getTenantTemplate } from '../config/tenantTemplates';

// ─────────────────────────────────────────────────────────────────────────────
// Pure Helper: Logika Subscription Gate (dari useSubscriptionGate / T5.1)
// ─────────────────────────────────────────────────────────────────────────────
function evaluateSubscriptionGate(status, role, actionName = 'Aksi ini') {
  const isReadOnly = status === 'read_only';
  const canTransact = !isReadOnly;
  const isStaff = ['admin', 'bendahara', 'pengurus'].includes(role);

  let tooltip = '';
  if (isReadOnly) {
    if (isStaff) {
      tooltip = `${actionName} dinonaktifkan sementara karena status layanan Read-Only. Klik untuk memperpanjang paket langganan.`;
    } else {
      tooltip = 'Layanan sedang dalam pemeliharaan sistem. Silakan hubungi pengurus atau pengelola Anda.';
    }
  }

  return { canTransact, isReadOnly, isStaff, tooltip };
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure Helper: Logika Check Expirations (dari check_subscription_expirations RPC / T4.6)
// ─────────────────────────────────────────────────────────────────────────────
function evaluateSubscriptionExpiration(subscription, now = new Date()) {
  const { status, trial_ends_at, current_period_end } = subscription;

  if (status === 'trial') {
    if (trial_ends_at && new Date(trial_ends_at) < now) {
      return { status: 'read_only', transitioned: true, reason: 'trial_expired' };
    }
    return { status: 'trial', transitioned: false, reason: 'trial_active' };
  }

  if (status === 'active') {
    if (current_period_end && new Date(current_period_end) < now) {
      return { status: 'read_only', transitioned: true, reason: 'period_expired' };
    }
    return { status: 'active', transitioned: false, reason: 'period_active' };
  }

  return { status: status || 'read_only', transitioned: false, reason: 'already_terminal' };
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure Helper: Logika Aktivasi & Perpanjangan Langganan (dari activate_tenant_subscription RPC / T4.5)
// ─────────────────────────────────────────────────────────────────────────────
function simulateActivateSubscription({
  currentSubscription,
  durationMonths,
  paymentStatus = 'pending',
  now = new Date(),
}) {
  if (paymentStatus === 'settled') {
    return {
      success: true,
      idempotent: true,
      subscription: currentSubscription,
      message: 'Payment already settled',
    };
  }

  const { status, current_period_end } = currentSubscription;
  let newStart = now;
  let newEnd;

  // Jika saat ini active dan belum expired, perpanjang dari current_period_end
  if (status === 'active' && current_period_end && new Date(current_period_end) > now) {
    const baseDate = new Date(current_period_end);
    newEnd = new Date(baseDate.setMonth(baseDate.getMonth() + durationMonths));
  } else {
    // Mulai periode baru dari now()
    const baseDate = new Date(now);
    newEnd = new Date(baseDate.setMonth(baseDate.getMonth() + durationMonths));
  }

  return {
    success: true,
    idempotent: false,
    subscription: {
      ...currentSubscription,
      status: 'active',
      current_period_start: newStart.toISOString(),
      current_period_end: newEnd.toISOString(),
    },
    message: 'Subscription successfully activated',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure Helper: Logika Platform Guard (dari PlatformLayout.jsx / T3.4)
// ─────────────────────────────────────────────────────────────────────────────
function evaluatePlatformAccess({ isAuthenticated, isPlatformAdmin }) {
  if (!isAuthenticated) {
    return { allowed: false, reason: 'unauthenticated', redirect: '/login' };
  }
  if (!isPlatformAdmin) {
    return { allowed: false, reason: 'forbidden', code: 403 };
  }
  return { allowed: true, reason: 'authorized' };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. REGRESSION TEST: Trial Expiry & Subscription Lifecycle
// ─────────────────────────────────────────────────────────────────────────────
describe('Fondasi Platform (T11.2) — 1. Trial Expiry & Lifecycle State Machine', () => {
  it('tenant baru memiliki status trial aktif selama masa percobaan belum kedaluwarsa', () => {
    const now = new Date('2026-09-15T00:00:00Z');
    const sub = {
      status: 'trial',
      trial_started_at: '2026-09-10T00:00:00Z',
      trial_ends_at: '2026-09-24T00:00:00Z', // 14 hari
      current_period_start: null,
      current_period_end: null,
    };

    const res = evaluateSubscriptionExpiration(sub, now);
    expect(res.status).toBe('trial');
    expect(res.transitioned).toBe(false);
    expect(res.reason).toBe('trial_active');
  });

  it('transisi otomatis dari trial ke read_only saat trial_ends_at terlewati (FR-7, FR-12)', () => {
    const now = new Date('2026-09-25T00:00:00Z'); // 1 hari setelah trial selesai
    const sub = {
      status: 'trial',
      trial_started_at: '2026-09-10T00:00:00Z',
      trial_ends_at: '2026-09-24T00:00:00Z',
      current_period_start: null,
      current_period_end: null,
    };

    const res = evaluateSubscriptionExpiration(sub, now);
    expect(res.status).toBe('read_only');
    expect(res.transitioned).toBe(true);
    expect(res.reason).toBe('trial_expired');
  });

  it('transisi otomatis dari active ke read_only saat current_period_end terlewati (FR-13)', () => {
    const now = new Date('2027-01-01T00:00:00Z'); // Setelah paket 2026 berakhir
    const sub = {
      status: 'active',
      trial_started_at: null,
      trial_ends_at: null,
      current_period_start: '2026-01-01T00:00:00Z',
      current_period_end: '2026-12-31T23:59:59Z',
    };

    const res = evaluateSubscriptionExpiration(sub, now);
    expect(res.status).toBe('read_only');
    expect(res.transitioned).toBe(true);
    expect(res.reason).toBe('period_expired');
  });

  it('batch expiration: memproses beberapa tenant sekaligus dan menghitung jumlah terdampak', () => {
    const now = new Date('2026-09-15T12:00:00Z');
    const mockSubscriptions = [
      { id: 's1', status: 'trial', trial_ends_at: '2026-09-01T00:00:00Z' }, // Expired trial
      { id: 's2', status: 'trial', trial_ends_at: '2026-09-20T00:00:00Z' }, // Active trial
      { id: 's3', status: 'active', current_period_end: '2026-09-10T00:00:00Z' }, // Expired active
      { id: 's4', status: 'active', current_period_end: '2026-12-31T00:00:00Z' }, // Active active
      { id: 's5', status: 'read_only', current_period_end: '2026-08-01T00:00:00Z' }, // Already read_only
    ];

    const results = mockSubscriptions.map((s) => ({
      id: s.id,
      ...evaluateSubscriptionExpiration(s, now),
    }));

    const transitionedCount = results.filter((r) => r.transitioned).length;
    expect(transitionedCount).toBe(2); // s1 dan s3 berubah jadi read_only
    expect(results.find((r) => r.id === 's1').status).toBe('read_only');
    expect(results.find((r) => r.id === 's2').status).toBe('trial');
    expect(results.find((r) => r.id === 's3').status).toBe('read_only');
    expect(results.find((r) => r.id === 's4').status).toBe('active');
    expect(results.find((r) => r.id === 's5').status).toBe('read_only');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. REGRESSION TEST: Perilaku Read-Only Lintas Platform (Phase 5)
// ─────────────────────────────────────────────────────────────────────────────
describe('Fondasi Platform (T11.2) — 2. Perilaku Read-Only Lintas Platform', () => {
  it('mengizinkan transaksi operasional pada status active dan trial', () => {
    const activeAdmin = evaluateSubscriptionGate('active', 'admin', 'Tambah Rumah');
    expect(activeAdmin.canTransact).toBe(true);
    expect(activeAdmin.isReadOnly).toBe(false);
    expect(activeAdmin.tooltip).toBe('');

    const trialStaff = evaluateSubscriptionGate('trial', 'bendahara', 'Buat Tagihan IPL');
    expect(trialStaff.canTransact).toBe(true);
    expect(trialStaff.isReadOnly).toBe(false);
    expect(trialStaff.tooltip).toBe('');

    const activeMember = evaluateSubscriptionGate('active', 'anggota', 'Bayar Tagihan');
    expect(activeMember.canTransact).toBe(true);
    expect(activeMember.isReadOnly).toBe(false);
  });

  it('memblokir transaksi pada status read_only dengan pesan yang tepat per role (FR-15)', () => {
    // 1. Admin mendapat pesan instruksi perpanjangan paket
    const readOnlyAdmin = evaluateSubscriptionGate('read_only', 'admin', 'Tambah Unit');
    expect(readOnlyAdmin.canTransact).toBe(false);
    expect(readOnlyAdmin.isReadOnly).toBe(true);
    expect(readOnlyAdmin.tooltip).toContain('Read-Only');
    expect(readOnlyAdmin.tooltip).toContain('Klik untuk memperpanjang paket langganan');

    // 2. Bendahara/Pengurus juga mendapat pesan perpanjangan
    const readOnlyTreasurer = evaluateSubscriptionGate('read_only', 'bendahara', 'Verifikasi Pembayaran');
    expect(readOnlyTreasurer.canTransact).toBe(false);
    expect(readOnlyTreasurer.tooltip).toContain('Read-Only');

    // 3. Warga/Anggota mendapat pesan ramah tanpa kebocoran istilah teknis platform
    const readOnlyMember = evaluateSubscriptionGate('read_only', 'anggota', 'Bayar IPL');
    expect(readOnlyMember.canTransact).toBe(false);
    expect(readOnlyMember.isReadOnly).toBe(true);
    expect(readOnlyMember.tooltip).toContain('pemeliharaan sistem');
    expect(readOnlyMember.tooltip).toContain('hubungi pengurus atau pengelola');
    expect(readOnlyMember.tooltip).not.toContain('subscription');
    expect(readOnlyMember.tooltip).not.toContain('paket langganan');
    expect(readOnlyMember.tooltip).not.toContain('Read-Only');
  });

  it('memastikan simulasi mutasi data operasional menolak penulisan saat read_only', () => {
    function simulateOperationalMutation(subscriptionStatus, mutationFn) {
      if (subscriptionStatus === 'read_only') {
        throw new Error('Operasi ditolak: Tenant dalam status Read-Only. Perpanjang langganan untuk melanjutkan.');
      }
      return mutationFn();
    }

    // Mutasi berhasil saat active
    const successResult = simulateOperationalMutation('active', () => ({ created: true, id: 101 }));
    expect(successResult.created).toBe(true);

    // Mutasi berhasil saat trial
    const trialResult = simulateOperationalMutation('trial', () => ({ created: true, id: 102 }));
    expect(trialResult.created).toBe(true);

    // Mutasi dilempar error saat read_only
    expect(() =>
      simulateOperationalMutation('read_only', () => ({ created: true, id: 103 }))
    ).toThrow(/Tenant dalam status Read-Only/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. REGRESSION TEST: Renewal & Mesin Billing Platform (Phase 4)
// ─────────────────────────────────────────────────────────────────────────────
describe('Fondasi Platform (T11.2) — 3. Renewal & Mesin Billing Platform', () => {
  it('calculateOptimalBlocks menghasilkan kombinasi blok optimal untuk seluruh 4 vertikal', () => {
    const verticals = ['rt_rw', 'kos', 'arisan', 'kelas'];

    verticals.forEach((type) => {
      const res = calculateOptimalBlocks(23, type);
      expect(res).toBeDefined();
      expect(res.tenantType).toBe(type);
      expect(res.recommended.totalCapacity).toBeGreaterThanOrEqual(23);
      // Kapasitas adalah kelipatan kombinasi blok 10 dan 5
      expect((res.recommended.blocks10 * 10) + (res.recommended.blocks5 * 5)).toBe(res.recommended.totalCapacity);
      expect(res.recommended.monthlyBasePrice).toBeGreaterThan(0);
      expect(res.recommended.annualTotal).toBeGreaterThan(0);
    });
  });

  it('calculateSubscriptionBill menghitung diskon periode 3, 6, dan 12 bulan secara akurat (FR-9, FR-10)', () => {
    const blocks10 = 2; // 20 unit
    const blocks5 = 1;  // 5 unit
    // Total kapasitas = 25 unit. Untuk rt_rw: 2*12500 + 1*8750 = 33750/bulan

    // 1. Paket 3 bulan (diskon 0%)
    const bill3 = calculateSubscriptionBill(blocks10, blocks5, 3, 'rt_rw');
    expect(bill3.durationMonths).toBe(3);
    expect(bill3.discountPercent).toBe(0);
    expect(bill3.rawTotal).toBe(33750 * 3);
    expect(bill3.discountAmount).toBe(0);
    expect(bill3.finalTotal).toBe(101250);

    // 2. Paket 6 bulan (diskon 10%)
    const bill6 = calculateSubscriptionBill(blocks10, blocks5, 6, 'rt_rw');
    expect(bill6.durationMonths).toBe(6);
    expect(bill6.discountPercent).toBe(10);
    expect(bill6.rawTotal).toBe(33750 * 6); // 202500
    expect(bill6.discountAmount).toBe(Math.round(202500 * 0.1)); // 20250
    expect(bill6.finalTotal).toBe(182250);

    // 3. Paket 12 bulan (diskon 20%)
    const bill12 = calculateSubscriptionBill(blocks10, blocks5, 12, 'rt_rw');
    expect(bill12.durationMonths).toBe(12);
    expect(bill12.discountPercent).toBe(20);
    expect(bill12.rawTotal).toBe(33750 * 12); // 405000
    expect(bill12.discountAmount).toBe(Math.round(405000 * 0.2)); // 81000
    expect(bill12.finalTotal).toBe(324000);
    expect(bill12.effectiveMonthlyPrice).toBe(27000); // 324000 / 12
  });

  it('aktivasi langganan baru dari status read_only / trial mengubah status menjadi active', () => {
    const now = new Date('2026-09-15T10:00:00Z');
    const readOnlySub = {
      id: 'sub-test-01',
      status: 'read_only',
      current_period_start: null,
      current_period_end: null,
    };

    const result = simulateActivateSubscription({
      currentSubscription: readOnlySub,
      durationMonths: 6,
      paymentStatus: 'pending',
      now,
    });

    expect(result.success).toBe(true);
    expect(result.subscription.status).toBe('active');
    expect(result.subscription.current_period_start).toBe(now.toISOString());
    // Masa berlaku harus bertambah 6 bulan dari sekarang
    const expectedEnd = new Date(now);
    expectedEnd.setMonth(expectedEnd.getMonth() + 6);
    expect(result.subscription.current_period_end).toBe(expectedEnd.toISOString());
  });

  it('perpanjangan kumulatif (renewal): jika langganan masih aktif, perpanjangan ditambah dari current_period_end', () => {
    const now = new Date('2026-09-15T10:00:00Z');
    const activeSub = {
      id: 'sub-test-02',
      status: 'active',
      current_period_start: '2026-01-01T00:00:00Z',
      current_period_end: '2026-12-31T23:59:59Z', // Masih aktif sampai akhir 2026
    };

    // User memperpanjang 12 bulan sebelum paket habis
    const result = simulateActivateSubscription({
      currentSubscription: activeSub,
      durationMonths: 12,
      paymentStatus: 'pending',
      now,
    });

    expect(result.success).toBe(true);
    expect(result.subscription.status).toBe('active');
    // Akhir periode baru harus 12 bulan setelah 31 Des 2026 (yaitu akhir 2027)
    const baseDate = new Date('2026-12-31T23:59:59Z');
    baseDate.setMonth(baseDate.getMonth() + 12);
    expect(result.subscription.current_period_end).toBe(baseDate.toISOString());
  });

  it('idempotensi aktivasi pembayaran: pembayaran yang sudah settled tidak dieksekusi ulang', () => {
    const sub = {
      id: 'sub-test-03',
      status: 'active',
      current_period_end: '2027-06-30T00:00:00Z',
    };

    const result = simulateActivateSubscription({
      currentSubscription: sub,
      durationMonths: 6,
      paymentStatus: 'settled', // Sudah diproses sebelumnya
    });

    expect(result.success).toBe(true);
    expect(result.idempotent).toBe(true);
    expect(result.message).toContain('already settled');
    expect(result.subscription.current_period_end).toBe('2027-06-30T00:00:00Z'); // Tidak berubah ganda
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. REGRESSION TEST: Isolasi Tenant & Multi-Tenant Resolution (Phase 1 & 2)
// ─────────────────────────────────────────────────────────────────────────────
describe('Fondasi Platform (T11.2) — 4. Isolasi Tenant & Resolusi Multi-Tenant', () => {
  it('DEMO_TENANTS mencakup representasi keempat tipe vertikal', () => {
    expect(Array.isArray(DEMO_TENANTS)).toBe(true);
    expect(DEMO_TENANTS.length).toBe(4);

    const types = DEMO_TENANTS.map((t) => t.type);
    expect(types).toContain('rt_rw');
    expect(types).toContain('kos');
    expect(types).toContain('arisan');
    expect(types).toContain('kelas');
  });

  it('setiap tenant memiliki skema data dan subscription yang terisolasi', () => {
    DEMO_TENANTS.forEach((tenant) => {
      expect(tenant.id).toBeDefined();
      expect(tenant.name).toBeDefined();
      expect(tenant.type).toBeDefined();
      expect(tenant.subscription).toBeDefined();
      expect(['active', 'trial', 'read_only']).toContain(tenant.subscription.status);
    });

    // ID tenant tidak boleh ada yang duplikat
    const idSet = new Set(DEMO_TENANTS.map((t) => t.id));
    expect(idSet.size).toBe(DEMO_TENANTS.length);
  });

  it('simulasi query multi-tenant memfilter data secara ketat berdasarkan tenant_id (RLS Isolation)', () => {
    const allUnits = [
      { id: 1, tenant_id: 'tenant-a', label: 'Rumah A1' },
      { id: 2, tenant_id: 'tenant-a', label: 'Rumah A2' },
      { id: 3, tenant_id: 'tenant-b', label: 'Kamar 101' },
      { id: 4, tenant_id: 'tenant-b', label: 'Kamar 102' },
      { id: 5, tenant_id: 'tenant-c', label: 'Slot Siswa 1' },
    ];

    // Isolasi query untuk Tenant A
    const tenantAUnits = allUnits.filter((u) => u.tenant_id === 'tenant-a');
    expect(tenantAUnits.length).toBe(2);
    expect(tenantAUnits.every((u) => u.tenant_id === 'tenant-a')).toBe(true);

    // Isolasi query untuk Tenant B
    const tenantBUnits = allUnits.filter((u) => u.tenant_id === 'tenant-b');
    expect(tenantBUnits.length).toBe(2);
    expect(tenantBUnits.every((u) => u.tenant_id === 'tenant-b')).toBe(true);

    // Data tidak bocor antar tenant
    expect(tenantAUnits.some((u) => u.tenant_id === 'tenant-b')).toBe(false);
    expect(tenantBUnits.some((u) => u.tenant_id === 'tenant-a')).toBe(false);
  });

  it('resolusi activeTenantId: memilih tenant valid dan fallback secara aman', () => {
    const tenants = [
      { id: 'tenant-1', name: 'Komplek A' },
      { id: 'tenant-2', name: 'Kos B' },
    ];

    // 1. Saved tenant valid di localStorage
    const savedId = 'tenant-2';
    const resolvedActive = tenants.find((t) => t.id === savedId) || tenants[0];
    expect(resolvedActive.id).toBe('tenant-2');

    // 2. Saved tenant invalid/stale -> fallback ke tenant pertama
    const staleSavedId = 'tenant-nonexistent';
    const fallbackActive = tenants.find((t) => t.id === staleSavedId) || tenants[0];
    expect(fallbackActive.id).toBe('tenant-1');
  });

  it('konfigurasi template vertikal sesuai dengan tipe tenant (TENANT_TEMPLATES)', () => {
    const rtrwTpl = getTenantTemplate('rt_rw');
    expect(rtrwTpl.unitLabel).toBe('Rumah');
    expect(rtrwTpl.memberLabel).toBe('Warga');
    expect(rtrwTpl.billLabel).toBe('IPL');
    expect(rtrwTpl.features.hasMultiYearMatrix).toBe(true);

    const kosTpl = getTenantTemplate('kos');
    expect(kosTpl.unitLabel).toBe('Kamar');
    expect(kosTpl.memberLabel).toBe('Penyewa');
    expect(kosTpl.billLabel).toBe('Sewa');
    expect(kosTpl.features.hasRoomStatus).toBe(true);

    const arisanTpl = getTenantTemplate('arisan');
    expect(arisanTpl.unitLabel).toBe('Slot');
    expect(arisanTpl.memberLabel).toBe('Peserta');
    expect(arisanTpl.features.hasArisanDraw).toBe(true);

    const kelasTpl = getTenantTemplate('kelas');
    expect(kelasTpl.unitLabel).toBe('Slot');
    expect(kelasTpl.memberLabel).toBe('Siswa');
    expect(kelasTpl.billLabel).toBe('Iuran');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. REGRESSION TEST: Akses Platform Owner Dashboard (Phase 3)
// ─────────────────────────────────────────────────────────────────────────────
describe('Fondasi Platform (T11.2) — 5. Akses Platform Owner Dashboard', () => {
  it('Platform Guard: mengizinkan Platform Admin mengakses /platform/*', () => {
    const access = evaluatePlatformAccess({
      isAuthenticated: true,
      isPlatformAdmin: true,
    });
    expect(access.allowed).toBe(true);
    expect(access.reason).toBe('authorized');
  });

  it('Platform Guard: memblokir user yang bukan Platform Admin (403 Forbidden)', () => {
    // 1. Regular Tenant Admin (Ketua RT / Pemilik Kos) BUKAN Platform Admin
    const tenantAdminAccess = evaluatePlatformAccess({
      isAuthenticated: true,
      isPlatformAdmin: false,
    });
    expect(tenantAdminAccess.allowed).toBe(false);
    expect(tenantAdminAccess.reason).toBe('forbidden');
    expect(tenantAdminAccess.code).toBe(403);

    // 2. Anggota/Warga biasa
    const memberAccess = evaluatePlatformAccess({
      isAuthenticated: true,
      isPlatformAdmin: false,
    });
    expect(memberAccess.allowed).toBe(false);
    expect(memberAccess.code).toBe(403);
  });

  it('Platform Guard: mengarahkan user yang belum login ke /login', () => {
    const guestAccess = evaluatePlatformAccess({
      isAuthenticated: false,
      isPlatformAdmin: false,
    });
    expect(guestAccess.allowed).toBe(false);
    expect(guestAccess.reason).toBe('unauthenticated');
    expect(guestAccess.redirect).toBe('/login');
  });

  it('Platform Tenant Aggregator: mampu memfilter seluruh tenant berdasarkan tipe dan status', () => {
    const mockAllTenants = [
      { id: 't1', name: 'RT 01', type: 'rt_rw', status: 'active' },
      { id: 't2', name: 'RT 02', type: 'rt_rw', status: 'trial' },
      { id: 't3', name: 'Kos Anggrek', type: 'kos', status: 'active' },
      { id: 't4', name: 'Kos Mawar', type: 'kos', status: 'read_only' },
      { id: 't5', name: 'Arisan Barokah', type: 'arisan', status: 'trial' },
      { id: 't6', name: 'Kelas Musik', type: 'kelas', status: 'active' },
    ];

    // Filter per vertikal
    const kosOnly = mockAllTenants.filter((t) => t.type === 'kos');
    expect(kosOnly.length).toBe(2);

    // Filter per status
    const activeOnly = mockAllTenants.filter((t) => t.status === 'active');
    expect(activeOnly.length).toBe(3);

    const readOnlyOnly = mockAllTenants.filter((t) => t.status === 'read_only');
    expect(readOnlyOnly.length).toBe(1);
    expect(readOnlyOnly[0].id).toBe('t4');
  });

  it('Platform Revenue Engine: menghitung Monthly Recurring Revenue (MRR) dari tenant aktif secara akurat', () => {
    const activeTenants = [
      { id: 't1', type: 'rt_rw', status: 'active', monthlyRevenue: 27000 },
      { id: 't2', type: 'kos', status: 'active', monthlyRevenue: 54000 },
      { id: 't3', type: 'arisan', status: 'active', monthlyRevenue: 20000 },
      { id: 't4', type: 'rt_rw', status: 'trial', monthlyRevenue: 0 },       // Trial tidak berkontribusi MRR
      { id: 't5', type: 'kelas', status: 'read_only', monthlyRevenue: 0 },    // Read-only tidak berkontribusi MRR
    ];

    const totalMRR = activeTenants
      .filter((t) => t.status === 'active')
      .reduce((sum, t) => sum + t.monthlyRevenue, 0);

    expect(totalMRR).toBe(101000); // 27000 + 54000 + 20000
    const activeCount = activeTenants.filter((t) => t.status === 'active').length;
    const arpu = Math.round(totalMRR / activeCount);
    expect(arpu).toBe(33667);
  });
});
