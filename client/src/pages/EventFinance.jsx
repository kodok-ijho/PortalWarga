import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import {
  fetchEventDetail,
  fetchEventFinanceReport,
  fetchMyEventAccess,
  fetchEventMembers,
  createNonIplIncome,
  createExpense,
} from '../services/dataService';
import { formatDate, formatRupiah } from '../services/dataHelpers';

export default function EventFinance() {
  const { eventId } = useParams();
  const { role, profile, session } = useAuth();
  const toast = useToast();
  const [event, setEvent] = useState(null);
  const [report, setReport] = useState(null);
  const [access, setAccess] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  const [showIncomeForm, setShowIncomeForm] = useState(false);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [incomeForm, setIncomeForm] = useState({ income_date: new Date().toISOString().slice(0, 10), category: '', source_name: '', amount: '', payment_method: 'cash', description: '' });
  const [expenseForm, setExpenseForm] = useState({ expense_date: new Date().toISOString().slice(0, 10), category: '', amount: '', description: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [eventData, reportData, accessData, membersData] = await Promise.all([
        fetchEventDetail(session?.access_token, eventId),
        fetchEventFinanceReport(session?.access_token, { eventId }),
        fetchMyEventAccess(session?.access_token, { role, profileId: profile?.id }),
        fetchEventMembers(session?.access_token, eventId).catch(() => []),
      ]);
      setEvent(eventData);
      setReport(reportData);
      setAccess(accessData);
      setMembers(Array.isArray(membersData) ? membersData.filter(m => !m.revoked_at) : []);
    } catch (error) {
      toast.error(error.message || 'Gagal mengambil laporan keuangan event.');
    } finally {
      setLoading(false);
    }
  }, [eventId, profile?.id, role, session?.access_token, toast]);

  useEffect(() => { load(); }, [load]);

  const assignment = (access?.events || []).find((item) => item.event_id === eventId);
  const canView = role === 'admin' || role === 'bendahara' || role === 'admin_viewer'
    || Boolean(access?.global?.can_view_all_events) || Boolean(assignment?.can_view);
  const canManageFinance = role === 'admin' || role === 'bendahara' || Boolean(access?.global?.can_manage_finance) || Boolean(assignment?.can_manage_finance);

  const leader = members.find(m => m.assignment_role === 'event_leader');
  const treasurer = members.find(m => m.assignment_role === 'event_treasurer');

  const submitIncome = async (e) => {
    e.preventDefault();
    try {
      await createNonIplIncome(session?.access_token, { ...incomeForm, amount: Number(incomeForm.amount), scope: 'event', event_id: eventId });
      toast.success('Pemasukan event berhasil dicatat.');
      setIncomeForm({ ...incomeForm, category: '', source_name: '', amount: '', description: '' });
      setShowIncomeForm(false);
      await load();
    } catch (error) {
      toast.error(error.message || 'Gagal mencatat pemasukan.');
    }
  };

  const submitExpense = async (e) => {
    e.preventDefault();
    try {
      await createExpense(session?.access_token, { ...expenseForm, amount: Number(expenseForm.amount), event_id: eventId, is_event_expense: true });
      toast.success('Pengeluaran event berhasil dicatat.');
      setExpenseForm({ ...expenseForm, category: '', amount: '', description: '' });
      setShowExpenseForm(false);
      await load();
    } catch (error) {
      toast.error(error.message || 'Gagal mencatat pengeluaran.');
    }
  };

  if (loading) return <div className="pv-card p-8 text-center text-sm text-forest-500">Memuat laporan event...</div>;
  if (!canView || !event) return <div className="pv-card p-8 text-center text-sm text-red-600">Event tidak ditemukan atau tidak dapat diakses.</div>;

  let incomes = report?.incomes || [];
  let expenses = report?.expenses || [];

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
          {canManageFinance && <button className="pv-btn-primary py-1 px-3 text-xs" onClick={() => setShowIncomeForm(!showIncomeForm)}>{showIncomeForm ? 'Batal' : '+ Pemasukan'}</button>}
        </div>
        
        {showIncomeForm && (
          <form className="p-5 border-b border-forest-100 bg-forest-50 grid gap-3 md:grid-cols-2" onSubmit={submitIncome}>
            <input className="pv-input" type="date" value={incomeForm.income_date} onChange={e => setIncomeForm({...incomeForm, income_date: e.target.value})} required/>
            <input className="pv-input" placeholder="Kategori" value={incomeForm.category} onChange={e => setIncomeForm({...incomeForm, category: e.target.value})} required/>
            <input className="pv-input" placeholder="Sumber/Pembayar" value={incomeForm.source_name} onChange={e => setIncomeForm({...incomeForm, source_name: e.target.value})} required/>
            <input className="pv-input" type="number" placeholder="Nominal" value={incomeForm.amount} onChange={e => setIncomeForm({...incomeForm, amount: e.target.value})} required/>
            <select className="pv-input md:col-span-2" value={incomeForm.payment_method} onChange={e => setIncomeForm({...incomeForm, payment_method: e.target.value})}>
              <option value="cash">💵 Tunai / Cash</option>
              <option value="bank_transfer">🏦 Transfer Bank</option>
              <option value="qris">📱 QRIS</option>
              <option value="other">Lainnya</option>
            </select>
            <textarea className="pv-input md:col-span-2" rows="2" placeholder="Deskripsi" value={incomeForm.description} onChange={e => setIncomeForm({...incomeForm, description: e.target.value})}/>
            <button type="submit" className="pv-btn-primary md:col-span-2">Simpan Pemasukan</button>
          </form>
        )}

        {incomes.length === 0 ? <p className="p-5 text-sm text-forest-500">Belum ada pemasukan event.</p> : (
          <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-forest-50 text-xs uppercase text-forest-500"><tr><th className="px-5 py-3">Tanggal</th><th className="px-5 py-3">Kategori / Sumber</th><th className="px-5 py-3">Metode</th><th className="px-5 py-3 text-right">Nominal</th></tr></thead><tbody className="divide-y divide-forest-100">{incomes.map((income) => <tr key={income.id}><td className="px-5 py-3">{formatDate(income.income_date)}</td><td className="px-5 py-3"><div className="font-semibold text-forest-900">{income.category}</div><div className="text-xs text-forest-500">{income.source_name}</div></td><td className="px-5 py-3 text-xs font-medium text-forest-700">{income.payment_method === 'bank_transfer' ? '🏦 Transfer Bank' : income.payment_method === 'qris' ? '📱 QRIS' : income.payment_method === 'cash' ? '💵 Tunai' : (income.payment_method || '-')}</td><td className="px-5 py-3 text-right font-semibold text-emerald-700">{formatRupiah(income.amount)}</td></tr>)}</tbody></table></div>
        )}
      </div>

      <div className="pv-card overflow-hidden">
        <div className="border-b border-forest-100 px-5 py-4 flex justify-between items-center">
          <h2 className="font-semibold text-forest-900">Rincian Pengeluaran</h2>
          {canManageFinance && <button className="pv-btn-primary py-1 px-3 text-xs" onClick={() => setShowExpenseForm(!showExpenseForm)}>{showExpenseForm ? 'Batal' : '+ Pengeluaran'}</button>}
        </div>

        {showExpenseForm && (
          <form className="p-5 border-b border-forest-100 bg-forest-50 grid gap-3 md:grid-cols-2" onSubmit={submitExpense}>
            <input className="pv-input" type="date" value={expenseForm.expense_date} onChange={e => setExpenseForm({...expenseForm, expense_date: e.target.value})} required/>
            <input className="pv-input" placeholder="Kategori" value={expenseForm.category} onChange={e => setExpenseForm({...expenseForm, category: e.target.value})} required/>
            <input className="pv-input" type="number" placeholder="Nominal" value={expenseForm.amount} onChange={e => setExpenseForm({...expenseForm, amount: e.target.value})} required/>
            <textarea className="pv-input md:col-span-2" rows="2" placeholder="Deskripsi" value={expenseForm.description} onChange={e => setExpenseForm({...expenseForm, description: e.target.value})}/>
            <button type="submit" className="pv-btn-primary md:col-span-2">Simpan Pengeluaran</button>
          </form>
        )}

        {expenses.length === 0 ? <p className="p-5 text-sm text-forest-500">Belum ada pengeluaran event.</p> : (
          <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-forest-50 text-xs uppercase text-forest-500"><tr><th className="px-5 py-3">Tanggal</th><th className="px-5 py-3">Kategori</th><th className="px-5 py-3">Deskripsi</th><th className="px-5 py-3 text-right">Nominal</th></tr></thead><tbody className="divide-y divide-forest-100">{expenses.map((expense) => <tr key={expense.id}><td className="px-5 py-3">{formatDate(expense.expense_date || expense.date)}</td><td className="px-5 py-3 font-semibold text-forest-900">{expense.category}</td><td className="px-5 py-3 text-xs text-forest-500">{expense.description || '-'}</td><td className="px-5 py-3 text-right font-semibold text-red-600">{formatRupiah(expense.amount)}</td></tr>)}</tbody></table></div>
        )}
      </div>

      <p className="text-xs text-forest-400">Data laporan mengikuti otorisasi backend/RLS; akses assignment tidak dapat dipakai untuk event lain.</p>
    </div>
  );
}
