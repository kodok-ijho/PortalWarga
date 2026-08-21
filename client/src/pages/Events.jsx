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
  documentation_url: '',
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

const formatRoleBadge = (role, customTitle) => {
  switch (role) {
    case 'event_leader':
      return {
        label: customTitle ? `👑 Ketua Event (${customTitle})` : '👑 Ketua Event',
        className: 'bg-amber-100 text-amber-800 border-amber-300',
      };
    case 'event_treasurer':
      return {
        label: customTitle ? `💰 Bendahara Event (${customTitle})` : '💰 Bendahara Event',
        className: 'bg-emerald-100 text-emerald-800 border-emerald-300',
      };
    case 'coordinator_member':
    default:
      return {
        label: customTitle ? `👥 ${customTitle}` : '👥 Anggota / Sie Panitia',
        className: 'bg-blue-50 text-blue-700 border-blue-200',
      };
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
  }, [isAdmin, profileId, role, toast, token]);

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
      const payload = {
        ...form,
        title: form.title.trim(),
        event_code: form.event_code.trim(),
        end_date: form.end_date || null,
        location: form.location.trim() || null,
        description: form.description.trim() || null,
        documentation_url: form.documentation_url.trim() || null,
      };

      if (editingEvent) {
        await updateEvent(token, editingEvent.id, payload);
        toast.success('Event berhasil diupdate.');
      } else {
        await createEvent(token, payload);
        toast.success('Event berhasil dibuat. Silakan assign Ketua dan Bendahara Event.');
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
      toast.error('Pilih profil dan peran panitia.');
      return;
    }
    try {
      await assignEventMember(token, {
        event_id: eventId,
        profile_id: value.profile_id,
        assignment_role: value.assignment_role,
        custom_role_title: value.custom_role_title?.trim() || null,
      });
      toast.success('Panitia berhasil ditugaskan.');
      setMemberForm((current) => ({ ...current, [eventId]: {} }));
      await loadMembers(eventId);
    } catch (error) {
      toast.error(error.message || 'Gagal menyimpan penugasan panitia.');
    }
  };

  const revoke = async (eventId, assignmentId) => {
    if (!window.confirm('Cabut penugasan panitia ini?')) return;
    try {
      await revokeEventMember(token, assignmentId);
      toast.success('Penugasan panitia dicabut.');
      await loadMembers(eventId);
    } catch (error) {
      toast.error(error.message || 'Gagal mencabut penugasan.');
    }
  };

  const assignedEventIds = useMemo(() => new Set((access.events || []).map((item) => item.event_id)), [access.events]);

  const filteredEvents = events.filter(e => filterStatus === 'all' || e.status === filterStatus);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-forest-900">Event / Kegiatan</h1>
          <p className="text-sm text-forest-500">Master event, tautan dokumentasi, dan kepanitiaan event (Ketua, Bendahara, Sie).</p>
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
          <div className="md:col-span-2">
            <h2 className="text-base font-bold text-forest-900">{editingEvent ? 'Edit Data Event' : 'Buat Event Baru'}</h2>
            <p className="text-xs text-forest-500">Isi data kegiatan dan tautan Google Drive dokumentasi (opsional).</p>
          </div>
          <input className="pv-input" placeholder="Judul event *" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          <input className="pv-input" placeholder="Kode event (contoh: HUT-PV-2026) *" value={form.event_code} onChange={(e) => setForm({ ...form, event_code: e.target.value })} required />
          <label className="text-sm text-forest-700">Tanggal Mulai *<input className="pv-input mt-1" type="datetime-local" value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })} required /></label>
          <label className="text-sm text-forest-700">Tanggal Selesai (Opsional)<input className="pv-input mt-1" type="datetime-local" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></label>
          <input className="pv-input" placeholder="Lokasi kegiatan" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          <select className="pv-input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            <option value="draft">Draft</option>
            <option value="active">Aktif</option>
            <option value="completed">Selesai</option>
            <option value="cancelled">Dibatalkan</option>
            <option value="archived">Diarsipkan (Terkunci)</option>
          </select>
          <input className="pv-input md:col-span-2" placeholder="Link Folder Dokumentasi Kegiatan (Google Drive) - Opsional" value={form.documentation_url} onChange={(e) => setForm({ ...form, documentation_url: e.target.value })} />
          <textarea className="pv-input md:col-span-2" rows="3" placeholder="Deskripsi atau keterangan kegiatan" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <div className="flex gap-2 md:col-span-2">
            <button className="pv-btn-primary" type="submit">Simpan Event</button>
            <button className="pv-btn-ghost" type="button" onClick={() => { setShowForm(false); setEditingEvent(null); }}>Batal</button>
          </div>
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
            const eventMembers = (members[event.id] || []).filter(m => !m.revoked_at);
            const leader = eventMembers.find(m => m.assignment_role === 'event_leader');
            const treasurer = eventMembers.find(m => m.assignment_role === 'event_treasurer');

            return (
              <article key={event.id} className="pv-card flex flex-col justify-between p-5">
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-gold-700">{event.event_code}</p>
                      <h2 className="mt-1 text-lg font-bold text-forest-900">
                        {event.title}
                        {event.status === 'archived' && <span className="ml-2 text-xs font-normal text-yellow-700 bg-yellow-100 px-2 py-0.5 rounded">(Diarsipkan)</span>}
                      </h2>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase ${getStatusBadge(event.status)}`}>{event.status}</span>
                  </div>

                  <p className="mt-3 text-sm text-forest-600">
                    📅 {formatDateTime(event.event_date)}{event.location ? ` · 📍 ${event.location}` : ''}
                  </p>
                  
                  {event.description && <p className="mt-2 text-sm text-forest-500">{event.description}</p>}

                  {/* Documentation Link Preview */}
                  {event.documentation_url && (
                    <div className="mt-3 flex items-center gap-2">
                      <a
                        href={event.documentation_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 bg-blue-50 px-2.5 py-1 rounded-md border border-blue-200"
                      >
                        <span>📁</span> Buka Folder Dokumentasi Kegiatan
                      </a>
                    </div>
                  )}

                  {/* Committee status highlights */}
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className={`px-2 py-0.5 rounded border ${leader ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                      {leader ? `👑 Ketua: ${leader.profile_name || 'Terisi'}` : '⚠️ Ketua belum di-assign'}
                    </span>
                    <span className={`px-2 py-0.5 rounded border ${treasurer ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                      {treasurer ? `💰 Bendahara: ${treasurer.profile_name || 'Terisi'}` : '⚠️ Bendahara belum di-assign'}
                    </span>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-forest-100">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link className="pv-btn-primary py-1.5 text-xs" to={`/events/${event.id}`}>Lihat Keuangan</Link>
                    <button type="button" className="pv-btn-ghost py-1.5 text-xs" onClick={() => loadMembers(event.id)}>
                      {members[event.id] ? 'Tutup Panitia' : 'Kelola Panitia'}
                    </button>
                    {isAdmin && (
                      <div className="ml-auto flex items-center gap-2">
                        <button type="button" className="text-xs text-blue-600 hover:underline" onClick={() => {
                          setEditingEvent(event);
                          const toInputDate = (dStr) => {
                            if (!dStr) return '';
                            const d = new Date(dStr);
                            if (Number.isNaN(d.getTime())) return '';
                            const pad = (n) => String(n).padStart(2, '0');
                            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
                          };
                          setForm({
                            title: event.title || '',
                            event_code: event.event_code || '',
                            event_date: toInputDate(event.event_date),
                            end_date: toInputDate(event.end_date),
                            location: event.location || '',
                            description: event.description || '',
                            documentation_url: event.documentation_url || '',
                            status: event.status || 'draft',
                          });
                          setShowForm(true);
                        }}>Edit</button>
                        <button type="button" className="text-xs text-red-600 hover:underline" onClick={() => removeEvent(event.id)}>Hapus</button>
                      </div>
                    )}
                  </div>

                  {/* Panel Pengelolaan Anggota / Panitia */}
                  {members[event.id] && (
                    <div className="mt-4 rounded-xl bg-forest-50 p-4 border border-forest-200">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-xs font-bold uppercase tracking-wide text-forest-800">Susunan Kepanitiaan Event</p>
                        <span className="text-xs text-forest-500">{eventMembers.length} Panitia Aktif</span>
                      </div>

                      {eventMembers.length === 0 ? (
                        <p className="text-xs text-forest-400 italic py-2">Belum ada panitia yang ditugaskan. Ketua dan Bendahara Event wajib diisi.</p>
                      ) : (
                        <div className="space-y-2 mb-4">
                          {eventMembers.map((member) => {
                            const badge = formatRoleBadge(member.assignment_role, member.custom_role_title);
                            return (
                              <div key={member.id} className="flex items-center justify-between gap-2 p-2 bg-white rounded-lg border border-forest-100 text-sm">
                                <div>
                                  <span className="font-semibold text-forest-900">{member.profile_name || member.profile_id}</span>
                                  <span className={`ml-2 inline-block px-2 py-0.5 rounded text-xs border ${badge.className}`}>
                                    {badge.label}
                                  </span>
                                </div>
                                {isAdmin && (
                                  <button type="button" className="text-xs text-red-600 hover:underline px-2 py-1" onClick={() => revoke(event.id, member.id)}>
                                    Cabut
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {isAdmin && (
                        <div className="mt-3 pt-3 border-t border-forest-200/60">
                          <p className="text-xs font-semibold text-forest-700 mb-2">+ Tugaskan Panitia Baru</p>
                          <div className="grid gap-2 sm:grid-cols-2">
                            <select
                              className="pv-input text-xs"
                              value={memberForm[event.id]?.profile_id || ''}
                              onChange={(e) => setMemberForm({ ...memberForm, [event.id]: { ...memberForm[event.id], profile_id: e.target.value } })}
                            >
                              <option value="">Pilih warga / profil aktif *</option>
                              {users.map((user) => <option key={user.id} value={user.id}>{user.full_name || user.email}</option>)}
                            </select>

                            <select
                              className="pv-input text-xs"
                              value={memberForm[event.id]?.assignment_role || ''}
                              onChange={(e) => setMemberForm({ ...memberForm, [event.id]: { ...memberForm[event.id], assignment_role: e.target.value } })}
                            >
                              <option value="">Pilih Peran *</option>
                              <option value="event_leader">👑 Ketua Event (Mandatory)</option>
                              <option value="event_treasurer">💰 Bendahara Event (Mandatory)</option>
                              <option value="coordinator_member">👥 Anggota / Sie Panitia (Optional)</option>
                            </select>

                            <input
                              className="pv-input text-xs sm:col-span-2"
                              placeholder="Nama Sie / Keterangan Jabatan (Opsional, contoh: Sie Konsumsi, Sie Perlengkapan)"
                              value={memberForm[event.id]?.custom_role_title || ''}
                              onChange={(e) => setMemberForm({ ...memberForm, [event.id]: { ...memberForm[event.id], custom_role_title: e.target.value } })}
                            />

                            <button
                              type="button"
                              className="pv-btn-primary py-1.5 text-xs sm:col-span-2"
                              onClick={() => assign(event.id)}
                            >
                              Simpan Penugasan Panitia
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {!isAdmin && canManage && (
                    <p className="mt-3 text-xs text-forest-500">Akses Anda: {isFinanceManager ? 'Pengelola Keuangan Global' : 'Panitia Event Terdaftar'}.</p>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
