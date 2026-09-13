import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AiOutlineCheck, AiOutlineArrowRight, AiOutlineSafetyCertificate, AiOutlineArrowLeft } from 'react-icons/ai';
import { useAuth } from '../../hooks/useAuth';
import { useTenant } from '../../hooks/useTenant';
import { useToast } from '../../hooks/useToast';

export const TENANT_TYPE_OPTIONS = [
  {
    type: 'rt_rw',
    title: 'RT/RW & Perumahan',
    icon: '🏘️',
    badge: 'Paling Populer',
    badgeColor: 'bg-gold-500/20 text-gold-300 border-gold-500/40',
    targetRole: 'Ketua RT/RW & Pengurus Paguyuban',
    labels: {
      unit: 'Rumah / Kavling',
      bill: 'IPL & Kas',
      member: 'Warga / Penghuni',
    },
    description:
      'Solusi lengkap tata kelola iuran perumahan, matriks pembayaran multi-tahun, verifikasi transfer & kas RT/RW transparan.',
    features: [
      'Matriks iuran bulanan & multi-tahun',
      'Verifikasi transfer bank & QRIS',
      'Laporan arus kas & transparansi warga',
      'Manajemen data warga & bukti bayar',
    ],
    placeholderName: 'Contoh: Palm Village RT 05 / Cluster Bougenville',
  },
  {
    type: 'kos',
    title: 'Kos-kosan & Kontrakan',
    icon: '🏢',
    badge: 'Manajemen Sewa',
    badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    targetRole: 'Pemilik & Pengelola Kos-kosan',
    labels: {
      unit: 'Kamar / Pintu',
      bill: 'Uang Sewa',
      member: 'Penyewa',
    },
    description:
      'Kelola kamar kosong vs terisi, penagihan uang sewa bulanan otomatis berdasarkan kontrak sewa, dan riwayat checkout penyewa.',
    features: [
      'Status kamar (kosong, terisi, booking)',
      'Kontrak sewa berjangka & auto-billing',
      'Riwayat checkout penyewa tanpa hilang data',
      'Pengingat jatuh tempo sewa kamar',
    ],
    placeholderName: 'Contoh: Kos Melati Harmoni / Paviliun 88',
  },
  {
    type: 'arisan',
    title: 'Kelompok Arisan',
    icon: '🎲',
    badge: 'Putaran Adil',
    badgeColor: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
    targetRole: 'Admin & Pengurus Arisan',
    labels: {
      unit: 'Slot / Undian',
      bill: 'Kontribusi',
      member: 'Peserta Arisan',
    },
    description:
      'Kelola putaran arisan, pencatatan kontribusi peserta tepat waktu, dan mekanisme pengocokan acak digital yang dijamin adil tanpa duplikat.',
    features: [
      'Siklus putaran & periode arisan',
      'Pengocokan acak digital anti-duplikat',
      'Pemantauan status setoran seluruh anggota',
      'Riwayat penerima arisan per periode',
    ],
    placeholderName: 'Contoh: Arisan Keluarga Besar / Arisan Alumni 2010',
  },
  {
    type: 'kelas',
    title: 'Kelas & Kursus',
    icon: '📚',
    badge: 'Iuran Siswa',
    badgeColor: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
    targetRole: 'Pengajar & Pengelola Kelas',
    labels: {
      unit: 'Slot Siswa',
      bill: 'SPP / Iuran',
      member: 'Siswa / Peserta',
    },
    description:
      'Pencatatan iuran SPP, bimbel kelompok kecil, kelas sanggar, dan kursus privat dengan monitoring status pembayaran yang ringkas.',
    features: [
      'Pencatatan iuran berkala kelompok kecil',
      'Daftar siswa & monitoring pembayaran',
      'Pengingat iuran bulanan',
      'Laporan keuangan kelas yang sederhana',
    ],
    placeholderName: 'Contoh: Bimbel Bintang Juara / Sanggar Tari Kenanga',
  },
];

