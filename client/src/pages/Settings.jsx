import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  AiOutlinePlus,
  AiOutlineDelete,
  AiOutlineSave,
} from 'react-icons/ai';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { mockSettings, computeIPLAmount, formatRupiah, hasMinRole, isAdminRole } from '../services/mockData';

/**
 * Halaman Settings IPL — staff only (admin & rt_rw).
 * Konfigurasi: komponen IPL (yang menentukan besaran), denda, dst.
 *
 * Besaran IPL per bulan = penjumlahan semua komponen IPL.
 * Tidak ada lagi input nominal terpisah — komponen adalah satu-satunya
 * sumber kebenaran besaran iuran.
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
  const [components, setComponents] = useState(
    mockSettings.ipl_components.map((c) => ({ ...c }))
  );

  // Staff-only guard (pengurus, bendahara, admin)
  if (!hasMinRole(role, 'pengurus')) {
    return <Navigate to="/" replace />;
  }

  const canEdit = isAdminRole(role);

  const handleAddComponent = () => {
    setComponents((prev) => [...prev, { name: '', amount: 0 }]);
  };

  const handleRemoveComponent = (idx) => {
    setComponents((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleComponentChange = (idx, field, value) => {
    setComponents((prev) =>
      prev.map((c, i) => (i === idx ? { ...c, [field]: value } : c))
    );
  };

  // Besaran IPL = total dari semua komponen (satu-satunya sumber kebenaran).
  const amount = computeIPLAmount(components);

  const handleSave = (e) => {
    e.preventDefault();
    // Validasi
    if (amount <= 0) {
      toast.error('Total komponen IPL harus lebih dari 0.');
      return;
    }
    if (lateFeeEnabled && lateFeeValue < 0) {
      toast.error('Nilai denda tidak boleh negatif.');
      return;
    }
    if (dueDay < 1 || dueDay > 28) {
      toast.error('Tanggal jatuh tempo harus antara 1-28.');
      return;
    }
    if (components.some((c) => !c.name.trim())) {
      toast.error('Semua komponen IPL harus punya nama.');
      return;
    }
    if (components.length === 0) {
      toast.error('Minimal harus ada 1 komponen IPL.');
      return;
    }

    // Apply ke mockSettings (in-memory; saat Supabase terhubung → simpan ke DB).
    // Besaran IPL otomatis = total komponen, tidak disimpan sebagai field terpisah.
    mockSettings.due_day = Number(dueDay);
    mockSettings.late_fee_enabled = lateFeeEnabled;
    mockSettings.late_fee_type = lateFeeType;
    mockSettings.late_fee_value = Number(lateFeeValue);
    mockSettings.bill_recipient = billRecipient;
    mockSettings.ipl_components = components.map((c) => ({
      name: c.name.trim(),
      amount: Number(c.amount) || 0,
    }));

    toast.success('Pengaturan IPL berhasil disimpan.');
  };

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h2 className="text-lg font-bold text-forest-900">Pengaturan IPL</h2>
        <p className="text-sm text-forest-500">
          Atur komponen IPL, denda keterlambatan, dan pengaturan lainnya.
        </p>
      </div>

      {!canEdit && (
        <div className="pv-card p-3 bg-blue-50 border border-blue-200 text-blue-700 text-sm flex items-center gap-2">
          <span>ℹ️</span>
          <span>Anda melihat pengaturan dalam mode read-only. Hanya Admin yang dapat mengubah pengaturan.</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-5">
        {/* Besaran IPL & Jatuh Tempo */}
        <div className="pv-card p-5">
          <h3 className="text-sm font-semibold text-forest-800 mb-4">Besaran IPL & Jatuh Tempo</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-forest-700 mb-1">
                Besaran IPL per Bulan
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-forest-400">Rp</span>
                <div className="w-full rounded-lg border border-forest-200 bg-forest-50/60 pl-9 pr-3 py-2.5 text-sm font-bold text-forest-900">
                  {formatRupiah(amount)}
                </div>
              </div>
              <p className="text-[11px] text-forest-400 mt-1">
                Otomatis = total dari semua Komponen IPL di bawah.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-forest-700 mb-1">
                Tanggal Jatuh Tempo
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
              <p className="text-[11px] text-forest-400 mt-1">Setiap bulan, tanggal 1-28</p>
            </div>
          </div>
        </div>

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
            {/* Toggle */}
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

          {lateFeeEnabled && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-forest-700 mb-1">Jenis Denda</label>
                <select
                  value={lateFeeType}
                  onChange={(e) => setLateFeeType(e.target.value)}
                  disabled={!canEdit}
                  className="w-full rounded-lg border border-forest-200 bg-white disabled:bg-forest-50 px-3 py-2.5 text-sm text-forest-700 focus:border-gold-500 outline-none"
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
                  className="w-full rounded-lg border border-forest-200 bg-white disabled:bg-forest-50 px-3 py-2.5 text-sm text-forest-900 focus:border-gold-500 focus:ring-2 focus:ring-gold-500/20 outline-none transition-all"
                />
                {lateFeeType === 'percent' && (
                  <p className="text-[11px] text-forest-400 mt-1">
                    Contoh: 5% dari {formatRupiah(amount)} = {formatRupiah(Math.round(amount * (lateFeeValue / 100)))}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Komponen IPL */}
        <div className="pv-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-forest-800">Komponen IPL</h3>
              <p className="text-[11px] text-forest-400">Rincian apa saja yang ditanggung iuran</p>
            </div>
            {canEdit && (
              <button
                type="button"
                onClick={handleAddComponent}
                className="pv-btn-ghost text-xs"
              >
                <AiOutlinePlus /> Tambah
              </button>
            )}
          </div>

          {components.length === 0 ? (
            <p className="text-sm text-forest-400 text-center py-4">
              Belum ada komponen. {canEdit ? 'Klik "Tambah" untuk menambah.' : ''}
            </p>
          ) : (
            <div className="space-y-2">
              {components.map((comp, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={comp.name}
                    onChange={(e) => handleComponentChange(idx, 'name', e.target.value)}
                    placeholder="Nama komponen (mis. Kebersihan)"
                    disabled={!canEdit}
                    className="flex-1 rounded-lg border border-forest-200 bg-white disabled:bg-forest-50 px-3 py-2 text-sm text-forest-900 focus:border-gold-500 outline-none"
                  />
                  <div className="relative w-36">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-forest-400">Rp</span>
                    <input
                      type="number"
                      value={comp.amount}
                      onChange={(e) => handleComponentChange(idx, 'amount', e.target.value)}
                      min="0"
                      step="1000"
                      disabled={!canEdit}
                      className="w-full rounded-lg border border-forest-200 bg-white disabled:bg-forest-50 pl-8 pr-2 py-2 text-sm text-forest-900 focus:border-gold-500 outline-none"
                    />
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => handleRemoveComponent(idx)}
                      className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      aria-label="Hapus komponen"
                    >
                      <AiOutlineDelete />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Total preview */}
          <div className="mt-4 pt-3 border-t border-forest-100 flex justify-between items-center">
            <span className="text-sm text-forest-600">
              Total Komponen = Besaran IPL per Bulan
            </span>
            <span className="font-bold text-emerald-600">
              {formatRupiah(amount)}
            </span>
          </div>
        </div>

        {/* Save */}
        {canEdit && (
          <div className="flex justify-end gap-2">
            <button type="submit" className="pv-btn-primary">
              <AiOutlineSave /> Simpan Pengaturan
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
