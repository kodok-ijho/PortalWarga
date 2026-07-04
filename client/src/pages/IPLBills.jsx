import { useState, useMemo } from 'react';
import { useAuth, IS_DEMO_MODE } from '../hooks/useAuth';
import {
  mockIPLBills,
  mockPayments,
  getUnitById,
  getProfileById,
  formatRupiah,
  formatPeriod,
  formatDate,
  billStatusLabel,
  billStatusColor,
  roleLabel,
  roleColor,
  canPayBill,
  occupancyStatusLabel,
  occupancyStatusColor,
  isStaffRole,
} from '../services/mockData';
import Placeholder from '../components/Placeholder';

export default function IPLBills() {
  const { profile, role } = useAuth();
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPeriod, setFilterPeriod] = useState('');
  const [selectedBillId, setSelectedBillId] = useState(null);

  // Periode unik
  const periods = useMemo(
    () => [...new Set(mockIPLBills.map((b) => b.period))].sort().reverse(),
    []
  );

  // Warga hanya lihat tagihan sendiri, staff lihat semua
  const myBills = useMemo(() => {
    if (!isStaffRole(role) && profile?.id) {
      return mockIPLBills.filter((b) => b.resident_id === profile.id);
    }
    return mockIPLBills; // staff roles (pengurus, bendahara, admin)
  }, [profile?.id, role]);

  // Filter
  const filtered = useMemo(() => {
    return myBills.filter((b) => {
      if (filterStatus && b.status !== filterStatus) return false;
      if (filterPeriod && b.period !== filterPeriod) return false;
      return true;
    });
  }, [myBills, filterStatus, filterPeriod]);

  // Summary stats
  const stats = useMemo(() => {
    const total = myBills.length;
    const paid = myBills.filter((b) => b.status === 'paid').length;
    const pending = myBills.filter((b) => b.status === 'pending').length;
    const overdue = myBills.filter((b) => b.status === 'overdue').length;
    return { total, paid, pending, overdue };
  }, [myBills]);

  const selectedBill = selectedBillId ? mockIPLBills.find((b) => b.id === selectedBillId) : null;
  const selectedPayment = selectedBill?.payment_id
    ? mockPayments.find((p) => p.id === selectedBill.payment_id)
    : null;

  if (!IS_DEMO_MODE) {
    return (
      <Placeholder
        title="Tagihan IPL"
        description="Hubungkan ke Supabase untuk melihat tagihan IPL real."
        phase="Phase 1 — MVP"
      />
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-forest-900">Tagihan Iuran Pemeliharaan Lingkungan</h2>
        <p className="text-sm text-forest-500">
          {!isStaffRole(role) ? 'Tagihan IPL Anda' : 'Semua tagihan IPL warga'}
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total" value={stats.total} color="bg-forest-800 text-gold-400" />
        <StatCard label="Lunas" value={stats.paid} color="bg-emerald-50 text-emerald-700 border border-emerald-200" />
        <StatCard label="Menunggu" value={stats.pending} color="bg-amber-50 text-amber-700 border border-amber-200" />
        <StatCard label="Terlambat" value={stats.overdue} color="bg-red-50 text-red-700 border border-red-200" />
      </div>

      {/* Filters */}
      <div className="pv-card p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <select
            value={filterPeriod}
            onChange={(e) => setFilterPeriod(e.target.value)}
            className="rounded-lg border border-forest-200 bg-white px-3 py-2.5 text-sm text-forest-700 focus:border-gold-500 outline-none"
          >
            <option value="">Semua Periode</option>
            {periods.map((p) => (
              <option key={p} value={p}>{formatPeriod(p)}</option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-lg border border-forest-200 bg-white px-3 py-2.5 text-sm text-forest-700 focus:border-gold-500 outline-none"
          >
            <option value="">Semua Status</option>
            <option value="pending">Menunggu</option>
            <option value="paid">Lunas</option>
            <option value="overdue">Terlambat</option>
          </select>
        </div>
      </div>

      {/* Bill cards (mobile-friendly) / table */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="pv-card p-10 text-center text-forest-400 text-sm">
            Tidak ada tagihan yang cocok dengan filter.
          </div>
        ) : (
          filtered.map((bill) => {
            const unit = getUnitById(bill.unit_id);
            const resident = getProfileById(bill.resident_id);
            const totalAmount = bill.amount + bill.late_fee;

            return (
              <div
                key={bill.id}
                onClick={() => setSelectedBillId(bill.id)}
                className="pv-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-gold-400/50 cursor-pointer transition-colors"
              >
                {/* Left info */}
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-forest-100 text-forest-600 text-sm font-bold">
                    {formatPeriod(bill.period).substring(0, 3)}
                  </span>
                  <div>
                    <p className="font-medium text-forest-900 text-sm">
                      {formatPeriod(bill.period)}
                    </p>
                    {/* Admin/RT bisa lihat unit & penghuni */}
                    {isStaffRole(role) && (
                      <p className="text-xs text-forest-500">
                        {unit ? `Blok ${unit.block}/${unit.unit_number}` : '—'}
                        {resident && ` · ${resident.full_name}`}
                      </p>
                    )}
                    {!isStaffRole(role) && unit && (
                      <p className="text-xs text-forest-500">
                        Blok {unit.block}/{unit.unit_number}
                      </p>
                    )}
                    <p className="text-xs text-forest-400 mt-0.5">
                      Jatuh tempo: {formatDate(bill.due_date)}
                    </p>
                  </div>
                </div>

                {/* Right: amount + status */}
                <div className="flex items-center gap-3 sm:text-right">
                  <div>
                    <p className="font-bold text-forest-900 text-sm">{formatRupiah(bill.amount)}</p>
                    {bill.late_fee > 0 && (
                      <p className="text-[11px] text-red-500">+ denda {formatRupiah(bill.late_fee)}</p>
                    )}
                  </div>
                  <span className={`pv-badge ${billStatusColor(bill.status)}`}>
                    {billStatusLabel(bill.status)}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal detail tagihan */}
      {selectedBill && (
        <BillDetailModal
          bill={selectedBill}
          payment={selectedPayment}
          role={role}
          onClose={() => setSelectedBillId(null)}
        />
      )}
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div className={`rounded-xl p-4 text-center ${color}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-[11px] mt-0.5">{label}</p>
    </div>
  );
}

function BillDetailModal({ bill, payment, role, onClose }) {
  const unit = getUnitById(bill.unit_id);
  const resident = getProfileById(bill.resident_id);
  const totalAmount = bill.amount + bill.late_fee;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-forest-900/50 backdrop-blur-sm" />
      <div
        className="relative pv-card w-full max-w-md p-6 shadow-elevated"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-forest-400 hover:text-forest-700 text-lg">
          ✕
        </button>

        <h3 className="font-bold text-forest-900 text-base mb-1">
          Detail Tagihan — {formatPeriod(bill.period)}
        </h3>
        <span className={`pv-badge ${billStatusColor(bill.status)}`}>
          {billStatusLabel(bill.status)}
        </span>

        <div className="mt-5 space-y-3 text-sm">
          {isStaffRole(role) && (
            <>
              <InfoRow
                label="Penghuni"
                value={
                  <span className="flex items-center gap-1.5 flex-wrap justify-end">
                    {resident?.full_name || '—'}
                    {resident?.occupancy_status && (
                      <span className={`pv-badge ${occupancyStatusColor(resident.occupancy_status)}`}>
                        {occupancyStatusLabel(resident.occupancy_status)}
                      </span>
                    )}
                  </span>
                }
              />
              <InfoRow label="Unit" value={unit ? `Blok ${unit.block} / ${unit.unit_number}` : '—'} />
            </>
          )}
          <InfoRow label="Jumlah IPL" value={formatRupiah(bill.amount)} />
          {bill.late_fee > 0 && (
            <InfoRow label="Denda keterlambatan" value={<span className="text-red-600">{formatRupiah(bill.late_fee)}</span>} />
          )}
          <InfoRow
            label="Total"
            value={<span className="font-bold text-base">{formatRupiah(totalAmount)}</span>}
          />
          <InfoRow label="Jatuh tempo" value={formatDate(bill.due_date)} />
        </div>

        {/* Status pembayaran */}
        {bill.status === 'paid' && payment && (
          <div className="mt-5 pt-4 border-t border-forest-100">
            <p className="text-xs font-semibold text-forest-700 mb-2">Bukti Pembayaran</p>
            <div className="bg-emerald-50 rounded-lg p-3 text-xs text-emerald-700 space-y-1">
              <p>Metode: <span className="font-medium capitalize">
                {payment.method === 'qris'
                  ? 'QRIS'
                  : payment.method === 'cash'
                  ? 'Tunai (Cash)'
                  : payment.method === 'bank_transfer'
                  ? 'Transfer Bank'
                  : payment.method}
              </span></p>
              <p>ID Transaksi: <span className="font-mono">{payment.transaction_id}</span></p>
              <p>Tanggal Bayar: {formatDate(payment.paid_at)}</p>
              {payment.receipt_file && (
                <p>Bukti: <span className="font-medium">{payment.receipt_file}</span></p>
              )}
              {payment.metadata?.recorded_by && (
                <p>Dicatat oleh: <span className="font-medium">{payment.metadata.recorded_by}</span></p>
              )}
            </div>
          </div>
        )}

        {/* Tombol bayar (placeholder) */}
        {bill.status === 'pending' || bill.status === 'overdue' ? (
          <div className="mt-6">
            {canPayBill(bill.unit_id, bill.period) ? (
              <>
                <button
                  className="pv-btn-primary w-full py-3 text-base rounded-lg"
                  onClick={() => alert('Fitur pembayaran QRIS Mayar akan aktif saat Supabase terhubung (Phase 1 — T12/T13).')}
                >
                  💳 Bayar via QRIS — {formatRupiah(totalAmount)}
                </button>
                <p className="text-[10px] text-forest-400 text-center mt-2">
                  Pembayaran via QRIS Mayar — akan tersedia saat Supabase & Mayar terhubung
                </p>
              </>
            ) : (
              <>
                <button
                  className="pv-btn-primary w-full py-3 text-base rounded-lg opacity-50 cursor-not-allowed"
                  disabled
                  title="Ada tagihan periode sebelumnya yang belum lunas"
                >
                  💳 Bayar via QRIS — {formatRupiah(totalAmount)}
                </button>
                <p className="text-[10px] text-red-500 text-center mt-2">
                  ⚠️ Tidak bisa dibayar: ada tagihan bulan sebelumnya yang belum lunas.
                </p>
              </>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="flex justify-between items-start gap-2">
      <span className="text-forest-500 shrink-0">{label}</span>
      <span className="text-forest-900 font-medium text-right">{value}</span>
    </div>
  );
}
