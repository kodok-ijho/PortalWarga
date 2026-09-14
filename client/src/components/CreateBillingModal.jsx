import { useState, useEffect } from 'react';
import {
  AiOutlineCalendar,
  AiOutlineDollarCircle,
  AiOutlineHome,
  AiOutlineUser,
  AiOutlineFileText,
  AiOutlineCheckCircle,
} from 'react-icons/ai';
import Modal from './Modal';
import { useToast } from '../hooks/useToast';
import { formatRupiah } from '../services/dataHelpers';
import {
  fetchTenantUnits,
  fetchTenantMembers,
  createTenantBillingItem,
  assignRoomContract,
} from '../services/tenantOperationalService';

export default function CreateBillingModal({
  open,
  onClose,
  tenantId,
  tenantType = 'rt_rw',
  initialUnitId = '',
  onSuccess,
}) {
  const toast = useToast();
  const isKos = tenantType === 'kos';

  const [units, setUnits] = useState([]);
  const [members, setMembers] = useState([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form states
  const [unitId, setUnitId] = useState(initialUnitId);
  const [memberId, setMemberId] = useState('');
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7)); // 'YYYY-MM'
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [status, setStatus] = useState('unpaid');
  const [notes, setNotes] = useState('');

  // Field kontrak khusus vertikal kos
  const [contractStart, setContractStart] = useState('');
  const [contractEnd, setContractEnd] = useState('');
  const [isActivatingContract, setIsActivatingContract] = useState(isKos);

  // Muat daftar unit dan anggota tenant saat modal dibuka
  useEffect(() => {
    if (!open || !tenantId) return;

    let mounted = true;
    async function loadOptions() {
      setLoadingOptions(true);
      try {
        const [unitData, memberData] = await Promise.all([
          fetchTenantUnits(tenantId),
          fetchTenantMembers(tenantId),
        ]);
        if (mounted) {
          setUnits(unitData || []);
          setMembers(memberData || []);

          if (initialUnitId) {
            setUnitId(initialUnitId);
            const foundUnit = unitData.find((u) => String(u.id) === String(initialUnitId));
            if (foundUnit?.metadata?.default_rent_price) {
              setAmount(foundUnit.metadata.default_rent_price);
            }
          } else if (unitData.length > 0) {
            setUnitId(unitData[0].id);
            if (unitData[0].metadata?.default_rent_price) {
              setAmount(unitData[0].metadata.default_rent_price);
            }
          }
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Gagal memuat opsi unit/anggota:', err);
      } finally {
        if (mounted) setLoadingOptions(false);
      }
    }

    loadOptions();
    return () => {
      mounted = false;
    };
  }, [open, tenantId, initialUnitId]);

  // Sinkronkan periode tagihan jika contractStart diubah
  useEffect(() => {
    if (contractStart && contractStart.length >= 7) {
      setPeriod(contractStart.slice(0, 7));
    }
  }, [contractStart]);

  // Update default amount jika unit dipilih
  const handleUnitChange = (selectedId) => {
    setUnitId(selectedId);
    const found = units.find((u) => String(u.id) === String(selectedId));
    if (found?.metadata?.default_rent_price) {
      setAmount(found.metadata.default_rent_price);
    }
    if (found?.metadata?.contract_start && !contractStart) {
      setContractStart(found.metadata.contract_start);
    }
    if (found?.metadata?.contract_end && !contractEnd) {
      setContractEnd(found.metadata.contract_end);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!unitId) {
      toast.error('Silakan pilih unit/kamar terlebih dahulu.');
      return;
    }
    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
      toast.error('Format periode tagihan harus YYYY-MM.');
      return;
    }
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount < 0) {
      toast.error('Nominal tagihan harus berupa angka positif atau nol.');
      return;
    }

    // Validasi field kontrak jika kos
    if (isKos && (contractStart || contractEnd || isActivatingContract)) {
      if (!contractStart || !contractEnd) {
        toast.error('Tanggal mulai dan selesai kontrak sewa wajib diisi.');
        return;
      }
      if (new Date(contractEnd) <= new Date(contractStart)) {
        toast.error('Tanggal selesai kontrak harus lebih besar dari tanggal mulai kontrak.');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      if (isKos && isActivatingContract && contractStart && contractEnd) {
        await assignRoomContract(tenantId, {
          unitId,
          memberId: memberId || null,
          contractStart,
          contractEnd,
          rentPrice: numAmount,
          dueDate: dueDate || contractStart,
          notes,
        });
        toast.success('Kontrak sewa kamar berhasil diaktifkan & tagihan sewa awal dibuat!');
      } else {
        await createTenantBillingItem(tenantId, {
          unit_id: unitId,
          member_id: memberId || null,
          period,
          amount: numAmount,
          due_date: dueDate || null,
          status,
          contract_start: contractStart || null,
          contract_end: contractEnd || null,
          metadata: {
            notes,
            billing_type: isKos ? 'rent' : 'regular',
          },
        });
        toast.success('Tagihan berhasil dibuat!');
      }

      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      toast.error(err.message || 'Gagal menyimpan tagihan.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isKos ? 'Buat Tagihan & Kontrak Sewa Kamar' : 'Buat Tagihan Manual'}
      size="md"
    >
      <form onSubmit={handleSubmit} className="p-6 space-y-4 text-forest-900">
        {loadingOptions ? (
          <div className="py-8 text-center text-forest-500 text-sm">
            Memuat data kamar &amp; penghuni...
          </div>
        ) : (
          <>
            {/* Pilihan Kamar / Unit */}
            <div>
              <label className="block text-xs font-bold text-forest-800 mb-1 flex items-center gap-1.5">
                <AiOutlineHome className="text-sm text-forest-600" />
                <span>Pilih {isKos ? 'Kamar' : 'Rumah / Kavling'} <span className="text-rose-500">*</span></span>
              </label>
              <select
                value={unitId}
                onChange={(e) => handleUnitChange(e.target.value)}
                required
                className="pv-input text-xs w-full bg-white border border-forest-300 rounded-xl px-3 py-2"
              >
                <option value="">-- Pilih {isKos ? 'Kamar' : 'Unit'} --</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.label} {u.status === 'vacant' ? '(Kosong / Siap Huni)' : u.status === 'occupied' ? '(Terisi)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Pilihan Penyewa / Anggota */}
            <div>
              <label className="block text-xs font-bold text-forest-800 mb-1 flex items-center gap-1.5">
                <AiOutlineUser className="text-sm text-forest-600" />
                <span>{isKos ? 'Penyewa Kamar' : 'Warga / Penghuni'} (Opsional)</span>
              </label>
              <select
                value={memberId}
                onChange={(e) => setMemberId(e.target.value)}
                className="pv-input text-xs w-full bg-white border border-forest-300 rounded-xl px-3 py-2"
              >
                <option value="">-- Belum Terdaftar / Mandiri --</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name} {m.phone ? `(${m.phone})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Bagian Kontrak Sewa (Khusus Vertikal Kos) */}
            {isKos && (
              <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                    <AiOutlineCalendar className="text-sm text-emerald-700" />
                    <span>Masa Kontrak Sewa Kamar</span>
                  </span>
                  <label className="flex items-center gap-1.5 text-[11px] text-emerald-800 font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isActivatingContract}
                      onChange={(e) => setIsActivatingContract(e.target.checked)}
                      className="rounded border-emerald-400 text-emerald-600 focus:ring-emerald-500"
                    />
                    <span>Tandai Kamar Terisi (Occupied)</span>
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-emerald-800 mb-1">
                      Mulai Kontrak (contract_start) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={contractStart}
                      onChange={(e) => setContractStart(e.target.value)}
                      required={isActivatingContract}
                      className="w-full bg-white border border-emerald-300 rounded-xl px-3 py-1.5 text-xs text-forest-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-emerald-800 mb-1">
                      Selesai Kontrak (contract_end) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={contractEnd}
                      onChange={(e) => setContractEnd(e.target.value)}
                      required={isActivatingContract}
                      className="w-full bg-white border border-emerald-300 rounded-xl px-3 py-1.5 text-xs text-forest-900"
                    />
                  </div>
                </div>
                <p className="text-[10px] text-emerald-700 leading-relaxed">
                  Rentang kontrak ini akan mengunci durasi sewa penyewa dan digunakan oleh penjadwal tagihan otomatis.
                </p>
              </div>
            )}

            {/* Periode & Nominal Tagihan */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-forest-800 mb-1 flex items-center gap-1.5">
                  <AiOutlineCalendar className="text-sm text-forest-600" />
                  <span>Periode Tagihan <span className="text-rose-500">*</span></span>
                </label>
                <input
                  type="month"
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                  required
                  className="w-full bg-white border border-forest-300 rounded-xl px-3 py-2 text-xs text-forest-900"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-forest-800 mb-1 flex items-center gap-1.5">
                  <AiOutlineDollarCircle className="text-sm text-forest-600" />
                  <span>Nominal {isKos ? 'Uang Sewa' : 'IPL'} (Rp) <span className="text-rose-500">*</span></span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="1000"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                  required
                  className="w-full bg-white border border-forest-300 rounded-xl px-3 py-2 text-xs text-forest-900 font-semibold"
                />
                {amount && (
                  <span className="text-[11px] text-emerald-600 font-bold block mt-0.5">
                    {formatRupiah(Number(amount))}
                  </span>
                )}
              </div>
            </div>

            {/* Jatuh Tempo & Status */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-forest-700 mb-1">
                  Tanggal Jatuh Tempo
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full bg-white border border-forest-300 rounded-xl px-3 py-1.5 text-xs text-forest-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-forest-700 mb-1">
                  Status Pembayaran Awal
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full bg-white border border-forest-300 rounded-xl px-3 py-1.5 text-xs text-forest-900"
                >
                  <option value="unpaid">Belum Dibayar (Unpaid)</option>
                  <option value="paid">Sudah Lunas (Paid)</option>
                </select>
              </div>
            </div>

            {/* Catatan / Keterangan */}
            <div>
              <label className="block text-xs font-semibold text-forest-700 mb-1 flex items-center gap-1.5">
                <AiOutlineFileText className="text-sm text-forest-500" />
                <span>Catatan Tambahan (Opsional)</span>
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Mis: Uang jaminan / deposit Rp 500.000, bayar di muka 3 bulan."
                className="w-full bg-white border border-forest-300 rounded-xl px-3 py-2 text-xs text-forest-900 resize-none"
              />
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-forest-100">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-xl bg-forest-100 hover:bg-forest-200 text-xs font-semibold text-forest-800 transition-colors"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center gap-1.5 px-6 py-2 rounded-xl bg-forest-800 hover:bg-forest-700 text-gold-300 text-xs font-bold transition-all shadow-md disabled:opacity-50"
              >
                <AiOutlineCheckCircle className="text-sm" />
                <span>{isSubmitting ? 'Menyimpan...' : 'Simpan Tagihan &amp; Kontrak'}</span>
              </button>
            </div>
          </>
        )}
      </form>
    </Modal>
  );
}
