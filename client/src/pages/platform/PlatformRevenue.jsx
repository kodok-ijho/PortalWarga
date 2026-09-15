import { useState, useEffect, useMemo } from 'react';
import {
  AiOutlineDollarCircle,
  AiOutlineRise,
  AiOutlineTeam,
  AiOutlineCheckCircle,
  AiOutlineReload,
  AiOutlineClockCircle,
  AiOutlineInfoCircle,
  AiOutlineFileText,
} from 'react-icons/ai';
import { supabase } from '../../services/supabaseClient';
import { useTenant } from '../../hooks/useTenant';
import { getTenantTemplate } from '../../config/tenantTemplates';

const MOCK_REVENUE_TRANSACTIONS = [
  {
    id: 'pay-demo-001',
    created_at: '2026-09-10T11:20:00Z',
    paid_at: '2026-09-10T11:22:15Z',
    amount: 120000,
    status: 'settled',
    payment_method: 'mayar_qris',
    payment_gateway_ref: 'MYR-RW-20260910-8812',
    tenant_name: 'Palm Village RT 05',
    tenant_type: 'rt_rw',
    period_months: 12,
  },
  {
    id: 'pay-demo-002',
    created_at: '2026-09-12T14:05:00Z',
    paid_at: '2026-09-12T14:08:30Z',
    amount: 45000,
    status: 'settled',
    payment_method: 'mayar_qris',
    payment_gateway_ref: 'MYR-RW-20260912-9104',
    tenant_name: 'Kos Melati Harmoni',
    tenant_type: 'kos',
    period_months: 3,
  },
];

