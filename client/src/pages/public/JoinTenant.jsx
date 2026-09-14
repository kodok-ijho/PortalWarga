import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  AiOutlineHome,
  AiOutlineUser,
  AiOutlinePhone,
  AiOutlineCheckCircle,
  AiOutlineLoading3Quarters,
  AiOutlineArrowRight,
  AiOutlineSafetyCertificate,
} from 'react-icons/ai';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { getInviteDetails, requestJoinTenant } from '../../services/tenantOperationalService';

export default function JoinTenant() {
  const { inviteCode: paramInviteCode } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { user, profile, isAuthenticated, signInWithGoogle } = useAuth();

  const [inputCode, setInputCode] = useState(paramInviteCode || '');
  const [loadingTenant, setLoadingTenant] = useState(false);
  const [tenantInfo, setTenantInfo] = useState(null);
  const [lookupError, setLookupError] = useState('');

  // Form states
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [unitId, setUnitId] = useState('');
  const [occupancyStatus, setOccupancyStatus] = useState('owner_occupied');
  const [submitting, setSubmitting] = useState(false);
  const [submittedSuccess, setSubmittedSuccess] = useState(false);

  // Otomatis lookup jika ada kode di URL param
  useEffect(() => {
    if (paramInviteCode) {
      loadTenantByCode(paramInviteCode);
    }
  }, [paramInviteCode]);

  // Sync profile data jika baru login
  useEffect(() => {
    if (profile?.full_name && !fullName) {
      setFullName(profile.full_name);
    }
    if (profile?.phone && !phone) {
      setPhone(profile.phone);
    }
  }, [profile, fullName, phone]);

  const loadTenantByCode = async (codeToLookup) => {
    if (!codeToLookup?.trim()) {
      setLookupError('Silakan masukkan kode undangan.');
      return;
    }

    setLoadingTenant(true);
    setLookupError('');
    setTenantInfo(null);

    try {
      const res = await getInviteDetails(codeToLookup.trim());
      if (res && res.found) {
        setTenantInfo(res);
        if (res.units && res.units.length > 0) {
          setUnitId(String(res.units[0].id));
        }
      } else {
        setLookupError(res?.message || 'Komunitas dengan kode undangan tersebut tidak ditemukan.');
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[JoinTenant] Lookup error:', err);
      setLookupError('Terjadi kendala saat memeriksa kode undangan.');
    } finally {
      setLoadingTenant(false);
    }
  };

  const handleManualLookup = (e) => {
    e.preventDefault();
    loadTenantByCode(inputCode);
  };

  const handleJoinSubmit = async (e) => {
    e.preventDefault();

    if (!tenantInfo?.tenant_id) {
      toast.error('Komunitas belum ditentukan.');
      return;
    }

    if (!fullName.trim()) {
      toast.error('Nama lengkap wajib diisi.');
      return;
    }

    if (!isAuthenticated) {
      // Simpan draft form di sessionStorage lalu arahkan ke login
      sessionStorage.setItem(
        'rw_pending_join',
        JSON.stringify({
          inviteCode: inputCode || paramInviteCode,
          tenantId: tenantInfo.tenant_id,
          unitId,
          fullName,
          phone,
          occupancyStatus,
        })
      );
      toast.info('Silakan masuk dengan akun Google untuk menyelesaikan pendaftaran.');
      navigate('/login', {
        state: { from: `/join/${inputCode || paramInviteCode}` },
      });
      return;
    }

    setSubmitting(true);
    try {
      const currentUserId = user?.id || profile?.id;
      await requestJoinTenant({
        tenantId: tenantInfo.tenant_id,
        userId: currentUserId,
        unitId: unitId ? Number(unitId) : null,
        fullName,
        phone,
        occupancyStatus,
      });

      setSubmittedSuccess(true);
      toast.success('Permohonan bergabung berhasil dikirim!');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[JoinTenant] Submit error:', err);
      toast.error(err.message || 'Gagal mengirim permohonan pendaftaran.');
    } finally {
      setSubmitting(false);
    }
  };

  // Layar Berhasil Dikirim
  if (submittedSuccess) {
    return (
      <div className="min-h-screen bg-[#071f13] text-white py-12 px-4 sm:px-6 lg:px-8 flex items-center justify-center">
        <div className="max-w-md w-full bg-forest-900/90 border border-gold-500/50 rounded-3xl p-8 shadow-2xl backdrop-blur-md text-center space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center mx-auto text-3xl">
            <AiOutlineCheckCircle />
          </div>

          <div>
            <h1 className="text-2xl font-extrabold font-display text-white">
              Pendaftaran Terkirim!
            </h1>
            <p className="text-xs sm:text-sm text-forest-300 mt-2 leading-relaxed">
              Permohonan Anda untuk bergabung di <strong className="text-white">{tenantInfo?.tenant_name}</strong>{' '}
              telah diterima.
            </p>
          </div>

          <div className="p-4 bg-forest-950/80 rounded-2xl border border-forest-800 text-left text-xs space-y-1.5 text-forest-300">
            <p className="font-semibold text-white">Status Permohonan: Menunggu Verifikasi</p>
            <p>
              Pengurus / Ketua RT akan memeriksa data Anda. Setelah disetujui, Anda dapat masuk dan mengakses seluruh
              informasi iuran, matriks kas, dan bukti bayar.
            </p>
          </div>

          <button
            type="button"
            onClick={() => navigate('/')}
            className="w-full py-3 px-4 rounded-xl bg-gold-500 hover:bg-gold-400 text-forest-950 text-xs font-bold transition-colors"
          >
            Kembali ke Halaman Utama
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#071f13] text-white py-12 px-4 sm:px-6 lg:px-8 flex items-center justify-center">
      <div className="max-w-lg w-full space-y-6">
        {/* Header Branding */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gold-500/10 border border-gold-500/30 text-gold-300 text-xs font-semibold">
            <AiOutlineSafetyCertificate className="text-sm" />
            <span>Pendaftaran Warga &bull; Portal Komunitas</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold font-display text-white">
            Bergabung dengan Komunitas
          </h1>
          <p className="text-xs sm:text-sm text-forest-300">
            Daftarkan diri Anda untuk kemudahan informasi tagihan IPL dan kas lingkungan
          </p>
        </div>

        {/* Input Kode Undangan jika belum ditemukan */}
        {!tenantInfo && (
          <div className="bg-forest-900/80 border border-forest-700/80 rounded-3xl p-6 sm:p-8 shadow-xl backdrop-blur-md">
            <form onSubmit={handleManualLookup} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-forest-200 mb-1.5">
                  Masukkan Kode Undangan (Invite Code)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    required
                    value={inputCode}
                    onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                    placeholder="Contoh: RW-PALM-9F2B"
                    className="flex-1 px-4 py-2.5 rounded-xl bg-forest-950 border border-forest-700 text-white font-mono text-sm focus:border-gold-500 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={loadingTenant}
                    className="px-5 py-2.5 rounded-xl bg-gold-500 hover:bg-gold-400 text-forest-950 text-xs font-bold transition-colors disabled:opacity-50"
                  >
                    {loadingTenant ? <AiOutlineLoading3Quarters className="animate-spin text-sm" /> : 'Cek'}
                  </button>
                </div>
              </div>

              {lookupError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/40 rounded-xl text-rose-300 text-xs">
                  {lookupError}
                </div>
              )}
            </form>
          </div>
        )}

        {/* Form Pendaftaran jika Tenant Ditemukan */}
        {tenantInfo && (
          <div className="bg-forest-900/80 border border-forest-700/80 rounded-3xl p-6 sm:p-8 shadow-xl backdrop-blur-md space-y-6">
            {/* Info Box Tenant */}
            <div className="p-4 bg-forest-950 rounded-2xl border border-forest-800 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-gold-400 uppercase tracking-wider">
                  Komunitas Terpilih
                </span>
                <button
                  type="button"
                  onClick={() => setTenantInfo(null)}
                  className="text-[11px] text-forest-400 hover:text-white underline"
                >
                  Ganti Kode
                </button>
              </div>
              <h2 className="text-base sm:text-lg font-bold text-white font-display">
                {tenantInfo.tenant_name}
              </h2>
              <p className="text-xs text-forest-300">{tenantInfo.address || 'Alamat belum diatur'}</p>
            </div>

            <form onSubmit={handleJoinSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-forest-200 mb-1.5">
                  Nama Lengkap Pemohon <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <AiOutlineUser className="absolute left-3.5 top-3 text-forest-400 text-sm" />
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Nama sesuai KTP..."
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-forest-950 border border-forest-700 text-white text-xs focus:border-gold-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-forest-200 mb-1.5">
                  Nomor WhatsApp / HP Aktif <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <AiOutlinePhone className="absolute left-3.5 top-3 text-forest-400 text-sm" />
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="0812-xxxx-xxxx"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-forest-950 border border-forest-700 text-white text-xs focus:border-gold-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-forest-200 mb-1.5">
                    Pilih Nomor Rumah / Unit <span className="text-rose-400">*</span>
                  </label>
                  <select
                    value={unitId}
                    onChange={(e) => setUnitId(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-forest-950 border border-forest-700 text-white text-xs focus:outline-none"
                  >
                    {(tenantInfo.units || []).length === 0 ? (
                      <option value="">Tidak ada unit tersedia</option>
                    ) : (
                      tenantInfo.units.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.label}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-forest-200 mb-1.5">
                    Status Tinggal
                  </label>
                  <select
                    value={occupancyStatus}
                    onChange={(e) => setOccupancyStatus(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-forest-950 border border-forest-700 text-white text-xs focus:outline-none"
                  >
                    <option value="owner_occupied">Pemilik (Dihuni Sendiri)</option>
                    <option value="tenant">Penyewa / Kontrak</option>
                    <option value="owner_vacant">Pemilik (Rumah Kosong)</option>
                  </select>
                </div>
              </div>

              {/* Status Login Warning jika belum auth */}
              {!isAuthenticated && (
                <div className="p-3.5 bg-forest-950/90 border border-gold-500/30 rounded-xl text-xs text-forest-300">
                  <strong className="text-gold-300 block mb-1">Akun Google Diperlukan:</strong>
                  Anda akan diminta masuk menggunakan Google setelah menekan tombol di bawah untuk memverifikasi akun Anda.
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gold-500 hover:bg-gold-400 text-forest-950 text-xs font-bold transition-colors shadow-lg disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <AiOutlineLoading3Quarters className="animate-spin" />
                    <span>Mengirimkan Permohonan...</span>
                  </>
                ) : (
                  <>
                    <span>Ajukan Pendaftaran Warga</span>
                    <AiOutlineArrowRight />
                  </>
                )}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
