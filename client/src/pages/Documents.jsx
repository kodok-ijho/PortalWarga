import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AiOutlinePlus,
  AiOutlineEdit,
  AiOutlineDelete,
  AiOutlineEye,
  AiOutlineDownload,
  AiOutlineSearch,
  AiOutlineFilePdf,
  AiOutlineFileImage,
  AiOutlineFileText,
  AiOutlineFolder,
  AiOutlineCheckCircle,
  AiOutlineLock,
  AiOutlineUnlock,
  AiOutlineCloudUpload,
  AiOutlineExport,
  AiOutlineInfoCircle,
} from 'react-icons/ai';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import Modal from '../components/Modal';
import {
  fetchDocuments,
  uploadDocument,
  updateDocument,
  deleteDocument,
  fetchUnits,
  fetchEvents,
  fetchMyEventAccess,
} from '../services/dataService';
import {
  DOCUMENT_CATEGORIES,
  DOCUMENT_TYPES,
  documentTypeLabel,
  documentTypeColor,
  canUploadResidentDoc,
  canDeleteResidentDoc,
  canManageEventDoc,
  canManageEstateGeneralDoc,
  canManageEstateFinanceDoc,
  canViewEstateFinanceDoc,
  formatFileSize,
  formatDate,
  hasMinRole,
} from '../services/dataHelpers';

