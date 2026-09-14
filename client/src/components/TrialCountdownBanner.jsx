import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AiOutlineClockCircle,
  AiOutlineThunderbolt,
  AiOutlineWarning,
  AiOutlineArrowRight,
} from 'react-icons/ai';
import { useTenant } from '../hooks/useTenant';

/**
 * TrialCountdownBanner — Banner penghitung mundur masa percobaan (Trial 15 hari)
 * dan status read-only.
 * Ref: task.md T4.3, requirement.md FR-7, FR-12, FR-13
 */
export default function TrialCountdownBanner({ tenantId }) {
  const navigate = useNavigate();
  const { activeTenant, activeTenantId, userTenants, isTenantAdmin } = useTenant();

  const currentTenant = (tenantId ? userTenants.find((t) => t.id === tenantId) : activeTenant) || activeTenant;
  const subscription = currentTenant?.subscription;
  const status = subscription?.status || 'trial';
  const trialEndsAtStr = subscription?.trial_ends_at;

  const [timeLeft, setTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
    isExpired: false,
  });

  useEffect(() => {
    if (!trialEndsAtStr) return;

    const targetDate = new Date(trialEndsAtStr).getTime();

    const updateTimer = () => {
      const now = Date.now();
      const difference = targetDate - now;

      if (difference <= 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0, isExpired: true });
        return;
      }

      const days = Math.floor(difference / (1000 * 60 * 60 * 24));
      const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((difference % (1000 * 60)) / 1000);

      setTimeLeft({ days, hours, minutes, seconds, isExpired: false });
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [trialEndsAtStr]);

  // Hanya tampil untuk status trial atau read_only
  if (status === 'active') {
    return null;
  }

  // Kasus Read-Only
  if (status === 'read_only' || timeLeft.isExpired) {
    return (
      <div className="rounded-2xl p-4 sm:p-5 bg-gradient-to-r from-rose-950/80 via-rose-900/60 to-forest-950 border-2 border-rose-500/50 shadow-xl backdrop-blur-md flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-300 border border-rose-500/40 flex items-center justify-center shrink-0 text-xl">
            <AiOutlineWarning />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-rose-500/30 text-rose-200 border border-rose-500/50">
                Mode Read-Only
              </span>
              <span className="text-xs text-rose-300 font-semibold">Masa Percobaan Berakhir</span>
            </div>
            <p className="text-xs text-forest-200 mt-1 leading-relaxed">
              Layanan ini berada dalam mode baca-saja. Semua data tersimpan aman, namun pencatatan transaksi baru dibatasi hingga langganan diaktifkan.
            </p>
          </div>
        </div>

        {isTenantAdmin && (
          <button
            type="button"
            onClick={() => navigate(`/account/choose-plan?tenantId=${currentTenant?.id || activeTenantId}`)}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-400 text-white font-bold text-xs shadow-lg shadow-rose-950/40 transition-all hover:scale-105 shrink-0"
          >
            <span>Aktifkan Langganan Sekarang</span>
            <AiOutlineArrowRight />
          </button>
        )}
      </div>
    );
  }

  // Kasus Trial Berjalan
  return (
    <div className="rounded-2xl p-5 bg-gradient-to-r from-forest-900 via-forest-900/90 to-forest-950 border-2 border-amber-500/50 shadow-xl backdrop-blur-md flex flex-col md:flex-row md:items-center md:justify-between gap-5">
      <div className="flex items-start gap-3.5">
        <div className="w-11 h-11 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center justify-center shrink-0 text-2xl">
          <AiOutlineClockCircle className="animate-pulse" />
        </div>
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
              Trial 15 Hari Aktif
            </span>
            <span className="text-xs text-forest-300">Akses Penuh Fitur Platform</span>
          </div>
          <h3 className="text-sm font-bold text-white font-display">
            Masa percobaan gratis Anda sedang berjalan
          </h3>
          <p className="text-xs text-forest-300 mt-0.5">
            Pilih paket kapasitas unit sebelum masa trial selesai agar operasional komunitas tidak terhenti.
          </p>
        </div>
      </div>

      {/* Countdown Digits & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 shrink-0 border-t md:border-t-0 pt-3 md:pt-0 border-forest-800">
        {/* Countdown timer blocks */}
        <div className="flex items-center gap-2 text-center">
          <div className="bg-forest-950/80 border border-forest-700 px-2.5 py-1.5 rounded-xl min-w-[44px]">
            <span className="block text-sm font-extrabold text-gold-300 font-mono leading-none">
              {timeLeft.days}
            </span>
            <span className="text-[9px] text-forest-400 font-medium uppercase">Hari</span>
          </div>
          <span className="text-forest-600 font-bold">:</span>
          <div className="bg-forest-950/80 border border-forest-700 px-2.5 py-1.5 rounded-xl min-w-[44px]">
            <span className="block text-sm font-extrabold text-white font-mono leading-none">
              {String(timeLeft.hours).padStart(2, '0')}
            </span>
            <span className="text-[9px] text-forest-400 font-medium uppercase">Jam</span>
          </div>
          <span className="text-forest-600 font-bold">:</span>
          <div className="bg-forest-950/80 border border-forest-700 px-2.5 py-1.5 rounded-xl min-w-[44px]">
            <span className="block text-sm font-extrabold text-white font-mono leading-none">
              {String(timeLeft.minutes).padStart(2, '0')}
            </span>
            <span className="text-[9px] text-forest-400 font-medium uppercase">Mnt</span>
          </div>
          <span className="text-forest-600 font-bold">:</span>
          <div className="bg-forest-950/80 border border-forest-700 px-2.5 py-1.5 rounded-xl min-w-[44px]">
            <span className="block text-sm font-extrabold text-amber-300 font-mono leading-none">
              {String(timeLeft.seconds).padStart(2, '0')}
            </span>
            <span className="text-[9px] text-forest-400 font-medium uppercase">Dtk</span>
          </div>
        </div>

        {isTenantAdmin && (
          <button
            type="button"
            onClick={() => navigate(`/account/choose-plan?tenantId=${currentTenant?.id || activeTenantId}`)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-gold-500 to-amber-500 hover:from-gold-400 hover:to-amber-400 text-forest-950 font-extrabold text-xs shadow-lg shadow-gold-950/30 transition-all hover:scale-105"
          >
            <AiOutlineThunderbolt />
            <span>Pilih Paket Sekarang</span>
          </button>
        )}
      </div>
    </div>
  );
}