export default function PlatformRevenue() {
  const { isDemo } = useTenant();

  const [tenants, setTenants] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);

    if (isDemo) {
      setTenants([
        { id: '1', name: 'Palm Village RT 05', type: 'rt_rw', status: 'active', monthlyRevenue: 10000 },
        { id: '2', name: 'Kos Melati Harmoni', type: 'kos', status: 'trial', monthlyRevenue: 0 },
        { id: '3', name: 'Arisan Mawar Berkah', type: 'arisan', status: 'trial', monthlyRevenue: 0 },
        { id: '4', name: 'Kelas Belajar Mandiri', type: 'kelas', status: 'read_only', monthlyRevenue: 0 },
      ]);
      setPayments(MOCK_REVENUE_TRANSACTIONS);
      setLoading(false);
      return;
    }

    try {
      // 1. Fetch tenants & subscription
      const { data: tenantData, error: tErr } = await supabase
        .from('tenants')
        .select(`
          id,
          name,
          type,
          tenant_subscriptions (
            status,
            tenant_subscription_blocks (
              block_count,
              block_pricing (
                price_per_block
              )
            )
          )
        `);

      if (tErr) throw tErr;

      const formattedTenants = (tenantData || []).map((t) => {
        const sub = Array.isArray(t.tenant_subscriptions)
          ? t.tenant_subscriptions[0]
          : t.tenant_subscriptions;
        const status = sub?.status || 'trial';

        // Hitung estimasi monthly revenue dari blocks yang dimiliki
        let monthly = 0;
        if (status === 'active' && sub?.tenant_subscription_blocks) {
          const blocks = Array.isArray(sub.tenant_subscription_blocks)
            ? sub.tenant_subscription_blocks
            : [sub.tenant_subscription_blocks];
          blocks.forEach((b) => {
            const price = Number(b.block_pricing?.price_per_block || 0);
            const count = Number(b.block_count || 1);
            monthly += price * count;
          });
        }

        return {
          id: t.id,
          name: t.name,
          type: t.type,
          status,
          monthlyRevenue: monthly,
        };
      });

      // 2. Fetch payments (bisa kosong sebelum Phase 4)
      const { data: paymentData, error: pErr } = await supabase
        .from('subscription_payments')
        .select(`
          id,
          created_at,
          paid_at,
          amount,
          status,
          payment_method,
          payment_gateway_ref,
          tenant_subscriptions (
            tenants (
              name,
              type
            )
          ),
          subscription_periods (
            duration_months
          )
        `)
        .order('created_at', { ascending: false });

      if (pErr) throw pErr;

      const formattedPayments = (paymentData || []).map((p) => ({
        id: p.id,
        created_at: p.created_at,
        paid_at: p.paid_at,
        amount: Number(p.amount || 0),
        status: p.status,
        payment_method: p.payment_method,
        payment_gateway_ref: p.payment_gateway_ref,
        tenant_name: p.tenant_subscriptions?.tenants?.name || 'Tenant',
        tenant_type: p.tenant_subscriptions?.tenants?.type || 'rt_rw',
        period_months: p.subscription_periods?.duration_months || 1,
      }));

      setTenants(formattedTenants);
      setPayments(formattedPayments);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[PlatformRevenue] Error loading revenue data:', err);
      setError(err.message || 'Gagal memuat metrik pendapatan.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Metrik Finansial
  const metrics = useMemo(() => {
    const totalTenants = tenants.length;
    const activeTenants = tenants.filter((t) => t.status === 'active');
    const trialTenants = tenants.filter((t) => t.status === 'trial');
    const readOnlyTenants = tenants.filter((t) => t.status === 'read_only');

    // Total MRR dari active paying tenants
    const mrr = activeTenants.reduce((acc, curr) => acc + (curr.monthlyRevenue || 0), 0);
    const arr = mrr * 12;
    const arpu = activeTenants.length > 0 ? Math.round(mrr / activeTenants.length) : 0;

    // Total pembayaran settled
    const totalPaidRevenue = payments
      .filter((p) => p.status === 'settled')
      .reduce((acc, curr) => acc + curr.amount, 0);

    // Breakdown revenue per vertikal
    const verticalBreakdown = {
      rt_rw: { count: 0, activeCount: 0, mrr: 0 },
      kos: { count: 0, activeCount: 0, mrr: 0 },
      arisan: { count: 0, activeCount: 0, mrr: 0 },
      kelas: { count: 0, activeCount: 0, mrr: 0 },
    };

    tenants.forEach((t) => {
      if (verticalBreakdown[t.type]) {
        verticalBreakdown[t.type].count += 1;
        if (t.status === 'active') {
          verticalBreakdown[t.type].activeCount += 1;
          verticalBreakdown[t.type].mrr += t.monthlyRevenue || 0;
        }
      }
    });

    return {
      totalTenants,
      activeCount: activeTenants.length,
      trialCount: trialTenants.length,
      readOnlyCount: readOnlyTenants.length,
      mrr,
      arr,
      arpu,
      totalPaidRevenue,
      verticalBreakdown,
    };
  }, [tenants, payments]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-forest-800">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl">📈</span>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white font-display">
              Metrik Pendapatan Platform (MRR)
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-forest-300">
            Analisis Monthly Recurring Revenue (MRR), ARR, konversi pelanggan, dan riwayat pembayaran subscription (FR-0.2, FR-14).
          </p>
        </div>

        <button
          type="button"
          onClick={fetchData}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-forest-800 hover:bg-forest-700 text-forest-200 hover:text-white text-xs font-semibold border border-forest-700 transition-colors self-start sm:self-auto"
        >
          <AiOutlineReload className={loading ? 'animate-spin' : ''} />
          <span>Segarkan Metrik</span>
        </button>
      </div>

      {/* Info Notice Phase 3 */}
      <div className="p-4 rounded-2xl bg-forest-950/70 border border-forest-800 flex items-start gap-3 text-xs text-forest-300 leading-relaxed">
        <AiOutlineInfoCircle className="text-lg text-amber-400 shrink-0 mt-0.5" />
        <div>
          <strong className="text-white">Fase Fondasi Platform:</strong> Data pendapatan di bawah mencerminkan estimasi
          dari tenant aktif saat ini. Pada <strong className="text-gold-300">Phase 4 (Subscription &amp; Billing)</strong>,
          setelah integrasi payment gateway Mayar QRIS dan auto-provisioning pembayaran selesai dibangun, transaksi real-time
          akan langsung tercatat di tabel pembayaran platform.
        </div>
      </div>

      {/* KPI Cards Finansial */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* MRR */}
        <div className="bg-forest-900/70 border border-forest-800 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-forest-400">Total MRR</span>
            <span className="p-2 rounded-xl bg-gold-500/10 text-gold-400 border border-gold-500/20">
              <AiOutlineRise className="text-base" />
            </span>
          </div>
          <p className="text-2xl sm:text-3xl font-extrabold text-gold-300 font-display mt-3">
            Rp {metrics.mrr.toLocaleString('id-ID')}
          </p>
          <span className="text-[10px] text-forest-400 mt-1 block">Monthly Recurring Revenue saat ini</span>
        </div>

        {/* ARR */}
        <div className="bg-forest-900/70 border border-forest-800 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-forest-400">Estimasi ARR</span>
            <span className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <AiOutlineDollarCircle className="text-base" />
            </span>
          </div>
          <p className="text-2xl sm:text-3xl font-extrabold text-emerald-300 font-display mt-3">
            Rp {metrics.arr.toLocaleString('id-ID')}
          </p>
          <span className="text-[10px] text-forest-400 mt-1 block">Annual Run Rate (MRR &times; 12)</span>
        </div>

        {/* ARPU */}
        <div className="bg-forest-900/70 border border-forest-800 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-forest-400">ARPU (Rata-rata/Tenant)</span>
            <span className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <AiOutlineCheckCircle className="text-base" />
            </span>
          </div>
          <p className="text-2xl sm:text-3xl font-extrabold text-blue-300 font-display mt-3">
            Rp {metrics.arpu.toLocaleString('id-ID')}
          </p>
          <span className="text-[10px] text-forest-400 mt-1 block">Per paying tenant per bulan</span>
        </div>

        {/* Paying Tenant Ratio */}
        <div className="bg-forest-900/70 border border-forest-800 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-forest-400">Paying Tenants</span>
            <span className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <AiOutlineTeam className="text-base" />
            </span>
          </div>
          <p className="text-2xl sm:text-3xl font-extrabold text-purple-300 font-display mt-3">
            {metrics.activeCount}{' '}
            <span className="text-sm font-normal text-forest-400">/ {metrics.totalTenants}</span>
          </p>
          <span className="text-[10px] text-forest-400 mt-1 block">
            {metrics.totalTenants > 0
              ? `${Math.round((metrics.activeCount / metrics.totalTenants) * 100)}% Rasio Berlangganan Aktif`
              : 'Belum ada tenant'}
          </span>
        </div>
      </div>

      {/* Breakdown Vertikal */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-white font-display">Breakdown Pendapatan Berdasarkan Vertikal Bisnis</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Object.entries(metrics.verticalBreakdown).map(([typeKey, val]) => {
            const tmpl = getTenantTemplate(typeKey);
            return (
              <div key={typeKey} className="bg-forest-900/60 border border-forest-800 rounded-2xl p-5 space-y-3">
                <div className="flex items-center gap-3">
                  <span className="text-2xl p-2 bg-forest-950 rounded-xl border border-forest-700">{tmpl.icon}</span>
                  <div>
                    <h3 className="text-sm font-bold text-white">{tmpl.name}</h3>
                    <span className="text-[10px] text-forest-400">{val.count} Layanan Terdaftar</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-forest-800/80 space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-forest-400">Aktif Membayar:</span>
                    <strong className="text-emerald-300">{val.activeCount} tenant</strong>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-forest-400">Kontribusi MRR:</span>
                    <strong className="text-gold-300 font-mono">Rp {val.mrr.toLocaleString('id-ID')}</strong>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tabel Riwayat Transaksi Subscription Platform */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white font-display">Riwayat Transaksi Langganan Platform</h2>
            <p className="text-xs text-forest-400 mt-0.5">Catatan invoice &amp; pembayaran dari tabel subscription_payments</p>
          </div>
          <span className="text-xs text-forest-400 font-mono">Total Masuk: Rp {metrics.totalPaidRevenue.toLocaleString('id-ID')}</span>
        </div>

        <div className="bg-forest-900/60 border border-forest-800 rounded-2xl overflow-hidden shadow-xl">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="h-8 w-8 rounded-full border-2 border-forest-600 border-t-gold-500 animate-spin" />
            </div>
          ) : payments.length === 0 ? (
            <div className="py-16 text-center text-forest-400">
              <AiOutlineFileText className="text-4xl mx-auto mb-2 text-forest-600" />
              <p className="text-sm font-semibold text-forest-300">Belum Ada Transaksi Pembayaran</p>
              <p className="text-xs text-forest-500 max-w-sm mx-auto mt-1 leading-relaxed">
                Transaksi baru akan tercatat otomatis saat tenant melakukan perpanjangan atau pembayaran via QRIS Mayar (dihubungkan pada Phase 4).
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-forest-950/80 border-b border-forest-800 text-forest-400 uppercase tracking-wider font-semibold">
                    <th className="py-3.5 px-4">Referensi / Tanggal</th>
                    <th className="py-3.5 px-4">Nama Tenant</th>
                    <th className="py-3.5 px-4">Durasi Paket</th>
                    <th className="py-3.5 px-4">Metode Bayar</th>
                    <th className="py-3.5 px-4">Jumlah (Rp)</th>
                    <th className="py-3.5 px-4 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-forest-800/60">
                  {payments.map((p) => {
                    const tmpl = getTenantTemplate(p.tenant_type);
                    return (
                      <tr key={p.id} className="hover:bg-forest-800/30 transition-colors">
                        <td className="py-3.5 px-4">
                          <div className="font-mono font-bold text-white text-xs">{p.payment_gateway_ref || p.id}</div>
                          <div className="text-[10px] text-forest-400">
                            {p.paid_at || p.created_at
                              ? new Date(p.paid_at || p.created_at).toLocaleString('id-ID', {
                                  day: 'numeric',
                                  month: 'short',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : '-'}
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2">
                            <span>{tmpl.icon}</span>
                            <span className="font-semibold text-white">{p.tenant_name}</span>
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          <span className="px-2 py-0.5 bg-forest-950 border border-forest-700 rounded text-forest-300 font-semibold">
                            {p.period_months} Bulan
                          </span>
                        </td>

                        <td className="py-3.5 px-4 uppercase font-mono text-[11px] text-forest-300">
                          {p.payment_method}
                        </td>

                        <td className="py-3.5 px-4 font-mono font-bold text-gold-300 text-xs">
                          Rp {p.amount.toLocaleString('id-ID')}
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              p.status === 'settled'
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                : p.status === 'pending'
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                            }`}
                          >
                            {p.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
