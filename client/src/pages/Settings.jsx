import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  AiOutlinePlus,
  AiOutlineDelete,
  AiOutlineSave,
} from 'react-icons/ai';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import {
  mockSettings,
  getIPLSchemas,
  computeSchemaAmount,
  formatRupiah,
  hasMinRole,
  isAdminRole,
  isBendaharaOrAbove,
} from '../services/mockData';

/**
 * Halaman Settings IPL — staff only (admin & rt_rw).
 * Konfigurasi: Profil Skema IPL (IPL Komplit, IPL Basic, dll), denda, dan penerima tagihan.
 *
 * Besaran IPL per bulan kini ditentukan oleh Profil Skema Biaya yang ditempelkan
 * pada masing-masing unit rumah.
 */
export default function Settings() {
  const { role } = useAuth();
  const toast = useToast();

  // Local state (in-memory), init dari mockSettings
  const [dueDay, setDueDay] = useState(mockSettings.due_day);
  const [lateFeeEnabled, setLateFeeEnabled] = useState(mockSettings.late_fee_enabled);
  const [lateFeeType, setLateFeeType] = useState(mockSettings.late_fee_type);
  const [lateFeeValue, setLateFeeValue] = useState(mockSettings.late_fee_value);
  const [billRecipient, setBillRecipient] = useState(
    mockSettings.bill_recipient || 'occupant'
  );
  
  // State untuk Profil Skema IPL
  const [schemas, setSchemas] = useState(() =>
    getIPLSchemas().map((s) => ({
      ...s,
      components: s.components.map((c) => ({ ...c })),
    }))
  );

  // Staff-only guard (pengurus, bendahara, admin)
  if (!hasMinRole(role, 'pengurus')) {
    return <Navigate to="/" replace />;
  }

  const canEdit = isAdminRole(role);
  const canEditSchema = isBendaharaOrAbove(role);

  const handleAddSchema = () => {
    const newId = `schema-${Date.now()}`;
    setSchemas((prev) => [
      ...prev,
      {
        id: newId,
        name: 'Skema IPL Baru',
        description: 'Deskripsi skema biaya IPL untuk tipe unit tertentu.',
        components: [
          { name: 'Keamanan', amount: 80000 },
          { name: 'Kebersihan', amount: 30000 },
        ],
      },
    ]);
  };

  const handleRemoveSchema = (id) => {
    if (schemas.length <= 1) {
      toast.error('Minimal harus ada 1 skema biaya IPL.');
      return;
    }
    setSchemas((prev) => prev.filter((s) => s.id !== id));
  };

  const handleSchemaChange = (id, field, value) => {
    setSchemas((prev) =>
      prev.map((s) => (s.id === id ? { ...s, [field]: value } : s))
    );
  };

  const handleAddComponent = (schemaId) => {
    setSchemas((prev) =>
      prev.map((s) =>
        s.id === schemaId
          ? {
              ...s,
              components: [...s.components, { name: 'Komponen Baru', amount: 10000 }],
            }
          : s
      )
    );
  };

  const handleRemoveComponent = (schemaId, index) => {
    setSchemas((prev) =>
      prev.map((s) => {
        if (s.id !== schemaId) return s;
        if (s.components.length <= 1) {
          toast.error('Minimal 1 komponen dalam sebuah skema.');
          return s;
        }
        const nextComp = s.components.filter((_, idx) => idx !== index);
        return { ...s, components: nextComp };
      })
    );
  };

  const handleComponentChange = (schemaId, index, field, value) => {
    setSchemas((prev) =>
      prev.map((s) => {
        if (s.id !== schemaId) return s;
        const nextComp = s.components.map((c, idx) =>
          idx === index ? { ...c, [field]: value } : c
        );
        return { ...s, components: nextComp };
      })
    );
  };

  const handleSave = (e) => {
    e.preventDefault();
    if (!canEdit && !canEditSchema) {
      toast.error('Anda tidak memiliki hak untuk mengubah pengaturan ini.');
      return;
    }

    // Validasi Admin
    if (canEdit) {
      if (lateFeeEnabled && lateFeeValue < 0) {
        toast.error('Nilai denda tidak boleh negatif.');
        return;
      }
      if (dueDay < 1 || dueDay > 28) {
        toast.error('Tanggal jatuh tempo harus antara 1-28.');
        return;
      }
    }

    // Validasi Skema (Admin & Bendahara)
    if (canEditSchema) {
      if (schemas.some((s) => !s.name.trim())) {
        toast.error('Semua skema IPL harus punya nama.');
        return;
      }
      if (schemas.some((s) => s.components.length === 0)) {
        toast.error('Setiap skema IPL minimal harus punya 1 komponen biaya.');
        return;
      }
      if (schemas.some((s) => s.components.some((c) => !c.name.trim()))) {
        toast.error('Semua komponen dalam skema IPL harus punya nama.');
        return;
      }
    }

    // Apply ke mockSettings
    if (canEdit) {
      mockSettings.due_day = Number(dueDay);
      mockSettings.late_fee_enabled = lateFeeEnabled;
      mockSettings.late_fee_type = lateFeeType;
      mockSettings.late_fee_value = Number(lateFeeValue);
      mockSettings.bill_recipient = billRecipient;
    }
    
    if (canEditSchema) {
      mockSettings.ipl_schemas = schemas.map((s) => ({
        id: s.id,
        name: s.name.trim(),
        description: s.description.trim(),
        components: s.components.map((c) => ({
          name: c.name.trim(),
          amount: Number(c.amount) || 0,
        })),
      }));
    }

    toast.success('Pengaturan Profil Skema IPL & sistem berhasil disimpan.');
  };

  return (
    <div className="space-y-5 max-w-4xl">
      <div>
        <h2 className="text-lg font-bold text-forest-900">Pengaturan IPL & Skema Biaya</h2>
        <p className="text-sm text-forest-500">
          Atur profil skema biaya IPL yang menempel pada unit rumah, tanggal jatuh tempo, dan denda keterlambatan.
        </p>
      </div>

      {!canEdit && !canEditSchema && (
        <div className="pv-card p-3 bg-blue-50 border border-blue-200 text-blue-700 text-sm flex items-center gap-2">
          <span>ℹ️</span>
          <span>Anda melihat pengaturan dalam mode read-only.</span>
        </div>
      )}
      {!canEdit && canEditSchema && (
        <div className="pv-card p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm flex items-center gap-2">
          <span>ℹ️</span>
          <span>Sebagai <b>Bendahara</b>, Anda memiliki hak akses untuk menambah, mengedit, dan menghapus Profil Skema Biaya IPL.</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* Ringkasan Skema & Jatuh Tempo */}
        <div className="pv-card p-5">
          <h3 className="text-sm font-semibold text-forest-800 mb-4">Ringkasan Skema Aktif & Jatuh Tempo</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-forest-700 mb-2">
                Profil Skema IPL Aktif
              </label>
              <div className="flex flex-wrap gap-2">
                {schemas.map((s) => {
                  const total = computeSchemaAmount(s);
                  return (
                    <div key={s.id} className="bg-forest-50 border border-forest-200 rounded-lg px-3 py-2 text-xs">
                      <span className="font-bold text-forest-800 block">{s.name}</span>
                      <span className="text-emerald-600 font-semibold">{formatRupiah(total)} / bln</span>
                    </div>
                  );
                })}
              </div>
              <p className="text-[11px] text-forest-400 mt-2">
                Skema ini akan ditempelkan pada masing-masing unit di halaman Daftar Rumah.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-forest-700 mb-1">
                Tanggal Jatuh Tempo Bulanan
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-forest-400">Tgl</span>
                <input
                  type="number"
                  value={dueDay}
                  onChange={(e) => setDueDay(e.target.value)}
                  min="1"
                  max="28"
                  disabled={!canEdit}
                  className="w-full rounded-lg border border-forest-200 bg-white disabled:bg-forest-50 pl-10 pr-3 py-2.5 text-sm text-forest-900 focus:border-gold-500 focus:ring-2 focus:ring-gold-500/20 outline-none transition-all"
                />
              </div>
              <p className="text-[11px] text-forest-400 mt-1">Berlaku untuk seluruh tagihan warga setiap bulan (tanggal 1-28).</p>
            </div>
          </div>
        </div>

        {/* Profil Skema Biaya IPL */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-forest-900">Profil Skema Biaya IPL</h3>
              <p className="text-xs text-forest-500">
                Tentukan paket komponen biaya IPL (mis. Rumah Ditempati vs Rumah Kosong).
              </p>
            </div>
            {canEditSchema && (
              <button
                type="button"
                onClick={handleAddSchema}
                className="pv-btn-primary text-xs"
              >
                <AiOutlinePlus /> Tambah Skema Baru
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4">
            {schemas.map((schema) => {
              const schemaTotal = computeSchemaAmount(schema);
              return (
                <div key={schema.id} className="pv-card p-5 border-l-4 border-l-gold-500 transition-all hover:shadow-md">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4 pb-3 border-b border-forest-100">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={schema.name}
                          onChange={(e) => handleSchemaChange(schema.id, 'name', e.target.value)}
                          placeholder="Nama Skema (mis. IPL Komplit)"
                          disabled={!canEditSchema}
                          className="font-bold text-base text-forest-900 rounded-lg border border-forest-200 bg-white disabled:bg-transparent px-3 py-1 focus:border-gold-500 outline-none w-full max-w-sm"
                        />
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                          {formatRupiah(schemaTotal)} / bulan
                        </span>
                      </div>
                      <input
                        type="text"
                        value={schema.description || ''}
                        onChange={(e) => handleSchemaChange(schema.id, 'description', e.target.value)}
                        placeholder="Deskripsi peruntukan skema..."
                        disabled={!canEditSchema}
                        className="text-xs text-forest-500 rounded-lg border border-forest-100 bg-forest-50/50 disabled:bg-transparent px-3 py-1 focus:border-gold-500 outline-none w-full"
                      />
                    </div>
                    {canEditSchema && schemas.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveSchema(schema.id)}
                        className="self-start md:self-center px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors flex items-center gap-1"
                      >
                        <AiOutlineDelete /> Hapus Skema
                      </button>
                    )}
                  </div>

                  {/* Komponen dalam skema */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs font-semibold text-forest-600 px-1">
                      <span>Rincian Komponen Biaya</span>
                      {canEditSchema && (
                        <button
                          type="button"
                          onClick={() => handleAddComponent(schema.id)}
                          className="text-gold-600 hover:text-gold-700 font-bold flex items-center gap-1"
                        >
                          <AiOutlinePlus /> Tambah Komponen
                        </button>
                      )}
                    </div>

                    {schema.components.length === 0 ? (
                      <p className="text-xs text-forest-400 py-2 italic">Belum ada komponen biaya dalam skema ini.</p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {schema.components.map((comp, idx) => (
                          <div key={idx} className="flex items-center gap-2 bg-forest-50/60 p-2 rounded-lg border border-forest-100">
                            <input
                              type="text"
                              value={comp.name}
                              onChange={(e) => handleComponentChange(schema.id, idx, 'name', e.target.value)}
                              placeholder="Nama Komponen"
                              disabled={!canEditSchema}
                              className="flex-1 rounded border border-forest-200 bg-white disabled:bg-transparent px-2.5 py-1.5 text-xs text-forest-900 focus:border-gold-500 outline-none"
                            />
                            <div className="relative w-32">
                              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] text-forest-400">Rp</span>
                              <input
                                type="number"
                                value={comp.amount}
                                onChange={(e) => handleComponentChange(schema.id, idx, 'amount', e.target.value)}
                                min="0"
                                step="1000"
                                disabled={!canEditSchema}
                                className="w-full rounded border border-forest-200 bg-white disabled:bg-transparent pl-7 pr-2 py-1.5 text-xs text-forest-900 focus:border-gold-500 outline-none"
                              />
                            </div>
                            {canEditSchema && (
                              <button
                                type="button"
                                onClick={() => handleRemoveComponent(schema.id, idx)}
                                className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                aria-label="Hapus komponen"
                              >
                                <AiOutlineDelete size={14} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Penerima Tagihan & Denda */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Penerima Tagihan */}
          <div className="pv-card p-5">
            <h3 className="text-sm font-semibold text-forest-800 mb-1">Penerima Tagihan IPL</h3>
            <p className="text-[11px] text-forest-400 mb-4">
              Tentukan ke siapa tagihan IPL ditujukan untuk seluruh unit.
            </p>
            <div className="space-y-2">
              <label
                className={`flex items-start gap-2.5 p-3 rounded-lg border ${!canEdit ? 'cursor-not-allowed bg-forest-50/50' : 'cursor-pointer'} transition-colors ${
                  billRecipient === 'occupant'
                    ? 'border-gold-400 bg-gold-50'
                    : 'border-forest-200 hover:bg-forest-50'
                }`}
              >
                <input
                  type="radio"
                  name="billRecipient"
                  checked={billRecipient === 'occupant'}
                  onChange={() => setBillRecipient('occupant')}
                  disabled={!canEdit}
                  className="mt-1 accent-gold-500"
                />
                <div>
                  <p className="text-sm font-medium text-forest-800">Penghuni (Occupant)</p>
                  <p className="text-[11px] text-forest-500">
                    Tagihan ke yang tinggal di unit — penyewa bila ada, kalau kosong fallback ke pemilik.
                  </p>
                </div>
              </label>
              <label
                className={`flex items-start gap-2.5 p-3 rounded-lg border ${!canEdit ? 'cursor-not-allowed bg-forest-50/50' : 'cursor-pointer'} transition-colors ${
                  billRecipient === 'owner'
                    ? 'border-gold-400 bg-gold-50'
                    : 'border-forest-200 hover:bg-forest-50'
                }`}
              >
                <input
                  type="radio"
                  name="billRecipient"
                  checked={billRecipient === 'owner'}
                  onChange={() => setBillRecipient('owner')}
                  disabled={!canEdit}
                  className="mt-1 accent-gold-500"
                />
                <div>
                  <p className="text-sm font-medium text-forest-800">Pemilik (Owner)</p>
                  <p className="text-[11px] text-forest-500">
                    Tagihan selalu ke pemilik unit, terlepas siapa yang menempati.
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Denda */}
          <div className="pv-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-forest-800">Denda Keterlambatan</h3>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={lateFeeEnabled}
                  onChange={(e) => setLateFeeEnabled(e.target.checked)}
                  disabled={!canEdit}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-forest-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gold-500"></div>
              </label>
            </div>

            {lateFeeEnabled ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-forest-700 mb-1">Jenis Denda</label>
                  <select
                    value={lateFeeType}
                    onChange={(e) => setLateFeeType(e.target.value)}
                    disabled={!canEdit}
                    className="w-full rounded-lg border border-forest-200 bg-white disabled:bg-forest-50 px-3 py-2 text-sm text-forest-700 focus:border-gold-500 outline-none"
                  >
                    <option value="percent">Persentase (%)</option>
                    <option value="fixed">Nominal Tetap (Rp)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-forest-700 mb-1">
                    Nilai Denda {lateFeeType === 'percent' ? '(%)' : '(Rp)'}
                  </label>
                  <input
                    type="number"
                    value={lateFeeValue}
                    onChange={(e) => setLateFeeValue(e.target.value)}
                    min="0"
                    step={lateFeeType === 'percent' ? '0.5' : '1000'}
                    disabled={!canEdit}
                    className="w-full rounded-lg border border-forest-200 bg-white disabled:bg-forest-50 px-3 py-2 text-sm text-forest-900 focus:border-gold-500 outline-none transition-all"
                  />
                  {lateFeeType === 'percent' && (
                    <p className="text-[11px] text-forest-400 mt-1">
                      Contoh: 5% denda keterlambatan atas tagihan jatuh tempo.
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-xs text-forest-400 py-4 italic">Denda keterlambatan saat ini dinonaktifkan.</p>
            )}
          </div>
        </div>

        {/* Save Button */}
        {(canEdit || canEditSchema) && (
          <div className="flex justify-end gap-2 pt-2">
            <button type="submit" className="pv-btn-primary px-6 py-3 text-sm font-bold shadow-lg shadow-gold-500/20">
              <AiOutlineSave size={18} /> Simpan Perubahan Pengaturan
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
