import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  AiOutlineCheckCircle,
  AiOutlineArrowRight,
  AiOutlineArrowLeft,
  AiOutlinePlus,
  AiOutlineDelete,
  AiOutlineCopy,
  AiOutlineCheck,
  AiOutlineDollarCircle,
  AiOutlineBank,
  AiOutlineCalendar,
  AiOutlineBook,
  AiOutlineUser,
  AiOutlineInfoCircle,
  AiOutlineUsergroupAdd,
  AiOutlineShareAlt,
} from 'react-icons/ai';
import { useTenant } from '../../hooks/useTenant';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import {
  fetchTenantDetails,
  updateTenantProfileAndSettings,
  bulkCreateTenantUnits,
  generateInviteCode,
} from '../../services/tenantOperationalService';
import { formatRupiah } from '../../services/dataHelpers';

const CLASS_TYPES = [
  {
    id: 'reguler',
    name: 'Kelas Reguler / Sekolah',
    description: 'Kelas belajar kelompok atau sekolah dengan banyak siswa dan biaya SPP seragam.',
    icon: '🏫',
    defaultSlots: 20,
    prefix: 'Siswa #',
  },
  {
    id: 'privat',
    name: 'Les Privat / Bimbel Kecil',
    description: 'Bimbingan belajar intensif 1-on-1 atau kelompok kecil dengan perhatian khusus.',
    icon: '🧑‍🏫',
    defaultSlots: 5,
    prefix: 'Siswa #',
  },
];

const BANK_OPTIONS = [
  'BCA',
  'Bank Mandiri',
  'BRI',
  'BNI',
  'BSI (Bank Syariah Indonesia)',
  'Bank Jago',
  'SeaBank',
  'GoPay / OVO / Dana',
  'Lainnya',
];

