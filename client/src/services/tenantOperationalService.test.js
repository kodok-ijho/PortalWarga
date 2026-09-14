import { describe, it, expect } from 'vitest';
import {
  generateInviteCode,
  calculateBillingPreview,
  generateTenantBillingItems,
  fetchTenantPayments,
  verifyTenantPayment,
  rejectTenantPayment,
  fetchTenantExpenses,
  createTenantExpense,
  updateTenantExpense,
  deleteTenantExpense,
  fetchTenantMonthlyFinance,
  fetchTenantRunningBalance,
  fetchTenantDashboardData,
} from './tenantOperationalService';

describe('tenantOperationalService - Unit Tests', () => {
  describe('generateInviteCode', () => {
    it('menghasilkan kode undangan dengan prefix yang tepat', () => {
      const code1 = generateInviteCode('Palm Village');
      expect(code1).toMatch(/^RW-PALM-[A-Z0-9]{4}$/);

      const code2 = generateInviteCode('Bougenville');
      expect(code2).toMatch(/^RW-BOUG-[A-Z0-9]{4}$/);

      const codeEmpty = generateInviteCode('');
      expect(codeEmpty).toMatch(/^RW-RW-[A-Z0-9]{4}$/);
    });
  });

  describe('calculateBillingPreview (Pure Calculation Engine)', () => {
    const sampleUnits = [
      { id: 1, label: 'Blok A-01', status: 'active' },
      { id: 2, label: 'Blok A-02', status: 'active' },
      { id: 3, label: 'Blok A-03', status: 'inactive' }, // inactive harus di-filter
    ];

    const sampleSettings = {
      ipl_components: [
        { name: 'Keamanan', amount: 90000 },
        { name: 'Kebersihan', amount: 35000 },
        { name: 'Kas RT', amount: 25000 },
      ],
      due_day: 15,
    };

    it('menghitung total nominal tagihan dari penjumlahan seluruh komponen IPL', () => {
      const result = calculateBillingPreview({
        tenantId: 'tenant-test-1',
        period: '2026-10',
        units: sampleUnits,
        settings: sampleSettings,
      });

      // 90.000 + 35.000 + 25.000 = 150.000
      expect(result.totalAmount).toBe(150000);
      expect(result.dueDate).toBe('2026-10-15');
      // Hanya 2 unit aktif (Blok A-01, Blok A-02), unit 3 inactive dilewati
      expect(result.preview.length).toBe(2);
      expect(result.preview[0].amount).toBe(150000);
      expect(result.preview[0].status).toBe('unpaid');
    });

    it('melewati (skip) unit yang sudah memiliki tagihan pada periode yang sama', () => {
      const existing = new Set([1]); // Unit 1 sudah ada tagihan

      const result = calculateBillingPreview({
        tenantId: 'tenant-test-1',
        period: '2026-10',
        units: sampleUnits,
        settings: sampleSettings,
        existingUnitIds: existing,
      });

      // Hanya unit 2 yang siap dibuat
      expect(result.preview.length).toBe(1);
      expect(result.preview[0].unit_id).toBe(2);

      // Unit 1 masuk ke list skipped
      expect(result.skipped.length).toBe(1);
      expect(result.skipped[0].unit_id).toBe(1);
      expect(result.skipped[0].reason).toBe('already_exists');
    });

    it('memasangkan nama warga jika ada di unitMemberMap', () => {
      const memberMap = new Map();
      memberMap.set(2, { id: 'mem-2', full_name: 'Pak Bambang' });

      const result = calculateBillingPreview({
        tenantId: 'tenant-test-1',
        period: '2026-10',
        units: sampleUnits,
        settings: sampleSettings,
        unitMemberMap: memberMap,
      });

      const billUnit2 = result.preview.find((p) => p.unit_id === 2);
      expect(billUnit2.member_id).toBe('mem-2');
      expect(billUnit2.resident_name).toBe('Pak Bambang');

      const billUnit1 = result.preview.find((p) => p.unit_id === 1);
      expect(billUnit1.member_id).toBeNull();
      expect(billUnit1.resident_name).toBe('Belum Terdaftar / Kosong');
    });
  });

  describe('generateTenantBillingItems Validation', () => {
    it('melempar error jika tenantId atau periode tidak disediakan', async () => {
      await expect(generateTenantBillingItems('', { period: '2026-10' })).rejects.toThrow(
        'Tenant ID wajib disertakan.'
      );

      await expect(generateTenantBillingItems('demo-tenant-1', { period: 'invalid-period' })).rejects.toThrow(
        'Format periode harus YYYY-MM.'
      );
    });

    it('menghasilkan dry run preview tagihan untuk seluruh unit aktif di demo mode', async () => {
      const result = await generateTenantBillingItems('demo-tenant-rtrw', {
        period: '2026-10',
        dry_run: true,
      });

      expect(result).toBeDefined();
      expect(result.dry_run).toBe(true);
      expect(result.period).toBe('2026-10');
      expect(result.total_preview).toBeGreaterThan(0);
      expect(result.generated_count).toBe(0); // Dry run tidak menyimpan
      expect(result.preview[0]).toHaveProperty('amount');
      expect(result.preview[0]).toHaveProperty('due_date');
      expect(result.preview[0].due_date).toMatch(/^2026-10-\d{2}$/);
      expect(result.preview[0].metadata).toHaveProperty('components');
    });
  });

  describe('Payment Verification Operations', () => {
    it('melempar error jika tenantId atau paymentId tidak disediakan saat verifikasi/penolakan', async () => {
      await expect(verifyTenantPayment('', 'pay-1')).rejects.toThrow(
        'tenantId dan paymentId wajib disertakan.'
      );
      await expect(verifyTenantPayment('tenant-1', '')).rejects.toThrow(
        'tenantId dan paymentId wajib disertakan.'
      );
      await expect(rejectTenantPayment('', 'pay-1')).rejects.toThrow(
        'tenantId dan paymentId wajib disertakan.'
      );
      await expect(rejectTenantPayment('tenant-1', '')).rejects.toThrow(
        'tenantId dan paymentId wajib disertakan.'
      );
    });

    it('mengembalikan array pembayaran pada mode demo tenant', async () => {
      const payments = await fetchTenantPayments('demo-tenant-rtrw');
      expect(Array.isArray(payments)).toBe(true);
      expect(payments.length).toBeGreaterThan(0);
      expect(payments[0]).toHaveProperty('id');
      expect(payments[0]).toHaveProperty('amount');
      expect(payments[0]).toHaveProperty('status');
    });

    it('berhasil memverifikasi pembayaran pada mode demo tenant', async () => {
      const result = await verifyTenantPayment('demo-tenant-rtrw', 'pay-pending-1', {
        verifiedBy: 'Bendahara Test',
        note: 'Bukti transfer valid',
      });
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.status).toBe('verified');
    });

    it('berhasil menolak pembayaran dengan alasan pada mode demo tenant', async () => {
      const result = await rejectTenantPayment('demo-tenant-rtrw', 'pay-pending-2', {
        rejectedBy: 'Bendahara Test',
        reason: 'Bukti transfer buram dan tidak terbaca',
      });
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.status).toBe('rejected');
    });
  });

  describe('Expenses and Financial Reports Operations', () => {
    it('mengambil daftar pengeluaran kas tenant pada mode demo', async () => {
      const expenses = await fetchTenantExpenses('demo-tenant-rtrw');
      expect(Array.isArray(expenses)).toBe(true);
      expect(expenses.length).toBeGreaterThan(0);
      expect(expenses[0]).toHaveProperty('category');
      expect(expenses[0]).toHaveProperty('amount');
    });

    it('berhasil mencatat pengeluaran baru pada mode demo tenant', async () => {
      const newExpense = await createTenantExpense('demo-tenant-rtrw', {
        date: '2026-10-01',
        category: 'Kebersihan',
        amount: 250000,
        description: 'Beli sapu dan kantong sampah',
      });
      expect(newExpense).toBeDefined();
      expect(newExpense.amount).toBe(250000);
      expect(newExpense.category).toBe('Kebersihan');
    });

    it('menghitung laporan keuangan bulanan dan saldo kas berjalan', async () => {
      const fin = await fetchTenantMonthlyFinance('demo-tenant-rtrw', { year: 2026, month: 10 });
      expect(fin).toBeDefined();
      expect(fin.report).toHaveProperty('total_income');
      expect(fin.report).toHaveProperty('total_expense');
      expect(fin.report).toHaveProperty('net_income');
      expect(Array.isArray(fin.expenses)).toBe(true);

      const bal = await fetchTenantRunningBalance('demo-tenant-rtrw', { year: 2026, month: 10 });
      expect(bal).toBeDefined();
      expect(Array.isArray(bal.chain)).toBe(true);
      expect(bal.chain.length).toBeGreaterThan(0);
      expect(bal.chain[0]).toHaveProperty('closingBalance');
    });

    it('memuat ringkasan data dashboard operasional tenant RT/RW dengan metrik lengkap', async () => {
      const dash = await fetchTenantDashboardData('demo-tenant-rtrw', { role: 'admin', period: '2026-10' });
      expect(dash).toBeDefined();
      expect(dash.period).toBe('2026-10');
      expect(dash.year).toBe(2026);
      expect(dash.month).toBe(10);
      expect(dash.units).toBeDefined();
      expect(dash.units.total).toBeGreaterThan(0);
      expect(dash.members).toBeDefined();
      expect(dash.finance).toBeDefined();
      expect(dash.billing).toBeDefined();
      expect(dash.billing).toHaveProperty('totalBilled');
      expect(dash.billing).toHaveProperty('totalCollected');
      expect(dash.billing).toHaveProperty('collectionRate');
      expect(typeof dash.pendingRegistrationCount).toBe('number');
      expect(typeof dash.pendingPaymentCount).toBe('number');
    });
  });
});

