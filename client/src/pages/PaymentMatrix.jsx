import { useState, useMemo, useEffect, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import Modal from '../components/Modal';
import Placeholder from '../components/Placeholder';
import {
  MONTHS_SHORT,
  MONTHS_LONG,
  formatRupiah,
  formatShort,
  formatDate,
  formatPeriod,
  occupancyStatusLabel,
  occupancyStatusColor,
  billStatusLabel,
  billStatusColor,
  isStaffRole,
  isBendaharaOrAbove,
} from '../services/dataHelpers';
import {
  fetchBillMatrix,
  submitManualPayment,
  createCashPayment,
  approveManualPayment,
  rejectManualPayment,
  fetchPayments,
  IS_DEMO,
} from '../services/dataService';
import {
  getPaymentForBill,
  getUnitById,
  recordResidentPayment,
  recordManualPayment,
  verifyPayment,
  rejectPayment,
  revisePayment,
  downloadDigitalReceipt,
  sendEmailReceipt,
} from '../services/mockData';
import { compressImage } from '../utils/imageCompressor';

export default function PaymentMatrix() {
  const { profile, role, session } = useAuth();
  const toast = useToast();
  const years = [2026, 2027, 2028];
  const [year, setYear] = useState(2026); // Default to billing start year 2026

  const matrixMonths = useMemo(() => {
    const startYrStr = String(year).substring(2);
    const endYrStr = String(year + 1).substring(2);
    return [
      { label: `Jul '${startYrStr}`, period: `${year}-07` },
      { label: `Agt '${startYrStr}`, period: `${year}-08` },
      { label: `Sep '${startYrStr}`, period: `${year}-09` },
      { label: `Okt '${startYrStr}`, period: `${year}-10` },
      { label: `Nov '${startYrStr}`, period: `${year}-11` },
      { label: `Des '${startYrStr}`, period: `${year}-12` },
      { label: `Jan '${endYrStr}`, period: `${year+1}-01` },
      { label: `Feb '${endYrStr}`, period: `${year+1}-02` },
      { label: `Mar '${endYrStr}`, period: `${year+1}-03` },
      { label: `Apr '${endYrStr}`, period: `${year+1}-04` },
      { label: `Mei '${endYrStr}`, period: `${year+1}-05` },
      { label: `Jun '${endYrStr}`, period: `${year+1}-06` }
    ];
  }, [year]);

  // Seleksi sel pembayaran warga. Key pakai bill.id (unik lintas tahun).
  const [selected, setSelected] = useState({}); // { [billId]: true }
  const [payModal, setPayModal] = useState(null);
  // Manual payment (staff)
  const [manualModal, setManualModal] = useState(null); // { bill, unitId, monthIdx }
  // Detail bukti bayar (lunas)
  const [detailModal, setDetailModal] = useState(null); // { bill, payment }

  // Semua role bisa LIHAT semua unit. Interaksi (bayar) di-gate per baris.
  const isStaff = isStaffRole(role);
  const myUnitId = profile?.unit_id;
  const [refreshKey, setRefreshKey] = useState(0);

  const [matrix, setMatrix] = useState([]);
  const [productionPayments, setProductionPayments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const loadMatrix = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const [data, paymentData] = await Promise.all([
        fetchBillMatrix(session?.access_token, year),
        !IS_DEMO && isBendaharaOrAbove(role)
          ? fetchPayments(session?.access_token)
          : Promise.resolve([]),
      ]);
      setMatrix(data);
      setProductionPayments(paymentData);
    } catch (err) {
      const msg = err.message || 'Gagal memuat matriks pembayaran.';
      setLoadError(msg);
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  }, [session?.access_token, year, role, toast]);

  const getPaymentForBillView = useCallback((billId) => {
    if (IS_DEMO) return getPaymentForBill(billId);
    return productionPayments.find((payment) => payment.ipl_bill_id === billId) || null;
  }, [productionPayments]);

  useEffect(() => {
    loadMatrix();
  }, [loadMatrix, refreshKey]);

  // Helper to find a bill in local matrix state
  const findBillInMatrix = useCallback((billId) => {
    for (const row of matrix) {
      for (const cell of row.cells) {
        if (cell && cell.bill && cell.bill.id === billId) {
          return cell.bill;
        }
      }
    }
    return null;
  }, [matrix]);

  // Unit yang sedang "aktif" = unit dari tagihan pertama yang terpilih.
  // Selama ada seleksi, sel unit lain DIKUNCI (tidak bisa diklik) supaya
  // satu transaksi tetap satu unit (satu tanda terima). Seluruh seleksi
  // yang valid selalu satu unit, jadi ambil unit_id dari sembarang key.
  const activeUnitId = useMemo(() => {
    const firstId = Object.keys(selected)[0];
    if (!firstId) return null;
    const bill = findBillInMatrix(firstId);
    return bill ? bill.unit_id : null;
  }, [selected, findBillInMatrix]);

  // ── Seleksi multi-bulan runut (warga) ───────────────────────────
  // Helper to get earlier unpaid bills from local matrix state
  const getEarlierUnpaidBills = useCallback((unitId, period, extraPaidPeriods = []) => {
    const row = matrix.find((r) => r.unit.id === unitId);
    if (!row) return [];
    const extraSet = new Set(extraPaidPeriods);
    return row.cells
      .filter((c) => c && c.bill)
      .map((c) => c.bill)
      .filter(
        (b) =>
          b.period < period &&
          b.status !== 'paid' &&
          !extraSet.has(b.period)
      )
      .sort((a, b) => a.period.localeCompare(b.period));
  }, [matrix]);

  const canPayBillLocally = useCallback((unitId, period, extraPaidPeriods = []) => {
    return getEarlierUnpaidBills(unitId, period, extraPaidPeriods).length === 0;
  }, [getEarlierUnpaidBills]);

  // Helper: ambil daftar periode yang sudah di-select untuk sebuah unit.
  // Key sekarang bill.id (unik lintas tahun), jadi aman untuk multi-tahun.
  const selectedPeriodsForUnit = (unitId, sel = selected) =>
    Object.keys(sel)
      .map((billId) => findBillInMatrix(billId))
      .filter((b) => b && b.unit_id === unitId)
      .map((b) => b.period);

  // Helper: apakah sebuah tagihan (billId) sedang di-select?
  const isBillSelected = (billId) => !!selected[billId];

  // Helper: cek apakah sebuah tagihan boleh di-select (runut, lintas tahun).
  // Sel yang sudah paid atau sudah di-select tidak perlu dicek lagi.
  const canSelectBill = (bill) => {
    if (!bill || bill.status === 'paid' || bill.status === 'cancelled') return false;
    // Cegah seleksi lintas unit: jika sudah ada unit aktif, hanya boleh unit itu.
    // Satu transaksi = satu unit (satu tanda terima).
    if (activeUnitId !== null && bill.unit_id !== activeUnitId) return false;
    // Periode yang sudah di-select untuk unit ini dianggap "akan dibayar".
    const alreadySelected = selectedPeriodsForUnit(bill.unit_id);
    return canPayBillLocally(bill.unit_id, bill.period, alreadySelected);
  };

  // Helper: revalidasi semua seleksi yang ada — hapus yang tidak valid
  // (misal user deselect bulan di tengah, bulan setelahnya jadi invalid).
  const revalidateSelections = (prevSelected) => {
    // Kelompokkan per unit
    const byUnit = {};
    for (const billId of Object.keys(prevSelected)) {
      const bill = findBillInMatrix(billId);
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
        if (canPayBillLocally(bill.unit_id, bill.period, accumulated)) {
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

      // Select baru: cegah lintas unit (proaktif, bukan hanya di akhir).
      // Pesan kontekstual: beri tahu unit mana yang sedang aktif.
      if (activeUnitId !== null && bill.unit_id !== activeUnitId) {
        const u = getUnitById(activeUnitId);
        toast.warning(
          `Selesaikan dulu transaksi untuk Blok ${u.block}/${u.unit_number}, atau kosongkan seleksi sebelum memilih unit lain.`
        );
        return prev;
      }

      if (!canSelectBill(bill)) {
        // Cari tagihan sebelumnya yang belum lunas untuk pesan informatif
        const earlierUnpaid = getEarlierUnpaidBills(
          bill.unit_id,
          bill.period,
          selectedPeriodsForUnit(bill.unit_id, prev)
        );
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
        .map((billId) => findBillInMatrix(billId))
        .filter(Boolean)
        .sort((a, b) => a.period.localeCompare(b.period)),
    [selected, findBillInMatrix]
  );

  const totalToPay = useMemo(
    () => selectedBills.reduce(
      (sum, bill) => sum + Number(bill.amount || 0) + Number(bill.late_fee || 0),
      0
    ),
    [selectedBills]
  );

  // Validasi runut lintas tahun untuk semua seleksi. Dipakai bersama oleh
  // Pembayaran warga maupun catat manual (staff) — urutan bayar harus konsisten.
  const validateAndGetSelected = () => {
    const accumulated = [];
    const validBills = [];
    for (const bill of selectedBills) {
      if (canPayBillLocally(bill.unit_id, bill.period, accumulated)) {
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

  const confirmPay = async ({ method, receiptFile, note }) => {
    let completedCount = 0;
    try {
      if (method === 'qris') {
        toast.error('Pembayaran QRIS sedang tidak tersedia. Gunakan Transfer Bank.');
        return;
      } else {
        if (IS_DEMO) {
          const count = recordResidentPayment(
            payModal.map((b) => b.id),
            { method, receiptFile, note, payerName: profile?.full_name || '' }
          );
          toast.success(
            `${count} tagihan IPL berhasil dibayar via Transfer Bank (simulasi).`
          );
        } else {
          if (method !== 'bank_transfer') {
            toast.error('Metode pembayaran ini belum diimplementasikan di mode production.');
            return;
          }
          for (const bill of payModal) {
            await submitManualPayment(session?.access_token, {
              bill_id: bill.id,
              method: 'bank_transfer',
              file: receiptFile,
              note,
            });
            completedCount += 1;
          }
          toast.success('Bukti transfer berhasil dikirim. Menunggu verifikasi bendahara.');
        }
      }
      setSelected({});
      setPayModal(null);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      if (completedCount > 0) {
        toast.error(`${completedCount} dari ${payModal.length} tagihan berhasil dikirim. Daftar tagihan dimuat ulang untuk mencegah duplikasi.`);
        setSelected({});
        setPayModal(null);
        setRefreshKey((k) => k + 1);
      } else {
        toast.error(err.message || 'Gagal mengirim pembayaran.');
      }
    }
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
    // Defense-in-depth: seleksi lintas unit seharusnya sudah dicegah sejak
    // pemilihan sel (lihat canSelectBill & toggleCell). Tetap cek di sini
    // sebagai lapisan terakhir sebelum membuka modal pencatatan.
    const unitIds = new Set(validBills.map((b) => b.unit_id));
    if (unitIds.size > 1) {
      const u = getUnitById([...unitIds][0]);
      toast.warning(
        `Pilih tagihan dari satu rumah/unit saja dalam satu transaksi (aktif: Blok ${u.block}/${u.unit_number}).`
      );
      return;
    }
    setManualModal({ bills: validBills });
  };

  const confirmManual = async ({ method, paidAt, note, receiptFile }) => {
    const methodLabel =
      method === 'cash' ? 'tunai' : method === 'bank_transfer' ? 'transfer' : 'QRIS';
    const noteWithDate = [note?.trim(), `Tanggal diterima: ${paidAt}`].filter(Boolean).join(' | ');
    let completedCount = 0;
    try {
      if (IS_DEMO) {
        let count = 0;
        for (const bill of manualModal.bills) {
          recordManualPayment(bill.id, {
            method,
            paidAt,
            recordedBy: profile?.full_name || 'staff',
            note: noteWithDate,
            receiptFile,
          });
          count++;
        }
        toast.success(`${count} pembayaran ${methodLabel} berhasil dicatat.`);
      } else {
        if (method === 'cash') {
          let firstPayment = null;
          for (let i = 0; i < manualModal.bills.length; i++) {
            const bill = manualModal.bills[i];
            if (i === 0) {
              firstPayment = await createCashPayment(session?.access_token, {
                bill_id: bill.id,
                amount: Number(bill.amount || 0) + Number(bill.late_fee || 0),
                file: receiptFile,
                note: noteWithDate,
                paid_at: paidAt,
              });
            } else {
              await createCashPayment(session?.access_token, {
                bill_id: bill.id,
                amount: Number(bill.amount || 0) + Number(bill.late_fee || 0),
                file: null,
                note: noteWithDate + (firstPayment?.file_url ? ` (Lampiran: ${firstPayment.file_url})` : ''),
                paid_at: paidAt,
              });
            }
            completedCount += 1;
          }
          toast.success(`Pembayaran tunai untuk ${manualModal.bills.length} tagihan berhasil dicatat.`);
        } else if (method === 'bank_transfer') {
          for (const bill of manualModal.bills) {
            await submitManualPayment(session?.access_token, {
              bill_id: bill.id,
              method: 'bank_transfer',
              amount: Number(bill.amount || 0) + Number(bill.late_fee || 0),
              file: receiptFile,
              note: noteWithDate,
              paid_at: paidAt,
            });
            completedCount += 1;
          }
          toast.success(`Bukti transfer untuk ${manualModal.bills.length} tagihan berhasil dicatat dan menunggu verifikasi bendahara.`);
        } else {
          toast.error('Pembayaran QRIS sedang tidak tersedia. Gunakan Transfer atau Tunai.');
          return;
        }
      }
      setSelected({});
      setManualModal(null);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      if (completedCount > 0) {
        toast.error(`${completedCount} dari ${manualModal.bills.length} pembayaran berhasil dicatat. Matriks dimuat ulang untuk mencegah duplikasi.`);
        setSelected({});
        setManualModal(null);
        setRefreshKey((k) => k + 1);
      } else {
        toast.error(err.message || 'Gagal mencatat pembayaran.');
      }
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-20 space-y-4">
        <div className="h-10 w-10 border-4 border-forest-200 border-t-gold-500 rounded-full animate-spin" />
        <p className="text-sm text-forest-500">Memuat matriks pembayaran...</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="pv-card p-10 text-center max-w-md mx-auto space-y-4">
        <p className="text-sm text-red-600 font-semibold">{loadError}</p>
        <button
          onClick={() => setRefreshKey(k => k + 1)}
          className="pv-btn-primary mx-auto text-xs font-semibold px-4 py-2"
        >
          🔄 Coba Lagi
        </button>
      </div>
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
              ? 'Klik sel belum-bayar untuk memilih, lalu catat pembayaran tunai/transfer bendahara.'
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
              Tahun Buku {y}/{y+1}
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
          <span className="h-3 w-3 rounded bg-orange-100 border border-orange-400"></span> Menunggu Verifikasi
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-amber-50 border border-amber-300"></span> Belum Bayar
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-red-50 border border-red-300"></span> Terlambat / Ditolak
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
                {matrixMonths.map((m) => (
                  <th
                    key={m.period}
                    className="px-1 py-3 text-center text-[11px] font-semibold text-gold-400 uppercase w-16"
                  >
                    {m.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-forest-100">
              {matrix.length === 0 ? (
                <tr>
                  <td colSpan={13} className="px-4 py-10 text-center text-forest-400">
                    {role === 'warga'
                      ? 'Anda belum memiliki unit. Hubungi pengelola.'
                      : 'Belum ada data unit.'}
                  </td>
                </tr>
              ) : (
                matrix.map((row) => {
                  // Warga hanya bisa interaksi (bayar) untuk unitnya sendiri.
                  const isMyUnit = role === 'warga' && row.unit.id === myUnitId;
                  const canInteract = isStaff || isMyUnit;
                  // Sel belum-bayar unit lain DIKUNCI saat ada unit aktif (hanya
                  // relevan untuk staff — warga hanya punya satu unit sendiri).
                  const isLockedOtherUnit =
                    canInteract && activeUnitId !== null && row.unit.id !== activeUnitId;
                  // Background OPAQUE untuk kolom sticky kiri, supaya sel
                  // bulan tidak tembus/silang saat scroll horizontal. Pakai
                  // versi solid (bukan /alpha) sesuai state baris.
                  const stickyBg = isMyUnit ? 'bg-gold-50' : 'bg-white';
                  // Dim baris unit non-aktif saat ada seleksi; highlight ring
                  // tipis untuk baris unit aktif.
                  const isActiveRow = activeUnitId !== null && row.unit.id === activeUnitId;
                  const rowBg = isActiveRow
                    ? 'bg-gold-50/30 ring-1 ring-inset ring-gold-200'
                    : isLockedOtherUnit
                    ? 'opacity-50'
                    : isMyUnit
                    ? 'bg-gold-50/40'
                    : 'hover:bg-forest-50/50';
                  return (
                    <tr
                      key={row.unit.id}
                      className={rowBg}
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
                          {row.resident?.full_name ? row.resident.full_name : '— Belum Ada Pemilik —'}
                        </p>
                        {row.unit.is_occupied ? (
                          row.resident?.occupancy_status && (
                            <span className={`mt-0.5 inline-flex items-center rounded px-1 py-px text-[8px] font-semibold leading-none ${occupancyStatusColor(row.resident.occupancy_status)}`}>
                              {occupancyStatusLabel(row.resident.occupancy_status)}
                            </span>
                          )
                        ) : (
                          <span className="mt-0.5 inline-flex items-center rounded px-1.5 py-0.5 text-[8px] font-bold leading-none bg-amber-100 text-amber-800 border border-amber-300">
                            Rumah Kosong (IPL Basic)
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
                              isLockedOtherUnit={isLockedOtherUnit}
                              onClick={() => {
                                if (
                                  cell?.status === 'paid' ||
                                  cell?.status === 'pending_verification' ||
                                  cell?.status === 'rejected' ||
                                  cell?.payment?.status === 'rejected'
                                ) {
                                  const payment = cell.payment || getPaymentForBillView(cell.bill.id);
                                  setDetailModal({ bill: cell.bill, payment });
                                  return;
                                }
                                if (!canInteract || isLockedOtherUnit) return;
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

      {/* Footer bayar — warga (transfer bank) atau staff (catat manual) */}
      {selectedBills.length > 0 && (
        <div className="sticky bottom-4 z-30 pv-card p-4 flex flex-col gap-3 border-gold-300 shadow-elevated sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-forest-900">
              {selectedBills.length} bulan dipilih
              {isStaff && activeUnitId !== null && (
                <span className="ml-2 text-[11px] text-forest-500">
                  · {(() => {
                    const u = getUnitById(activeUnitId);
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
            <button
              onClick={() => setSelected({})}
              className="pv-btn-ghost text-xs px-2.5 py-1.5"
              title="Kosongkan seleksi untuk berganti unit"
            >
              ✕ Kosongkan
            </button>
            {isStaff ? (
              <button onClick={handleStaffPay} className="pv-btn-primary text-sm">
                Catat Pembayaran →
              </button>
            ) : (
              <button onClick={handlePay} className="pv-btn-primary text-sm">
                Bayar via Transfer →
              </button>
            )}
          </div>
        </div>
      )}

      {/* Modal pembayaran warga (Transfer Bank) */}
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
          role={role}
          onConfirm={confirmManual}
          onClose={() => setManualModal(null)}
        />
      )}

      {detailModal && (
        <PaymentDetailModal
          bill={detailModal.bill}
          payment={detailModal.payment}
          role={role}
          myUnitId={myUnitId}
          session={session}
          onRefresh={() => setRefreshKey(k => k + 1)}
          onRetry={() => {
            toggleCell(detailModal.bill);
            setDetailModal(null);
          }}
          onClose={() => setDetailModal(null)}
        />
      )}

    </div>
  );
}

// ── Komponen sel matriks ──────────────────────────────────────────
function Cell({ cell, unitId, isSelected, isStaff, canInteract, isLockedOtherUnit = false, onClick }) {
  if (!cell) {
    return <span className="block h-12 rounded bg-gray-50"></span>;
  }
  const { status, bill } = cell;
  const payment = status === 'paid' ? getPaymentForBill(bill.id) : null;
  const isPaid = status === 'paid';
  const isOverdue = status === 'overdue';
  const isPending = status === 'pending';
  const isPendingVerif = status === 'pending_verification';
  const isRejected = status === 'rejected' || cell.payment?.status === 'rejected';
  // Sel non-interaktif (warga lihat unit lain): view-only, tidak bisa diklik
  const isViewOnly = !canInteract;

  // Sel LUNAS / PENDING VERIF / REJECTED → tampilkan info & klik buka detail
  if (isPaid || isPendingVerif || isRejected) {
    const bgClass = isPaid
      ? 'bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 text-emerald-700'
      : isPendingVerif
      ? 'bg-orange-100 border border-orange-400 hover:bg-orange-200 text-orange-800'
      : 'bg-red-100 border border-red-400 hover:bg-red-200 text-red-800';
    
    const label = isPaid
      ? 'Lunas'
      : isPendingVerif
      ? '⏳ Verif'
      : '✕ Ditolak';

    return (
      <span
        onClick={onClick}
        className={`block h-12 rounded ${bgClass} flex flex-col items-center justify-center px-0.5 cursor-pointer transition-colors`}
        title={`${billStatusLabel(status)} ${formatRupiah(bill.amount)}${payment ? ' · ' + formatDate(payment.paid_at) : ''}`}
      >
        <span className="text-[9px] font-bold leading-none">{formatShort(bill.amount)}</span>
        <span className="text-[8px] leading-none mt-0.5 font-medium">
          {label}
        </span>
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

  // Sel belum-bayar tapi UNIT LAIN sedang aktif → kunci (tidak bisa diklik).
  // Hanya muncul untuk staff saat sudah ada seleksi di unit lain. Sel lunas
  // tetap ditampilkan normal (baris isPaid di atas sudah return lebih dulu).
  if (isLockedOtherUnit) {
    return (
      <span
        className="block h-12 rounded border border-gray-200 bg-gray-50 flex flex-col items-center justify-center cursor-not-allowed"
        title="Selesaikan dulu transaksi unit aktif, atau kosongkan seleksi sebelum memilih unit lain."
      >
        <span className="text-[10px] leading-none text-gray-400">🔒</span>
        <span className="text-[8px] mt-0.5 leading-none text-gray-300">
          {formatShort(bill.amount)}
        </span>
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
          ? 'Klik untuk pilih (catat tunai/transfer)'
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

// ── Modal pembayaran warga: Transfer Bank (dengan bukti) ────
function ResidentPayModal({ bills, total, onConfirm, onClose }) {
  const [method, setMethod] = useState('bank_transfer');
  const [receiptFile, setReceiptFile] = useState(null);
  const [uploadError, setUploadError] = useState('');
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const MAX_SIZE = 2 * 1024 * 1024;
  const ACCEPTED = ['image/jpeg', 'image/jpg', 'image/png'];
  const isMulti = bills.length > 1;

  const handleFile = async (e) => {
    setUploadError('');
    const file = e.target.files?.[0];
    if (!file) {
      setReceiptFile(null);
      return;
    }
    if (!ACCEPTED.includes(file.type)) {
      setUploadError('Format tidak didukung. Gunakan JPG atau PNG.');
      setReceiptFile(null);
      e.target.value = '';
      return;
    }
    if (file.size > MAX_SIZE) {
      setUploadError('Ukuran file melebihi 2 MB.');
      setReceiptFile(null);
      e.target.value = '';
      return;
    }
    try {
      const compressed = await compressImage(file);
      setReceiptFile(compressed.file || file);
    } catch (err) {
      setReceiptFile(file);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (method === 'bank_transfer' && !receiptFile) {
      setUploadError('Bukti transfer wajib diunggah.');
      return;
    }
    setIsSubmitting(true);
    try {
      await onConfirm({
        method,
        note,
        receiptFile: IS_DEMO ? (receiptFile?.name || null) : receiptFile,
      });
    } finally {
      setIsSubmitting(false);
    }
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
          <div className="grid grid-cols-1 gap-2">
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
                accept="image/jpeg,image/png"
                onChange={handleFile}
                className="block w-full text-xs text-forest-600 file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-forest-800 file:text-gold-400 hover:file:bg-forest-700"
              />
              {receiptFile && (
                <p className="mt-2 text-[11px] text-emerald-700 flex items-center gap-1">
                  ✓ {receiptFile.name} ({(receiptFile.size / 1024).toFixed(0)} KB)
                </p>
              )}
              <p className="mt-1.5 text-[10px] text-forest-400">
                Format: JPG atau PNG. Maks 2 MB.
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
          <button type="button" onClick={onClose} disabled={isSubmitting} className="pv-btn-ghost flex-1 text-sm disabled:opacity-50">
            Batal
          </button>
          <button type="submit" disabled={isSubmitting} className="pv-btn-primary flex-1 text-sm disabled:opacity-50">
            {isSubmitting ? 'Memproses...' : 'Kirim Bukti Transfer'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── Modal input manual (bendahara, multi-bulan lintas tahun) ───────
// Staff can record transfer proof for residents who cannot use the app yet.
// Cash remains limited to bendahara/admin.
function ManualPaymentModal({ bills, role, onConfirm, onClose }) {
  const canRecordCash = isBendaharaOrAbove(role);
  const [method, setMethod] = useState(canRecordCash ? 'cash' : 'bank_transfer');
  const [paidAt, setPaidAt] = useState(new Date().toISOString().split('T')[0]);
  const [note, setNote] = useState('');
  const [receiptFile, setReceiptFile] = useState(null);
  const [uploadError, setUploadError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const MAX_SIZE = 2 * 1024 * 1024; // n8n manual payment endpoint limit
  const ACCEPTED = ['image/jpeg', 'image/jpg', 'image/png'];

  // bills diasumsikan satu unit, sudah runut & terurut (divalidasi sebelum modal).
  const total = bills.reduce(
    (sum, bill) => sum + Number(bill.amount || 0) + Number(bill.late_fee || 0),
    0
  );
  const unit = getUnitById(bills[0].unit_id);
  const unitLabel = unit ? `Blok ${unit.block}/${unit.unit_number}` : '';
  const isMulti = bills.length > 1;
  const needsReceipt = true;

  const handleFile = async (e) => {
    setUploadError('');
    const file = e.target.files?.[0];
    if (!file) {
      setReceiptFile(null);
      return;
    }
    if (!ACCEPTED.includes(file.type)) {
      setUploadError('Format tidak didukung. Gunakan JPG atau PNG.');
      setReceiptFile(null);
      e.target.value = '';
      return;
    }
    if (file.size > MAX_SIZE) {
      setUploadError('Ukuran file melebihi 2 MB.');
      setReceiptFile(null);
      e.target.value = '';
      return;
    }
    try {
      const compressed = await compressImage(file);
      setReceiptFile(compressed.file || file);
    } catch (err) {
      setReceiptFile(file);
    }
  };

  const handleSubmit = async (e) => {
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
    setIsSubmitting(true);
    try {
      await onConfirm({ method, paidAt, note, receiptFile });
    } finally {
      setIsSubmitting(false);
    }
  };

  const receiptLabel = method === 'bank_transfer' ? 'Bukti Transfer' : 'Bukti Penerimaan Tunai';
  const receiptHint =
    method === 'bank_transfer'
      ? 'Unggah foto/screenshot bukti transfer dari bank/e-wallet.'
      : 'Unggah foto tanda terima pembayaran tunai yang ditandatangani bendahara.';

  // Tombol pilihan metode (dipakai berulang)
  const methodBtn = (value, label) => {
    return (
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
  };

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

        {/* Metode: Tunai / Transfer */}
        <div>
          <label className="block text-sm font-medium text-forest-700 mb-1">Metode Pembayaran</label>
          <div className={`grid ${canRecordCash ? 'grid-cols-2' : 'grid-cols-1'} gap-2`}>
            {canRecordCash && methodBtn('cash', '💵 Tunai')}
            {methodBtn('bank_transfer', '🏦 Transfer')}
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

        {/* Upload bukti wajib untuk Tunai & Transfer */}
        {needsReceipt && (
          <div>
            <label className="block text-sm font-medium text-forest-700 mb-1">
              {receiptLabel} <span className="text-red-500">*</span>
            </label>
            <p className="text-[11px] text-forest-500 mb-2">{receiptHint}</p>
            <div className="rounded-lg border-2 border-dashed border-forest-200 bg-forest-50/50 p-4">
              <input
                type="file"
                accept="image/jpeg,image/png"
                onChange={handleFile}
                className="block w-full text-xs text-forest-600 file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-forest-800 file:text-gold-400 hover:file:bg-forest-700"
              />
              {receiptFile && (
                <p className="mt-2 text-[11px] text-emerald-700 flex items-center gap-1">
                  ✓ {receiptFile.name} ({(receiptFile.size / 1024).toFixed(0)} KB)
                </p>
              )}
              <p className="mt-1.5 text-[10px] text-forest-400">
                Format: JPG atau PNG. Maks 2 MB.
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
          <button type="button" onClick={onClose} disabled={isSubmitting} className="pv-btn-ghost flex-1 text-sm disabled:opacity-50">
            Batal
          </button>
          <button type="submit" disabled={isSubmitting} className="pv-btn-primary flex-1 text-sm disabled:opacity-50">
            {isSubmitting ? 'Memproses...' : 'Catat Pembayaran'}
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

// Modal Detail Pembayaran Lunas
// Modal Detail / Verifikasi / Revisi Pembayaran
function PaymentDetailModal({ bill, payment, role, myUnitId, session, onRefresh, onRetry, onClose }) {
  const toast = useToast();
  const isMyUnit = bill.unit_id === myUnitId;
  const canViewReceipt = isStaffRole(role) || isMyUnit;
  const canVerify = isBendaharaOrAbove(role);

  const [isRevising, setIsRevising] = useState(false);
  const [newReceipt, setNewReceipt] = useState(null);
  const [reviseNote, setReviseNote] = useState(payment?.metadata?.note || '');
  const [uploadError, setUploadError] = useState('');
  const [isActing, setIsActing] = useState(false);

  const handleVerify = async () => {
    if (!payment || isActing) return;
    setIsActing(true);
    try {
      if (IS_DEMO) {
        verifyPayment(payment.id, { verifiedBy: roleLabel(role) });
      } else {
        await approveManualPayment(session?.access_token, { payment_id: payment.id });
      }
      toast.success('Pembayaran berhasil diverifikasi & status tagihan menjadi Lunas!');
      if (onRefresh) onRefresh();
      onClose();
    } catch (err) {
      toast.error(err.message || 'Gagal memverifikasi pembayaran.');
    } finally {
      setIsActing(false);
    }
  };

  const handleReject = async () => {
    if (!payment || isActing) return;
    const reason = prompt('Masukkan alasan penolakan bukti pembayaran:');
    if (reason === null) return;
    setIsActing(true);
    try {
      if (IS_DEMO) {
        rejectPayment(payment.id, { rejectedBy: roleLabel(role), reason: reason || 'Bukti transfer tidak valid/blur' });
      } else {
        await rejectManualPayment(session?.access_token, { payment_id: payment.id, note: reason || 'Bukti transfer tidak valid/blur' });
      }
      toast.warning('Pembayaran ditolak. Warga dapat mengunggah ulang bukti transfer.');
      if (onRefresh) onRefresh();
      onClose();
    } catch (err) {
      toast.error(err.message || 'Gagal menolak pembayaran.');
    } finally {
      setIsActing(false);
    }
  };

  const handleCancel = () => {
    if (!payment) return;
    if (!confirm('Yakin ingin membatalkan transaksi ini? Tagihan akan kembali belum dibayar.')) return;
    if (IS_DEMO) {
      cancelPayment(payment.id);
      toast.info('Transaksi pembayaran berhasil dibatalkan.');
      if (onRefresh) onRefresh();
      onClose();
    } else {
      toast.error('Pembatalan transaksi riil hanya dapat dilakukan melalui penolakan bukti oleh bendahara.');
    }
  };

  const handleFileChange = async (e) => {
    setUploadError('');
    const file = e.target.files?.[0];
    if (!file) { setNewReceipt(null); return; }
    if (file.size > 3 * 1024 * 1024) {
      setUploadError('Ukuran file maksimal 3 MB.');
      setNewReceipt(null);
      return;
    }
    try {
      const compressed = await compressImage(file);
      setNewReceipt(compressed);
    } catch (err) {
      setNewReceipt(file);
    }
  };

  const submitRevision = (e) => {
    e.preventDefault();
    if (!newReceipt && !payment?.receipt_file) {
      setUploadError('Wajib memilih file bukti transfer baru.');
      return;
    }
    if (IS_DEMO) {
      revisePayment(payment.id, {
        receiptFile: newReceipt ? newReceipt.name : payment.receipt_file,
        note: reviseNote,
      });
      toast.success('Bukti pembayaran berhasil diperbarui & dikirim ulang untuk verifikasi!');
      if (onRefresh) onRefresh();
      onClose();
    } else {
      toast.error('Revisi langsung belum didukung di mode production. Silakan batalkan atau buat kiriman bukti baru.');
    }
  };

  return (
    <Modal open onClose={onClose} title="Detail Bukti Pembayaran IPL" size="md">
      <div className="space-y-4 text-sm text-forest-900">
        {/* Banner Status */}
        {payment?.status === 'pending_verification' && (
          <div className="rounded-lg bg-orange-50 border border-orange-200 p-3 text-xs text-orange-800 flex items-center gap-2">
            <span className="text-lg">⏳</span>
            <div>
              <p className="font-bold">Menunggu Verifikasi Bendahara</p>
              <p>Bukti transfer telah dikirim dan sedang dalam proses pemeriksaan.</p>
            </div>
          </div>
        )}
        {payment?.status === 'rejected' && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-800 space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-lg">✕</span>
              <p className="font-bold">Pembayaran Ditolak</p>
            </div>
            {payment?.rejection_reason && (
              <p className="italic bg-red-100/60 p-2 rounded">"Alasan: {payment.rejection_reason}"</p>
            )}
            <p>Silakan revisi dengan mengunggah ulang bukti transfer yang benar atau batalkan transaksi.</p>
          </div>
        )}

        {isRevising ? (
          <form onSubmit={submitRevision} className="space-y-3 bg-forest-50 p-3 rounded-lg border border-forest-200">
            <h4 className="font-semibold text-xs text-forest-800 uppercase tracking-wide">Revisi Bukti Transfer</h4>
            <div>
              <label className="block text-xs font-medium text-forest-700 mb-1">File Bukti Baru</label>
              <input type="file" accept="image/*,.pdf" onChange={handleFileChange} className="text-xs w-full" />
              {newReceipt && <p className="text-[11px] text-emerald-600 mt-1">✓ File siap diunggah: {newReceipt.name}</p>}
              {uploadError && <p className="text-[11px] text-red-500 mt-1">{uploadError}</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-forest-700 mb-1">Catatan Tambahan</label>
              <input
                type="text"
                value={reviseNote}
                onChange={(e) => setReviseNote(e.target.value)}
                placeholder="Mis: Transfer dari rekening atas nama Budi..."
                className="pv-input text-xs"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button type="submit" className="pv-btn-primary flex-1 text-xs py-1.5">Kirim Revisi</button>
              <button type="button" onClick={() => setIsRevising(false)} className="pv-btn-ghost text-xs py-1.5">Batal</button>
            </div>
          </form>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 rounded-lg bg-forest-50 p-3">
              <div>
                <p className="text-xs text-forest-500 font-medium">Rumah / Unit</p>
                <p className="font-semibold text-forest-800">
                  {(() => {
                    const u = getUnitById(bill.unit_id);
                    return u ? `Blok ${u.block}/${u.unit_number}` : '-';
                  })()}
                </p>
              </div>
              <div>
                <p className="text-xs text-forest-500 font-medium">Periode IPL</p>
                <p className="font-semibold text-forest-800">{formatPeriod(bill.period)}</p>
              </div>
              <div>
                <p className="text-xs text-forest-500 font-medium">Jumlah Tagihan</p>
                <p className="font-bold text-forest-900">{formatRupiah(bill.amount)}</p>
              </div>
              <div>
                <p className="text-xs text-forest-500 font-medium">Tanggal Bayar</p>
                <p className="font-semibold text-forest-800">{payment ? formatDate(payment.paid_at) : '-'}</p>
              </div>
            </div>

            <div>
              <p className="text-xs text-forest-500 font-medium mb-1">Metode Pembayaran</p>
              <span className="pv-badge bg-forest-100 text-forest-700 font-medium">
                {payment?.method === 'qris' ? '📱 QRIS' : payment?.method === 'cash' ? '💵 Tunai' : '🏦 Transfer Bank'}
              </span>
            </div>

            {payment?.metadata?.recorded_by && (
              <div>
                <p className="text-xs text-forest-500 font-medium mb-0.5">Dicatat Oleh</p>
                <p className="text-forest-700">{payment.metadata.recorded_by}</p>
              </div>
            )}

            {payment?.metadata?.note && (
              <div>
                <p className="text-xs text-forest-500 font-medium mb-0.5">Catatan</p>
                <p className="text-forest-700 italic">"{payment.metadata.note}"</p>
              </div>
            )}

            {/* Lampiran Bukti Bayar */}
            <div>
              <p className="text-xs text-forest-500 font-medium mb-1.5">Bukti Bayar</p>
              {canViewReceipt ? (
                payment?.proof_file_url || payment?.receipt_file ? (
                  <div className="rounded-lg border border-forest-200 bg-white p-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xl">📎</span>
                      <span className="truncate text-xs font-medium text-forest-700">
                        {payment.proof_file_name || payment.receipt_file || 'Bukti Lampiran'}
                      </span>
                    </div>
                    <a
                      href={payment.proof_file_url || '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => {
                        if (!payment.proof_file_url) {
                          e.preventDefault();
                          alert(`Mengunduh file: ${payment.receipt_file}`);
                        }
                      }}
                      className="text-xs font-semibold text-forest-800 hover:text-gold-600 transition-colors"
                    >
                      Unduh / Buka 🔗
                    </a>
                  </div>
                ) : (
                  <p className="text-xs text-forest-400 italic">Tidak ada file bukti (pembayaran otomatis QRIS).</p>
                )
              ) : (
                <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-red-700 text-xs flex items-center gap-2">
                  <span>🔒</span>
                  <span>Anda tidak memiliki izin untuk melihat bukti pembayaran unit lain.</span>
                </div>
              )}
            </div>
          </>
        )}

        {/* Tombol Aksi */}
        <div className="pt-2 flex flex-col gap-2">
          {payment?.status === 'rejected' && isMyUnit && onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="pv-btn-primary w-full text-xs py-2"
            >
              Pilih Tagihan untuk Bayar Ulang
            </button>
          )}
          {(bill.status === 'paid' || payment?.status === 'verified' || payment?.status === 'completed') && (
            <div className="grid grid-cols-2 gap-2 pb-1 border-b border-forest-100">
              <button
                type="button"
                onClick={() => {
                  const u = getUnitById(bill.unit_id);
                  downloadDigitalReceipt({ bill, unit: u });
                }}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-forest-300 bg-white px-3 py-2 text-xs font-semibold text-forest-800 shadow-sm hover:bg-forest-50 transition-colors"
              >
                📥 Download Kuitansi
              </button>
              <button
                type="button"
                onClick={async () => {
                  const u = getUnitById(bill.unit_id);
                  toast.info('Mengirim kuitansi digital ke email...');
                  const res = await sendEmailReceipt({ bill, unit: u });
                  toast.success(res.message);
                }}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-gold-300 bg-gold-50 px-3 py-2 text-xs font-semibold text-gold-800 shadow-sm hover:bg-gold-100 transition-colors"
              >
                📧 Kirim ke Email
              </button>
            </div>
          )}

          {payment?.status === 'pending_verification' && canVerify && (
            <div className="flex gap-2">
              <button type="button" onClick={handleVerify} disabled={isActing} className="pv-btn-primary flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50">
                ✓ Verifikasi Lunas
              </button>
              <button type="button" onClick={handleReject} disabled={isActing} className="pv-btn-ghost flex-1 border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50">
                ✕ Tolak Bukti
              </button>
            </div>
          )}

          {payment?.status === 'rejected' && (isMyUnit || isStaffRole(role)) && !isRevising && (
            <div className="flex gap-2">
              <button type="button" onClick={() => setIsRevising(true)} className="pv-btn-primary flex-1 text-xs">
                🔄 Revisi & Upload Ulang
              </button>
              <button type="button" onClick={handleCancel} className="pv-btn-ghost flex-1 text-xs border-red-300 text-red-600 hover:bg-red-50">
                🗑 Batalkan
              </button>
            </div>
          )}

          <button type="button" onClick={onClose} className="pv-btn-ghost w-full text-sm">
            Tutup
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Modal Instuksi QRIS Midtrans ─────────────────────────
function QrisCheckoutModal({ data, onClose }) {
  return (
    <Modal open onClose={onClose} title="Menunggu Pembayaran QRIS" size="md">
      <div className="space-y-4 text-center py-2">
        <div className="mx-auto h-12 w-12 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 text-xl font-bold">
          !
        </div>
        <div>
          <h3 className="text-sm font-semibold text-forest-900">Menunggu Pembayaran Anda</h3>
          <p className="text-xs text-forest-500 mt-1">
            Transaksi QRIS Anda telah berhasil didaftarkan di Midtrans Snap.
          </p>
        </div>

        <div className="rounded-lg bg-forest-50 p-3 text-left text-xs space-y-1">
          <div className="flex justify-between">
            <span className="text-forest-500">Order ID:</span>
            <span className="font-semibold text-forest-800">{data.parent_order_id}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-forest-500">Total Nominal:</span>
            <span className="font-bold text-forest-900">{formatRupiah(data.total)}</span>
          </div>
          <div className="pt-1.5 border-t border-forest-200">
            <p className="text-forest-500 font-medium mb-1">Tagihan Periode:</p>
            <div className="flex flex-wrap gap-1">
              {(data.bills || []).map(b => (
                <span key={b.id} className="px-2 py-0.5 rounded bg-forest-100 text-forest-800 font-medium">
                  {formatPeriodShort(b.period)}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-gold-200 bg-gold-50 p-3.5 text-xs text-left text-gold-800">
          <p className="font-semibold">⚠️ Catatan Pengguna:</p>
          <ul className="list-disc pl-4 mt-1 space-y-1">
            <li>Gunakan aplikasi e-wallet (Gopay, OVO, ShopeePay, Dana, LinkAja) atau m-banking Anda untuk memindai kode QR.</li>
            <li>Setelah pembayaran sukses, sistem kami akan memperbarui status tagihan secara otomatis (realtime via webhook).</li>
            <li>Jika popup terblokir oleh browser Anda, silakan klik tombol di bawah untuk membuka halaman pembayaran.</li>
          </ul>
        </div>

        <div className="flex flex-col gap-2 pt-2">
          <a
            href={data.redirect_url}
            target="_blank"
            rel="noopener noreferrer"
            className="pv-btn-primary text-center py-2.5 font-bold shadow-md"
          >
            Buka Halaman Pembayaran 🔗
          </a>
          <button
            type="button"
            onClick={() => {
              onClose();
              window.location.reload();
            }}
            className="pv-btn-ghost text-sm py-2"
          >
            Saya Sudah Selesai Membayar
          </button>
        </div>
      </div>
    </Modal>
  );
}
