import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AiOutlineCloudUpload,
  AiOutlineDelete,
  AiOutlineDownload,
  AiOutlineExport,
  AiOutlineFileImage,
  AiOutlineFilePdf,
  AiOutlineLock,
  AiOutlinePlus,
} from 'react-icons/ai';
import { useToast } from '../hooks/useToast';
import { fetchDocuments, uploadDocument, deleteDocument } from '../services/dataService';
import {
  DOCUMENT_CATEGORIES,
  canDeleteResidentDoc,
  canUploadResidentDoc,
  canViewResidentDocsForUnit,
  documentTypeColor,
  documentTypeLabel,
  formatDate,
  formatFileSize,
  unitDriveFolderName,
} from '../services/dataHelpers';

const RESIDENT_DOC_TYPES = [
  { value: 'ktp', label: 'KTP' },
  { value: 'kk', label: 'Kartu Keluarga (KK)' },
  { value: 'sim', label: 'SIM' },
  { value: 'bukti_kepemilikan', label: 'Bukti Kepemilikan (AJB/SHM)' },
  { value: 'lainnya', label: 'Lainnya' },
];

const MAX_FILE_SIZE = 10 * 1024 * 1024;

const EMPTY_FORM = { title: '', document_type: 'ktp', description: '', file: null };

/**
 * Daftar & upload dokumen warga untuk satu rumah (dipakai di menu Rumah).
 * Berkas disimpan di subfolder Google Drive milik rumah tersebut
 * (misal "Dokumen Warga/CB1-1A").
 */
