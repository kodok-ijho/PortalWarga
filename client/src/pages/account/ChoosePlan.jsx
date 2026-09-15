import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AiOutlineCheck,
  AiOutlineArrowLeft,
  AiOutlineThunderbolt,
  AiOutlineCalculator,
  AiOutlineSafetyCertificate,
  AiOutlinePlus,
  AiOutlineMinus,
  AiOutlineArrowRight,
  AiOutlineInfoCircle,
} from 'react-icons/ai';
import { useTenant } from '../../hooks/useTenant';
import { useTenantTemplate } from '../../hooks/useTenantTemplate';
import { useToast } from '../../hooks/useToast';
import {
  calculateOptimalBlocks,
  calculateSubscriptionBill,
  DEFAULT_PERIOD_DISCOUNTS,
} from '../../utils/billingCalculator';

export default function ChoosePlan() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const toast = useToast();
  const { activeTenant, activeTenantId, userTenants, isDemo } = useTenant();
  const template = useTenantTemplate();

  // Ambil tenant yang ditargetkan (bisa dari query param atau activeTenant)
  const targetTenantId = searchParams.get('tenantId') || activeTenantId;
  const currentTenant = userTenants.find((t) => t.id === targetTenantId) || activeTenant;
  const tenantType = currentTenant?.type || 'rt_rw';

  // State input estimasi kapasitas
  const [estimatedUnits, setEstimatedUnits] = useState(15);
  const [isManualOverride, setIsManualOverride] = useState(false);

  // State manual override
  const [customBlocks10, setCustomBlocks10] = useState(1);
  const [customBlocks5, setCustomBlocks5] = useState(1);

  // State durasi langganan (default 12 bulan sesuai rekomendasi hemat 20%)
  const [selectedDuration, setSelectedDuration] = useState(12);

  // Hitung rekomendasi optimal secara otomatis saat estimatedUnits berubah
  const optimalResult = useMemo(() => {
    return calculateOptimalBlocks(estimatedUnits, tenantType);
  }, [estimatedUnits, tenantType]);

  // Sinkronkan rekomendasi ke manual override saat tidak manual
  useEffect(() => {
    if (!isManualOverride && optimalResult?.recommended) {
      setCustomBlocks10(optimalResult.recommended.blocks10);
      setCustomBlocks5(optimalResult.recommended.blocks5);
    }
  }, [optimalResult, isManualOverride]);

  // Hitung tagihan final berdasarkan kombinasi aktif dan durasi
  const activeBlocks10 = isManualOverride ? customBlocks10 : optimalResult.recommended.blocks10;
  const activeBlocks5 = isManualOverride ? customBlocks5 : optimalResult.recommended.blocks5;

  const billSummary = useMemo(() => {
    return calculateSubscriptionBill(activeBlocks10, activeBlocks5, selectedDuration, tenantType);
  }, [activeBlocks10, activeBlocks5, selectedDuration, tenantType]);

  const handleProceedToPayment = () => {
    if (billSummary.totalCapacity < 5) {
      toast.error('Pilih minimal 1 blok kapasitas (minimal 5 unit).');
      return;
    }

    // Arahkan ke halaman konfirmasi pembayaran / QRIS checkout
    navigate(`/account/subscription/checkout`, {
      state: {
        tenantId: currentTenant?.id,
        tenantName: currentTenant?.name,
        tenantType,
        blocks10: activeBlocks10,
        blocks5: activeBlocks5,
        totalCapacity: billSummary.totalCapacity,
        durationMonths: selectedDuration,
        finalTotal: billSummary.finalTotal,
        billSummary,
      },
    });
  };

  return (
    <div className="min-h-screen bg-[#071f13] text-white py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Tombol Kembali */}
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 text-xs font-semibold text-forest-300 hover:text-white transition-colors"
        >
          <AiOutlineArrowLeft /> Kembali
        </button>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-forest-800">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gold-500/10 border border-gold-500/30 text-gold-300 text-xs font-semibold mb-2">
              <AiOutlineThunderbolt />
              <span>Paket Langganan Platform RuangWarga</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white font-display">
              Pilih Kapasitas &amp; Masa Aktif Layanan
            </h1>
            <p className="text-xs sm:text-sm text-forest-300 mt-1">
              Untuk layanan: <strong className="text-white">{currentTenant?.name || 'Komunitas Anda'}</strong> &bull;{' '}
              Tipe: <span className="text-gold-300 font-semibold">{template.name}</span>
            </p>
          </div>
        </div>

        {/* SECTION 1: Kalkulator Estimasi Kebutuhan */}
        <div className="bg-forest-900/80 border border-forest-700/80 rounded-2xl p-6 shadow-xl backdrop-blur-md space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="p-2 rounded-xl bg-forest-950 border border-forest-800 text-gold-400 text-lg">
                <AiOutlineCalculator />
              </span>
              <div>
                <h2 className="text-base font-bold text-white font-display">
                  1. Masukkan Perkiraan Jumlah {template.unitLabel}
                </h2>
                <p className="text-xs text-forest-300">
                  Sistem akan otomatis merekomendasikan kombinasi blok harga paling hemat untuk Anda.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsManualOverride(!isManualOverride)}
              className="text-xs text-gold-400 hover:text-gold-300 font-semibold underline underline-offset-4"
            >
              {isManualOverride ? 'Gunakan Rekomendasi Otomatis' : 'Kustomisasi Manual'}
            </button>
          </div>

          {!isManualOverride ? (
            /* Mode Otomatis dengan Slider / Input */
            <div className="p-5 bg-forest-950/70 border border-forest-800 rounded-xl space-y-4">
              <div className="flex items-center justify-between">
                <label htmlFor="estimated-units-slider" className="text-xs text-forest-300 font-medium">
                  Perkiraan Kebutuhan Kapasitas:
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="estimated-units-slider"
                    type="number"
                    value={estimatedUnits}
                    onChange={(e) => setEstimatedUnits(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-20 px-3 py-1.5 bg-forest-900 border border-gold-500/50 rounded-lg text-sm text-center font-bold text-white focus:outline-none focus:border-gold-500"
                    min="1"
                    max="500"
                  />
                  <span className="text-xs text-forest-300 font-semibold">{template.unitLabel}</span>
                </div>
              </div>

              <input
                type="range"
                min="5"
                max="100"
                step="5"
                value={estimatedUnits}
                onChange={(e) => setEstimatedUnits(parseInt(e.target.value, 10))}
                className="w-full accent-gold-500 h-2 bg-forest-800 rounded-lg cursor-pointer"
              />

              {/* Rekomendasi Banner */}
              <div className="p-4 rounded-xl bg-forest-900 border border-gold-500/40 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="space-y-1">
                  <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold border border-emerald-500/40 uppercase">
                    <AiOutlineCheck /> Rekomendasi Terbaik (Biaya Terendah)
                  </div>
                  <h3 className="text-base font-bold text-white font-display">
                    {optimalResult.recommended.blocks10 > 0 && `${optimalResult.recommended.blocks10} Blok Besar (10)`}
                    {optimalResult.recommended.blocks10 > 0 && optimalResult.recommended.blocks5 > 0 && ' + '}
                    {optimalResult.recommended.blocks5 > 0 && `${optimalResult.recommended.blocks5} Blok Kecil (5)`}
                  </h3>
                  <p className="text-xs text-forest-300">
                    Kapasitas Terpenuhi: <strong className="text-white">{optimalResult.recommended.totalCapacity} {template.unitLabel}</strong>{' '}
                    (Sisa slot cadangan: {optimalResult.recommended.excessCapacity} {template.unitLabel})
                  </p>
                </div>

                <div className="text-left sm:text-right border-t sm:border-t-0 pt-2 sm:pt-0 border-forest-800">
                  <span className="text-[10px] text-forest-400 block uppercase tracking-wider font-medium">
                    Base Price Bulanan
                  </span>
                  <span className="text-lg font-bold text-gold-300 font-mono">
                    Rp {optimalResult.recommended.monthlyBasePrice.toLocaleString('id-ID')}
                    <span className="text-xs font-normal text-forest-400">/bln</span>
                  </span>
                </div>
              </div>
            </div>
          ) : (
            /* Mode Manual Override */
            <div className="p-5 bg-forest-950/70 border border-forest-800 rounded-xl space-y-4">
              <div className="flex items-start gap-2 text-xs text-amber-300">
                <AiOutlineInfoCircle className="text-base shrink-0 mt-0.5" />
                <p>
                  Anda berada dalam mode manual. Sesuaikan jumlah blok kapasitas sesuai kebutuhan spesifik Anda.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Counter Blok 10 */}
                <div className="p-4 bg-forest-900 border border-forest-800 rounded-xl flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-white block">Blok Besar (10 {template.unitLabel})</span>
                    <span className="text-[10px] text-forest-400">Kapasitas 10 unit per blok</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCustomBlocks10(Math.max(0, customBlocks10 - 1))}
                      className="w-8 h-8 rounded-lg bg-forest-800 hover:bg-forest-700 text-white flex items-center justify-center font-bold"
                    >
                      <AiOutlineMinus />
                    </button>
                    <span className="w-8 text-center font-bold font-mono text-sm text-gold-300">
                      {customBlocks10}
                    </span>
                    <button
                      type="button"
                      onClick={() => setCustomBlocks10(customBlocks10 + 1)}
                      className="w-8 h-8 rounded-lg bg-forest-800 hover:bg-forest-700 text-white flex items-center justify-center font-bold"
                    >
                      <AiOutlinePlus />
                    </button>
                  </div>
                </div>

                {/* Counter Blok 5 */}
                <div className="p-4 bg-forest-900 border border-forest-800 rounded-xl flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-white block">Blok Kecil (5 {template.unitLabel})</span>
                    <span className="text-[10px] text-forest-400">Kapasitas 5 unit per blok</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCustomBlocks5(Math.max(0, customBlocks5 - 1))}
                      className="w-8 h-8 rounded-lg bg-forest-800 hover:bg-forest-700 text-white flex items-center justify-center font-bold"
                    >
                      <AiOutlineMinus />
                    </button>
                    <span className="w-8 text-center font-bold font-mono text-sm text-gold-300">
                      {customBlocks5}
                    </span>
                    <button
                      type="button"
                      onClick={() => setCustomBlocks5(customBlocks5 + 1)}
                      className="w-8 h-8 rounded-lg bg-forest-800 hover:bg-forest-700 text-white flex items-center justify-center font-bold"
                    >
                      <AiOutlinePlus />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* SECTION 2: Pilihan Durasi & Diskon Periode */}
        <div className="bg-forest-900/80 border border-forest-700/80 rounded-2xl p-6 shadow-xl backdrop-blur-md space-y-4">
          <div className="flex items-center gap-2.5 mb-2">
            <span className="p-2 rounded-xl bg-forest-950 border border-forest-800 text-gold-400 text-lg">
              ⏳
            </span>
            <div>
              <h2 className="text-base font-bold text-white font-display">
                2. Pilih Durasi Periode Langganan
              </h2>
              <p className="text-xs text-forest-300">
                Pilih komitmen periode untuk mendapatkan potongan harga spesial.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                months: 12,
                label: '1 Tahun (12 Bulan)',
                badge: 'Hemat 20%',
                badgeStyle: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
                desc: 'Paling hemat & direkomendasikan untuk komunitas',
              },
              {
                months: 6,
                label: '6 Bulan',
                badge: 'Hemat 10%',
                badgeStyle: 'bg-gold-500/20 text-gold-300 border-gold-500/40',
                desc: 'Pilihan fleksibel setengah tahunan',
              },
              {
                months: 3,
                label: '3 Bulan',
                badge: 'Reguler',
                badgeStyle: 'bg-forest-800 text-forest-300 border-forest-700',
                desc: 'Paket dasar komitmen 3 bulanan',
              },
            ].map((plan) => {
              const isSelected = selectedDuration === plan.months;

              return (
                <button
                  key={plan.months}
                  type="button"
                  onClick={() => setSelectedDuration(plan.months)}
                  className={`rounded-2xl p-5 border-2 text-left transition-all flex flex-col justify-between ${
                    isSelected
                      ? 'bg-forest-800 border-gold-400 shadow-xl shadow-gold-900/20 scale-[1.02]'
                      : 'bg-forest-950/60 border-forest-800 hover:border-forest-600'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-bold text-white font-display">{plan.label}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase ${plan.badgeStyle}`}>
                        {plan.badge}
                      </span>
                    </div>
                    <p className="text-xs text-forest-400 mb-4">{plan.desc}</p>
                  </div>

                  <div className="pt-3 border-t border-forest-800 flex items-center justify-between text-xs">
                    <span className="text-forest-400">Diskon:</span>
                    <span className="font-bold text-gold-400 font-mono">
                      {DEFAULT_PERIOD_DISCOUNTS[plan.months]}%
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* SECTION 3: Ringkasan Tagihan & Aksi Checkout */}
        <div className="bg-gradient-to-br from-forest-900 to-forest-950 border border-gold-500/40 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6">
          <div className="flex items-center justify-between border-b border-forest-800 pb-4">
            <h2 className="text-lg font-bold text-white font-display flex items-center gap-2">
              <AiOutlineSafetyCertificate className="text-gold-400" />
              <span>Rincian Tagihan Langganan</span>
            </h2>
            <span className="text-xs text-forest-400 font-mono">Periode: {selectedDuration} Bulan</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-xs">
            <div className="space-y-3">
              <div className="flex justify-between text-forest-300">
                <span>Kapasitas Unit Didapat:</span>
                <strong className="text-white">{billSummary.totalCapacity} {template.unitLabel}</strong>
              </div>
              <div className="flex justify-between text-forest-300">
                <span>Rincian Blok:</span>
                <span className="text-forest-200">
                  {billSummary.blocks10} Blok 10 + {billSummary.blocks5} Blok 5
                </span>
              </div>
              <div className="flex justify-between text-forest-300">
                <span>Tarif Dasar Bulanan:</span>
                <span className="font-mono text-white">Rp {billSummary.monthlyBasePrice.toLocaleString('id-ID')} / bln</span>
              </div>
            </div>

            <div className="space-y-3 border-t sm:border-t-0 sm:border-l border-forest-800 pt-3 sm:pt-0 sm:pl-6">
              <div className="flex justify-between text-forest-300">
                <span>Subtotal ({selectedDuration} Bulan):</span>
                <span className="font-mono text-white">Rp {billSummary.rawTotal.toLocaleString('id-ID')}</span>
              </div>
              <div className="flex justify-between text-emerald-400">
                <span>Potongan Diskon ({billSummary.discountPercent}%):</span>
                <span className="font-mono">- Rp {billSummary.discountAmount.toLocaleString('id-ID')}</span>
              </div>
              <div className="flex justify-between items-baseline pt-2 border-t border-forest-800">
                <span className="font-bold text-white text-sm">Total Pembayaran:</span>
                <span className="text-2xl font-extrabold text-gold-300 font-mono">
                  Rp {billSummary.finalTotal.toLocaleString('id-ID')}
                </span>
              </div>
              <p className="text-[11px] text-right text-forest-400">
                (Setara <strong className="text-emerald-300 font-mono">Rp {billSummary.effectiveMonthlyPrice.toLocaleString('id-ID')}/bln</strong> nett)
              </p>
            </div>
          </div>

          <div className="pt-4 border-t border-forest-800 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-forest-400 text-center sm:text-left">
              Pembayaran instan diproses via <strong className="text-white">Mayar QRIS</strong> dengan verifikasi otomatis.
            </p>

            <button
              type="button"
              onClick={handleProceedToPayment}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl bg-gradient-to-r from-gold-500 to-amber-500 hover:from-gold-400 hover:to-amber-400 text-forest-950 font-extrabold text-sm shadow-xl shadow-gold-900/30 transition-all hover:scale-105"
            >
              <span>Lanjut ke Pembayaran QRIS</span>
              <AiOutlineArrowRight />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
