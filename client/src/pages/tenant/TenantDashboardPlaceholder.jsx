import { useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  AiOutlineHome,
  AiOutlineCheckCircle,
  AiOutlineSwap,
  AiOutlineArrowRight,
  AiOutlineSetting,
  AiOutlineTeam,
  AiOutlineTable,
} from 'react-icons/ai';
import { useTenant } from '../../hooks/useTenant';
import { useTenantTemplate } from '../../hooks/useTenantTemplate';
import TrialCountdownBanner from '../../components/TrialCountdownBanner';

export default function TenantDashboardPlaceholder() {
  const { tenantId } = useParams();
  const navigate = useNavigate();
  const {
    activeTenant,
    activeTenantId,
    switchTenant,
    subscriptionStatus,
    userRole,
    isTenantAdmin,
  } = useTenant();

  const template = useTenantTemplate();

  // Sinkronkan activeTenantId dengan URL param jika berbeda
  useEffect(() => {
    if (tenantId && tenantId !== activeTenantId) {
      switchTenant(tenantId);
    }
  }, [tenantId, activeTenantId, switchTenant]);

  return (
    <div className="min-h-screen bg-[#071f13] text-white py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Top Header Card */}
        <div className="bg-forest-900/80 border border-forest-700/80 rounded-2xl p-6 sm:p-8 shadow-2xl backdrop-blur-md">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6 pb-6 border-b border-forest-800">
            <div className="flex items-center gap-4">
              <span className="text-4xl p-3 bg-forest-950 rounded-2xl border border-forest-700 shadow-inner">
                {template.icon}
              </span>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs text-forest-300 font-semibold">{template.name}</span>
                  <span className="text-forest-600">&bull;</span>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full border uppercase font-bold ${
                      subscriptionStatus === 'active'
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                        : subscriptionStatus === 'trial'
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                        : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                    }`}
                  >
                    {subscriptionStatus === 'trial' ? 'Trial 15 Hari' : subscriptionStatus}
                  </span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-white font-display">
                  {activeTenant?.name || 'Dashboard Operasional'}
                </h1>
                <p className="text-xs text-forest-300 mt-0.5">
                  Tenant ID: <span className="font-mono text-forest-400">{tenantId}</span> &bull; Peran Anda:{' '}
                  <strong className="text-gold-400 capitalize">{userRole}</strong>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => navigate('/account/tenants')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-forest-800 hover:bg-forest-700 text-forest-200 hover:text-white text-xs font-semibold border border-forest-700 transition-colors"
              >
                <AiOutlineSwap className="text-sm" />
                <span>Ganti Tenant</span>
              </button>
            </div>
          </div>

          {/* Konteks & Kamus Istilah Vertikal */}
          <div className="pt-6">
            <h2 className="text-xs font-bold text-forest-400 uppercase tracking-wider mb-3">
              Kamus Istilah Vertikal Terpasang (TenantTemplate)
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 bg-forest-950/70 rounded-xl border border-forest-800">
                <span className="text-[10px] text-forest-400 block font-medium">Satuan Unit</span>
                <span className="text-sm font-bold text-white mt-0.5 block">{template.unitLabel}</span>
              </div>
              <div className="p-3 bg-forest-950/70 rounded-xl border border-forest-800">
                <span className="text-[10px] text-forest-400 block font-medium">Jenis Iuran / Tagihan</span>
                <span className="text-sm font-bold text-gold-300 mt-0.5 block">{template.billLabel}</span>
              </div>
              <div className="p-3 bg-forest-950/70 rounded-xl border border-forest-800">
                <span className="text-[10px] text-forest-400 block font-medium">Sebutan Anggota</span>
                <span className="text-sm font-bold text-white mt-0.5 block">{template.memberLabel}</span>
              </div>
              <div className="p-3 bg-forest-950/70 rounded-xl border border-forest-800">
                <span className="text-[10px] text-forest-400 block font-medium">Tindakan Bayar</span>
                <span className="text-sm font-bold text-emerald-300 mt-0.5 block">{template.paymentActionLabel}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Trial Countdown Banner (T4.3) */}
        <TrialCountdownBanner tenantId={tenantId} />

        {/* Status Phase 2 Milestone Banner */}
        <div className="p-6 rounded-2xl bg-forest-950/80 border border-gold-500/40 shadow-xl flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-gold-500/20 text-gold-400 flex items-center justify-center shrink-0 border border-gold-500/40 text-xl">
            <AiOutlineCheckCircle />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-bold text-white font-display">
              Alur Fondasi Tenant Context &amp; Onboarding Berhasil Mengalir!
            </h3>
            <p className="text-xs text-forest-300 mt-1 leading-relaxed">
              Halaman ini membuktikan bahwa <strong className="text-white">TenantContext</strong>, pemilihan tipe tenant,
              auto-provisioning trial, dan resolusi routing operasional <strong className="text-gold-300">/t/:tenantId/*</strong>{' '}
              telah tersambung mulus dari Phase 1 dan Phase 2. Fitur operasional vertikal penuh (manajemen unit, tagihan,
              pengocokan arisan, matriks multi-tahun) akan dihubungkan secara modular pada Phase 6 s/d 9.
            </p>

            <div className="flex flex-wrap items-center gap-3 mt-4 pt-3 border-t border-forest-800/80">
              <Link
                to="/"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-forest-800 hover:bg-forest-700 text-xs font-semibold text-white transition-colors"
              >
                <AiOutlineHome />
                <span>Lihat Fitur Operasional Existing</span>
              </Link>
              <Link
                to="/account/tenants"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gold-500 hover:bg-gold-400 text-xs font-bold text-forest-950 transition-colors"
              >
                <span>Daftar Layanan Saya</span>
                <AiOutlineArrowRight />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