export default function Documents() {
  const { role, profile, session, isReadOnly } = useAuth();
  const token = session?.access_token;
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  // Tab state: 'resident' | 'event' | 'estate_general' | 'estate_finance'
  const initialCategory = searchParams.get('tab') || 'resident';
  const [activeTab, setActiveTab] = useState(
    ['resident', 'event', 'estate_general', 'estate_finance'].includes(initialCategory)
      ? initialCategory
      : 'resident'
  );

  // Data states
  const [documents, setDocuments] = useState([]);
  const [units, setUnits] = useState([]);
  const [events, setEvents] = useState([]);
  const [eventAccess, setEventAccess] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterUnitId, setFilterUnitId] = useState(searchParams.get('unit') || '');
  const [filterEventId, setFilterEventId] = useState(searchParams.get('event') || '');
  const [filterType, setFilterType] = useState('');
  const [filterPeriod, setFilterPeriod] = useState('');

  // Modals
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [previewDoc, setPreviewDoc] = useState(null);
  const [editDoc, setEditDoc] = useState(null);
  const [deleteDoc, setDeleteDoc] = useState(null);

  // Upload Form State
  const [uploadForm, setUploadForm] = useState({
    title: '',
    category: activeTab,
    description: '',
    document_type: 'lainnya',
    unit_id: '',
    event_id: '',
    period: '',
    is_viewable_by_warga: false,
    file: null,
  });

  const fileInputRef = useRef(null);

  // Determine user permissions
  const isPengurusOrAbove = hasMinRole(role, 'pengurus');
  const isBendaharaOrAbove = hasMinRole(role, 'bendahara');
  const isAdmin = role === 'admin';
  const isWarga = role === 'warga';
  const userUnitId = profile?.unit_id;

  // Manageable event IDs for committee members
  const manageableEventIds = useMemo(() => {
    return new Set(
      (eventAccess?.events || [])
        .filter((item) => item.can_manage_event || item.can_manage_finance)
        .map((item) => String(item.event_id))
    );
  }, [eventAccess?.events]);

  // Sync active tab with search param
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    const newParams = new URLSearchParams(searchParams);
    newParams.set('tab', tab);
    setSearchParams(newParams);
  };

  // Load initial data
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [docsRes, unitsRes, eventsRes, myAccessRes] = await Promise.allSettled([
        fetchDocuments(token, {
          role,
          user_unit_id: userUnitId,
        }),
        fetchUnits(token),
        fetchEvents(token),
        role === 'warga' ? fetchMyEventAccess(token) : Promise.resolve(null),
      ]);

      if (docsRes.status === 'fulfilled' && docsRes.value?.documents) {
        setDocuments(docsRes.value.documents);
      }
      if (unitsRes.status === 'fulfilled') {
        const uList = unitsRes.value?.units || (Array.isArray(unitsRes.value) ? unitsRes.value : []);
        setUnits(uList);
      }
      if (eventsRes.status === 'fulfilled') {
        const eList = eventsRes.value?.events || (Array.isArray(eventsRes.value) ? eventsRes.value : []);
        setEvents(eList);
      }
      if (myAccessRes.status === 'fulfilled' && myAccessRes.value) {
        setEventAccess(myAccessRes.value);
      }
    } catch (err) {
      console.error('Error loading documents data:', err);
      toast.error('Gagal memuat dokumen.');
    } finally {
      setIsLoading(false);
    }
  }, [token, role, userUnitId, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Open upload modal with defaults based on active tab
  const handleOpenUpload = (targetCategory = activeTab) => {
    const isResident = targetCategory === 'resident';
    const isEstateFinance = targetCategory === 'estate_finance';
    const isEvent = targetCategory === 'event';

    setUploadForm({
      title: '',
      category: targetCategory,
      description: '',
      document_type: isResident ? 'ktp' : isEstateFinance ? 'bulanan' : isEvent ? 'proposal' : 'ad_art',
      unit_id: isResident ? (isWarga ? String(userUnitId || '') : filterUnitId || '') : '',
      event_id: isEvent ? filterEventId || '' : '',
      period: isEstateFinance ? new Date().toISOString().slice(0, 7) : '',
      is_viewable_by_warga: isResident ? true : false,
      file: null,
    });
    setUploadModalOpen(true);
  };

  // Filter documents based on active tab and search/filter inputs
  const filteredDocuments = useMemo(() => {
    return documents.filter((doc) => {
      // 1. Tab category filter
      if (activeTab === 'estate_general' || activeTab === 'estate_finance') {
        if (doc.category !== activeTab) return false;
      } else if (doc.category !== activeTab) {
        return false;
      }

      // 2. Unit filter (for resident docs)
      if (activeTab === 'resident') {
        if (isWarga) {
          // Warga can strictly only view docs from their own unit
          if (String(doc.unit_id) !== String(userUnitId)) return false;
        } else if (filterUnitId && String(doc.unit_id) !== String(filterUnitId)) {
          return false;
        }
      }

      // 3. Event filter (for event docs)
      if (activeTab === 'event') {
        if (filterEventId && String(doc.event_id) !== String(filterEventId)) {
          return false;
        }
        // Visibility for warga
        if (isWarga) {
          const isCommittee = manageableEventIds.has(String(doc.event_id));
          if (!isCommittee && !doc.is_viewable_by_warga) {
            return false;
          }
        }
      }

      // 4. Estate finance visibility
      if (activeTab === 'estate_finance') {
        if (!canViewEstateFinanceDoc(role, doc.is_viewable_by_warga)) {
          return false;
        }
      }

      // 5. Estate general visibility
      if (activeTab === 'estate_general' && isWarga && !doc.is_viewable_by_warga) {
        return false;
      }

      // 6. Type filter
      if (filterType && doc.document_type !== filterType) {
        return false;
      }

      // 7. Period filter
      if (filterPeriod && doc.period !== filterPeriod) {
        return false;
      }

      // 8. Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = (doc.title || '').toLowerCase().includes(q);
        const matchDesc = (doc.description || '').toLowerCase().includes(q);
        const matchFile = (doc.file_name || '').toLowerCase().includes(q);
        const matchPath = (doc.gdrive_folder_path || '').toLowerCase().includes(q);
        if (!matchTitle && !matchDesc && !matchFile && !matchPath) return false;
      }

      return true;
    });
  }, [
    documents,
    activeTab,
    isWarga,
    userUnitId,
    filterUnitId,
    filterEventId,
    filterType,
    filterPeriod,
    searchQuery,
    role,
    manageableEventIds,
  ]);

  // Statistics counts
  const stats = useMemo(() => {
    const residentDocs = documents.filter((d) => d.category === 'resident');
    const eventDocs = documents.filter((d) => d.category === 'event');
    const generalDocs = documents.filter((d) => d.category === 'estate_general');
    const financeDocs = documents.filter((d) => d.category === 'estate_finance');
    return {
      total: documents.length,
      resident: residentDocs.length,
      event: eventDocs.length,
      estate_general: generalDocs.length,
      estate_finance: financeDocs.length,
    };
  }, [documents]);

  // Can user upload in current category?
  const canUploadCurrentTab = useMemo(() => {
    if (isReadOnly) return false;
    if (activeTab === 'resident') {
      if (isPengurusOrAbove) return true;
      return isWarga && Boolean(userUnitId);
    }
    if (activeTab === 'event') {
      return isPengurusOrAbove || manageableEventIds.size > 0;
    }
    if (activeTab === 'estate_general') {
      return canManageEstateGeneralDoc(role, isReadOnly);
    }
    if (activeTab === 'estate_finance') {
      return canManageEstateFinanceDoc(role, isReadOnly);
    }
    return false;
  }, [activeTab, isReadOnly, isPengurusOrAbove, isWarga, userUnitId, manageableEventIds, role]);

  // Handle file drop / selection
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check size limit: 10MB
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error('Ukuran berkas melebihi batas 10 MB.');
      return;
    }

    // Check mime type for financial report: must be PDF
    if (uploadForm.category === 'estate_finance' && file.type !== 'application/pdf') {
      toast.error('Laporan keuangan perumahan wajib dalam format PDF.');
      return;
    }

    setUploadForm((prev) => ({
      ...prev,
      file,
      title: prev.title || file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' '),
    }));
  };

  // Submit upload
  const handleSubmitUpload = async (e) => {
    e.preventDefault();
    if (!uploadForm.file) {
      toast.error('Silakan pilih berkas yang akan diunggah.');
      return;
    }
    if (!uploadForm.title.trim()) {
      toast.error('Judul dokumen wajib diisi.');
      return;
    }

    // Category-specific validations
    if (uploadForm.category === 'resident') {
      const targetUnit = isWarga ? userUnitId : uploadForm.unit_id;
      if (!targetUnit) {
        toast.error('Pilih nomor rumah/unit warga.');
        return;
      }
    }
    if (uploadForm.category === 'event' && !uploadForm.event_id) {
      toast.error('Pilih event / kegiatan terkait.');
      return;
    }
    if (uploadForm.category === 'estate_finance') {
      if (uploadForm.file.type !== 'application/pdf') {
        toast.error('Dokumen laporan keuangan wajib berformat PDF.');
        return;
      }
      if (!uploadForm.period) {
        toast.error('Periode laporan keuangan wajib diisi (misal: 2026-09).');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      // Determine folder path & Google Drive Folder ID
      let gdriveFolderId = DOCUMENT_CATEGORIES[uploadForm.category]?.gdriveFolderId || '';
      let folderPath = null;

      if (uploadForm.category === 'resident') {
        const targetUnitId = isWarga ? userUnitId : uploadForm.unit_id;
        const u = units.find((x) => String(x.id) === String(targetUnitId));
        folderPath = u ? `${u.block}-${u.unit_number}` : `Unit-${targetUnitId}`;
      } else if (uploadForm.category === 'event') {
        const ev = events.find((x) => String(x.id) === String(uploadForm.event_id));
        folderPath = ev ? `${ev.id}-${ev.title || 'Event'}` : `Event-${uploadForm.event_id}`;
      }

      const fields = {
        title: uploadForm.title.trim(),
        category: uploadForm.category,
        description: uploadForm.description.trim(),
        document_type: uploadForm.document_type,
        unit_id: uploadForm.category === 'resident' ? (isWarga ? userUnitId : uploadForm.unit_id) : null,
        event_id: uploadForm.category === 'event' ? uploadForm.event_id : null,
        profile_id: uploadForm.category === 'resident' ? profile?.id : null,
        period: uploadForm.period || null,
        is_viewable_by_warga:
          uploadForm.category === 'resident' ? true : Boolean(uploadForm.is_viewable_by_warga),
        gdrive_folder_id: gdriveFolderId,
        gdrive_folder_path: folderPath,
        uploaded_by: profile?.id,
      };

      const res = await uploadDocument(token, {
        file: uploadForm.file,
        fields,
      });

      if (res?.document) {
        setDocuments((prev) => [res.document, ...prev]);
        toast.success(`Dokumen "${uploadForm.title}" berhasil diunggah ke Google Drive!`);
        setUploadModalOpen(false);
      }
    } catch (err) {
      console.error('Upload failed:', err);
      toast.error(err?.message || 'Gagal mengunggah dokumen.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit edit / visibility change
  const handleSubmitEdit = async (e) => {
    e.preventDefault();
    if (!editDoc) return;

    setIsSubmitting(true);
    try {
      const updates = {
        title: editDoc.title,
        description: editDoc.description,
        is_viewable_by_warga: Boolean(editDoc.is_viewable_by_warga),
        document_type: editDoc.document_type,
      };

      const res = await updateDocument(token, {
        id: editDoc.id,
        ...updates,
      });

      if (res?.document) {
        setDocuments((prev) => prev.map((d) => (d.id === editDoc.id ? { ...d, ...res.document } : d)));
        toast.success('Pengaturan dokumen berhasil diperbarui.');
        setEditDoc(null);
      }
    } catch (err) {
      console.error('Update failed:', err);
      toast.error(err?.message || 'Gagal memperbarui dokumen.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Confirm delete document
  const handleConfirmDelete = async () => {
    if (!deleteDoc) return;
    setIsSubmitting(true);
    try {
      await deleteDocument(token, deleteDoc.id);
      setDocuments((prev) => prev.filter((d) => d.id !== deleteDoc.id));
      toast.success(`Dokumen "${deleteDoc.title}" berhasil dihapus.`);
      setDeleteDoc(null);
    } catch (err) {
      console.error('Delete failed:', err);
      toast.error(err?.message || 'Gagal menghapus dokumen.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helper to check if current user can delete a document
  const canUserDelete = (doc) => {
    if (isReadOnly) return false;
    if (doc.category === 'resident') {
      return canDeleteResidentDoc(role, isReadOnly);
    }
    if (doc.category === 'event') {
      const isCommittee = manageableEventIds.has(String(doc.event_id));
      return canManageEventDoc(role, isCommittee, isReadOnly);
    }
    if (doc.category === 'estate_general') {
      return canManageEstateGeneralDoc(role, isReadOnly);
    }
    if (doc.category === 'estate_finance') {
      return canManageEstateFinanceDoc(role, isReadOnly);
    }
    return false;
  };

  // Helper to check if current user can edit/manage a document
  const canUserEdit = (doc) => {
    if (isReadOnly) return false;
    if (doc.category === 'resident') {
      return isPengurusOrAbove || (isWarga && String(doc.unit_id) === String(userUnitId));
    }
    if (doc.category === 'event') {
      const isCommittee = manageableEventIds.has(String(doc.event_id));
      return canManageEventDoc(role, isCommittee, isReadOnly);
    }
    if (doc.category === 'estate_general') {
      return canManageEstateGeneralDoc(role, isReadOnly);
    }
    if (doc.category === 'estate_finance') {
      return canManageEstateFinanceDoc(role, isReadOnly);
    }
    return false;
  };

  // Render Google Drive folder link
  const currentCategoryGdriveUrl = useMemo(() => {
    const cat = DOCUMENT_CATEGORIES[activeTab];
    return cat ? `https://drive.google.com/drive/folders/${cat.gdriveFolderId}` : null;
  }, [activeTab]);

  return (
    <div className="space-y-6">
      {/* ── HEADER & ACTIONS ──────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-gradient-to-r from-forest-800 to-forest-900 text-white p-6 rounded-2xl shadow-elevated">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 text-xs font-semibold bg-gold-400 text-forest-950 rounded-full uppercase tracking-wider">
              Google Drive Cloud
            </span>
            <span className="text-xs text-forest-200">Terpusat & Aman</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Dokumen & Arsip Digital</h1>
          <p className="text-sm text-forest-200 max-w-2xl">
            Arsip berkas identitas kependudukan, proposal & LPJ kegiatan, serta transparansi laporan
            keuangan Paguyuban Palm Village.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {currentCategoryGdriveUrl && (
            <a
              href={currentCategoryGdriveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium bg-forest-700/60 hover:bg-forest-700 text-white border border-forest-600 transition"
              title="Buka Folder Google Drive Resmi"
            >
              <AiOutlineExport className="text-sm" />
              <span>Buka Google Drive</span>
            </a>
          )}
          {canUploadCurrentTab && (
            <button
              onClick={() => handleOpenUpload(activeTab)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-gold-400 hover:bg-gold-500 text-forest-950 shadow transition active:scale-95"
            >
              <AiOutlinePlus className="text-base" />
              <span>Upload Dokumen</span>
            </button>
          )}
        </div>
      </div>

      {/* ── SUMMARY STAT CARDS ────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div
          onClick={() => handleTabChange('resident')}
          className={`cursor-pointer p-4 rounded-xl border transition ${
            activeTab === 'resident'
              ? 'bg-blue-50 border-blue-300 shadow-sm'
              : 'bg-white border-forest-100 hover:border-forest-200'
          }`}
        >
          <div className="flex items-center justify-between text-blue-600 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider">Dokumen Warga</span>
            <AiOutlineFileImage className="text-lg" />
          </div>
          <div className="text-2xl font-bold text-gray-900">{stats.resident}</div>
          <p className="text-xs text-gray-500 mt-0.5">KTP, KK & Berkas Rumah</p>
        </div>

        <div
          onClick={() => handleTabChange('event')}
          className={`cursor-pointer p-4 rounded-xl border transition ${
            activeTab === 'event'
              ? 'bg-purple-50 border-purple-300 shadow-sm'
              : 'bg-white border-forest-100 hover:border-forest-200'
          }`}
        >
          <div className="flex items-center justify-between text-purple-600 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider">Dokumen Event</span>
            <AiOutlineFolder className="text-lg" />
          </div>
          <div className="text-2xl font-bold text-gray-900">{stats.event}</div>
          <p className="text-xs text-gray-500 mt-0.5">Proposal & Laporan Kegiatan</p>
        </div>

        <div
          onClick={() => handleTabChange('estate_general')}
          className={`cursor-pointer p-4 rounded-xl border transition ${
            activeTab === 'estate_general'
              ? 'bg-emerald-50 border-emerald-300 shadow-sm'
              : 'bg-white border-forest-100 hover:border-forest-200'
          }`}
        >
          <div className="flex items-center justify-between text-emerald-600 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider">Perumahan: Umum</span>
            <AiOutlineFileText className="text-lg" />
          </div>
          <div className="text-2xl font-bold text-gray-900">{stats.estate_general}</div>
          <p className="text-xs text-gray-500 mt-0.5">AD/ART & Tata Tertib</p>
        </div>

        <div
          onClick={() => handleTabChange('estate_finance')}
          className={`cursor-pointer p-4 rounded-xl border transition ${
            activeTab === 'estate_finance'
              ? 'bg-amber-50 border-amber-300 shadow-sm'
              : 'bg-white border-forest-100 hover:border-forest-200'
          }`}
        >
          <div className="flex items-center justify-between text-amber-600 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider">Laporan Keuangan</span>
            <AiOutlineFilePdf className="text-lg" />
          </div>
          <div className="text-2xl font-bold text-gray-900">{stats.estate_finance}</div>
          <p className="text-xs text-gray-500 mt-0.5">Laporan Arus Kas (PDF)</p>
        </div>
      </div>

      {/* ── TABS NAVIGATION ──────────────────────────────────── */}
      <div className="border-b border-forest-100 flex flex-wrap gap-2 text-sm font-medium">
        <button
          onClick={() => handleTabChange('resident')}
          className={`pb-3 px-3 transition border-b-2 ${
            activeTab === 'resident'
              ? 'border-forest-700 text-forest-900 font-bold'
              : 'border-transparent text-gray-500 hover:text-forest-700'
          }`}
        >
          Dokumen Warga
        </button>
        <button
          onClick={() => handleTabChange('event')}
          className={`pb-3 px-3 transition border-b-2 ${
            activeTab === 'event'
              ? 'border-forest-700 text-forest-900 font-bold'
              : 'border-transparent text-gray-500 hover:text-forest-700'
          }`}
        >
          Dokumen Event & Kegiatan
        </button>
        <button
          onClick={() => handleTabChange('estate_general')}
          className={`pb-3 px-3 transition border-b-2 ${
            activeTab === 'estate_general'
              ? 'border-forest-700 text-forest-900 font-bold'
              : 'border-transparent text-gray-500 hover:text-forest-700'
          }`}
        >
          Perumahan: Dokumen Umum
        </button>
        <button
          onClick={() => handleTabChange('estate_finance')}
          className={`pb-3 px-3 transition border-b-2 ${
            activeTab === 'estate_finance'
              ? 'border-forest-700 text-forest-900 font-bold'
              : 'border-transparent text-gray-500 hover:text-forest-700'
          }`}
        >
          Perumahan: Laporan Keuangan (PDF)
        </button>
      </div>

      {/* ── CATEGORY DESCRIPTION BANNER ──────────────────────── */}
      <div className="flex items-start gap-3 p-3.5 bg-forest-50 border border-forest-100 rounded-xl text-xs text-forest-800">
        <AiOutlineInfoCircle className="text-base text-forest-600 mt-0.5 flex-shrink-0" />
        <div className="leading-relaxed">
          <strong>{DOCUMENT_CATEGORIES[activeTab]?.label}:</strong>{' '}
          {DOCUMENT_CATEGORIES[activeTab]?.description}{' '}
          <span className="text-forest-600">
            Tersinkronisasi otomatis dengan Google Drive Folder:{' '}
            <code className="bg-white px-1.5 py-0.5 rounded border border-forest-200 font-mono text-[10px]">
              {DOCUMENT_CATEGORIES[activeTab]?.gdriveFolderId}
            </code>
          </span>
        </div>
      </div>

      {/* ── FILTER & SEARCH TOOLBAR ──────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-forest-100 shadow-sm">
        {/* Search */}
        <div className="relative flex-1 min-w-[220px]">
          <AiOutlineSearch className="absolute left-3.5 top-3 text-gray-400 text-base" />
          <input
            type="text"
            placeholder="Cari judul, nama berkas, nomor rumah..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-forest-200 rounded-lg text-xs focus:ring-1 focus:ring-forest-600 focus:outline-none"
          />
        </div>

        {/* Dynamic Contextual Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Unit Filter (Dokumen Warga) */}
          {activeTab === 'resident' && !isWarga && (
            <select
              value={filterUnitId}
              onChange={(e) => setFilterUnitId(e.target.value)}
              className="px-3 py-2 border border-forest-200 rounded-lg text-xs bg-white text-gray-700 focus:ring-1 focus:ring-forest-600"
            >
              <option value="">Semua Rumah / Unit</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  Rumah {u.block}-{u.unit_number}
                </option>
              ))}
            </select>
          )}

          {/* Event Filter (Dokumen Event) */}
          {activeTab === 'event' && (
            <select
              value={filterEventId}
              onChange={(e) => setFilterEventId(e.target.value)}
              className="px-3 py-2 border border-forest-200 rounded-lg text-xs bg-white text-gray-700 focus:ring-1 focus:ring-forest-600"
            >
              <option value="">Semua Event</option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.title || `Event #${ev.id}`}
                </option>
              ))}
            </select>
          )}

          {/* Document Type Filter */}
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-3 py-2 border border-forest-200 rounded-lg text-xs bg-white text-gray-700 focus:ring-1 focus:ring-forest-600"
          >
            <option value="">Semua Jenis Dokumen</option>
            {activeTab === 'resident' && (
              <>
                <option value="ktp">KTP</option>
                <option value="kk">Kartu Keluarga (KK)</option>
                <option value="sim">SIM</option>
                <option value="bukti_kepemilikan">Bukti Kepemilikan</option>
                <option value="lainnya">Lainnya</option>
              </>
            )}
            {activeTab === 'event' && (
              <>
                <option value="proposal">Proposal</option>
                <option value="laporan_keuangan">Laporan Keuangan</option>
                <option value="laporan_kegiatan">Laporan Kegiatan</option>
                <option value="lpj">LPJ</option>
                <option value="lainnya">Lainnya</option>
              </>
            )}
            {activeTab === 'estate_general' && (
              <>
                <option value="ad_art">AD/ART</option>
                <option value="peraturan">Peraturan Lingkungan</option>
                <option value="surat_edaran">Surat Edaran</option>
                <option value="lainnya">Lainnya</option>
              </>
            )}
            {activeTab === 'estate_finance' && (
              <>
                <option value="bulanan">Laporan Bulanan</option>
                <option value="tahunan">Laporan Tahunan</option>
                <option value="neraca">Neraca</option>
                <option value="lainnya">Lainnya</option>
              </>
            )}
          </select>

          {/* Reset Filters Button */}
          {(searchQuery || filterUnitId || filterEventId || filterType || filterPeriod) && (
            <button
              onClick={() => {
                setSearchQuery('');
                setFilterUnitId('');
                setFilterEventId('');
                setFilterType('');
                setFilterPeriod('');
              }}
              className="px-2.5 py-1.5 text-xs text-forest-600 hover:text-forest-800 underline font-medium"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* ── DOCUMENTS LISTING ─────────────────────────────────── */}
      {isLoading ? (
        <div className="py-16 text-center text-forest-600 bg-white rounded-2xl border border-forest-100">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-forest-200 border-t-forest-700 mb-3" />
          <p className="text-sm">Memuat data dokumen & arsip digital...</p>
        </div>
      ) : filteredDocuments.length === 0 ? (
        <div className="py-16 px-4 text-center bg-white rounded-2xl border border-dashed border-forest-200">
          <AiOutlineFolder className="mx-auto text-4xl text-forest-300 mb-3" />
          <h3 className="text-sm font-semibold text-gray-800">Belum ada dokumen yang ditemukan</h3>
          <p className="text-xs text-gray-500 max-w-md mx-auto mt-1">
            {searchQuery || filterUnitId || filterEventId || filterType
              ? 'Tidak ada dokumen yang cocok dengan filter yang dipilih.'
              : 'Belum ada dokumen yang diunggah pada kategori ini.'}
          </p>
          {canUploadCurrentTab && (
            <button
              onClick={() => handleOpenUpload(activeTab)}
              className="mt-4 inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg bg-forest-800 hover:bg-forest-900 text-white shadow transition"
            >
              <AiOutlinePlus />
              <span>Unggah Dokumen Baru</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredDocuments.map((doc) => {
            const isPdf = doc.mime_type === 'application/pdf' || (doc.file_name || '').endsWith('.pdf');
            const unit = doc.unit_id ? units.find((u) => String(u.id) === String(doc.unit_id)) : null;
            const event = doc.event_id ? events.find((e) => String(e.id) === String(doc.event_id)) : null;
            const canEdit = canUserEdit(doc);
            const canDel = canUserDelete(doc);

            return (
              <div
                key={doc.id}
                className="pv-card flex flex-col justify-between hover:shadow-elevated transition border border-forest-100/80 group"
              >
                <div>
                  {/* Top Badge Row */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span
                      className={`px-2 py-0.5 text-[10px] font-semibold rounded-full border ${documentTypeColor(
                        doc.document_type
                      )}`}
                    >
                      {documentTypeLabel(doc.document_type)}
                    </span>

                    {/* Visibility Pill */}
                    {doc.is_viewable_by_warga ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full">
                        <AiOutlineEye className="text-xs" />
                        <span>Dibagikan ke Warga</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200 rounded-full">
                        <AiOutlineLock className="text-xs" />
                        <span>Internal / Arsip Khusus</span>
                      </span>
                    )}
                  </div>

                  {/* Icon & Title */}
                  <div className="flex items-start gap-3">
                    <div
                      className={`p-2.5 rounded-xl flex-shrink-0 ${
                        isPdf ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'
                      }`}
                    >
                      {isPdf ? (
                        <AiOutlineFilePdf className="text-2xl" />
                      ) : (
                        <AiOutlineFileImage className="text-2xl" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4
                        className="font-bold text-gray-900 text-sm leading-snug line-clamp-2 hover:text-forest-800 cursor-pointer"
                        onClick={() => setPreviewDoc(doc)}
                        title={doc.title}
                      >
                        {doc.title}
                      </h4>
                      {doc.description && (
                        <p className="text-xs text-gray-500 line-clamp-2 mt-1">{doc.description}</p>
                      )}
                    </div>
                  </div>

                  {/* Context Info Pills (Unit / Event / Period) */}
                  <div className="mt-3 pt-3 border-t border-forest-50 flex flex-wrap items-center gap-1.5 text-[11px] text-gray-600">
                    {unit && (
                      <span className="px-2 py-0.5 bg-gray-100 rounded text-gray-700 font-medium">
                        Unit {unit.block}-{unit.unit_number}
                      </span>
                    )}
                    {event && (
                      <span className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded font-medium truncate max-w-[180px]">
                        {event.title}
                      </span>
                    )}
                    {doc.period && (
                      <span className="px-2 py-0.5 bg-forest-50 text-forest-700 rounded font-medium">
                        Periode: {doc.period}
                      </span>
                    )}
                    {doc.gdrive_folder_path && (
                      <span className="px-2 py-0.5 bg-sky-50 text-sky-700 rounded font-mono text-[10px]">
                        📁 {doc.gdrive_folder_path}
                      </span>
                    )}
                  </div>
                </div>

                {/* Bottom Row & Actions */}
                <div className="mt-4 pt-3 border-t border-forest-100 flex items-center justify-between text-xs text-gray-400">
                  <div className="space-y-0.5">
                    <div>{formatFileSize(doc.file_size)}</div>
                    <div className="text-[10px]">{formatDate(doc.created_at)}</div>
                  </div>

                  <div className="flex items-center gap-1">
                    {/* View Preview */}
                    <button
                      onClick={() => setPreviewDoc(doc)}
                      className="p-1.5 rounded-lg text-forest-700 hover:bg-forest-50 transition"
                      title="Lihat Detail & Berkas"
                    >
                      <AiOutlineEye className="text-base" />
                    </button>

                    {/* Direct Download */}
                    {doc.file_download_url && (
                      <a
                        href={doc.file_download_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded-lg text-forest-700 hover:bg-forest-50 transition"
                        title="Unduh Berkas"
                        download
                      >
                        <AiOutlineDownload className="text-base" />
                      </a>
                    )}

                    {/* Edit / Visibility */}
                    {canEdit && (
                      <button
                        onClick={() => setEditDoc(doc)}
                        className="p-1.5 rounded-lg text-amber-600 hover:bg-amber-50 transition"
                        title="Edit Dokumen & Visibilitas"
                      >
                        <AiOutlineEdit className="text-base" />
                      </button>
                    )}

                    {/* Delete */}
                    {canDel && (
                      <button
                        onClick={() => setDeleteDoc(doc)}
                        className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 transition"
                        title="Hapus Dokumen"
                      >
                        <AiOutlineDelete className="text-base" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── MODAL: UPLOAD DOKUMEN ────────────────────────────── */}
      <Modal
        open={uploadModalOpen}
        onClose={() => !isSubmitting && setUploadModalOpen(false)}
        title="Upload Dokumen Baru ke Google Drive"
        size="lg"
      >
        <form onSubmit={handleSubmitUpload} className="space-y-4 text-xs">
          {/* Category Selector */}
          <div>
            <label className="block font-semibold text-gray-700 mb-1">Kategori Dokumen</label>
            <select
              value={uploadForm.category}
              onChange={(e) => {
                const newCat = e.target.value;
                setUploadForm((prev) => ({
                  ...prev,
                  category: newCat,
                  document_type:
                    newCat === 'resident'
                      ? 'ktp'
                      : newCat === 'estate_finance'
                      ? 'bulanan'
                      : newCat === 'event'
                      ? 'proposal'
                      : 'ad_art',
                  is_viewable_by_warga: newCat === 'resident',
                  period: newCat === 'estate_finance' ? new Date().toISOString().slice(0, 7) : '',
                }));
              }}
              className="w-full px-3 py-2 border border-forest-200 rounded-lg text-xs bg-white focus:ring-1 focus:ring-forest-600"
            >
              {(isPengurusOrAbove || (isWarga && userUnitId)) && (
                <option value="resident">Dokumen Warga (KTP, KK, Identitas)</option>
              )}
              {(isPengurusOrAbove || manageableEventIds.size > 0) && (
                <option value="event">Dokumen Event (Proposal, LPJ Kegiatan)</option>
              )}
              {isPengurusOrAbove && (
                <option value="estate_general">Dokumen Perumahan: Umum (AD/ART, Tata Tertib)</option>
              )}
              {isBendaharaOrAbove && (
                <option value="estate_finance">Dokumen Perumahan: Laporan Keuangan (PDF)</option>
              )}
            </select>
            <p className="text-[10px] text-gray-500 mt-1">
              Google Drive Folder ID:{' '}
              <code className="text-forest-700 font-mono">
                {DOCUMENT_CATEGORIES[uploadForm.category]?.gdriveFolderId}
              </code>
            </p>
          </div>

          {/* Conditional Unit Selector (for Dokumen Warga) */}
          {uploadForm.category === 'resident' && (
            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                Nomor Rumah / Unit Warga <span className="text-red-500">*</span>
              </label>
              {isWarga ? (
                <div className="p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-700 font-medium">
                  {units.find((u) => String(u.id) === String(userUnitId))
                    ? `Unit ${units.find((u) => String(u.id) === String(userUnitId)).block}-${
                        units.find((u) => String(u.id) === String(userUnitId)).unit_number
                      }`
                    : `Rumah Anda (ID #${userUnitId})`}
                  <span className="ml-2 text-[10px] text-forest-600">
                    (Otomatis dialokasikan ke folder rumah Anda di Google Drive)
                  </span>
                </div>
              ) : (
                <select
                  value={uploadForm.unit_id}
                  onChange={(e) => setUploadForm({ ...uploadForm, unit_id: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-forest-200 rounded-lg text-xs bg-white focus:ring-1 focus:ring-forest-600"
                >
                  <option value="">-- Pilih Unit / Rumah --</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      Blok {u.block} No. {u.unit_number} (ID: {u.id})
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Conditional Event Selector (for Dokumen Event) */}
          {uploadForm.category === 'event' && (
            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                Event / Kegiatan Terkait <span className="text-red-500">*</span>
              </label>
              <select
                value={uploadForm.event_id}
                onChange={(e) => setUploadForm({ ...uploadForm, event_id: e.target.value })}
                required
                className="w-full px-3 py-2 border border-forest-200 rounded-lg text-xs bg-white focus:ring-1 focus:ring-forest-600"
              >
                <option value="">-- Pilih Event --</option>
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.title || `Event #${ev.id}`}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Document Type & Period */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                Jenis Dokumen <span className="text-red-500">*</span>
              </label>
              <select
                value={uploadForm.document_type}
                onChange={(e) => setUploadForm({ ...uploadForm, document_type: e.target.value })}
                className="w-full px-3 py-2 border border-forest-200 rounded-lg text-xs bg-white focus:ring-1 focus:ring-forest-600"
              >
                {uploadForm.category === 'resident' && (
                  <>
                    <option value="ktp">KTP</option>
                    <option value="kk">Kartu Keluarga (KK)</option>
                    <option value="sim">SIM</option>
                    <option value="bukti_kepemilikan">Bukti Kepemilikan (AJB/SHM)</option>
                    <option value="lainnya">Lainnya</option>
                  </>
                )}
                {uploadForm.category === 'event' && (
                  <>
                    <option value="proposal">Proposal Kegiatan</option>
                    <option value="laporan_keuangan">Laporan Keuangan Event</option>
                    <option value="laporan_kegiatan">Laporan Kegiatan</option>
                    <option value="lpj">Laporan Pertanggungjawaban (LPJ)</option>
                    <option value="lainnya">Lainnya</option>
                  </>
                )}
                {uploadForm.category === 'estate_general' && (
                  <>
                    <option value="ad_art">AD/ART Paguyuban</option>
                    <option value="peraturan">Peraturan & Tata Tertib</option>
                    <option value="surat_edaran">Surat Edaran</option>
                    <option value="lainnya">Lainnya</option>
                  </>
                )}
                {uploadForm.category === 'estate_finance' && (
                  <>
                    <option value="bulanan">Laporan Arus Kas Bulanan</option>
                    <option value="tahunan">Laporan Keuangan Tahunan</option>
                    <option value="neraca">Neraca Saldo</option>
                    <option value="lainnya">Lainnya</option>
                  </>
                )}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                Periode / Tahun{' '}
                {uploadForm.category === 'estate_finance' && <span className="text-red-500">*</span>}
              </label>
              <input
                type="text"
                placeholder={uploadForm.category === 'estate_finance' ? 'Contoh: 2026-09 atau 2026' : 'Opsional (misal: 2026)'}
                value={uploadForm.period}
                onChange={(e) => setUploadForm({ ...uploadForm, period: e.target.value })}
                required={uploadForm.category === 'estate_finance'}
                className="w-full px-3 py-2 border border-forest-200 rounded-lg text-xs focus:ring-1 focus:ring-forest-600 focus:outline-none"
              />
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block font-semibold text-gray-700 mb-1">
              Judul Dokumen <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="Contoh: KTP Siti Rahayu / Laporan Kas Agustus 2026"
              value={uploadForm.title}
              onChange={(e) => setUploadForm({ ...uploadForm, title: e.target.value })}
              required
              className="w-full px-3 py-2 border border-forest-200 rounded-lg text-xs focus:ring-1 focus:ring-forest-600 focus:outline-none"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block font-semibold text-gray-700 mb-1">Keterangan / Catatan Singkat</label>
            <textarea
              rows={2}
              placeholder="Tambahkan rincian isi berkas atau catatan penting..."
              value={uploadForm.description}
              onChange={(e) => setUploadForm({ ...uploadForm, description: e.target.value })}
              className="w-full px-3 py-2 border border-forest-200 rounded-lg text-xs focus:ring-1 focus:ring-forest-600 focus:outline-none"
            />
          </div>

          {/* File Upload Zone */}
          <div>
            <label className="block font-semibold text-gray-700 mb-1">
              Berkas Dokumen <span className="text-red-500">*</span>
            </label>
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-forest-200 hover:border-forest-500 rounded-xl p-6 text-center cursor-pointer bg-forest-50/40 hover:bg-forest-50/80 transition"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept={
                  uploadForm.category === 'estate_finance'
                    ? 'application/pdf'
                    : '.pdf,image/png,image/jpeg,image/jpg'
                }
                onChange={handleFileChange}
                className="hidden"
              />
              <AiOutlineCloudUpload className="mx-auto text-3xl text-forest-500 mb-2" />
              {uploadForm.file ? (
                <div className="space-y-1">
                  <p className="font-semibold text-forest-900">{uploadForm.file.name}</p>
                  <p className="text-[11px] text-gray-500">{formatFileSize(uploadForm.file.size)}</p>
                  <span className="inline-block px-2 py-0.5 bg-forest-200 text-forest-800 text-[10px] rounded font-medium">
                    Klik untuk mengganti berkas
                  </span>
                </div>
              ) : (
                <div className="space-y-1 text-gray-500">
                  <p className="font-medium text-gray-700">Pilih berkas dari perangkat Anda</p>
                  <p className="text-[11px]">
                    {uploadForm.category === 'estate_finance'
                      ? 'Format wajib: PDF (Maks. 10 MB)'
                      : 'Format didukung: PDF, JPG, PNG (Maks. 10 MB)'}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Visibility Toggle Switch (for non-resident docs) */}
          {uploadForm.category !== 'resident' && (
            <div className="pt-2 border-t border-forest-100 flex items-center justify-between">
              <div>
                <label className="font-semibold text-gray-800 block">
                  Dapat Dilihat oleh Warga (Publikasi)
                </label>
                <p className="text-[10px] text-gray-500">
                  {uploadForm.category === 'estate_finance'
                    ? 'Pengurus tetap dapat melihat otomatis. Warga hanya dapat melihat jika opsi ini diaktifkan.'
                    : 'Jika dinonaktifkan, dokumen hanya dapat diakses oleh Panitia/Pengurus/Admin.'}
                </p>
              </div>
              <input
                type="checkbox"
                checked={uploadForm.is_viewable_by_warga}
                onChange={(e) =>
                  setUploadForm({ ...uploadForm, is_viewable_by_warga: e.target.checked })
                }
                className="h-4 w-4 text-forest-700 rounded border-gray-300 focus:ring-forest-600 cursor-pointer"
              />
            </div>
          )}

          {/* Actions */}
          <div className="pt-4 border-t border-forest-100 flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => setUploadModalOpen(false)}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 bg-forest-800 hover:bg-forest-900 disabled:bg-gray-300 text-white rounded-lg font-semibold flex items-center gap-1.5 shadow transition"
            >
              {isSubmitting ? (
                <>
                  <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-white border-t-transparent" />
                  <span>Mengunggah ke Drive...</span>
                </>
              ) : (
                <>
                  <AiOutlineCloudUpload className="text-base" />
                  <span>Mulai Upload</span>
                </>
              )}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── MODAL: PREVIEW & DETAIL DOKUMEN ───────────────────── */}
      <Modal
        open={Boolean(previewDoc)}
        onClose={() => setPreviewDoc(null)}
        title={previewDoc?.title || 'Detail Dokumen'}
        size="lg"
      >
        {previewDoc && (
          <div className="space-y-4 text-xs">
            {/* Metadata Pill Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-forest-50/50 p-3 rounded-xl border border-forest-100">
              <div>
                <span className="text-[10px] text-gray-500 uppercase block">Kategori</span>
                <span className="font-semibold text-gray-800">
                  {DOCUMENT_CATEGORIES[previewDoc.category]?.label || previewDoc.category}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-gray-500 uppercase block">Tipe</span>
                <span className="font-semibold text-gray-800">
                  {documentTypeLabel(previewDoc.document_type)}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-gray-500 uppercase block">Ukuran File</span>
                <span className="font-semibold text-gray-800">
                  {formatFileSize(previewDoc.file_size)}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-gray-500 uppercase block">Waktu Unggah</span>
                <span className="font-semibold text-gray-800">
                  {formatDate(previewDoc.created_at)}
                </span>
              </div>
            </div>

            {/* Description & Path */}
            {previewDoc.description && (
              <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 text-gray-700">
                <p className="font-medium mb-0.5 text-gray-900">Keterangan:</p>
                <p>{previewDoc.description}</p>
              </div>
            )}

            {/* Google Drive Location */}
            <div className="p-3 bg-blue-50/50 border border-blue-100 rounded-xl text-blue-900 flex items-center justify-between">
              <div>
                <span className="font-semibold block">Lokasi Penyimpanan Google Drive:</span>
                <span className="text-[11px] text-blue-700 font-mono">
                  Folder ID: {previewDoc.gdrive_folder_id}{' '}
                  {previewDoc.gdrive_folder_path && `› ${previewDoc.gdrive_folder_path}`}
                </span>
              </div>
              <a
                href={previewDoc.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium inline-flex items-center gap-1 shadow-sm transition"
              >
                <AiOutlineExport className="text-sm" />
                <span>Buka di Google Drive</span>
              </a>
            </div>

            {/* Preview Frame for Images / PDFs */}
            <div className="border border-forest-100 rounded-xl overflow-hidden bg-gray-50 min-h-[300px] flex items-center justify-center p-2">
              {previewDoc.mime_type?.startsWith('image/') ||
              previewDoc.file_name?.match(/\.(jpg|jpeg|png)$/i) ? (
                <img
                  src={previewDoc.file_url}
                  alt={previewDoc.title}
                  className="max-h-[450px] object-contain rounded-lg mx-auto shadow-sm"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    e.currentTarget.parentElement.innerHTML = `
                      <div class="text-center p-6 text-gray-500">
                        <p class="font-medium text-gray-700">Pratinjau gambar internal tidak dapat dimuat langsung.</p>
                        <p class="text-xs mt-1">Silakan klik tombol "Buka di Google Drive" di atas untuk melihat berkas asli.</p>
                      </div>
                    `;
                  }}
                />
              ) : previewDoc.mime_type === 'application/pdf' ||
                previewDoc.file_name?.endsWith('.pdf') ? (
                <div className="w-full text-center p-8 space-y-3">
                  <AiOutlineFilePdf className="mx-auto text-5xl text-red-500" />
                  <div>
                    <h5 className="font-bold text-gray-900 text-sm">{previewDoc.file_name}</h5>
                    <p className="text-gray-500 text-xs mt-0.5">
                      Dokumen Portable Document Format (PDF)
                    </p>
                  </div>
                  <div className="flex items-center justify-center gap-2 pt-2">
                    <a
                      href={previewDoc.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 bg-forest-800 hover:bg-forest-900 text-white rounded-lg font-medium inline-flex items-center gap-1.5 transition"
                    >
                      <AiOutlineEye className="text-base" />
                      <span>Lihat Dokumen PDF di Drive</span>
                    </a>
                    {previewDoc.file_download_url && (
                      <a
                        href={previewDoc.file_download_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-2 border border-gray-300 hover:bg-white text-gray-700 rounded-lg font-medium inline-flex items-center gap-1.5 transition"
                      >
                        <AiOutlineDownload className="text-base" />
                        <span>Unduh PDF</span>
                      </a>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-center p-8 space-y-2 text-gray-500">
                  <AiOutlineFileText className="mx-auto text-4xl text-forest-400" />
                  <p className="font-medium text-gray-700">Pratinjau langsung tidak tersedia</p>
                  <p className="text-xs">
                    Gunakan link Google Drive untuk melihat atau mengunduh berkas.
                  </p>
                </div>
              )}
            </div>

            {/* Modal Close */}
            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setPreviewDoc(null)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium"
              >
                Tutup
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── MODAL: EDIT DOKUMEN & ATUR VISIBILITAS ────────────── */}
      <Modal
        open={Boolean(editDoc)}
        onClose={() => !isSubmitting && setEditDoc(null)}
        title="Edit Keterangan & Pengaturan Visibilitas"
        size="md"
      >
        {editDoc && (
          <form onSubmit={handleSubmitEdit} className="space-y-4 text-xs">
            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                Judul Dokumen <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={editDoc.title}
                onChange={(e) => setEditDoc({ ...editDoc, title: e.target.value })}
                required
                className="w-full px-3 py-2 border border-forest-200 rounded-lg text-xs focus:ring-1 focus:ring-forest-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block font-semibold text-gray-700 mb-1">Keterangan / Catatan</label>
              <textarea
                rows={3}
                value={editDoc.description || ''}
                onChange={(e) => setEditDoc({ ...editDoc, description: e.target.value })}
                className="w-full px-3 py-2 border border-forest-200 rounded-lg text-xs focus:ring-1 focus:ring-forest-600 focus:outline-none"
              />
            </div>

            {/* Visibility Toggle */}
            {editDoc.category !== 'resident' && (
              <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl flex items-center justify-between">
                <div>
                  <label className="font-semibold text-gray-800 block">
                    Visibilitas Dokumen untuk Warga
                  </label>
                  <p className="text-[10px] text-gray-500">
                    Aktifkan agar warga biasa (non-panitia) dapat melihat berkas ini.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={Boolean(editDoc.is_viewable_by_warga)}
                  onChange={(e) =>
                    setEditDoc({ ...editDoc, is_viewable_by_warga: e.target.checked })
                  }
                  className="h-4 w-4 text-forest-700 rounded border-gray-300 focus:ring-forest-600 cursor-pointer"
                />
              </div>
            )}

            <div className="pt-3 border-t border-forest-100 flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setEditDoc(null)}
                className="px-3.5 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 bg-forest-800 hover:bg-forest-900 text-white rounded-lg font-semibold shadow transition"
              >
                {isSubmitting ? 'Menyimpan...' : 'Simpan Perubahan'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* ── MODAL: KONFIRMASI HAPUS DOKUMEN ───────────────────── */}
      <Modal
        open={Boolean(deleteDoc)}
        onClose={() => !isSubmitting && setDeleteDoc(null)}
        title="Konfirmasi Hapus Dokumen"
        size="sm"
      >
        {deleteDoc && (
          <div className="space-y-4 text-xs">
            <p className="text-gray-600">
              Apakah Anda yakin ingin menghapus arsip dokumen{' '}
              <strong className="text-gray-900">"{deleteDoc.title}"</strong>?
            </p>
            <p className="text-[11px] text-red-600 bg-red-50 p-2.5 rounded-lg border border-red-200">
              Tindakan ini akan menghapus catatan dokumen dari portal.
            </p>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setDeleteDoc(null)}
                className="px-3.5 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold shadow transition"
              >
                {isSubmitting ? 'Menghapus...' : 'Hapus Dokumen'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
