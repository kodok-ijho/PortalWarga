import { useState, useMemo, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import {
  isStaffRole,
  hasMinRole,
  getPendingRegistrations,
  approveRegistration,
  rejectRegistration,
  mockUnits,
  getUnitOccupant,
  roleLabel,
  roleColor,
  formatDate,
  OCCUPANCY_STATUS,
} from '../services/mockData';
import { AiOutlineCheck, AiOutlineClose, AiOutlineUser, AiOutlineClockCircle } from 'react-icons/ai';
import { useToast } from '../hooks/useToast';

export default function UserApproval() {
  const { role, profile } = useAuth();
  const toast = useToast();
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedUser, setSelectedUser] = useState(null);
  const [modalMode, setModalMode] = useState(null); // 'approve' | 'reject'

  // Approval form states
  const [unitId, setUnitId] = useState('');
  const [occupancyStatus, setOccupancyStatus] = useState('owner_occupied');
  const [assignRole, setAssignRole] = useState('warga');
  const [editFullName, setEditFullName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [rejectReason, setRejectReason] = useState('');

  const pendingUsers = useMemo(
    () => getPendingRegistrations(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [refreshKey]
  );

  // Guard: Staff-only (pengurus+)
  if (!isStaffRole(role)) {
    return <Navigate to="/" replace />;
  }

  // Role assignment options tergantung role approver
  const allowedRoles = (() => {
    if (role === 'admin') return ['warga', 'pengurus', 'bendahara'];
    if (role === 'bendahara') return ['warga', 'pengurus'];
    return ['warga']; // pengurus hanya bisa assign warga
  })();

  // Available units (yang belum ditempati)
  const availableUnits = mockUnits.filter((u) => {
    // Jika unit punya occupant, masih bisa ditempati sebagai tenant
    return true; // Semua unit bisa dipilih, karena bisa jadi penyewa
  });

  const openApproveModal = (user) => {
    setSelectedUser(user);
    setModalMode('approve');
    setUnitId('');
    setOccupancyStatus('owner_occupied');
    setAssignRole('warga');
    setEditFullName(user.full_name || '');
    setEditPhone(user.phone || '');
  };

  const openRejectModal = (user) => {
    setSelectedUser(user);
    setModalMode('reject');
    setRejectReason('');
  };

  const closeModal = () => {
    setSelectedUser(null);
    setModalMode(null);
  };

  const handleApprove = () => {
    if (!unitId) {
      toast.error('Silakan pilih nomor rumah terlebih dahulu.');
      return;
    }
    approveRegistration(selectedUser.id, {
      full_name: editFullName,
      phone: editPhone,
      unit_id: Number(unitId),
      occupancy_status: occupancyStatus,
      role: assignRole,
      approved_by: profile.full_name,
    });
    toast.success(`${editFullName || selectedUser.full_name} berhasil disetujui sebagai ${roleLabel(assignRole)}.`);
    closeModal();
    setRefreshKey((k) => k + 1);
  };

  const handleReject = () => {
    if (!rejectReason.trim()) {
      toast.error('Silakan isi alasan penolakan.');
      return;
    }
    rejectRegistration(selectedUser.id, rejectReason, profile.full_name);
    toast.error(`Pendaftaran ${selectedUser.full_name} ditolak.`);
    closeModal();
    setRefreshKey((k) => k + 1);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-forest-900 flex items-center gap-2">
            <AiOutlineUser className="text-gold-600" /> Approval User Baru
          </h1>
          <p className="text-sm text-forest-500 mt-1">
            Verifikasi dan setujui pendaftaran warga baru ke portal
          </p>
        </div>
        {pendingUsers.length > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1.5 text-sm font-semibold text-amber-800">
            <AiOutlineClockCircle />
            {pendingUsers.length} Menunggu
          </span>
        )}
      </div>

      {/* Pending Users List */}
      {pendingUsers.length === 0 ? (
        <div className="pv-card p-12 text-center">
          <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center">
            <AiOutlineCheck className="text-3xl text-emerald-600" />
          </div>
          <h2 className="text-lg font-semibold text-forest-800">Tidak Ada Pendaftaran Baru</h2>
          <p className="text-sm text-forest-500 mt-2">Semua pendaftaran sudah diproses.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pendingUsers.map((user) => (
            <div key={user.id} className="pv-card p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-base flex-shrink-0">
                    {user.full_name.charAt(0)}
                  </div>
                  <div>
                    <h3 className="font-semibold text-forest-900">{user.full_name}</h3>
                    <p className="text-xs text-forest-500 mt-0.5">{user.email}</p>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-forest-400">
                      <span>📱 {user.phone || '-'}</span>
                      <span>📅 Daftar: {formatDate(user.registered_at)}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => openApproveModal(user)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 text-white px-3 py-2 text-xs font-medium hover:bg-emerald-700 transition-colors"
                  >
                    <AiOutlineCheck /> Setujui
                  </button>
                  <button
                    onClick={() => openRejectModal(user)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 text-red-600 border border-red-200 px-3 py-2 text-xs font-medium hover:bg-red-100 transition-colors"
                  >
                    <AiOutlineClose /> Tolak
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Approve Modal */}
      {modalMode === 'approve' && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6">
            <h2 className="text-lg font-bold text-forest-900 mb-1">Setujui Pendaftaran</h2>
            <p className="text-sm text-forest-500 mb-4">
              Verifikasi data <strong>{selectedUser.full_name}</strong> dan tetapkan unit rumah.
            </p>

            <div className="space-y-4">
              {/* Nama Lengkap */}
              <div>
                <label className="block text-sm font-medium text-forest-700 mb-1">Nama Lengkap</label>
                <input
                  type="text"
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                  className="w-full rounded-lg border border-forest-200 bg-white px-3 py-2.5 text-sm text-forest-900 focus:border-gold-500 focus:ring-2 focus:ring-gold-500/20 outline-none"
                />
              </div>

              {/* Nomor HP */}
              <div>
                <label className="block text-sm font-medium text-forest-700 mb-1">Nomor HP / WA</label>
                <input
                  type="text"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="w-full rounded-lg border border-forest-200 bg-white px-3 py-2.5 text-sm text-forest-900 focus:border-gold-500 focus:ring-2 focus:ring-gold-500/20 outline-none"
                />
              </div>

              {/* Nomor Rumah */}
              <div>
                <label className="block text-sm font-medium text-forest-700 mb-1">Nomor Rumah *</label>
                <select
                  value={unitId}
                  onChange={(e) => setUnitId(e.target.value)}
                  className="w-full rounded-lg border border-forest-200 bg-white px-3 py-2.5 text-sm text-forest-900 focus:border-gold-500 focus:ring-2 focus:ring-gold-500/20 outline-none"
                >
                  <option value="">— Pilih Unit —</option>
                  {availableUnits.map((u) => {
                    const occ = getUnitOccupant(u.id);
                    return (
                      <option key={u.id} value={u.id}>
                        Blok {u.block}/{u.unit_number} (Lt.{u.floor}, {u.size}m²)
                        {occ ? ` — ${occ.full_name}` : ' — Kosong'}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Status Hunian */}
              <div>
                <label className="block text-sm font-medium text-forest-700 mb-1">Status Hunian</label>
                <select
                  value={occupancyStatus}
                  onChange={(e) => setOccupancyStatus(e.target.value)}
                  className="w-full rounded-lg border border-forest-200 bg-white px-3 py-2.5 text-sm text-forest-900 focus:border-gold-500 focus:ring-2 focus:ring-gold-500/20 outline-none"
                >
                  {Object.entries(OCCUPANCY_STATUS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>

              {/* Role */}
              <div>
                <label className="block text-sm font-medium text-forest-700 mb-1">Role Akses</label>
                <select
                  value={assignRole}
                  onChange={(e) => setAssignRole(e.target.value)}
                  className="w-full rounded-lg border border-forest-200 bg-white px-3 py-2.5 text-sm text-forest-900 focus:border-gold-500 focus:ring-2 focus:ring-gold-500/20 outline-none"
                >
                  {allowedRoles.map((r) => (
                    <option key={r} value={r}>{roleLabel(r)}</option>
                  ))}
                </select>
                {role === 'pengurus' && (
                  <p className="text-[10px] text-forest-400 mt-1">
                    Sebagai Pengurus, Anda hanya dapat menetapkan role Warga.
                  </p>
                )}
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={handleApprove}
                className="flex-1 pv-btn-primary py-2.5 rounded-lg text-sm"
              >
                ✅ Setujui & Aktifkan
              </button>
              <button
                onClick={closeModal}
                className="pv-btn-ghost py-2.5 px-4 rounded-lg text-sm"
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {modalMode === 'reject' && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6">
            <h2 className="text-lg font-bold text-red-700 mb-1">Tolak Pendaftaran</h2>
            <p className="text-sm text-forest-500 mb-4">
              Tolak pendaftaran <strong>{selectedUser.full_name}</strong> ({selectedUser.email}).
            </p>

            <div>
              <label className="block text-sm font-medium text-forest-700 mb-1">Alasan Penolakan *</label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-forest-200 bg-white px-3 py-2.5 text-sm text-forest-900 placeholder:text-forest-400 focus:border-red-400 focus:ring-2 focus:ring-red-400/20 outline-none"
                placeholder="Contoh: Data tidak valid, bukan penghuni..."
              />
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={handleReject}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-red-600 text-white py-2.5 text-sm font-medium hover:bg-red-700 transition-colors"
              >
                ❌ Tolak Pendaftaran
              </button>
              <button
                onClick={closeModal}
                className="pv-btn-ghost py-2.5 px-4 rounded-lg text-sm"
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
