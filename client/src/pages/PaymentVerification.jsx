import { useState, useMemo, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import {
  fetchPayments,
  fetchBillMatrix,
  fetchUnits,
  fetchResidents,
  approveManualPayment,
  rejectManualPayment,
  updatePayment,
  IS_DEMO,
} from '../services/dataService';
import {
  formatRupiah,
  formatDate,
  formatPeriod,
  isBendaharaOrAbove,
  canModifyData,
  normalizePaymentStatus,
  isPendingVerificationStatus,
} from '../services/dataHelpers';
import {
  getUnitById,
  getProfileById,
  mockIPLBills,
  getPendingPayments,
  verifyPayment,
  rejectPayment,
  mockPayments,
  downloadDigitalReceipt,
  sendEmailReceipt,
} from '../services/mockData';
import { AiOutlineCheck, AiOutlineClose, AiOutlineEye, AiOutlineClockCircle, AiOutlineEdit } from 'react-icons/ai';
import { useToast } from '../hooks/useToast';

const TABS = [
  { key: 'pending', label: 'Menunggu' },
  { key: 'verified', label: 'Terverifikasi' },
  { key: 'rejected', label: 'Ditolak' },
];

function isImageReceipt(payment) {
  const mimeType = String(payment?.proof_file_mime_type || '').toLowerCase();
  const fileName = String(payment?.proof_file_name || payment?.receipt_file || '').toLowerCase();
  return mimeType.startsWith('image/') || /\.(png|jpe?g|webp|gif)(\?.*)?$/.test(fileName);
}

function getReceiptPreviewUrl(payment) {
  const sourceUrl = payment?.proof_file_url;
  if (!sourceUrl) return null;

  const driveMatch = String(sourceUrl).match(/drive\.google\.com\/file\/d\/([^/]+)/i);
  if (driveMatch?.[1] && driveMatch[1] !== 'undefined') {
    return `https://drive.google.com/thumbnail?id=${encodeURIComponent(driveMatch[1])}&sz=w1200`;
  }

  return sourceUrl;
}

function currentBillingYear() {
  const now = new Date();
  return now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
}

function pendingPaymentsFromMatrix(matrixRows) {
  if (!Array.isArray(matrixRows)) return [];

  return matrixRows.flatMap((row) =>
    (Array.isArray(row?.cells) ? row.cells : []).flatMap((cell) => {
      const bill = cell?.bill;
      if (!bill) return [];

      const source = cell.payment || {};
      const paymentStatus = normalizePaymentStatus(source.status, {
        method: source.method || source.payment_method,
        hasProof: Boolean(source.proof_file_url || source.proof_file_name || source.receipt_file),
      });
      const cellStatus = cell.status || bill.status;
      if (!isPendingVerificationStatus(cellStatus) && !isPendingVerificationStatus(paymentStatus)) {
        return [];
      }

      const paymentId = source.id || source.payment_id || cell.payment_id || bill.payment_id;
      if (!paymentId) return [];

      return [{
        ...source,
        id: paymentId,
        ipl_bill_id: source.ipl_bill_id || bill.id,
        unit_id: source.unit_id || bill.unit_id || row?.unit?.id,
        resident_id: source.resident_id || row?.resident?.id || '',
        amount: source.amount ?? bill.amount,
        period: source.period || bill.period,
        status: 'pending_verification',
        _bill: source._bill || bill,
        _profile: source._profile || row?.resident,
      }];
    })
  );
}

function mergePaymentSources(payments, matrixRows) {
  const merged = Array.isArray(payments) ? [...payments] : [];
  const indexByKey = new Map();

  merged.forEach((payment, index) => {
    const key = payment?.id
      ? `payment:${payment.id}`
      : payment?.ipl_bill_id
        ? `bill:${payment.ipl_bill_id}`
        : null;
    if (key) indexByKey.set(String(key), index);
  });

  pendingPaymentsFromMatrix(matrixRows).forEach((matrixPayment) => {
    const paymentKey = `payment:${matrixPayment.id}`;
    const billKey = `bill:${matrixPayment.ipl_bill_id}`;
    const existingIndex = indexByKey.get(paymentKey) ?? indexByKey.get(billKey);
    if (existingIndex === undefined) {
      indexByKey.set(paymentKey, merged.length);
      indexByKey.set(billKey, merged.length);
      merged.push(matrixPayment);
      return;
    }

    merged[existingIndex] = {
      ...matrixPayment,
      ...merged[existingIndex],
      status: 'pending_verification',
      _bill: merged[existingIndex]._bill || matrixPayment._bill,
      _profile: merged[existingIndex]._profile || matrixPayment._profile,
    };
  });

  return merged;
}

export default function PaymentVerification() {
  const { role, profile, session, isReadOnly } = useAuth();
  const toast = useToast();
  const canWrite = canModifyData(role) && !isReadOnly;
  const [refreshKey, setRefreshKey] = useState(0);
  const [activeTab, setActiveTab] = useState('pending');
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [modalMode, setModalMode] = useState(null); // 'detail' | 'reject' | 'edit'
  const [rejectReason, setRejectReason] = useState('');
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    method: 'bank_transfer',
    paid_at: '',
    note: '',
    file: null,
  });
  const [activeActionId, setActiveActionId] = useState(null);
  const [receiptPreviewError, setReceiptPreviewError] = useState(false);

  const [payments, setPayments] = useState([]);
  const [units, setUnits] = useState([]);
  const [residents, setResidents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const loadData = async () => {
      try {
        setIsLoading(true);
        if (IS_DEMO) {
          // Demo mode uses mock data directly
          const mockPay = getPendingPayments(); // Just to load mockData module
          setPayments(mockPayments);
          setUnits([]);
          setResidents([]);
        } else {
          // Prod mode fetches from API & Supabase
          const [payData, unitData, resData, matrixData] = await Promise.all([
            fetchPayments(session?.access_token),
            fetchUnits(session?.access_token),
            fetchResidents(session?.access_token),
            fetchBillMatrix(session?.access_token, currentBillingYear()).catch(() => []),
          ]);
          if (active) {
            setPayments(mergePaymentSources(payData, matrixData));
            setUnits(unitData);
            setResidents(resData);
          }
        }
      } catch (err) {
        toast.error('Gagal mengambil data verifikasi.');
      } finally {
        if (active) setIsLoading(false);
      }
    };
    loadData();
    return () => { active = false; };
  }, [refreshKey, session?.access_token]);

  useEffect(() => {
    setReceiptPreviewError(false);
  }, [selectedPayment?.id]);

  const getUnit = (unitId) => {
    return units.find(u => u.id === unitId) || getUnitById(unitId);
  };

  const getResident = (residentId) => {
    return residents.find(r => r.id === residentId) || getProfileById(residentId);
  };

  const pendingPayments = useMemo(
    () => payments.filter((p) => isPendingVerificationStatus(p.status)),
    [payments]
  );

  const verifiedPayments = useMemo(
    () => payments.filter((p) => p.status === 'verified'),
    [payments]
  );

  const rejectedPayments = useMemo(
    () => payments.filter((p) => p.status === 'rejected'),
    [payments]
  );

  // Guard: Bendahara+ only
  if (!isBendaharaOrAbove(role)) {
    return <Navigate to="/" replace />;
  }

  const currentList =
    activeTab === 'pending'
      ? pendingPayments
      : activeTab === 'verified'
      ? verifiedPayments
      : rejectedPayments;

  const handleVerify = async (payment) => {
    if (!canWrite) {
      toast.error('Akun read-only tidak dapat memverifikasi pembayaran.');
      return;
    }
    if (!payment || activeActionId) return;
    setActiveActionId(payment.id);
    try {
      if (IS_DEMO) {
        verifyPayment(payment.id, { verifiedBy: profile.full_name });
      } else {
        await approveManualPayment(session?.access_token, { payment_id: payment.id });
      }
      toast.success('Pembayaran berhasil diverifikasi.');
      setRefreshKey((k) => k + 1);
      setSelectedPayment(null);
      setModalMode(null);
    } catch (err) {
      toast.error(err.message || 'Gagal memverifikasi pembayaran.');
    } finally {
      setActiveActionId(null);
    }
  };

  const openRejectModal = (payment) => {
    if (!canWrite) {
      toast.error('Akun read-only tidak dapat menolak pembayaran.');
      return;
    }
    setSelectedPayment(payment);
    setModalMode('reject');
    setRejectReason('');
  };

  const handleReject = async () => {
    if (!canWrite || !selectedPayment || activeActionId) return;
    if (!rejectReason.trim()) {
      toast.error('Silakan isi alasan penolakan.');
      return;
    }
    setActiveActionId(selectedPayment.id);
    try {
      if (IS_DEMO) {
        rejectPayment(selectedPayment.id, {
          rejectedBy: profile.full_name,
          reason: rejectReason,
        });
      } else {
        await rejectManualPayment(session?.access_token, { payment_id: selectedPayment.id, note: rejectReason });
      }
      toast.warning('Pembayaran ditolak.');
      setRefreshKey((k) => k + 1);
      setSelectedPayment(null);
      setModalMode(null);
    } catch (err) {
      toast.error(err.message || 'Gagal menolak pembayaran.');
    } finally {
      setActiveActionId(null);
    }
  };

  const openDetail = (payment) => {
    setSelectedPayment(payment);
    setModalMode('detail');
  };

  const openEditModal = (payment) => {
    if (!canWrite) {
      toast.error('Akun read-only tidak dapat mengubah pembayaran.');
      return;
    }
    setSelectedPayment(payment);
    setPaymentForm({
      amount: payment.amount ?? '',
      method: payment.method || 'bank_transfer',
      paid_at: payment.paid_at ? String(payment.paid_at).slice(0, 10) : '',
      note: payment.metadata?.note || '',
      file: null,
    });
    setModalMode('edit');
  };

  const handleUpdatePayment = async (event) => {
    event.preventDefault();
    if (!canWrite || !selectedPayment || activeActionId) return;
    if (!paymentForm.amount || Number(paymentForm.amount) <= 0) {
      toast.error('Nominal pembayaran harus lebih besar dari 0.');
      return;
    }
    if (!paymentForm.paid_at) {
      toast.error('Tanggal pembayaran wajib diisi.');
      return;
    }

    setActiveActionId(selectedPayment.id);
    try {
      await updatePayment(session?.access_token, {
        payment_id: selectedPayment.id,
        ...paymentForm,
      });
      toast.success('Detail pembayaran berhasil diperbarui.');
      setModalMode(null);
      setSelectedPayment(null);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      toast.error(err.message || 'Gagal memperbarui pembayaran.');
    } finally {
      setActiveActionId(null);
    }
  };

  const closeModal = () => {
    setSelectedPayment(null);
    setModalMode(null);
  };

  function getBillPeriod(payment) {
    // Production: use joined _bill.period data from fetchPayments API response
    if (payment._bill?.period) return payment._bill.period;
    // Demo mode fallback: lookup from mockIPLBills
    if (IS_DEMO) {
      const bill = mockIPLBills.find((b) => b.id === payment.ipl_bill_id);
      return bill?.period || '';
    }
    return '';
  }

  const selectedReceiptPreviewUrl = getReceiptPreviewUrl(selectedPayment);

  return (
    <div className="mx-auto max-w-4xl space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-lg font-bold text-forest-900 sm:text-xl">
            <AiOutlineCheck className="shrink-0 text-gold-600" /> Verifikasi Pembayaran
          </h1>
          <p className="mt-1 text-sm leading-5 text-forest-500">
            Verifikasi bukti transfer pembayaran IPL dari warga
          </p>
        </div>
        {pendingPayments.length > 0 && (
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-orange-100 px-3 py-1.5 text-xs font-semibold text-orange-800 sm:text-sm">
            <AiOutlineClockCircle />
            {pendingPayments.length} Menunggu
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-3 gap-1 rounded-lg bg-forest-100 p-1">
        {TABS.map((tab) => {
          const TabIcon = tab.key === 'pending'
            ? AiOutlineClockCircle
            : tab.key === 'verified'
              ? AiOutlineCheck
              : AiOutlineClose;
          const count =
            tab.key === 'pending'
              ? pendingPayments.length
              : tab.key === 'verified'
              ? verifiedPayments.length
              : rejectedPayments.length;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`relative flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-md px-1 py-2 text-[11px] transition-all sm:flex-row sm:gap-1.5 sm:py-2.5 sm:text-sm ${
                activeTab === tab.key
                  ? 'bg-forest-800 text-gold-400 font-semibold shadow-sm'
                  : 'text-forest-600 hover:text-forest-800'
              }`}
            >
              <TabIcon className="text-base sm:text-sm" aria-hidden="true" />
              <span className="truncate sm:hidden">{tab.key === 'verified' ? 'Selesai' : tab.label}</span>
              <span className="hidden truncate sm:inline">{tab.label}</span>
              {count > 0 && (
                <span className={`absolute right-1 top-1 min-w-4 rounded-full px-1 py-0.5 text-center text-[9px] font-bold sm:static sm:ml-1 sm:px-1.5 sm:text-[10px] ${
                  activeTab === tab.key ? 'bg-gold-500 text-forest-900' : 'bg-forest-200 text-forest-600'
                }`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Payment List */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center space-y-4 p-12 sm:p-20">
          <div className="h-10 w-10 border-4 border-forest-200 border-t-gold-500 rounded-full animate-spin" />
          <p className="text-sm text-forest-500">Memuat data verifikasi pembayaran...</p>
        </div>
      ) : currentList.length === 0 ? (
        <div className="pv-card p-8 text-center sm:p-12">
          <p className="text-sm text-forest-500">
            {activeTab === 'pending'
              ? 'Tidak ada pembayaran yang menunggu verifikasi.'
              : activeTab === 'verified'
              ? 'Belum ada pembayaran yang diverifikasi.'
              : 'Tidak ada pembayaran yang ditolak.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {currentList.map((payment) => {
            const unit = getUnit(payment.unit_id || payment._bill?.unit_id);
            const resident = payment._profile || getResident(payment.resident_id);
            const period = payment.period || payment._bill?.period || getBillPeriod(payment);
            const StatusIcon = payment.status === 'pending_verification'
              ? AiOutlineClockCircle
              : payment.status === 'verified'
                ? AiOutlineCheck
                : AiOutlineClose;

            return (
              <div key={payment.id} className="pv-card p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className={`h-10 w-10 rounded-full flex items-center justify-center font-bold text-base flex-shrink-0 ${
                      payment.status === 'pending_verification'
                        ? 'bg-orange-100 text-orange-700'
                        : payment.status === 'verified'
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-red-100 text-red-700'
                    }`}>
                      <StatusIcon aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="break-words font-semibold text-forest-900">
                        {resident?.full_name || 'Tidak diketahui'}
                      </h3>
                      <p className="mt-0.5 text-xs leading-5 text-forest-500">
                        {unit ? `Blok ${unit.block}/${unit.unit_number}` : '-'} · <strong>{formatPeriod(period)}</strong>
                      </p>
                      <p className="text-sm font-semibold text-forest-800">{formatRupiah(payment.amount)}</p>
                      <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-xs leading-5 text-forest-400 sm:flex sm:flex-wrap">
                        <span>{payment.method === 'cash' ? '💵 Tunai' : '🏦 Transfer Bank'}</span>
                        <span>📅 {formatDate(payment.paid_at)}</span>
                        {(payment.proof_file_url || payment.receipt_file) && (
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
                            className="col-span-2 flex min-w-0 items-center gap-1 text-gold-600 hover:underline"
                          >
                            <span className="truncate">📎 {payment.proof_file_name || payment.receipt_file || 'Bukti pembayaran'}</span>
                          </a>
                        )}
                      </div>
                      {payment.metadata?.note && (
                        <p className="mt-1 break-words text-xs leading-5 text-forest-400 italic">"{payment.metadata.note}"</p>
                      )}
                      {payment.rejection_reason && (
                        <p className="text-xs text-red-500 mt-1">Alasan: {payment.rejection_reason}</p>
                      )}
                      {payment.verified_by && (
                        <p className="text-xs text-emerald-600 mt-1">Diverifikasi oleh: {payment.verified_by}</p>
                      )}
                    </div>
                  </div>

                  <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-shrink-0">
                    {payment.status === 'pending_verification' && (
                      <>
                        <button
                          onClick={() => handleVerify(payment)}
                          disabled={Boolean(activeActionId) || !canWrite}
                          className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
                        >
                          <AiOutlineCheck /> Verifikasi
                        </button>
                        <button
                          onClick={() => openRejectModal(payment)}
                          disabled={Boolean(activeActionId) || !canWrite}
                          className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-600 transition-colors hover:bg-red-100 disabled:opacity-60"
                        >
                          <AiOutlineClose /> Tolak
                        </button>
                      </>
                    )}
                    <button
                      disabled={Boolean(activeActionId)}
                      onClick={() => openDetail(payment)}
                      className="col-span-2 inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-forest-200 bg-forest-50 px-3 py-2 text-xs font-medium text-forest-600 transition-colors hover:bg-forest-100 disabled:opacity-60 sm:col-span-1"
                    >
                      <AiOutlineEye /> Detail
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail Modal */}
      {modalMode === 'detail' && selectedPayment && (
        <div className="pv-dialog-backdrop">
          <div className="pv-dialog-panel">
            <h2 className="text-lg font-bold text-forest-900 mb-4">Detail Pembayaran</h2>

            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] items-start gap-3">
                <span className="text-forest-500">Warga</span>
                <span className="min-w-0 break-words text-right font-medium text-forest-900">
                  {(selectedPayment._profile || getResident(selectedPayment.resident_id))?.full_name || '-'}
                </span>
              </div>
              <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] items-start gap-3">
                <span className="text-forest-500">Periode</span>
                <span className="min-w-0 break-words text-right font-medium text-forest-900">
                  {formatPeriod(selectedPayment.period || selectedPayment._bill?.period || getBillPeriod(selectedPayment))}
                </span>
              </div>
              <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] items-start gap-3">
                <span className="text-forest-500">Jumlah</span>
                <span className="min-w-0 break-words text-right font-bold text-forest-900">{formatRupiah(selectedPayment.amount)}</span>
              </div>
              <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] items-start gap-3">
                <span className="text-forest-500">Metode</span>
                <span className="min-w-0 break-words text-right font-medium">
                  {selectedPayment.method === 'cash' ? '💵 Tunai' : selectedPayment.method === 'qris' ? '📱 QRIS' : '🏦 Transfer Bank'}
                </span>
              </div>
              <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] items-start gap-3">
                <span className="text-forest-500">Tanggal Bayar</span>
                <span className="min-w-0 break-words text-right font-medium">{formatDate(selectedPayment.paid_at)}</span>
              </div>
              <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] items-start gap-3">
                <span className="text-forest-500">Status</span>
                <span className={`pv-badge min-w-0 justify-self-end text-right ${
                  selectedPayment.status === 'pending_verification'
                    ? 'bg-orange-50 text-orange-700 border-orange-200'
                    : selectedPayment.status === 'verified'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-red-50 text-red-700 border-red-200'
                }`}>
                  {selectedPayment.status === 'pending_verification'
                    ? '⏳ Menunggu Verifikasi'
                    : selectedPayment.status === 'verified'
                    ? '✅ Terverifikasi'
                    : '❌ Ditolak'}
                </span>
              </div>

              {/* Receipt preview link */}
              {selectedReceiptPreviewUrl && isImageReceipt(selectedPayment) && !receiptPreviewError && (
                <div className="mt-4 overflow-hidden rounded-lg border border-forest-200 bg-forest-50">
                  <p className="border-b border-forest-200 px-3 py-2 text-xs font-semibold text-forest-700">
                    Preview Bukti Transfer
                  </p>
                  <div className="flex min-h-40 items-center justify-center bg-forest-100 p-2 sm:min-h-52">
                    <img
                      src={selectedReceiptPreviewUrl}
                      alt={`Preview ${selectedPayment.proof_file_name || 'bukti transfer'}`}
                      className="max-h-64 w-full rounded-md object-contain sm:max-h-80"
                      onError={() => setReceiptPreviewError(true)}
                    />
                  </div>
                </div>
              )}
              {(selectedPayment.proof_file_url || selectedPayment.receipt_file) && (
                <div className="mt-4 p-3 rounded-lg bg-forest-50 border border-forest-200">
                  <p className="text-xs font-medium text-forest-700 mb-2">📎 Bukti Transfer</p>
                  <a
                    href={selectedPayment.proof_file_url || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => {
                      if (!selectedPayment.proof_file_url) {
                        e.preventDefault();
                        alert(`Mengunduh file: ${selectedPayment.receipt_file}`);
                      }
                    }}
                    className="block p-3 rounded-lg border border-forest-200 bg-white hover:bg-forest-50 transition-colors"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-lg">🖼️</span>
                        <span className="truncate text-xs font-medium text-forest-700">
                          {selectedPayment.proof_file_name || selectedPayment.receipt_file || 'Lihat Bukti Lampiran'}
                        </span>
                      </div>
                      <span className="text-xs font-semibold text-gold-600 sm:flex-shrink-0">Buka Lampiran</span>
                    </div>
                  </a>
                </div>
              )}

              {selectedPayment.metadata?.note && (
                <div className="mt-2 p-2 rounded bg-amber-50 border border-amber-100 text-xs text-amber-700">
                  💬 Catatan: {selectedPayment.metadata.note}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2 mt-6">
              {selectedPayment.status === 'verified' && IS_DEMO && (
                <div className="grid grid-cols-1 gap-2 border-b border-forest-100 pb-2 sm:grid-cols-2">
                  <button
                    onClick={() => {
                      const bill = mockIPLBills.find((b) => b.id === selectedPayment.bill_id) || { id: selectedPayment.bill_id, period: selectedPayment.period || '2026-01', amount: selectedPayment.amount };
                      const unit = getUnit(selectedPayment.unit_id || bill.unit_id);
                      downloadDigitalReceipt({ bill, unit });
                    }}
                    className="inline-flex items-center justify-center gap-1 rounded-lg border border-forest-300 bg-white px-3 py-2 text-xs font-semibold text-forest-800 shadow-sm hover:bg-forest-50 transition-colors"
                  >
                    📥 Download Kuitansi
                  </button>
                  <button
                    onClick={async () => {
                      if (!canWrite) {
                        toast.error('Akun read-only tidak dapat mengirim kuitansi email.');
                        return;
                      }
                      const bill = mockIPLBills.find((b) => b.id === selectedPayment.bill_id) || { id: selectedPayment.bill_id, period: selectedPayment.period || '2026-01', amount: selectedPayment.amount };
                      const unit = getUnit(selectedPayment.unit_id || bill.unit_id);
                      toast.info('Mengirim kuitansi digital ke email...');
                      const res = await sendEmailReceipt({ bill, unit });
                      toast.success(res.message);
                    }}
                    disabled={!canWrite}
                    className="inline-flex items-center justify-center gap-1 rounded-lg border border-gold-300 bg-gold-50 px-3 py-2 text-xs font-semibold text-gold-800 shadow-sm hover:bg-gold-100 transition-colors disabled:opacity-50"
                  >
                    📧 Kirim ke Email
                  </button>
                </div>
              )}
              <div className="flex flex-col gap-2 sm:flex-row">
                {canWrite && (
                  <button
                    onClick={() => openEditModal(selectedPayment)}
                    disabled={Boolean(activeActionId)}
                    className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-gold-300 bg-gold-50 px-4 py-2.5 text-sm font-medium text-gold-800 hover:bg-gold-100 disabled:opacity-60"
                  >
                    <AiOutlineEdit /> Edit Pembayaran
                  </button>
                )}
                {selectedPayment.status === 'pending_verification' && (
                  <>
                    <button
                      onClick={() => handleVerify(selectedPayment)}
                      disabled={Boolean(activeActionId) || !canWrite}
                      className="flex-1 pv-btn-primary py-2.5 rounded-lg text-sm"
                    >
                      ✅ Verifikasi
                    </button>
                    <button
                      onClick={() => { setModalMode('reject'); setRejectReason(''); }}
                      disabled={Boolean(activeActionId)}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-red-50 text-red-600 border border-red-200 py-2.5 text-sm font-medium hover:bg-red-100 transition-colors"
                    >
                      ❌ Tolak
                    </button>
                  </>
                )}
                <button onClick={closeModal} className="pv-btn-ghost min-h-11 flex-1 rounded-lg px-4 py-2.5 text-sm">
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Payment Modal */}
      {modalMode === 'edit' && selectedPayment && (
        <div className="pv-dialog-backdrop">
          <div className="pv-dialog-panel">
            <h2 className="text-lg font-bold text-forest-900 mb-1">Edit Detail Pembayaran</h2>
            <p className="mb-4 text-sm leading-5 text-forest-500">
              Perbarui transaksi warga. Upload bukti baru bersifat opsional.
            </p>
            <form onSubmit={handleUpdatePayment} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-forest-700 mb-1">Nominal Pembayaran *</label>
                <input
                  type="number"
                  min="1"
                  step="1000"
                  required
                  value={paymentForm.amount}
                  onChange={(e) => setPaymentForm((prev) => ({ ...prev, amount: e.target.value }))}
                  className="w-full rounded-lg border border-forest-200 bg-white px-3 py-2.5 text-sm text-forest-900 outline-none focus:border-gold-500 focus:ring-2 focus:ring-gold-500/20"
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-forest-700 mb-1">Metode Pembayaran *</label>
                  <select
                    value={paymentForm.method}
                    onChange={(e) => setPaymentForm((prev) => ({ ...prev, method: e.target.value }))}
                    className="w-full rounded-lg border border-forest-200 bg-white px-3 py-2.5 text-sm text-forest-900 outline-none focus:border-gold-500"
                  >
                    <option value="bank_transfer">Transfer Bank</option>
                    <option value="qris">QRIS</option>
                    <option value="cash">Tunai</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-forest-700 mb-1">Tanggal Bayar *</label>
                  <input
                    type="date"
                    required
                    value={paymentForm.paid_at}
                    onChange={(e) => setPaymentForm((prev) => ({ ...prev, paid_at: e.target.value }))}
                    className="w-full rounded-lg border border-forest-200 bg-white px-3 py-2.5 text-sm text-forest-900 outline-none focus:border-gold-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-forest-700 mb-1">Catatan</label>
                <textarea
                  rows={3}
                  value={paymentForm.note}
                  onChange={(e) => setPaymentForm((prev) => ({ ...prev, note: e.target.value }))}
                  className="w-full rounded-lg border border-forest-200 bg-white px-3 py-2.5 text-sm text-forest-900 outline-none focus:border-gold-500"
                  placeholder="Catatan pembayaran..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-forest-700 mb-1">Upload Ulang Bukti Pembayaran</label>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={(e) => setPaymentForm((prev) => ({ ...prev, file: e.target.files?.[0] || null }))}
                  className="block w-full rounded-lg border border-forest-200 bg-white px-3 py-2 text-sm text-forest-700 file:mr-3 file:rounded file:border-0 file:bg-forest-100 file:px-2 file:py-1 file:text-xs file:font-medium"
                />
                {selectedPayment.proof_file_name && !paymentForm.file && (
                  <p className="mt-1 text-xs text-forest-400">Bukti saat ini: {selectedPayment.proof_file_name}</p>
                )}
              </div>
              <div className="mt-6 flex flex-col gap-2 sm:flex-row">
                <button
                  type="submit"
                  disabled={Boolean(activeActionId)}
                  className="pv-btn-primary flex-1 rounded-lg py-2.5 text-sm disabled:opacity-60"
                >
                  {activeActionId === selectedPayment.id ? 'Menyimpan...' : 'Simpan Perubahan'}
                </button>
                <button
                  type="button"
                  onClick={() => setModalMode('detail')}
                  disabled={Boolean(activeActionId)}
                  className="pv-btn-ghost rounded-lg px-4 py-2.5 text-sm"
                >
                  Batal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {modalMode === 'reject' && selectedPayment && (
        <div className="pv-dialog-backdrop">
          <div className="pv-dialog-panel">
            <h2 className="text-lg font-bold text-red-700 mb-1">Tolak Pembayaran</h2>
            <p className="mb-4 break-words text-sm leading-5 text-forest-500">
              Tolak bukti transfer dari <strong>{(selectedPayment._profile || getResident(selectedPayment.resident_id))?.full_name}</strong>.
              Warga akan dapat mengirim ulang bukti baru atau membatalkan pembayaran.
            </p>

            <div>
              <label className="block text-sm font-medium text-forest-700 mb-1">Alasan Penolakan *</label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-forest-200 bg-white px-3 py-2.5 text-sm text-forest-900 placeholder:text-forest-400 focus:border-red-400 focus:ring-2 focus:ring-red-400/20 outline-none"
                placeholder="Contoh: Bukti transfer tidak jelas, nominal tidak sesuai..."
              />
            </div>

            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              <button
                onClick={handleReject}
                disabled={Boolean(activeActionId) || !canWrite}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-red-600 text-white py-2.5 text-sm font-medium hover:bg-red-700 transition-colors"
              >
                ❌ Tolak Pembayaran
              </button>
              <button
                onClick={() => setModalMode('detail')}
                className="pv-btn-ghost w-full rounded-lg px-4 py-2.5 text-sm sm:w-auto"
              >
                Kembali
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

