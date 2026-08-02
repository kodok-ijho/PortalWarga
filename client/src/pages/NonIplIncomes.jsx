import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import {
  createNonIplIncome,
  updateNonIplIncome,
  deleteNonIplIncome,
  fetchEvents,
  fetchMyEventAccess,
  fetchNonIplIncomes,
} from '../services/dataService';
import { formatDate, formatRupiah } from '../services/dataHelpers';

const EMPTY_FORM = {
  income_date: new Date().toISOString().slice(0, 10),
  scope: 'general',
  event_id: '',
  category: '',
  source_name: '',
  amount: '',
  payment_method: 'cash',
  reference_number: '',
  description: '',
};

export default function NonIplIncomes() {
  const { role, profile, session, isReadOnly } = useAuth();
  const toast = useToast();
  const token = session?.access_token;
  const [rows, setRows] = useState([]);
  const [events, setEvents] = useState([]);
  const [access, setAccess] = useState({ events: [] });
  const [form, setForm] = useState(EMPTY_FORM);
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [filterScope, setFilterScope] = useState('all');
  const [filterEventId, setFilterEventId] = useState('');
  const canManageGeneral = !isReadOnly && (role === 'admin' || role === 'bendahara');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [incomeRows, eventRows, accessData] = await Promise.all([
        fetchNonIplIncomes(token),
        fetchEvents(token, { role, profileId: profile?.id }),
        fetchMyEventAccess(token, { role, profileId: profile?.id }),
      ]);
      setRows(incomeRows || []);
      setEvents(eventRows || []);
      setAccess(accessData || { events: [] });
    } catch (error) {
      toast.error(error.message || 'Gagal mengambil pemasukan non-IPL.');
    } finally {
      setLoading(false);
    }
  }, [profile?.id, role, session?.access_token, toast, token]);

  useEffect(() => { load(); }, [load]);

  const manageableEventIds = useMemo(() => new Set(
    (access.events || []).filter((item) => item.can_manage_finance).map((item) => item.event_id)
  ), [access.events]);
  const canManageForm = form.scope === 'general' ? canManageGeneral : manageableEventIds.has(form.event_id);

  const submit = async (event) => {
    event.preventDefault();
    if (!form.category.trim() || !form.source_name.trim() || !form.description.trim() || Number(form.amount) <= 0) {
      toast.error('Kategori, sumber, deskripsi, dan nominal positif wajib diisi.');
      return;
    }
    if (form.scope === 'event' && !form.event_id) {
      toast.error('Pilih event untuk pemasukan event.');
      return;
    }
    if (!canManageForm) {
      toast.error('Akun tidak memiliki hak kelola untuk scope ini.');
      return;
    }
    try {
      if (editingId) {
        await updateNonIplIncome(token, editingId, { ...form, amount: Number(form.amount), event_id: form.scope === 'event' ? form.event_id : null, file });
        toast.success('Pemasukan non-IPL berhasil diupdate.');
      } else {
        await createNonIplIncome(token, { ...form, amount: Number(form.amount), event_id: form.scope === 'event' ? form.event_id : null, file });
        toast.success('Pemasukan non-IPL berhasil dicatat.');
      }
      setForm(EMPTY_FORM);
      setFile(null);
      setEditingId(null);
      await load();
    } catch (error) {
      toast.error(error.message || 'Gagal menyimpan pemasukan.');
    }
  };

  const remove = async (id) => {
    if (!window.confirm('Hapus pemasukan ini? Data akan disimpan sebagai soft delete.')) return;
    try {
      await deleteNonIplIncome(token, id);
      toast.success('Pemasukan berhasil dihapus.');
      await load();
    } catch (error) {
      toast.error(error.message || 'Gagal menghapus pemasukan.');
    }
  };

  const filteredRows = rows.filter(row => {
    if (filterScope !== 'all' && row.scope !== filterScope) return false;
    if (filterScope === 'event' && filterEventId && row.event_id !== filterEventId) return false;
    return true;
  });

  const totalAmount = filteredRows.reduce((sum, row) => sum + Number(row.amount), 0);

  const getEventName = (eventId) => {
    const event = events.find(e => e.id === eventId);
    return event ? event.title : 'Event tidak diketahui';
  };

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold text-forest-900">Pemasukan Non-IPL</h1><p className="text-sm text-forest-500">Pisahkan pemasukan umum dan pemasukan event tanpa mengubah alur IPL.</p></div>
      <form className="pv-card grid gap-3 p-5 md:grid-cols-2" onSubmit={submit}>
        <div className="md:col-span-2 flex justify-between items-center mb-2 border-b border-forest-100 pb-2">
          <h2 className="font-semibold text-forest-900">{editingId ? 'Edit Pemasukan' : 'Catat Pemasukan Baru'}</h2>
          {editingId && (
            <button type="button" className="text-xs text-red-600 font-semibold" onClick={() => {
              setEditingId(null);
              setForm(EMPTY_FORM);
            }}>Batal Edit</button>
          )}
        </div>
        <label className="text-sm text-forest-700">Tanggal<input className="pv-input mt-1" type="date" value={form.income_date} onChange={(e) => setForm({ ...form, income_date: e.target.value })} /></label>
        <label className="text-sm text-forest-700">Scope<select className="pv-input mt-1" value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value, event_id: '' })}><option value="general">Umum / Non-Event</option><option value="event">Event / Kegiatan</option></select></label>
        {form.scope === 'event' && <label className="text-sm text-forest-700 md:col-span-2">Event<select className="pv-input mt-1" value={form.event_id} onChange={(e) => setForm({ ...form, event_id: e.target.value })}><option value="">Pilih event</option>{events.map((event) => <option key={event.id} value={event.id}>{event.event_code} · {event.title}</option>)}</select></label>}
        <input className="pv-input" placeholder="Kategori *" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
        <input className="pv-input" placeholder="Sumber / pembayar *" value={form.source_name} onChange={(e) => setForm({ ...form, source_name: e.target.value })} />
        <input className="pv-input" type="number" min="0.01" step="0.01" placeholder="Nominal *" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
        <select className="pv-input" value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })}><option value="cash">Cash</option><option value="bank_transfer">Bank Transfer</option><option value="other">Lainnya</option></select>
        <input className="pv-input" placeholder="Nomor referensi" value={form.reference_number} onChange={(e) => setForm({ ...form, reference_number: e.target.value })} />
        <input className="pv-input" type="file" accept="image/jpeg,image/png" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        <textarea className="pv-input md:col-span-2" rows="3" placeholder="Deskripsi *" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <div className="md:col-span-2"><button className="pv-btn-primary" type="submit" disabled={!canManageForm}>{editingId ? 'Simpan Perubahan' : 'Simpan Pemasukan'}</button>{!canManageForm && <p className="mt-2 text-xs text-forest-400">Scope ini tidak termasuk capability akun saat ini.</p>}</div>
      </form>

      <div className="pv-card overflow-hidden">
        <div className="border-b border-forest-100 px-5 py-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold text-forest-900">Daftar Pemasukan</h2>
          <div className="flex gap-2">
            <select className="pv-input py-1.5 text-sm" value={filterScope} onChange={(e) => {
              setFilterScope(e.target.value);
              if (e.target.value !== 'event') setFilterEventId('');
            }}>
              <option value="all">Semua Scope</option>
              <option value="general">Umum</option>
              <option value="event">Event</option>
            </select>
            {filterScope === 'event' && (
              <select className="pv-input py-1.5 text-sm max-w-[200px]" value={filterEventId} onChange={(e) => setFilterEventId(e.target.value)}>
                <option value="">Semua Event</option>
                {events.map((event) => <option key={event.id} value={event.id}>{event.title}</option>)}
              </select>
            )}
          </div>
        </div>
        {loading ? (
          <div className="p-8 flex flex-col items-center justify-center text-sm text-forest-500">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gold-500 border-t-transparent mb-4"></div>
            Memuat data...
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="p-8 text-center text-sm text-forest-500">
            <div className="text-4xl mb-2 opacity-50">💰</div>
            Belum ada pemasukan non-IPL untuk filter terpilih.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-forest-50 text-xs uppercase text-forest-500">
                <tr>
                  <th className="px-5 py-3">Tanggal</th>
                  <th className="px-5 py-3">Scope / Kategori</th>
                  <th className="px-5 py-3">Sumber</th>
                  <th className="px-5 py-3 text-right">Nominal</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-forest-100">
                {filteredRows.map((row) => (
                  <tr key={row.id}>
                    <td className="px-5 py-3">{formatDate(row.income_date)}</td>
                    <td className="px-5 py-3">
                      <span className="text-xs text-forest-400">
                        {row.scope === 'event' ? `Event: ${getEventName(row.event_id)}` : 'Umum'}
                      </span>
                      <div className="font-semibold text-forest-800">{row.category}</div>
                      {row.receipt_file_url && (
                        <a href={row.receipt_file_url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">Lihat Bukti</a>
                      )}
                    </td>
                    <td className="px-5 py-3">{row.source_name}</td>
                    <td className="px-5 py-3 text-right font-semibold text-emerald-700">{formatRupiah(row.amount)}</td>
                    <td className="px-5 py-3 text-right">
                      {(canManageGeneral || manageableEventIds.has(row.event_id)) && (
                        <div className="flex justify-end gap-2">
                          <button type="button" className="text-xs text-blue-600" onClick={() => {
                            setEditingId(row.id);
                            setForm({
                              income_date: row.income_date ? new Date(row.income_date).toISOString().slice(0,10) : '',
                              scope: row.scope,
                              event_id: row.event_id || '',
                              category: row.category,
                              source_name: row.source_name,
                              amount: row.amount,
                              payment_method: row.payment_method || 'cash',
                              reference_number: row.reference_number || '',
                              description: row.description || '',
                            });
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}>Edit</button>
                          <button type="button" className="text-xs text-red-600" onClick={() => remove(row.id)}>Hapus</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-forest-50 border-t border-forest-100">
                <tr>
                  <td colSpan="3" className="px-5 py-4 text-right font-bold text-forest-900">Total Pemasukan:</td>
                  <td className="px-5 py-4 text-right font-bold text-emerald-700 text-base">{formatRupiah(totalAmount)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
