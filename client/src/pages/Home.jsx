import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AiOutlinePlus,
  AiOutlineArrowRight,
  AiOutlineSafetyCertificate,
  AiOutlineTeam,
  AiOutlineHome,
  AiOutlineDollarCircle,
  AiOutlineCheckCircle,
  AiOutlineEye,
  AiOutlineShop,
  AiOutlineAppstore,
  AiOutlineSwap,
  AiOutlineUser,
} from 'react-icons/ai';
import { useAuth, IS_DEMO_MODE } from '../hooks/useAuth';
import { useTenant } from '../hooks/useTenant';
import { TENANT_TYPE_OPTIONS } from './onboarding/ChooseTenantType';
import pkg from '../../package.json';

const APP_VERSION = `v${pkg.version || '1.4.3'}`;

export default function Home() {
  const navigate = useNavigate();
  const { user, profile, isAuthenticated, signOut, isSuperAdmin } = useAuth();
  const { userTenants, activeTenant, switchTenant, isPlatformAdmin } = useTenant();

  const handleSelectTenant = (tenantId) => {
    switchTenant(tenantId);
    navigate(`/t/${tenantId}/dashboard`);
  };

  return (
    <div className="min-h-screen bg-[#06180e] text-white flex flex-col selection:bg-gold-500 selection:text-forest-950">
      {/* ── Top Navigation Bar ───────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-[#071f13]/90 border-b border-forest-800/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="RuangWarga"
              className="h-10 w-auto rounded-xl object-cover ring-2 ring-gold-500/40 shadow-lg"
            />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-lg sm:text-xl font-display tracking-tight text-white">
                  RuangWarga
                </span>
                <span className="inline-flex items-center rounded-md bg-gold-500/20 text-gold-300 px-1.5 py-0.5 text-[10px] font-mono font-bold border border-gold-400/30">
                  {APP_VERSION}
                </span>
                {IS_DEMO_MODE && (
                  <span className="bg-amber-400/90 text-forest-950 text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider">
                    Demo
                  </span>
                )}
              </div>
              <p className="text-[10px] text-forest-300 tracking-wider uppercase font-medium">
                Platform SaaS Komunitas &amp; Properti
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/listing"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-forest-200 hover:text-white rounded-lg hover:bg-forest-800/60 transition"
            >
              <AiOutlineShop className="text-sm text-gold-400" />
              <span>Direktori Listing</span>
            </Link>

            {isAuthenticated ? (
              <div className="flex items-center gap-2">
                <Link
                  to="/account/tenants"
                  className="px-3 py-1.5 text-xs font-bold text-forest-200 hover:text-white rounded-lg hover:bg-forest-800/80 transition flex items-center gap-1.5"
                >
                  <AiOutlineAppstore className="text-sm text-gold-400" />
                  <span className="hidden sm:inline">Layanan Saya</span>
                </Link>
                <button
                  type="button"
                  onClick={() => signOut()}
                  className="px-3 py-1.5 text-xs text-rose-300 hover:text-white hover:bg-rose-950/50 rounded-lg transition border border-rose-500/20"
                >
                  Keluar
                </button>
              </div>
            ) : (
              <Link
                to="/login"
                className="px-4 py-2 text-xs font-bold text-forest-950 bg-gold-500 hover:bg-gold-400 rounded-xl transition shadow-md shadow-gold-900/30"
              >
                Masuk ke Akun
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* ── Main Content Area ────────────────────────────────────────── */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-12 sm:space-y-16">
        {/* ── Hero Section (Model SumoPod) ───────────────────────────── */}
        <section className="text-center max-w-4xl mx-auto pt-4 sm:pt-8 space-y-5 sm:space-y-6">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-gold-500/10 border border-gold-500/30 text-gold-300 text-xs font-bold uppercase tracking-widest shadow-inner">
            <span>✨ Model SumoPod SaaS Platform</span>
          </div>

          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-white font-display tracking-tight leading-tight">
            Satu Infrastruktur untuk{' '}
            <span className="bg-gradient-to-r from-gold-400 via-amber-300 to-gold-500 bg-clip-text text-transparent">
              Seluruh Kebutuhan Komunitas &amp; Properti
            </span>
          </h1>

          <p className="text-sm sm:text-lg text-forest-200 leading-relaxed max-w-3xl mx-auto">
            RuangWarga melayani 4 vertikal bisnis terpadu: <strong>RT/RW &amp; Perumahan</strong>,{' '}
            <strong>Kos-kosan &amp; Kontrakan</strong>, <strong>Kelompok Arisan</strong>, dan{' '}
            <strong>Kelas &amp; Kursus</strong>. Dilengkapi kapasitas fleksibel berjenjang, auto-billing,
            dan direktori listing publik.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Link
              to="/onboarding/choose-type"
              className="inline-flex items-center gap-2.5 px-6 py-3.5 rounded-xl bg-gradient-to-r from-gold-500 to-amber-500 hover:from-gold-400 hover:to-amber-400 text-forest-950 font-extrabold text-sm shadow-xl shadow-gold-950/50 transition-all hover:scale-105 active:scale-95"
            >
              <AiOutlinePlus className="text-base stroke-2 font-bold" />
              <span>Daftarkan Layanan / Tenant Baru</span>
            </Link>

            <Link
              to="/account/tenants"
              className="inline-flex items-center gap-2 px-5 py-3.5 rounded-xl bg-forest-900/90 hover:bg-forest-800 text-forest-200 hover:text-white border border-forest-700 font-bold text-sm transition"
            >
              <AiOutlineAppstore className="text-base text-gold-400" />
              <span>Kelola Layanan Saya</span>
            </Link>

            <Link
              to="/listing"
              className="inline-flex items-center gap-2 px-5 py-3.5 rounded-xl bg-forest-950 hover:bg-forest-900 text-forest-300 hover:text-gold-300 border border-forest-800 font-medium text-sm transition"
            >
              <AiOutlineShop className="text-base text-emerald-400" />
              <span>Jelajahi Listing Publik</span>
            </Link>
          </div>

          <div className="flex items-center justify-center gap-6 pt-2 text-xs text-forest-400 font-medium">
            <span className="flex items-center gap-1.5">
              <AiOutlineCheckCircle className="text-gold-400 text-sm" /> 15 Hari Free Trial Otomatis
            </span>
            <span className="flex items-center gap-1.5">
              <AiOutlineSafetyCertificate className="text-emerald-400 text-sm" /> Isolasi Data RLS Penuh
            </span>
            <span className="flex items-center gap-1.5">
              <AiOutlineDollarCircle className="text-amber-400 text-sm" /> Block Pricing Fleksibel
            </span>
          </div>
        </section>

        {/* ── Banner Eksklusif Platform Owner / Superadmin ────────────── */}
        {(isPlatformAdmin || isSuperAdmin) && (
          <section className="bg-gradient-to-r from-amber-950/60 via-forest-900 to-amber-950/60 border-2 border-gold-500/60 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
            <div className="absolute -right-10 -bottom-10 opacity-10 text-9xl">👑</div>
            <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
              <div className="space-y-2 max-w-2xl">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">👑</span>
                  <span className="text-xs font-bold uppercase tracking-widest text-gold-300 bg-gold-500/20 px-2.5 py-0.5 rounded-full border border-gold-400/40">
                    Platform Owner Access
                  </span>
                </div>
                <h2 className="text-xl sm:text-2xl font-bold text-white font-display">
                  Selamat Datang, Superadmin ({user?.email || profile?.email || 'dyudhiantoro@gmail.com'})
                </h2>
                <p className="text-xs sm:text-sm text-forest-200 leading-relaxed">
                  Anda memiliki otoritas penuh atas infrastruktur RuangWarga. Kelola status langganan seluruh tenant,
                  penetapan harga blok &amp; diskon periode, serta pantau estimasi pendapatan MRR platform secara berkala.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
                <Link
                  to="/platform"
                  className="px-5 py-3 rounded-xl bg-gradient-to-r from-gold-500 to-amber-400 hover:from-gold-400 hover:to-amber-300 text-forest-950 font-black text-xs tracking-wider uppercase flex items-center justify-center gap-2 shadow-lg shadow-gold-950/60 transition hover:scale-105"
                >
                  <AiOutlineSafetyCertificate className="text-base stroke-2" />
                  <span>Buka Platform Dashboard</span>
                </Link>
                <Link
                  to="/platform/pricing"
                  className="px-4 py-3 rounded-xl bg-forest-900 hover:bg-forest-800 text-gold-300 border border-gold-500/30 text-xs font-bold flex items-center justify-center gap-1.5 transition"
                >
                  <AiOutlineDollarCircle className="text-base" />
                  <span>Konfigurasi Harga</span>
                </Link>
              </div>
            </div>
          </section>
        )}

        {/* ── Widget Workspace / Tenant Aktif Anda ────────────────────── */}
        {userTenants && userTenants.length > 0 && (
          <section className="bg-forest-900/60 border border-forest-700/80 rounded-3xl p-6 sm:p-8 space-y-6 shadow-xl backdrop-blur-sm">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-forest-800">
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-white font-display flex items-center gap-2">
                  <span>🏢</span>
                  <span>Layanan Aktif Anda ({userTenants.length} Tenant)</span>
                </h2>
                <p className="text-xs text-forest-300 mt-0.5">
                  Pilih salah satu layanan untuk masuk ke dashboard operasional harian.
                </p>
              </div>
              <Link
                to="/account/tenants"
                className="text-xs font-bold text-gold-400 hover:text-gold-300 flex items-center gap-1"
              >
                <span>Kelola Semua Tenant</span>
                <AiOutlineArrowRight className="text-xs" />
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {userTenants.map((t) => {
                const opt = TENANT_TYPE_OPTIONS.find((o) => o.type === t.type);
                const isActive = activeTenant?.id === t.id;
                return (
                  <div
                    key={t.id}
                    className={`rounded-2xl p-5 border transition-all flex flex-col justify-between ${
                      isActive
                        ? 'bg-forest-800/90 border-gold-500/60 shadow-lg shadow-gold-950/30 ring-1 ring-gold-500/30'
                        : 'bg-forest-950/70 border-forest-800 hover:border-forest-600 hover:bg-forest-900/50'
                    }`}
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-2xl">{opt?.icon || '🏢'}</span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-forest-800 text-forest-200 border border-forest-700 uppercase">
                          {t.type?.replace('_', '/')}
                        </span>
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-white line-clamp-1">{t.name}</h3>
                        <p className="text-[11px] text-forest-400 line-clamp-1">{t.address || opt?.title}</p>
                      </div>
                    </div>

                    <div className="pt-4 mt-2 border-t border-forest-800/60 flex items-center justify-between">
                      <span className="text-[10px] text-forest-300">
                        Role: <strong className="text-gold-300 capitalize">{t.role || 'Admin'}</strong>
                      </span>
                      <button
                        type="button"
                        onClick={() => handleSelectTenant(t.id)}
                        className="px-3 py-1.5 rounded-lg bg-gold-500 hover:bg-gold-400 text-forest-950 font-bold text-xs flex items-center gap-1 transition"
                      >
                        <span>Buka</span>
                        <AiOutlineArrowRight className="text-xs" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Showcase 4 Vertikal Bisnis (Pabrik SumoPod) ─────────────── */}
        <section className="space-y-8">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white font-display">
              Empat Vertikal Bisnis yang Didukung
            </h2>
            <p className="text-xs sm:text-sm text-forest-300">
              Setiap vertikal memiliki template istilah, logika penagihan, dan modul kerja yang disesuaikan secara spesifik.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {TENANT_TYPE_OPTIONS.map((opt) => (
              <div
                key={opt.type}
                className="bg-forest-900/70 border border-forest-800 hover:border-gold-500/40 rounded-3xl p-6 sm:p-8 flex flex-col justify-between transition-all hover:shadow-2xl hover:shadow-gold-950/20 group"
              >
                <div className="space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="w-14 h-14 rounded-2xl bg-forest-950 border border-forest-700/60 flex items-center justify-center text-3xl group-hover:scale-110 transition-transform">
                      {opt.icon}
                    </div>
                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${opt.badgeColor}`}>
                      {opt.badge}
                    </span>
                  </div>

                  <div>
                    <h3 className="text-xl font-bold text-white font-display group-hover:text-gold-300 transition-colors">
                      {opt.title}
                    </h3>
                    <p className="text-xs text-forest-400 mt-0.5">Untuk: {opt.targetRole}</p>
                  </div>

                  <p className="text-xs text-forest-200 leading-relaxed">{opt.description}</p>

                  <div className="space-y-2 pt-2 border-t border-forest-800/80">
                    <span className="text-[10px] font-bold text-forest-400 uppercase tracking-wider block">
                      Fitur Utama:
                    </span>
                    <ul className="space-y-1.5 text-xs text-forest-300">
                      {opt.features.map((feat, i) => (
                        <li key={i} className="flex items-center gap-2">
                          <AiOutlineCheckCircle className="text-gold-400 text-xs shrink-0" />
                          <span>{feat}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="pt-6 mt-4 border-t border-forest-800 flex items-center gap-3">
                  <Link
                    to={`/onboarding/choose-type?type=${opt.type}`}
                    className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-gold-500 to-amber-500 hover:from-gold-400 hover:to-amber-400 text-forest-950 font-bold text-xs text-center transition shadow shadow-gold-950/40"
                  >
                    Buat {opt.title.split('&')[0]} Baru
                  </Link>
                  <Link
                    to={`/t/demo-tenant-${opt.type}/dashboard`}
                    className="py-2.5 px-4 rounded-xl bg-forest-950 hover:bg-forest-800 text-forest-300 hover:text-white border border-forest-700 font-semibold text-xs transition text-center"
                    title="Pratinjau antarmuka demo"
                  >
                    Demo
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Pilar Fondasi Multi-Tenant Platform ─────────────────────── */}
        <section className="bg-[#05140b] border border-forest-800 rounded-3xl p-8 sm:p-12 space-y-8">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <span className="text-xs font-bold text-gold-400 uppercase tracking-widest">
              Arsitektur &amp; Keamanan
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white font-display">
              Dibangun dengan Standar SaaS Modern
            </h2>
            <p className="text-xs sm:text-sm text-forest-300">
              Fondasi multi-tenant yang tangguh, aman, dan siap tumbuh bersama skala komunitas Anda.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-forest-900/40 border border-forest-800 rounded-2xl p-6 space-y-3">
              <div className="w-12 h-12 rounded-xl bg-gold-500/10 text-gold-400 border border-gold-500/20 flex items-center justify-center text-2xl">
                🛡️
              </div>
              <h3 className="text-sm font-bold text-white">Isolasi Database (RLS)</h3>
              <p className="text-xs text-forest-300 leading-relaxed">
                Setiap tabel operasional diproteksi oleh Row Level Security PostgreSQL sehingga data tidak akan pernah bocor antar tenant.
              </p>
            </div>

            <div className="bg-forest-900/40 border border-forest-800 rounded-2xl p-6 space-y-3">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center text-2xl">
                📦
              </div>
              <h3 className="text-sm font-bold text-white">Block Capacity Pricing</h3>
              <p className="text-xs text-forest-300 leading-relaxed">
                Skema langganan modular: bayar hanya blok kapasitas unit, kamar, atau slot yang Anda gunakan.
              </p>
            </div>

            <div className="bg-forest-900/40 border border-forest-800 rounded-2xl p-6 space-y-3">
              <div className="w-12 h-12 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20 flex items-center justify-center text-2xl">
                📢
              </div>
              <h3 className="text-sm font-bold text-white">Modul Listing Publik</h3>
              <p className="text-xs text-forest-300 leading-relaxed">
                Promosikan kamar kos kosong dan lapak UMKM warga ke halaman publik tanpa login dengan opsi promosi berbayar.
              </p>
            </div>

            <div className="bg-forest-900/40 border border-forest-800 rounded-2xl p-6 space-y-3">
              <div className="w-12 h-12 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center justify-center text-2xl">
                💳
              </div>
              <h3 className="text-sm font-bold text-white">Mayar QRIS Otomatis</h3>
              <p className="text-xs text-forest-300 leading-relaxed">
                Pembayaran langganan platform dan iuran warga dapat dilakukan instan melalui scan QRIS seluruh e-wallet &amp; mobile banking.
              </p>
            </div>
          </div>
        </section>

        {/* ── Call To Action Bawah ────────────────────────────────────── */}
        <section className="bg-gradient-to-br from-forest-900 via-forest-800 to-forest-950 border border-gold-500/40 rounded-3xl p-8 sm:p-12 text-center space-y-6 shadow-2xl relative overflow-hidden">
          <div className="max-w-2xl mx-auto space-y-3">
            <h2 className="text-2xl sm:text-3xl font-black text-white font-display">
              Siap Mengelola Komunitas Anda Lebih Rapi?
            </h2>
            <p className="text-xs sm:text-sm text-forest-200 leading-relaxed">
              Mulai sekarang dengan 15 hari trial gratis penuh tanpa kartu kredit.
              Buat tenant Anda dan undang anggota dalam hitungan menit.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link
              to="/onboarding/choose-type"
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl bg-gradient-to-r from-gold-500 to-amber-400 hover:from-gold-400 hover:to-amber-300 text-forest-950 font-extrabold text-sm shadow-xl shadow-gold-950/60 transition hover:scale-105"
            >
              <AiOutlinePlus className="text-base font-bold" />
              <span>Daftarkan Tenant Pertama Anda</span>
            </Link>
            <Link
              to="/listing"
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-forest-950 hover:bg-forest-900 text-forest-200 hover:text-white border border-forest-700 font-bold text-sm transition"
            >
              <AiOutlineShop className="text-base text-gold-400" />
              <span>Lihat Direktori Listing Publik</span>
            </Link>
          </div>
        </section>
      </main>

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <footer className="border-t border-forest-800/80 bg-[#05140b] py-8 text-center text-xs text-forest-400 space-y-2">
        <p className="font-medium">
          RuangWarga © 2026 — Platform SaaS Multi-Tenant Komunitas &amp; Properti.
        </p>
        <div className="flex items-center justify-center gap-4 text-[11px] text-forest-500">
          <Link to="/listing/kos" className="hover:text-forest-300">Listing Kos</Link>
          <span>•</span>
          <Link to="/listing/umkm" className="hover:text-forest-300">Listing UMKM</Link>
          <span>•</span>
          <Link to="/account/tenants" className="hover:text-forest-300">Layanan Saya</Link>
          <span>•</span>
          <Link to="/platform" className="hover:text-forest-300">Platform Owner</Link>
        </div>
      </footer>
    </div>
  );
}
