import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, useLocation } from 'react-router-dom';
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
  AiOutlineDown,
  AiOutlineMenu,
  AiOutlineClose,
  AiOutlineEdit,
} from 'react-icons/ai';
import { useAuth, IS_DEMO_MODE } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import {
  isStaffRole,
  isBendaharaOrAbove,
  getPendingRegistrations,
  getPendingPayments,
  roleLabel,
} from '../services/mockData';

export default function Header() {
  const { isAuthenticated, profile, role, signOut, updateProfile } = useAuth();
  const location = useLocation();
  const toast = useToast();
  const [openDropdown, setOpenDropdown] = useState(null); // null | 'keuangan' | 'warga' | 'sistem'
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const dropdownRef = useRef(null);

  const openProfileModal = () => {
    setEditName(profile?.full_name || '');
    setEditPhone(profile?.phone || '');
    setProfileModalOpen(true);
    setMobileMenuOpen(false);
  };

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    if (!editName.trim()) {
      toast.error('Nama lengkap tidak boleh kosong.');
      return;
    }
    try {
      if (updateProfile) {
        await updateProfile({ full_name: editName.trim(), phone: editPhone.trim() });
        toast.success('Profil & No. Telepon berhasil diperbarui!');
        setProfileModalOpen(false);
      }
    } catch (err) {
      toast.error(err.message || 'Gagal memperbarui profil.');
    }
  };

  const pendingRegCount = getPendingRegistrations().length;
  const pendingPayCount = getPendingPayments().length;

  // Tutup dropdown saat pindah halaman
  useEffect(() => {
    setOpenDropdown(null);
    setMobileMenuOpen(false);
  }, [location.pathname]);

  // Klik di luar untuk menutup dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Definisikan grup menu
  const navGroups = [
    {
      key: 'beranda',
      label: 'Beranda',
      icon: AiOutlineHome,
      to: '/',
      end: true,
    },
    {
      key: 'keuangan',
      label: 'Keuangan & IPL',
      icon: AiOutlineWallet,
      badgeCount: isBendaharaOrAbove(role) ? pendingPayCount : 0,
      activePaths: ['/payment-matrix', '/payment-verification', '/expenses', '/reports'],
      items: [
        { to: '/payment-matrix', label: 'Matriks Bayar', icon: AiOutlineTable, desc: 'Matriks pembayaran IPL unit' },
        ...(isBendaharaOrAbove(role)
          ? [
              {
                to: '/payment-verification',
                label: 'Verifikasi Bayar',
                icon: AiOutlineCheckCircle,
                badge: pendingPayCount,
                desc: 'Verifikasi bukti transfer warga',
              },
            ]
          : []),
        ...(isStaffRole(role)
          ? [
              { to: '/expenses', label: 'Pengeluaran', icon: AiOutlineWallet, desc: 'Catat & kelola pengeluaran' },
              { to: '/reports', label: 'Laporan Keuangan', icon: AiOutlineBarChart, desc: 'Laporan arus kas bulanan' },
            ]
          : []),
      ],
    },
    {
      key: 'warga',
      label: 'Warga & Rumah',
      icon: AiOutlineTeam,
      badgeCount: isStaffRole(role) ? pendingRegCount : 0,
      activePaths: ['/residents', '/houses', '/user-approval', '/users'],
      items: [
        { to: '/residents', label: 'Daftar Penghuni', icon: AiOutlineUser, desc: 'Direktori penghuni kompleks' },
        ...(isStaffRole(role)
          ? [
              { to: '/houses', label: 'Daftar Rumah', icon: AiOutlineHome, desc: 'Maintain data unit & mapsite' },
              {
                to: '/user-approval',
                label: 'Approval User',
                icon: AiOutlineUserAdd,
                badge: pendingRegCount,
                desc: 'Verifikasi pendaftaran warga baru',
              },
              { to: '/users', label: 'Kelola User', icon: AiOutlineTeam, desc: 'Hak akses & edit profil warga' },
            ]
          : []),
      ],
    },
    ...(isStaffRole(role)
      ? [
          {
            key: 'sistem',
            label: 'Sistem & Pengaturan',
            icon: AiOutlineSetting,
            activePaths: ['/settings', '/logs'],
            items: [
              { to: '/settings', label: 'Pengaturan', icon: AiOutlineSetting, desc: 'Atur tarif IPL dan denda' },
              ...(role === 'admin'
                ? [{ to: '/logs', label: 'Log Sistem', icon: AiOutlineFileText, desc: 'Audit log aktivitas portal' }]
                : []),
            ],
          },
        ]
      : []),
  ];

  const handleDropdownToggle = (key) => {
    setOpenDropdown((prev) => (prev === key ? null : key));
  };

  return (
    <header className="bg-forest-800 border-b border-forest-700/60 sticky top-0 z-50 shadow-lg">
      <div className="max-w-6xl mx-auto px-4 flex items-center justify-between h-16">
        {/* Kiri: Brand Logo */}
        <div className="flex items-center gap-3">
          <img
            src="/logo.png"
            alt="Logo"
            className="h-10 w-auto rounded-lg object-cover ring-2 ring-gold-500/30"
          />
          <div>
            <h1 className="text-sm md:text-base font-bold text-white leading-none tracking-wide flex items-center gap-1.5 font-display">
              Palm Village
              {IS_DEMO_MODE && (
                <span className="bg-amber-400/90 text-forest-900 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider scale-90 origin-left">
                  Demo
                </span>
              )}
            </h1>
            <p className="text-[10px] text-forest-300 leading-tight tracking-wider uppercase mt-0.5">
              Portal Warga
            </p>
          </div>
        </div>

        {/* Tengah: Navigasi Desktop Dropdown (Bebas Scrollbar) */}
        {isAuthenticated && (
          <nav ref={dropdownRef} className="hidden md:flex items-center gap-1 h-full z-50">
            {navGroups.map((group) => {
              const Icon = group.icon;
              const isGroupActive =
                group.to === location.pathname ||
                (group.activePaths && group.activePaths.some((path) => location.pathname.startsWith(path)));
              const isOpen = openDropdown === group.key;

              if (group.to) {
                return (
                  <NavLink
                    key={group.key}
                    to={group.to}
                    end={group.end}
                    className={({ isActive }) =>
                      `flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg transition-all ${
                        isActive
                          ? 'bg-forest-700/60 text-gold-400 shadow-inner'
                          : 'text-forest-200 hover:text-white hover:bg-forest-700/30'
                      }`
                    }
                  >
                    <Icon className="text-sm" />
                    <span>{group.label}</span>
                  </NavLink>
                );
              }

              return (
                <div key={group.key} className="relative h-full flex items-center">
                  <button
                    type="button"
                    onClick={() => handleDropdownToggle(group.key)}
                    className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg transition-all outline-none ${
                      isGroupActive || isOpen
                        ? 'bg-forest-700/60 text-gold-400'
                        : 'text-forest-200 hover:text-white hover:bg-forest-700/30'
                    }`}
                  >
                    <Icon className="text-sm" />
                    <span>{group.label}</span>
                    {group.badgeCount > 0 && (
                      <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white shadow animate-pulse">
                        {group.badgeCount}
                      </span>
                    )}
                    <AiOutlineDown
                      className={`text-[10px] transition-transform duration-200 ${
                        isOpen ? 'rotate-180 text-gold-400' : 'opacity-70'
                      }`}
                    />
                  </button>

                  {/* Dropdown Menu Overlay */}
                  {isOpen && (
                    <div className="absolute top-[calc(100%-8px)] left-0 w-72 bg-[#082315] border border-forest-700/70 rounded-xl shadow-2xl py-2 mt-1 z-[100] animate-fadeIn">
                      <div className="px-4 py-1 text-[9px] font-bold uppercase tracking-wider text-forest-400 border-b border-forest-800/80 pb-1.5 mb-1.5">
                        {group.label}
                      </div>
                      <div className="space-y-0.5">
                        {group.items.map((item) => {
                          const ItemIcon = item.icon;
                          const isItemActive = location.pathname === item.to;
                          return (
                            <NavLink
                              key={item.to}
                              to={item.to}
                              className={`flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-forest-800 ${
                                isItemActive
                                  ? 'bg-forest-800 text-gold-400 border-l-2 border-gold-500'
                                  : 'text-forest-200'
                              }`}
                            >
                              <ItemIcon className="text-base mt-0.5 shrink-0" />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-xs font-semibold">{item.label}</span>
                                  {item.badge > 0 && (
                                    <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                                      {item.badge}
                                    </span>
                                  )}
                                </div>
                                {item.desc && (
                                  <p className="text-[10px] text-forest-400 leading-tight mt-0.5 truncate">
                                    {item.desc}
                                  </p>
                                )}
                              </div>
                            </NavLink>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        )}

        {/* Kanan: Profil & Keluar */}
        <div className="hidden md:flex items-center gap-3">
          {isAuthenticated ? (
            <>
              {profile?.full_name && (
                <button
                  onClick={openProfileModal}
                  className="text-right flex items-center gap-2 hover:bg-forest-700/40 p-1.5 rounded-lg transition-colors group text-left"
                  title="Klik untuk Edit Profil / No. HP"
                >
                  <div>
                    <p className="text-xs font-semibold text-white leading-tight group-hover:text-gold-400 transition-colors">{profile.full_name}</p>
                    <p className="text-[10px] text-gold-400 font-medium uppercase tracking-wider">{roleLabel(role)}</p>
                  </div>
                  <AiOutlineEdit className="text-forest-300 group-hover:text-gold-400 transition-colors text-sm" />
                </button>
              )}
              <button
                onClick={() => signOut()}
                className="inline-flex items-center justify-center p-2 rounded-lg text-forest-300 hover:text-white hover:bg-forest-700/40 transition-colors"
                title="Keluar"
              >
                <AiOutlineLogout className="text-lg" />
              </button>
            </>
          ) : null}
        </div>

        {/* Burger Button untuk Mobile */}
        {isAuthenticated && (
          <div className="flex md:hidden items-center gap-2">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="p-2 rounded-lg text-forest-200 hover:text-white hover:bg-forest-750 transition-colors relative"
            >
              <AiOutlineMenu className="text-xl" />
              {(pendingRegCount + pendingPayCount) > 0 && (
                <span className="absolute top-1 right-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-forest-800 animate-ping"></span>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Laci Menu Mobile (100% Solid & Opaque via createPortal di atas segalanya) */}
      {mobileMenuOpen &&
        createPortal(
          <div className="fixed inset-0 z-[99999] flex flex-col w-screen h-screen bg-[#0a2f1d] text-white overflow-hidden md:hidden animate-fadeIn">
            {/* Topbar Mobile Menu */}
            <div className="flex items-center justify-between p-4 border-b border-forest-800 shrink-0 bg-[#0a2f1d]">
              <div className="flex items-center gap-2.5">
                <img src="/logo.png" alt="Logo" className="h-8 w-auto rounded ring-1 ring-gold-500/40" />
                <div>
                  <span className="font-bold text-sm block leading-none">Portal Warga</span>
                  <span className="text-[10px] text-gold-400 font-medium tracking-wider uppercase">Palm Village</span>
                </div>
              </div>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 rounded-lg bg-forest-800 text-white hover:bg-forest-700 transition-colors shadow-sm"
                aria-label="Tutup Menu"
              >
                <AiOutlineClose className="text-xl" />
              </button>
            </div>

            {/* Profil Mobile + Tombol Edit */}
            {profile && (
              <div className="p-4 bg-[#082315] border-b border-forest-800 shrink-0 flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-white">{profile.full_name}</p>
                  <p className="text-xs text-gold-400 mt-0.5">{roleLabel(role)}</p>
                  {profile.phone && <p className="text-[11px] text-forest-300 mt-0.5">📞 {profile.phone}</p>}
                </div>
                <button
                  onClick={openProfileModal}
                  className="flex items-center gap-1.5 bg-forest-800 hover:bg-forest-700 text-gold-400 px-3 py-1.5 rounded-xl text-xs font-semibold border border-forest-700 transition-colors shadow"
                >
                  <AiOutlineEdit /> Edit
                </button>
              </div>
            )}

            {/* Menu List */}
            <div className="flex-1 overflow-y-auto py-4 px-3 space-y-4 bg-[#0a2f1d]">
              {navGroups.map((group) => {
                const Icon = group.icon;
                if (group.to) {
                  return (
                    <NavLink
                      key={group.key}
                      to={group.to}
                      end={group.end}
                      onClick={() => setMobileMenuOpen(false)}
                      className={({ isActive }) =>
                        `flex items-center gap-2.5 px-3.5 py-2.5 text-sm font-semibold rounded-xl transition-all ${
                          isActive ? 'bg-forest-800 text-gold-400 shadow-inner' : 'text-forest-200 hover:bg-forest-800/50'
                        }`
                      }
                    >
                      <Icon className="text-lg" />
                      <span>{group.label}</span>
                    </NavLink>
                  );
                }

                return (
                  <div key={group.key} className="space-y-1">
                    <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-forest-400 flex items-center justify-between">
                      <span>{group.label}</span>
                      {group.badgeCount > 0 && (
                        <span className="bg-red-500 text-white rounded-full px-1.5 py-0.5 text-[9px] font-bold">
                          {group.badgeCount}
                        </span>
                      )}
                    </div>
                    <div className="space-y-1 pl-2 border-l border-forest-800">
                      {group.items.map((item) => {
                        const ItemIcon = item.icon;
                        const isItemActive = location.pathname === item.to;
                        return (
                          <NavLink
                            key={item.to}
                            to={item.to}
                            onClick={() => setMobileMenuOpen(false)}
                            className={`flex items-center gap-3 px-3 py-2.5 text-xs font-medium rounded-xl transition-all ${
                              isItemActive ? 'bg-forest-800 text-gold-400 shadow-inner' : 'text-forest-200 hover:bg-forest-800/30'
                            }`}
                          >
                            <ItemIcon className="text-base shrink-0" />
                            <span className="flex-1">{item.label}</span>
                            {item.badge > 0 && (
                              <span className="bg-red-500 text-white rounded-full px-1 text-[9px] font-bold">
                                {item.badge}
                              </span>
                            )}
                          </NavLink>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Logout Mobile */}
            <div className="p-4 border-t border-forest-800 bg-[#082315] shrink-0">
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  signOut();
                }}
                className="w-full flex items-center justify-center gap-2 py-3 text-sm font-semibold rounded-xl bg-red-900/50 text-red-200 border border-red-800/50 hover:bg-red-800 hover:text-white transition-all shadow-md"
              >
                <AiOutlineLogout className="text-lg" /> Keluar Akun
              </button>
            </div>
          </div>,
          document.body
        )}

      {/* Modal Edit Profil & No. Telp via createPortal */}
      {profileModalOpen &&
        createPortal(
          <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
            <div className="bg-forest-900 border border-forest-700/80 rounded-2xl max-w-md w-full p-6 shadow-2xl text-white">
              <div className="flex items-center justify-between border-b border-forest-800 pb-3 mb-4">
                <h3 className="text-lg font-bold text-gold-400 flex items-center gap-2">
                  <AiOutlineEdit /> Ubah Profil Saya
                </h3>
                <button
                  onClick={() => setProfileModalOpen(false)}
                  className="text-forest-400 hover:text-white p-1 rounded-lg hover:bg-forest-800 transition-colors"
                >
                  <AiOutlineClose className="text-lg" />
                </button>
              </div>

              <form onSubmit={handleProfileSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-forest-300 mb-1 uppercase tracking-wider">
                    Akun Google / Email (JWT Auth)
                  </label>
                  <input
                    type="email"
                    disabled
                    value={profile?.email || ''}
                    className="w-full rounded-xl bg-forest-950 border border-forest-800 px-3 py-2 text-sm text-forest-400 cursor-not-allowed"
                  />
                  <p className="text-[10px] text-forest-400 mt-1">
                    🔒 Email terikat pada verifikasi Google Account / JWT Supabase.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-forest-200 mb-1 uppercase tracking-wider">
                    Nama Lengkap
                  </label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Nama Lengkap Anda"
                    required
                    className="w-full rounded-xl bg-forest-800 border border-forest-700 px-3.5 py-2 text-sm text-white placeholder-forest-400 focus:border-gold-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-forest-200 mb-1 uppercase tracking-wider">
                    Nomor Telepon / WhatsApp
                  </label>
                  <input
                    type="text"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    placeholder="Contoh: 0812-3456-7890"
                    className="w-full rounded-xl bg-forest-800 border border-forest-700 px-3.5 py-2 text-sm text-white placeholder-forest-400 focus:border-gold-500 focus:outline-none"
                  />
                  <p className="text-[11px] text-forest-400 mt-1">
                    💡 Gunakan nomor WhatsApp aktif untuk kemudahan koordinasi IPL.
                  </p>
                </div>

                <div className="pt-2 flex items-center justify-end gap-3 border-t border-forest-800/80 mt-6">
                  <button
                    type="button"
                    onClick={() => setProfileModalOpen(false)}
                    className="px-4 py-2 rounded-xl text-sm font-semibold text-forest-300 hover:text-white hover:bg-forest-800 transition-colors"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl text-sm font-bold bg-gold-500 text-forest-950 hover:bg-gold-400 shadow-lg shadow-gold-500/20 transition-all"
                  >
                    Simpan Perubahan
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}
    </header>
  );
}
