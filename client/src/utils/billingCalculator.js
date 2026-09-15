/**
 * billingCalculator.js — Kalkulator optimalisasi blok kapasitas dan harga langganan RuangWarga.
 * Ref: requirement.md FR-7 s/d FR-14, specification.md §2, §8, task.md T4.1
 */

export const DEFAULT_BASE_PRICING = {
  rt_rw: {
    price10: 12500, // Rp 10.000/bln nett saat paket tahunan (-20%)
    price5: 8750,   // Rp 7.000/bln nett saat paket tahunan (-20%)
  },
  kos: {
    price10: 25000, // Rp 20.000/bln nett saat paket tahunan (-20%)
    price5: 17500,  // Rp 14.000/bln nett saat paket tahunan (-20%)
  },
  arisan: {
    price10: 12500, // Rp 10.000/bln nett saat paket tahunan (-20%)
    price5: 8750,   // Rp 7.000/bln nett saat paket tahunan (-20%)
  },
  kelas: {
    price10: 6250,  // Rp 5.000/bln nett saat paket tahunan (-20%)
    price5: 4375,   // Rp 3.500/bln nett saat paket tahunan (-20%)
  },
};

export const DEFAULT_PERIOD_DISCOUNTS = {
  3: 0,   // 3 bulan: diskon 0%
  6: 10,  // 6 bulan: diskon 10%
  12: 20, // 12 bulan: diskon 20%
};

/**
 * Menghitung kombinasi blok kapasitas yang paling optimal (biaya terendah)
 * untuk menampung estimasi unit yang diinginkan user.
 *
 * @param {number|string} estimasiUnit - Jumlah unit/kamar/slot/siswa yang dibutuhkan
 * @param {string} tenantType - 'rt_rw' | 'kos' | 'arisan' | 'kelas'
 * @param {object} [options]
 * @param {object} [options.customPricing] - Override { price10, price5 }
 * @param {number} [options.annualDiscountPercent=20] - Persentase diskon paket tahunan
 * @param {number} [options.minUnits=5] - Kapasitas minimum yang bisa dibeli
 * @returns {object} Rekomendasi kombinasi optimal & rincian biaya
 */
export function calculateOptimalBlocks(estimasiUnit, tenantType = 'rt_rw', options = {}) {
  const normalizedType = DEFAULT_BASE_PRICING[tenantType] ? tenantType : 'rt_rw';
  const pricing = options.customPricing || DEFAULT_BASE_PRICING[normalizedType];
  const annualDiscountPercent = options.annualDiscountPercent ?? 20;
  const minUnits = options.minUnits ?? 5;

  const rawNum = Math.ceil(Number(estimasiUnit) || 0);
  const neededUnits = Math.max(minUnits, rawNum);

  const price10 = Number(pricing.price10);
  const price5 = Number(pricing.price5);

  const maxBlocks10 = Math.ceil(neededUnits / 10);
  const candidates = [];

  for (let b10 = 0; b10 <= maxBlocks10; b10++) {
    const coveredBy10 = b10 * 10;
    const remaining = Math.max(0, neededUnits - coveredBy10);
    const b5 = Math.ceil(remaining / 5);

    const totalCapacity = (b10 * 10) + (b5 * 5);
    const totalCost = (b10 * price10) + (b5 * price5);

    candidates.push({
      blocks10: b10,
      blocks5: b5,
      totalCapacity,
      excessCapacity: totalCapacity - neededUnits,
      monthlyBasePrice: totalCost,
    });
  }

  // Alternatif khusus: Semua blok besar dibulatkan ke atas
  const allBlocks10Count = Math.ceil(neededUnits / 10);
  const all10Capacity = allBlocks10Count * 10;
  const all10Cost = allBlocks10Count * price10;
  if (!candidates.some((c) => c.blocks10 === allBlocks10Count && c.blocks5 === 0)) {
    candidates.push({
      blocks10: allBlocks10Count,
      blocks5: 0,
      totalCapacity: all10Capacity,
      excessCapacity: all10Capacity - neededUnits,
      monthlyBasePrice: all10Cost,
    });
  }

  // Alternatif khusus: Semua blok kecil
  const allBlocks5Count = Math.ceil(neededUnits / 5);
  const all5Capacity = allBlocks5Count * 5;
  const all5Cost = allBlocks5Count * price5;
  if (!candidates.some((c) => c.blocks10 === 0 && c.blocks5 === allBlocks5Count)) {
    candidates.push({
      blocks10: 0,
      blocks5: allBlocks5Count,
      totalCapacity: all5Capacity,
      excessCapacity: all5Capacity - neededUnits,
      monthlyBasePrice: all5Cost,
    });
  }

  // Urutkan kandidat:
  // 1. Biaya bulanan terendah
  // 2. Selisih kapasitas terkecil (paling efisien)
  candidates.sort((a, b) => {
    if (a.monthlyBasePrice !== b.monthlyBasePrice) {
      return a.monthlyBasePrice - b.monthlyBasePrice;
    }
    return a.excessCapacity - b.excessCapacity;
  });

  const best = candidates[0];

  const calculateBreakdown = (item) => {
    const effectiveAnnualMonthly = Math.round(item.monthlyBasePrice * (1 - annualDiscountPercent / 100));
    const annualTotal = effectiveAnnualMonthly * 12;

    return {
      blocks10: item.blocks10,
      blocks5: item.blocks5,
      totalCapacity: item.totalCapacity,
      excessCapacity: item.excessCapacity,
      monthlyBasePrice: item.monthlyBasePrice,
      effectiveAnnualMonthly,
      annualTotal,
    };
  };

  const recommended = calculateBreakdown(best);

  // Buat list alternatif unik selain yang recommended
  const seenCombos = new Set([`${best.blocks10}-${best.blocks5}`]);
  const alternatives = [];

  for (const c of candidates) {
    const key = `${c.blocks10}-${c.blocks5}`;
    if (!seenCombos.has(key)) {
      seenCombos.add(key);
      alternatives.push(calculateBreakdown(c));
    }
  }

  return {
    estimatedUnits: rawNum,
    neededUnits,
    tenantType: normalizedType,
    pricingUsed: {
      price10,
      price5,
    },
    annualDiscountPercent,
    recommended,
    alternatives,
  };
}

