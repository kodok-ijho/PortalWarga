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
  canModifyData,
  getQrisProviderLabel,
} from '../services/dataHelpers';
import {
  fetchBillMatrix,
  submitManualPayment,
  createCashPayment,
  approveManualPayment,
  rejectManualPayment,
  fetchPayments,
  fetchPaymentByBillId,
  selectPreferredPayment,
  createQrisPayment,
  verifyQrisPayment,
  IS_DEMO,
} from '../services/dataService';
import { portalApiPost } from '../services/apiClient';
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
  const { profile, role, session, isReadOnly } = useAuth();
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
  const [qrisCheckoutData, setQrisCheckoutData] = useState(null);
  // Manual payment (staff)
  const [manualModal, setManualModal] = useState(null); // { bill, unitId, monthIdx }
  // Detail bukti bayar (lunas)
  const [detailModal, setDetailModal] = useState(null); // { bill, payment }

  // Semua role bisa LIHAT semua unit. Interaksi (bayar) di-gate per baris.
  const isStaff = isStaffRole(role);
  const canWrite = canModifyData(role) && !isReadOnly;
  // Admin Demo memakai role internal admin_viewer dan tetap read-only untuk
  // seluruh fitur lain. QRIS adalah satu-satunya pengecualian sementara.
  const isDemoAdmin = isReadOnly && (role === 'admin' || role === 'admin_viewer');
  const canUseQris = true;
  const myUnitId = profile?.unit_id;
  const [refreshKey, setRefreshKey] = useState(0);

  const [matrix, setMatrix] = useState([]);
  const [productionPayments, setProductionPayments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const loadMatrix = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setIsLoading(true);
      setLoadError('');
    }
    try {
      const scopedMatrixPromise =
        !IS_DEMO && !isStaff && myUnitId
          ? fetchBillMatrix(session?.access_token, year, { scopeUnitId: myUnitId }).catch(() => [])
          : Promise.resolve([]);

      const [data, paymentData, scopedData] = await Promise.all([
        fetchBillMatrix(session?.access_token, year),
        !IS_DEMO
          ? fetchPayments(session?.access_token, myUnitId ? { scopeUnitId: myUnitId } : {}).catch(() => [])
          : Promise.resolve([]),
        scopedMatrixPromise,
      ]);

      if (!IS_DEMO && !isStaff && myUnitId && Array.isArray(scopedData) && scopedData.length > 0) {
        const scopedByUnit = new Map(scopedData.map((row) => [String(row?.unit?.id), row]));
        setMatrix(
          data.map((row) => {
            const scopedRow = scopedByUnit.get(String(row?.unit?.id));
            return scopedRow ? scopedRow : row;
          })
        );
      } else {
        setMatrix(data);
      }
      setProductionPayments(paymentData);
    } catch (err) {
      const msg = err.message || 'Gagal memuat matriks pembayaran.';
      if (!silent) {
        setLoadError(msg);
        toast.error(msg);
      }
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, [session?.access_token, year, role, toast, isStaff, myUnitId]);

  const getPaymentForBillView = useCallback((billId, preferredPaymentId = null) => {
    if (IS_DEMO) return getPaymentForBill(billId);
    const candidates = productionPayments.filter((payment) => {
        const paymentBillId =
          payment.ipl_bill_id ||
          payment.iplBillId ||
          payment.bill_id ||
          payment.billId ||
          payment._bill?.id ||
          payment.ipl_bill?.id;
        return String(paymentBillId) === String(billId);
      });
    return selectPreferredPayment(candidates, preferredPaymentId);
  }, [productionPayments]);

  const mergePaymentDetails = useCallback((cellPayment, billId, preferredPaymentId = null) => {
    const listPayment = getPaymentForBillView(billId, preferredPaymentId);
    if (!cellPayment) return listPayment;
    if (!listPayment) return cellPayment;

    return {
      ...listPayment,
      ...cellPayment,
      method: cellPayment.method || listPayment.method,
      status: cellPayment.status || listPayment.status,
      proof_file_id: cellPayment.proof_file_id || listPayment.proof_file_id,
      proof_file_url: cellPayment.proof_file_url || listPayment.proof_file_url,
      proof_file_name: cellPayment.proof_file_name || listPayment.proof_file_name,
      receipt_file: cellPayment.receipt_file || listPayment.receipt_file,
      metadata: {
        ...(listPayment.metadata || {}),
        ...(cellPayment.metadata || {}),
      },
    };
  }, [getPaymentForBillView]);

  useEffect(() => {
    loadMatrix();
  }, [loadMatrix, refreshKey]);

  useEffect(() => {
    if (!qrisCheckoutData || IS_DEMO) return undefined;

    let isRefreshing = false;
    const refreshPaymentStatus = async () => {
      if (isRefreshing) return;
      isRefreshing = true;
      try {
        await loadMatrix({ silent: true });
      } finally {
        isRefreshing = false;
      }
    };
    const intervalId = window.setInterval(refreshPaymentStatus, 10000);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void refreshPaymentStatus();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [qrisCheckoutData, loadMatrix]);

  // Resolve unit from the production matrix first. Production unit IDs can
  // overlap with mock IDs, so getUnitById() must only be a demo fallback.
  const findUnitInMatrix = useCallback((unitId) => {
    const row = matrix.find(
      (item) => String(item?.unit?.id) === String(unitId)
    );
    if (row?.unit) return row.unit;
    return IS_DEMO ? getUnitById(unitId) : null;
  }, [matrix]);

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
    if (!bill || bill.status === 'paid') return false;
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
        const u = findUnitInMatrix(activeUnitId);
        toast.warning(
          u
            ? `Selesaikan dulu transaksi untuk ${u.block} no ${u.unit_number}, atau kosongkan seleksi sebelum memilih unit lain.`
            : 'Selesaikan dulu transaksi unit yang sedang dipilih, atau kosongkan seleksi sebelum memilih unit lain.'
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
    if (!canWrite) {
      toast.error('Akun read-only tidak dapat membuat pembayaran.');
      return;
    }
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
        const data = await createQrisPayment(session?.access_token, {
          bill_ids: payModal.map((bill) => bill.id),
          provider: 'doku',
        });
        setQrisCheckoutData({
          ...data,
          bills: (data.bills?.length && typeof data.bills[0] === 'object') ? data.bills : payModal,
          payments: data.payments || [],
          total: data.total_amount || totalToPay,
        });
        setSelected({});
        setPayModal(null);
        void loadMatrix({ silent: true });
        toast.success(IS_DEMO ? 'Simulasi QRIS berhasil dibuat.' : 'Checkout QRIS berhasil dibuat.');
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
    if (!canWrite && !canUseQris) {
      toast.error('Akun read-only tidak dapat mencatat pembayaran.');
      return;
    }
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
      const u = findUnitInMatrix([...unitIds][0]);
      toast.warning(
        u
          ? `Pilih tagihan dari satu rumah/unit saja dalam satu transaksi (aktif: ${u.block} no ${u.unit_number}).`
          : 'Pilih tagihan dari satu rumah/unit saja dalam satu transaksi.'
      );
      return;
    }
    setManualModal({
      bills: validBills,
      unit: findUnitInMatrix(validBills[0].unit_id),
    });
  };

  const confirmManual = async ({ method, paidAt, note, receiptFile }) => {
    const methodLabel =
      method === 'cash' ? 'tunai' : method === 'bank_transfer' ? 'transfer' : 'QRIS';
    const noteWithDate = [note?.trim(), `Tanggal diterima: ${paidAt}`].filter(Boolean).join(' | ');
    let completedCount = 0;
    try {
      if (method !== 'qris' && !canWrite) {
        toast.error('Akun read-only hanya diizinkan melakukan pembayaran melalui QRIS.');
        return;
      }
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
        if (method === 'qris') {
          const data = await createQrisPayment(session?.access_token, {
            bill_ids: manualModal.bills.map((bill) => bill.id),
            provider: 'doku',
          });
          setQrisCheckoutData({
            ...data,
            bills: (data.bills?.length && typeof data.bills[0] === 'object') ? data.bills : manualModal.bills,
            payments: data.payments || [],
            total: data.total_amount || manualModal.bills.reduce(
              (sum, bill) => sum + Number(bill.amount || 0) + Number(bill.late_fee || 0),
              0
            ),
          });
          setSelected({});
          setManualModal(null);
          void loadMatrix({ silent: true });
          toast.success(IS_DEMO ? 'Simulasi QRIS berhasil dibuat.' : 'Checkout QRIS berhasil dibuat.');
          return;
        } else if (method === 'cash') {
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

  const handleCleanupAllData = async () => {
    if (isReadOnly) {
      toast.warning('⚠️ Tindakan pembersihan data dinonaktifkan untuk akun Admin Demo (View-Only).');
      return;
    }
    const confirmMsg =
      '⚠️ APAPUN YANG DIHAPUS TIDAK DAPAT DIKEMBALIKAN!\n\n' +
      'Apakah Anda yakin ingin menghapus:\n' +
      '1. Semua data transaksi pembayaran IPL masuk\n' +
      '2. Semua data pengeluaran (expenses)\n' +
      '3. Semua file bukti transfer/kwitansi di Google Drive\n' +
      '4. Reset status seluruh tagihan IPL menjadi unpaid?\n\n' +
      'Ketik OK untuk melanjutkan.';

    const userResponse = window.prompt(confirmMsg);
    if (userResponse !== 'OK') {
      toast.info('Pembersihan data dibatalkan.');
      return;
    }

    try {
      toast.info('Pembersihan total sedang berjalan...');
      const result = await portalApiPost('/payments/list', {
        token: session?.access_token,
        body: { action: 'CLEANUP_ALL' }
      });
      console.log('Cleanup result:', result);
      toast.success('Pembersihan total berhasil! Seluruh transaksi dan file GDrive telah dihapus.');
      loadMatrix();
    } catch (err) {
      console.error('Cleanup error:', err);
      toast.error('Pembersihan gagal: ' + (err.message || 'Error tidak diketahui'));
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
        <div className="flex items-center gap-2">
          {isBendaharaOrAbove(role) && (
            <button
              onClick={handleCleanupAllData}
              className="pv-btn bg-red-600 hover:bg-red-700 text-white text-xs font-semibold px-3 py-2 rounded-lg flex items-center gap-1.5 shadow-sm"
              title="Hapus semua transaksi & file bukti di Google Drive"
            >
              <span>🗑️</span>
              <span>Reset & Hapus Semua Transaksi</span>
            </button>
          )}
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
          <span className="h-3 w-3 rounded bg-gray-100 border border-gray-300"></span> Dibatalkan
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
                  const residentNames = (Array.isArray(row.residents) && row.residents.length > 0
                    ? row.residents
                    : row.resident
                      ? [row.resident]
                      : [])
                    .map((resident) => resident?.full_name?.trim())
                    .filter(Boolean);
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
                        <p
                          className="text-[10px] leading-tight text-forest-500 max-w-[180px] break-words"
                          title={residentNames.join(' / ')}
                        >
                          {residentNames.length > 0 ? residentNames.join(' / ') : '— Belum Ada Pemilik —'}
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
                        const targetPeriod = matrixMonths[mIdx]?.period;
                        const matchedCell =
                          (cell && cell.bill && cell.bill.period === targetPeriod)
                            ? cell
                            : (Array.isArray(row.cells)
                                ? row.cells.find((c) => c?.bill?.period === targetPeriod)
                                : null) || cell;
                        const isSelected = matchedCell?.bill ? isBillSelected(matchedCell.bill.id) : false;
                        return (
                          <td key={mIdx} className="px-1 py-1 text-center">
                            <Cell
                              cell={matchedCell}
                              unitId={row.unit.id}
                              isSelected={isSelected}
                              isStaff={isStaff}
                              canInteract={canInteract}
                              isLockedOtherUnit={isLockedOtherUnit}
                              onClick={() => {
                                if (
                                  matchedCell?.status === 'paid' ||
                                  matchedCell?.status === 'pending_verification' ||
                                  matchedCell?.status === 'rejected' ||
                                  matchedCell?.payment?.status === 'rejected'
                                ) {
                                  const payment = mergePaymentDetails(
                                    matchedCell.payment,
                                    matchedCell.bill.id,
                                    matchedCell.bill.payment_id
                                  );
                                  setDetailModal({ bill: matchedCell.bill, payment, unit: row.unit });
                                  return;
                                }
                                // Cancelled/failed/expired: allow selecting for re-payment
                                if (!canInteract || isLockedOtherUnit) return;
                                toggleCell(matchedCell?.bill);
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
                    const u = findUnitInMatrix(activeUnitId);
                    return u ? `${u.block} no ${u.unit_number}` : '';
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
              <button onClick={handleStaffPay} disabled={!canWrite && !canUseQris} className="pv-btn-primary text-sm disabled:opacity-50">
                {isDemoAdmin ? 'Bayar via QRIS →' : 'Catat Pembayaran →'}
              </button>
            ) : (
              <button onClick={handlePay} className="pv-btn-primary text-sm">
                Lanjutkan Pembayaran →
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
          canUseQris={canUseQris}
          onConfirm={confirmPay}
          onClose={() => setPayModal(null)}
        />
      )}

      {/* Modal input manual (staff, multi-bulan) */}
      {manualModal && (
        <ManualPaymentModal
          bills={manualModal.bills}
          unit={manualModal.unit}
          role={role}
          canWrite={canWrite}
          canUseQris={canUseQris}
          onConfirm={confirmManual}
          onClose={() => setManualModal(null)}
        />
      )}

      {qrisCheckoutData && (
        <QrisCheckoutModal
          data={qrisCheckoutData}
          provider={qrisCheckoutData.provider || 'doku'}
          onCancel={() => {
            setQrisCheckoutData(null);
            toast.info('Pembayaran QRIS ditutup. Anda dapat memilih metode pembayaran lain kapan saja.');
            void loadMatrix({ silent: true });
          }}
          onConfirm={async () => {
            const billIds = (qrisCheckoutData.bills || []).map((b) => (typeof b === 'object' ? b.id : b));
            if (IS_DEMO || qrisCheckoutData.demo) {
              if (isStaffRole(role)) {
                for (const billId of billIds) {
                  recordManualPayment(billId, {
                    method: 'qris',
                    paidAt: new Date().toISOString().split('T')[0],
                    recordedBy: profile?.full_name || 'Staff',
                    note: 'Pembayaran QRIS (Simulasi)',
                    recorderRole: role,
                  });
                }
              } else {
                recordResidentPayment(billIds, {
                  method: 'qris',
                  payerName: profile?.full_name || 'Warga',
                  note: 'Pembayaran QRIS (Simulasi)',
                });
              }
              toast.success('Pembayaran QRIS berhasil dikonfirmasi (Simulasi).');
            } else {
              try {
                let verification = null;
                let transactionStatus = '';
                let fraudStatus = '';
                const checkoutProvider = qrisCheckoutData.provider || 'doku';
                const checkoutProviderLabel = getQrisProviderLabel(checkoutProvider);

                for (let attempt = 0; attempt < 6; attempt += 1) {
                  verification = await verifyQrisPayment(session?.access_token, {
                    parent_order_id: qrisCheckoutData.parent_order_id,
                    provider: checkoutProvider,
                  });
                  transactionStatus = String(verification?.transaction_status || '').toLowerCase();
                  fraudStatus = String(verification?.fraud_status || '').toLowerCase();

                  if (transactionStatus !== 'pending' || attempt === 5) break;
                  await new Promise(resolve => window.setTimeout(resolve, 3000));
                }

                if (transactionStatus === 'settlement' || (transactionStatus === 'capture' && fraudStatus === 'accept')) {
                  toast.success('Pembayaran QRIS terverifikasi dan tagihan sudah diperbarui.');
                } else if (transactionStatus === 'pending') {
                  toast.info(`${checkoutProviderLabel} belum menerima konfirmasi lunas. Tagihan akan diperbarui otomatis saat konfirmasi diterima.`);
                } else if (['expire', 'cancel', 'deny', 'failure'].includes(transactionStatus)) {
                  toast.warning('Pembayaran tidak berhasil. Tagihan dapat dibayar ulang.');
                } else {
                  toast.info('Status pembayaran sedang diverifikasi oleh sistem.');
                }
              } catch (err) {
                console.error('Error verifying QRIS payment status:', err);
                const networkError = err?.name === 'TypeError'
                  || /failed to fetch|network error/i.test(String(err?.message || ''));
                toast.info(
                  networkError
                    ? 'Koneksi ke layanan pembayaran gagal. Silakan coba lagi.'
                    : (err?.message || 'Status pembayaran belum dapat diperiksa.')
                );
              }
            }

            setQrisCheckoutData(null);
            void loadMatrix({ silent: false });
          }}
        />
      )}

      {detailModal && (
        <PaymentDetailModal
          bill={detailModal.bill}
          payment={detailModal.payment}
          unit={detailModal.unit}
          role={role}
          myUnitId={myUnitId}
          profile={profile}
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
  const isCancelled = status === 'cancelled';
  const isFailed = status === 'failed';
  const isExpired = status === 'expired';
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

  // Sel CANCELLED / FAILED / EXPIRED → tampilkan status dan bisa diklik untuk bayar ulang
  if (isCancelled || isFailed || isExpired) {
    const bgClass = 'bg-gray-100 border border-gray-300 hover:bg-gray-200 text-gray-500';
    const label = isCancelled ? '↩ Batal' : isFailed ? '✕ Gagal' : '⏰ Expired';

    return (
      <span
        onClick={onClick}
        className={`block h-12 rounded ${bgClass} flex flex-col items-center justify-center px-0.5 cursor-pointer transition-colors`}
        title={`${billStatusLabel(status)} — klik untuk bayar ulang`}
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
function ResidentPayModal({ bills, total, canUseQris, onConfirm, onClose }) {
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
          <div className={`grid ${canUseQris ? 'grid-cols-2' : 'grid-cols-1'} gap-2`}>
            {canUseQris && (
              <button
                type="button"
                onClick={() => { setMethod('qris'); setUploadError(''); setReceiptFile(null); }}
                className={`py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                  method === 'qris'
                    ? 'bg-forest-800 text-gold-400 border-forest-800'
                    : 'bg-white text-forest-600 border-forest-200 hover:bg-forest-50'
                }`}
              >
                💳 QRIS (DOKU)
              </button>
            )}
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

        {method === 'qris' && (
          <div className="rounded-lg border border-gold-200 bg-gold-50 p-3 text-xs text-gold-800">
            QRIS akan dibuka melalui checkout DOKU. Setelah pembayaran terkonfirmasi, status tagihan diperbarui otomatis dan kuitansi dikirim ke email.
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
            {isSubmitting ? 'Memproses...' : method === 'qris' ? 'Lanjut ke QRIS' : 'Kirim Bukti Transfer'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── Modal input manual (bendahara, multi-bulan lintas tahun) ───────
// Staff can record transfer proof for residents who cannot use the app yet.
// Cash remains limited to bendahara/admin.
function ManualPaymentModal({ bills, unit, role, canWrite, canUseQris, onConfirm, onClose }) {
  const canRecordCash = isBendaharaOrAbove(role) && canWrite;
  const canRecordTransfer = canWrite;
  const methodCount = Number(canRecordCash) + Number(canRecordTransfer) + Number(canUseQris);
  const [method, setMethod] = useState(
    canRecordCash ? 'cash' : canRecordTransfer ? 'bank_transfer' : 'qris'
  );
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
  const unitLabel = unit ? `${unit.block} no ${unit.unit_number}` : '';
  const isMulti = bills.length > 1;
  const needsReceipt = method !== 'qris';

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
          <div className={`grid ${methodCount >= 3 ? 'grid-cols-3' : methodCount === 2 ? 'grid-cols-2' : 'grid-cols-1'} gap-2`}>
            {canRecordCash && methodBtn('cash', '💵 Tunai')}
            {canRecordTransfer && methodBtn('bank_transfer', '🏦 Transfer')}
            {canUseQris && methodBtn('qris', 'QRIS')}
          </div>
        </div>

        {method !== 'qris' && (
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
        )}

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

        {method === 'qris' && (
          <div className="rounded-lg border border-gold-200 bg-gold-50 p-3 text-xs text-gold-800">
            QRIS akan dibuka melalui checkout DOKU. Pembayaran dicatat untuk unit yang dipilih dan dikonfirmasi otomatis.
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
            {isSubmitting ? 'Memproses...' : method === 'qris' ? 'Lanjut ke QRIS' : 'Catat Pembayaran'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// Helper lokal
function formatPeriodShort(period) {
  if (!period || typeof period !== 'string' || !period.includes('-')) return String(period || '-');
  const [y, m] = period.split('-');
  const monthName = MONTHS_LONG[parseInt(m, 10) - 1] || m;
  return `${monthName} ${y}`;
}

function isImagePaymentProof(payment) {
  const mimeType = String(payment?.proof_file_mime_type || payment?.receipt_file_mime_type || '').toLowerCase();
  const fileName = String(
    payment?.proof_file_name ||
    payment?.receipt_file_name ||
    payment?.receipt_file ||
    payment?.receiptFile ||
    ''
  ).toLowerCase();
  const fileUrl = String(
    payment?.proof_file_url ||
    payment?.receipt_file_url ||
    payment?.proof_url ||
    payment?.proof_file_path ||
    ''
  ).toLowerCase();

  return (
    mimeType.startsWith('image/') ||
    /\.(png|jpe?g|webp|gif)(\?.*)?$/i.test(fileName) ||
    /\.(png|jpe?g|webp|gif)(\?.*)?$/i.test(fileUrl) ||
    /drive\.google\.com\/file\/d\/[^/]+/i.test(fileUrl) ||
    /drive\.google\.com\/thumbnail/i.test(fileUrl) ||
    /googleusercontent\.com/i.test(fileUrl) ||
    Boolean(fileUrl && !fileUrl.endsWith('.pdf'))
  );
}

function getPaymentProofPreviewUrl(payment) {
  let sourceUrl =
    payment?.proof_file_url ||
    payment?.receipt_file_url ||
    payment?.proof_url ||
    payment?.proof_file_path ||
    payment?.receipt_file ||
    payment?.metadata?.proof_file_url ||
    payment?.metadata?.drive_url ||
    payment?.metadata?.file_url;

  if (!sourceUrl) return null;

  sourceUrl = String(sourceUrl).trim();

  // 1. Google Drive link
  const driveMatch = sourceUrl.match(/drive\.google\.com\/file\/d\/([^/]+)/i);
  if (driveMatch?.[1] && driveMatch[1] !== 'undefined') {
    // Use the image CDN directly. The Drive thumbnail endpoint redirects to
    // this host, and the direct URL is more reliable inside an <img> preview.
    return `https://lh3.googleusercontent.com/d/${encodeURIComponent(driveMatch[1])}=w1200`;
  }

  // 2. Full HTTP/HTTPS URL
  if (sourceUrl.startsWith('http://') || sourceUrl.startsWith('https://')) {
    return sourceUrl;
  }

  // 3. Supabase Storage relative file path (e.g. "2026-09__unit-13__payment-...")
  const cleanPath = sourceUrl.replace(/^payments\//, '');
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://mzjgliclzihrdjaqzmqg.supabase.co';
  return `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/payments/${encodeURIComponent(cleanPath)}`;
}

function getResolvedPaymentDate(payment, bill) {
  return (
    payment?.paid_at ||
    payment?.paidAt ||
    payment?.completed_at ||
    payment?.completedAt ||
    payment?.verified_at ||
    payment?.verifiedAt ||
    payment?.created_at ||
    payment?.createdAt ||
    payment?.metadata?.paid_at ||
    payment?.metadata?.completed_at ||
    payment?.metadata?.verified_at ||
    bill?.paid_at ||
    bill?.paidAt ||
    bill?.created_at ||
    bill?.due_date ||
    ''
  );
}

// Modal Detail Pembayaran Lunas
// Modal Detail / Verifikasi / Revisi Pembayaran
function PaymentDetailModal({ bill, payment, unit, role, myUnitId, profile, session, onRefresh, onRetry, onClose }) {
  const toast = useToast();
  const [asyncPayment, setAsyncPayment] = useState(null);

  // Selalu fetch data payment lengkap dari backend
  useEffect(() => {
    let isMounted = true;

    if ((bill?.id || bill?.period) && !IS_DEMO) {
      const context = {
        unit_id: unit?.id || bill?.unit_id,
        period: bill?.period,
        payment_id: bill?.payment_id,
      };
      fetchPaymentByBillId(session?.access_token, bill?.id, context)
        .then((fetched) => {
          if (isMounted) setAsyncPayment(fetched || null);
        })
        .catch(() => {});
    }
    return () => { isMounted = false; };
  }, [bill?.id, bill?.period, bill?.unit_id, bill?.payment_id, unit?.id, session?.access_token]);

  // Merge: asyncPayment fields take priority over cellPayment for proof/date fields
  const activePayment = useMemo(() => {
    const base = payment || {};
    const fetched = asyncPayment || {};
    const merged = {
      ...base,
      ...fetched,
      // For these critical fields, prefer fetched (async) over cell payment
      id: fetched.id || base.id,
      status: fetched.status || base.status,
      method: fetched.method || base.method || fetched.payment_method || base.payment_method,
      paid_at: fetched.paid_at || base.paid_at,
      created_at: fetched.created_at || base.created_at,
      proof_file_url: fetched.proof_file_url || base.proof_file_url,
      proof_file_name: fetched.proof_file_name || base.proof_file_name,
      proof_file_path: fetched.proof_file_path || base.proof_file_path,
      receipt_file: fetched.receipt_file || base.receipt_file,
      receipt_file_url: fetched.receipt_file_url || base.receipt_file_url,
      ipl_bill_id: fetched.ipl_bill_id || base.ipl_bill_id,
      resident_id: fetched.resident_id || base.resident_id,
      metadata: {
        ...(base.metadata || {}),
        ...(fetched.metadata || {}),
      },
    };
    // If neither payment nor asyncPayment has any data, return null
    if (!payment && !asyncPayment) return null;
    return merged;
  }, [payment, asyncPayment]);


  const resolvedBill = bill;
  const targetUnit = unit || (IS_DEMO && bill?.unit_id ? getUnitById(bill.unit_id) : null);
  const resolvedUnitId = targetUnit?.id ?? bill?.unit_id ?? activePayment?.unit_id;

  const isMyUnit =
    (myUnitId && String(resolvedUnitId) === String(myUnitId)) ||
    (profile?.email && targetUnit?._occupant?.email && String(profile.email).toLowerCase() === String(targetUnit._occupant.email).toLowerCase()) ||
    (profile?.id && bill?.resident_id && String(bill.resident_id) === String(profile.id)) ||
    (profile?.id && activePayment?.resident_id && String(activePayment.resident_id) === String(profile.id));

  const canViewReceipt = isStaffRole(role) || isMyUnit;
  const canVerify = isBendaharaOrAbove(role) && canModifyData(role);
  const paymentMethod = activePayment?.method || activePayment?.payment_method || activePayment?.paymentMethod;

  let proofFileUrl =
    activePayment?.proof_file_url ||
    activePayment?.receipt_file_url ||
    activePayment?.proof_url ||
    activePayment?.proof_file_path ||
    activePayment?.file_url ||
    activePayment?.metadata?.proof_file_url ||
    activePayment?.metadata?.receipt_file_url ||
    activePayment?.metadata?.file_url ||
    activePayment?.metadata?.drive_url ||
    activePayment?.metadata?.proof_file_path ||
    '';

  let proofFileName =
    activePayment?.proof_file_name ||
    activePayment?.receipt_file_name ||
    activePayment?.receipt_file ||
    activePayment?.receiptFile ||
    activePayment?.metadata?.proof_file_name ||
    activePayment?.metadata?.receipt_file_name ||
    '';

  if (!proofFileName && proofFileUrl) {
    const cleanUrl = String(proofFileUrl).split('?')[0];
    const segment = cleanUrl.split('/').pop();
    proofFileName = (segment && segment.includes('.')) ? segment : 'Bukti Transfer';
  }

  if (!proofFileUrl && proofFileName && (proofFileName.startsWith('http://') || proofFileName.startsWith('https://'))) {
    proofFileUrl = proofFileName;
  }

  const hasProofFile = Boolean(proofFileUrl || proofFileName);
  const proofPreviewPayment = { ...activePayment, proof_file_url: proofFileUrl, proof_file_name: proofFileName };
  const proofPreviewUrl = getPaymentProofPreviewUrl(proofPreviewPayment);
  const canPreviewProofImage = Boolean(proofPreviewUrl && isImagePaymentProof(proofPreviewPayment));
  const resolvedPaidAt = getResolvedPaymentDate(activePayment, resolvedBill);

  const missingProofText =
    paymentMethod === 'qris'
      ? 'Tidak ada file bukti karena pembayaran QRIS diproses otomatis.'
      : paymentMethod === 'cash'
      ? 'Tidak ada file bukti untuk pembayaran tunai.'
      : 'Tidak ada file bukti transfer yang tersimpan.';

  const [isRevising, setIsRevising] = useState(false);
  const [newReceipt, setNewReceipt] = useState(null);
  const [reviseNote, setReviseNote] = useState(payment?.metadata?.note || '');
  const [uploadError, setUploadError] = useState('');
  const [isActing, setIsActing] = useState(false);
  const [proofPreviewError, setProofPreviewError] = useState(false);
  const [isProofPreviewOpen, setIsProofPreviewOpen] = useState(false);

  useEffect(() => {
    setProofPreviewError(false);
    setIsProofPreviewOpen(false);
  }, [payment?.id, proofFileUrl]);

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

  const handleCancel = async () => {
    if (!payment) return;
    if (!confirm('Yakin ingin membatalkan transaksi ini? Tagihan akan kembali belum dibayar.')) return;
    setIsActing(true);
    try {
      if (IS_DEMO) {
        cancelPayment(payment.id);
      } else {
        await portalApiPost('/payments/cancel', {
          token: session?.access_token,
          body: { payment_id: payment.id },
        });
      }
      toast.info('Transaksi pembayaran berhasil dibatalkan. Tagihan kembali belum dibayar.');
      if (onRefresh) onRefresh();
      onClose();
    } catch (err) {
      toast.error(err.message || 'Gagal membatalkan pembayaran.');
    } finally {
      setIsActing(false);
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
    <>
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
                  {targetUnit ? `${targetUnit.block} no ${targetUnit.unit_number}` : '-'}
                </p>
              </div>
              <div>
                <p className="text-xs text-forest-500 font-medium">Periode IPL</p>
                <p className="font-semibold text-forest-800">{formatPeriod(resolvedBill.period)}</p>
              </div>
              <div>
                <p className="text-xs text-forest-500 font-medium">Jumlah Tagihan</p>
                <p className="font-bold text-forest-900">{formatRupiah(resolvedBill.amount)}</p>
              </div>
              <div>
                <p className="text-xs text-forest-500 font-medium">Tanggal Bayar</p>
                <p className="font-semibold text-forest-800">{resolvedPaidAt ? formatDate(resolvedPaidAt) : '-'}</p>
              </div>
            </div>

            <div>
              <p className="text-xs text-forest-500 font-medium mb-1">Metode Pembayaran</p>
              <span className="pv-badge bg-forest-100 text-forest-700 font-medium">
                {paymentMethod === 'qris' ? '📱 QRIS' : paymentMethod === 'cash' ? '💵 Tunai' : '🏦 Transfer Bank'}
              </span>
            </div>

            {activePayment?.metadata?.recorded_by && (
              <div>
                <p className="text-xs text-forest-500 font-medium mb-0.5">Dicatat Oleh</p>
                <p className="text-forest-700 text-xs">{activePayment.metadata.recorded_by}</p>
              </div>
            )}

            {activePayment?.metadata?.note && (
              <div>
                <p className="text-xs text-forest-500 font-medium mb-0.5">Catatan</p>
                <p className="text-forest-700 text-xs italic">"{activePayment.metadata.note}"</p>
              </div>
            )}

            {/* Lampiran Bukti Bayar */}
            <div>
              <p className="text-xs text-forest-500 font-medium mb-1.5">Bukti Bayar</p>
              {canViewReceipt ? (
                hasProofFile ? (
                  <>
                    {canPreviewProofImage && !proofPreviewError && (
                      <button
                        type="button"
                        onClick={() => setIsProofPreviewOpen(true)}
                        className="group mb-2 block w-full overflow-hidden rounded-lg border border-forest-200 bg-forest-50 text-left transition-colors hover:border-gold-300 focus:outline-none focus:ring-2 focus:ring-gold-400/40"
                        aria-label="Perbesar bukti transfer"
                      >
                        <div className="flex min-h-36 items-center justify-center bg-forest-100 p-2">
                          <img
                            src={proofPreviewUrl}
                            alt={proofFileName || 'Bukti transfer'}
                            referrerPolicy="no-referrer"
                            className="max-h-52 w-full rounded-md object-contain transition-transform group-hover:scale-[1.01]"
                            onError={() => setProofPreviewError(true)}
                          />
                        </div>
                        <div className="flex items-center justify-between gap-2 border-t border-forest-200 px-3 py-2">
                          <span className="truncate text-xs font-medium text-forest-700">
                            {proofFileName || 'Bukti transfer'}
                          </span>
                          <span className="shrink-0 text-xs font-semibold text-gold-700">
                            Perbesar
                          </span>
                        </div>
                      </button>
                    )}
                    {(!canPreviewProofImage || proofPreviewError) && (
                  <div className="rounded-lg border border-forest-200 bg-white p-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xl">📎</span>
                      <span className="truncate text-xs font-medium text-forest-700">
                        {proofFileName || 'Bukti Lampiran'}
                      </span>
                    </div>
                    <a
                      href={proofFileUrl || '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => {
                        if (!proofFileUrl) {
                          e.preventDefault();
                          alert(`File bukti tercatat: ${proofFileName}`);
                        }
                      }}
                      className="text-xs font-semibold text-forest-800 hover:text-gold-600 transition-colors"
                    >
                      Unduh / Buka 🔗
                    </a>
                  </div>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-forest-400 italic">{missingProofText}</p>
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
          {(resolvedBill.status === 'paid' || payment?.status === 'verified' || payment?.status === 'completed') && (
            <div className="grid grid-cols-2 gap-2 pb-1 border-b border-forest-100">
              <button
                type="button"
                onClick={() => {
                  downloadDigitalReceipt({ bill: resolvedBill, unit: targetUnit });
                }}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-forest-300 bg-white px-3 py-2 text-xs font-semibold text-forest-800 shadow-sm hover:bg-forest-50 transition-colors"
              >
                📥 Download Kuitansi
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!canModifyData(role)) {
                    toast.error('Akun read-only tidak dapat mengirim kuitansi email.');
                    return;
                  }
                  toast.info('Mengirim kuitansi digital ke email...');
                  const res = await sendEmailReceipt({ bill, unit: targetUnit });
                  toast.success(res.message);
                }}
                disabled={!canModifyData(role)}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-gold-300 bg-gold-50 px-3 py-2 text-xs font-semibold text-gold-800 shadow-sm hover:bg-gold-100 transition-colors disabled:opacity-50"
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

          {payment?.status === 'rejected' && (isMyUnit || isStaffRole(role)) && !isRevising && canModifyData(role) && (
            <div className="flex gap-2">
              <button type="button" onClick={() => setIsRevising(true)} className="pv-btn-primary flex-1 text-xs">
                🔄 Revisi & Upload Ulang
              </button>
              <button type="button" onClick={handleCancel} disabled={isActing} className="pv-btn-ghost flex-1 text-xs border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50">
                🗑 Batalkan
              </button>
            </div>
          )}

          {payment?.status === 'pending_verification' && (isMyUnit || isStaffRole(role)) && canModifyData(role) && (
            <button type="button" onClick={handleCancel} disabled={isActing} className="pv-btn-ghost w-full text-xs border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50">
              🗑 Batalkan Pembayaran
            </button>
          )}

          <button type="button" onClick={onClose} className="pv-btn-ghost w-full text-sm">
            Tutup
          </button>
        </div>
      </div>
    </Modal>

      {isProofPreviewOpen && proofPreviewUrl && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-3 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label="Preview bukti transfer"
          onClick={() => setIsProofPreviewOpen(false)}
        >
          <button
            type="button"
            onClick={() => setIsProofPreviewOpen(false)}
            className="absolute right-3 top-3 rounded-lg bg-white/95 px-3 py-2 text-xs font-semibold text-forest-900 shadow-lg hover:bg-white sm:right-5 sm:top-5"
          >
            Tutup
          </button>
          <img
            src={proofPreviewUrl}
            alt={proofFileName || 'Bukti transfer'}
            referrerPolicy="no-referrer"
            className="max-h-[92vh] max-w-[96vw] rounded-lg bg-white object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            onError={() => {
              setProofPreviewError(true);
              setIsProofPreviewOpen(false);
            }}
          />
        </div>
      )}
    </>
  );
}

// ── Modal Instuksi QRIS ─────────────────────────
function QrisCheckoutModal({ data, provider, onConfirm, onCancel, onClose }) {
  const total = data.total_amount || data.total || 0;
  const redirectUrl = data.redirect_url;
  const qrContent = data.qr_content || data.qrContent || data.raw?.qrContent;
  const providerLabel = getQrisProviderLabel(provider || data.provider);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCancelAction = onCancel || onClose || (() => {});
  const handleConfirmAction = onConfirm || onClose || (() => {});

  const handleDone = async () => {
    setIsSubmitting(true);
    try {
      await handleConfirmAction();
    } finally {
      setIsSubmitting(false);
    }
  };

  const qrImageUrl = qrContent
    ? `https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=8&data=${encodeURIComponent(qrContent)}`
    : null;

  return (
    <Modal open onClose={handleCancelAction} title="Menunggu Pembayaran QRIS" size="md">
      <div className="space-y-4 text-center py-2">
        <div className="mx-auto h-12 w-12 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 text-xl font-bold">
          QR
        </div>
        <div>
          <h3 className="text-sm font-semibold text-forest-900">Scan QRIS Untuk Membayar</h3>
          <p className="text-xs text-forest-500 mt-1">
            {`Transaksi QRIS Anda telah berhasil dibuat via ${providerLabel}.`}
          </p>
        </div>

        {qrImageUrl && (
          <div className="flex flex-col items-center justify-center py-2 bg-white rounded-xl border border-forest-100 shadow-sm p-4">
            <img
              src={qrImageUrl}
              alt="QRIS Code"
              className="w-56 h-56 rounded-lg shadow-inner border border-gray-200"
            />
            <p className="text-[11px] text-forest-500 mt-2 font-medium">
              Arahkan kamera e-wallet / mobile banking ke QR Code di atas
            </p>
          </div>
        )}

        <div className="rounded-lg bg-forest-50 p-3 text-left text-xs space-y-1">
          <div className="flex justify-between">
            <span className="text-forest-500">Order ID:</span>
            <span className="font-semibold text-forest-800">{data.parent_order_id}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-forest-500">Total Nominal:</span>
            <span className="font-bold text-forest-900">{formatRupiah(total)}</span>
          </div>
          {data.bills?.length > 0 && (
            <div className="pt-1.5 border-t border-forest-200">
              <p className="text-forest-500 font-medium mb-1">Tagihan Periode:</p>
              <div className="flex flex-wrap gap-1">
                {data.bills.map((b, idx) => {
                  const period = typeof b === 'object' ? b.period : b;
                  return (
                    <span key={typeof b === 'object' ? (b.id || idx) : idx} className="px-2 py-0.5 rounded bg-forest-100 text-forest-800 font-medium">
                      {formatPeriodShort(period)}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-gold-200 bg-gold-50 p-3.5 text-xs text-left text-gold-800">
          <p className="font-semibold">⚠️ Catatan Pembayaran:</p>
          <ul className="list-disc pl-4 mt-1 space-y-1">
            <li>Gunakan aplikasi e-wallet (GoPay, OVO, ShopeePay, Dana, LinkAja, BCA Mobile, dll.) untuk memindai QRIS.</li>
            <li>Setelah pembayaran berhasil di HP Anda, sistem akan mengonfirmasi otomatis via webhook.</li>
            <li>Klik tombol di bawah setelah selesai melakukan pembayaran di aplikasi Anda.</li>
          </ul>
        </div>

        <div className="flex flex-col gap-2 pt-2">
          {redirectUrl && (
            <a
              href={redirectUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="pv-btn-primary text-center py-2.5 font-bold shadow-md"
            >
              Buka Halaman Pembayaran 🔗
            </a>
          )}
          <button
            type="button"
            disabled={isSubmitting}
            onClick={handleDone}
            className="pv-btn-primary w-full text-sm py-2.5 font-bold shadow-md disabled:opacity-50 mt-1"
          >
            {isSubmitting ? '🔄 Memeriksa Status Pembayaran...' : '✓ Saya Sudah Selesai Membayar'}
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={handleCancelAction}
            className="w-full py-2 px-3 text-xs font-semibold text-forest-600 hover:text-red-600 hover:bg-red-50 rounded-lg border border-forest-200 transition"
          >
            ✕ Batalkan Pembayaran (Batal / Ganti Metode)
          </button>
        </div>
      </div>
    </Modal>
  );
}
