import { Link } from 'react-router-dom';
import {
  AiOutlineUser,
  AiOutlineTable,
  AiOutlineBarChart,
  AiOutlineSetting,
} from 'react-icons/ai';
import { useAuth, IS_DEMO_MODE } from '../hooks/useAuth';
import {
  mockProfiles,
  mockIPLBills,
  computeReport,
  formatRupiah,
  MONTHS_LONG,
} from '../services/mockData';

export default function Home() {
  const { profile, role } = useAuth();
  const isStaff = role === 'admin' || role === 'rt_rw';

  // Stats untuk bulan berjalan
  const now = new Date();
  const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const report = IS_DEMO_MODE ? computeReport(currentPeriod) : null;

  const features = isStaff
    ? [
        { to: '/residents', icon: AiOutlineUser, title: 'Penghuni', desc: 'Kelola data warga: tambah, edit, upload CSV.' },
        { to: '/payment-matrix', icon: AiOutlineTable, title: 'Matriks Bayar', desc: 'Pantau status pembayaran IPL semua unit.' },
        { to: '/reports', icon: AiOutlineBarChart, title: 'Laporan', desc: 'Laporan keuangan IPL bulanan + grafik & export.' },
        { to: '/settings', icon: AiOutlineSetting, title: 'Pengaturan', desc: 'Atur besaran IPL, denda, dan komponen iuran.' },
      ]
    : [
        { to: '/residents', icon: AiOutlineUser, title: 'Penghuni', desc: 'Lihat daftar penghuni kompleks.' },
        { to: '/payment-matrix', icon: AiOutlineTable, title: 'Matriks Bayar', desc: 'Bayar IPL beberapa bulan sekaligus via QRIS.' },
      ];

  return (
    <div className="space-y-6">
      {/* Hero */}
      <section className="pv-card overflow-hidden">
        <div className="relative bg-gradient-to-br from-forest-800 via-forest-700 to-forest-900 px-6 sm:px-10 py-8 sm:py-12">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-gold-500 via-gold-400 to-gold-600" />
          <div className="relative max-w-2xl">
            <h2 className="text-2xl sm:text-3xl font-bold text-white font-display leading-tight">
              Selamat Datang di
              <br />
              <span className="text-gold-400">Portal Warga Palm Village</span>
            </h2>
            <p className="mt-3 text-forest-200 text-sm sm:text-base max-w-xl">
              Portal layanan informasi dan transaksi untuk warga kompleks Perumahan Palm Village.
            </p>
            {profile?.full_name && (
              <p className="mt-4 inline-flex items-center gap-2 bg-forest-900/40 backdrop-blur rounded-full px-4 py-1.5 text-sm text-gold-300 border border-gold-500/20">
                🌴 Halo, {profile.full_name}
                {role && (
                  <span className="pv-badge bg-gold-500/20 text-gold-400 ml-1">
                    {role === 'admin' ? 'Admin' : role === 'rt_rw' ? 'RT/RW' : 'Warga'}
                  </span>
                )}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Stats bulan berjalan */}
      {IS_DEMO_MODE && report && report.billCount > 0 && (
        <section className="pv-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-forest-800">
              Ringkasan — {MONTHS_LONG[now.getMonth()]} {now.getFullYear()}
            </h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatBox label="Total Tagihan" value={formatRupiah(report.totalBilled)} color="text-forest-800" />
            <StatBox label="Terkumpul" value={formatRupiah(report.totalCollected)} color="text-emerald-600" />
            <StatBox label="Tunggakan" value={formatRupiah(report.totalOutstanding)} color="text-amber-600" />
            <StatBox label="% Koleksi" value={`${report.collectionRate.toFixed(0)}%`} color="text-gold-600" />
          </div>
        </section>
      )}

      {/* Feature cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {features.map(({ to, icon: Icon, title, desc }) => (
          <Link
            key={to}
            to={to}
            className="pv-card p-5 group hover:border-gold-400/50 hover:shadow-elevated transition-all duration-200"
          >
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-forest-800 text-gold-400 group-hover:bg-forest-700 transition-colors">
              <Icon size={22} />
            </span>
            <h3 className="mt-4 font-semibold text-forest-900 text-sm">{title}</h3>
            <p className="mt-1.5 text-xs text-forest-600 leading-relaxed">{desc}</p>
          </Link>
        ))}
      </div>

      {/* Demo notice */}
      {IS_DEMO_MODE && (
        <div className="rounded-lg bg-gold-50 border border-gold-200 px-4 py-3 text-xs text-gold-800">
          🔧 <strong>Mode Demo</strong> aktif — data yang ditampilkan adalah simulasi. Untuk data real,
          hubungkan ke project Supabase dan set{' '}
          <code className="bg-gold-100 px-1 rounded">VITE_DEMO_MODE=false</code> di{' '}
          <code className="bg-gold-100 px-1 rounded">.env</code>.
        </div>
      )}
    </div>
  );
}

function StatBox({ label, value, color }) {
  return (
    <div className="text-center py-3 rounded-lg bg-forest-50">
      <p className={`text-lg font-bold ${color}`}>{value}</p>
      <p className="text-[11px] text-forest-500 mt-1">{label}</p>
    </div>
  );
}
