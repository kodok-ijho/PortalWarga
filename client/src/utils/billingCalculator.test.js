import { describe, it, expect } from 'vitest';
import {
  calculateOptimalBlocks,
  calculateSubscriptionBill,
  DEFAULT_BASE_PRICING,
} from './billingCalculator';

describe('billingCalculator — calculateOptimalBlocks (T4.1)', () => {
  describe('Kasus 1: Kelipatan Pas 10', () => {
    it('harus merekomendasikan tepat 1 blok 10 untuk 10 unit', () => {
      const res = calculateOptimalBlocks(10, 'rt_rw');
      expect(res.recommended.blocks10).toBe(1);
      expect(res.recommended.blocks5).toBe(0);
      expect(res.recommended.totalCapacity).toBe(10);
      expect(res.recommended.monthlyBasePrice).toBe(12500);
      expect(res.recommended.effectiveAnnualMonthly).toBe(10000);
      expect(res.recommended.annualTotal).toBe(120000);
    });

    it('harus merekomendasikan tepat 3 blok 10 untuk 30 unit', () => {
      const res = calculateOptimalBlocks(30, 'rt_rw');
      expect(res.recommended.blocks10).toBe(3);
      expect(res.recommended.blocks5).toBe(0);
      expect(res.recommended.totalCapacity).toBe(30);
      expect(res.recommended.monthlyBasePrice).toBe(37500);
      expect(res.recommended.annualTotal).toBe(30000 * 12);
    });

    it('harus merekomendasikan 10 blok 10 untuk 100 unit', () => {
      const res = calculateOptimalBlocks(100, 'rt_rw');
      expect(res.recommended.blocks10).toBe(10);
      expect(res.recommended.blocks5).toBe(0);
      expect(res.recommended.totalCapacity).toBe(100);
      expect(res.recommended.monthlyBasePrice).toBe(125000);
    });
  });

  describe('Kasus 2: Sisa Kecil (< 5 unit)', () => {
    it('harus merekomendasikan 1 blok 10 + 1 blok 5 untuk 12 unit (lebih hemat dari 2 blok 10)', () => {
      const res = calculateOptimalBlocks(12, 'rt_rw');
      // 1x10 + 1x5 = 15 unit -> Rp 12.500 + Rp 8.750 = Rp 21.250
      // Dibanding 2x10 = 20 unit -> Rp 25.000 (selisih hemat Rp 3.750/bln)
      expect(res.recommended.blocks10).toBe(1);
      expect(res.recommended.blocks5).toBe(1);
      expect(res.recommended.totalCapacity).toBe(15);
      expect(res.recommended.monthlyBasePrice).toBe(21250);
    });

    it('harus merekomendasikan 2 blok 10 + 1 blok 5 untuk 21 unit', () => {
      const res = calculateOptimalBlocks(21, 'rt_rw');
      expect(res.recommended.blocks10).toBe(2);
      expect(res.recommended.blocks5).toBe(1);
      expect(res.recommended.totalCapacity).toBe(25);
      expect(res.recommended.monthlyBasePrice).toBe(25000 + 8750);
    });
  });

  describe('Kasus 3: Sisa Antara 5 s/d 9 unit (Optimalisasi Blok Besar)', () => {
    it('harus merekomendasikan 1 blok 10 untuk 8 unit (lebih hemat dari 2 blok 5)', () => {
      // 1x10 (Rp 12.500) vs 2x5 (Rp 17.500)
      const res = calculateOptimalBlocks(8, 'rt_rw');
      expect(res.recommended.blocks10).toBe(1);
      expect(res.recommended.blocks5).toBe(0);
      expect(res.recommended.totalCapacity).toBe(10);
      expect(res.recommended.monthlyBasePrice).toBe(12500);
    });

    it('harus merekomendasikan 2 blok 10 untuk 18 unit (Rp 25.000 vs 1x10 + 2x5 = Rp 30.000)', () => {
      const res = calculateOptimalBlocks(18, 'rt_rw');
      expect(res.recommended.blocks10).toBe(2);
      expect(res.recommended.blocks5).toBe(0);
      expect(res.recommended.totalCapacity).toBe(20);
      expect(res.recommended.monthlyBasePrice).toBe(25000);
    });

    it('harus merekomendasikan 3 blok 10 untuk 27 unit', () => {
      const res = calculateOptimalBlocks(27, 'rt_rw');
      expect(res.recommended.blocks10).toBe(3);
      expect(res.recommended.blocks5).toBe(0);
      expect(res.recommended.totalCapacity).toBe(30);
      expect(res.recommended.monthlyBasePrice).toBe(37500);
    });
  });

  describe('Kasus 4: Angka Sangat Kecil (<= 5 unit)', () => {
    it('harus merekomendasikan 1 blok 5 untuk 3 unit (Rp 8.750 < Rp 12.500)', () => {
      const res = calculateOptimalBlocks(3, 'rt_rw');
      expect(res.recommended.blocks10).toBe(0);
      expect(res.recommended.blocks5).toBe(1);
      expect(res.recommended.totalCapacity).toBe(5);
      expect(res.recommended.monthlyBasePrice).toBe(8750);
    });

    it('harus merekomendasikan 1 blok 5 untuk 5 unit pas', () => {
      const res = calculateOptimalBlocks(5, 'rt_rw');
      expect(res.recommended.blocks10).toBe(0);
      expect(res.recommended.blocks5).toBe(1);
      expect(res.recommended.totalCapacity).toBe(5);
      expect(res.recommended.monthlyBasePrice).toBe(8750);
    });

    it('harus menangani angka 0 atau negatif dengan batas minimum 1 blok 5', () => {
      const resZero = calculateOptimalBlocks(0, 'rt_rw');
      expect(resZero.recommended.totalCapacity).toBe(5);
      expect(resZero.recommended.blocks5).toBe(1);

      const resNeg = calculateOptimalBlocks(-10, 'rt_rw');
      expect(resNeg.recommended.totalCapacity).toBe(5);
      expect(resNeg.recommended.blocks5).toBe(1);
    });
  });

  describe('Kasus 5: Seluruh Vertikal Bisnis', () => {
    it('harus menghitung tarif Kos dengan benar (Blok 10: 25k, Blok 5: 17.5k)', () => {
      const res = calculateOptimalBlocks(16, 'kos');
      // 16 unit -> 2x10 = 20 kamar (Rp 50.000) vs 1x10 + 2x5 = Rp 60.000
      expect(res.recommended.blocks10).toBe(2);
      expect(res.recommended.blocks5).toBe(0);
      expect(res.recommended.monthlyBasePrice).toBe(50000);
      expect(res.recommended.effectiveAnnualMonthly).toBe(40000); // diskon 20%
    });

    it('harus menghitung tarif Arisan dengan benar', () => {
      const res = calculateOptimalBlocks(15, 'arisan');
      // 15 slot -> 1x10 + 1x5 = 15 slot (Rp 12.500 + Rp 8.750 = Rp 21.250)
      expect(res.recommended.blocks10).toBe(1);
      expect(res.recommended.blocks5).toBe(1);
      expect(res.recommended.totalCapacity).toBe(15);
      expect(res.recommended.monthlyBasePrice).toBe(21250);
    });

    it('harus menghitung tarif Kelas dengan benar (Blok 10: 6.25k, Blok 5: 4.375k)', () => {
      const res = calculateOptimalBlocks(12, 'kelas');
      // 12 siswa -> 1x10 + 1x5 = 15 siswa (Rp 6.250 + Rp 4.375 = Rp 10.625)
      expect(res.recommended.blocks10).toBe(1);
      expect(res.recommended.blocks5).toBe(1);
      expect(res.recommended.totalCapacity).toBe(15);
      expect(res.recommended.monthlyBasePrice).toBe(10625);
      expect(res.recommended.effectiveAnnualMonthly).toBe(8500); // -20%
    });
  });
});

