import { useState, useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import {
  AiOutlinePlus,
  AiOutlineEdit,
  AiOutlineDelete,
  AiOutlinePaperClip,
  AiOutlineEye,
} from 'react-icons/ai';
import { useAuth, IS_DEMO_MODE } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import Modal from '../components/Modal';
import Placeholder from '../components/Placeholder';
import {
  mockExpenses,
  mockExpenseCategories,
  addExpense,
  updateExpense,
  deleteExpense,
  formatRupiah,
  formatDate,
  hasMinRole,
  isBendaharaOrAbove,
} from '../services/mockData';
import { compressImage } from '../utils/imageCompressor';

export default function Expenses() {
  const { role, profile } = useAuth();
  const toast = useToast();
  const isStaff = hasMinRole(role, 'pengurus');
  const canEdit = isBendaharaOrAbove(role);

  const [expenses, setExpenses] = useState(mockExpenses);
  const [filterCategory, setFilterCategory] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [modalForm, setModalForm] = useState(null); // null | 'add' | expense obj
  const [viewReceipt, setViewReceipt] = useState(null); // expense obj

  // Bulan tersedia dari data
  const availableMonths = useMemo(() => {
    const set = new Set(expenses.map((e) => e.date.substring(0, 7)));
    return [...set].sort().reverse();
  }, [expenses]);

  const filtered = useMemo(() => {
    return expenses
      .filter((e) => {
        if (filterCategory && e.category !== filterCategory) return false;
        if (filterMonth && !e.date.startsWith(filterMonth)) return false;
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [expenses, filterCategory, filterMonth]);

  const totalAmount = filtered.reduce((s, e) => s + e.amount, 0);

  // Staff-only (pengurus, bendahara, admin)
  if (!isStaff) {
    return <Navigate to="/" replace />;
  }

  const handleSave = (data) => {
    if (modalForm === 'add') {
      const newExp = addExpense({ ...data, recorded_by: profile?.full_name || 'Staff' });
      setExpenses([...mockExpenses]);
      toast.success(`Pengeluaran "${data.category}" berhasil dicatat.`);
    } else {
      updateExpense(modalForm.id, data);
      setExpenses([...mockExpenses]);
      toast.success('Pengeluaran berhasil diperbarui.');
    }
    setModalForm(null);
  };

  const handleDelete = (exp) => {
    if (!confirm(`Hapus pengeluaran "${exp.description.substring(0, 40)}..."?`)) return;
    deleteExpense(exp.id);
    setExpenses([...mockExpenses]);
    toast.success('Pengeluaran berhasil dihapus.');
  };

  if (!IS_DEMO_MODE) {
    return (
      <Placeholder
        title="Pengeluaran Bendahara"
        description="Hubungkan ke Supabase untuk mengelola pengeluaran real."
        phase="Phase 1 — MVP"
      />
    );
  }

  return (
    <div className="space-y-5">
      {/* Read-only banner */}
      {!canEdit && (
        <div className="pv-card p-3 bg-amber-50 border border-amber-200 text-amber-700 text-sm flex items-center gap-2">
          <span>ℹ️</span>
          <span>Anda melihat data pengeluaran dalam mode read-only. Hanya Bendahara yang dapat mencatat/mengubah pengeluaran.</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-forest-900">Pengeluaran Bendahara</h2>
          <p className="text-sm text-forest-500">
            {filtered.length} transaksi · Total {formatRupiah(totalAmount)}
          </p>
        </div>
        {canEdit && (
          <button onClick={() => setModalForm('add')} className="pv-btn-primary text-xs">
            <AiOutlinePlus /> Catat Pengeluaran
          </button>
        )}
      </div>

      {/* Filter */}
      <div className="pv-card p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="pv-input"
          >
            <option value="">Semua Kategori</option>
            {mockExpenseCategories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
            className="pv-input"
          >
            <option value="">Semua Bulan</option>
            {availableMonths.map((m) => {
              const [y, mo] = m.split('-');
              const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
              return (
                <option key={m} value={m}>{months[parseInt(mo, 10) - 1]} {y}</option>
              );
            })}
          </select>
        </div>
      </div>

      {/* Daftar pengeluaran */}
      {filtered.length === 0 ? (
        <div className="pv-card p-10 text-center text-forest-400 text-sm">
          Belum ada pengeluaran tercatat.
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((exp) => (
            <div key={exp.id} className="pv-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              {/* Kiri */}
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-forest-100 text-forest-600 text-xs font-bold">
                  {exp.category.charAt(0)}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-forest-900 text-sm">{exp.category}</p>
                    <span className="pv-badge bg-forest-50 text-forest-600">{formatDate(exp.date)}</span>
                  </div>
                  <p className="text-xs text-forest-500 mt-0.5 line-clamp-1">{exp.description}</p>
                  <p className="text-[10px] text-forest-400 mt-0.5">Oleh: {exp.recorded_by}</p>
                </div>
              </div>

              {/* Kanan */}
              <div className="flex items-center gap-3">
                {exp.receipt_file && (
                  <button
                    onClick={() => setViewReceipt(exp)}
                    className="p-2 text-forest-500 hover:text-forest-800 hover:bg-forest-50 rounded-lg transition-colors"
                    title="Lihat bukti"
                  >
                    <AiOutlinePaperClip />
                  </button>
                )}
                <p className="font-bold text-forest-900 text-sm">{formatRupiah(exp.amount)}</p>
                {canEdit && (
                  <div className="flex gap-1">
                    <button
                      onClick={() => setModalForm(exp)}
                      className="p-2 text-forest-500 hover:text-forest-800 hover:bg-forest-50 rounded-lg transition-colors"
                      title="Edit"
                    >
                      <AiOutlineEdit />
                    </button>
                    <button
                      onClick={() => handleDelete(exp)}
                      className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Hapus"
                    >
                      <AiOutlineDelete />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal form */}
      {modalForm && (
        <ExpenseFormModal
          expense={modalForm === 'add' ? null : modalForm}
          onSave={handleSave}
          onClose={() => setModalForm(null)}
        />
      )}

      {/* Modal lihat bukti */}
      {viewReceipt && (
        <Modal open onClose={() => setViewReceipt(null)} title="Bukti Pembayaran" size="md">
          <div className="space-y-3">
            <p className="text-sm text-forest-600">
              <strong className="text-forest-900">{viewReceipt.category}</strong> · {formatDate(viewReceipt.date)}
            </p>
            <p className="text-lg font-bold text-forest-900">{formatRupiah(viewReceipt.amount)}</p>
            <p className="text-sm text-forest-600">{viewReceipt.description}</p>

            {/* Placeholder preview file */}
            <div className="rounded-lg border-2 border-dashed border-forest-200 bg-forest-50 p-8 text-center">
              <AiOutlinePaperClip size={32} className="mx-auto text-forest-400" />
              <p className="text-sm font-medium text-forest-700 mt-2">{viewReceipt.receipt_file}</p>
              <p className="text-[11px] text-forest-400 mt-1">
                Preview file akan tersedia saat Supabase Storage terhubung.
              </p>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Form modal ────────────────────────────────────────────────────
function ExpenseFormModal({ expense, onSave, onClose }) {
  const isEdit = !!expense;
  const [form, setForm] = useState({
    date: expense?.date || new Date().toISOString().split('T')[0],
    category: expense?.category || mockExpenseCategories[0],
    amount: expense?.amount || '',
    description: expense?.description || '',
    receipt_file: expense?.receipt_file || '',
  });
  const [fileName, setFileName] = useState(expense?.receipt_file || '');

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (file) {
      try {
        const compressed = await compressImage(file);
        setFileName(compressed.name);
        setForm({ ...form, receipt_file: compressed.name });
      } catch (err) {
        setFileName(file.name);
        setForm({ ...form, receipt_file: file.name });
      }
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.description.trim()) {
      return;
    }
    onSave({ ...form, description: form.description.trim() });
  };

  return (
    <Modal open onClose={onClose} title={isEdit ? 'Edit Pengeluaran' : 'Catat Pengeluaran'} size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-forest-700 mb-1">Tanggal</label>
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              required
              className="pv-input"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-forest-700 mb-1">Kategori</label>
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="pv-input"
            >
              {mockExpenseCategories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-forest-700 mb-1">Jumlah (Rp)</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-forest-400">Rp</span>
            <input
              type="number"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              required
              min="0"
              step="500"
              className="pv-input pl-9"
              placeholder="0"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-forest-700 mb-1">
            Deskripsi <span className="text-red-500">*</span>
          </label>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            required
            rows={3}
            className="pv-input resize-none"
            placeholder="Jelaskan detail pengeluaran (mis. honor petugas kebersihan 2 orang untuk awal Juni)"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-forest-700 mb-1">
            Bukti Pembayaran <span className="text-forest-400 font-normal">(opsional)</span>
          </label>
          <label className="flex items-center gap-3 p-3 border-2 border-dashed border-forest-200 rounded-lg cursor-pointer hover:border-gold-400 hover:bg-forest-50 transition-colors">
            <AiOutlinePaperClip size={20} className="text-forest-400 shrink-0" />
            <span className="text-sm text-forest-600 flex-1 truncate">
              {fileName || 'Pilih file bukti (foto kwitansi, PDF, dll.)'}
            </span>
            <input type="file" accept="image/*,.pdf" className="hidden" onChange={handleFile} />
          </label>
          {fileName && (
            <button
              type="button"
              onClick={() => { setFileName(''); setForm({ ...form, receipt_file: '' }); }}
              className="text-[11px] text-red-500 hover:text-red-700 mt-1"
            >
              Hapus file
            </button>
          )}
        </div>

        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose} className="pv-btn-ghost flex-1 text-sm">
            Batal
          </button>
          <button type="submit" className="pv-btn-primary flex-1 text-sm">
            {isEdit ? 'Simpan Perubahan' : 'Catat'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
