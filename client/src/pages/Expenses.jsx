import { useState, useMemo, useEffect, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import {
  AiOutlinePlus,
  AiOutlineEdit,
  AiOutlineDelete,
  AiOutlinePaperClip,
} from 'react-icons/ai';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import Modal from '../components/Modal';
import {
  fetchExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
} from '../services/dataService';
import {
  formatRupiah,
  formatDate,
  hasMinRole,
  isBendaharaOrAbove,
} from '../services/dataHelpers';
import { compressImage } from '../utils/imageCompressor';

const EXPENSE_CATEGORIES = [
  'Kebersihan',
  'Keamanan',
  'Perawatan Fasilitas',
  'Listrik & Air',
  'Administrasi',
  'Acara Warga',
  'Lain-lain',
];

function getGoogleDriveThumbnail(url) {
  if (!url) return null;
  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    return `https://lh3.googleusercontent.com/d/${match[1]}`;
  }
  const idMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idMatch && idMatch[1]) {
    return `https://lh3.googleusercontent.com/d/${idMatch[1]}`;
  }
  return null;
}

export default function Expenses() {
  const { role, profile, session } = useAuth();
  const token = session?.access_token;
  const toast = useToast();
  const isStaff = hasMinRole(role, 'pengurus');
  const canEdit = isBendaharaOrAbove(role);

  const [expenses, setExpenses] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [modalForm, setModalForm] = useState(null); // null | 'add' | expense obj
  const [viewReceipt, setViewReceipt] = useState(null); // expense obj
  const [receiptImageError, setReceiptImageError] = useState(false);

  const loadExpenses = useCallback(async () => {
    if (!token) return;
    try {
      setIsLoading(true);
      const data = await fetchExpenses(token);
      setExpenses(data);
    } catch (err) {
      toast.error('Gagal mengambil data pengeluaran.');
    } finally {
      setIsLoading(false);
    }
  }, [token, toast]);

  useEffect(() => {
    loadExpenses();
  }, [loadExpenses]);

  // Bulan tersedia dari data
  const availableMonths = useMemo(() => {
    const set = new Set(expenses.map((e) => e.date ? e.date.substring(0, 7) : ''));
    return [...set].filter(Boolean).sort().reverse();
  }, [expenses]);

  const filtered = useMemo(() => {
    return expenses
      .filter((e) => {
        if (filterCategory && e.category !== filterCategory) return false;
        if (filterMonth && (!e.date || !e.date.startsWith(filterMonth))) return false;
        return true;
      })
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [expenses, filterCategory, filterMonth]);

  const totalAmount = filtered.reduce((s, e) => s + e.amount, 0);

  // Staff-only (pengurus, bendahara, admin)
  if (!isStaff) {
    return <Navigate to="/" replace />;
  }

  const handleSave = async (data, file) => {
    try {
      setIsLoading(true);
      if (modalForm === 'add') {
        await createExpense(token, { ...data, file });
        toast.success(`Pengeluaran "${data.category}" berhasil dicatat.`);
      } else {
        await updateExpense(token, modalForm.id, { ...data, file });
        toast.success('Pengeluaran berhasil diperbarui.');
      }
      setModalForm(null);
      loadExpenses();
    } catch (err) {
      toast.error(err.message || 'Gagal menyimpan pengeluaran.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (exp) => {
    if (!confirm(`Hapus pengeluaran "${exp.description.substring(0, 40)}..."?`)) return;
    try {
      setIsLoading(true);
      await deleteExpense(token, exp.id);
      toast.success('Pengeluaran berhasil dihapus.');
      loadExpenses();
    } catch (err) {
      toast.error('Gagal menghapus pengeluaran.');
    } finally {
      setIsLoading(false);
    }
  };

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
            {EXPENSE_CATEGORIES.map((c) => (
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
                  {(exp.category || '').charAt(0)}
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
                    onClick={() => { setReceiptImageError(false); setViewReceipt(exp); }}
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
          isSaving={isLoading}
          onSave={handleSave}
          onClose={() => setModalForm(null)}
        />
      )}

      {/* Modal lihat bukti */}
      {viewReceipt && (
        <Modal open onClose={() => { setViewReceipt(null); setReceiptImageError(false); }} title="Bukti Pembayaran" size="md">
          <div className="space-y-3">
            <p className="text-sm text-forest-600">
              <strong className="text-forest-900">{viewReceipt.category}</strong> · {formatDate(viewReceipt.date)}
            </p>
            <p className="text-lg font-bold text-forest-900">{formatRupiah(viewReceipt.amount)}</p>
            <p className="text-sm text-forest-600">{viewReceipt.description}</p>

            {/* Tampilan link Google Drive or placeholder */}
            {viewReceipt.receipt_file && (viewReceipt.receipt_file.startsWith('http://') || viewReceipt.receipt_file.startsWith('https://')) ? (
              <div className="space-y-4">
                {(() => {
                  const thumb = getGoogleDriveThumbnail(viewReceipt.receipt_file);
                  if (thumb && !receiptImageError) {
                    return (
                      <div className="relative rounded-lg overflow-hidden border border-forest-100 bg-forest-50 flex items-center justify-center p-2 max-h-[360px]">
                        <img
                          src={thumb}
                          alt="Bukti Kwitansi"
                          referrerPolicy="no-referrer"
                          className="object-contain max-h-[340px] w-full rounded-md shadow-sm"
                          onError={() => {
                            console.error('Failed to load image preview');
                            setReceiptImageError(true);
                          }}
                        />
                      </div>
                    );
                  }
                  return (
                    <div className="rounded-lg border border-forest-200 bg-forest-50 p-6 text-center space-y-2">
                      <AiOutlinePaperClip size={36} className="mx-auto text-forest-600" />
                      <p className="text-sm font-medium text-forest-800">Bukti Kwitansi Tersimpan di Google Drive</p>
                      {receiptImageError && (
                        <p className="text-[11px] text-amber-600 font-medium">⚠️ Gagal memuat gambar preview secara langsung.</p>
                      )}
                    </div>
                  );
                })()}
                <div className="flex justify-center">
                  <a
                    href={viewReceipt.receipt_file}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg bg-forest-800 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-forest-700 transition-colors w-full justify-center"
                  >
                    👁️ Buka di Google Drive (Tab Baru)
                  </a>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border-2 border-dashed border-forest-200 bg-forest-50 p-8 text-center">
                <AiOutlinePaperClip size={32} className="mx-auto text-forest-400" />
                <p className="text-sm font-medium text-forest-700 mt-2">{viewReceipt.receipt_file}</p>
                <p className="text-[11px] text-forest-400 mt-1">
                  Preview file tidak tersedia di mode demo.
                </p>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Form modal ────────────────────────────────────────────────────
function ExpenseFormModal({ expense, isSaving, onSave, onClose }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const isEdit = !!expense;
  const [form, setForm] = useState({
    date: expense?.date || new Date().toISOString().split('T')[0],
    category: expense?.category || EXPENSE_CATEGORIES[0],
    amount: expense?.amount || '',
    description: expense?.description || '',
    receipt_file: expense?.receipt_file || '',
  });
  const [fileName, setFileName] = useState(expense?.receipt_file || '');

  const ACCEPTED_TYPES = ['image/jpeg', 'image/png'];
  const MAX_SIZE = 2 * 1024 * 1024; // 2 MB
  const [uploadError, setUploadError] = useState('');

  const handleFile = async (e) => {
    setUploadError('');
    const file = e.target.files?.[0];
    if (!file) {
      setFileName('');
      setForm({ ...form, receipt_file: '' });
      setSelectedFile(null);
      return;
    }
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setUploadError('Format tidak didukung. Gunakan JPG or PNG.');
      setFileName('');
      setSelectedFile(null);
      e.target.value = '';
      return;
    }
    if (file.size > MAX_SIZE) {
      setUploadError('Ukuran file melebihi 2 MB.');
      setFileName('');
      setSelectedFile(null);
      e.target.value = '';
      return;
    }
    try {
      const result = await compressImage(file);
      const compressedFile = result.file;
      setFileName(compressedFile.name);
      setForm({ ...form, receipt_file: compressedFile.name });
      setSelectedFile(compressedFile);
    } catch (err) {
      setFileName(file.name);
      setForm({ ...form, receipt_file: file.name });
      setSelectedFile(file);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.description.trim()) {
      return;
    }
    onSave({ ...form, description: form.description.trim() }, selectedFile);
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
              {EXPENSE_CATEGORIES.map((c) => (
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
          <label className={`flex items-center gap-3 p-3 border-2 border-dashed border-forest-200 rounded-lg transition-colors ${isSaving ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:border-gold-400 hover:bg-forest-50'}`}>
            <AiOutlinePaperClip size={20} className="text-forest-400 shrink-0" />
            <span className="text-sm text-forest-600 flex-1 truncate">
              {fileName || 'Pilih file bukti (foto kwitansi, JPG/PNG, maks 2 MB)'}
            </span>
            <input type="file" accept="image/jpeg,image/png" className="hidden" onChange={handleFile} disabled={isSaving} />
          </label>
          {uploadError && (
            <p className="text-[11px] text-red-600 mt-1">⚠️ {uploadError}</p>
          )}
          {fileName && (
            <button
              type="button"
              onClick={() => { if (!isSaving) { setFileName(''); setForm({ ...form, receipt_file: '' }); } }}
              disabled={isSaving}
              className={`text-[11px] mt-1 ${isSaving ? 'text-forest-300 cursor-not-allowed' : 'text-red-500 hover:text-red-700'}`}
            >
              Hapus file
            </button>
          )}
        </div>

        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose} disabled={isSaving} className="pv-btn-ghost flex-1 text-sm">
            Batal
          </button>
          <button type="submit" disabled={isSaving} className="pv-btn-primary flex-1 text-sm flex items-center justify-center gap-2">
            {isSaving ? (
              <>
                <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Menyimpan...
              </>
            ) : (
              isEdit ? 'Simpan Perubahan' : 'Catat'
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}
