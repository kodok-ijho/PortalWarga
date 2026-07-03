import { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  AiOutlineDelete,
  AiOutlineEdit,
  AiOutlineEye,
  AiOutlineHome,
  AiOutlinePlus,
  AiOutlineSearch,
} from 'react-icons/ai';
import { useAuth, IS_DEMO_MODE } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import Modal from '../components/Modal';
import Placeholder from '../components/Placeholder';
import {
  mockIPLBills,
  mockProfiles,
  mockUnits,
  getUnitOccupant,
  getUnitOwner,
} from '../services/mockData';

const EMPTY_FORM = {
  block: 'CB1',
  unit_number: '',
  floor: 1,
  size: 72,
  is_occupied: false,
  owner_id: '',
  notes: '',
};

export default function Houses() {
  const { role } = useAuth();
  const toast = useToast();
  const isStaff = role === 'admin' || role === 'rt_rw';

  const [units, setUnits] = useState([...mockUnits]);
  const [search, setSearch] = useState('');
  const [filterBlock, setFilterBlock] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [formUnit, setFormUnit] = useState(null);

  const blocks = useMemo(
    () => [...new Set(units.map((unit) => unit.block))].sort(),
    [units]
  );

  const stats = useMemo(() => {
    const activeUnits = units.filter((unit) => unit.is_occupied).length;
    return {
      total: units.length,
      occupied: activeUnits,
      vacant: units.length - activeUnits,
      blocks: blocks.length,
    };
  }, [blocks.length, units]);

  const filteredUnits = useMemo(() => {
    const q = search.trim().toLowerCase();
    return units.filter((unit) => {
      const owner = getUnitOwner(unit.id);
      const occupant = getUnitOccupant(unit.id);
      const label = `${unit.block}/${unit.unit_number}`.toLowerCase();
      const matchesSearch =
        !q ||
        label.includes(q) ||
        (owner?.full_name || '').toLowerCase().includes(q) ||
        (occupant?.full_name || '').toLowerCase().includes(q);

      if (!matchesSearch) return false;
      if (filterBlock && unit.block !== filterBlock) return false;
      if (filterStatus === 'occupied' && !unit.is_occupied) return false;
      if (filterStatus === 'vacant' && unit.is_occupied) return false;
      return true;
    });
  }, [filterBlock, filterStatus, search, units]);

  if (!isStaff) {
    return <Navigate to="/" replace />;
  }

  if (!IS_DEMO_MODE) {
    return (
      <Placeholder
        title="Manajemen Rumah"
        description="Hubungkan ke Supabase untuk mengelola master data rumah/unit real."
        phase="Phase 1 - Supabase integration"
      />
    );
  }

  const syncUnits = (nextUnits) => {
    mockUnits.length = 0;
    mockUnits.push(...nextUnits);
    setUnits([...nextUnits]);
  };

  const openAdd = () => {
    setFormUnit({ ...EMPTY_FORM });
  };

  const openEdit = (unit) => {
    setFormUnit({
      ...unit,
      owner_id: unit.owner_id || '',
      notes: unit.notes || '',
    });
  };

  const handleSave = (data) => {
    const normalized = {
      ...data,
      block: data.block.trim().toUpperCase(),
      unit_number: data.unit_number.trim().toUpperCase(),
      floor: Number(data.floor) || 1,
      size: Number(data.size) || 0,
      owner_id: data.owner_id || null,
      notes: data.notes?.trim() || '',
    };

    if (!normalized.block || !normalized.unit_number) {
      toast.error('Blok dan nomor rumah wajib diisi.');
      return;
    }

    const duplicate = units.find(
      (unit) =>
        unit.id !== normalized.id &&
        unit.block === normalized.block &&
        unit.unit_number === normalized.unit_number
    );

    if (duplicate) {
      toast.error(`Rumah ${normalized.block}/${normalized.unit_number} sudah ada.`);
      return;
    }

    if (normalized.id) {
      const nextUnits = units.map((unit) =>
        unit.id === normalized.id ? { ...unit, ...normalized } : unit
      );
      syncUnits(nextUnits);
      toast.success(`Rumah ${normalized.block}/${normalized.unit_number} diperbarui.`);
    } else {
      const nextId = Math.max(0, ...units.map((unit) => Number(unit.id) || 0)) + 1;
      syncUnits([...units, { ...normalized, id: nextId }]);
      toast.success(`Rumah ${normalized.block}/${normalized.unit_number} ditambahkan.`);
    }

    setFormUnit(null);
  };

  const handleDelete = (unit) => {
    const relatedProfiles = mockProfiles.filter((profile) => profile.unit_id === unit.id);
    const relatedBills = mockIPLBills.filter((bill) => bill.unit_id === unit.id);

    if (relatedProfiles.length || relatedBills.length) {
      if (
        !confirm(
          `Rumah ${unit.block}/${unit.unit_number} masih punya relasi warga/tagihan. Nonaktifkan status huni rumah ini?`
        )
      ) {
        return;
      }
      const nextUnits = units.map((item) =>
        item.id === unit.id ? { ...item, is_occupied: false } : item
      );
      syncUnits(nextUnits);
      toast.success(`Rumah ${unit.block}/${unit.unit_number} dinonaktifkan.`);
      setSelectedUnit(null);
      return;
    }

    if (!confirm(`Hapus rumah ${unit.block}/${unit.unit_number}?`)) return;
    syncUnits(units.filter((item) => item.id !== unit.id));
    toast.success(`Rumah ${unit.block}/${unit.unit_number} dihapus.`);
    setSelectedUnit(null);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-forest-900">Manajemen Rumah</h2>
          <p className="text-sm text-forest-500">
            Rawat master data nomor rumah Palm Village dan cocokkan dengan mapsite.
          </p>
        </div>
        <button type="button" onClick={openAdd} className="pv-btn-primary text-xs">
          <AiOutlinePlus /> Tambah Rumah
        </button>
      </div>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <div className="pv-card overflow-hidden">
          <div className="border-b border-forest-100 bg-forest-800 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-white">Mapsite Palm Village</h3>
                <p className="text-[11px] text-forest-200">
                  Referensi visual blok CB1, CB2, CB3, CB4.
                </p>
              </div>
              <a
                href="/Mapsite%20Palm%20Village.jpeg"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-gold-300 hover:bg-white/15"
              >
                <AiOutlineEye /> Perbesar
              </a>
            </div>
          </div>
          <div className="bg-white p-3">
            <img
              src="/Mapsite%20Palm%20Village.jpeg"
              alt="Mapsite Palm Village"
              className="h-auto w-full rounded-lg border border-forest-100 object-contain"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
          <StatCard label="Total Rumah" value={stats.total} tone="forest" />
          <StatCard label="Terhuni" value={stats.occupied} tone="green" />
          <StatCard label="Kosong/Nonaktif" value={stats.vacant} tone="amber" />
          <StatCard label="Blok" value={stats.blocks} tone="gold" />
        </div>
      </section>

      <section className="pv-card p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="relative">
            <AiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-forest-400" />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="pv-input pl-9"
              placeholder="Cari rumah, owner, penghuni..."
            />
          </div>
          <select
            value={filterBlock}
            onChange={(event) => setFilterBlock(event.target.value)}
            className="pv-input"
          >
            <option value="">Semua Blok</option>
            {blocks.map((block) => (
              <option key={block} value={block}>
                Blok {block}
              </option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={(event) => setFilterStatus(event.target.value)}
            className="pv-input"
          >
            <option value="">Semua Status</option>
            <option value="occupied">Terhuni</option>
            <option value="vacant">Kosong / Nonaktif</option>
          </select>
        </div>
      </section>

      <section className="pv-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-forest-100 bg-forest-800 text-left">
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gold-400">Rumah</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gold-400">Owner</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gold-400">Penghuni</th>
                <th className="hidden px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gold-400 md:table-cell">Detail</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gold-400">Status</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gold-400">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-forest-100">
              {filteredUnits.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-forest-400">
                    Tidak ada rumah yang cocok.
                  </td>
                </tr>
              ) : (
                filteredUnits.map((unit) => {
                  const owner = getUnitOwner(unit.id);
                  const occupant = getUnitOccupant(unit.id);
                  return (
                    <tr key={unit.id} className="hover:bg-forest-50/80">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-forest-800 text-gold-400">
                            <AiOutlineHome />
                          </span>
                          <div>
                            <p className="font-semibold text-forest-900">
                              {unit.block}/{unit.unit_number}
                            </p>
                            <p className="text-[11px] text-forest-400">ID #{unit.id}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-forest-700">
                        {owner?.full_name || <span className="text-forest-400">Belum ada</span>}
                      </td>
                      <td className="px-4 py-3 text-forest-700">
                        {occupant?.full_name || <span className="text-forest-400">Kosong</span>}
                      </td>
                      <td className="hidden px-4 py-3 text-forest-500 md:table-cell">
                        Lt. {unit.floor || '-'} / {unit.size || 0}m2
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`pv-badge ${
                            unit.is_occupied
                              ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                              : 'border border-amber-200 bg-amber-50 text-amber-700'
                          }`}
                        >
                          {unit.is_occupied ? 'Terhuni' : 'Kosong'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedUnit(unit)}
                            className="rounded-lg p-2 text-forest-500 hover:bg-forest-100 hover:text-forest-800"
                            aria-label="Lihat detail rumah"
                          >
                            <AiOutlineEye />
                          </button>
                          <button
                            type="button"
                            onClick={() => openEdit(unit)}
                            className="rounded-lg p-2 text-forest-500 hover:bg-gold-50 hover:text-gold-700"
                            aria-label="Edit rumah"
                          >
                            <AiOutlineEdit />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(unit)}
                            className="rounded-lg p-2 text-red-400 hover:bg-red-50 hover:text-red-600"
                            aria-label="Hapus atau nonaktifkan rumah"
                          >
                            <AiOutlineDelete />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {selectedUnit && (
        <UnitDetailModal
          unit={selectedUnit}
          onClose={() => setSelectedUnit(null)}
          onEdit={() => {
            openEdit(selectedUnit);
            setSelectedUnit(null);
          }}
          onDelete={() => handleDelete(selectedUnit)}
        />
      )}

      {formUnit && (
        <UnitFormModal
          unit={formUnit}
          owners={mockProfiles.filter((profile) => profile.role !== 'admin')}
          onClose={() => setFormUnit(null)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

function StatCard({ label, value, tone }) {
  const tones = {
    forest: 'bg-forest-800 text-gold-400',
    green: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    amber: 'bg-amber-50 text-amber-700 border border-amber-200',
    gold: 'bg-gold-50 text-gold-700 border border-gold-200',
  };

  return (
    <div className="pv-card p-4">
      <div className={`inline-flex h-10 w-10 items-center justify-center rounded-lg ${tones[tone]}`}>
        <AiOutlineHome />
      </div>
      <p className="mt-3 text-2xl font-bold text-forest-900">{value}</p>
      <p className="text-xs text-forest-500">{label}</p>
    </div>
  );
}

function UnitDetailModal({ unit, onClose, onEdit, onDelete }) {
  const owner = getUnitOwner(unit.id);
  const occupant = getUnitOccupant(unit.id);
  const profiles = mockProfiles.filter((profile) => profile.unit_id === unit.id);
  const bills = mockIPLBills.filter((bill) => bill.unit_id === unit.id);

  return (
    <Modal open onClose={onClose} title={`Rumah ${unit.block}/${unit.unit_number}`}>
      <div className="space-y-3 text-sm">
        <InfoRow label="Owner" value={owner?.full_name || 'Belum ada'} />
        <InfoRow label="Penghuni Aktif" value={occupant?.full_name || 'Kosong'} />
        <InfoRow label="Status" value={unit.is_occupied ? 'Terhuni' : 'Kosong / Nonaktif'} />
        <InfoRow label="Lantai" value={unit.floor || '-'} />
        <InfoRow label="Luas" value={`${unit.size || 0}m2`} />
        <InfoRow label="Relasi Warga" value={`${profiles.length} profil`} />
        <InfoRow label="Relasi Tagihan" value={`${bills.length} tagihan`} />
        {unit.notes && <InfoRow label="Catatan" value={unit.notes} />}
      </div>
      <div className="mt-6 flex gap-2 border-t border-forest-100 pt-4">
        <button type="button" onClick={onEdit} className="pv-btn-ghost flex-1 text-xs">
          <AiOutlineEdit /> Edit
        </button>
        <button type="button" onClick={onDelete} className="pv-btn-danger flex-1 text-xs">
          <AiOutlineDelete /> Hapus
        </button>
      </div>
    </Modal>
  );
}

function UnitFormModal({ unit, owners, onClose, onSave }) {
  const isEdit = Boolean(unit.id);
  const [form, setForm] = useState(unit);

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    onSave(form);
  };

  return (
    <Modal open onClose={onClose} title={isEdit ? 'Edit Rumah' : 'Tambah Rumah'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Blok" required>
            <input
              type="text"
              value={form.block}
              onChange={(event) => updateField('block', event.target.value)}
              className="pv-input uppercase"
              placeholder="CB1"
              required
            />
          </Field>
          <Field label="Nomor Rumah" required>
            <input
              type="text"
              value={form.unit_number}
              onChange={(event) => updateField('unit_number', event.target.value)}
              className="pv-input uppercase"
              placeholder="01 / 3A / 12A"
              required
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Lantai">
            <input
              type="number"
              min="1"
              value={form.floor}
              onChange={(event) => updateField('floor', event.target.value)}
              className="pv-input"
            />
          </Field>
          <Field label="Luas (m2)">
            <input
              type="number"
              min="0"
              value={form.size}
              onChange={(event) => updateField('size', event.target.value)}
              className="pv-input"
            />
          </Field>
        </div>

        <Field label="Owner">
          <select
            value={form.owner_id || ''}
            onChange={(event) => updateField('owner_id', event.target.value)}
            className="pv-input"
          >
            <option value="">Belum ada owner</option>
            {owners.map((owner) => (
              <option key={owner.id} value={owner.id}>
                {owner.full_name}
              </option>
            ))}
          </select>
        </Field>

        <label className="flex items-start gap-3 rounded-lg border border-forest-200 p-3 text-sm hover:bg-forest-50">
          <input
            type="checkbox"
            checked={Boolean(form.is_occupied)}
            onChange={(event) => updateField('is_occupied', event.target.checked)}
            className="mt-1 accent-gold-500"
          />
          <span>
            <span className="font-medium text-forest-800">Rumah sedang terhuni</span>
            <span className="block text-xs text-forest-500">
              Matikan jika rumah kosong, belum aktif, atau tidak ikut penagihan sementara.
            </span>
          </span>
        </label>

        <Field label="Catatan">
          <textarea
            value={form.notes || ''}
            onChange={(event) => updateField('notes', event.target.value)}
            className="pv-input min-h-24 resize-y"
            placeholder="Contoh: posisi hook mapsite, status renovasi, atau catatan pengurus."
          />
        </Field>

        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose} className="pv-btn-ghost flex-1 text-sm">
            Batal
          </button>
          <button type="submit" className="pv-btn-primary flex-1 text-sm">
            {isEdit ? 'Simpan' : 'Tambah'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Field({ label, required, children }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-forest-700">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="shrink-0 text-forest-500">{label}</span>
      <span className="text-right font-medium text-forest-900">{value}</span>
    </div>
  );
}
