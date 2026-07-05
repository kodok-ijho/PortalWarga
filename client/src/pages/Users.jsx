import { useState, useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import Modal from '../components/Modal';
import {
  getUserList,
  addMockUser,
  updateMockUser,
  deactivateMockUser,
  mockUnits,
  roleLabel,
  roleColor,
  isStaffRole,
} from '../services/mockData';
import { AiOutlinePlus, AiOutlineEdit, AiOutlineUserDelete } from 'react-icons/ai';

export default function Users() {
  const { role } = useAuth();
  const toast = useToast();

  const [users, setUsers] = useState(() => getUserList());
  const [modalOpen, setModalOpen] = useState(null); // null | 'add' | 'edit'
  const [selectedUser, setSelectedUser] = useState(null); // profile obj to edit

  // Form states
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [userRole, setUserRole] = useState('warga');
  const [unitId, setUnitId] = useState('');
  const [occupancyStatus, setOccupancyStatus] = useState('owner_occupied');
  const [isActive, setIsActive] = useState(true);

  // Search/Filter states
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('');

  // Filtered users
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchSearch =
        u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
        u.email?.toLowerCase().includes(search.toLowerCase()) ||
        u.phone?.includes(search);
      const matchRole = filterRole ? u.role === filterRole : true;
      return matchSearch && matchRole;
    });
  }, [users, search, filterRole]);

  // Guard: Staff-only (pengurus, bendahara, admin)
  if (!isStaffRole(role)) {
    return <Navigate to="/" replace />;
  }

  // Handle open add modal
  const openAddModal = () => {
    setFullName('');
    setEmail('');
    setPhone('');
    setUserRole('warga');
    setUnitId('');
    setOccupancyStatus('owner_occupied');
    setModalOpen('add');
  };

  // Handle open edit modal
  const openEditModal = (user) => {
    setSelectedUser(user);
    setFullName(user.full_name || '');
    setEmail(user.email || '');
    setPhone(user.phone || '');
    setUserRole(user.role || 'warga');
    setUnitId(user.unit_id ? String(user.unit_id) : '');
    setOccupancyStatus(user.occupancy_status || 'owner_occupied');
    setIsActive(user.is_active !== false);
    setModalOpen('edit');
  };

  // Submit Add User
  const handleAddSubmit = (e) => {
    e.preventDefault();
    if (!fullName || !email) {
      toast.error('Nama dan Email wajib diisi.');
      return;
    }
    if (!email.endsWith('@gmail.com')) {
      toast.error('Email wajib menggunakan akun Gmail (@gmail.com).');
      return;
    }
    // Cek duplikat email
    if (users.some((u) => u.email?.toLowerCase() === email.toLowerCase())) {
      toast.error('Email sudah terdaftar.');
      return;
    }

    const newUser = addMockUser({
      full_name: fullName,
      email,
      phone,
      role: userRole,
      unit_id: unitId ? Number(unitId) : null,
      occupancy_status: unitId ? occupancyStatus : null,
    });

    setUsers(getUserList());
    setModalOpen(null);
    toast.success(`User ${fullName} berhasil ditambahkan!`);
  };

  // Submit Edit User
  const handleEditSubmit = (e) => {
    e.preventDefault();
    if (!fullName) {
      toast.error('Nama wajib diisi.');
      return;
    }

    updateMockUser(selectedUser.id, {
      full_name: fullName,
      phone,
      role: userRole,
      unit_id: unitId ? Number(unitId) : null,
      occupancy_status: unitId ? occupancyStatus : null,
      is_active: isActive,
    });

    setUsers(getUserList());
    setModalOpen(null);
    toast.success(`User ${fullName} berhasil diperbarui!`);
  };

  // Deactivate User
  const handleDeactivate = (user) => {
    if (window.confirm(`Apakah Anda yakin ingin menonaktifkan akun ${user.full_name}?`)) {
      deactivateMockUser(user.id);
      setUsers(getUserList());
      toast.success(`Akun ${user.full_name} berhasil dinonaktifkan.`);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-forest-900">Kelola Pengguna (User Management)</h2>
          <p className="text-sm text-forest-500">
            {filteredUsers.length} pengguna terdaftar
          </p>
        </div>
        <button onClick={openAddModal} className="pv-btn-primary text-xs flex items-center gap-1">
          <AiOutlinePlus /> Tambah User
        </button>
      </div>

      {/* Filter */}
      <div className="pv-card p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input
            type="text"
            placeholder="Cari nama, email, no. telp..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pv-input text-sm"
          />
          <select
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
            className="pv-input text-sm"
          >
            <option value="">Semua Role</option>
            <option value="admin">Admin</option>
            <option value="bendahara">Bendahara</option>
            <option value="pengurus">Pengurus</option>
            <option value="warga">Warga</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="pv-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-forest-100 bg-forest-50/50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-forest-600 uppercase">Nama / No. Telp</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-forest-600 uppercase">Email (Gmail)</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-forest-600 uppercase">Role</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-forest-600 uppercase">Unit</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-forest-600 uppercase">Status</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-forest-600 uppercase">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-forest-100">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-forest-400">
                    Tidak ditemukan pengguna yang cocok dengan kriteria.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-forest-50/50">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="font-semibold text-forest-900">{u.full_name}</p>
                      <p className="text-[11px] text-forest-500">{u.phone || '—'}</p>
                    </td>
                    <td className="px-4 py-3 text-forest-700 font-mono text-xs">{u.email || '—'}</td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      <span className={`pv-badge text-[10px] py-0.5 px-2 ${roleColor(u.role)}`}>
                        {roleLabel(u.role)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-forest-800 font-medium whitespace-nowrap">
                      {(() => {
                        const unit = mockUnits.find((un) => un.id === u.unit_id);
                        return unit ? `Blok ${unit.block}/${unit.unit_number}` : '—';
                      })()}
                    </td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        u.is_active !== false 
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                          : 'bg-red-50 text-red-700 border border-red-200'
                      }`}>
                        {u.is_active !== false ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      <div className="flex justify-center items-center gap-1.5">
                        <button
                          onClick={() => openEditModal(u)}
                          className="p-1.5 text-forest-500 hover:text-forest-800 hover:bg-forest-50 rounded-lg transition-colors"
                          title="Edit User"
                        >
                          <AiOutlineEdit className="text-base" />
                        </button>
                        {u.is_active !== false && u.role !== 'admin' && (
                          <button
                            onClick={() => handleDeactivate(u)}
                            className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Nonaktifkan User"
                          >
                            <AiOutlineUserDelete className="text-base" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add User Modal */}
      {modalOpen === 'add' && (
        <Modal open onClose={() => setModalOpen(null)} title="Tambah Pengguna Baru" size="md">
          <form onSubmit={handleAddSubmit} className="space-y-4 text-sm">
            <div>
              <label className="block text-sm font-medium text-forest-700 mb-1">Nama Lengkap</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                className="pv-input"
                placeholder="Mis. Fajar Setiawan"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-forest-700 mb-1">Email (Gmail)</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="pv-input"
                placeholder="warga@gmail.com"
              />
              <p className="text-[10px] text-forest-400 mt-0.5">Wajib menggunakan email @gmail.com</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-forest-700 mb-1">No. Telp (WhatsApp)</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="pv-input"
                placeholder="0812-xxxx-xxxx"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-forest-700 mb-1">Role Akses</label>
              <select value={userRole} onChange={(e) => setUserRole(e.target.value)} className="pv-input">
                <option value="warga">Warga</option>
                {(role === 'bendahara' || role === 'admin') && <option value="pengurus">Pengurus</option>}
                {role === 'admin' && <option value="bendahara">Bendahara</option>}
                {role === 'admin' && <option value="admin">Admin</option>}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-forest-700 mb-1">Penugasan Unit (Opsional)</label>
              <select value={unitId} onChange={(e) => setUnitId(e.target.value)} className="pv-input">
                <option value="">— Tidak ada unit —</option>
                {mockUnits.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    Blok {unit.block}/{unit.unit_number} ({unit.is_occupied ? 'Berpenghuni' : 'Kosong'})
                  </option>
                ))}
              </select>
            </div>
            {unitId && (
              <div>
                <label className="block text-sm font-medium text-forest-700 mb-1">Status Kepemilikan Unit</label>
                <select value={occupancyStatus} onChange={(e) => setOccupancyStatus(e.target.value)} className="pv-input">
                  <option value="owner_occupied">Milik Sendiri (Ditempati)</option>
                  <option value="owner_vacant">Milik Sendiri (Kosong)</option>
                  <option value="owner_rented">Milik Sendiri (Dikontrakkan)</option>
                  <option value="tenant">Penyewa / Kontrak</option>
                </select>
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <button type="button" onClick={() => setModalOpen(null)} className="pv-btn-ghost flex-1">Batal</button>
              <button type="submit" className="pv-btn-primary flex-1">Tambah User</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Edit User Modal */}
      {modalOpen === 'edit' && (
        <Modal open onClose={() => setModalOpen(null)} title="Ubah Detail Pengguna" size="md">
          <form onSubmit={handleEditSubmit} className="space-y-4 text-sm">
            <div>
              <label className="block text-sm font-medium text-forest-700 mb-1">Nama Lengkap</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                className="pv-input"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-forest-700 mb-1">Email (Gmail)</label>
              <input
                type="email"
                value={email}
                disabled
                className="pv-input bg-forest-50/60 cursor-not-allowed"
              />
              <p className="text-[10px] text-forest-400 mt-0.5">Email tidak dapat diubah setelah pendaftaran.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-forest-700 mb-1">No. Telp (WhatsApp)</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="pv-input"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-forest-700 mb-1">Role Akses</label>
              <select value={userRole} onChange={(e) => setUserRole(e.target.value)} className="pv-input">
                <option value="warga">Warga</option>
                {(role === 'bendahara' || role === 'admin') && <option value="pengurus">Pengurus</option>}
                {role === 'admin' && <option value="bendahara">Bendahara</option>}
                {role === 'admin' && <option value="admin">Admin</option>}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-forest-700 mb-1">Penugasan Unit</label>
              <select value={unitId} onChange={(e) => setUnitId(e.target.value)} className="pv-input">
                <option value="">— Tidak ada unit —</option>
                {mockUnits.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    Blok {unit.block}/{unit.unit_number}
                  </option>
                ))}
              </select>
            </div>
            {unitId && (
              <div>
                <label className="block text-sm font-medium text-forest-700 mb-1">Status Kepemilikan Unit</label>
                <select value={occupancyStatus} onChange={(e) => setOccupancyStatus(e.target.value)} className="pv-input">
                  <option value="owner_occupied">Milik Sendiri (Ditempati)</option>
                  <option value="owner_vacant">Milik Sendiri (Kosong)</option>
                  <option value="owner_rented">Milik Sendiri (Dikontrakkan)</option>
                  <option value="tenant">Penyewa / Kontrak</option>
                </select>
              </div>
            )}
            <div className="flex items-center justify-between p-3 rounded-lg border border-forest-100 bg-forest-50/20">
              <div>
                <p className="text-sm font-semibold text-forest-800">Status Akun</p>
                <p className="text-[10px] text-forest-500">Aktifkan atau nonaktifkan akses masuk warga</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-forest-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gold-500"></div>
              </label>
            </div>
            <div className="flex gap-2 pt-2">
              <button type="button" onClick={() => setModalOpen(null)} className="pv-btn-ghost flex-1">Batal</button>
              <button type="submit" className="pv-btn-primary flex-1">Simpan Perubahan</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
