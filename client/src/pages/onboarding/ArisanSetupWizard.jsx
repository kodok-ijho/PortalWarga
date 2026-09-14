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
  AiOutlineTrophy,
  AiOutlineInfoCircle,
  AiOutlineUsergroupAdd,
  AiOutlineSmile,
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

const ARISAN_CATEGORIES = [
  'Keluarga Besar',
  'Alumni / Sekolah',
  'Rekan Kerja / Kantor',
  'RT / RW / Kompleks',
  'Sahabat / Komunitas',
  'Ibu-Ibu PKK / Pengajian',
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

export default function ArisanSetupWizard({ tenantId: propTenantId, initialData }) {
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

  // Step 1: Identitas Grup Arisan
  const [groupName, setGroupName] = useState(initialData?.name || '');
  const [category, setCategory] = useState(initialData?.settings?.category || 'Keluarga Besar');
  const [contactPhone, setContactPhone] = useState(initialData?.contact_phone || '');
  const [arisanRules, setArisanRules] = useState(
    initialData?.settings?.arisan_rules ||
      'Setoran kontribusi wajib lunas sebelum jadwal pengocokan. Pemenang ditentukan otomatis secara adil dan transparan.'
  );

  // Step 2: Konfigurasi Slot / Peserta
  const [slotCountInput, setSlotCountInput] = useState(10);
  const [slotPrefix, setSlotPrefix] = useState('Slot ');
  const [slotList, setSlotList] = useState([]);
  const [manualSlotLabel, setManualSlotLabel] = useState('');

  // Step 3: Aturan Iuran Kontribusi & Pengocokan
  const [contributionAmount, setContributionAmount] = useState(
    initialData?.settings?.contribution_amount || 300000
  );
  const [drawFrequency, setDrawFrequency] = useState(
    initialData?.settings?.draw_frequency || 'monthly'
  );
  const [drawDay, setDrawDay] = useState(initialData?.settings?.draw_day || 10);
  const [bankName, setBankName] = useState('BCA');
  const [bankAccountNo, setBankAccountNo] = useState('');
  const [bankAccountHolder, setBankAccountHolder] = useState('');

  // Sinkronkan activeTenantId dengan URL param jika berbeda
  useEffect(() => {
    if (tenantId && tenantId !== activeTenantId) {
      switchTenant(tenantId);
    }
  }, [tenantId, activeTenantId, switchTenant]);

  // Load data awal jika initialData tidak di-pass
  useEffect(() => {
    if (initialData) {
      setGroupName(initialData.name || '');
      setContactPhone(initialData.contact_phone || '');
      if (initialData.settings?.category) setCategory(initialData.settings.category);
      if (initialData.settings?.arisan_rules) setArisanRules(initialData.settings.arisan_rules);
      if (initialData.settings?.contribution_amount) {
        setContributionAmount(initialData.settings.contribution_amount);
      }
      if (initialData.settings?.draw_frequency) {
        setDrawFrequency(initialData.settings.draw_frequency);
      }
      if (initialData.settings?.draw_day) {
        setDrawDay(initialData.settings.draw_day);
      }
      if (initialData.settings?.bank_account) {
        setBankName(initialData.settings.bank_account.bank_name || 'BCA');
        setBankAccountNo(initialData.settings.bank_account.account_number || '');
        setBankAccountHolder(initialData.settings.bank_account.account_holder || '');
      }
      setLoadingInitial(false);
      return;
    }

    let mounted = true;
    async function loadData() {
      if (!tenantId) return;
      try {
        setLoadingInitial(true);
        const data = await fetchTenantDetails(tenantId);
        if (mounted && data) {
          setGroupName(data.name || '');
          setContactPhone(data.contact_phone || '');
          if (data.settings?.category) setCategory(data.settings.category);
          if (data.settings?.arisan_rules) setArisanRules(data.settings.arisan_rules);
          if (data.settings?.contribution_amount) {
            setContributionAmount(data.settings.contribution_amount);
          }
          if (data.settings?.draw_frequency) {
            setDrawFrequency(data.settings.draw_frequency);
          }
          if (data.settings?.draw_day) {
            setDrawDay(data.settings.draw_day);
          }
          if (data.settings?.bank_account) {
            setBankName(data.settings.bank_account.bank_name || 'BCA');
            setBankAccountNo(data.settings.bank_account.account_number || '');
            setBankAccountHolder(data.settings.bank_account.account_holder || '');
          }
        }
      } catch (err) {
        console.error('[ArisanSetupWizard] Gagal memuat rincian arisan:', err);
      } finally {
        if (mounted) setLoadingInitial(false);
      }
    }

    loadData();
    return () => {
      mounted = false;
    };
  }, [tenantId, initialData]);

  // Inisialisasi daftar slot awal
  useEffect(() => {
    if (slotList.length === 0) {
      const initial = Array.from({ length: 10 }, (_, i) => ({
        id: `slot-${i + 1}`,
        label: `Slot #${String(i + 1).padStart(2, '0')}`,
        assignedName: '',
      }));
      setSlotList(initial);
    }
  }, [slotList.length]);

  // Total uang arisan per putaran (Hadiah Pemenang)
  const totalPrizePerRound = useMemo(() => {
    const count = slotList.length || 0;
    const nominal = Number(contributionAmount) || 0;
    return count * nominal;
  }, [slotList.length, contributionAmount]);

  // Generator slot otomatis
  const handleGenerateSlots = () => {
    const count = parseInt(slotCountInput, 10);
    if (isNaN(count) || count < 2) {
      toast.error('Jumlah peserta/slot arisan minimal 2 slot.');
      return;
    }
    if (count > 100) {
      toast.error('Maksimal kuota generator otomatis adalah 100 slot.');
      return;
    }

    const generated = Array.from({ length: count }, (_, i) => {
      const numStr = String(i + 1).padStart(2, '0');
      return {
        id: `slot-gen-${Date.now()}-${i + 1}`,
        label: `${slotPrefix.trim()} #${numStr}`.trim(),
        assignedName: '',
      };
    });

    setSlotList(generated);
    toast.success(`${count} slot undian arisan berhasil dibuat.`);
  };

  // Tambah slot manual
  const handleAddSlotManual = () => {
    if (!manualSlotLabel.trim()) {
      toast.error('Label atau nama slot tidak boleh kosong.');
      return;
    }
    if (slotList.some((s) => s.label.toLowerCase() === manualSlotLabel.trim().toLowerCase())) {
      toast.error(`Slot "${manualSlotLabel.trim()}" sudah ada dalam daftar.`);
      return;
    }

    setSlotList((prev) => [
      ...prev,
      {
        id: `slot-manual-${Date.now()}`,
        label: manualSlotLabel.trim(),
        assignedName: '',
      },
    ]);
    setManualSlotLabel('');
    toast.success(`Slot "${manualSlotLabel.trim()}" ditambahkan.`);
  };

  const handleRemoveSlot = (idToRemove) => {
    if (slotList.length <= 2) {
      toast.error('Arisan membutuhkan minimal 2 slot peserta agar pengocokan adil.');
      return;
    }
    setSlotList((prev) => prev.filter((s) => s.id !== idToRemove));
  };

  // Validasi sebelum pindah step
  const handleNextStep = () => {
    if (currentStep === 1) {
      if (!groupName.trim()) {
        toast.error('Nama grup arisan wajib diisi.');
        return;
      }
      setCurrentStep(2);
    } else if (currentStep === 2) {
      if (slotList.length < 2) {
        toast.error('Minimal harus ada 2 slot undian peserta arisan.');
        return;
      }
      setCurrentStep(3);
    }
  };

  // Simpan konfigurasi arisan ke database
  const handleFinalizeSetup = async () => {
    if (!contributionAmount || Number(contributionAmount) <= 0) {
      toast.error('Nominal iuran arisan harus lebih dari Rp 0.');
      return;
    }

    try {
      setSaving(true);

      // 1. Simpan unit/slot arisan ke tenant_units
      const unitPayload = slotList.map((s, index) => ({
        label: s.label,
        unit_identifier: s.label,
        status: 'active',
        metadata: {
          slot_number: index + 1,
          assigned_name: s.assignedName?.trim() || null,
          type: 'arisan_slot',
          created_by_wizard: true,
        },
      }));

      await bulkCreateTenantUnits(tenantId, unitPayload);

      // 2. Generate invite code untuk grup arisan
      const inviteCode = await generateInviteCode(tenantId);
      setGeneratedInviteCode(inviteCode);

      // 3. Simpan setting arisan ke tenants.settings
      const settingsPayload = {
        onboarding_completed: true,
        invite_code: inviteCode,
        category,
        arisan_rules: arisanRules.trim(),
        slot_count: slotList.length,
        contribution_amount: Number(contributionAmount),
        draw_frequency: drawFrequency,
        draw_day: Number(drawDay) || 1,
        total_prize_per_round: totalPrizePerRound,
        bank_account: {
          bank_name: bankName.trim(),
          account_number: bankAccountNo.trim(),
          account_holder: bankAccountHolder.trim(),
        },
      };

      await updateTenantProfileAndSettings(tenantId, {
        name: groupName.trim(),
        contact_phone: contactPhone.trim(),
        settings: settingsPayload,
      });

      await refreshTenant();
      setSetupFinished(true);
      toast.success('Inisiasi grup arisan berhasil disimpan!');
    } catch (err) {
      console.error('[ArisanSetupWizard] Gagal menyimpan setup arisan:', err);
      toast.error(err.message || 'Gagal menyimpan konfigurasi arisan.');
    } finally {
      setSaving(false);
    }
  };

  const handleCopyInviteLink = () => {
    const inviteUrl = `${window.location.origin}/join/${generatedInviteCode}`;
    navigator.clipboard.writeText(inviteUrl);
    setCopiedCode(true);
    toast.success('Tautan undangan arisan disalin ke clipboard!');
    setTimeout(() => setCopiedCode(false), 2500);
  };

  const handleCopyWhatsAppBroadcast = () => {
    const inviteUrl = `${window.location.origin}/join/${generatedInviteCode}`;
    const freqLabel =
      drawFrequency === 'weekly'
        ? 'Mingguan'
        : drawFrequency === 'biweekly'
        ? '2 Mingguan'
        : `Bulanan (Tgl ${drawDay})`;

    const message = `🎉 *UNDANGAN ARISAN: ${groupName.toUpperCase()}* 🎉

Halo teman-teman! Grup arisan kita kini dikelola secara digital & transparan di *RuangWarga*.

💰 *Iuran Kontribusi:* ${formatRupiah(contributionAmount)} / putaran
🏆 *Total Hadiah Pemenang:* ${formatRupiah(totalPrizePerRound)}
📅 *Jadwal Pengocokan:* ${freqLabel}
👥 *Total Peserta/Slot:* ${slotList.length} slot

Yuk segera bergabung ke grup arisan melalui link resmi di bawah ini:
👉 ${inviteUrl}

_Pemenang dikocok otomatis secara digital & riwayat tersimpan transparan untuk semua anggota._`;

    navigator.clipboard.writeText(message);
    setCopiedWaMessage(true);
    toast.success('Pesan undangan WhatsApp disalin!');
    setTimeout(() => setCopiedWaMessage(false), 2500);
  };

  if (loadingInitial) {
    return (
      <div className="min-h-screen bg-[#071f13] flex items-center justify-center p-4">
        <div className="text-center text-forest-300 animate-pulse text-sm">
          Menyiapkan formulir inisiasi grup arisan...
        </div>
      </div>
    );
  }

  // Layar Sukses (Step 4)
  if (setupFinished) {
    const inviteUrl = `${window.location.origin}/join/${generatedInviteCode}`;

    return (
      <div className="min-h-screen bg-[#071f13] text-white py-12 px-4 sm:px-6 lg:px-8 flex items-center justify-center">
        <div className="max-w-xl w-full bg-forest-900/90 border border-purple-500/40 rounded-3xl p-8 shadow-2xl backdrop-blur-md text-center space-y-6">
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-purple-600/30 to-amber-500/20 text-purple-300 border border-purple-500/50 flex items-center justify-center mx-auto text-4xl shadow-inner shadow-purple-900/40">
            🎲
          </div>

          <div>
            <span className="text-xs font-bold text-purple-400 uppercase tracking-widest block mb-1">
              Grup Arisan Siap Dimulai!
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white font-display">
              {groupName}
            </h2>
            <p className="text-xs sm:text-sm text-forest-300 mt-2 max-w-md mx-auto">
              Inisiasi grup arisan selesai. Bagikan tautan undangan ini kepada seluruh peserta agar
              mereka dapat memantau setoran dan jadwal pengocokan secara transparan.
            </p>
          </div>

          {/* Kartu Ringkasan Aturan Arisan */}
          <div className="p-4 bg-forest-950/80 rounded-2xl border border-forest-800 text-left space-y-3 text-xs">
            <div className="flex items-center justify-between border-b border-forest-800 pb-2">
              <span className="text-forest-400">Total Slot Undian:</span>
              <span className="font-bold text-white">{slotList.length} Peserta / Slot</span>
            </div>
            <div className="flex items-center justify-between border-b border-forest-800 pb-2">
              <span className="text-forest-400">Iuran per Putaran:</span>
              <span className="font-bold text-purple-300">{formatRupiah(contributionAmount)}</span>
            </div>
            <div className="flex items-center justify-between border-b border-forest-800 pb-2">
              <span className="text-forest-400">Hadiah Pemenang:</span>
              <span className="font-extrabold text-amber-400 text-sm">{formatRupiah(totalPrizePerRound)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-forest-400">Jadwal Pengocokan:</span>
              <span className="font-semibold text-forest-200 capitalize">
                {drawFrequency === 'weekly' ? 'Setiap Minggu' : `Bulanan (Tanggal ${drawDay})`}
              </span>
            </div>
          </div>

          {/* Kotak Tautan Undangan */}
          <div className="p-4 bg-purple-950/30 rounded-2xl border border-purple-800/60 text-left space-y-2">
            <label className="text-[11px] font-bold text-purple-300 uppercase tracking-wider block">
              Tautan Undangan Peserta (Invite Link)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={inviteUrl}
                className="flex-1 bg-forest-950/90 border border-forest-700 rounded-xl px-3 py-2 text-xs text-forest-200 font-mono select-all focus:outline-none"
              />
              <button
                type="button"
                onClick={handleCopyInviteLink}
                className="px-3 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 shadow"
              >
                {copiedCode ? <AiOutlineCheck /> : <AiOutlineCopy />}
                <span>{copiedCode ? 'Disalin' : 'Salin'}</span>
              </button>
            </div>
          </div>

          {/* Tombol Bagikan WhatsApp */}
          <button
            type="button"
            onClick={handleCopyWhatsAppBroadcast}
            className="w-full py-3 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-xs shadow-lg transition-all flex items-center justify-center gap-2"
          >
            {copiedWaMessage ? <AiOutlineCheck /> : <AiOutlineUsergroupAdd className="text-base" />}
            <span>{copiedWaMessage ? 'Teks WhatsApp Siap Dikirim!' : 'Salin Format Undangan WhatsApp Grup'}</span>
          </button>

          {/* Masuk ke Dashboard Arisan */}
          <div className="pt-2">
            <button
              type="button"
              onClick={() => navigate(`/t/${tenantId}/dashboard`)}
              className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-purple-600 to-amber-500 hover:from-purple-500 hover:to-amber-400 text-white font-extrabold text-sm shadow-xl transition-all hover:scale-[1.02]"
            >
              Masuk ke Dashboard Arisan Sekarang &rarr;
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#071f13] text-white py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-8">
        {/* Top Breadcrumb & Title */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/20 border border-purple-500/40 text-purple-300 text-xs font-bold uppercase tracking-wider">
            <span>🎲</span>
            <span>Setup Inisiasi Grup Arisan</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white font-display">
            Pengaturan Awal Arisan Digital
          </h1>
          <p className="text-xs sm:text-sm text-forest-300 max-w-lg mx-auto">
            Lengkapi profil grup, tetapkan slot peserta, dan tentukan nominal iuran serta jadwal
            kocok undian yang transparan.
          </p>
        </div>

        {/* Stepper Progress Bar */}
        <div className="bg-forest-900/70 border border-forest-800 rounded-2xl p-4 shadow-xl">
          <div className="flex items-center justify-between">
            {/* Step 1 */}
            <div className="flex items-center gap-3">
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs border ${
                  currentStep === 1
                    ? 'bg-purple-600 border-purple-400 text-white shadow-lg shadow-purple-900/50'
                    : currentStep > 1
                    ? 'bg-forest-800 border-forest-600 text-purple-400'
                    : 'bg-forest-950 border-forest-800 text-forest-500'
                }`}
              >
                {currentStep > 1 ? <AiOutlineCheck /> : '1'}
              </div>
              <div className="hidden sm:block text-left">
                <span className="text-[10px] uppercase font-bold text-forest-400 block leading-none">
                  Langkah 1
                </span>
                <span className="text-xs font-semibold text-white">Identitas Grup</span>
              </div>
            </div>

            <div className={`flex-1 h-0.5 mx-3 sm:mx-6 ${currentStep > 1 ? 'bg-purple-500' : 'bg-forest-800'}`} />

            {/* Step 2 */}
            <div className="flex items-center gap-3">
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs border ${
                  currentStep === 2
                    ? 'bg-purple-600 border-purple-400 text-white shadow-lg shadow-purple-900/50'
                    : currentStep > 2
                    ? 'bg-forest-800 border-forest-600 text-purple-400'
                    : 'bg-forest-950 border-forest-800 text-forest-500'
                }`}
              >
                {currentStep > 2 ? <AiOutlineCheck /> : '2'}
              </div>
              <div className="hidden sm:block text-left">
                <span className="text-[10px] uppercase font-bold text-forest-400 block leading-none">
                  Langkah 2
                </span>
                <span className="text-xs font-semibold text-white">Slot Peserta</span>
              </div>
            </div>

            <div className={`flex-1 h-0.5 mx-3 sm:mx-6 ${currentStep > 2 ? 'bg-purple-500' : 'bg-forest-800'}`} />

            {/* Step 3 */}
            <div className="flex items-center gap-3">
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs border ${
                  currentStep === 3
                    ? 'bg-purple-600 border-purple-400 text-white shadow-lg shadow-purple-900/50'
                    : 'bg-forest-950 border-forest-800 text-forest-500'
                }`}
              >
                3
              </div>
              <div className="hidden sm:block text-left">
                <span className="text-[10px] uppercase font-bold text-forest-400 block leading-none">
                  Langkah 3
                </span>
                <span className="text-xs font-semibold text-white">Iuran & Hadiah</span>
              </div>
            </div>
          </div>
        </div>

        {/* Content Box Per Step */}
        <div className="bg-forest-900/60 border border-forest-700/80 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-sm">
          {/* =========================================================================
              STEP 1: IDENTITAS GRUP ARISAN
             ========================================================================= */}
          {currentStep === 1 && (
            <div className="space-y-6 animate-fadeIn">
              <div className="border-b border-forest-800 pb-4">
                <h2 className="text-lg font-bold text-white font-display flex items-center gap-2">
                  <span>✨</span>
                  <span>Informasi & Profil Grup Arisan</span>
                </h2>
                <p className="text-xs text-forest-300 mt-1">
                  Beri nama grup arisan Anda agar mudah dikenali oleh para anggota.
                </p>
              </div>

              {/* Nama Grup Arisan */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-forest-200 block">
                  Nama Grup Arisan <span className="text-amber-400">*</span>
                </label>
                <input
                  type="text"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="Contoh: Arisan Keluarga Besar Bani Sastro / Arisan Alumni 2012"
                  className="w-full bg-forest-950/80 border border-forest-700 focus:border-purple-400 rounded-xl px-4 py-3 text-sm text-white placeholder-forest-500 focus:outline-none focus:ring-1 focus:ring-purple-400"
                />
              </div>

              {/* Kategori Arisan */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-forest-200 block">
                  Kategori Grup
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {ARISAN_CATEGORIES.map((cat) => {
                    const isSelected = category === cat;
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setCategory(cat)}
                        className={`py-2 px-3 rounded-xl text-xs font-semibold border text-left transition-all ${
                          isSelected
                            ? 'bg-purple-600/30 border-purple-400 text-purple-200 shadow'
                            : 'bg-forest-950/60 border-forest-800 text-forest-400 hover:border-forest-600 hover:text-forest-200'
                        }`}
                      >
                        {cat}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Nomor Kontak WhatsApp Ketua / Admin */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-forest-200 block">
                  Nomor WhatsApp Pengelola / Admin
                </label>
                <input
                  type="tel"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="Contoh: 081234567890"
                  className="w-full bg-forest-950/80 border border-forest-700 focus:border-purple-400 rounded-xl px-4 py-3 text-sm text-white placeholder-forest-500 focus:outline-none focus:ring-1 focus:ring-purple-400"
                />
                <span className="text-[11px] text-forest-400 block">
                  Nomor ini digunakan jika anggota butuh konfirmasi transfer setoran manual.
                </span>
              </div>

              {/* Peraturan / Catatan Arisan */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-forest-200 block">
                  Catatan / Kesepakatan Grup (Opsional)
                </label>
                <textarea
                  rows={3}
                  value={arisanRules}
                  onChange={(e) => setArisanRules(e.target.value)}
                  placeholder="Tuliskan catatan penting arisan, misalnya batas transfer atau denda jika terlambat..."
                  className="w-full bg-forest-950/80 border border-forest-700 focus:border-purple-400 rounded-xl px-4 py-2.5 text-xs text-white placeholder-forest-500 focus:outline-none focus:ring-1 focus:ring-purple-400"
                />
              </div>

              {/* Action Buttons Step 1 */}
              <div className="pt-4 border-t border-forest-800 flex justify-end">
                <button
                  type="button"
                  onClick={handleNextStep}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-lg shadow-purple-900/30 transition-all hover:scale-105"
                >
                  <span>Lanjut: Konfigurasi Slot Peserta</span>
                  <AiOutlineArrowRight />
                </button>
              </div>
            </div>
          )}

          {/* =========================================================================
              STEP 2: KONFIGURASI SLOT / PESERTA ARISAN
             ========================================================================= */}
          {currentStep === 2 && (
            <div className="space-y-6 animate-fadeIn">
              <div className="border-b border-forest-800 pb-4">
                <h2 className="text-lg font-bold text-white font-display flex items-center gap-2">
                  <span>👥</span>
                  <span>Daftar Slot Undian Peserta</span>
                </h2>
                <p className="text-xs text-forest-300 mt-1">
                  Tentukan berapa jumlah slot/nama yang akan berputar dalam 1 siklus penuh arisan.
                </p>
              </div>

              {/* Generator Slot Cepat */}
              <div className="p-4 bg-forest-950/70 border border-forest-800 rounded-2xl space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-purple-300">
                  <AiOutlineUsergroupAdd className="text-base" />
                  <span>Generator Slot Cepat</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[11px] text-forest-400 block mb-1">Prefix Label</label>
                    <input
                      type="text"
                      value={slotPrefix}
                      onChange={(e) => setSlotPrefix(e.target.value)}
                      placeholder="Slot"
                      className="w-full bg-forest-900 border border-forest-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-forest-400 block mb-1">Jumlah Peserta/Slot</label>
                    <input
                      type="number"
                      min={2}
                      max={100}
                      value={slotCountInput}
                      onChange={(e) => setSlotCountInput(e.target.value)}
                      className="w-full bg-forest-900 border border-forest-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none font-bold"
                    />
                  </div>

                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={handleGenerateSlots}
                      className="w-full py-2 px-3 rounded-xl bg-purple-700 hover:bg-purple-600 text-white font-bold text-xs transition-colors"
                    >
                      Terapkan Generator
                    </button>
                  </div>
                </div>
              </div>

              {/* Tambah Slot Manual */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={manualSlotLabel}
                  onChange={(e) => setManualSlotLabel(e.target.value)}
                  placeholder="Atau tambah nama slot manual (misal: Slot #11 / Bu Ani - Slot 2)..."
                  className="flex-1 bg-forest-950/80 border border-forest-700 rounded-xl px-3 py-2 text-xs text-white placeholder-forest-500 focus:outline-none focus:border-purple-400"
                />
                <button
                  type="button"
                  onClick={handleAddSlotManual}
                  className="px-4 py-2 rounded-xl bg-forest-800 hover:bg-forest-700 text-white font-bold text-xs transition-colors flex items-center gap-1.5"
                >
                  <AiOutlinePlus />
                  <span>Tambah</span>
                </button>
              </div>

              {/* Rangkuman & Daftar Slot */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-forest-200">
                    Total Slot Aktif: <span className="text-purple-300 font-extrabold">{slotList.length} Slot</span>
                  </span>
                  <span className="text-forest-400 text-[11px]">
                    (Siklus arisan akan berjalan {slotList.length} putaran)
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 max-h-60 overflow-y-auto pr-1">
                  {slotList.map((slot, index) => (
                    <div
                      key={slot.id}
                      className="p-2.5 bg-forest-950/80 border border-forest-800 rounded-xl flex items-center justify-between group hover:border-purple-500/40 transition-all"
                    >
                      <div className="truncate">
                        <span className="text-[10px] text-purple-400 font-mono block leading-none">
                          #{index + 1}
                        </span>
                        <span className="text-xs font-semibold text-white truncate block">
                          {slot.label}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveSlot(slot.id)}
                        className="text-forest-600 hover:text-rose-400 p-1 transition-colors"
                        title="Hapus slot ini"
                      >
                        <AiOutlineDelete className="text-sm" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Navigation Step 2 */}
              <div className="pt-4 border-t border-forest-800 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setCurrentStep(1)}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-forest-800 hover:bg-forest-700 text-forest-200 text-xs font-bold transition-colors"
                >
                  <AiOutlineArrowLeft />
                  <span>Kembali</span>
                </button>

                <button
                  type="button"
                  onClick={handleNextStep}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-lg shadow-purple-900/30 transition-all hover:scale-105"
                >
                  <span>Lanjut: Iuran & Pengocokan</span>
                  <AiOutlineArrowRight />
                </button>
              </div>
            </div>
          )}

          {/* =========================================================================
              STEP 3: IURAN KONTRIBUSI, REKENING & JADWAL KOCOK
             ========================================================================= */}
          {currentStep === 3 && (
            <div className="space-y-6 animate-fadeIn">
              <div className="border-b border-forest-800 pb-4">
                <h2 className="text-lg font-bold text-white font-display flex items-center gap-2">
                  <span>💰</span>
                  <span>Nominal Iuran, Hadiah & Jadwal Pengocokan</span>
                </h2>
                <p className="text-xs text-forest-300 mt-1">
                  Atur besaran setoran tiap anggota per putaran dan rekening kas penampung.
                </p>
              </div>

              {/* Nominal Iuran per Slot */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-forest-200 block">
                  Besaran Iuran per Slot / Putaran <span className="text-amber-400">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-forest-400 text-xs font-bold">
                    Rp
                  </div>
                  <input
                    type="number"
                    step={50000}
                    min={10000}
                    value={contributionAmount}
                    onChange={(e) => setContributionAmount(e.target.value)}
                    className="w-full bg-forest-950/80 border border-forest-700 focus:border-purple-400 rounded-xl pl-10 pr-4 py-3 text-sm text-white font-bold placeholder-forest-500 focus:outline-none"
                  />
                </div>
                <div className="flex gap-2 pt-1">
                  {[100000, 250000, 500000, 1000000].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setContributionAmount(preset)}
                      className="px-2.5 py-1 rounded-lg bg-forest-950 border border-forest-800 hover:border-purple-500 text-[11px] text-forest-300 transition-colors"
                    >
                      {formatRupiah(preset)}
                    </button>
                  ))}
                </div>
              </div>

              {/* CARD SIMULASI HADIAH PEMENANG */}
              <div className="p-5 bg-gradient-to-r from-purple-950/60 to-forest-950/90 border border-purple-500/40 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center justify-center text-2xl shadow-inner">
                    <AiOutlineTrophy />
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-amber-300 tracking-wider block">
                      Total Uang yang Diterima Pemenang
                    </span>
                    <span className="text-xl sm:text-2xl font-black text-white font-display">
                      {formatRupiah(totalPrizePerRound)}
                    </span>
                    <span className="text-[11px] text-forest-400 block mt-0.5">
                      (Dihitung dari {slotList.length} slot &times; {formatRupiah(contributionAmount)})
                    </span>
                  </div>
                </div>

                <div className="text-right sm:border-l sm:border-forest-800 sm:pl-4">
                  <span className="text-[10px] text-forest-400 block">Durasi 1 Siklus Penuh:</span>
                  <span className="text-xs font-bold text-purple-300">
                    {slotList.length} Kali Pengocokan
                  </span>
                </div>
              </div>

              {/* Frekuensi Pengocokan & Tanggal */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-forest-200 block">
                    Frekuensi Kocok
                  </label>
                  <select
                    value={drawFrequency}
                    onChange={(e) => setDrawFrequency(e.target.value)}
                    className="w-full bg-forest-950/80 border border-forest-700 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none"
                  >
                    <option value="monthly">Bulanan (1 kali per bulan)</option>
                    <option value="biweekly">2 Mingguan (2 kali per bulan)</option>
                    <option value="weekly">Mingguan (1 kali per pekan)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-forest-200 block">
                    {drawFrequency === 'weekly' ? 'Hari Pengocokan' : 'Tanggal Jatuh Tempo / Kocok'}
                  </label>
                  {drawFrequency === 'weekly' ? (
                    <select
                      value={drawDay}
                      onChange={(e) => setDrawDay(e.target.value)}
                      className="w-full bg-forest-950/80 border border-forest-700 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none"
                    >
                      <option value="1">Hari Senin</option>
                      <option value="3">Hari Rabu</option>
                      <option value="5">Hari Jumat</option>
                      <option value="6">Hari Sabtu</option>
                      <option value="7">Hari Minggu</option>
                    </select>
                  ) : (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={28}
                        value={drawDay}
                        onChange={(e) => setDrawDay(e.target.value)}
                        className="w-full bg-forest-950/80 border border-forest-700 rounded-xl px-3 py-2.5 text-xs text-white font-bold focus:outline-none"
                      />
                      <span className="text-xs text-forest-400 whitespace-nowrap">Tiap bulan</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Rekening Kas Penampung Arisan */}
              <div className="p-4 bg-forest-950/60 border border-forest-800 rounded-2xl space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-forest-200">
                  <AiOutlineBank className="text-sm text-purple-400" />
                  <span>Rekening Kas Penampung Setoran (Opsional)</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[11px] text-forest-400 block mb-1">Pilihan Bank / Dompet</label>
                    <select
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                      className="w-full bg-forest-900 border border-forest-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                    >
                      {BANK_OPTIONS.map((b) => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] text-forest-400 block mb-1">Nomor Rekening</label>
                    <input
                      type="text"
                      value={bankAccountNo}
                      onChange={(e) => setBankAccountNo(e.target.value)}
                      placeholder="Contoh: 1234567890"
                      className="w-full bg-forest-900 border border-forest-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-forest-400 block mb-1">Atas Nama Pemilik</label>
                    <input
                      type="text"
                      value={bankAccountHolder}
                      onChange={(e) => setBankAccountHolder(e.target.value)}
                      placeholder="Contoh: Budi Santoso"
                      className="w-full bg-forest-900 border border-forest-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Navigation Step 3 */}
              <div className="pt-4 border-t border-forest-800 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setCurrentStep(2)}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-forest-800 hover:bg-forest-700 text-forest-200 text-xs font-bold transition-colors"
                >
                  <AiOutlineArrowLeft />
                  <span>Kembali</span>
                </button>

                <button
                  type="button"
                  disabled={saving}
                  onClick={handleFinalizeSetup}
                  className="inline-flex items-center gap-2 px-7 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-amber-500 hover:from-purple-500 hover:to-amber-400 text-white font-extrabold text-xs shadow-xl shadow-purple-950/50 transition-all hover:scale-105 disabled:opacity-50"
                >
                  {saving ? (
                    <span>Menyimpan Inisiasi...</span>
                  ) : (
                    <>
                      <span>Selesaikan & Terbitkan Undangan</span>
                      <AiOutlineCheck />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
