import { useState, useMemo } from 'react';
import { useAuth, IS_DEMO_MODE } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import Modal from '../components/Modal';
import Placeholder from '../components/Placeholder';
import {
  getBillMatrix,
  getAvailableYears,
  canPayBill,
  getPaymentForBill,
  getUnitById,
  recordResidentPayment,
  recordManualPayment,
  MONTHS_SHORT,
  MONTHS_LONG,
  formatRupiah,
  formatShort,
  formatDate,
  formatPeriod,
  occupancyStatusLabel,
  occupancyStatusColor,
  mockIPLBills,
  mockPayments,
} from '../services/mockData';

export default function PaymentMatrix() {
  const { profile, role } = useAuth();
  const toast = useToast();
  const years = getAvailableYears();
  const [year, setYear] = useState(years[0] || new Date().getFullYear());

  // Seleksi sel (warga QRIS). Key pakai bill.id (unik lintas tahun).
  const [selected, setSelected] = useState({}); // { [billId]: true }
  const [payModal, setPayModal] = useState(null);
  // Manual payment (staff)
  const [manualModal, setManualModal] = useState(null); // { bill, unitId, monthIdx }

  // Semua role bisa LIHAT semua unit. Interaksi (bayar) di-gate per baris.
  const isStaff = role === 'admin' || role === 'rt_rw';
  const myUnitId = profile?.unit_id;

  const matrix = useMemo(() => getBillMatrix(year), [year]);

  // ── Seleksi multi-bulan runut (warga) ───────────────────────────
  // Helper: ambil daftar periode yang sudah di-select untuk sebuah unit.
  // Key sekarang bill.id (unik lintas tahun), jadi aman untuk multi-tahun.
  const selectedPeriodsForUnit = (unitId, sel = selected) =>
    Object.keys(sel)
      .map((billId) => mockIPLBills.find((b) => b.id === billId))
      .filter((b) => b && b.unit_id === unitId)
      .map((b) => b.period);

  // Helper: apakah sebuah tagihan (billId) sedang di-select?
  const isBillSelected = (billId) => !!selected[billId];

  // Helper: cek apakah sebuah tagihan boleh di-select (runut, lintas tahun).
  // Sel yang sudah paid atau sudah di-select tidak perlu dicek lagi.
  const canSelectBill = (bill) => {
    if (!bill || bill.status === 'paid' || bill.status === 'cancelled') return false;
    // Periode yang sudah di-select untuk unit ini dianggap "akan dibayar".
    const alreadySelected = selectedPeriodsForUnit(bill.unit_id);
    return canPayBill(bill.unit_id, bill.period, alreadySelected);
  };

  // Helper: revalidasi semua seleksi yang ada — hapus yang tidak valid
  // (misal user deselect bulan di tengah, bulan setelahnya jadi invalid).
  const revalidateSelections = (prevSelected) => {
    // Kelompokkan per unit
    const byUnit = {};
    for (const billId of Object.keys(prevSelected)) {
      const bill = mockIPLBills.find((b) => b.id === billId);
      if (!bill) continue;
      if (!byUnit[bill.unit_id]) byUnit[bill.unit_id] = [];
      byUnit[bill.unit_id].push(bill);
    }

    const cleaned = {};
    for (const items of Object.values(byUnit)) {
      // Sort by periode (terawal duluan)
      items.sort((a, b) => a.period.localeCompare(b.period));
      const accumulated = [];
      for (const bill of items) {
        if (canPayBill(bill.unit_id, bill.period, accumulated)) {
          cleaned[bill.id] = true;
          accumulated.push(bill.period);
        }
        // selain itu: drop dari seleksi (tidak kontigu lagi)
      }
    }
    return cleaned;
  };

  const toggleCell = (bill) => {
    if (!bill) return;

    setSelected((prev) => {
      // Sudah di-select → deselect, lalu revalidasi sisa seleksi per unit
      if (prev[bill.id]) {
        const without = { ...prev };
        delete without[bill.id];
        return revalidateSelections(without);
      }

      // Select baru: cek boleh tidak (runut lintas tahun)
      if (!canSelectBill(bill)) {
        // Cari tagihan sebelumnya yang belum lunas untuk pesan informatif
        const extraSet = new Set(selectedPeriodsForUnit(bill.unit_id, prev));
        const earlierUnpaid = mockIPLBills
          .filter(
            (b) =>
              b.unit_id === bill.unit_id &&
              b.period < bill.period &&
              b.status !== 'paid' &&
              !extraSet.has(b.period)
          )
          .sort((a, b) => a.period.localeCompare(b.period));
        const firstUnpaid = earlierUnpaid[0];
        if (firstUnpaid) {
          toast.warning(
            `Selesaikan tagihan ${formatPeriod(firstUnpaid.period)} terlebih dahulu sebelum bulan ini.`
          );
        } else {
          toast.warning('Selesaikan tagihan bulan/tahun sebelumnya terlebih dahulu.');
        }
        return prev;
      }
      return { ...prev, [bill.id]: true };
    });
  };

  const selectedBills = useMemo(
    () =>
      Object.keys(selected)
        .map((billId) => mockIPLBills.find((b) => b.id === billId))
        .filter(Boolean)
        .sort((a, b) => a.period.localeCompare(b.period)),
    [selected]
  );

  const totalToPay = useMemo(
    () => selectedBills.reduce((s, bill) => s + bill.amount, 0),
    [selectedBills]
  );

  // Validasi runut lintas tahun untuk semua seleksi. Dipakai bersama oleh
  // QRIS (warga) maupun catat manual (staff) — urutan bayar harus konsisten.
  const validateAndGetSelected = () => {
    const accumulated = [];
    const validBills = [];
    for (const bill of selectedBills) {
      if (canPayBill(bill.unit_id, bill.period, accumulated)) {
        accumulated.push(bill.period);
        validBills.push(bill);
      }
    }
    if (validBills.length !== selectedBills.length) {
      const validKeys = {};
      for (const bill of validBills) validKeys[bill.id] = true;
      setSelected(validKeys);
      toast.warning('Beberapa tagihan tidak valid karena ada tunggakan sebelumnya. Seleksi diperbarui.');
      return null;
    }
    return validBills;
  };

  const handlePay = () => {
    if (selectedBills.length === 0) {
      toast.warning('Pilih minimal 1 bulan untuk dibayar.');
      return;
    }
    const validBills = validateAndGetSelected();
    if (!validBills) return;
    setPayModal(validBills);
  };

  const confirmPay = ({ method, receiptFile, note }) => {
    const count = recordResidentPayment(
      payModal.map((b) => b.id),
      { method, receiptFile, note, payerName: profile?.full_name || '' }
    );
    toast.success(
      `${count} tagihan IPL berhasil dibayar via ${method === 'qris' ? 'QRIS' : 'Transfer Bank'} (simulasi).`
    );
    setSelected({});
    setPayModal(null);
  };

  // ── Catat pembayaran multi-bulan oleh staff (cash/transfer) ──────
  // Staff memakai mekanisme seleksi yang sama dengan warga: klik untuk
  // memilih beberapa bulan (runut, lintas tahun), lalu klik tombol di footer.
  const handleStaffPay = () => {
    if (selectedBills.length === 0) {
      toast.warning('Pilih minimal 1 bulan untuk dicatat.');
      return;
    }
    const validBills = validateAndGetSelected();
    if (!validBills) return;
    // Staff hanya mencatat untuk satu unit per transaksi (satu tanda terima).
    const unitIds = new Set(validBills.map((b) => b.unit_id));
    if (unitIds.size > 1) {
      toast.warning('Pilih tagihan dari satu rumah/unit saja dalam satu transaksi.');
      return;
    }
    setManualModal({ bills: validBills });
  };

  const confirmManual = ({ method, paidAt, note, receiptFile }) => {
    const methodLabel =
      method === 'cash' ? 'tunai' : method === 'bank_transfer' ? 'transfer' : 'QRIS';
    let count = 0;
    for (const bill of manualModal.bills) {
      recordManualPayment(bill.id, {
        method,
        paidAt,
        recordedBy: profile?.full_name || 'staff',
        note,
        receiptFile,
      });
      count++;
    }
    toast.success(`${count} pembayaran ${methodLabel} berhasil dicatat.`);
    setSelected({});
    setManualModal(null);
  };

  if (!IS_DEMO_MODE) {
    return (
      <Placeholder
        title="Matriks Pembayaran IPL"
        description="Hubungkan ke Supabase untuk melihat matriks pembayaran real."
        phase="Phase 1 — MVP"
      />
    );
  }

  return (
    <div className={`space-y-5 ${selectedBills.length > 0 ? 'pb-32 sm:pb-28' : ''}`}>
      {/* Header & tahun */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-forest-900">Matriks Pembayaran IPL</h2>
          <p className="text-sm text-forest-500">
            {isStaff
              ? 'Klik sel belum-bayar untuk memilih, lalu catat pembayaran tunai/transfer/QRIS bendahara.'
              : 'Lihat status semua unit. Bayar IPL untuk rumah Anda (baris disorot) secara berurutan — jika ada tunggakan tahun lalu, selesaikan dulu di tahun terkait.'}
          </p>
        </div>
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="pv-input w-auto"
        >
          {years.map((y) => (
            <option key={y} value={y}>
              Tahun {y}
            </option>
          ))}
        </select>
      </div>

      {/* Legenda */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-forest-600">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-emerald-100 border border-emerald-300"></span> Lunas (nominal + tgl)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-amber-50 border border-amber-300"></span> Belum Bayar
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-red-50 border border-red-300"></span> Terlambat
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-forest-800 border border-forest-800"></span> Dipilih
        </span>
      </div>

      {/* Matriks */}
      <div className="pv-card relative z-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs table-fixed min-w-[960px] border-collapse">
            <thead>
              <tr className="bg-forest-800">
                <th className="sticky left-0 z-20 bg-forest-800 px-3 py-3 text-left text-[11px] font-semibold text-gold-400 uppercase tracking-wide w-[180px]">
                  Rumah / Warga
                </th>
                {MONTHS_SHORT.map((m) => (
                  <th
                    key={m}
                    className="px-1 py-3 text-center text-[11px] font-semibold text-gold-400 uppercase w-16"
                  >
                    {m}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-forest-100">
              {matrix.length === 0 ? (
                <tr>
                  <td colSpan={13} className="px-4 py-10 text-center text-forest-400">
                    {role === 'resident'
                      ? 'Anda belum memiliki unit. Hubungi pengelola.'
                      : 'Belum ada data unit.'}
                  </td>
                </tr>
              ) : (
                matrix.map((row) => {
                  // Warga hanya bisa interaksi (bayar) untuk unitnya sendiri.
                  const isMyUnit = role === 'resident' && row.unit.id === myUnitId;
                  const canInteract = isStaff || isMyUnit;
                  // Background OPAQUE untuk kolom sticky kiri, supaya sel
                  // bulan tidak tembus/silang saat scroll horizontal. Pakai
                  // versi solid (bukan /alpha) sesuai state baris.
                  const stickyBg = isMyUnit ? 'bg-gold-50' : 'bg-white';
                  return (
                    <tr
                      key={row.unit.id}
                      className={isMyUnit ? 'bg-gold-50/40' : 'hover:bg-forest-50/50'}
                    >
                      <td className={`sticky left-0 z-10 ${stickyBg} px-3 py-2 border-r border-forest-100`}>
                        <p className={`font-medium ${isMyUnit ? 'text-gold-700' : 'text-forest-900'}`}>
                          Blok {row.unit.block}/{row.unit.unit_number}
                          {isMyUnit && (
                            <span className="ml-1.5 pv-badge bg-gold-500 text-forest-900 text-[8px]">
                              Rumah Saya
                            </span>
                          )}
                        </p>
                        <p className="text-[10px] text-forest-400 truncate max-w-[160px]">
                          {row.resident?.full_name || '— kosong —'}
                        </p>
                        {row.resident?.occupancy_status && (
                          <span className={`mt-0.5 inline-flex items-center rounded px-1 py-px text-[8px] font-semibold leading-none ${occupancyStatusColor(row.resident.occupancy_status)}`}>
                            {occupancyStatusLabel(row.resident.occupancy_status)}
                          </span>
                        )}
                      </td>
                      {row.cells.map((cell, mIdx) => {
                        const isSelected = cell?.bill ? isBillSelected(cell.bill.id) : false;
                        return (
                          <td key={mIdx} className="px-1 py-1 text-center">
                            <Cell
                              cell={cell}
                              unitId={row.unit.id}
                              isSelected={isSelected}
                              isStaff={isStaff}
                              canInteract={canInteract}
                              selectedPeriods={selectedPeriodsForUnit(row.unit.id)}
                              onClick={() => {
                                if (!canInteract) return; // warga di unit lain: view only
                                toggleCell(cell?.bill);
                              }}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer bayar — warga (QRIS) atau staff (catat manual) */}
      {selectedBills.length > 0 && (
        <div className="sticky bottom-4 z-30 pv-card p-4 flex flex-col gap-3 border-gold-300 shadow-elevated sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-forest-900">
              {selectedBills.length} bulan dipilih
              {isStaff && selectedBills.length > 0 && (
                <span className="ml-2 text-[11px] text-forest-500">
                  · {(() => {
                    const u = getUnitById(selectedBills[0].unit_id);
                    return u ? `Blok ${u.block}/${u.unit_number}` : '';
                  })()}
                </span>
              )}
            </p>
            <p className="text-[11px] text-forest-500 truncate">
              {selectedBills.map((b) => formatPeriod(b.period)).join(', ')}
            </p>
          </div>
          <div className="flex w-full items-center justify-between gap-3 shrink-0 sm:w-auto">
            <div className="text-right">
              <p className="text-[11px] text-forest-500">Total</p>
              <p className="font-bold text-forest-900">{formatRupiah(totalToPay)}</p>
            </div>
            {isStaff ? (
              <button onClick={handleStaffPay} className="pv-btn-primary text-sm">
                Catat Pembayaran →
              </button>
            ) : (
              <button onClick={handlePay} className="pv-btn-primary text-sm">
                Bayar via QRIS →
              </button>
            )}
          </div>
        </div>
      )}

      {/* Modal pembayaran warga (QRIS / Transfer) */}
      {payModal && (
        <ResidentPayModal
          bills={payModal}
          total={totalToPay}
          onConfirm={confirmPay}
          onClose={() => setPayModal(null)}
        />
      )}

      {/* Modal input manual (staff, multi-bulan) */}
      {manualModal && (
        <ManualPaymentModal
          bills={manualModal.bills}
          onConfirm={confirmManual}
          onClose={() => setManualModal(null)}
        />
      )}
    </div>
  );
}

// ── Komponen sel matriks ──────────────────────────────────────────
function Cell({ cell, unitId, isSelected, isStaff, canInteract, selectedPeriods = [], onClick }) {
  if (!cell) {
    return <span className="block h-12 rounded bg-gray-50"></span>;
  }
  const { status, bill } = cell;
  const payment = status === 'paid' ? getPaymentForBill(bill.id) : null;
  const isPaid = status === 'paid';
  const isOverdue = status === 'overdue';
  const isPending = status === 'pending';
  // Sel non-interaktif (warga lihat unit lain): view-only, tidak bisa diklik
  const isViewOnly = !canInteract;

  // Sel LUNAS → tampilkan nominal + tanggal (semua role bisa lihat info ini)
  if (isPaid) {
    return (
      <span
        className="block h-12 rounded bg-emerald-50 border border-emerald-200 flex flex-col items-center justify-center px-0.5"
        title={`Lunas ${formatRupiah(bill.amount)}${payment ? ' · ' + formatDate(payment.paid_at) : ''}${
          payment?.method && payment.method !== 'qris' ? ' · ' + payment.method : ''
        }`}
      >
        <span className="text-[9px] font-bold text-emerald-700 leading-none">{formatShort(bill.amount)}</span>
        {payment?.paid_at && (
          <span className="text-[8px] text-emerald-500 leading-none mt-0.5">
            {new Date(payment.paid_at).getDate()}/{new Date(payment.paid_at).getMonth() + 1}
          </span>
        )}
      </span>
    );
  }

  // View-only (warga di unit lain): tampil polos, no hover/click
  if (isViewOnly) {
    const viewClass =
      isOverdue
        ? 'bg-red-50 border-red-200'
        : isPending
        ? 'bg-amber-50 border-amber-200'
        : 'bg-gray-50 border-gray-200';
    return (
      <span
        className={`block h-12 rounded border flex flex-col items-center justify-center ${viewClass}`}
        title={isOverdue ? 'Terlambat' : isPending ? 'Belum bayar' : ''}
      >
        <span className="text-[8px] mt-0.5 leading-none opacity-60">{formatShort(bill.amount)}</span>
      </span>
    );
  }

  // Belum bayar / terlambat (interaktif: staff atau unit sendiri)
  // Semua sel belum-bayar BISA diklik. Aturan runut hanya divalidasi saat
  // klik (toast peringatan jika ada tunggakan sebelumnya), bukan diblokir.
  const classes = isSelected
    ? 'bg-forest-800 text-white border-forest-800'
    : isOverdue
    ? 'bg-red-50 text-red-600 border-red-300 hover:bg-red-100 cursor-pointer'
    : isPending
    ? 'bg-amber-50 text-amber-600 border-amber-300 hover:bg-amber-100 cursor-pointer'
    : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100 cursor-pointer';

  return (
    <span
      onClick={onClick}
      className={`block h-12 rounded border flex flex-col items-center justify-center transition-colors ${classes}`}
      title={
        isStaff
          ? 'Klik untuk pilih (catat tunai/transfer/QRIS)'
          : 'Klik untuk pilih'
      }
    >
      {isSelected ? (
        <span className="text-base leading-none">✓</span>
      ) : isOverdue ? (
        <span className="text-[9px] font-bold leading-none">!</span>
      ) : (
        <span className="text-base leading-none text-forest-300">○</span>
      )}
      <span className="text-[8px] mt-0.5 leading-none opacity-70">
        {formatShort(bill.amount)}
      </span>
    </span>
  );
}

// ── Modal pembayaran warga: QRIS / Transfer Bank (dengan bukti) ────
function ResidentPayModal({ bills, total, onConfirm, onClose }) {
  const [method, setMethod] = useState('qris'); // 'qris' | 'bank_transfer'
  const [receiptFile, setReceiptFile] = useState(null);
  const [uploadError, setUploadError] = useState('');
  const [note, setNote] = useState('');

  const MAX_SIZE = 3 * 1024 * 1024; // 3 MB
  const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  const isMulti = bills.length > 1;

  const handleFile = (e) => {
    setUploadError('');
    const file = e.target.files?.[0];
    if (!file) {
      setReceiptFile(null);
      return;
    }
    if (!ACCEPTED.includes(file.type)) {
      setUploadError('Format tidak didukung. Gunakan JPG, PNG, WEBP, atau PDF.');
      setReceiptFile(null);
      e.target.value = '';
      return;
    }
    if (file.size > MAX_SIZE) {
      setUploadError('Ukuran file melebihi 3 MB.');
      setReceiptFile(null);
      e.target.value = '';
      return;
    }
    setReceiptFile(file);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (method === 'bank_transfer' && !receiptFile) {
      setUploadError('Bukti transfer wajib diunggah.');
      return;
    }
    onConfirm({
      method,
      note,
      // Demo mode: simpan nama file saja. Saat Supabase terhubung,
      // file asli disimpan di Supabase Storage dan field ini berisi path/URL.
      receiptFile: receiptFile ? receiptFile.name : null,
    });
  };

  return (
    <Modal open onClose={onClose} title="Konfirmasi Pembayaran IPL" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Ringkasan tagihan */}
        <div className="rounded-lg bg-forest-50 p-3 text-sm">
          <p className="text-forest-600">
            {isMulti ? `${bills.length} tagihan IPL:` : 'Tagihan IPL:'}
          </p>
          <div className="mt-1 space-y-1 max-h-28 overflow-y-auto">
            {bills.map((bill) => (
              <div key={bill.id} className="flex justify-between text-xs py-0.5">
                <span className="font-medium text-forest-800">{formatPeriod(bill.period)}</span>
                <span className="text-forest-700">{formatRupiah(bill.amount)}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 pt-2 border-t border-forest-200 flex justify-between">
            <span className="text-sm font-medium text-forest-700">Total</span>
            <span className="text-lg font-bold text-forest-900">{formatRupiah(total)}</span>
          </div>
        </div>

        {/* Pilihan metode */}
        <div>
          <label className="block text-sm font-medium text-forest-700 mb-1">Metode Pembayaran</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => { setMethod('qris'); setUploadError(''); }}
              className={`py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                method === 'qris'
                  ? 'bg-forest-800 text-gold-400 border-forest-800'
                  : 'bg-white text-forest-600 border-forest-200 hover:bg-forest-50'
              }`}
            >
              📱 QRIS
            </button>
            <button
              type="button"
              onClick={() => { setMethod('bank_transfer'); setUploadError(''); }}
              className={`py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                method === 'bank_transfer'
                  ? 'bg-forest-800 text-gold-400 border-forest-800'
                  : 'bg-white text-forest-600 border-forest-200 hover:bg-forest-50'
              }`}
            >
              🏦 Transfer Bank
            </button>
          </div>
        </div>

        {/* QRIS: tampilkan QR code statis (simulasi) */}
        {method === 'qris' && (
          <div className="rounded-lg border-2 border-dashed border-gold-300 bg-gold-50 p-6 text-center">
            <div className="h-32 w-32 bg-forest-800 rounded-lg mx-auto flex items-center justify-center text-gold-400 text-xs">
              [QR Code]
            </div>
            <p className="text-xs text-forest-500 mt-3">
              Scan QRIS via aplikasi e-wallet/bank senilai{' '}
              <strong className="text-forest-800">{formatRupiah(total)}</strong>.
              <br />
              <span className="text-[10px]">(Integrasi Mayar aktif saat Supabase terhubung)</span>
            </p>
          </div>
        )}

        {/* Transfer: wajib upload bukti */}
        {method === 'bank_transfer' && (
          <div>
            <label className="block text-sm font-medium text-forest-700 mb-1">
              Bukti Transfer <span className="text-red-500">*</span>
            </label>
            <p className="text-[11px] text-forest-500 mb-2">
              Transfer ke rekening pengurus, lalu unggah foto/screenshot bukti transfer dari bank/e-wallet.
              Pembayaran akan diverifikasi pengurus.
            </p>
            <div className="rounded-lg border-2 border-dashed border-forest-200 bg-forest-50/50 p-4">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={handleFile}
                className="block w-full text-xs text-forest-600 file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-forest-800 file:text-gold-400 hover:file:bg-forest-700"
              />
              {receiptFile && (
                <p className="mt-2 text-[11px] text-emerald-700 flex items-center gap-1">
                  ✓ {receiptFile.name} ({(receiptFile.size / 1024).toFixed(0)} KB)
                </p>
              )}
              <p className="mt-1.5 text-[10px] text-forest-400">
                Format: JPG, PNG, WEBP, atau PDF. Maks 3 MB.
              </p>
            </div>
            {uploadError && (
              <p className="mt-1.5 text-[11px] text-red-600">⚠️ {uploadError}</p>
            )}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-forest-700 mb-1">
            Catatan <span className="text-forest-400 font-normal">(opsional)</span>
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="pv-input resize-none"
            placeholder="Mis. nama pengirim, bank asal, nomor referensi..."
          />
        </div>

        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose} className="pv-btn-ghost flex-1 text-sm">
            Batal
          </button>
          <button type="submit" className="pv-btn-primary flex-1 text-sm">
            {method === 'qris' ? 'Saya Sudah Bayar (Simulasi)' : 'Kirim Bukti Transfer'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── Modal input manual (bendahara, multi-bulan lintas tahun) ───────
// Mendukung 3 metode: Tunai, Transfer Bank (wajib bukti), QRIS.
function ManualPaymentModal({ bills, onConfirm, onClose }) {
  const [method, setMethod] = useState('cash');
  const [paidAt, setPaidAt] = useState(new Date().toISOString().split('T')[0]);
  const [note, setNote] = useState('');
  const [receiptFile, setReceiptFile] = useState(null);
  const [uploadError, setUploadError] = useState('');

  const MAX_SIZE = 3 * 1024 * 1024; // 3 MB
  const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

  // bills diasumsikan satu unit, sudah runut & terurut (divalidasi sebelum modal).
  const total = bills.reduce((s, b) => s + b.amount, 0);
  const unit = getUnitById(bills[0].unit_id);
  const unitLabel = unit ? `Blok ${unit.block}/${unit.unit_number}` : '';
  const isMulti = bills.length > 1;
  // QRIS tidak butuh bukti upload (otomatis terverifikasi). Tunai & Transfer wajib.
  const needsReceipt = method !== 'qris';

  const handleFile = (e) => {
    setUploadError('');
    const file = e.target.files?.[0];
    if (!file) {
      setReceiptFile(null);
      return;
    }
    if (!ACCEPTED.includes(file.type)) {
      setUploadError('Format tidak didukung. Gunakan JPG, PNG, WEBP, atau PDF.');
      setReceiptFile(null);
      e.target.value = '';
      return;
    }
    if (file.size > MAX_SIZE) {
      setUploadError('Ukuran file melebihi 3 MB.');
      setReceiptFile(null);
      e.target.value = '';
      return;
    }
    setReceiptFile(file);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!paidAt) return;
    if (needsReceipt && !receiptFile) {
      setUploadError(
        method === 'bank_transfer'
          ? 'Bukti transfer wajib diunggah.'
          : 'Bukti penerimaan tunai wajib diunggah.'
      );
      return;
    }
    onConfirm({
      method,
      paidAt,
      note,
      // Demo mode: simpan nama file saja. Saat Supabase terhubung,
      // file asli disimpan di Supabase Storage dan field ini berisi path/URL.
      receiptFile: receiptFile ? receiptFile.name : null,
    });
  };

  const receiptLabel = method === 'bank_transfer' ? 'Bukti Transfer' : 'Bukti Penerimaan Tunai';
  const receiptHint =
    method === 'bank_transfer'
      ? 'Unggah foto/screenshot bukti transfer dari bank/e-wallet.'
      : 'Unggah foto tanda terima pembayaran tunai yang ditandatangani bendahara.';

  // Tombol pilihan metode (dipakai berulang)
  const methodBtn = (value, label) => (
    <button
      type="button"
      onClick={() => { setMethod(value); setUploadError(''); }}
      className={`py-2.5 rounded-lg text-sm font-medium border transition-colors ${
        method === value
          ? 'bg-forest-800 text-gold-400 border-forest-800'
          : 'bg-white text-forest-600 border-forest-200 hover:bg-forest-50'
      }`}
    >
      {label}
    </button>
  );

  return (
    <Modal open onClose={onClose} title="Catat Pembayaran Bendahara" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-lg bg-forest-50 p-3 text-sm">
          {unitLabel && (
            <p className="text-[11px] text-forest-500 mb-0.5">{unitLabel}</p>
          )}
          <p className="text-forest-600">
            {isMulti ? `${bills.length} tagihan IPL:` : 'Tagihan IPL:'}
          </p>
          {/* Daftar periode terpilih (lintas tahun) */}
          <div className="mt-1 space-y-1 max-h-28 overflow-y-auto">
            {bills.map((bill) => (
              <div key={bill.id} className="flex justify-between text-xs py-0.5">
                <span className="font-medium text-forest-800">
                  {formatPeriod(bill.period)}
                </span>
                <span className="text-forest-700">{formatRupiah(bill.amount)}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 pt-2 border-t border-forest-200 flex justify-between">
            <span className="text-sm font-medium text-forest-700">Total</span>
            <span className="text-lg font-bold text-forest-900">{formatRupiah(total)}</span>
          </div>
        </div>

        {/* Metode: Tunai / Transfer / QRIS (3 opsi untuk staff) */}
        <div>
          <label className="block text-sm font-medium text-forest-700 mb-1">Metode Pembayaran</label>
          <div className="grid grid-cols-3 gap-2">
            {methodBtn('cash', '💵 Tunai')}
            {methodBtn('bank_transfer', '🏦 Transfer')}
            {methodBtn('qris', '📱 QRIS')}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-forest-700 mb-1">Tanggal Diterima</label>
          <input
            type="date"
            value={paidAt}
            onChange={(e) => setPaidAt(e.target.value)}
            required
            className="pv-input"
          />
        </div>

        {/* Upload bukti hanya untuk Tunai & Transfer (QRIS tidak perlu) */}
        {needsReceipt && (
          <div>
            <label className="block text-sm font-medium text-forest-700 mb-1">
              {receiptLabel} <span className="text-red-500">*</span>
            </label>
            <p className="text-[11px] text-forest-500 mb-2">{receiptHint}</p>
            <div className="rounded-lg border-2 border-dashed border-forest-200 bg-forest-50/50 p-4">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={handleFile}
                className="block w-full text-xs text-forest-600 file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-forest-800 file:text-gold-400 hover:file:bg-forest-700"
              />
              {receiptFile && (
                <p className="mt-2 text-[11px] text-emerald-700 flex items-center gap-1">
                  ✓ {receiptFile.name} ({(receiptFile.size / 1024).toFixed(0)} KB)
                </p>
              )}
              <p className="mt-1.5 text-[10px] text-forest-400">
                Format: JPG, PNG, WEBP, atau PDF. Maks 3 MB.
              </p>
            </div>
            {uploadError && (
              <p className="mt-1.5 text-[11px] text-red-600">⚠️ {uploadError}</p>
            )}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-forest-700 mb-1">
            Catatan <span className="text-forest-400 font-normal">(opsional)</span>
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="pv-input resize-none"
            placeholder="Mis. diterima langsung di rumah, nomor referensi transfer..."
          />
        </div>

        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose} className="pv-btn-ghost flex-1 text-sm">
            Batal
          </button>
          <button type="submit" className="pv-btn-primary flex-1 text-sm">
            Catat Pembayaran
          </button>
        </div>
      </form>
    </Modal>
  );
}

// Helper lokal
function formatPeriodShort(period) {
  const [y, m] = period.split('-');
  return `${MONTHS_LONG[parseInt(m, 10) - 1]} ${y}`;
}

