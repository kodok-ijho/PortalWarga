import { useState, useMemo, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import {
  fetchPayments,
  fetchUnits,
  fetchResidents,
  approveManualPayment,
  rejectManualPayment,
  IS_DEMO,
} from '../services/dataService';
import {
  formatRupiah,
  formatDate,
  formatPeriod,
  isBendaharaOrAbove,
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
import { AiOutlineCheck, AiOutlineClose, AiOutlineEye, AiOutlineClockCircle } from 'react-icons/ai';
import { useToast } from '../hooks/useToast';

const TABS = [
  { key: 'pending', label: 'Menunggu', icon: '⏳' },
  { key: 'verified', label: 'Terverifikasi', icon: '✅' },
  { key: 'rejected', label: 'Ditolak', icon: '❌' },
];

export default function PaymentVerification() {
  const { role, profile, session } = useAuth();
  const toast = useToast();
  const [refreshKey, setRefreshKey] = useState(0);
  const [activeTab, setActiveTab] = useState('pending');
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [modalMode, setModalMode] = useState(null); // 'detail' | 'reject'
  const [rejectReason, setRejectReason] = useState('');
  const [activeActionId, setActiveActionId] = useState(null);

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
          const [payData, unitData, resData] = await Promise.all([
            fetchPayments(session?.access_token),
            fetchUnits(session?.access_token),
            fetchResidents(session?.access_token),
          ]);
          if (active) {
            setPayments(payData);
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

  const getUnit = (unitId) => {
    return units.find(u => u.id === unitId) || getUnitById(unitId);
  };

  const getResident = (residentId) => {
    return residents.find(r => r.id === residentId) || getProfileById(residentId);
  };

  const pendingPayments = useMemo(
    () => payments.filter((p) => p.status === 'pending_verification'),
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
    setSelectedPayment(payment);
    setModalMode('reject');
    setRejectReason('');
  };

  const handleReject = async () => {
    if (!selectedPayment || activeActionId) return;
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

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-forest-900 flex items-center gap-2">
            <AiOutlineCheck className="text-gold-600" /> Verifikasi Pembayaran
          </h1>
          <p className="text-sm text-forest-500 mt-1">
            Verifikasi bukti transfer pembayaran IPL dari warga
          </p>
        </div>
        {pendingPayments.length > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-100 px-3 py-1.5 text-sm font-semibold text-orange-800">
            <AiOutlineClockCircle />
            {pendingPayments.length} Menunggu
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-forest-100 rounded-lg">
        {TABS.map((tab) => {
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
              className={`flex-1 py-2.5 text-sm rounded-md transition-all flex items-center justify-center gap-1.5 ${
                activeTab === tab.key
                  ? 'bg-forest-800 text-gold-400 font-semibold shadow-sm'
                  : 'text-forest-600 hover:text-forest-800'
              }`}
            >
              <span>{tab.icon}</span>
              {tab.label}
              {count > 0 && (
                <span className={`ml-1 text-[10px] rounded-full px-1.5 py-0.5 font-bold ${
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
        <div className="flex flex-col items-center justify-center p-20 space-y-4">
          <div className="h-10 w-10 border-4 border-forest-200 border-t-gold-500 rounded-full animate-spin" />
          <p className="text-sm text-forest-500">Memuat data verifikasi pembayaran...</p>
        </div>
      ) : currentList.length === 0 ? (
        <div className="pv-card p-12 text-center">
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

            return (
              <div key={payment.id} className="pv-card p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className={`h-10 w-10 rounded-full flex items-center justify-center font-bold text-base flex-shrink-0 ${
                      payment.status === 'pending_verification'
                        ? 'bg-orange-100 text-orange-700'
                        : payment.status === 'verified'
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-red-100 text-red-700'
                    }`}>
                      {payment.status === 'pending_verification' ? '⏳' : payment.status === 'verified' ? '✅' : '❌'}
                    </div>
                    <div>
                      <h3 className="font-semibold text-forest-900">
                        {resident?.full_name || 'Unknown'} — {unit ? `Blok ${unit.block}/${unit.unit_number}` : '-'}
                      </h3>
                      <p className="text-xs text-forest-500 mt-0.5">
                        Periode: <strong>{formatPeriod(period)}</strong> • {formatRupiah(payment.amount)}
                      </p>
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-forest-400">
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
                            className="text-gold-600 hover:underline flex items-center gap-1"
                          >
                            📎 {payment.proof_file_name || payment.receipt_file || 'Bukti'} 🔗
                          </a>
                        )}
                      </div>
                      {payment.metadata?.note && (
                        <p className="text-xs text-forest-400 mt-1 italic">"{payment.metadata.note}"</p>
                      )}
                      {payment.rejection_reason && (
                        <p className="text-xs text-red-500 mt-1">Alasan: {payment.rejection_reason}</p>
                      )}
                      {payment.verified_by && (
                        <p className="text-xs text-emerald-600 mt-1">Diverifikasi oleh: {payment.verified_by}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {payment.status === 'pending_verification' && (
                      <>
                        <button
                          onClick={() => handleVerify(payment)}
                          disabled={Boolean(activeActionId)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 text-white px-3 py-2 text-xs font-medium hover:bg-emerald-700 transition-colors"
                        >
                          <AiOutlineCheck /> Verifikasi
                        </button>
                        <button
                          onClick={() => openRejectModal(payment)}
                          disabled={Boolean(activeActionId)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 text-red-600 border border-red-200 px-3 py-2 text-xs font-medium hover:bg-red-100 transition-colors"
                        >
                          <AiOutlineClose /> Tolak
                        </button>
                      </>
                    )}
                    <button
                      disabled={Boolean(activeActionId)}
                      onClick={() => openDetail(payment)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-forest-50 text-forest-600 border border-forest-200 px-3 py-2 text-xs font-medium hover:bg-forest-100 transition-colors"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6">
            <h2 className="text-lg font-bold text-forest-900 mb-4">Detail Pembayaran</h2>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-forest-500">Warga</span>
                <span className="font-medium text-forest-900">
                  {(selectedPayment._profile || getResident(selectedPayment.resident_id))?.full_name || '-'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-forest-500">Periode</span>
                <span className="font-medium text-forest-900">
                  {formatPeriod(selectedPayment.period || selectedPayment._bill?.period || getBillPeriod(selectedPayment))}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-forest-500">Jumlah</span>
                <span className="font-bold text-forest-900">{formatRupiah(selectedPayment.amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-forest-500">Metode</span>
                <span className="font-medium">
                  {selectedPayment.method === 'cash' ? '💵 Tunai' : selectedPayment.method === 'qris' ? '📱 QRIS' : '🏦 Transfer Bank'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-forest-500">Tanggal Bayar</span>
                <span className="font-medium">{formatDate(selectedPayment.paid_at)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-forest-500">Status</span>
                <span className={`pv-badge ${
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
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-lg">🖼️</span>
                        <span className="truncate text-xs font-medium text-forest-700">
                          {selectedPayment.proof_file_name || selectedPayment.receipt_file || 'Lihat Bukti Lampiran'}
                        </span>
                      </div>
                      <span className="text-xs text-gold-600 font-semibold flex-shrink-0">Buka Lampiran 🔗</span>
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
                <div className="grid grid-cols-2 gap-2 pb-2 border-b border-forest-100">
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
                      const bill = mockIPLBills.find((b) => b.id === selectedPayment.bill_id) || { id: selectedPayment.bill_id, period: selectedPayment.period || '2026-01', amount: selectedPayment.amount };
                      const unit = getUnit(selectedPayment.unit_id || bill.unit_id);
                      toast.info('Mengirim kuitansi digital ke email...');
                      const res = await sendEmailReceipt({ bill, unit });
                      toast.success(res.message);
                    }}
                    className="inline-flex items-center justify-center gap-1 rounded-lg border border-gold-300 bg-gold-50 px-3 py-2 text-xs font-semibold text-gold-800 shadow-sm hover:bg-gold-100 transition-colors"
                  >
                    📧 Kirim ke Email
                  </button>
                </div>
              )}
              <div className="flex gap-2">
                {selectedPayment.status === 'pending_verification' && (
                  <>
                    <button
                      onClick={() => handleVerify(selectedPayment)}
                      disabled={Boolean(activeActionId)}
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
                <button onClick={closeModal} className="pv-btn-ghost py-2.5 px-4 rounded-lg text-sm flex-1">
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {modalMode === 'reject' && selectedPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6">
            <h2 className="text-lg font-bold text-red-700 mb-1">Tolak Pembayaran</h2>
            <p className="text-sm text-forest-500 mb-4">
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

            <div className="flex gap-2 mt-6">
              <button
                onClick={handleReject}
                disabled={Boolean(activeActionId)}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-red-600 text-white py-2.5 text-sm font-medium hover:bg-red-700 transition-colors"
              >
                ❌ Tolak Pembayaran
              </button>
              <button
                onClick={() => setModalMode('detail')}
                className="pv-btn-ghost py-2.5 px-4 rounded-lg text-sm"
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