describe('billingCalculator — calculateSubscriptionBill', () => {
  it('harus menghitung paket 12 bulan dengan diskon 20%', () => {
    // 1 blok 10 RT/RW (Rp 12.500 / bln) selama 12 bulan
    const bill = calculateSubscriptionBill(1, 0, 12, 'rt_rw');
    expect(bill.monthlyBasePrice).toBe(12500);
    expect(bill.rawTotal).toBe(150000); // 12.500 * 12
    expect(bill.discountPercent).toBe(20);
    expect(bill.discountAmount).toBe(30000);
    expect(bill.finalTotal).toBe(120000); // Sesuai klarifikasi user: Rp 10.000/bln nett * 12
    expect(bill.effectiveMonthlyPrice).toBe(10000);
  });

  it('harus menghitung paket 6 bulan dengan diskon 10%', () => {
    // 1 blok 10 Kos (Rp 25.000 / bln) selama 6 bulan
    const bill = calculateSubscriptionBill(1, 0, 6, 'kos');
    expect(bill.monthlyBasePrice).toBe(25000);
    expect(bill.rawTotal).toBe(150000); // 25.000 * 6
    expect(bill.discountPercent).toBe(10);
    expect(bill.discountAmount).toBe(15000);
    expect(bill.finalTotal).toBe(135000);
  });

  it('harus menghitung paket 3 bulan dengan diskon 0%', () => {
    const bill = calculateSubscriptionBill(1, 1, 3, 'arisan');
    // 1x10 + 1x5 = Rp 21.250 / bln
    expect(bill.monthlyBasePrice).toBe(21250);
    expect(bill.rawTotal).toBe(63750);
    expect(bill.discountPercent).toBe(0);
    expect(bill.discountAmount).toBe(0);
    expect(bill.finalTotal).toBe(63750);
  });
});
