import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import {
  fetchEventDetail,
  fetchEventFinanceReport,
  fetchMyEventAccess,
  fetchEventMembers,
  createNonIplIncome,
  updateNonIplIncome,
  deleteNonIplIncome,
  createExpense,
  updateExpense,
  deleteExpense,
  fetchUnits,
  fetchResidents,
} from '../services/dataService';
import { formatDate, formatRupiah } from '../services/dataHelpers';

const EMPTY_INCOME_FORM = {
  income_date: new Date().toISOString().slice(0, 10),
  category: '',
  source_name: '',
  amount: '',
  payment_method: 'cash',
  description: '',
};

const EMPTY_EXPENSE_FORM = {
  expense_date: new Date().toISOString().slice(0, 10),
  category: '',
  amount: '',
  description: '',
};

export default function EventFinance() {
  const { eventId } = useParams();
  const { role, profile, session } = useAuth();
  const toast = useToast();
  const [event, setEvent] = useState(null);
  const [report, setReport] = useState(null);
  const [access, setAccess] = useState(null);
  const [members, setMembers] = useState([]);
  const [units, setUnits] = useState([]);
  const [residents, setResidents] = useState([]);
  const [loading, setLoading] = useState(true);

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  const [showIncomeForm, setShowIncomeForm] = useState(false);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [incomeForm, setIncomeForm] = useState(EMPTY_INCOME_FORM);
  const [expenseForm, setExpenseForm] = useState(EMPTY_EXPENSE_FORM);

  const [sourceSelection, setSourceSelection] = useState('');
  const [customSource, setCustomSource] = useState('');

  const [editingIncomeId, setEditingIncomeId] = useState(null);
  const [editingExpenseId, setEditingExpenseId] = useState(null);
  const [submittingIncome, setSubmittingIncome] = useState(false);
  const [submittingExpense, setSubmittingExpense] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [eventData, reportData, accessData, membersData, unitsData, residentsData] = await Promise.all([
        fetchEventDetail(session?.access_token, eventId),
        fetchEventFinanceReport(session?.access_token, { eventId }),
        fetchMyEventAccess(session?.access_token, { role, profileId: profile?.id }),
        fetchEventMembers(session?.access_token, eventId).catch(() => []),
        fetchUnits(session?.access_token).catch(() => []),
        fetchResidents(session?.access_token).catch(() => []),
      ]);
      setEvent(eventData);
      setReport(reportData);
      setAccess(accessData);
      setMembers(Array.isArray(membersData) ? membersData.filter(m => !m.revoked_at) : []);
      setUnits(Array.isArray(unitsData) ? unitsData : []);
      setResidents(Array.isArray(residentsData) ? residentsData : []);
    } catch (error) {
      toast.error(error.message || 'Gagal mengambil laporan keuangan event.');
    } finally {
      setLoading(false);
    }
  }, [eventId, profile?.id, role, session?.access_token, toast]);

  useEffect(() => { load(); }, [load]);

  // Transform units and residents into distinct sorted dropdown options per house
  const residentOptions = useMemo(() => {
    const list = [];
    const seenHouseKeys = new Set();

    // 1. Filter valid units
    const validUnits = (units || []).filter((u) => {
      if (!u) return false;
      if (u.id === 5) return false;
      if (u.block === 'Z_DEMO') return false;
      if (String(u.unit_number || '').includes('DEMO_HIDDEN')) return false;
      return true;
    });

    // 2. Sort units naturally by block then unit_number
    const sortedUnits = [...validUnits].sort((a, b) => {
      const blockCompare = String(a.block || '').localeCompare(String(b.block || ''), undefined, { numeric: true, sensitivity: 'base' });
      if (blockCompare !== 0) return blockCompare;
      return String(a.unit_number || '').localeCompare(String(b.unit_number || ''), undefined, { numeric: true, sensitivity: 'base' });
    });

    // 3. Process each unit distinct by house key
    sortedUnits.forEach((u) => {
      const block = String(u.block || '').trim();
      const unitNumber = String(u.unit_number || '').trim();
      const houseLabel = block && unitNumber ? `${block} no ${unitNumber}` : (block || unitNumber || `Unit ${u.id}`);
      const houseKey = `${block.toUpperCase()}_${unitNumber.toUpperCase()}`;

      if (seenHouseKeys.has(houseKey)) return;
      seenHouseKeys.add(houseKey);

      // Find residents associated with this unit
      const unitResidents = (residents || []).filter(
        (r) => r && String(r.unit_id) === String(u.id) && r.full_name
      );

      // Priority 1: active + approved + non-test
      let chosenResident = unitResidents.find(
        (r) => r.is_active && r.approval_status === 'approved' && !/test|uji coba/i.test(r.full_name || '')
      );

      // Priority 2: active + non-test
      if (!chosenResident) {
        chosenResident = unitResidents.find(
          (r) => r.is_active && !/test|uji coba/i.test(r.full_name || '')
        );
      }

      // Priority 3: any non-test
      if (!chosenResident) {
        chosenResident = unitResidents.find(
          (r) => !/test|uji coba/i.test(r.full_name || '')
        );
      }

      // Priority 4: fallback to u._occupant if exists
      const occupantNameFromUnit = u._occupant?.full_name ? String(u._occupant.full_name).trim() : '';

      // Priority 5: any registered resident for this unit
      if (!chosenResident && !occupantNameFromUnit && unitResidents.length > 0) {
        chosenResident = unitResidents[0];
      }

      const occupantName = chosenResident?.full_name?.trim() || occupantNameFromUnit || '';

      const displayLabel = occupantName
        ? `[${houseLabel}] ${occupantName}`
        : `[${houseLabel}] (Kosong / Belum terdata)`;

      const value = occupantName
        ? `${occupantName} - ${houseLabel}`
        : houseLabel;

      list.push({
        id: u.id,
        label: displayLabel,
        value,
        block: u.block || '',
        unit_number: u.unit_number || '',
        houseLabel,
        name: occupantName || '',
      });
    });

    return list;
  }, [residents, units]);

  const assignment = (access?.events || []).find((item) => item.event_id === eventId);
  const canView = role === 'admin' || role === 'bendahara' || role === 'admin_viewer'
    || Boolean(access?.global?.can_view_all_events) || Boolean(assignment?.can_view);
  const canManageFinance = role === 'admin' || role === 'bendahara' || Boolean(access?.global?.can_manage_finance) || Boolean(assignment?.can_manage_finance);

  const leader = members.find(m => m.assignment_role === 'event_leader');
  const treasurer = members.find(m => m.assignment_role === 'event_treasurer');

  const handleCancelIncomeForm = () => {
    setShowIncomeForm(false);
    setEditingIncomeId(null);
    setSourceSelection('');
    setCustomSource('');
    setIncomeForm(EMPTY_INCOME_FORM);
  };

  const handleCancelExpenseForm = () => {
    setShowExpenseForm(false);
    setEditingExpenseId(null);
    setExpenseForm(EMPTY_EXPENSE_FORM);
  };

  const handleStartEditIncome = (income) => {
    setEditingIncomeId(income.id);
    const existingSource = (income.source_name || '').trim();

    // Check if existingSource matches any option in residentOptions
    const match = residentOptions.find((opt) => {
      if (!existingSource) return false;
      const srcLower = existingSource.toLowerCase();
      const valLower = (opt.value || '').toLowerCase();
      const nameLower = (opt.name || '').toLowerCase();
      const labelLower = (opt.label || '').toLowerCase();
      const houseLower = (opt.houseLabel || '').toLowerCase();

      // Direct exact match
      if (valLower === srcLower || nameLower === srcLower || labelLower === srcLower) {
        return true;
      }
      // House label match (e.g., existingSource is "Ula H. iswara - CB1 no 6" or contains "CB1 no 6")
      if (houseLower && (srcLower.includes(houseLower) || houseLower.includes(srcLower))) {
        return true;
      }
      // Name match (if length > 2)
      if (nameLower && nameLower.length > 2 && (srcLower.includes(nameLower) || nameLower.includes(srcLower))) {
        return true;
      }
      return false;
    });

    if (match) {
      setSourceSelection(match.value);
      setCustomSource('');
      setIncomeForm({
        income_date: income.income_date ? new Date(income.income_date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
        category: income.category || '',
        source_name: match.value,
        amount: String(income.amount || ''),
        payment_method: income.payment_method || 'cash',
        description: income.description || '',
      });
    } else if (existingSource) {
      setSourceSelection('__OTHER__');
      setCustomSource(existingSource);
      setIncomeForm({
        income_date: income.income_date ? new Date(income.income_date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
        category: income.category || '',
        source_name: existingSource,
        amount: String(income.amount || ''),
        payment_method: income.payment_method || 'cash',
        description: income.description || '',
      });
    } else {
      setSourceSelection('');
      setCustomSource('');
      setIncomeForm({
        income_date: income.income_date ? new Date(income.income_date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
        category: income.category || '',
        source_name: '',
        amount: String(income.amount || ''),
        payment_method: income.payment_method || 'cash',
        description: income.description || '',
      });
    }

    setShowIncomeForm(true);
    window.scrollTo({ top: 300, behavior: 'smooth' });
  };

  const handleStartEditExpense = (expense) => {
    setEditingExpenseId(expense.id);
    setExpenseForm({
      expense_date: (expense.expense_date || expense.date) ? new Date(expense.expense_date || expense.date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
      category: expense.category || '',
      amount: String(expense.amount || ''),
      description: expense.description || '',
    });
    setShowExpenseForm(true);
    window.scrollTo({ top: 600, behavior: 'smooth' });
  };

  const submitIncome = async (e) => {
    e.preventDefault();
    if (submittingIncome) return;

    const finalSource = sourceSelection === '__OTHER__' ? customSource.trim() : (incomeForm.source_name || '').trim();
    if (!finalSource) {
      toast.error('Sumber / pembayar wajib dipilih atau diisi.');
      return;
    }

    setSubmittingIncome(true);
    try {
      const payload = {
        ...incomeForm,
        source_name: finalSource,
        amount: Number(incomeForm.amount),
        scope: 'event',
        event_id: eventId,
      };

      if (editingIncomeId) {
        await updateNonIplIncome(session?.access_token, editingIncomeId, payload);
        toast.success('Pemasukan event berhasil diperbarui.');
      } else {
        await createNonIplIncome(session?.access_token, payload);
        toast.success('Pemasukan event berhasil dicatat.');
      }

      handleCancelIncomeForm();
      await load();
    } catch (error) {
      toast.error(error.message || 'Gagal mencatat pemasukan.');
    } finally {
      setSubmittingIncome(false);
    }
  };

  const handleDeleteIncome = async (id) => {
    if (!window.confirm('Hapus pemasukan event ini? Transaksi yang dihapus tidak akan dihitung dalam laporan keuangan.')) return;
    try {
      await deleteNonIplIncome(session?.access_token, id);
      toast.success('Pemasukan event berhasil dihapus.');
      // Optimistic removal so UI updates immediately
      setReport((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          incomes: (prev.incomes || []).filter((item) => item.id !== id),
        };
      });
      await load();
    } catch (error) {
      toast.error(error.message || 'Gagal menghapus pemasukan.');
    }
  };

  const submitExpense = async (e) => {
    e.preventDefault();
    if (submittingExpense) return;
    setSubmittingExpense(true);
    try {
      if (editingExpenseId) {
        await updateExpense(session?.access_token, editingExpenseId, {
          date: expenseForm.expense_date,
          category: expenseForm.category,
          amount: Number(expenseForm.amount),
          description: expenseForm.description,
          scope: 'event',
          event_id: eventId,
          is_event_expense: true,
        });
        toast.success('Pengeluaran event berhasil diperbarui.');
      } else {
        await createExpense(session?.access_token, {
          ...expenseForm,
          amount: Number(expenseForm.amount),
          event_id: eventId,
          is_event_expense: true,
        });
        toast.success('Pengeluaran event berhasil dicatat.');
      }

      handleCancelExpenseForm();
      await load();
    } catch (error) {
      toast.error(error.message || 'Gagal mencatat pengeluaran.');
    } finally {
      setSubmittingExpense(false);
    }
  };

  const handleDeleteExpense = async (id) => {
    if (!window.confirm('Hapus pengeluaran event ini? Transaksi yang dihapus tidak akan dihitung dalam laporan keuangan.')) return;
    try {
      await deleteExpense(session?.access_token, id);
      toast.success('Pengeluaran event berhasil dihapus.');
      // Optimistic removal so UI updates immediately
      setReport((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          expenses: (prev.expenses || []).filter((item) => item.id !== id),
        };
      });
      await load();
    } catch (error) {
      toast.error(error.message || 'Gagal menghapus pengeluaran.');
    }
  };

  if (loading) return <div className="pv-card p-8 text-center text-sm text-forest-500">Memuat laporan event...</div>;
  if (!canView || !event) return <div className="pv-card p-8 text-center text-sm text-red-600">Event tidak ditemukan atau tidak dapat diakses.</div>;

  // Defensive filtering for soft-deleted items
  let incomes = (report?.incomes || []).filter(i => !i.deleted_at);
  let expenses = (report?.expenses || []).filter(e => !e.deleted_at);

  if (dateFrom) {
    incomes = incomes.filter(i => i.income_date >= dateFrom);
    expenses = expenses.filter(e => (e.expense_date || e.date) >= dateFrom);
  }
  if (dateTo) {
    incomes = incomes.filter(i => i.income_date <= dateTo);
    expenses = expenses.filter(e => (e.expense_date || e.date) <= dateTo);
  }
  if (categoryFilter) {
    incomes = incomes.filter(i => i.category.toLowerCase().includes(categoryFilter.toLowerCase()));
    expenses = expenses.filter(e => e.category.toLowerCase().includes(categoryFilter.toLowerCase()));
  }

  const filteredTotalIncome = incomes.reduce((sum, i) => sum + Number(i.amount), 0);
  const filteredTotalExpense = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const filteredNet = filteredTotalIncome - filteredTotalExpense;

  const handleExportCSV = () => {
    const rows = [
      ['Tipe', 'Tanggal', 'Kategori', 'Sumber/Keterangan', 'Metode', 'Nominal']
    ];
    incomes.forEach(i => {
      rows.push(['Pemasukan', formatDate(i.income_date), i.category, i.source_name || i.description, i.payment_method || '-', i.amount]);
    });
    expenses.forEach(e => {
      rows.push(['Pengeluaran', formatDate(e.expense_date || e.date), e.category, e.description, '-', e.amount]);
    });
    const csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `laporan_event_${eventId}.csv`);
    document.body.appendChild(link);
    link.click();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link className="text-sm text-forest-500 hover:text-forest-800" to="/events">← Kembali ke Daftar Event</Link>
          <div className="mt-2 flex items-center gap-3">
            <h1 className="text-2xl font-bold text-forest-900">{event.title}</h1>
            <span className="rounded-full bg-forest-100 px-3 py-1 text-xs font-semibold text-forest-700">{event.status}</span>
          </div>
          <p className="mt-1 text-sm text-forest-500">
            📅 {formatDate(event.event_date)}{event.location ? ` · 📍 ${event.location}` : ''}
          </p>

          {/* Committee badges in detail header */}
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-md bg-amber-50 border border-amber-200 px-2.5 py-1 text-amber-800 font-medium">
              👑 Ketua Event: {leader ? (leader.profile_name || 'Terdaftar') : 'Belum di-assign'}
            </span>
            <span className="rounded-md bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-emerald-800 font-medium">
              💰 Bendahara Event: {treasurer ? (treasurer.profile_name || 'Terdaftar') : 'Belum di-assign'}
            </span>
          </div>
        </div>

        {/* Documentation Link Button */}
        {event.documentation_url && (
          <a
            href={event.documentation_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-2 rounded-lg shadow-sm transition-colors"
          >
            <span>📁</span> Buka Folder Dokumentasi Kegiatan
          </a>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 bg-white p-4 rounded-xl shadow-sm border border-forest-100">
        <label className="text-sm text-forest-700 flex flex-col">Dari Tanggal<input type="date" className="pv-input py-1 text-sm mt-1" value={dateFrom} onChange={e => setDateFrom(e.target.value)}/></label>
        <label className="text-sm text-forest-700 flex flex-col">Sampai Tanggal<input type="date" className="pv-input py-1 text-sm mt-1" value={dateTo} onChange={e => setDateTo(e.target.value)}/></label>
        <label className="text-sm text-forest-700 flex flex-col">Kategori<input type="text" className="pv-input py-1 text-sm mt-1" placeholder="Cari..." value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}/></label>
        <div className="flex-1 text-right mt-5">
          <button type="button" className="pv-btn-ghost py-1.5 text-sm" onClick={handleExportCSV}>Export CSV</button>
        </div>
      </div>

      {!canManageFinance && <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-2 rounded-lg text-sm">Mode Read-Only: Anda login sebagai Ketua Event / Anggota Panitia / Viewer (Hanya memantau).</div>}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="pv-card p-4"><p className="text-xs text-forest-500">Total Pemasukan</p><p className="mt-1 text-xl font-bold text-emerald-700">{formatRupiah(filteredTotalIncome)}</p></div>
        <div className="pv-card p-4"><p className="text-xs text-forest-500">Total Pengeluaran</p><p className="mt-1 text-xl font-bold text-red-600">{formatRupiah(filteredTotalExpense)}</p></div>
        <div className="pv-card p-4"><p className="text-xs text-forest-500">Saldo / Net</p><p className="mt-1 text-xl font-bold text-forest-900">{formatRupiah(filteredNet)}</p></div>
      </div>

      <div className="pv-card overflow-hidden">
        <div className="border-b border-forest-100 px-5 py-4 flex justify-between items-center">
          <h2 className="font-semibold text-forest-900">Rincian Pemasukan</h2>
          {canManageFinance && (
            <button
              className="pv-btn-primary py-1 px-3 text-xs"
              onClick={() => {
                if (showIncomeForm) {
                  handleCancelIncomeForm();
                } else {
                  setShowIncomeForm(true);
                }
              }}
            >
              {showIncomeForm ? 'Batal' : '+ Pemasukan'}
            </button>
          )}
        </div>

        {showIncomeForm && (
          <form className="p-5 border-b border-forest-100 bg-forest-50 grid gap-3 md:grid-cols-2" onSubmit={submitIncome}>
            {editingIncomeId && (
              <div className="md:col-span-2 flex items-center justify-between rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-xs font-semibold text-blue-800">
                <span>✏️ Mengedit Pemasukan Event</span>
                <button
                  type="button"
                  onClick={handleCancelIncomeForm}
                  className="text-forest-600 hover:text-forest-900 underline font-normal"
                >
                  Batal Edit
                </button>
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-forest-700 mb-1">Tanggal *</label>
              <input
                className="pv-input w-full"
                type="date"
                value={incomeForm.income_date}
                onChange={e => setIncomeForm({...incomeForm, income_date: e.target.value})}
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-forest-700 mb-1">Kategori *</label>
              <input
                className="pv-input w-full"
                placeholder="Contoh: Patungan, Donasi"
                value={incomeForm.category}
                onChange={e => setIncomeForm({...incomeForm, category: e.target.value})}
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-forest-700 mb-1">Sumber / Pembayar *</label>
              <select
                className="pv-input w-full"
                value={sourceSelection}
                onChange={(e) => {
                  const val = e.target.value;
                  setSourceSelection(val);
                  if (val === '__OTHER__') {
                    setIncomeForm((prev) => ({ ...prev, source_name: customSource }));
                  } else {
                    setIncomeForm((prev) => ({ ...prev, source_name: val }));
                  }
                }}
                required
              >
                <option value="">-- Pilih Warga (No Rumah & Nama) --</option>
                <optgroup label="Daftar Warga Palm Village (Per Rumah)">
                  {residentOptions.map((opt) => (
                    <option key={opt.id} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Luar Warga / Lainnya">
                  <option value="__OTHER__">➕ Lainnya (Input Manual / Luar Warga)</option>
                </optgroup>
              </select>

              {sourceSelection === '__OTHER__' && (
                <input
                  type="text"
                  className="pv-input w-full mt-2 border-amber-400 focus:border-amber-600 bg-amber-50/60"
                  placeholder="Ketik sumber pembayaran manual (contoh: Kas RT, Sponsor, Donatur Luar)"
                  value={customSource}
                  onChange={(e) => {
                    const val = e.target.value;
                    setCustomSource(val);
                    setIncomeForm((prev) => ({ ...prev, source_name: val }));
                  }}
                  required
                  autoFocus
                />
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-forest-700 mb-1">Nominal (Rp) *</label>
              <input
                className="pv-input w-full"
                type="number"
                placeholder="Contoh: 750000"
                value={incomeForm.amount}
                onChange={e => setIncomeForm({...incomeForm, amount: e.target.value})}
                required
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-forest-700 mb-1">Metode Pembayaran</label>
              <select
                className="pv-input w-full"
                value={incomeForm.payment_method}
                onChange={e => setIncomeForm({...incomeForm, payment_method: e.target.value})}
              >
                <option value="cash">💵 Tunai / Cash</option>
                <option value="bank_transfer">🏦 Transfer Bank</option>
                <option value="qris">📱 QRIS</option>
                <option value="other">Lainnya</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-forest-700 mb-1">Deskripsi / Catatan</label>
              <textarea
                className="pv-input w-full"
                rows="2"
                placeholder="Keterangan tambahan (contoh: Pembayaran 1 - Lunas)"
                value={incomeForm.description}
                onChange={e => setIncomeForm({...incomeForm, description: e.target.value})}
              />
            </div>

            <button
              type="submit"
              className="pv-btn-primary md:col-span-2"
              disabled={submittingIncome}
            >
              {submittingIncome
                ? 'Menyimpan...'
                : editingIncomeId
                ? 'Simpan Perubahan Pemasukan'
                : 'Simpan Pemasukan'}
            </button>
          </form>
        )}

        {incomes.length === 0 ? <p className="p-5 text-sm text-forest-500">Belum ada pemasukan event.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-forest-50 text-xs uppercase text-forest-500 font-semibold">
                <tr>
                  <th className="px-5 py-3">Tanggal</th>
                  <th className="px-5 py-3">Kategori / Sumber</th>
                  <th className="px-5 py-3">Metode</th>
                  <th className="px-5 py-3 text-right">Nominal</th>
                  {canManageFinance && <th className="px-5 py-3 text-center">Aksi</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-forest-100">
                {incomes.map((income) => (
                  <tr key={income.id}>
                    <td className="px-5 py-3 whitespace-nowrap">{formatDate(income.income_date)}</td>
                    <td className="px-5 py-3">
                      <div className="font-semibold text-forest-900">{income.category}</div>
                      <div className="text-xs text-forest-500">{income.source_name}</div>
                      {income.description && (
                        <div className="text-xs text-forest-400 mt-0.5 line-clamp-1">{income.description}</div>
                      )}
                    </td>
                    <td className="px-5 py-3 text-xs font-medium text-forest-700 whitespace-nowrap">
                      {income.payment_method === 'bank_transfer'
                        ? '🏦 Transfer Bank'
                        : income.payment_method === 'qris'
                        ? '📱 QRIS'
                        : income.payment_method === 'cash'
                        ? '💵 Tunai'
                        : (income.payment_method || '-')}
                    </td>
                    <td className="px-5 py-3 text-right font-semibold text-emerald-700 whitespace-nowrap">
                      {formatRupiah(income.amount)}
                    </td>
                    {canManageFinance && (
                      <td className="px-5 py-3 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            className="text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline"
                            onClick={() => handleStartEditIncome(income)}
                          >
                            Edit
                          </button>
                          <span className="text-forest-200">|</span>
                          <button
                            type="button"
                            className="text-xs font-semibold text-red-600 hover:text-red-800 hover:underline"
                            onClick={() => handleDeleteIncome(income.id)}
                          >
                            Hapus
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="pv-card overflow-hidden">
        <div className="border-b border-forest-100 px-5 py-4 flex justify-between items-center">
          <h2 className="font-semibold text-forest-900">Rincian Pengeluaran</h2>
          {canManageFinance && (
            <button
              className="pv-btn-primary py-1 px-3 text-xs"
              onClick={() => {
                if (showExpenseForm) {
                  handleCancelExpenseForm();
                } else {
                  setShowExpenseForm(true);
                }
              }}
            >
              {showExpenseForm ? 'Batal' : '+ Pengeluaran'}
            </button>
          )}
        </div>

        {showExpenseForm && (
          <form className="p-5 border-b border-forest-100 bg-forest-50 grid gap-3 md:grid-cols-2" onSubmit={submitExpense}>
            {editingExpenseId && (
              <div className="md:col-span-2 flex items-center justify-between rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-xs font-semibold text-blue-800">
                <span>✏️ Mengedit Pengeluaran Event</span>
                <button
                  type="button"
                  onClick={handleCancelExpenseForm}
                  className="text-forest-600 hover:text-forest-900 underline font-normal"
                >
                  Batal Edit
                </button>
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-forest-700 mb-1">Tanggal *</label>
              <input className="pv-input w-full" type="date" value={expenseForm.expense_date} onChange={e => setExpenseForm({...expenseForm, expense_date: e.target.value})} required/>
            </div>
            <div>
              <label className="block text-xs font-medium text-forest-700 mb-1">Kategori *</label>
              <input className="pv-input w-full" placeholder="Kategori" value={expenseForm.category} onChange={e => setExpenseForm({...expenseForm, category: e.target.value})} required/>
            </div>
            <div>
              <label className="block text-xs font-medium text-forest-700 mb-1">Nominal (Rp) *</label>
              <input className="pv-input w-full" type="number" placeholder="Nominal" value={expenseForm.amount} onChange={e => setExpenseForm({...expenseForm, amount: e.target.value})} required/>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-forest-700 mb-1">Deskripsi / Catatan</label>
              <textarea className="pv-input w-full" rows="2" placeholder="Deskripsi" value={expenseForm.description} onChange={e => setExpenseForm({...expenseForm, description: e.target.value})}/>
            </div>
            <button
              type="submit"
              className="pv-btn-primary md:col-span-2"
              disabled={submittingExpense}
            >
              {submittingExpense
                ? 'Menyimpan...'
                : editingExpenseId
                ? 'Simpan Perubahan Pengeluaran'
                : 'Simpan Pengeluaran'}
            </button>
          </form>
        )}

        {expenses.length === 0 ? <p className="p-5 text-sm text-forest-500">Belum ada pengeluaran event.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-forest-50 text-xs uppercase text-forest-500 font-semibold">
                <tr>
                  <th className="px-5 py-3">Tanggal</th>
                  <th className="px-5 py-3">Kategori</th>
                  <th className="px-5 py-3">Deskripsi</th>
                  <th className="px-5 py-3 text-right">Nominal</th>
                  {canManageFinance && <th className="px-5 py-3 text-center">Aksi</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-forest-100">
                {expenses.map((expense) => (
                  <tr key={expense.id}>
                    <td className="px-5 py-3 whitespace-nowrap">{formatDate(expense.expense_date || expense.date)}</td>
                    <td className="px-5 py-3 font-semibold text-forest-900">{expense.category}</td>
                    <td className="px-5 py-3 text-xs text-forest-500">{expense.description || '-'}</td>
                    <td className="px-5 py-3 text-right font-semibold text-red-600 whitespace-nowrap">
                      {formatRupiah(expense.amount)}
                    </td>
                    {canManageFinance && (
                      <td className="px-5 py-3 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            className="text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline"
                            onClick={() => handleStartEditExpense(expense)}
                          >
                            Edit
                          </button>
                          <span className="text-forest-200">|</span>
                          <button
                            type="button"
                            className="text-xs font-semibold text-red-600 hover:text-red-800 hover:underline"
                            onClick={() => handleDeleteExpense(expense.id)}
                          >
                            Hapus
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-forest-400">Data laporan mengikuti otorisasi backend/RLS; akses assignment tidak dapat dipakai untuk event lain.</p>
    </div>
  );
}
