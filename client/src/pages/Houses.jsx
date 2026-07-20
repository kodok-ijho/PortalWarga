import { useMemo, useState, useEffect, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import {
  AiOutlineDelete,
  AiOutlineEdit,
  AiOutlineEye,
  AiOutlineHome,
  AiOutlinePlus,
  AiOutlineSearch,
} from 'react-icons/ai';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import Modal from '../components/Modal';
import {
  fetchUnits,
  upsertUnit,
  fetchResidents,
  fetchPayments,
  fetchIPLSchemas,
} from '../services/dataService';
import {
  isStaffRole,
  isBendaharaOrAbove,
  formatRupiah,
  computeSchemaAmount,
  getSchemaById,
} from '../services/dataHelpers';

const EMPTY_FORM = {
  block: 'CB1',
  unit_number: '',
  floor: 1,
  size: 72,
  is_occupied: false,
  owner_id: '',
  ipl_schema_id: 'schema-basic',
  notes: '',
};

export default function Houses() {
  const { role, session } = useAuth();
  const token = session?.access_token;
  const toast = useToast();
  const isStaff = isStaffRole(role);

  // Data states
  const [units, setUnits] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [iplSchemas, setIplSchemas] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [search, setSearch] = useState('');
  const [filterBlock, setFilterBlock] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [formUnit, setFormUnit] = useState(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [resUnits, resProfiles, resSchemas] = await Promise.all([
        fetchUnits(token),
        fetchResidents(token),
        fetchIPLSchemas(token),
      ]);
      setUnits(resUnits);
      setProfiles(resProfiles);
      setIplSchemas(resSchemas);
    } catch (err) {
      toast.error('Gagal memuat data master rumah/unit.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [token, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

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

  const getUnitOccupant = useCallback((unitId) => {
    if (!unitId) return null;
    return profiles.find(
      (p) =>
        p.unit_id === Number(unitId) &&
        p.is_active &&
        (p.occupancy_status === 'tenant' || p.occupancy_status === 'owner_occupied')
    ) || null;
  }, [profiles]);

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
  }, [filterBlock, filterStatus, search, units, getUnitOwner, getUnitOccupant]);

  if (!isStaff) {
    return <Navigate to="/" replace />;
  }

  const openAdd = () => {
    setFormUnit({ ...EMPTY_FORM });
  };

  const openEdit = (unit) => {
    setFormUnit({
      ...unit,
      owner_id: unit.owner_id || '',
      ipl_schema_id: unit.ipl_schema_id || (unit.is_occupied ? 'schema-komplit' : 'schema-basic'),
      notes: unit.notes || '',
    });
  };

  const handleSave = async (data) => {
    const normalized = {
      ...data,
      block: data.block.trim().toUpperCase(),
      unit_number: data.unit_number.trim().toUpperCase(),
      floor: Number(data.floor) || 1,
      size: Number(data.size) || 0,
      owner_id: data.owner_id || null,
      ipl_schema_id: data.ipl_schema_id || 'schema-basic',
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

    setIsSaving(true);
    try {
      await upsertUnit(token, normalized);
      toast.success(normalized.id ? `Rumah ${normalized.block}/${normalized.unit_number} dan skema IPL diperbarui.` : `Rumah ${normalized.block}/${normalized.unit_number} ditambahkan.`);
      await loadData();
      setFormUnit(null);
    } catch (err) {
      toast.error('Gagal menyimpan data rumah/unit.');
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (unit) => {
    // Delete in supabase: we can just update unit status or show warning.
    // In our backend, there is only a units upsert workflow.
    // If unit needs to be deleted/marked as inactive, we call upsertUnit setting occupancy_status = 'owner_vacant' and is_occupied = false.
    const relatedProfiles = profiles.filter((profile) => profile.unit_id === unit.id);
    const relatedBills = payments.filter((bill) => bill.unit_id === unit.id);

    if (relatedProfiles.length || relatedBills.length) {
      if (
        !confirm(
          `Rumah ${unit.block}/${unit.unit_number} masih punya relasi warga/tagihan. Nonaktifkan status huni rumah ini?`
        )
      ) {
        return;
      }
      setIsSaving(true);
      try {
        await upsertUnit(token, { ...unit, is_occupied: false });
        toast.success(`Rumah ${unit.block}/${unit.unit_number} dinonaktifkan.`);
        await loadData();
        setSelectedUnit(null);
      } catch (err) {
        toast.error('Gagal menonaktifkan rumah.');
        console.error(err);
      } finally {
        setIsSaving(false);
      }
      return;
    }

    if (!confirm(`Hapus rumah ${unit.block}/${unit.unit_number}?`)) return;
    setIsSaving(true);
    try {
      // In the database schema, we don't have delete webhook for units, but we can set size = -1 or delete it if we had a webhook.
      // Wait, let's look at the requirements: we don't delete units row from DB usually, we just de-occupy it or deactivate it.
      // If we want to hard delete it, wait, does the upsert units webhook allow it? No, but we can de-occupy it.
      // Wait, is there a delete webhook for units? No. So we will update units to set is_occupied = false or do a prompt.
      // Wait, if the user really wants to delete it, we can just do a mock success or call upsert with is_occupied = false. Let's do upsert with is_occupied = false.
      await upsertUnit(token, { ...unit, is_occupied: false });
      toast.success(`Rumah ${unit.block}/${unit.unit_number} ditandai tidak dihuni.`);
      await loadData();
      setSelectedUnit(null);
    } catch (err) {
      toast.error('Gagal menghapus rumah.');
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-forest-900">Manajemen Rumah & Skema IPL</h2>
          <p className="text-sm text-forest-500">
            Rawat master data unit rumah Palm Village dan tempelkan profil skema biaya IPL.
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
          <StatCard label="Terhuni (Skema Komplit)" value={stats.occupied} tone="green" />
          <StatCard label="Kosong (Skema Basic)" value={stats.vacant} tone="amber" />
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
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gold-400">Skema IPL</th>
                <th className="hidden px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gold-400 md:table-cell">Detail</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gold-400">Status</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gold-400">Aksi</th>
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
                      Memuat data rumah...
                    </div>
                  </td>
                </tr>
              ) : filteredUnits.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-forest-400">
                    Tidak ada rumah yang cocok.
                  </td>
                </tr>
              ) : (
                filteredUnits.map((unit) => {
                  const owner = getUnitOwner(unit.id);
                  const occupant = getUnitOccupant(unit.id);
                  const schema = getSchemaById(iplSchemas, unit.ipl_schema_id);
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
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-forest-50 border border-forest-200 text-forest-800">
                          {schema?.name || 'IPL Basic'}
                        </span>
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
          getUnitOwner={getUnitOwner}
          getUnitOccupant={getUnitOccupant}
          profiles={profiles}
          iplSchemas={iplSchemas}
          token={token}
          role={role}
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
          owners={profiles.filter((profile) => profile.role !== 'admin')}
          canEditSchema={isBendaharaOrAbove(role)}
          iplSchemas={iplSchemas}
          onClose={() => setFormUnit(null)}
          onSave={handleSave}
          isSaving={isSaving}
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

function UnitDetailModal({ unit, getUnitOwner, getUnitOccupant, profiles, iplSchemas, token, role, onClose, onEdit, onDelete }) {
  const owner = getUnitOwner(unit.id);
  const occupant = getUnitOccupant(unit.id);
  const relatedProfiles = profiles.filter((profile) => profile.unit_id === unit.id);
  const schema = getSchemaById(iplSchemas, unit.ipl_schema_id);
  const schemaAmount = computeSchemaAmount(schema);

  const [billsCount, setBillsCount] = useState(0);
  const [loadingBills, setLoadingBills] = useState(true);

  const hasAccess = isBendaharaOrAbove(role);

  useEffect(() => {
    if (!token || !hasAccess) {
      setLoadingBills(false);
      return;
    }

    let active = true;
    async function loadBills() {
      setLoadingBills(true);
      try {
        const res = await fetchPayments(token);
        if (!active) return;
        const filtered = res.filter((b) => b.unit_id === unit.id);
        setBillsCount(filtered.length);
      } catch (err) {
        console.warn('Failed to load payments in detail modal:', err);
        if (active) setBillsCount(0);
      } finally {
        if (active) setLoadingBills(false);
      }
    }
    loadBills();
    return () => {
      active = false;
    };
  }, [unit.id, token, role, hasAccess]);

  return (
    <Modal open onClose={onClose} title={`Rumah ${unit.block}/${unit.unit_number}`}>
      <div className="space-y-3 text-sm">
        <InfoRow label="Owner" value={owner?.full_name || 'Belum ada'} />
        <InfoRow label="Penghuni Aktif" value={occupant?.full_name || 'Kosong'} />
        <InfoRow label="Status" value={unit.is_occupied ? 'Terhuni' : 'Kosong / Nonaktif'} />
        <InfoRow
          label="Skema Biaya IPL"
          value={`${schema?.name || 'IPL Basic'} (${formatRupiah(schemaAmount)}/bln)`}
        />
        <InfoRow label="Lantai" value={unit.floor || '-'} />
        <InfoRow label="Luas" value={`${unit.size || 0}m2`} />
        <InfoRow label="Relasi Warga" value={`${relatedProfiles.length} profil`} />
        <InfoRow
          label="Relasi Tagihan"
          value={
            !hasAccess
              ? 'Terbatas (Akses Bendahara)'
              : loadingBills
              ? 'Memuat...'
              : `${billsCount} tagihan`
          }
        />
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

function UnitFormModal({ unit, owners, canEditSchema, iplSchemas, onClose, onSave, isSaving }) {
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
    <Modal open onClose={onClose} title={isEdit ? 'Edit Rumah & Skema IPL' : 'Tambah Rumah Baru'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <fieldset disabled={isSaving} className="space-y-4 border-none p-0 m-0">
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

          {/* Pilihan Profil Skema Biaya IPL */}
          <div className="p-3 bg-forest-50/70 border border-forest-200 rounded-lg space-y-2">
            <Field label="Profil Skema Biaya IPL">
              <select
                value={form.ipl_schema_id || 'schema-basic'}
                onChange={(event) => updateField('ipl_schema_id', event.target.value)}
                disabled={!canEditSchema}
                className="pv-input disabled:bg-forest-100/60 disabled:text-forest-600 disabled:cursor-not-allowed font-semibold"
              >
                {iplSchemas.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} — ({formatRupiah(computeSchemaAmount(s))} / bln)
                  </option>
                ))}
              </select>
            </Field>
            {!canEditSchema ? (
              <p className="text-[11px] text-amber-700 bg-amber-50 p-2 rounded border border-amber-200 flex items-center gap-1.5">
                <span>🔒</span>
                <span>Hak akses ubah skema IPL dibatasi khusus untuk <b>Bendahara & Admin</b>.</span>
              </p>
            ) : (
              <p className="text-[11px] text-forest-500">
                Menentukan besaran tarif bulanan yang dibebankan kepada unit ini.
              </p>
            )}
          </div>

          <label className="flex items-start gap-3 rounded-lg border border-forest-200 p-3 text-sm hover:bg-forest-50 cursor-pointer">
            <input
              type="checkbox"
              checked={Boolean(form.is_occupied)}
              onChange={(event) => {
                const checked = event.target.checked;
                updateField('is_occupied', checked);
                if (canEditSchema) {
                  updateField('ipl_schema_id', checked ? 'schema-komplit' : 'schema-basic');
                }
              }}
              className="mt-1 accent-gold-500"
            />
            <span>
              <span className="font-medium text-forest-800">Rumah sedang terhuni</span>
              <span className="block text-xs text-forest-500">
                Matikan jika rumah kosong atau tidak dihuni. {canEditSchema ? 'Otomatis mengubah skema IPL di atas.' : ''}
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
            <button type="button" onClick={onClose} disabled={isSaving} className="pv-btn-ghost flex-1 text-sm">
              Batal
            </button>
            <button type="submit" disabled={isSaving} className="pv-btn-primary flex-1 text-sm flex items-center justify-center gap-2">
              {isSaving && (
                <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              )}
              {isSaving ? 'Menyimpan...' : isEdit ? 'Simpan Perubahan' : 'Tambah Rumah'}
            </button>
          </div>
        </fieldset>
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