export default function KelasSetupWizard({ tenantId: propTenantId, initialData }) {
  const { tenantId: routeTenantId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { isAuthenticated } = useAuth();
  const { activeTenant, activeTenantId, switchTenant, refreshTenant, isTenantAdmin } = useTenant();

  const tenantId = propTenantId || routeTenantId || activeTenantId;

  const [currentStep, setCurrentStep] = useState(1);
  const [loadingInitial, setLoadingInitial] = useState(!initialData);
  const [saving, setSaving] = useState(false);
  const [setupFinished, setSetupFinished] = useState(false);
  const [generatedInviteCode, setGeneratedInviteCode] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedWaMessage, setCopiedWaMessage] = useState(false);

  // Step 1: Identitas & Tipe Kelas
  const [classType, setClassType] = useState(initialData?.settings?.class_type || 'reguler');
  const [className, setClassName] = useState(initialData?.name || '');
  const [subject, setSubject] = useState(initialData?.settings?.subject || '');
  const [instructorName, setInstructorName] = useState(initialData?.settings?.instructor_name || '');
  const [contactPhone, setContactPhone] = useState(initialData?.contact_phone || '');
  const [classDescription, setClassDescription] = useState(
    initialData?.settings?.class_description || ''
  );

  // Step 2: Kuota & Slot Siswa
  const [slotCountInput, setSlotCountInput] = useState(
    initialData?.settings?.class_type === 'privat' ? 5 : 20
  );
  const [slotPrefix, setSlotPrefix] = useState('Siswa #');
  const [slotList, setSlotList] = useState([]);
  const [manualSlotLabel, setManualSlotLabel] = useState('');

  // Step 3: Biaya SPP & Rekening Pembayaran
  const [sppAmount, setSppAmount] = useState(
    initialData?.settings?.spp_amount || 200000
  );
  const [dueDay, setDueDay] = useState(initialData?.settings?.due_day || 10);
  const [billingCycle] = useState('monthly');
  const [bankName, setBankName] = useState('BCA');
  const [bankAccountNo, setBankAccountNo] = useState('');
  const [bankAccountHolder, setBankAccountHolder] = useState('');
  const [sppNotes, setSppNotes] = useState(
    initialData?.settings?.spp_notes ||
      'SPP dibayarkan setiap bulan paling lambat sesuai tanggal jatuh tempo untuk kelancaran kegiatan belajar mengajar.'
  );

  // Sinkronkan activeTenantId dengan URL param jika berbeda
  useEffect(() => {
    if (tenantId && tenantId !== activeTenantId) {
      switchTenant(tenantId);
    }
  }, [tenantId, activeTenantId, switchTenant]);

  // Load initial data jika belum disediakan via prop
  useEffect(() => {
    let isMounted = true;
    if (initialData) {
      setLoadingInitial(false);
      return;
    }

    async function loadData() {
      if (!tenantId) return;
      try {
        setLoadingInitial(true);
        const data = await fetchTenantDetails(tenantId);
        if (!isMounted) return;

        if (data) {
          if (data.name) setClassName(data.name);
          if (data.contact_phone) setContactPhone(data.contact_phone);
          if (data.settings) {
            if (data.settings.class_type) setClassType(data.settings.class_type);
            if (data.settings.subject) setSubject(data.settings.subject);
            if (data.settings.instructor_name) setInstructorName(data.settings.instructor_name);
            if (data.settings.spp_amount) setSppAmount(data.settings.spp_amount);
            if (data.settings.due_day) setDueDay(data.settings.due_day);
            if (data.settings.bank_info) {
              setBankName(data.settings.bank_info.bank_name || 'BCA');
              setBankAccountNo(data.settings.bank_info.account_number || '');
              setBankAccountHolder(data.settings.bank_info.account_holder || '');
            }
          }
        }
      } catch (err) {
        console.error('[KelasSetupWizard] Gagal memuat detail tenant:', err);
      } finally {
        if (isMounted) setLoadingInitial(false);
      }
    }

    loadData();
    return () => {
      isMounted = false;
    };
  }, [tenantId, initialData]);

  // Inisiasi slot list default berdasarkan classType
  useEffect(() => {
    const defaultCount = classType === 'privat' ? 5 : 20;
    setSlotCountInput(defaultCount);
    setSlotList(
      Array.from({ length: defaultCount }, (_, i) => ({
        id: `slot-${i + 1}`,
        label: `Siswa #${String(i + 1).padStart(2, '0')}`,
      }))
    );
  }, [classType]);

  // Handler Generate Slot Siswa Otomatis
  const handleGenerateSlots = () => {
    const count = parseInt(slotCountInput, 10);
    if (isNaN(count) || count <= 0) {
      toast.error('Jumlah kuota siswa harus berupa angka positif minimal 1.');
      return;
    }
    if (count > 100) {
      toast.error('Kapasitas kelas maksimal 100 slot siswa untuk satu grup.');
      return;
    }

    const generated = Array.from({ length: count }, (_, i) => ({
      id: `slot-${Date.now()}-${i + 1}`,
      label: `${slotPrefix}${String(i + 1).padStart(2, '0')}`,
    }));

    setSlotList(generated);
    toast.success(`Berhasil membuat ${count} slot siswa.`);
  };

  // Handler Tambah Slot Manual
  const handleAddManualSlot = () => {
    if (!manualSlotLabel.trim()) return;
    const newSlot = {
      id: `slot-${Date.now()}`,
      label: manualSlotLabel.trim(),
    };
    setSlotList((prev) => [...prev, newSlot]);
    setManualSlotLabel('');
  };

  // Handler Hapus Slot
  const handleRemoveSlot = (id) => {
    if (slotList.length <= 1) {
      toast.warning('Kelas minimal harus memiliki 1 slot siswa.');
      return;
    }
    setSlotList((prev) => prev.filter((item) => item.id !== id));
  };

  // Validasi Tiap Langkah
  const validateStep = (step) => {
    if (step === 1) {
      if (!className.trim()) {
        toast.error('Nama kelas atau kursus wajib diisi.');
        return false;
      }
      if (!instructorName.trim()) {
        toast.error('Nama pengajar atau wali kelas wajib diisi.');
        return false;
      }
      if (!contactPhone.trim()) {
        toast.error('Nomor kontak WhatsApp pengajar wajib diisi.');
        return false;
      }
      return true;
    }

    if (step === 2) {
      if (slotList.length === 0) {
        toast.error('Daftar slot siswa tidak boleh kosong.');
        return false;
      }
      return true;
    }

    if (step === 3) {
      if (!sppAmount || sppAmount <= 0) {
        toast.error('Nominal SPP atau biaya per siswa harus lebih dari Rp 0.');
        return false;
      }
      if (!dueDay || dueDay < 1 || dueDay > 28) {
        toast.error('Tanggal jatuh tempo SPP harus antara tanggal 1 hingga 28.');
        return false;
      }
      if (!bankAccountNo.trim() || !bankAccountHolder.trim()) {
        toast.error('Nomor rekening dan nama pemilik rekening penerima SPP wajib diisi.');
        return false;
      }
      return true;
    }

    return true;
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep((prev) => prev + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleBack = () => {
    setCurrentStep((prev) => Math.max(1, prev - 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Simpan Konfigurasi Lengkap Kelas
  const handleSaveAll = async () => {
    if (!validateStep(3)) return;

    try {
      setSaving(true);

      // 1. Buat slot siswa ke tabel tenant_units (generik)
      const unitsPayload = slotList.map((slot, index) => ({
        label: slot.label,
        type: 'seat',
        floor: 1,
        capacity: 1,
        status: 'vacant',
        metadata: {
          slot_index: index + 1,
          slot_type: classType === 'privat' ? 'private_student' : 'regular_student',
          expected_spp: Number(sppAmount),
        },
      }));

      await bulkCreateTenantUnits(tenantId, unitsPayload);

      // 2. Generate kode undangan unik
      const inviteCode = await generateInviteCode(tenantId, 'anggota');

      // 3. Simpan metadata pengaturan kelas ke tabel tenants
      const settingsPayload = {
        class_type: classType,
        subject: subject.trim(),
        instructor_name: instructorName.trim(),
        class_description: classDescription.trim(),
        slot_count: slotList.length,
        spp_amount: Number(sppAmount),
        due_day: Number(dueDay),
        billing_cycle: billingCycle,
        bank_info: {
          bank_name: bankName,
          account_number: bankAccountNo.trim(),
          account_holder: bankAccountHolder.trim(),
        },
        spp_notes: sppNotes.trim(),
        invite_code: inviteCode,
        is_setup_completed: true,
        current_cycle: 1,
      };

      await updateTenantProfileAndSettings(tenantId, {
        name: className.trim(),
        contact_phone: contactPhone.trim(),
        address: `Pengajar: ${instructorName.trim()} | Mata Pelajaran: ${subject.trim() || '-'}`,
        settings: settingsPayload,
      });

      await refreshTenant();
      setGeneratedInviteCode(inviteCode);
      setSetupFinished(true);
      toast.success('Pengaturan awal kelas berhasil disimpan!');
    } catch (err) {
      console.error('[KelasSetupWizard] Gagal menyimpan setup kelas:', err);
      toast.error(err.message || 'Gagal menyimpan konfigurasi setup wizard.');
    } finally {
      setSaving(false);
    }
  };

  // Copy Tautan Undangan
  const handleCopyInviteLink = () => {
    const inviteUrl = `${window.location.origin}/join/${generatedInviteCode}`;
    navigator.clipboard.writeText(inviteUrl);
    setCopiedCode(true);
    toast.success('Tautan undangan disalin ke clipboard!');
    setTimeout(() => setCopiedCode(false), 2500);
  };

  // Format Pesan WhatsApp untuk Wali Murid / Siswa
  const waInviteMessage = useMemo(() => {
    const inviteUrl = `${window.location.origin}/join/${generatedInviteCode}`;
    return `Halo Bapak/Ibu Wali Murid & Siswa *${className}*,\n\nKami mengundang Anda untuk bergabung ke portal kelas digital kami. Melalui tautan ini, Anda dapat memantau status SPP, jadwal belajar, dan pengumuman kelas secara transparan:\n\n🔗 ${inviteUrl}\n\nKode Undangan: *${generatedInviteCode}*\nPengajar: *${instructorName}*\n\nTerima kasih! 🙏`;
  }, [className, generatedInviteCode, instructorName]);

  const handleCopyWaMessage = () => {
    navigator.clipboard.writeText(waInviteMessage);
    setCopiedWaMessage(true);
    toast.success('Pesan undangan WhatsApp disalin!');
    setTimeout(() => setCopiedWaMessage(false), 2500);
  };

  if (loadingInitial) {
    return (
      <div className="min-h-screen bg-[#071f13] flex items-center justify-center p-4">
        <div className="text-center text-forest-300 animate-pulse text-sm">
          Menyiapkan formulir inisiasi kelas...
        </div>
      </div>
    );
  }

  // Tampilan Layar Sukses (Langkah 4)
  if (setupFinished) {
    const inviteUrl = `${window.location.origin}/join/${generatedInviteCode}`;
    const waShareUrl = `https://wa.me/?text=${encodeURIComponent(waInviteMessage)}`;

    return (
      <div className="min-h-screen bg-[#071f13] text-white py-12 px-4 sm:px-6 lg:px-8 flex items-center justify-center">
        <div className="max-w-xl w-full bg-forest-900/90 border border-gold-500/50 rounded-3xl p-8 shadow-2xl backdrop-blur-md text-center space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-gold-500/20 text-gold-400 border border-gold-500/40 flex items-center justify-center mx-auto text-3xl">
            <AiOutlineCheckCircle />
          </div>

          <div>
            <span className="text-xs font-bold text-gold-400 uppercase tracking-widest block mb-1">
              Setup Kelas Selesai
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold font-display text-white">
              {className} Siap Digunakan!
            </h2>
            <p className="text-xs sm:text-sm text-forest-300 mt-2">
              Kapasitas {slotList.length} slot siswa telah diinisiasi dengan SPP bulanan{' '}
              <strong className="text-gold-400">{formatRupiah(sppAmount)}</strong> jatuh tempo tanggal{' '}
              {dueDay}.
            </p>
          </div>

          {/* Kotak Tautan Undangan */}
          <div className="bg-forest-950/80 border border-forest-800 rounded-2xl p-4 text-left space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-forest-300">Tautan Masuk Wali Murid &amp; Siswa</span>
              <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-500/30">
                Kode: {generatedInviteCode}
              </span>
            </div>

            <div className="flex items-center gap-2 bg-forest-900 border border-forest-700 rounded-xl px-3 py-2">
              <input
                type="text"
                readOnly
                value={inviteUrl}
                className="bg-transparent text-xs text-forest-200 focus:outline-none flex-1 truncate"
              />
              <button
                type="button"
                onClick={handleCopyInviteLink}
                className="p-1.5 rounded-lg bg-gold-500/20 text-gold-400 hover:bg-gold-500 hover:text-forest-950 transition-colors shrink-0"
                title="Salin Tautan"
              >
                {copiedCode ? <AiOutlineCheck /> : <AiOutlineCopy />}
              </button>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <button
                type="button"
                onClick={handleCopyWaMessage}
                className="flex-1 py-2 px-3 rounded-xl bg-forest-800 hover:bg-forest-700 text-forest-200 text-xs font-semibold flex items-center justify-center gap-2 transition-colors border border-forest-700"
              >
                {copiedWaMessage ? <AiOutlineCheck className="text-emerald-400" /> : <AiOutlineCopy />}
                <span>Salin Teks Undangan WA</span>
              </button>

              <a
                href={waShareUrl}
                target="_blank"
                rel="noreferrer"
                className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors shadow"
              >
                <AiOutlineShareAlt className="text-sm" />
                <span>Bagikan ke WhatsApp</span>
              </a>
            </div>
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={() => navigate(`/t/${tenantId}/dashboard`)}
              className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-emerald-600 to-amber-500 hover:from-emerald-500 hover:to-amber-400 text-white font-bold text-sm shadow-xl shadow-forest-950/50 transition-all hover:scale-105"
            >
              Masuk ke Dashboard Kelas &rarr;
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#071f13] text-white py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-8">
        {/* Header Setup Wizard */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-forest-900 border border-gold-500/30 text-xs text-gold-400 font-semibold mb-1">
            <span>📚 Wizard Inisiasi Kelas &amp; Kursus</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold font-display text-white">
            Konfigurasi Portal Kelas
          </h1>
          <p className="text-xs sm:text-sm text-forest-300 max-w-lg mx-auto">
            Atur identitas kelas, kuota siswa, jadwal SPP, dan nomor rekening penerima sebelum mengundang siswa dan wali murid.
          </p>
        </div>

        {/* Stepper Indikator (3 Langkah) */}
        <div className="flex items-center justify-center gap-2 sm:gap-4 max-w-md mx-auto">
          {[
            { num: 1, label: 'Identitas' },
            { num: 2, label: 'Slot Siswa' },
            { num: 3, label: 'SPP & Rekening' },
          ].map((s) => (
            <div key={s.num} className="flex items-center gap-2">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  currentStep === s.num
                    ? 'bg-gold-500 text-forest-950 shadow-lg shadow-gold-500/20 scale-110'
                    : currentStep > s.num
                    ? 'bg-emerald-600 text-white'
                    : 'bg-forest-900 text-forest-400 border border-forest-800'
                }`}
              >
                {currentStep > s.num ? <AiOutlineCheck /> : s.num}
              </div>
              <span
                className={`text-xs font-medium hidden sm:inline ${
                  currentStep === s.num ? 'text-gold-400 font-bold' : 'text-forest-400'
                }`}
              >
                {s.label}
              </span>
              {s.num < 3 && <div className="w-6 sm:w-10 h-0.5 bg-forest-800" />}
            </div>
          ))}
        </div>

        {/* Kontainer Form Wizard */}
        <div className="bg-forest-900/60 border border-forest-800 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-md">
          {/* LANGKAH 1: IDENTITAS & TIPE KELAS */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <AiOutlineBook className="text-gold-400 text-xl" />
                  <span>Identitas &amp; Tipe Pembelajaran</span>
                </h3>
                <p className="text-xs text-forest-300 mt-1">
                  Pilih model kelas dan lengkapi rincian pengajar pengelola.
                </p>
              </div>

              {/* Pemilihan Tipe Kelas (Reguler vs Privat) */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-forest-200">
                  Tipe Kelas <span className="text-rose-400">*</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {CLASS_TYPES.map((type) => {
                    const isSelected = classType === type.id;
                    return (
                      <button
                        key={type.id}
                        type="button"
                        onClick={() => setClassType(type.id)}
                        className={`p-4 rounded-2xl border text-left transition-all flex flex-col justify-between ${
                          isSelected
                            ? 'bg-forest-800/90 border-gold-500 shadow-md scale-[1.02]'
                            : 'bg-forest-950/60 border-forest-800 hover:border-forest-700 opacity-80'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-2xl">{type.icon}</span>
                            {isSelected && (
                              <span className="w-5 h-5 rounded-full bg-gold-500 text-forest-950 flex items-center justify-center text-xs">
                                <AiOutlineCheck />
                              </span>
                            )}
                          </div>
                          <h4 className="text-sm font-bold text-white">{type.name}</h4>
                          <p className="text-xs text-forest-300 mt-1 leading-relaxed">
                            {type.description}
                          </p>
                        </div>
                        <span className="mt-3 text-[10px] font-semibold text-gold-400">
                          Rekomendasi awal: {type.defaultSlots} Slot Siswa
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Form Input Detail Kelas */}
              <div className="space-y-4 pt-2">
                <div>
                  <label className="block text-xs font-semibold text-forest-200 mb-1">
                    Nama Kelas / Kursus <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={className}
                    onChange={(e) => setClassName(e.target.value)}
                    placeholder="Contoh: Kelas 5B SD Juara / Kursus Bahasa Inggris Privat"
                    className="w-full px-4 py-2.5 rounded-xl bg-forest-950 border border-forest-700 text-white text-sm focus:outline-none focus:border-gold-500 transition-colors"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-forest-200 mb-1">
                      Mata Pelajaran / Bidang
                    </label>
                    <input
                      type="text"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="Contoh: Matematika, Fisika, Menggambar"
                      className="w-full px-4 py-2.5 rounded-xl bg-forest-950 border border-forest-700 text-white text-sm focus:outline-none focus:border-gold-500 transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-forest-200 mb-1">
                      Nama Pengajar / Wali Kelas <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={instructorName}
                      onChange={(e) => setInstructorName(e.target.value)}
                      placeholder="Contoh: Ibu Rina S.Pd / Kak Dimas"
                      className="w-full px-4 py-2.5 rounded-xl bg-forest-950 border border-forest-700 text-white text-sm focus:outline-none focus:border-gold-500 transition-colors"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-forest-200 mb-1">
                      Nomor Kontak WhatsApp Pengajar <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="tel"
                      required
                      value={contactPhone}
                      onChange={(e) => setContactPhone(e.target.value)}
                      placeholder="Contoh: 081234567890"
                      className="w-full px-4 py-2.5 rounded-xl bg-forest-950 border border-forest-700 text-white text-sm focus:outline-none focus:border-gold-500 transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-forest-200 mb-1">
                      Deskripsi / Jadwal Belajar Singkat
                    </label>
                    <input
                      type="text"
                      value={classDescription}
                      onChange={(e) => setClassDescription(e.target.value)}
                      placeholder="Contoh: Setiap Selasa & Kamis pukul 16.00 WIB"
                      className="w-full px-4 py-2.5 rounded-xl bg-forest-950 border border-forest-700 text-white text-sm focus:outline-none focus:border-gold-500 transition-colors"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* LANGKAH 2: KUOTA & SLOT SISWA */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <AiOutlineUsergroupAdd className="text-gold-400 text-xl" />
                  <span>Kapasitas &amp; Slot Siswa</span>
                </h3>
                <p className="text-xs text-forest-300 mt-1">
                  Tentukan jumlah kuota siswa di kelas ini. Tiap slot akan menjadi tempat pendaftaran bagi siswa atau wali murid.
                </p>
              </div>

              {/* Generator Otomatis */}
              <div className="p-4 bg-forest-950/80 border border-forest-800 rounded-2xl space-y-3">
                <span className="text-xs font-bold text-gold-400 uppercase tracking-wider block">
                  Generator Cepat Slot Siswa
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] text-forest-300 mb-1">Prefix Label</label>
                    <input
                      type="text"
                      value={slotPrefix}
                      onChange={(e) => setSlotPrefix(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-forest-900 border border-forest-700 text-white text-xs focus:outline-none focus:border-gold-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-forest-300 mb-1">Jumlah Kuota</label>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={slotCountInput}
                      onChange={(e) => setSlotCountInput(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-forest-900 border border-forest-700 text-white text-xs focus:outline-none focus:border-gold-500"
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={handleGenerateSlots}
                      className="w-full py-2 px-3 rounded-xl bg-forest-800 hover:bg-forest-700 text-gold-400 hover:text-gold-300 border border-gold-500/40 text-xs font-bold transition-colors"
                    >
                      Generate Ulang
                    </button>
                  </div>
                </div>
              </div>

              {/* Tambah Slot Manual */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={manualSlotLabel}
                  onChange={(e) => setManualSlotLabel(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddManualSlot()}
                  placeholder="Tambah slot khusus (misal: Siswa Cadangan / Kursi A)..."
                  className="flex-1 px-4 py-2 rounded-xl bg-forest-950 border border-forest-700 text-white text-xs focus:outline-none focus:border-gold-500"
                />
                <button
                  type="button"
                  onClick={handleAddManualSlot}
                  className="px-4 py-2 rounded-xl bg-forest-800 hover:bg-forest-700 text-white text-xs font-bold flex items-center gap-1.5 transition-colors border border-forest-700"
                >
                  <AiOutlinePlus />
                  <span>Tambah</span>
                </button>
              </div>

              {/* Daftar Slot Siswa Terdaftar */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-forest-200">
                    Daftar Slot Siap Didaftarkan ({slotList.length} Slot)
                  </span>
                </div>
                <div className="max-h-64 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 pr-1">
                  {slotList.map((slot, idx) => (
                    <div
                      key={slot.id}
                      className="p-2.5 rounded-xl bg-forest-950/70 border border-forest-800 flex items-center justify-between text-xs group hover:border-forest-700"
                    >
                      <span className="truncate font-medium text-forest-200" title={slot.label}>
                        {slot.label}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveSlot(slot.id)}
                        className="text-forest-400 hover:text-rose-400 p-1 opacity-60 group-hover:opacity-100 transition-opacity"
                        title="Hapus Slot"
                      >
                        <AiOutlineDelete className="text-sm" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* LANGKAH 3: BIAYA SPP & REKENING PEMBAYARAN */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <AiOutlineDollarCircle className="text-gold-400 text-xl" />
                  <span>Biaya SPP &amp; Rekening Pembayaran</span>
                </h3>
                <p className="text-xs text-forest-300 mt-1">
                  Tentukan nominal iuran berkala per siswa, tanggal penagihan bulanan, dan rekening bank penerima.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-forest-200 mb-1">
                    Nominal SPP / Iuran per Siswa (Rp) <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="number"
                    min="10000"
                    step="10000"
                    value={sppAmount}
                    onChange={(e) => setSppAmount(Number(e.target.value))}
                    className="w-full px-4 py-2.5 rounded-xl bg-forest-950 border border-forest-700 text-gold-400 font-bold text-base focus:outline-none focus:border-gold-500"
                  />
                  <span className="text-[11px] text-forest-400 mt-1 block">
                    Terbaca: {formatRupiah(sppAmount)} / bulan
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-forest-200 mb-1">
                    Tanggal Jatuh Tempo Bulanan <span className="text-rose-400">*</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      max="28"
                      value={dueDay}
                      onChange={(e) => setDueDay(Number(e.target.value))}
                      className="w-full px-4 py-2.5 rounded-xl bg-forest-950 border border-forest-700 text-white font-bold text-sm focus:outline-none focus:border-gold-500"
                    />
                    <span className="text-xs text-forest-300 shrink-0">tiap bulan</span>
                  </div>
                  <span className="text-[11px] text-forest-400 mt-1 block">
                    Paling lambat tanggal 1 s.d. 28 setiap bulannya.
                  </span>
                </div>
              </div>

              {/* Rincian Rekening Bank */}
              <div className="p-4 bg-forest-950/80 border border-forest-800 rounded-2xl space-y-4">
                <div className="flex items-center gap-2 text-xs font-bold text-gold-400">
                  <AiOutlineBank className="text-base" />
                  <span>Rekening Tujuan Pembayaran SPP</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] text-forest-300 mb-1">Bank / E-Wallet</label>
                    <select
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-forest-900 border border-forest-700 text-white text-xs focus:outline-none focus:border-gold-500"
                    >
                      {BANK_OPTIONS.map((b) => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] text-forest-300 mb-1">Nomor Rekening</label>
                    <input
                      type="text"
                      required
                      value={bankAccountNo}
                      onChange={(e) => setBankAccountNo(e.target.value)}
                      placeholder="Contoh: 1234567890"
                      className="w-full px-3 py-2 rounded-xl bg-forest-900 border border-forest-700 text-white text-xs focus:outline-none focus:border-gold-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-forest-300 mb-1">Atas Nama Pemilik</label>
                    <input
                      type="text"
                      required
                      value={bankAccountHolder}
                      onChange={(e) => setBankAccountHolder(e.target.value)}
                      placeholder="Contoh: Rina Kusuma"
                      className="w-full px-3 py-2 rounded-xl bg-forest-900 border border-forest-700 text-white text-xs focus:outline-none focus:border-gold-500"
                    />
                  </div>
                </div>
              </div>

              {/* Catatan / Kebijakan SPP */}
              <div>
                <label className="block text-xs font-semibold text-forest-200 mb-1">
                  Catatan / Kebijakan Iuran SPP
                </label>
                <textarea
                  rows="2"
                  value={sppNotes}
                  onChange={(e) => setSppNotes(e.target.value)}
                  placeholder="Informasi tambahan terkait kebijakan pembayaran SPP..."
                  className="w-full px-4 py-2.5 rounded-xl bg-forest-950 border border-forest-700 text-white text-xs focus:outline-none focus:border-gold-500 transition-colors"
                />
              </div>
            </div>
          )}

          {/* Tombol Navigasi Bawah */}
          <div className="pt-6 mt-6 border-t border-forest-800 flex items-center justify-between">
            {currentStep > 1 ? (
              <button
                type="button"
                onClick={handleBack}
                disabled={saving}
                className="px-4 py-2.5 rounded-xl bg-forest-950 hover:bg-forest-800 text-forest-300 hover:text-white text-xs font-semibold flex items-center gap-2 border border-forest-800 transition-colors disabled:opacity-50"
              >
                <AiOutlineArrowLeft />
                <span>Sebelumnya</span>
              </button>
            ) : (
              <div />
            )}

            {currentStep < 3 ? (
              <button
                type="button"
                onClick={handleNext}
                className="px-6 py-2.5 rounded-xl bg-gold-500 hover:bg-gold-400 text-forest-950 font-bold text-xs flex items-center gap-2 transition-all hover:scale-105 shadow-lg shadow-gold-500/20"
              >
                <span>Lanjutkan</span>
                <AiOutlineArrowRight />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSaveAll}
                disabled={saving}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-amber-500 hover:from-emerald-500 hover:to-amber-400 text-white font-bold text-xs flex items-center gap-2 transition-all hover:scale-105 shadow-lg shadow-emerald-950/40 disabled:opacity-50"
              >
                {saving ? (
                  <span>Menyimpan Pengaturan...</span>
                ) : (
                  <>
                    <AiOutlineCheck />
                    <span>Simpan &amp; Terbitkan Kelas</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
