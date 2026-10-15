import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  AiOutlineUser,
  AiOutlineHome,
  AiOutlineTable,
  AiOutlineBarChart,
  AiOutlineSetting,
  AiOutlineTeam,
  AiOutlineFileText,
  AiOutlineWallet,
  AiOutlineUserAdd,
  AiOutlineCheckCircle,
  AiOutlineFolder,
} from 'react-icons/ai';
import { useAuth } from '../hooks/useAuth';
import { useTour } from '../context/TourContext';
import {
  formatRupiah,
  MONTHS_LONG,
  isStaffRole,
  isBendaharaOrAbove,
  hasMinRole,
  roleLabel,
  OCCUPANCY_STATUS,
} from '../services/dataHelpers';
import { fetchDashboardData, IS_DEMO } from '../services/dataService';

export default function Home() {
  const { profile, role, session } = useAuth();
  const { triggerTour } = useTour();
  const isStaff = isStaffRole(role);
  const isBendahara = isBendaharaOrAbove(role);

  const [dashData, setDashData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const now = new Date();
  const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const loadDashboard = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchDashboardData(session?.access_token, { role, period: currentPeriod });
      setDashData(data);
    } catch {
      // Dashboard should not crash — just show zeros
      setDashData({ report: null, pendingRegistrationCount: 0, pendingPaymentCount: 0 });
    } finally {
      setIsLoading(false);
    }
  }, [session?.access_token, role, currentPeriod]);

  useEffect(() => {
    loadDashboard();
    triggerTour('dashboard');
  }, [loadDashboard, triggerTour]);

  const pendingRegCount = dashData?.pendingRegistrationCount || 0;
  const pendingPayCount = dashData?.pendingPaymentCount || 0;
  const report = dashData?.report || null;

  // Sapaan kontekstual waktu
  const getGreeting = () => {
    const hour = now.getHours();
    if (hour >= 4 && hour < 11) return 'Selamat Pagi';
    if (hour >= 11 && hour < 15) return 'Selamat Siang';
    if (hour >= 15 && hour < 18) return 'Selamat Sore';
    return 'Selamat Malam';
  };

  const occupancyLabel = profile?.occupancy_status
    ? OCCUPANCY_STATUS[profile.occupancy_status] || profile.occupancy_status
    : 'Warga Palm Village';

  const getFeatures = () => {
    const base = [
      {
        to: '/payment-matrix',
        icon: AiOutlineTable,
        title: 'Tagihan IPL',
        desc: 'Bayar & pantau iuran IPL unit Anda.',
        bgClass: 'bg-amber-50 text-amber-600 border-amber-200/70 hover:bg-amber-100/70',
        tourId: 'feature-payment-matrix',
      },
      {
        to: '/residents',
        icon: AiOutlineUser,
        title: 'Penghuni',
        desc: 'Lihat daftar penghuni kompleks.',
        bgClass: 'bg-sky-50 text-sky-600 border-sky-200/70 hover:bg-sky-100/70',
        tourId: 'feature-residents',
      },
      {
        to: '/houses',
        icon: AiOutlineHome,
        title: 'Hunian',
        desc: 'Lihat daftar rumah & nomor unit.',
        bgClass: 'bg-emerald-50 text-emerald-600 border-emerald-200/70 hover:bg-emerald-100/70',
        tourId: 'feature-houses',
      },
      {
        to: '/documents',
        icon: AiOutlineFolder,
        title: 'Dokumen',
        desc: 'Arsip berkas & transparansi warga.',
        bgClass: 'bg-rose-50 text-rose-600 border-rose-200/70 hover:bg-rose-100/70',
      },
    ];

    if (hasMinRole(role, 'admin')) {
      return [
        {
          to: '/payment-matrix',
          icon: AiOutlineTable,
          title: 'Tagihan IPL',
          desc: 'Pantau status pembayaran IPL semua unit.',
          bgClass: 'bg-amber-50 text-amber-600 border-amber-200/70 hover:bg-amber-100/70',
          tourId: 'feature-payment-matrix',
        },
        {
          to: '/user-approval',
          icon: AiOutlineUserAdd,
          title: 'Approval',
          desc: 'Verifikasi pendaftaran warga baru.',
          badge: pendingRegCount,
          bgClass: 'bg-indigo-50 text-indigo-600 border-indigo-200/70 hover:bg-indigo-100/70',
        },
        {
          to: '/payment-verification',
          icon: AiOutlineCheckCircle,
          title: 'Verifikasi',
          desc: 'Verifikasi bukti transfer IPL.',
          badge: pendingPayCount,
          bgClass: 'bg-orange-50 text-orange-600 border-orange-200/70 hover:bg-orange-100/70',
        },
        {
          to: '/residents',
          icon: AiOutlineUser,
          title: 'Penghuni',
          desc: 'Kelola data warga kompleks.',
          bgClass: 'bg-sky-50 text-sky-600 border-sky-200/70 hover:bg-sky-100/70',
          tourId: 'feature-residents',
        },
        {
          to: '/houses',
          icon: AiOutlineHome,
          title: 'Hunian',
          desc: 'Maintain nomor rumah & status unit.',
          bgClass: 'bg-emerald-50 text-emerald-600 border-emerald-200/70 hover:bg-emerald-100/70',
          tourId: 'feature-houses',
        },
        {
          to: '/documents',
          icon: AiOutlineFolder,
          title: 'Dokumen',
          desc: 'Kelola arsip & berkas warga.',
          bgClass: 'bg-rose-50 text-rose-600 border-rose-200/70 hover:bg-rose-100/70',
        },
        {
          to: '/expenses',
          icon: AiOutlineWallet,
          title: 'Pengeluaran',
          desc: 'Kelola biaya operasional perumahan.',
          bgClass: 'bg-purple-50 text-purple-600 border-purple-200/70 hover:bg-purple-100/70',
        },
        {
          to: '/reports',
          icon: AiOutlineBarChart,
          title: 'Laporan',
          desc: 'Laporan keuangan bulanan & grafik.',
          bgClass: 'bg-teal-50 text-teal-600 border-teal-200/70 hover:bg-teal-100/70',
        },
        {
          to: '/settings',
          icon: AiOutlineSetting,
          title: 'Pengaturan',
          desc: 'Atur besaran IPL & denda.',
          bgClass: 'bg-stone-100 text-stone-600 border-stone-200/70 hover:bg-stone-200/70',
        },
        {
          to: '/users',
          icon: AiOutlineTeam,
          title: 'Akses User',
          desc: 'Kelola akun warga & role.',
          bgClass: 'bg-blue-50 text-blue-600 border-blue-200/70 hover:bg-blue-100/70',
        },
        {
          to: '/logs',
          icon: AiOutlineFileText,
          title: 'Log Sistem',
          desc: 'Audit log sistem dan transaksi.',
          bgClass: 'bg-slate-100 text-slate-600 border-slate-200/70 hover:bg-slate-200/70',
        },
      ];
    }

    if (isBendahara || isStaff) {
      return [
        {
          to: '/payment-matrix',
          icon: AiOutlineTable,
          title: 'Tagihan IPL',
          desc: 'Pantau status pembayaran IPL semua unit.',
          bgClass: 'bg-amber-50 text-amber-600 border-amber-200/70 hover:bg-amber-100/70',
          tourId: 'feature-payment-matrix',
        },
        {
          to: '/user-approval',
          icon: AiOutlineUserAdd,
          title: 'Approval',
          desc: 'Verifikasi pendaftaran warga baru.',
          badge: pendingRegCount,
          bgClass: 'bg-indigo-50 text-indigo-600 border-indigo-200/70 hover:bg-indigo-100/70',
        },
        {
          to: '/payment-verification',
          icon: AiOutlineCheckCircle,
          title: 'Verifikasi',
          desc: 'Verifikasi bukti transfer IPL.',
          badge: pendingPayCount,
          bgClass: 'bg-orange-50 text-orange-600 border-orange-200/70 hover:bg-orange-100/70',
        },
        {
          to: '/residents',
          icon: AiOutlineUser,
          title: 'Penghuni',
          desc: 'Kelola data warga: tambah, edit.',
          bgClass: 'bg-sky-50 text-sky-600 border-sky-200/70 hover:bg-sky-100/70',
          tourId: 'feature-residents',
        },
        {
          to: '/houses',
          icon: AiOutlineHome,
          title: 'Hunian',
          desc: 'Maintain nomor rumah & status unit.',
          bgClass: 'bg-emerald-50 text-emerald-600 border-emerald-200/70 hover:bg-emerald-100/70',
          tourId: 'feature-houses',
        },
        {
          to: '/documents',
          icon: AiOutlineFolder,
          title: 'Dokumen',
          desc: 'Kelola arsip berkas & laporan.',
          bgClass: 'bg-rose-50 text-rose-600 border-rose-200/70 hover:bg-rose-100/70',
        },
        {
          to: '/expenses',
          icon: AiOutlineWallet,
          title: 'Pengeluaran',
          desc: 'Lihat & kelola biaya operasional.',
          bgClass: 'bg-purple-50 text-purple-600 border-purple-200/70 hover:bg-purple-100/70',
        },
        {
          to: '/reports',
          icon: AiOutlineBarChart,
          title: 'Laporan',
          desc: 'Laporan keuangan bulanan & grafik.',
          bgClass: 'bg-teal-50 text-teal-600 border-teal-200/70 hover:bg-teal-100/70',
        },
        {
          to: '/settings',
          icon: AiOutlineSetting,
          title: 'Pengaturan',
          desc: 'Atur besaran IPL dan komponen.',
          bgClass: 'bg-stone-100 text-stone-600 border-stone-200/70 hover:bg-stone-200/70',
        },
        {
          to: '/users',
          icon: AiOutlineTeam,
          title: 'Akses User',
          desc: 'Kelola akun warga dan hak akses.',
          bgClass: 'bg-blue-50 text-blue-600 border-blue-200/70 hover:bg-blue-100/70',
        },
      ];
    }

    return base;
  };

  const features = getFeatures();

  return (
    <div className="space-y-5">
      {/* Hero Card Hunian Palm Village (Seruma Style) */}
      <section data-tour="dashboard-hero" className="pv-card overflow-hidden border-0 shadow-elevated">
        <div className="relative bg-gradient-to-br from-forest-800 via-forest-700 to-forest-900 px-5 sm:px-8 py-6 sm:py-8 text-white">
          {/* Top gold accent line */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-gold-500 via-gold-400 to-gold-600" />
          
          {/* Subtle background glow */}
          <div className="absolute -top-12 -right-12 w-48 h-48 bg-gold-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 right-10 w-32 h-32 bg-forest-500/20 rounded-full blur-2xl pointer-events-none" />

          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-gold-300 uppercase tracking-wider bg-white/10 px-2.5 py-0.5 rounded-full border border-gold-400/20">
                  <span>🌿</span> {getGreeting()}
                </span>
                <span className="text-xs text-forest-200">Perumahan Palm Village</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-white font-display mt-2 tracking-tight">
                {profile?.full_name || 'Warga Palm Village'}
              </h2>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span
                  data-tour="profile-badge"
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-forest-900/60 text-gold-300 border border-gold-500/30"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {roleLabel(role)}
                </span>
                {profile?.unit_id && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-white/10 text-white border border-white/15">
                    <span>🏡</span> Unit #{profile.unit_id}
                  </span>
                )}
                <span className="text-[11px] text-forest-200 bg-forest-950/40 px-2.5 py-1 rounded-full border border-forest-600/30">
                  {occupancyLabel}
                </span>
              </div>
            </div>

            <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center border-t sm:border-t-0 border-white/10 pt-3 sm:pt-0">
              <span className="text-[11px] text-forest-300">Periode Berjalan</span>
              <span className="text-sm font-bold text-gold-300 font-mono">
                {MONTHS_LONG[now.getMonth()]} {now.getFullYear()}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* App Launcher: 4-Column Squircle Menu (Mobile / PWA View - Seruma Style) */}
      <section data-tour="dashboard-features" className="sm:hidden pv-card p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-gold-500" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-forest-800">
              Menu Layanan Warga
            </h3>
          </div>
          <span className="text-[11px] text-forest-500 font-medium">
            {features.length} Layanan
          </span>
        </div>

        <div className="grid grid-cols-4 gap-y-5 gap-x-2">
          {features.map(({ to, icon: Icon, title, bgClass, badge }) => (
            <Link
              key={`mob-${to}`}
              to={to}
              className="flex flex-col items-center text-center group p-1 rounded-xl transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
            >
              <div className="relative">
                <div
                  className={`w-14 h-14 rounded-2xl flex items-center justify-center border shadow-xs transition-all duration-200 group-hover:scale-105 group-hover:shadow-md group-active:scale-95 ${bgClass}`}
                >
                  <Icon className="text-2xl transition-transform duration-200 group-hover:scale-110" />
                </div>
                {badge > 0 && (
                  <span className="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[10px] font-extrabold text-white bg-red-500 rounded-full shadow-md animate-pulse">
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </div>
              <span className="mt-2 text-[11px] font-semibold text-forest-800 text-center leading-tight line-clamp-1 group-hover:text-gold-600 transition-colors">
                {title}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Feature Navigation: Classic Large Cards with Full Descriptions (Desktop / Laptop View) */}
      <div
        data-tour="dashboard-features"
        className="hidden sm:grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        {features.map(({ to, icon: Icon, title, desc, badge, tourId }) => (
          <Link
            key={`desk-${to}`}
            to={to}
            data-tour={tourId}
            className="pv-card p-5 group hover:border-gold-400/50 hover:shadow-elevated transition-all duration-200 relative flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-forest-800 text-gold-400 group-hover:bg-forest-700 transition-colors">
                  <Icon size={22} />
                </span>
                {badge > 0 && (
                  <span className="inline-flex items-center justify-center rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white shadow-sm animate-pulse">
                    {badge > 99 ? '99+' : badge} Baru
                  </span>
                )}
              </div>
              <h3 className="mt-4 font-semibold text-forest-900 text-sm group-hover:text-forest-700 transition-colors">
                {title}
              </h3>
              <p className="mt-1.5 text-xs text-forest-600 leading-relaxed">
                {desc}
              </p>
            </div>
            <div className="mt-4 flex items-center text-xs font-medium text-gold-600 group-hover:text-gold-700 transition-colors">
              <span>Buka Layanan</span>
              <span className="ml-1 transition-transform duration-200 group-hover:translate-x-1">→</span>
            </div>
          </Link>
        ))}
      </div>

      {/* Pending Actions Notification Banner */}
      {(pendingRegCount > 0 || pendingPayCount > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {pendingRegCount > 0 && (
            <Link
              to="/user-approval"
              className="flex items-center justify-between rounded-xl bg-amber-50/90 border border-amber-200/80 p-3.5 hover:bg-amber-100/80 transition-colors shadow-xs"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-2xl flex-shrink-0">⏳</span>
                <div className="min-w-0">
                  <h4 className="text-xs sm:text-sm font-bold text-amber-950 truncate">Pendaftaran Warga Baru</h4>
                  <p className="text-[11px] text-amber-800 truncate">Ada {pendingRegCount} akun warga menunggu persetujuan.</p>
                </div>
              </div>
              <span className="text-[11px] font-bold bg-amber-600 text-white px-2.5 py-1.5 rounded-lg shadow-xs flex-shrink-0 ml-2">
                Proses →
              </span>
            </Link>
          )}
          {pendingPayCount > 0 && (
            <Link
              to="/payment-verification"
              className="flex items-center justify-between rounded-xl bg-orange-50/90 border border-orange-200/80 p-3.5 hover:bg-orange-100/80 transition-colors shadow-xs"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-2xl flex-shrink-0">🔍</span>
                <div className="min-w-0">
                  <h4 className="text-xs sm:text-sm font-bold text-orange-950 truncate">Verifikasi Pembayaran</h4>
                  <p className="text-[11px] text-orange-800 truncate">Ada {pendingPayCount} transfer IPL menunggu verifikasi.</p>
                </div>
              </div>
              <span className="text-[11px] font-bold bg-orange-600 text-white px-2.5 py-1.5 rounded-lg shadow-xs flex-shrink-0 ml-2">
                Verifikasi →
              </span>
            </Link>
          )}
        </div>
      )}

      {/* Ringkasan Iuran & Keuangan Kompleks */}
      {isLoading ? (
        <section className="pv-card p-6 text-center">
          <div className="mx-auto mb-3 h-8 w-8 rounded-full border-3 border-forest-100 border-t-gold-500 animate-spin" />
          <p className="text-xs text-forest-500">Memuat data ringkasan iuran...</p>
        </section>
      ) : report && report.billCount > 0 ? (
        <section className="pv-card p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-base">📊</span>
              <div>
                <h3 className="text-xs sm:text-sm font-bold text-forest-900">
                  Ringkasan Iuran Kompleks
                </h3>
                <p className="text-[11px] text-forest-500">
                  Periode {MONTHS_LONG[now.getMonth()]} {now.getFullYear()}
                </p>
              </div>
            </div>
            <Link
              to="/payment-matrix"
              className="text-xs font-semibold text-gold-600 hover:text-gold-700 flex items-center gap-0.5 transition-colors"
            >
              <span>Lihat Matriks</span>
              <span className="text-xs">→</span>
            </Link>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
            <StatBox
              label="Total Tagihan"
              value={formatRupiah(report.totalBilled)}
              subtext={`${report.billCount} unit terdata`}
              color="text-forest-900"
              bg="bg-forest-50/70 border-forest-100/70"
            />
            <StatBox
              label="Terkumpul"
              value={formatRupiah(report.totalCollected)}
              subtext="Pemasukan kas"
              color="text-emerald-700"
              bg="bg-emerald-50/60 border-emerald-100/80"
            />
            <StatBox
              label="Tunggakan"
              value={formatRupiah(report.totalOutstanding)}
              subtext="Belum bayar"
              color="text-amber-700"
              bg="bg-amber-50/60 border-amber-100/80"
            />
            <StatBox
              label="Kolektibilitas"
              value={`${report.collectionRate.toFixed(0)}%`}
              subtext="Tingkat kepatuhan"
              color="text-gold-700"
              bg="bg-gold-50/60 border-gold-100/80"
            />
          </div>
        </section>
      ) : null}

      {/* Momen 17 Agustus Banner Shortcut */}
      <section className="pv-card overflow-hidden border border-red-200/80 shadow-xs bg-gradient-to-r from-red-600 via-red-500 to-rose-600 text-white relative">
        <div className="absolute top-0 right-0 -mt-6 -mr-6 w-36 h-36 bg-white/10 rounded-full blur-xl pointer-events-none" />
        <div className="p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 relative z-10">
          <div className="flex items-center gap-3.5">
            <div className="flex-shrink-0 w-11 h-11 rounded-xl bg-white/20 border border-white/30 flex items-center justify-center text-2xl shadow-inner">
              🇮🇩
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm sm:text-base font-bold text-white">
                  Momen & Dokumentasi 17 Agustus
                </h3>
                <span className="bg-white text-red-700 font-extrabold text-[9px] uppercase px-2 py-0.5 rounded-full shadow-xs">
                  HUT RI Palm Village
                </span>
              </div>
              <p className="text-xs text-red-100 mt-0.5 max-w-xl leading-relaxed">
                Akses kumpulan foto, video lomba, dan kemeriahan warga perumahan Palm Village di Google Drive.
              </p>
            </div>
          </div>
          <a
            href="https://drive.google.com/drive/folders/1-CIioJe6MkyBUeepB9I9yBSjsiR1h5HY"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-white hover:bg-red-50 text-red-700 font-bold px-4 py-2.5 text-xs shadow-md transition-all duration-200 hover:scale-[1.02] flex-shrink-0"
          >
            <span>📸 Buka Google Drive</span>
            <span className="text-xs">↗</span>
          </a>
        </div>
      </section>

      {/* Kontak Darurat & SOS Satpam */}
      <section className="pv-card overflow-hidden border-l-4 border-l-red-500 shadow-xs">
        <div className="p-4 sm:p-5 bg-gradient-to-r from-red-50/40 via-white to-red-50/20 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="flex-shrink-0 w-11 h-11 rounded-full bg-red-100 border border-red-200 flex items-center justify-center text-red-600 text-xl shadow-xs">
              🚨
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm sm:text-base font-bold text-forest-900">Kontak Darurat & Pos Satpam (SOS)</h3>
                <span className="pv-badge bg-red-100 text-red-700 font-bold text-[10px] uppercase">Siaga 24 Jam</span>
              </div>
              <p className="text-xs text-forest-600 mt-0.5 max-w-xl leading-relaxed">
                Keadaan darurat atau bantuan keamanan lingkungan? Hubungi langsung petugas satpam Palm Village.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full lg:w-auto pt-2 lg:pt-0 border-t lg:border-0 border-forest-100">
            {/* Satpam Riki */}
            <div className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-white border border-forest-100 shadow-xs">
              <div className="min-w-0 pr-1">
                <p className="text-xs font-bold text-forest-900 truncate">👮 Satpam Riki</p>
                <p className="text-[11px] text-forest-500 font-mono">0895-3231-36366</p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <a
                  href="https://wa.me/62895323136366?text=Halo%20Pak%20Satpam%20Riki,%20saya%20warga%20Palm%20Village%20membutuhkan%20bantuan."
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-2.5 py-1.5 text-xs shadow-xs transition-colors"
                  title="Chat WhatsApp Satpam Riki"
                >
                  <span>💬 WA</span>
                </a>
                <a
                  href="tel:+62895323136366"
                  className="inline-flex items-center justify-center gap-1 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium px-2.5 py-1.5 text-xs shadow-xs transition-colors"
                  title="Telepon Satpam Riki"
                >
                  <span>📞 Call</span>
                </a>
              </div>
            </div>

            {/* Satpam Roni */}
            <div className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-white border border-forest-100 shadow-xs">
              <div className="min-w-0 pr-1">
                <p className="text-xs font-bold text-forest-900 truncate">👮 Satpam Roni</p>
                <p className="text-[11px] text-forest-500 font-mono">0881-0103-57049</p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <a
                  href="https://wa.me/62881010357049?text=Halo%20Pak%20Satpam%20Roni,%20saya%20warga%20Palm%20Village%20membutuhkan%20bantuan."
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-2.5 py-1.5 text-xs shadow-xs transition-colors"
                  title="Chat WhatsApp Satpam Roni"
                >
                  <span>💬 WA</span>
                </a>
                <a
                  href="tel:+62881010357049"
                  className="inline-flex items-center justify-center gap-1 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium px-2.5 py-1.5 text-xs shadow-xs transition-colors"
                  title="Telepon Satpam Roni"
                >
                  <span>📞 Call</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Demo notice */}
      {IS_DEMO && (
        <div className="rounded-xl bg-gold-50/80 border border-gold-200/80 px-4 py-3 text-xs text-gold-900 shadow-xs">
          🔧 <strong>Mode Demo Aktif</strong> — data yang ditampilkan adalah simulasi. Untuk data real,
          hubungkan ke project Supabase dan set{' '}
          <code className="bg-gold-100 px-1 rounded font-mono text-[11px]">VITE_DEMO_MODE=false</code> di{' '}
          <code className="bg-gold-100 px-1 rounded font-mono text-[11px]">.env</code>.
        </div>
      )}
    </div>
  );
}

function StatBox({ label, value, subtext, color, bg }) {
  return (
    <div className={`p-3 rounded-xl border text-left ${bg} transition-all`}>
      <p className="text-[11px] font-medium text-forest-600 truncate">{label}</p>
      <p className={`text-sm sm:text-base font-bold font-mono mt-0.5 truncate ${color}`}>
        {value}
      </p>
      {subtext && (
        <p className="text-[10px] text-forest-500 mt-0.5 truncate">{subtext}</p>
      )}
    </div>
  );
}
