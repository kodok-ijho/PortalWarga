import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AiOutlineCheckCircle,
  AiOutlineClockCircle,
  AiOutlineWarning,
  AiOutlineReload,
  AiOutlineCreditCard,
  AiOutlineArrowRight,
  AiOutlinePieChart,
  AiOutlineFileText,
  AiOutlineArrowLeft,
} from 'react-icons/ai';
import { supabase } from '../../services/supabaseClient';
import { useTenant } from '../../hooks/useTenant';
import { useTenantTemplate } from '../../hooks/useTenantTemplate';

export default function SubscriptionStatus() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { activeTenant, activeTenantId, userTenants, isDemo, isTenantAdmin } = useTenant();
  const template = useTenantTemplate();

  const targetTenantId = searchParams.get('tenantId') || activeTenantId;
  const currentTenant = userTenants.find((t) => t.id === targetTenantId) || activeTenant;

  const [loading, setLoading] = useState(true);
  const [subData, setSubData] = useState(null);
  const [blocksData, setBlocksData] = useState([]);
  const [paymentsHistory, setPaymentsHistory] = useState([]);
  const [usedUnitsCount, setUsedUnitsCount] = useState(0);

  const fetchSubscriptionDetails = async () => {
    setLoading(true);

    if (isDemo) {
      // Mock data untuk mode demo
      setSubData({
        status: currentTenant?.subscription?.status || 'active',
        trial_ends_at: currentTenant?.subscription?.trial_ends_at || null,
        current_period_start: '2026-01-01T00:00:00Z',
        current_period_end: '2026-12-31T23:59:59Z',
        period_duration: 12,
      });
      setBlocksData([
        { block_count: 2, block_size: 10, price_per_block: 12500 },
        { block_count: 1, block_size: 5, price_per_block: 8750 },
      ]);
      setUsedUnitsCount(18);
      setPaymentsHistory([
        {
          id: 'pay-demo-881',
          created_at: '2026-01-01T09:30:00Z',
          paid_at: '2026-01-01T09:32:10Z',
          amount: 324000,
          status: 'settled',
          payment_method: 'mayar_qris',
          payment_gateway_ref: 'MYR-DEMO-SUB-01',
          duration_months: 12,
        },
      ]);
      setLoading(false);
      return;
    }

    try {
      if (!currentTenant?.id) return;

      // 1. Ambil data subscription & blocks
      const { data: sub, error: sErr } = await supabase
        .from('tenant_subscriptions')
        .select(`
          id,
          status,
          trial_started_at,
          trial_ends_at,
          current_period_start,
          current_period_end,
          subscription_periods (
            duration_months,
            discount_percent
          ),
          tenant_subscription_blocks (
            block_count,
            block_pricing (
              block_size,
              price_per_block
            )
          )
        `)
        .eq('tenant_id', currentTenant.id)
        .single();

      if (sErr) throw sErr;

      setSubData({
        id: sub.id,
        status: sub.status,
        trial_ends_at: sub.trial_ends_at,
        current_period_start: sub.current_period_start,
        current_period_end: sub.current_period_end,
        period_duration: sub.subscription_periods?.duration_months || 12,
      });

      const parsedBlocks = (sub.tenant_subscription_blocks || []).map((b) => ({
        block_count: b.block_count,
        block_size: b.block_pricing?.block_size || 10,
        price_per_block: b.block_pricing?.price_per_block || 0,
      }));
      setBlocksData(parsedBlocks);

      // 2. Ambil total unit terpakai di tenant_units
      const { count: unitCount } = await supabase
        .from('tenant_units')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', currentTenant.id);

      setUsedUnitsCount(unitCount || 0);

      // 3. Ambil riwayat pembayaran
      const { data: payList } = await supabase
        .from('subscription_payments')
        .select(`
          id,
          created_at,
          paid_at,
          amount,
          status,
          payment_method,
          payment_gateway_ref,
          subscription_periods (
            duration_months
          )
        `)
        .eq('subscription_id', sub.id)
        .order('created_at', { ascending: false });

      const formattedPayments = (payList || []).map((p) => ({
        id: p.id,
        created_at: p.created_at,
        paid_at: p.paid_at,
        amount: Number(p.amount || 0),
        status: p.status,
        payment_method: p.payment_method,
        payment_gateway_ref: p.payment_gateway_ref,
        duration_months: p.subscription_periods?.duration_months || 12,
      }));

      setPaymentsHistory(formattedPayments);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[SubscriptionStatus] Gagal memuat data langganan:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubscriptionDetails();
  }, [currentTenant?.id]);

  // Hitung total kapasitas yang dibeli
  const totalPurchasedCapacity = blocksData.reduce(
    (acc, b) => acc + (b.block_count * b.block_size),
    0
  ) || 10; // Default minimal trial 10 unit

  const usagePercent = Math.min(100, Math.round((usedUnitsCount / totalPurchasedCapacity) * 100));

  const status = subData?.status || 'trial';

  return (
    <div className="min-h-screen bg-[#071f13] text-white py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Tombol Navigasi Kembali */}
        <button
          type="button"
          onClick={() => navigate('/account/tenants')}
          className="inline-flex items-center gap-2 text-xs font-semibold text-forest-300 hover:text-white transition-colors"
        >
          <AiOutlineArrowLeft /> Kembali ke Daftar Layanan
        </button>

        {/* Header Title */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-forest-800">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-2xl p-2 bg-forest-950 rounded-xl border border-forest-800 shadow-inner">
                {template.icon}
              </span>
              <div>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-white font-display">
                  Status Langganan &amp; Kapasitas
                </h1>
                <p className="text-xs sm:text-sm text-forest-300">
                  Layanan: <strong className="text-white">{currentTenant?.name}</strong> &bull; Tipe: {template.name}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={fetchSubscriptionDetails}
              disabled={loading}
              className="px-3.5 py-2 rounded-xl bg-forest-800 hover:bg-forest-700 text-forest-200 hover:text-white text-xs font-semibold border border-forest-700 transition-colors"
            >
              <AiOutlineReload className={loading ? 'animate-spin' : ''} />
            </button>

            {isTenantAdmin && (
              <button
                type="button"
                onClick={() => navigate(`/account/choose-plan?tenantId=${currentTenant?.id}`)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-gold-500 to-amber-500 hover:from-gold-400 hover:to-amber-400 text-forest-950 font-bold text-xs shadow-lg shadow-gold-900/30 transition-all hover:scale-105"
              >
                <AiOutlineCreditCard className="text-sm font-bold" />
                <span>Perpanjang / Ubah Paket</span>
              </button>
            )}
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 rounded-full border-2 border-forest-600 border-t-gold-500 animate-spin" />
          </div>
        )}

        {!loading && (
          <div className="space-y-6">
            {/* GRID KARTU STATUS & KAPASITAS */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Kartu Status Langganan */}
              <div className="bg-forest-900/70 border border-forest-800 rounded-2xl p-6 shadow-xl space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-forest-400 uppercase tracking-wider">
                    Status Paket Aktif
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 text-[11px] font-bold px-3 py-1 rounded-md border uppercase ${
                      status === 'active'
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                        : status === 'trial'
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                        : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                    }`}
                  >
                    {status === 'active' ? <AiOutlineCheckCircle /> : <AiOutlineClockCircle />}
                    <span>{status === 'trial' ? 'Trial 15 Hari' : status}</span>
                  </span>
                </div>

                <div className="pt-2">
                  <p className="text-xs text-forest-300">
                    {status === 'active'
                      ? 'Paket berlangganan Anda sedang aktif dengan kapasitas penuh.'
                      : status === 'trial'
                      ? 'Layanan sedang berada pada masa uji coba gratis selama 15 hari.'
                      : 'Masa aktif langganan telah berakhir. Fitur transaksi dibatasi (Read-Only).'}
                  </p>
                </div>

                <div className="p-4 bg-forest-950/80 rounded-xl border border-forest-800 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-forest-400">Masa Berlaku Hingga:</span>
                    <strong className="text-white font-mono">
                      {status === 'active' && subData?.current_period_end
                        ? new Date(subData.current_period_end).toLocaleDateString('id-ID', {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                          })
                        : subData?.trial_ends_at
                        ? new Date(subData.trial_ends_at).toLocaleDateString('id-ID', {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                          })
                        : '-'}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Kartu Kapasitas Unit Terpakai vs Dibeli */}
              <div className="bg-forest-900/70 border border-forest-800 rounded-2xl p-6 shadow-xl space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-forest-400 uppercase tracking-wider flex items-center gap-1.5">
                    <AiOutlinePieChart className="text-gold-400" />
                    <span>Kapasitas {template.unitLabel}</span>
                  </span>
                  <span className="text-xs font-bold text-gold-300">
                    {usedUnitsCount} / {totalPurchasedCapacity} Terpakai
                  </span>
                </div>

                {/* Progress Bar */}
                <div className="space-y-1.5">
                  <div className="w-full bg-forest-950 h-3 rounded-full overflow-hidden border border-forest-800">
                    <div
                      className={`h-full transition-all duration-500 ${
                        usagePercent >= 90
                          ? 'bg-rose-500'
                          : usagePercent >= 75
                          ? 'bg-amber-500'
                          : 'bg-gradient-to-r from-emerald-500 to-gold-500'
                      }`}
                      style={{ width: `${usagePercent}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[11px] text-forest-400">
                    <span>{usagePercent}% Utilisasi</span>
                    <span>Sisa Kuota: {Math.max(0, totalPurchasedCapacity - usedUnitsCount)} {template.unitLabel}</span>
                  </div>
                </div>

                <div className="p-3 bg-forest-950/80 rounded-xl border border-forest-800 flex items-center justify-between text-xs">
                  <div>
                    <span className="text-forest-400 block text-[10px]">Rincian Blok:</span>
                    <span className="text-forest-200 font-medium">
                      {blocksData.length > 0
                        ? blocksData.map((b) => `${b.block_count}x Blok ${b.block_size}`).join(' + ')
                        : '1x Blok 10 (Trial Default)'}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => navigate(`/account/choose-plan?tenantId=${currentTenant?.id}`)}
                    className="text-gold-400 hover:text-gold-300 font-semibold underline text-xs"
                  >
                    Tambah Kuota
                  </button>
                </div>
              </div>
            </div>

            {/* TABEL RIWAYAT TRANSAKSI SUBSCRIPTION */}
            <div className="space-y-3 pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-white font-display">Riwayat Pembayaran Langganan</h2>
                  <p className="text-xs text-forest-400">Daftar transaksi perpanjangan paket platform untuk layanan ini</p>
                </div>
              </div>

              <div className="bg-forest-900/60 border border-forest-800 rounded-2xl overflow-hidden shadow-xl">
                {paymentsHistory.length === 0 ? (
                  <div className="py-12 text-center text-forest-400">
                    <AiOutlineFileText className="text-3xl mx-auto mb-2 text-forest-600" />
                    <p className="text-xs font-medium text-forest-300">Belum ada riwayat pembayaran langganan</p>
                    <p className="text-[11px] text-forest-500 mt-0.5">
                      Layanan Anda saat ini masih aktif menggunakan paket masa percobaan (trial).
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-forest-950/80 border-b border-forest-800 text-forest-400 uppercase tracking-wider font-semibold">
                          <th className="py-3 px-4">No. Referensi / Tanggal</th>
                          <th className="py-3 px-4">Durasi Paket</th>
                          <th className="py-3 px-4">Metode Bayar</th>
                          <th className="py-3 px-4">Nominal</th>
                          <th className="py-3 px-4 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-forest-800/60">
                        {paymentsHistory.map((p) => (
                          <tr key={p.id} className="hover:bg-forest-800/30">
                            <td className="py-3 px-4">
                              <span className="font-mono font-bold text-white block">{p.payment_gateway_ref || p.id}</span>
                              <span className="text-[10px] text-forest-400">
                                {p.paid_at || p.created_at
                                  ? new Date(p.paid_at || p.created_at).toLocaleDateString('id-ID', {
                                      day: 'numeric',
                                      month: 'short',
                                      year: 'numeric',
                                    })
                                  : '-'}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-forest-200">{p.duration_months} Bulan</td>
                            <td className="py-3 px-4 uppercase font-mono text-[11px] text-forest-300">
                              {p.payment_method}
                            </td>
                            <td className="py-3 px-4 font-mono font-bold text-gold-300">
                              Rp {p.amount.toLocaleString('id-ID')}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <span
                                className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                  p.status === 'settled'
                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                }`}
                              >
                                {p.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
