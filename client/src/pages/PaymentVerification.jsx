import { useState, useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import {
  isBendaharaOrAbove,
  getPendingPayments,
  verifyPayment,
  rejectPayment,
  mockPayments,
  getUnitById,
  getProfileById,
  formatRupiah,
  formatDate,
  formatPeriod,
  billStatusLabel,
  billStatusColor,
} from '../services/mockData';
import { AiOutlineCheck, AiOutlineClose, AiOutlineEye, AiOutlineClockCircle } from 'react-icons/ai';
import { useToast } from '../hooks/useToast';

const TABS = [
  { key: 'pending', label: 'Menunggu', icon: '⏳' },
  { key: 'verified', label: 'Terverifikasi', icon: '✅' },
  { key: 'rejected', label: 'Ditolak', icon: '❌' },
];

export default function PaymentVerification() {
  const { role, profile } = useAuth();
  const toast = useToast();
  const [refreshKey, setRefreshKey] = useState(0);
  const [activeTab, setActiveTab] = useState('pending');
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [modalMode, setModalMode] = useState(null); // 'detail' | 'reject'
  const [rejectReason, setRejectReason] = useState('');

  const pendingPayments = useMemo(
    () => getPendingPayments(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [refreshKey]
  );

  const verifiedPayments = useMemo(
    () => mockPayments.filter((p) => p.status === 'verified'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [refreshKey]
  );

  const rejectedPayments = useMemo(
    () => mockPayments.filter((p) => p.status === 'rejected'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [refreshKey]
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

  const handleVerify = (payment) => {
    verifyPayment(payment.id, { verifiedBy: profile.full_name });
    toast.success(`Pembayaran ${formatPeriod(getBillPeriod(payment))} berhasil diverifikasi.`);
    setRefreshKey((k) => k + 1);
    setSelectedPayment(null);
    setModalMode(null);
  };

  const openRejectModal = (payment) => {
    setSelectedPayment(payment);
    setModalMode('reject');
    setRejectReason('');
  };

  const handleReject = () => {
    if (!rejectReason.trim()) {
      toast.error('Silakan isi alasan penolakan.');
      return;
    }
    rejectPayment(selectedPayment.id, {
      rejectedBy: profile.full_name,
      reason: rejectReason,
    });
    toast.error(`Pembayaran ditolak.`);
    setRefreshKey((k) => k + 1);
    setSelectedPayment(null);
    setModalMode(null);
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
    // Extract period from bill
    const { mockIPLBills } = require('../services/mockData');
    const bill = mockIPLBills.find((b) => b.id === payment.ipl_bill_id);
    return bill?.period || '';
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
      {currentList.length === 0 ? (
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
            const unit = getUnitById(payment.unit_id || (() => {
              const { mockIPLBills } = require('../services/mockData');
              const bill = mockIPLBills.find((b) => b.id === payment.ipl_bill_id);
              return bill?.unit_id;
            })());
            const resident = getProfileById(payment.resident_id);
            const period = getBillPeriod(payment);

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
                        <span>🏦 Transfer Bank</span>
                        <span>📅 {formatDate(payment.paid_at)}</span>
                        {payment.receipt_file && <span>📎 {payment.receipt_file}</span>}
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
                          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 text-white px-3 py-2 text-xs font-medium hover:bg-emerald-700 transition-colors"
                        >
                          <AiOutlineCheck /> Verifikasi
                        </button>
                        <button
                          onClick={() => openRejectModal(payment)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 text-red-600 border border-red-200 px-3 py-2 text-xs font-medium hover:bg-red-100 transition-colors"
                        >
                          <AiOutlineClose /> Tolak
                        </button>
                      </>
                    )}
                    <button
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
                  {getProfileById(selectedPayment.resident_id)?.full_name || '-'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-forest-500">Periode</span>
                <span className="font-medium text-forest-900">{formatPeriod(getBillPeriod(selectedPayment))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-forest-500">Jumlah</span>
                <span className="font-bold text-forest-900">{formatRupiah(selectedPayment.amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-forest-500">Metode</span>
                <span className="font-medium">🏦 Transfer Bank</span>
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

              {/* Receipt preview placeholder */}
              {selectedPayment.receipt_file && (
                <div className="mt-4 p-3 rounded-lg bg-forest-50 border border-forest-200">
                  <p className="text-xs font-medium text-forest-700 mb-2">📎 Bukti Transfer</p>
                  <div className="h-40 rounded-lg bg-forest-100 flex items-center justify-center text-forest-400 text-sm">
                    <div className="text-center">
                      <p className="text-2xl mb-1">🖼️</p>
                      <p className="text-xs">{selectedPayment.receipt_file}</p>
                      <p className="text-[10px] text-forest-300 mt-1">(Preview tersedia saat Supabase Storage aktif)</p>
                    </div>
                  </div>
                </div>
              )}

              {selectedPayment.metadata?.note && (
                <div className="mt-2 p-2 rounded bg-amber-50 border border-amber-100 text-xs text-amber-700">
                  💬 Catatan: {selectedPayment.metadata.note}
                </div>
              )}
            </div>

            <div className="flex gap-2 mt-6">
              {selectedPayment.status === 'pending_verification' && (
                <>
                  <button
                    onClick={() => handleVerify(selectedPayment)}
                    className="flex-1 pv-btn-primary py-2.5 rounded-lg text-sm"
                  >
                    ✅ Verifikasi
                  </button>
                  <button
                    onClick={() => { setModalMode('reject'); setRejectReason(''); }}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-red-50 text-red-600 border border-red-200 py-2.5 text-sm font-medium hover:bg-red-100 transition-colors"
                  >
                    ❌ Tolak
                  </button>
                </>
              )}
              <button onClick={closeModal} className="pv-btn-ghost py-2.5 px-4 rounded-lg text-sm">
                Tutup
              </button>
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
              Tolak bukti transfer dari <strong>{getProfileById(selectedPayment.resident_id)?.full_name}</strong>.
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