export default function HouseDocumentsPanel({ unit, token, role, profile, isReadOnly }) {
  const toast = useToast();
  const userUnitId = profile?.unit_id;
  const canView = canViewResidentDocsForUnit(role, userUnitId, unit.id);
  const canUpload = canUploadResidentDoc(role, userUnitId, unit.id, isReadOnly);
  const canDelete = canDeleteResidentDoc(role, isReadOnly);
  const folderName = unitDriveFolderName(unit);

  const [documents, setDocuments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const fileInputRef = useRef(null);

  const loadDocuments = useCallback(async () => {
    if (!canView) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetchDocuments(token, {
        role,
        user_unit_id: userUnitId,
        category: 'resident',
        unit_id: unit.id,
      });
      setDocuments(
        (res?.documents || []).filter(
          (doc) => doc.category === 'resident' && String(doc.unit_id) === String(unit.id)
        )
      );
    } catch (err) {
      console.error('Failed to load house documents:', err);
      toast.error('Gagal memuat dokumen rumah.');
    } finally {
      setIsLoading(false);
    }
  }, [canView, token, role, userUnitId, unit.id, toast]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  // Folder rumah di Drive: diambil dari dokumen yang sudah tersimpan di subfolder rumah.
  // Dokumen lama yang masih di folder induk diabaikan.
  const houseFolderId = useMemo(() => {
    const parentId = DOCUMENT_CATEGORIES.resident.gdriveFolderId;
    const doc = documents.find((d) => d.gdrive_folder_id && d.gdrive_folder_id !== parentId);
    return doc?.gdrive_folder_id || null;
  }, [documents]);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) {
      toast.error('Ukuran berkas melebihi batas 10 MB.');
      return;
    }
    setForm((prev) => ({
      ...prev,
      file,
      title: prev.title || file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' '),
    }));
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!form.file) {
      toast.error('Silakan pilih berkas yang akan diunggah.');
      return;
    }
    if (!form.title.trim()) {
      toast.error('Judul dokumen wajib diisi.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await uploadDocument(token, {
        file: form.file,
        fields: {
          title: form.title.trim(),
          category: 'resident',
          description: form.description.trim(),
          document_type: form.document_type,
          unit_id: unit.id,
          event_id: null,
          profile_id: profile?.id,
          period: null,
          is_viewable_by_warga: true,
          gdrive_folder_id: DOCUMENT_CATEGORIES.resident.gdriveFolderId,
          gdrive_folder_path: folderName,
          uploaded_by: profile?.id,
        },
      });
      if (res?.document) {
        setDocuments((prev) => [res.document, ...prev]);
        toast.success(`Dokumen "${form.title.trim()}" tersimpan di folder ${folderName}.`);
        setForm(EMPTY_FORM);
        setShowUpload(false);
      }
    } catch (err) {
      console.error('House document upload failed:', err);
      toast.error(err?.message || 'Gagal mengunggah dokumen.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (doc) => {
    if (!confirm(`Hapus dokumen "${doc.title}" dari rumah ${unit.block}/${unit.unit_number}?`)) return;
    try {
      await deleteDocument(token, doc.id);
      setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
      toast.success(`Dokumen "${doc.title}" dihapus.`);
    } catch (err) {
      console.error('House document delete failed:', err);
      toast.error(err?.message || 'Gagal menghapus dokumen.');
    }
  };

  if (!canView) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
        <AiOutlineLock className="mt-0.5 shrink-0" />
        <span>Dokumen rumah ini hanya dapat dilihat oleh penghuni rumah dan pengurus.</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold text-forest-900">Dokumen Rumah</h4>
          <p className="text-[11px] text-forest-500">
            Disimpan di Google Drive: <span className="font-mono">Dokumen Warga / {folderName}</span>
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {houseFolderId && (
            <a
              href={`https://drive.google.com/drive/folders/${houseFolderId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="pv-btn-ghost text-xs inline-flex items-center gap-1"
              title="Buka folder rumah di Google Drive"
            >
              <AiOutlineExport /> Folder Drive
            </a>
          )}
          {canUpload && !showUpload && (
            <button type="button" onClick={() => setShowUpload(true)} className="pv-btn-primary text-xs">
              <AiOutlinePlus /> Upload
            </button>
          )}
        </div>
      </div>

      {showUpload && (
        <form onSubmit={handleUpload} className="space-y-2 rounded-lg border border-forest-200 bg-forest-50/50 p-3 text-xs">
          <fieldset disabled={isSubmitting} className="space-y-2 border-none p-0 m-0">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <select
                value={form.document_type}
                onChange={(e) => setForm({ ...form, document_type: e.target.value })}
                className="pv-input text-xs"
              >
                {RESIDENT_DOC_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Judul dokumen, misal: KTP Siti Rahayu"
                className="pv-input text-xs"
                required
              />
            </div>
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Keterangan (opsional)"
              className="pv-input text-xs"
            />
            <div
              onClick={() => fileInputRef.current?.click()}
              className="cursor-pointer rounded-lg border-2 border-dashed border-forest-200 bg-white p-3 text-center hover:border-forest-500"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,image/png,image/jpeg,image/jpg"
                onChange={handleFileChange}
                className="hidden"
              />
              <AiOutlineCloudUpload className="mx-auto text-xl text-forest-500" />
              {form.file ? (
                <p className="font-semibold text-forest-900">
                  {form.file.name} ({formatFileSize(form.file.size)})
                </p>
              ) : (
                <p className="text-forest-500">Pilih berkas PDF, JPG, atau PNG (maks. 10 MB)</p>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowUpload(false);
                  setForm(EMPTY_FORM);
                }}
                className="pv-btn-ghost text-xs"
              >
                Batal
              </button>
              <button type="submit" className="pv-btn-primary text-xs">
                {isSubmitting ? 'Mengunggah ke Drive...' : 'Simpan ke Folder Rumah'}
              </button>
            </div>
          </fieldset>
        </form>
      )}

      {isLoading ? (
        <p className="py-4 text-center text-xs text-forest-500">Memuat dokumen rumah...</p>
      ) : documents.length === 0 ? (
        <p className="rounded-lg border border-dashed border-forest-200 py-4 text-center text-xs text-forest-400">
          Belum ada dokumen untuk rumah ini.
        </p>
      ) : (
        <ul className="divide-y divide-forest-100 rounded-lg border border-forest-100">
          {documents.map((doc) => {
            const isPdf = doc.mime_type === 'application/pdf' || (doc.file_name || '').toLowerCase().endsWith('.pdf');
            return (
              <li key={doc.id} className="flex items-center gap-2.5 px-3 py-2">
                <span className={`shrink-0 rounded-lg p-1.5 ${isPdf ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
                  {isPdf ? <AiOutlineFilePdf /> : <AiOutlineFileImage />}
                </span>
                <div className="min-w-0 flex-1">
                  <a
                    href={doc.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block truncate text-xs font-semibold text-forest-900 hover:underline"
                    title={doc.title}
                  >
                    {doc.title}
                  </a>
                  <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-forest-400">
                    <span className={`rounded-full border px-1.5 py-px ${documentTypeColor(doc.document_type)}`}>
                      {documentTypeLabel(doc.document_type)}
                    </span>
                    <span>{formatFileSize(doc.file_size)}</span>
                    <span>{formatDate(doc.created_at)}</span>
                  </div>
                </div>
                {doc.file_download_url && (
                  <a
                    href={doc.file_download_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg p-1.5 text-forest-600 hover:bg-forest-50"
                    title="Unduh berkas"
                  >
                    <AiOutlineDownload />
                  </a>
                )}
                {canDelete && (
                  <button
                    type="button"
                    onClick={() => handleDelete(doc)}
                    className="rounded-lg p-1.5 text-red-500 hover:bg-red-50"
                    title="Hapus dokumen"
                  >
                    <AiOutlineDelete />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Link
        to={`/documents?tab=resident&unit=${unit.id}`}
        className="block text-right text-[11px] font-medium text-forest-600 hover:text-forest-800 underline"
      >
        Kelola di menu Dokumen
      </Link>
    </div>
  );
}
