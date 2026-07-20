import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  AiOutlinePlus,
  AiOutlineEdit,
  AiOutlineDelete,
  AiOutlineUpload,
  AiOutlineDownload,
  AiOutlineUserAdd,
} from 'react-icons/ai';
import Papa from 'papaparse';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import Modal from '../components/Modal';
import {
  fetchResidents,
  createResident,
  updateResident,
  deleteResident,
  importResidentsCSV,
  fetchUnits,
} from '../services/dataService';
import {
  roleLabel,
  roleColor,
  occupancyStatusLabel,
  occupancyStatusColor,
  OCCUPANCY_STATUS,
  isStaffRole,
} from '../services/dataHelpers';

export default function Residents() {
  const { role, session } = useAuth();
  const token = session?.access_token;
  const toast = useToast();
  const isStaff = isStaffRole(role);

  // Data states
  const [profiles, setProfiles] = useState([]);
  const [units, setUnits] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // State filter & search
  const [search, setSearch] = useState('');
  const [filterBlock, setFilterBlock] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterOccupancy, setFilterOccupancy] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  // State untuk CRUD & upload
  const [modalAddEdit, setModalAddEdit] = useState(null); // null | 'add' | profile obj
  const [modalUpload, setModalUpload] = useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    
    const fetchResPromise = fetchResidents(token)
      .then((res) => {
        setProfiles(res);
        setIsLoading(false);
      });
      
    const fetchUnitsPromise = fetchUnits(token)
      .then((res) => {
        setUnits(res);
      });

    try {
      await Promise.all([fetchResPromise, fetchUnitsPromise]);
    } catch (err) {
      toast.error('Gagal memuat data warga/unit.');
      console.error(err);
      setIsLoading(false);
    }
  }, [token, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const getUnitById = useCallback((id) => {
    if (!id) return null;
    return units.find((u) => u.id === Number(id));
  }, [units]);

  const getUnitOwner = useCallback((unitId) => {
    if (!unitId) return null;
    const unit = units.find((u) => u.id === Number(unitId));
    if (!unit) return null;
    if (unit.owner_id) {
      const p = profiles.find((p) => p.id === unit.owner_id);
      if (p) return p;
    }
    return profiles.find(
      (p) => p.unit_id === Number(unitId) && p.occupancy_status && p.occupancy_status.startsWith('owner_')
    ) || null;
  }, [units, profiles]);

  const blocks = useMemo(() => [...new Set(units.map((u) => u.block))].sort(), [units]);

  const filtered = useMemo(() => {
    return profiles.filter((p) => {
      if (search) {
        const q = search.toLowerCase();
        const unit = getUnitById(p.unit_id);
        const unitLabel = unit ? `${unit.block}${unit.unit_number}` : '';
        if (
          !p.full_name.toLowerCase().includes(q) &&
          !(p.email || '').toLowerCase().includes(q) &&
          !(p.phone || '').includes(q) &&
          !unitLabel.toLowerCase().includes(q)
        )
          return false;
      }
      if (filterBlock) {
        const unit = getUnitById(p.unit_id);
        if (!unit || unit.block !== filterBlock) return false;
      }
      if (filterStatus === 'active' && !p.is_active) return false;
      if (filterStatus === 'inactive' && p.is_active) return false;
      if (filterOccupancy && p.occupancy_status !== filterOccupancy) return false;
      return true;
    });
  }, [profiles, search, filterBlock, filterStatus, filterOccupancy, getUnitById]);

  const selected = selectedId ? profiles.find((p) => p.id === selectedId) : null;

  // ── Handlers ──────────────────────────────────────────
  const handleSaveProfile = async (data) => {
    setIsSaving(true);
    try {
      if (modalAddEdit === 'add') {
        const payload = {
          ...data,
          unit_id: data.unit_id ? Number(data.unit_id) : null,
          is_active: data.is_active ?? true,
        };
        await createResident(token, payload);
        toast.success(`Warga "${data.full_name}" berhasil ditambahkan.`);
      } else {
        // edit
        const payload = {
          ...data,
          unit_id: data.unit_id ? Number(data.unit_id) : null,
        };
        await updateResident(token, data.id, payload);
        toast.success(`Data warga "${data.full_name}" berhasil diperbarui.`);
      }
      await loadData();
      setModalAddEdit(null);
    } catch (err) {
      toast.error('Gagal menyimpan data warga.');
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  // Helper: cari unit berdasarkan blok+nomor (dipakai export/import CSV)
  const findUnit = (block, unitNumber) =>
    units.find(
      (u) => u.block === String(block).toUpperCase() && u.unit_number === String(unitNumber)
    );

  const handleDelete = async (profile) => {
    if (!confirm(`Hapus warga "${profile.full_name}"? Tindakan ini tidak dapat dibatalkan.`)) return;
    setIsSaving(true);
    try {
      await deleteResident(token, profile.id);
      toast.success(`Warga "${profile.full_name}" berhasil dihapus.`);
      setSelectedId(null);
      await loadData();
    } catch (err) {
      toast.error('Gagal menghapus data warga.');
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportCSV = () => {
    const header = ['Nama', 'Email', 'Telepon', 'Blok', 'Unit', 'Status', 'Status Tinggal', 'Pemilik', 'Role'];
    const rows = filtered.map((p) => {
      const unit = getUnitById(p.unit_id);
      // Pemilik unit: kalau profil ini BUKAN owner, tampilkan nama pemilik
      const owner =
        p.occupancy_status === 'tenant' ? getUnitOwner(p.unit_id) : null;
      return [
        p.full_name,
        p.email || '',
        p.phone || '',
        unit?.block || '',
        unit?.unit_number || '',
        p.is_active ? 'Aktif' : 'Tidak Aktif',
        occupancyStatusLabel(p.occupancy_status),
        owner?.full_name || '',
        roleLabel(p.role),
      ];
    });
    const csv = Papa.unparse([header, ...rows]);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `daftar_penghuni_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV berhasil di-export.');
  };

  const handleImportCSV = async (parsedRows, mode) => {
    // Reverse map label → key untuk occupancy_status
    const labelToStatusKey = Object.fromEntries(
      Object.entries(OCCUPANCY_STATUS).map(([k, v]) => [v.toLowerCase(), k])
    );
    const resolveStatus = (raw) => {
      if (!raw) return null;
      const v = String(raw).toLowerCase().trim();
      // Cocokkan exact label dulu, lalu partial keyword
      if (labelToStatusKey[v]) return labelToStatusKey[v];
      if (v.includes('kontrak') && !v.includes('dikontrakkan')) return 'tenant';
      if (v.includes('dikontrakkan')) return 'owner_rented';
      if (v.includes('dihuni')) return 'owner_occupied';
      if (v.includes('tidak dihuni') || v.includes('kosong')) return 'owner_vacant';
      return null;
    };

    // Validasi & mapping
    const mapped = parsedRows
      .filter((r) => r.Nama || r.full_name || r[0])
      .map((r) => {
        // Support header dalam berbagai format
        const name = r.Nama || r.full_name || r.nama || Object.values(r)[0];
        const email = r.Email || r.email || '';
        const phone = r.Telepon || r.phone || r.telepon || '';
        const block = (r.Blok || r.block || '').toString().toUpperCase();
        const unitNumber = (r.Unit || r.unit_number || '').toString();
        const roleVal = (r.Role || r.role || 'warga').toString().toLowerCase();
        const isActiveRaw = (r.Status || r.status || 'Aktif').toString().toLowerCase();
        const occupancyRaw = r['Status Tinggal'] || r.occupancy_status || '';

        // Cari unit_id
        const unit = block && unitNumber ? findUnit(block, unitNumber) : null;
        const unit_id = unit?.id || null;

        return {
          full_name: name,
          email: email,
          phone: phone,
          unit_id,
          role: ['admin', 'bendahara', 'pengurus', 'warga'].includes(roleVal) ? roleVal : 'warga',
          is_active: isActiveRaw.includes('aktif') || isActiveRaw === 'true',
          occupancy_status: resolveStatus(occupancyRaw),
        };
      })
      .filter((p) => p.full_name);

    if (mapped.length === 0) {
      toast.error('Tidak ada data valid pada CSV.');
      return;
    }

    setIsSaving(true);
    try {
      await importResidentsCSV(token, mapped, mode);
      toast.success(`${mapped.length} warga berhasil di-import (mode: ${mode === 'delete-insert' ? 'Delete & Insert' : 'Upsert'}).`);
      await loadData();
    } catch (err) {
      toast.error('Gagal mengimpor data warga.');
      console.error(err);
    } finally {
      setIsSaving(false);
      setModalUpload(false);
    }
  };

  // ── Render ────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-forest-900">Daftar Penghuni</h2>
          <p className="text-sm text-forest-500">{filtered.length} dari {profiles.length} penghuni</p>
        </div>
        <div className="flex gap-2">
          {isStaff && (
            <>
              <button onClick={() => setModalUpload(true)} className="pv-btn-ghost text-xs">
                <AiOutlineUpload /> Upload CSV
              </button>
              <button onClick={() => setModalAddEdit('add')} className="pv-btn-primary text-xs">
                <AiOutlinePlus /> Tambah Warga
              </button>
            </>
          )}
          <button onClick={handleExportCSV} className="pv-btn-ghost text-xs">
            <AiOutlineDownload /> Export
          </button>
        </div>
      </div>

      {/* Search & filters */}
      <div className="pv-card p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-forest-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              type="text"
              placeholder="Cari nama, email, telepon..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-forest-200 bg-white pl-9 pr-3 py-2.5 text-sm text-forest-900 placeholder:text-forest-400 focus:border-gold-500 focus:ring-2 focus:ring-gold-500/20 outline-none"
            />
          </div>
          <select
            value={filterBlock}
            onChange={(e) => setFilterBlock(e.target.value)}
            className="rounded-lg border border-forest-200 bg-white px-3 py-2.5 text-sm text-forest-700 focus:border-gold-500 outline-none"
          >
            <option value="">Semua Blok</option>
            {blocks.map((b) => <option key={b} value={b}>Blok {b}</option>)}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-lg border border-forest-200 bg-white px-3 py-2.5 text-sm text-forest-700 focus:border-gold-500 outline-none"
          >
            <option value="">Semua Status</option>
            <option value="active">Aktif</option>
            <option value="inactive">Tidak Aktif</option>
          </select>
          <select
            value={filterOccupancy}
            onChange={(e) => setFilterOccupancy(e.target.value)}
            className="rounded-lg border border-forest-200 bg-white px-3 py-2.5 text-sm text-forest-700 focus:border-gold-500 outline-none"
          >
            <option value="">Semua Status Tinggal</option>
            {Object.entries(OCCUPANCY_STATUS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Tabel */}
      <div className="pv-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-forest-100 bg-forest-800 text-left">
                <th className="px-4 py-3 text-xs font-semibold text-gold-400 uppercase tracking-wide">Nama</th>
                <th className="px-4 py-3 text-xs font-semibold text-gold-400 uppercase tracking-wide">Unit</th>
                <th className="px-4 py-3 text-xs font-semibold text-gold-400 uppercase tracking-wide hidden sm:table-cell">Telepon</th>
                <th className="px-4 py-3 text-xs font-semibold text-gold-400 uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 text-xs font-semibold text-gold-400 uppercase tracking-wide hidden lg:table-cell">Status Tinggal</th>
                <th className="px-4 py-3 text-xs font-semibold text-gold-400 uppercase tracking-wide hidden lg:table-cell">Pemilik</th>
                <th className="px-4 py-3 text-xs font-semibold text-gold-400 uppercase tracking-wide hidden md:table-cell">Role</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-forest-100">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center">
                    <div className="flex justify-center items-center gap-2 text-forest-500 text-sm">
                      <svg className="animate-spin h-5 w-5 text-gold-500" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Memuat data penghuni...
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-forest-400">
                    Tidak ada penghuni yang cocok.
                  </td>
                </tr>
              ) : (
                filtered.map((p) => {
                  const unit = getUnitById(p.unit_id);
                  return (
                    <tr
                       key={p.id}
                       onClick={() => setSelectedId(p.id)}
                       className="hover:bg-forest-50 cursor-pointer transition-colors"
                     >
                       <td className="px-4 py-3">
                         <div className="flex items-center gap-2.5">
                           <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-forest-100 text-forest-700 font-semibold text-xs">
                             {p.full_name.charAt(0)}
                           </span>
                           <div className="min-w-0">
                             <p className="font-medium text-forest-900 truncate">{p.full_name}</p>
                             <p className="text-[11px] text-forest-400 truncate">{p.email}</p>
                           </div>
                         </div>
                       </td>
                       <td className="px-4 py-3 text-forest-700">
                         {unit ? `${unit.block}/${unit.unit_number}` : '—'}
                       </td>
                       <td className="px-4 py-3 text-forest-500 hidden sm:table-cell">{p.phone || '—'}</td>
                       <td className="px-4 py-3">
                         <span className={`pv-badge ${p.is_active ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-gray-100 text-gray-500 border border-gray-200'}`}>
                           {p.is_active ? 'Aktif' : 'Non-aktif'}
                         </span>
                       </td>
                       <td className="px-4 py-3 hidden lg:table-cell">
                         {p.occupancy_status ? (
                           <span className={`pv-badge ${occupancyStatusColor(p.occupancy_status)}`}>
                             {occupancyStatusLabel(p.occupancy_status)}
                           </span>
                         ) : (
                           <span className="text-forest-400 text-xs">—</span>
                         )}
                       </td>
                       <td className="px-4 py-3 hidden lg:table-cell text-forest-700 text-xs">
                         {(() => {
                           if (!unit) return '—';
                           if (p.occupancy_status === 'tenant') {
                             const owner = getUnitOwner(p.unit_id);
                             return owner ? owner.full_name : '—';
                           }
                           if (p.occupancy_status && p.occupancy_status.startsWith('owner_')) {
                             return <span className="text-emerald-600 font-medium">Diri sendiri</span>;
                           }
                           return '—';
                           })()}
                       </td>
                       <td className="px-4 py-3 hidden md:table-cell">
                         <span className={`pv-badge ${roleColor(p.role)}`}>{roleLabel(p.role)}</span>
                       </td>
                     </tr>
                   );
                 })
               )}
             </tbody>
           </table>
         </div>
       </div>
 
       {/* Modal detail */}
       {selected && (
         <DetailModal
           profile={selected}
           isStaff={isStaff}
           getUnitById={getUnitById}
           getUnitOwner={getUnitOwner}
           onClose={() => setSelectedId(null)}
           onEdit={() => {
             setModalAddEdit(selected);
             setSelectedId(null);
           }}
           onDelete={() => handleDelete(selected)}
         />
       )}
 
       {/* Modal add/edit */}
       {modalAddEdit && (
         <ProfileFormModal
           profile={modalAddEdit === 'add' ? null : modalAddEdit}
           onSave={handleSaveProfile}
           onClose={() => setModalAddEdit(null)}
           isSaving={isSaving}
           units={units}
         />
       )}
 
       {/* Modal upload CSV */}
       {modalUpload && (
         <UploadCSVModal
           onImport={handleImportCSV}
           onClose={() => setModalUpload(false)}
           isSaving={isSaving}
         />
       )}
     </div>
   );
 }
 
 // ── Sub-komponen ──────────────────────────────────────────────────
 
 function DetailModal({ profile, isStaff, getUnitById, getUnitOwner, onClose, onEdit, onDelete }) {
   const unit = getUnitById(profile.unit_id);
  const owner = profile.occupancy_status === 'tenant' ? getUnitOwner(profile.unit_id) : null;
  return (
    <Modal open onClose={onClose} title="Detail Penghuni">
      {/* Avatar */}
      <div className="flex items-center gap-4 mb-6">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-forest-800 text-gold-400 font-bold text-xl">
          {profile.full_name.charAt(0)}
        </span>
        <div>
          <h3 className="font-bold text-forest-900">{profile.full_name}</h3>
          <p className="text-xs text-forest-500">{profile.email}</p>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <span className={`pv-badge ${roleColor(profile.role)}`}>{roleLabel(profile.role)}</span>
            {profile.occupancy_status && (
              <span className={`pv-badge ${occupancyStatusColor(profile.occupancy_status)}`}>
                {occupancyStatusLabel(profile.occupancy_status)}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="space-y-3 text-sm">
        <Row label="Telepon" value={profile.phone || '—'} />
        <Row label="Unit" value={unit ? `Blok ${unit.block} / ${unit.unit_number} (Lt. ${unit.floor || '-'}, ${unit.size}m²)` : 'Tidak ada unit'} />
        <Row label="Status" value={profile.is_active ? 'Aktif' : 'Non-aktif'} />
        {profile.occupancy_status && (
          <Row label="Status Tinggal" value={occupancyStatusLabel(profile.occupancy_status)} />
        )}
        {owner && (
          <Row label="Pemilik Unit" value={owner.full_name} />
        )}
      </div>
      {isStaff && (
        <div className="mt-6 pt-4 border-t border-forest-100 flex gap-2">
          <button onClick={onEdit} className="pv-btn-ghost flex-1 text-xs">
            <AiOutlineEdit /> Edit
          </button>
          <button onClick={onDelete} className="pv-btn-danger flex-1 text-xs">
            <AiOutlineDelete /> Hapus
          </button>
        </div>
      )}
    </Modal>
  );
}

function ProfileFormModal({ profile, onSave, onClose, isSaving, units }) {
  const isEdit = !!profile;
  const [form, setForm] = useState({
    full_name: profile?.full_name || '',
    email: profile?.email || '',
    phone: profile?.phone || '',
    unit_id: profile?.unit_id || '',
    role: profile?.role || 'warga',
    is_active: profile?.is_active ?? true,
    occupancy_status: profile?.occupancy_status || '',
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.full_name.trim()) return;
    onSave({
      ...(profile ? { id: profile.id } : {}),
      full_name: form.full_name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      unit_id: form.unit_id ? Number(form.unit_id) : null,
      role: form.role,
      is_active: form.is_active,
      occupancy_status: form.occupancy_status || null,
    });
  };

  return (
    <Modal open onClose={onClose} title={isEdit ? 'Edit Warga' : 'Tambah Warga'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <fieldset disabled={isSaving} className="space-y-4 border-none p-0 m-0">
          <Field label="Nama Lengkap" required>
            <input
              type="text"
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              required
              className="pv-input"
              placeholder="Nama lengkap"
            />
          </Field>
          <Field label="Email">
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="pv-input"
              placeholder="email@contoh.com"
            />
          </Field>
          <Field label="Telepon">
            <input
              type="text"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="pv-input"
              placeholder="08xx-xxxx-xxxx"
            />
          </Field>
          <Field label="Unit">
            <select
              value={form.unit_id}
              onChange={(e) => setForm({ ...form, unit_id: e.target.value })}
              className="pv-input"
            >
              <option value="">— Tidak ada unit —</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  Blok {u.block} / {u.unit_number}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Status Tinggal">
            <select
              value={form.occupancy_status}
              onChange={(e) => setForm({ ...form, occupancy_status: e.target.value })}
              className="pv-input"
            >
              <option value="">— Tidak ada —</option>
              {Object.entries(OCCUPANCY_STATUS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Role">
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="pv-input"
              >
                <option value="warga">Warga</option>
                <option value="pengurus">Pengurus</option>
                <option value="bendahara">Bendahara</option>
                <option value="admin">Admin</option>
              </select>
            </Field>
            <Field label="Status">
              <select
                value={form.is_active ? 'active' : 'inactive'}
                onChange={(e) => setForm({ ...form, is_active: e.target.value === 'active' })}
                className="pv-input"
              >
                <option value="active">Aktif</option>
                <option value="inactive">Non-aktif</option>
              </select>
            </Field>
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} disabled={isSaving} className="pv-btn-ghost flex-1 text-sm">Batal</button>
            <button type="submit" disabled={isSaving} className="pv-btn-primary flex-1 text-sm flex items-center justify-center gap-2">
              {isSaving && (
                <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              )}
              {isSaving ? 'Menyimpan...' : isEdit ? 'Simpan Perubahan' : 'Tambah'}
            </button>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}

function UploadCSVModal({ onImport, onClose, isSaving }) {
  const [step, setStep] = useState(1); // 1=upload, 2=preview
  const [parsedRows, setParsedRows] = useState([]);
  const [mode, setMode] = useState('upsert');
  const [fileName, setFileName] = useState('');

  const handleFile = (file) => {
    if (!file) return;
    setFileName(file.name);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        setParsedRows(results.data);
        setStep(2);
      },
      error: () => alert('Gagal membaca CSV. Pastikan format benar.'),
    });
  };

  const downloadTemplate = () => {
    const csv = Papa.unparse({
      fields: ['Nama', 'Email', 'Telepon', 'Blok', 'Unit', 'Status', 'Role'],
      data: [['Contoh Warga', 'contoh@email.com', '08123456789', 'A', '01', 'Aktif', 'warga']],
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'template_warga.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Modal open onClose={onClose} title="Upload Data Warga (CSV)" size="lg">
      {step === 1 && (
        <div className="space-y-4">
          <p className="text-sm text-forest-600">
            Upload file CSV berisi data warga. Format kolom: <strong>Nama, Email, Telepon, Blok, Unit, Status, Role</strong>.
          </p>

          <button onClick={downloadTemplate} disabled={isSaving} className="pv-btn-ghost text-xs">
            <AiOutlineDownload /> Download Template CSV
          </button>

          {/* Drop zone */}
          <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-forest-200 rounded-xl py-10 cursor-pointer hover:border-gold-400 hover:bg-forest-50 transition-colors">
            <AiOutlineUpload size={32} className="text-forest-400" />
            <span className="text-sm text-forest-600">
              {fileName ? fileName : 'Klik untuk pilih file CSV'}
            </span>
            <input
              type="file"
              accept=".csv"
              className="hidden"
              disabled={isSaving}
              onChange={(e) => handleFile(e.target.files[0])}
            />
          </label>

          {/* Mode */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-forest-700">Mode Import</p>
            <label className="flex items-start gap-2 p-3 rounded-lg border border-forest-200 cursor-pointer hover:bg-forest-50">
              <input
                type="radio"
                checked={mode === 'upsert'}
                disabled={isSaving}
                onChange={() => setMode('upsert')}
                className="mt-1 accent-gold-500"
              />
              <div>
                <p className="text-sm font-medium text-forest-800">Upsert (Update & Insert)</p>
                <p className="text-[11px] text-forest-500">Update warga yang sudah ada (match email), tambah yang baru. Data lama dipertahankan.</p>
              </div>
            </label>
            <label className="flex items-start gap-2 p-3 rounded-lg border border-forest-200 cursor-pointer hover:bg-forest-50">
              <input
                type="radio"
                checked={mode === 'delete-insert'}
                disabled={isSaving}
                onChange={() => setMode('delete-insert')}
                className="mt-1 accent-gold-500"
              />
              <div>
                <p className="text-sm font-medium text-forest-800">Delete & Insert</p>
                <p className="text-[11px] text-forest-500">Hapus SEMUA warga, ganti dengan data CSV. Admin & Pengurus RT/RW dipertahankan.</p>
              </div>
            </label>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-forest-700">
              <strong>{parsedRows.length}</strong> baris terbaca dari <strong>{fileName}</strong>
            </p>
            <span className="pv-badge bg-forest-100 text-forest-700">
              Mode: {mode === 'upsert' ? 'Upsert' : 'Delete & Insert'}
            </span>
          </div>

          {/* Preview table */}
          <div className="border border-forest-100 rounded-lg overflow-hidden max-h-60 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-forest-50 sticky top-0">
                <tr>
                  {Object.keys(parsedRows[0] || {}).map((h) => (
                    <th key={h} className="px-3 py-2 text-left font-semibold text-forest-700">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parsedRows.slice(0, 50).map((row, i) => (
                  <tr key={i} className="border-t border-forest-50">
                    {Object.values(row).map((v, j) => (
                      <td key={j} className="px-3 py-1.5 text-forest-600">{v}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {parsedRows.length > 50 && (
              <p className="text-center text-[11px] text-forest-400 py-2">
                ...dan {parsedRows.length - 50} baris lainnya
              </p>
            )}
          </div>

          <div className="flex gap-2">
            <button onClick={() => setStep(1)} disabled={isSaving} className="pv-btn-ghost flex-1 text-sm">← Kembali</button>
            <button
              onClick={() => onImport(parsedRows, mode)}
              disabled={isSaving}
              className="pv-btn-primary flex-1 text-sm flex items-center justify-center gap-2"
            >
              {isSaving && (
                <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              )}
              {isSaving ? 'Mengimpor...' : `Import ${parsedRows.length} Warga`}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between items-start gap-2">
      <span className="text-forest-500 shrink-0">{label}</span>
      <span className="text-forest-900 font-medium text-right">{value}</span>
    </div>
  );
}

function Field({ label, required, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-forest-700 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}