/**
 * Menghitung total biaya berdasarkan kombinasi blok dan durasi periode yang dipilih.
 *
 * @param {number} blocks10 - Jumlah blok 10 unit
 * @param {number} blocks5 - Jumlah blok 5 unit
 * @param {number} durationMonths - 3 | 6 | 12
 * @param {string} tenantType - 'rt_rw' | 'kos' | 'arisan' | 'kelas'
 * @param {object} [options]
 * @param {object} [options.customPricing]
 * @param {object} [options.customDiscounts]
 * @returns {object} Rincian total tagihan
 */
export function calculateSubscriptionBill(
  blocks10 = 0,
  blocks5 = 0,
  durationMonths = 12,
  tenantType = 'rt_rw',
  options = {}
) {
  const normalizedType = DEFAULT_BASE_PRICING[tenantType] ? tenantType : 'rt_rw';
  const pricing = options.customPricing || DEFAULT_BASE_PRICING[normalizedType];
  const discounts = options.customDiscounts || DEFAULT_PERIOD_DISCOUNTS;

  const b10 = Math.max(0, parseInt(blocks10, 10) || 0);
  const b5 = Math.max(0, parseInt(blocks5, 10) || 0);
  const duration = [3, 6, 12].includes(Number(durationMonths)) ? Number(durationMonths) : 12;

  const price10 = Number(pricing.price10);
  const price5 = Number(pricing.price5);
  const discountPercent = discounts[duration] ?? 0;

  const totalCapacity = (b10 * 10) + (b5 * 5);
  const monthlyBasePrice = (b10 * price10) + (b5 * price5);
  const rawTotal = monthlyBasePrice * duration;
  const discountAmount = Math.round(rawTotal * (discountPercent / 100));
  const finalTotal = rawTotal - discountAmount;
  const effectiveMonthlyPrice = duration > 0 ? Math.round(finalTotal / duration) : 0;

  return {
    blocks10: b10,
    blocks5: b5,
    totalCapacity,
    durationMonths: duration,
    discountPercent,
    monthlyBasePrice,
    rawTotal,
    discountAmount,
    finalTotal,
    effectiveMonthlyPrice,
  };
}
