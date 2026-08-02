import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import {
  assignEventMember,
  createEvent,
  updateEvent,
  deleteEvent,
  fetchEventMembers,
  fetchEvents,
  fetchMyEventAccess,
  fetchUsers,
  revokeEventMember,
} from '../services/dataService';
import { formatDateTime } from '../services/dataHelpers';

const EMPTY_FORM = {
  title: '',
  event_code: '',
  event_date: '',
  end_date: '',
  location: '',
  description: '',
  status: 'draft',
};

const getStatusBadge = (status) => {
  switch(status) {
    case 'active': return 'bg-emerald-100 text-emerald-700';
    case 'completed': return 'bg-blue-100 text-blue-700';
    case 'cancelled': return 'bg-red-100 text-red-600';
    case 'archived': return 'bg-yellow-100 text-yellow-700';
    case 'draft': default: return 'bg-gray-100 text-gray-600';
  }
};

export default function Events() {
  const { role, profile, session, isReadOnly } = useAuth();
  const toast = useToast();
  const token = session?.access_token;
  const profileId = profile?.id;
  const isAdmin = role === 'admin' && !isReadOnly;
  const isFinanceManager = role === 'admin' || role === 'bendahara';
  const [events, setEvents] = useState([]);
  const [access, setAccess] = useState({ events: [], global: {} });
  const [members, setMembers] = useState({});
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [memberForm, setMemberForm] = useState({});
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');
  const [editingEvent, setEditingEvent] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [eventRows, accessData] = await Promise.all([
        fetchEvents(token, { role, profileId }),
        fetchMyEventAccess(token, { role, profileId }),
      ]);
      setEvents(Array.isArray(eventRows) ? eventRows : []);
      setAccess(accessData || { events: [], global: {} });
      if (isAdmin) {
        const userRows = await fetchUsers(token);
        setUsers((userRows || []).filter((user) => user.is_active !== false && user.approval_status !== 'rejected'));
      }
    } catch (error) {
      toast.error(error.message || 'Gagal mengambil data event.');
    } finally {
      setLoading(false);
    }
  }, [isAdmin, profileId, role, session?.access_token, toast, token]);

  useEffect(() => { load(); }, [load]);

  const loadMembers = async (eventId) => {
    try {
      const rows = await fetchEventMembers(token, eventId);
      setMembers((current) => ({ ...current, [eventId]: rows || [] }));
    } catch (error) {
      toast.error(error.message || 'Gagal mengambil anggota event.');
    }
  };

  const submitEvent = async (event) => {
    event.preventDefault();
    if (!form.title.trim() || !form.event_code.trim() || !form.event_date) {
      toast.error('Judul, kode, dan tanggal mulai wajib diisi.');
      return;
    }
    try {
      if (editingEvent) {
        await updateEvent(token, editingEvent.id, {
          ...form,
          title: form.title.trim(),
          event_code: form.event_code.trim(),
          end_date: form.end_date || null,
          location: form.location.trim() || null,
          description: form.description.trim() || null,
        });
        toast.success('Event berhasil diupdate.');
      } else {
        await createEvent(token, {
          ...form,
          title: form.title.trim(),
          event_code: form.event_code.trim(),
          end_date: form.end_date || null,
          location: form.location.trim() || null,
          description: form.description.trim() || null,
        });
        toast.success('Event berhasil dibuat.');
      }
      setForm(EMPTY_FORM);
      setShowForm(false);
      setEditingEvent(null);
      await load();
    } catch (error) {
      toast.error(error.message || 'Gagal menyimpan event.');
    }
  };

  const removeEvent = async (id) => {
    if (!window.confirm('Hapus event ini beserta seluruh datanya?')) return;
    try {
      await deleteEvent(token, id);
      toast.success('Event berhasil dihapus.');
      await load();
    } catch (error) {
      toast.error(error.message || 'Gagal menghapus event.');
    }
  };

  const assign = async (eventId) => {
    const value = memberForm[eventId] || {};
    if (!value.profile_id || !value.assignment_role) {
      toast.error('Pilih profil dan assignment role.');
      return;
    }
    try {
      await assignEventMember(token, { event_id: eventId, ...value });
      toast.success('Assignment berhasil disimpan.');
      setMemberForm((current) => ({ ...current, [eventId]: {} }));
      await loadMembers(eventId);
    } catch (error) {
      toast.error(error.message || 'Gagal menyimpan assignment.');
    }
  };

  const revoke = async (eventId, assignmentId) => {
    if (!window.confirm('Cabut assignment pengguna ini?')) return;
    try {
      await revokeEventMember(token, assignmentId);
      toast.success('Assignment dicabut.');
      await loadMembers(eventId);
    } catch (error) {
      toast.error(error.message || 'Gagal mencabut assignment.');
    }
  };

  const assignedEventIds = useMemo(() => new Set((access.events || []).map((item) => item.event_id)), [access.events]);

  const filteredEvents = events.filter(e => filterStatus === 'all' || e.status === filterStatus);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-forest-900">Event / Kegiatan</h1>
          <p className="text-sm text-forest-500">Master event dan assignment pengelola keuangan.</p>
        </div>
        <div className="flex gap-2">
          <select className="pv-input py-1.5 text-sm" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="all">Semua Status</option>
            <option value="draft">Draft</option>
            <option value="active">Aktif</option>
            <option value="completed">Selesai</option>
            <option value="cancelled">Dibatalkan</option>
            <option value="archived">Diarsipkan</option>
          </select>
          {isAdmin && (
            <button type="button" className="pv-btn-primary whitespace-nowrap" onClick={() => {
              setForm(EMPTY_FORM);
              setEditingEvent(null);
              setShowForm((value) => !value);
            }}>
              {showForm ? 'Batal' : '+ Buat Event'}
            </button>
          )}
        </div>
      </div>

      {showForm && isAdmin && (
        <form className="pv-card grid gap-3 p-5 md:grid-cols-2" onSubmit={submitEvent}>
          <input className="pv-input" placeholder="Judul event *" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <input className="pv-input" placeholder="Kode event *" value={form.event_code} onChange={(e) => setForm({ ...form, event_code: e.target.value })} />
          <label className="text-sm text-forest-700">Mulai *<input className="pv-input mt-1" type="datetime-local" value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })} /></label>
          <label className="text-sm text-forest-700">Selesai<input className="pv-input mt-1" type="datetime-local" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></label>
          <input className="pv-input" placeholder="Lokasi" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          <select className="pv-input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            <option value="draft">Draft</option>
            <option value="active">Aktif</option>
            <option value="completed">Selesai</option>
            <option value="cancelled">Dibatalkan</option>
            <option value="archived">Diarsipkan</option>
          </select>
          <textarea className="pv-input md:col-span-2" rows="3" placeholder="Deskripsi" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <div className="md:col-span-2"><button className="pv-btn-primary" type="submit">Simpan Event</button></div>
        </form>
      )}

      {loading ? (
        <div className="pv-card p-8 flex flex-col items-center justify-center text-sm text-forest-500">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gold-500 border-t-transparent mb-4"></div>
          Memuat data event...
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="pv-card p-8 text-center text-sm text-forest-500">Tidak ada event yang sesuai dengan filter.</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filteredEvents.map((event) => {
            const isAssigned = assignedEventIds.has(event.id);
            const canManage = isAdmin || isFinanceManager || isAssigned;
            const eventMembers = members[event.id] || [];
            return (
              <article key={event.id} className="pv-card p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gold-700">{event.event_code}</p>
                    <h2 className="mt-1 text-lg font-bold text-forest-900">
                      {event.title}
                      {event.status === 'archived' && <span className="ml-2 text-xs font-normal text-yellow-700 bg-yellow-100 px-2 py-0.5 rounded">(Diarsipkan)</span>}
                    </h2>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-xs font-semibold uppercase ${getStatusBadge(event.status)}`}>{event.status}</span>
                </div>
                <p className="mt-3 text-sm text-forest-600">{formatDateTime(event.event_date)}{event.location ? ` · ${event.location}` : ''}</p>
                {event.description && <p className="mt-2 text-sm text-forest-500">{event.description}</p>}
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link className="pv-btn-ghost" to={`/events/${event.id}`}>Lihat Keuangan</Link>
                  {isAdmin && <button type="button" className="pv-btn-ghost" onClick={() => loadMembers(event.id)}>Anggota</button>}
                  {isAdmin && (
                    <>
                      <button type="button" className="text-xs text-blue-600 ml-auto" onClick={() => {
                        setEditingEvent(event);
                        setForm({
                          title: event.title,
                          event_code: event.event_code,
                          event_date: event.event_date ? new Date(event.event_date).toISOString().slice(0,16) : '',
                          end_date: event.end_date ? new Date(event.end_date).toISOString().slice(0,16) : '',
                          location: event.location || '',
                          description: event.description || '',
                          status: event.status,
                        });
                        setShowForm(true);
                      }}>Edit</button>
                      <button type="button" className="text-xs text-red-600 ml-2" onClick={() => removeEvent(event.id)}>Hapus</button>
                    </>
                  )}
                </div>
                {isAdmin && members[event.id] && (
                  <div className="mt-4 border-t border-forest-100 pt-4">
                    <p className="mb-2 text-xs font-semibold uppercase text-forest-500">Assignment aktif</p>
                    {eventMembers.length === 0 ? <p className="text-xs text-forest-400">Belum ada assignment.</p> : eventMembers.map((member) => (
                      <div key={member.id} className="flex items-center justify-between gap-2 py-1 text-sm">
                        <span>{member.profile_name || member.profile_id} <em className="text-xs text-forest-400">({member.assignment_role})</em></span>
                        {!member.revoked_at && <button type="button" className="text-xs text-red-600" onClick={() => revoke(event.id, member.id)}>Cabut</button>}
                      </div>
                    ))}
                    <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                      <select className="pv-input" value={memberForm[event.id]?.profile_id || ''} onChange={(e) => setMemberForm({ ...memberForm, [event.id]: { ...memberForm[event.id], profile_id: e.target.value } })}>
                        <option value="">Pilih profil aktif</option>
                        {users.map((user) => <option key={user.id} value={user.id}>{user.full_name || user.email}</option>)}
                      </select>
                      <select className="pv-input" value={memberForm[event.id]?.assignment_role || ''} onChange={(e) => setMemberForm({ ...memberForm, [event.id]: { ...memberForm[event.id], assignment_role: e.target.value } })}>
                        <option value="">Role</option><option value="event_treasurer">Bendahara Event</option><option value="coordinator_member">Anggota Koordinator</option>
                      </select>
                      <button type="button" className="pv-btn-primary" onClick={() => assign(event.id)}>Assign</button>
                    </div>
                  </div>
                )}
                {!isAdmin && canManage && <p className="mt-4 text-xs text-forest-500">Akses event aktif sesuai assignment akun.</p>}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
