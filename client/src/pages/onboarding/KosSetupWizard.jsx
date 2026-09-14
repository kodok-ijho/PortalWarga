import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  AiOutlineHome,
  AiOutlineCheckCircle,
  AiOutlineArrowRight,
  AiOutlineArrowLeft,
  AiOutlinePlus,
  AiOutlineDelete,
  AiOutlineCopy,
  AiOutlineCheck,
  AiOutlineDollarCircle,
  AiOutlineBank,
  AiOutlineAppstore,
  AiOutlineInfoCircle,
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

const COMMON_FACILITIES = [
  'AC',
  'Kamar Mandi Dalam',
  'Kasur & Bantal',
  'Lemari Pakaian',
  'Meja Belajar',
  'WiFi Internet',
  'Water Heater',
  'Dapur Bersama',
  'Listrik Token Mandiri',
];

export default function KosSetupWizard({ tenantId: propTenantId, initialData }) {
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

  // Step 1: Identitas & Lokasi Kos
  const [kosName, setKosName] = useState(initialData?.name || '');
  const [address, setAddress] = useState(initialData?.address || '');
  const [contactPhone, setContactPhone] = useState(initialData?.contact_phone || '');
  const [kosRules, setKosRules] = useState('');

  // Step 2: Konfigurasi Kamar
  const [roomPrefix, setRoomPrefix] = useState('Kamar ');
  const [roomCountInput, setRoomCountInput] = useState(6);
  const [selectedFacilities, setSelectedFacilities] = useState([
    'AC',
    'Kamar Mandi Dalam',
    'Kasur & Bantal',
    'WiFi Internet',
  ]);
  const [roomList, setRoomList] = useState([]);
  const [manualRoomLabel, setManualRoomLabel] = useState('');
  const [manualRoomPrice, setManualRoomPrice] = useState('');

  // Step 3: Tarif Sewa Default & Penagihan
  const [defaultRentPrice, setDefaultRentPrice] = useState(1200000);
  const [billingCycle, setBillingCycle] = useState('monthly');
  const [dueDay, setDueDay] = useState(1);
  const [bankName, setBankName] = useState('BCA');
  const [bankAccountNo, setBankAccountNo] = useState('');
  const [bankAccountHolder, setBankAccountHolder] = useState('');
  const [additionalFees, setAdditionalFees] = useState([
    { id: 'fee-1', name: 'Biaya Parkir Mobil', amount: 100000 },
  ]);
  const [newFeeName, setNewFeeName] = useState('');
  const [newFeeAmount, setNewFeeAmount] = useState('');

  // Sinkronkan activeTenantId dengan URL param
  useEffect(() => {
    if (tenantId && tenantId !== activeTenantId) {
      switchTenant(tenantId);
    }
  }, [tenantId, activeTenantId, switchTenant]);

  // Load data tenant awal jika belum di-passing
  useEffect(() => {
    if (initialData) {
      setKosName(initialData.name || '');
      setAddress(initialData.address || '');
      setContactPhone(initialData.contact_phone || '');
      if (initialData.settings?.default_rent_price) {
        setDefaultRentPrice(initialData.settings.default_rent_price);
      }
      if (initialData.settings?.billing_cycle) {
        setBillingCycle(initialData.settings.billing_cycle);
      }
      if (initialData.settings?.due_day) {
        setDueDay(initialData.settings.due_day);
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
          setKosName(data.name || '');
          setAddress(data.address || '');
          setContactPhone(data.contact_phone || '');
          if (data.settings?.default_rent_price) {
            setDefaultRentPrice(data.settings.default_rent_price);
          }
          if (data.settings?.billing_cycle) {
            setBillingCycle(data.settings.billing_cycle);
          }
          if (data.settings?.due_day) {
            setDueDay(data.settings.due_day);
          }
          if (data.settings?.bank_account) {
            setBankName(data.settings.bank_account.bank_name || 'BCA');
            setBankAccountNo(data.settings.bank_account.account_number || '');
            setBankAccountHolder(data.settings.bank_account.account_holder || '');
          }
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[KosSetupWizard] Failed to fetch tenant:', err);
      } finally {
        if (mounted) setLoadingInitial(false);
      }
    }
    loadData();
    return () => {
      mounted = false;
    };
  }, [tenantId, initialData]);

  // Inisialisasi daftar kamar default jika masih kosong
  useEffect(() => {
    if (roomList.length === 0) {
      const initial = Array.from({ length: 6 }, (_, i) => ({
        id: `room-${i + 1}`,
        label: `Kamar ${String(i + 1).padStart(2, '0')}`,
        status: 'vacant',
        facilities: [...selectedFacilities],
        price: defaultRentPrice,
      }));
      setRoomList(initial);
    }
  }, [roomList.length, defaultRentPrice, selectedFacilities]);

  // Toggle fasilitas
  const handleToggleFacility = (facility) => {
    setSelectedFacilities((prev) =>
      prev.includes(facility) ? prev.filter((f) => f !== facility) : [...prev, facility]
    );
  };

  // Generate kamar otomatis
  const handleGenerateRooms = () => {
    const count = parseInt(roomCountInput, 10);
    if (isNaN(count) || count <= 0) {
      toast.error('Jumlah kamar harus berupa angka positif.');
      return;
    }
    if (count > 50) {
      toast.error('Maksimal generate 50 kamar sekaligus.');
      return;
    }

    const generated = Array.from({ length: count }, (_, i) => {
      const numStr = String(i + 1).padStart(2, '0');
      return {
        id: `room-gen-${Date.now()}-${i + 1}`,
        label: `${roomPrefix.trim()} ${numStr}`.trim(),
        status: 'vacant',
        facilities: [...selectedFacilities],
        price: defaultRentPrice,
      };
    });

    setRoomList(generated);
    toast.success(`${count} kamar berhasil digenerate.`);
  };

  // Tambah kamar manual
  const handleAddRoomManual = () => {
    if (!manualRoomLabel.trim()) {
      toast.error('Nama atau nomor kamar wajib diisi.');
      return;
    }
    if (roomList.some((r) => r.label.toLowerCase() === manualRoomLabel.trim().toLowerCase())) {
      toast.error(`Kamar "${manualRoomLabel.trim()}" sudah ada dalam daftar.`);
      return;
    }

    const price = parseFloat(manualRoomPrice) || defaultRentPrice;
    setRoomList((prev) => [
      ...prev,
      {
        id: `room-manual-${Date.now()}`,
        label: manualRoomLabel.trim(),
        status: 'vacant',
        facilities: [...selectedFacilities],
        price,
      },
    ]);
    setManualRoomLabel('');
    setManualRoomPrice('');
    toast.success(`Kamar "${manualRoomLabel.trim()}" ditambahkan.`);
  };

  const handleRemoveRoom = (idToRemove) => {
    if (roomList.length <= 1) {
      toast.error('Minimal harus ada 1 kamar di kos Anda.');
      return;
    }
    setRoomList((prev) => prev.filter((r) => r.id !== idToRemove));
  };

  // Tambah biaya tambahan
  const handleAddFee = () => {
    if (!newFeeName.trim()) {
      toast.error('Nama biaya tambahan tidak boleh kosong.');
      return;
    }
    const amt = parseFloat(newFeeAmount);
    if (isNaN(amt) || amt <= 0) {
      toast.error('Nominal biaya harus lebih dari Rp 0.');
      return;
    }
    setAdditionalFees((prev) => [
      ...prev,
      { id: `fee-${Date.now()}`, name: newFeeName.trim(), amount: amt },
    ]);
    setNewFeeName('');
    setNewFeeAmount('');
    toast.success(`Biaya "${newFeeName.trim()}" ditambahkan.`);
  };

  const handleRemoveFee = (id) => {
    setAdditionalFees((prev) => prev.filter((f) => f.id !== id));
  };

  // Simpan Setup Selesai
  const handleSaveSetup = async () => {
    if (!kosName.trim()) {
      toast.error('Nama kos-kosan tidak boleh kosong.');
      setCurrentStep(1);
      return;
    }
    if (roomList.length === 0) {
      toast.error('Anda harus menentukan minimal 1 kamar.');
      setCurrentStep(2);
      return;
    }
    if (!defaultRentPrice || defaultRentPrice <= 0) {
      toast.error('Harga sewa bulanan standar harus lebih dari Rp 0.');
      setCurrentStep(3);
      return;
    }

    setSaving(true);
    try {
      const inviteCode = generateInviteCode(kosName);

      // 1. Simpan kamar ke tenant_units (status: 'vacant', metadata kos)
      await bulkCreateTenantUnits(
        tenantId,
        roomList.map((r, index) => ({
          label: r.label,
          status: 'vacant', // status default kamar kos adalah kosong/siap sewa
          metadata: {
            room_number: r.label,
            order_index: index + 1,
            facilities: r.facilities || selectedFacilities,
            default_rent_price: Number(r.price) || defaultRentPrice,
            initial_wizard: true,
          },
        }))
      );

      // 2. Simpan settings profil tenant kos
      const settingsPayload = {
        onboarding_completed: true,
        invite_code: inviteCode,
        default_rent_price: Number(defaultRentPrice),
        billing_cycle: billingCycle,
        due_day: Number(dueDay) || 1,
        kos_rules: kosRules.trim(),
        additional_fees: additionalFees.map((f) => ({
          name: f.name,
          amount: Number(f.amount),
        })),
        bank_account: {
          bank_name: bankName.trim(),
          account_number: bankAccountNo.trim(),
          account_holder: bankAccountHolder.trim(),
        },
      };

      await updateTenantProfileAndSettings(tenantId, {
        name: kosName.trim(),
        address: address.trim(),
        contact_phone: contactPhone.trim(),
        settings: settingsPayload,
      });

      await refreshTenant();
      setGeneratedInviteCode(inviteCode);
      setSetupFinished(true);
      toast.success('Pengaturan awal Kos-kosan berhasil disimpan!');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[KosSetupWizard] Save failed:', err);
      toast.error(err.message || 'Gagal menyimpan pengaturan kos.');
    } finally {
      setSaving(false);
    }
  };

  const handleCopyInviteLink = () => {
    const inviteUrl = `${window.location.origin}/join/${generatedInviteCode}`;
    navigator.clipboard.writeText(inviteUrl);
    setCopiedCode(true);
    toast.success('Tautan formulir pendaftaran penyewa disalin ke clipboard!');
    setTimeout(() => setCopiedCode(false), 2500);
  };

  if (loadingInitial) {
    return (
      <div className="min-h-screen bg-[#071f13] flex items-center justify-center p-4">
        <div className="text-center text-forest-300 animate-pulse text-sm">
          Menyiapkan formulir inisiasi kos-kosan...
        </div>
      </div>
    );
  }

  // Layar Sukses Selesai Setup
  if (setupFinished) {
    const inviteUrl = `${window.location.origin}/join/${generatedInviteCode}`;

    return (
      <div className="min-h-screen bg-[#071f13] text-white py-12 px-4 sm:px-6 lg:px-8 flex items-center justify-center">
        <div className="max-w-xl w-full bg-forest-900/90 border border-gold-500/50 rounded-3xl p-8 shadow-2xl backdrop-blur-md text-center space-y-6">
          <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 rounded-2xl flex items-center justify-center mx-auto text-3xl shadow-inner">
            <AiOutlineCheckCircle />
          </div>

          <div>
            <span className="text-xs uppercase font-bold tracking-widest text-gold-400">Setup Kos Selesai</span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white mt-1 font-display">
              {kosName} Siap Beroperasi!
            </h2>
            <p className="text-sm text-forest-200 mt-2">
              Sebanyak <strong className="text-white">{roomList.length} kamar</strong> telah siap disewakan dengan tarif standar{' '}
              <strong className="text-gold-300">{formatRupiah(defaultRentPrice)}/bulan</strong>.
            </p>
          </div>

          {/* Kotak Kode Undangan Penyewa */}
          <div className="bg-forest-950/80 border border-forest-700 rounded-2xl p-5 text-left space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-forest-300 uppercase tracking-wider">
                Kode Pendaftaran Calon Penyewa
              </span>
              <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-500/30">
                Langsung Aktif
              </span>
            </div>

            <div className="flex items-center justify-between gap-3 bg-forest-900/90 px-4 py-3 rounded-xl border border-forest-700">
              <span className="font-mono text-lg sm:text-xl font-bold text-gold-300 tracking-wider">
                {generatedInviteCode}
              </span>
              <button
                type="button"
                onClick={handleCopyInviteLink}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gold-500 hover:bg-gold-400 text-forest-950 text-xs font-bold transition-all shadow-sm"
              >
                {copiedCode ? <AiOutlineCheck /> : <AiOutlineCopy />}
                <span>{copiedCode ? 'Tersalin' : 'Salin'}</span>
              </button>
            </div>

            <p className="text-[11px] text-forest-400 leading-relaxed">
              Bagikan tautan atau kode ini ke calon penyewa agar mereka dapat mengisi formulir identitas dan memilih kamar yang diinginkan secara mandiri.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to={`/t/${tenantId}/dashboard`}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-gold-500 to-gold-400 hover:from-gold-400 hover:to-gold-300 text-forest-950 text-sm font-bold shadow-lg transition-all"
            >
              <span>Masuk ke Dashboard Kos</span>
              <AiOutlineArrowRight />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#071f13] text-white py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header Bar */}
        <div className="bg-forest-900/80 border border-forest-700/80 rounded-2xl p-6 shadow-xl backdrop-blur-md">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-3xl p-2.5 bg-forest-950 rounded-xl border border-forest-700">🏢</span>
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[11px] text-forest-300 font-semibold uppercase tracking-wider">
                    Setup Wizard Vertikal
                  </span>
                  <span className="text-forest-600">&bull;</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold">
                    Kos-kosan &amp; Kontrakan
                  </span>
                </div>
                <h1 className="text-xl sm:text-2xl font-bold text-white font-display">
                  Inisiasi Properti &amp; Kamar Kos
                </h1>
              </div>
            </div>

            <button
              type="button"
              onClick={() => navigate(`/t/${tenantId}/dashboard`)}
              className="text-xs text-forest-300 hover:text-white inline-flex items-center gap-1 font-medium transition-colors self-start sm:self-auto"
            >
              <span>Lewati ke Dashboard</span>
              <AiOutlineArrowRight />
            </button>
          </div>

          {/* Stepper Wizard Progress */}
          <div className="mt-8 pt-6 border-t border-forest-800">
            <div className="grid grid-cols-4 gap-2 text-center">
              {[
                { step: 1, label: 'Identitas Kos', icon: AiOutlineHome },
                { step: 2, label: 'Daftar Kamar', icon: AiOutlineAppstore },
                { step: 3, label: 'Ketentuan Sewa', icon: AiOutlineDollarCircle },
                { step: 4, label: 'Review & Selesai', icon: AiOutlineCheckCircle },
              ].map((item) => {
                const Icon = item.icon;
                const isActive = currentStep === item.step;
                const isPassed = currentStep > item.step;

                return (
                  <div
                    key={item.step}
                    onClick={() => {
                      if (isPassed) setCurrentStep(item.step);
                    }}
                    className={`flex flex-col items-center gap-1.5 cursor-pointer ${
                      isActive
                        ? 'text-gold-400 font-bold'
                        : isPassed
                        ? 'text-emerald-400 font-medium'
                        : 'text-forest-500'
                    }`}
                  >
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm border transition-all ${
                        isActive
                          ? 'bg-gold-500/20 border-gold-500 text-gold-300 shadow-md scale-105'
                          : isPassed
                          ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                          : 'bg-forest-950 border-forest-800 text-forest-600'
                      }`}
                    >
                      {isPassed ? <AiOutlineCheck /> : <Icon />}
                    </div>
                    <span className="text-[11px] hidden sm:block">{item.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* STEP 1: Identitas & Lokasi Kos */}
        {currentStep === 1 && (
          <div className="bg-forest-900/70 border border-forest-700/70 rounded-2xl p-6 sm:p-8 shadow-xl space-y-6 animate-fade-in">
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-white font-display">Langkah 1: Identitas Properti Kos</h2>
              <p className="text-xs text-forest-300 mt-1">
                Tentukan nama bangunan kos, alamat lengkap, dan kontak pengelola untuk komunikasi dengan calon penyewa.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-forest-300 mb-1">
                  Nama Kos-Kosan / Kontrakan <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  value={kosName}
                  onChange={(e) => setKosName(e.target.value)}
                  placeholder="Contoh: Kos Melati Harmoni / Paviliun 88"
                  className="w-full bg-forest-950 border border-forest-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-forest-500 focus:outline-none focus:border-gold-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-forest-300 mb-1">
                  Alamat Lengkap Lokasi <span className="text-rose-400">*</span>
                </label>
                <textarea
                  rows={2}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Contoh: Jl. Melati Raya No. 12, Sleman, Yogyakarta"
                  className="w-full bg-forest-950 border border-forest-700 rounded-xl px-4 py-2 text-sm text-white placeholder-forest-500 focus:outline-none focus:border-gold-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-forest-300 mb-1">
                  Nomor WhatsApp Pengelola / Penjaga <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="Contoh: 081234567890"
                  className="w-full bg-forest-950 border border-forest-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-forest-500 focus:outline-none focus:border-gold-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-forest-300 mb-1">
                  Peraturan Umum Kos (Opsional)
                </label>
                <textarea
                  rows={3}
                  value={kosRules}
                  onChange={(e) => setKosRules(e.target.value)}
                  placeholder="Contoh: Jam bertamu maksimal pukul 22.00, dilarang merokok di dalam kamar, menjaga kebersihan bersama."
                  className="w-full bg-forest-950 border border-forest-700 rounded-xl px-4 py-2 text-sm text-white placeholder-forest-500 focus:outline-none focus:border-gold-500"
                />
              </div>
            </div>

            <div className="pt-4 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  if (!kosName.trim()) {
                    toast.error('Nama kos tidak boleh kosong.');
                    return;
                  }
                  setCurrentStep(2);
                }}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gold-500 hover:bg-gold-400 text-forest-950 text-xs font-bold transition-all shadow-md"
              >
                <span>Lanjut ke Daftar Kamar</span>
                <AiOutlineArrowRight />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: Daftar & Konfigurasi Kamar */}
        {currentStep === 2 && (
          <div className="bg-forest-900/70 border border-forest-700/70 rounded-2xl p-6 sm:p-8 shadow-xl space-y-6 animate-fade-in">
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-white font-display">Langkah 2: Konfigurasi Kamar Kos</h2>
              <p className="text-xs text-forest-300 mt-1">
                Generate daftar kamar otomatis atau tambahkan kamar satu per satu. Setiap kamar baru akan berstatus{' '}
                <strong className="text-emerald-300">Vacant (Siap Sewa)</strong>.
              </p>
            </div>

            {/* Pemilihan Fasilitas Umum Bawaan */}
            <div className="p-4 bg-forest-950/70 rounded-xl border border-forest-800 space-y-3">
              <span className="text-xs font-bold text-forest-300 uppercase tracking-wider block">
                Fasilitas Standar Kamar
              </span>
              <div className="flex flex-wrap gap-2">
                {COMMON_FACILITIES.map((f) => {
                  const isSelected = selectedFacilities.includes(f);
                  return (
                    <button
                      key={f}
                      type="button"
                      onClick={() => handleToggleFacility(f)}
                      className={`px-3 py-1 rounded-lg text-xs font-medium border transition-all ${
                        isSelected
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                          : 'bg-forest-900 text-forest-400 border-forest-800 hover:text-white'
                      }`}
                    >
                      {isSelected ? '✓ ' : '+ '}
                      {f}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Generator Kamar Otomatis */}
            <div className="p-4 bg-forest-950/70 rounded-xl border border-forest-800 space-y-4">
              <span className="text-xs font-bold text-forest-300 uppercase tracking-wider block">
                Generator Kamar Cepat
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] text-forest-400 mb-1">Prefix Kamar</label>
                  <input
                    type="text"
                    value={roomPrefix}
                    onChange={(e) => setRoomPrefix(e.target.value)}
                    placeholder="Kamar "
                    className="w-full bg-forest-900 border border-forest-700 rounded-lg px-3 py-1.5 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-forest-400 mb-1">Jumlah Kamar</label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={roomCountInput}
                    onChange={(e) => setRoomCountInput(e.target.value)}
                    className="w-full bg-forest-900 border border-forest-700 rounded-lg px-3 py-1.5 text-xs text-white"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={handleGenerateRooms}
                    className="w-full py-2 rounded-lg bg-forest-800 hover:bg-forest-700 text-gold-300 text-xs font-bold border border-forest-700 transition-colors"
                  >
                    Generate Ulang
                  </button>
                </div>
              </div>
            </div>

            {/* Tambah Kamar Manual */}
            <div className="flex flex-col sm:flex-row items-center gap-2">
              <input
                type="text"
                value={manualRoomLabel}
                onChange={(e) => setManualRoomLabel(e.target.value)}
                placeholder="Tambah kamar manual (misal: Kamar VIP Depan)"
                className="flex-1 bg-forest-950 border border-forest-700 rounded-xl px-3 py-2 text-xs text-white placeholder-forest-500"
              />
              <button
                type="button"
                onClick={handleAddRoomManual}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-forest-800 hover:bg-forest-700 text-xs font-bold text-white border border-forest-700 transition-colors"
              >
                <AiOutlinePlus />
                <span>Tambah Kamar</span>
              </button>
            </div>

            {/* List Kamar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-forest-400 px-1">
                <span>Daftar Kamar ({roomList.length} unit terdaftar)</span>
                <span>Status Awal</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-72 overflow-y-auto pr-1">
                {roomList.map((r) => (
                  <div
                    key={r.id}
                    className="p-3 rounded-xl bg-forest-950/80 border border-forest-800 flex items-center justify-between gap-2"
                  >
                    <div>
                      <strong className="text-xs text-white block">{r.label}</strong>
                      <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 inline-block mt-0.5">
                        Siap Huni (Vacant)
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveRoom(r.id)}
                      title="Hapus kamar"
                      className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-xs transition-colors"
                    >
                      <AiOutlineDelete />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-4 flex justify-between">
              <button
                type="button"
                onClick={() => setCurrentStep(1)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-forest-800 hover:bg-forest-700 text-forest-300 hover:text-white text-xs font-semibold transition-all"
              >
                <AiOutlineArrowLeft />
                <span>Kembali</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (roomList.length === 0) {
                    toast.error('Minimal harus ada 1 kamar.');
                    return;
                  }
                  setCurrentStep(3);
                }}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gold-500 hover:bg-gold-400 text-forest-950 text-xs font-bold transition-all shadow-md"
              >
                <span>Lanjut ke Ketentuan Sewa</span>
                <AiOutlineArrowRight />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Tarif Sewa Default & Rekening Penagihan */}
        {currentStep === 3 && (
          <div className="bg-forest-900/70 border border-forest-700/70 rounded-2xl p-6 sm:p-8 shadow-xl space-y-6 animate-fade-in">
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-white font-display">Langkah 3: Tarif Sewa &amp; Rekening Penagihan</h2>
              <p className="text-xs text-forest-300 mt-1">
                Atur harga sewa standar per kamar, siklus tagihan, serta rekening bank tujuan pembayaran sewa penyewa.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-forest-300 mb-1">
                  Harga Sewa Standar per Bulan (Rp) <span className="text-rose-400">*</span>
                </label>
                <input
                  type="number"
                  min={100000}
                  step={50000}
                  value={defaultRentPrice}
                  onChange={(e) => setDefaultRentPrice(Number(e.target.value))}
                  className="w-full bg-forest-950 border border-forest-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-gold-500"
                />
                <span className="text-[11px] text-gold-400 mt-1 block">
                  {formatRupiah(defaultRentPrice)} / bulan
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-forest-300 mb-1">
                  Siklus Penagihan Default
                </label>
                <select
                  value={billingCycle}
                  onChange={(e) => setBillingCycle(e.target.value)}
                  className="w-full bg-forest-950 border border-forest-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-gold-500"
                >
                  <option value="monthly">Bulanan (Setiap Bulan)</option>
                  <option value="quarterly">3 Bulanan (Per Triwulan)</option>
                  <option value="biannual">6 Bulanan (Per Semester)</option>
                  <option value="annual">Tahunan (Per Tahun)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-forest-300 mb-1">
                  Tanggal Jatuh Tempo Penagihan
                </label>
                <select
                  value={dueDay}
                  onChange={(e) => setDueDay(Number(e.target.value))}
                  className="w-full bg-forest-950 border border-forest-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-gold-500"
                >
                  {[1, 5, 10, 15, 20, 25, 28].map((d) => (
                    <option key={d} value={d}>
                      Tanggal {d} setiap bulan
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-forest-300 mb-1">
                  Nama Bank Penerima
                </label>
                <input
                  type="text"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder="Contoh: BCA / Mandiri / BRI"
                  className="w-full bg-forest-950 border border-forest-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-gold-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-forest-300 mb-1">
                  Nomor Rekening Bank
                </label>
                <input
                  type="text"
                  value={bankAccountNo}
                  onChange={(e) => setBankAccountNo(e.target.value)}
                  placeholder="Contoh: 8830123456"
                  className="w-full bg-forest-950 border border-forest-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-gold-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-forest-300 mb-1">
                  Atas Nama Pemilik Rekening
                </label>
                <input
                  type="text"
                  value={bankAccountHolder}
                  onChange={(e) => setBankAccountHolder(e.target.value)}
                  placeholder="Contoh: Pengelola Kos Melati"
                  className="w-full bg-forest-950 border border-forest-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-gold-500"
                />
              </div>
            </div>

            {/* Biaya Tambahan Opsional */}
            <div className="pt-4 border-t border-forest-800 space-y-3">
              <span className="text-xs font-bold text-forest-300 uppercase tracking-wider block">
                Biaya Tambahan Tambahan (Opsional)
              </span>
              <div className="flex flex-col sm:flex-row items-center gap-2">
                <input
                  type="text"
                  value={newFeeName}
                  onChange={(e) => setNewFeeName(e.target.value)}
                  placeholder="Nama biaya (misal: Parkir Mobil, Laundry)"
                  className="flex-1 bg-forest-950 border border-forest-700 rounded-xl px-3 py-2 text-xs text-white"
                />
                <input
                  type="number"
                  value={newFeeAmount}
                  onChange={(e) => setNewFeeAmount(e.target.value)}
                  placeholder="Nominal (Rp)"
                  className="w-full sm:w-36 bg-forest-950 border border-forest-700 rounded-xl px-3 py-2 text-xs text-white"
                />
                <button
                  type="button"
                  onClick={handleAddFee}
                  className="w-full sm:w-auto px-4 py-2 rounded-xl bg-forest-800 hover:bg-forest-700 text-xs font-bold text-white border border-forest-700"
                >
                  Tambah Biaya
                </button>
              </div>

              {additionalFees.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                  {additionalFees.map((f) => (
                    <div
                      key={f.id}
                      className="p-2.5 rounded-xl bg-forest-950 border border-forest-800 flex items-center justify-between text-xs"
                    >
                      <span className="text-white font-medium">{f.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-gold-300 font-bold">{formatRupiah(f.amount)}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveFee(f.id)}
                          className="text-rose-400 hover:text-rose-300"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-4 flex justify-between">
              <button
                type="button"
                onClick={() => setCurrentStep(2)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-forest-800 hover:bg-forest-700 text-forest-300 hover:text-white text-xs font-semibold transition-all"
              >
                <AiOutlineArrowLeft />
                <span>Kembali</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!defaultRentPrice || defaultRentPrice <= 0) {
                    toast.error('Tarif sewa bulanan harus lebih dari Rp 0.');
                    return;
                  }
                  setCurrentStep(4);
                }}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gold-500 hover:bg-gold-400 text-forest-950 text-xs font-bold transition-all shadow-md"
              >
                <span>Lanjut ke Review</span>
                <AiOutlineArrowRight />
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: Review & Selesai */}
        {currentStep === 4 && (
          <div className="bg-forest-900/70 border border-forest-700/70 rounded-2xl p-6 sm:p-8 shadow-xl space-y-6 animate-fade-in">
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-white font-display">Langkah 4: Tinjau &amp; Aktifkan Kos</h2>
              <p className="text-xs text-forest-300 mt-1">
                Periksa kembali data properti sebelum disimpan ke sistem SaaS RuangWarga.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Ringkasan Properti */}
              <div className="p-4 bg-forest-950/80 rounded-2xl border border-forest-800 space-y-2">
                <span className="text-[11px] font-bold text-gold-400 uppercase tracking-wider block">
                  Identitas Properti
                </span>
                <div>
                  <span className="text-xs text-forest-400 block">Nama Kos:</span>
                  <strong className="text-sm text-white">{kosName}</strong>
                </div>
                <div>
                  <span className="text-xs text-forest-400 block">Alamat:</span>
                  <span className="text-xs text-forest-200">{address || '-'}</span>
                </div>
                <div>
                  <span className="text-xs text-forest-400 block">Kontak WhatsApp:</span>
                  <span className="text-xs text-forest-200">{contactPhone || '-'}</span>
                </div>
              </div>

              {/* Ringkasan Tarif & Rekening */}
              <div className="p-4 bg-forest-950/80 rounded-2xl border border-forest-800 space-y-2">
                <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider block">
                  Ketentuan Sewa &amp; Rekening
                </span>
                <div>
                  <span className="text-xs text-forest-400 block">Tarif Sewa Standar:</span>
                  <strong className="text-sm text-gold-300">{formatRupiah(defaultRentPrice)} / bulan</strong>
                </div>
                <div>
                  <span className="text-xs text-forest-400 block">Siklus &amp; Jatuh Tempo:</span>
                  <span className="text-xs text-forest-200 capitalize">
                    {billingCycle} &bull; Setiap tanggal {dueDay}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-forest-400 block">Rekening Bank:</span>
                  <span className="text-xs text-forest-200">
                    {bankName} {bankAccountNo} a.n {bankAccountHolder || '-'}
                  </span>
                </div>
              </div>
            </div>

            {/* Ringkasan Kamar Siap Disewa */}
            <div className="p-4 bg-forest-950/80 rounded-2xl border border-forest-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-forest-300 uppercase tracking-wider">
                  Kamar Siap Disewa ({roomList.length} Kamar)
                </span>
                <span className="text-[10px] text-emerald-300 bg-emerald-500/20 px-2 py-0.5 rounded-full border border-emerald-500/30 font-bold">
                  Status: Vacant
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {roomList.map((r) => (
                  <span
                    key={r.id}
                    className="px-2.5 py-1 rounded-lg bg-forest-900 border border-forest-700 text-xs font-medium text-forest-200"
                  >
                    {r.label}
                  </span>
                ))}
              </div>
            </div>

            <div className="pt-4 flex justify-between">
              <button
                type="button"
                onClick={() => setCurrentStep(3)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-forest-800 hover:bg-forest-700 text-forest-300 hover:text-white text-xs font-semibold transition-all"
              >
                <AiOutlineArrowLeft />
                <span>Kembali</span>
              </button>
              <button
                type="button"
                onClick={handleSaveSetup}
                disabled={saving}
                className="inline-flex items-center gap-2 px-8 py-3 rounded-xl bg-gradient-to-r from-gold-500 to-gold-400 hover:from-gold-400 hover:to-gold-300 text-forest-950 text-xs font-extrabold transition-all shadow-lg disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-forest-950 border-t-transparent rounded-full animate-spin" />
                    <span>Menyimpan Konfigurasi...</span>
                  </>
                ) : (
                  <>
                    <AiOutlineCheckCircle className="text-base" />
                    <span>Simpan &amp; Aktifkan Kos</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
