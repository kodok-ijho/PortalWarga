import { NavLink } from 'react-router-dom';
import {
  AiOutlineHome,
  AiOutlineUser,
  AiOutlineTable,
  AiOutlineWallet,
  AiOutlineBarChart,
  AiOutlineSetting,
  AiOutlineLogout,
  AiOutlineTeam,
  AiOutlineFileText,
  AiOutlineUserAdd,
  AiOutlineCheckCircle,
} from 'react-icons/ai';
import { useAuth, IS_DEMO_MODE } from '../hooks/useAuth';
import {
  isStaffRole,
  isBendaharaOrAbove,
  getPendingRegistrations,
  getPendingPayments,
} from '../services/mockData';

// Menu utama (semua role)
const wargaNav = [
  { to: '/', label: 'Beranda', icon: AiOutlineHome, end: true },
  { to: '/residents', label: 'Penghuni', icon: AiOutlineUser },
  { to: '/payment-matrix', label: 'Matriks Bayar', icon: AiOutlineTable },
];

// Menu staff-only (pengurus, bendahara, admin)
const staffNav = [
  { to: '/user-approval', label: 'Approval User', icon: AiOutlineUserAdd, badgeKey: 'reg' },
  { to: '/houses', label: 'Rumah', icon: AiOutlineHome },
  { to: '/expenses', label: 'Pengeluaran', icon: AiOutlineWallet },
  { to: '/reports', label: 'Laporan', icon: AiOutlineBarChart },
  { to: '/settings', label: 'Pengaturan', icon: AiOutlineSetting },
];

// Menu bendahara & admin
const bendaharaNav = [
  { to: '/payment-verification', label: 'Verifikasi Bayar', icon: AiOutlineCheckCircle, badgeKey: 'pay' },
];

// Menu khusus admin
const adminNav = [
  { to: '/users', label: 'Kelola User', icon: AiOutlineTeam },
  { to: '/logs', label: 'Log Sistem', icon: AiOutlineFileText },
];

export default function Header() {
  const { isAuthenticated, profile, role, signOut } = useAuth();
  
  const pendingRegCount = getPendingRegistrations().length;
  const pendingPayCount = getPendingPayments().length;

  const getNavItems = () => {
    let items = [...wargaNav];
    if (isStaffRole(role)) {
      items = [...items, ...staffNav];
    }
    if (isBendaharaOrAbove(role)) {
      items = [...items, ...bendaharaNav];
    }
    if (role === 'admin') {
      items = [...items, ...adminNav];
    }
    return items;
  };

  const items = getNavItems();

  return (
    <header className="bg-forest-800 shadow-elevated sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
        {/* Logo & judul */}
        <div className="flex items-center gap-3">
          <img
            src="/logo.png"
            alt="Logo Palm Village"
            className="h-14 w-auto rounded-lg object-cover ring-2 ring-gold-500/40 shadow-sm"
          />
          <div>
            <h1 className="text-lg font-bold leading-tight text-white font-display tracking-wide">
              Palm Village
              {IS_DEMO_MODE && (
                <span className="ml-2 inline-flex items-center rounded bg-amber-400/95 text-forest-900 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ring-amber-300">
                  Demo
                </span>
              )}
            </h1>
            <p className="text-[11px] text-forest-200 leading-tight tracking-wider uppercase">
              Portal Warga
            </p>
            {profile?.full_name && (
              <p className="mt-0.5 text-xs text-gold-400 leading-tight">
                {profile.full_name}
              </p>
            )}
          </div>
        </div>

        {/* Tombol keluar */}
        {isAuthenticated && (
          <button
            onClick={() => signOut()}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-forest-200 hover:text-white rounded-lg hover:bg-forest-700 transition-colors"
          >
            <AiOutlineLogout /> Keluar
          </button>
        )}
      </div>

      {/* Navigasi */}
      <nav className="border-t border-forest-700 bg-forest-800">
        <div className="max-w-6xl mx-auto px-4 flex gap-0.5 overflow-x-auto">
          {items.map(({ to, label, icon: Icon, end, badgeKey }) => {
            const count =
              badgeKey === 'reg'
                ? pendingRegCount
                : badgeKey === 'pay'
                ? pendingPayCount
                : 0;
            return (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `inline-flex items-center gap-1.5 px-4 py-3 text-sm whitespace-nowrap border-b-2 transition-colors ${
                    isActive
                      ? 'border-gold-500 text-gold-400 font-semibold'
                      : 'border-transparent text-forest-300 hover:text-white hover:border-forest-500'
                  }`
                }
              >
                <Icon /> 
                <span>{label}</span>
                {count > 0 && (
                  <span className="ml-1 inline-flex items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white shadow-sm animate-pulse">
                    {count}
                  </span>
                )}
              </NavLink>
            );
          })}
        </div>
      </nav>
    </header>
  );
}