export default function ChooseTenantType({ onCancel, initialType = 'rt_rw', redirectOnSuccess = true }) {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const { isAuthenticated } = useAuth();
  const { createTenant } = useTenant();

  const [selectedType, setSelectedType] = useState(() => location.state?.type || initialType);
  const [tenantName, setTenantName] = useState(() => location.state?.name || '');
  const [submitting, setSubmitting] = useState(false);

  // Auto-submit jika kembali dari login dengan pending tenant data
  useEffect(() => {
    if (location.state?.autoSubmit && location.state?.name && isAuthenticated && !submitting) {
      const runAutoCreate = async () => {
        setSubmitting(true);
        try {
          const tenant = await createTenant({
            name: location.state.name,
            type: location.state.type || selectedType,
          });
          toast.success(`Layanan "${tenant.name}" berhasil dibuat! Trial 15 hari aktif.`);
          if (redirectOnSuccess) {
            navigate(`/t/${tenant.id}/dashboard`, { replace: true });
          }
        } catch (err) {
          toast.error(err.message || 'Gagal membuat layanan otomatis.');
        } finally {
          setSubmitting(false);
        }
      };
      runAutoCreate();
    }
  }, [location.state, isAuthenticated, createTenant, redirectOnSuccess, navigate, selectedType, submitting, toast]);

  const activeOption = TENANT_TYPE_OPTIONS.find((o) => o.type === selectedType) || TENANT_TYPE_OPTIONS[0];

  const handleCreateTenant = async (e) => {
    e.preventDefault();

    if (!tenantName.trim()) {
      toast.error('Nama komunitas / layanan tidak boleh kosong.');
      return;
    }

    // Jika user belum login, simpan preferensi dan arahkan ke login Google
    if (!isAuthenticated) {
      sessionStorage.setItem('rw_pending_tenant_type', selectedType);
      sessionStorage.setItem('rw_pending_tenant_name', tenantName.trim());
      navigate('/login', {
        state: {
          from: '/onboarding/choose-type',
          pendingTenant: { type: selectedType, name: tenantName.trim() },
        },
      });
      return;
    }

    setSubmitting(true);
    try {
      const newTenant = await createTenant({
        name: tenantName.trim(),
        type: selectedType,
      });

      toast.success(`Layanan "${newTenant.name}" berhasil dibuat! Trial 15 hari aktif.`);

      if (redirectOnSuccess) {
        navigate(`/t/${newTenant.id}/dashboard`, { replace: true });
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[ChooseTenantType] Error creating tenant:', err);
      toast.error(err.message || 'Terjadi kendala saat membuat layanan baru.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#071f13] text-white py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        {/* Tombol Kembali (Opsional) */}
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center gap-2 text-sm text-forest-300 hover:text-white mb-6 transition-colors"
          >
            <AiOutlineArrowLeft /> Kembali
          </button>
        )}

        {/* Header Onboarding */}
        <div className="text-center max-w-2xl mx-auto mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gold-500/10 border border-gold-500/30 text-gold-300 text-xs font-semibold mb-4">
            <AiOutlineSafetyCertificate className="text-sm" />
            <span>Trial Otomatis 15 Hari Gratis &bull; 10 Unit Kapasitas Penuh</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight font-display">
            Pilih Jenis Layanan RuangWarga
          </h1>
          <p className="mt-3 text-sm sm:text-base text-forest-200">
            Setiap layanan disesuaikan dengan alur bisnis, tata nama, dan matriks keuangan vertikal Anda. Anda dapat
            membuat lebih dari satu layanan untuk kebutuhan berbeda.
          </p>
        </div>

        {/* 4 Kartu Pilihan Vertikal */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-10">
          {TENANT_TYPE_OPTIONS.map((option) => {
            const isSelected = selectedType === option.type;
            return (
              <div
                key={option.type}
                onClick={() => setSelectedType(option.type)}
                className={`relative rounded-2xl p-6 cursor-pointer transition-all duration-200 flex flex-col justify-between border-2 ${
                  isSelected
                    ? 'bg-forest-800/90 border-gold-400 shadow-2xl shadow-gold-900/30 scale-[1.01]'
                    : 'bg-forest-900/60 border-forest-700/60 hover:border-forest-500 hover:bg-forest-800/50'
                }`}
              >
                {/* Header Kartu */}
                <div>
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl p-2.5 bg-forest-950/80 rounded-xl border border-forest-700/60 shadow-inner">
                        {option.icon}
                      </span>
                      <div>
                        <h3 className="text-lg font-bold text-white font-display leading-tight">{option.title}</h3>
                        <p className="text-xs text-forest-300 font-medium mt-0.5">{option.targetRole}</p>
                      </div>
                    </div>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider ${option.badgeColor}`}
                    >
                      {option.badge}
                    </span>
                  </div>

                  <p className="text-xs text-forest-200 leading-relaxed mb-4">{option.description}</p>

                  {/* Naming Tags */}
                  <div className="flex flex-wrap items-center gap-2 py-2 px-3 bg-forest-950/60 rounded-xl border border-forest-800 text-[11px] mb-4">
                    <span className="text-forest-400 font-medium">Unit:</span>
                    <span className="text-forest-100 font-bold">{option.labels.unit}</span>
                    <span className="text-forest-600">&bull;</span>
                    <span className="text-forest-400 font-medium">Iuran:</span>
                    <span className="text-gold-300 font-bold">{option.labels.bill}</span>
                    <span className="text-forest-600">&bull;</span>
                    <span className="text-forest-400 font-medium">Anggota:</span>
                    <span className="text-forest-100 font-bold">{option.labels.member}</span>
                  </div>

                  {/* Fitur Utama */}
                  <ul className="space-y-1.5 mb-4">
                    {option.features.map((feat, idx) => (
                      <li key={idx} className="flex items-center gap-2 text-xs text-forest-200">
                        <AiOutlineCheck className="text-emerald-400 shrink-0 text-sm" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Status Seleksi */}
                <div className="pt-3 border-t border-forest-700/50 flex items-center justify-between">
                  <span className="text-xs font-semibold text-forest-300">
                    {isSelected ? 'Layanan Terpilih' : 'Klik untuk Memilih'}
                  </span>
                  <div
                    className={`w-5 h-5 rounded-full flex items-center justify-center border transition-all ${
                      isSelected ? 'bg-gold-500 border-gold-400 text-forest-950' : 'border-forest-500'
                    }`}
                  >
                    {isSelected && <AiOutlineCheck className="text-xs font-black" />}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Formulir Konfirmasi & Nama Layanan */}
        <form
          onSubmit={handleCreateTenant}
          className="bg-forest-900/90 border border-forest-700/80 rounded-2xl p-6 sm:p-8 shadow-2xl backdrop-blur-sm"
        >
          <div className="max-w-2xl mx-auto space-y-6">
            <div className="flex items-center gap-3 pb-4 border-b border-forest-800">
              <span className="text-2xl">{activeOption.icon}</span>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-white font-display">
                  Daftarkan Layanan: <span className="text-gold-400">{activeOption.title}</span>
                </h2>
                <p className="text-xs text-forest-300">
                  Unit akan dinamai <strong className="text-white">{activeOption.labels.unit}</strong> dan iuran sebagai{' '}
                  <strong className="text-gold-300">{activeOption.labels.bill}</strong>.
                </p>
              </div>
            </div>

            <div>
              <label htmlFor="tenantName" className="block text-xs font-bold text-forest-100 uppercase tracking-wider mb-2">
                Nama Komunitas / Layanan Anda
              </label>
              <input
                id="tenantName"
                type="text"
                required
                value={tenantName}
                onChange={(e) => setTenantName(e.target.value)}
                placeholder={activeOption.placeholderName}
                className="w-full px-4 py-3 bg-forest-950 border border-forest-600 rounded-xl text-white placeholder-forest-500 text-sm focus:outline-none focus:border-gold-500 focus:ring-1 focus:ring-gold-500 transition-all font-medium"
              />
              <p className="text-[11px] text-forest-400 mt-1.5">
                Nama ini dapat diperbarui kapan saja di menu Pengaturan setelah layanan aktif.
              </p>
            </div>

            {/* Banner Trial Garansi */}
            <div className="flex items-start gap-3 p-3.5 bg-forest-950/70 rounded-xl border border-forest-800 text-xs text-forest-200">
              <span className="text-lg">🎁</span>
              <div>
                <p className="font-semibold text-white">Langsung Aktif: Trial 15 Hari Bebas Biaya</p>
                <p className="text-[11px] text-forest-300 mt-0.5">
                  Termasuk 1 blok kapasitas penuh (10 {activeOption.labels.unit}). Tidak perlu kartu kredit atau pembayaran di awal.
                </p>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-gold-500 to-amber-500 hover:from-gold-400 hover:to-amber-400 text-forest-950 font-bold text-sm tracking-wide transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-gold-900/30 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.01]"
            >
              {submitting ? (
                <>
                  <div className="h-4 w-4 rounded-full border-2 border-forest-900 border-t-transparent animate-spin" />
                  <span>Membuat Layanan...</span>
                </>
              ) : (
                <>
                  <span>Lanjutkan & Aktifkan Layanan</span>
                  <AiOutlineArrowRight className="text-base" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
