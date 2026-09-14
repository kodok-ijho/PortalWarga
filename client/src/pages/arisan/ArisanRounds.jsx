import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  AiOutlinePlus,
  AiOutlineTrophy,
  AiOutlineCalendar,
  AiOutlineCheckCircle,
  AiOutlineClockCircle,
  AiOutlineUser,
  AiOutlineArrowRight,
  AiOutlineDollarCircle,
  AiOutlineTeam,
  AiOutlineReload,
  AiOutlineFilter,
  AiOutlineInfoCircle,
  AiOutlineWarning,
} from 'react-icons/ai';
import { useTenant } from '../../hooks/useTenant';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { useSubscriptionGate } from '../../hooks/useSubscriptionGate';
import {
  fetchArisanRounds,
  createArisanRound,
  fetchArisanParticipants,
  generateArisanRoundBills,
  fetchArisanRoundBills,
  payArisanBillManual,
  startNewArisanCycle,
} from '../../services/tenantOperationalService';
import { formatRupiah } from '../../services/dataHelpers';
import Modal from '../../components/Modal';

const STATUS_BADGES = {
  collecting: {
    label: 'Pengumpulan Iuran',
    color: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    icon: AiOutlineClockCircle,
  },
  ready_to_draw: {
    label: 'Siap Dikocok',
    color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    icon: AiOutlineCheckCircle,
  },
  drawn: {
    label: 'Pemenang Terpilih',
    color: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
    icon: AiOutlineTrophy,
  },
  cancelled: {
    label: 'Dibatalkan',
    color: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
    icon: AiOutlineWarning,
  },
};

export default function ArisanRounds() {
  const { tenantId: routeTenantId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const { activeTenant, activeTenantId, isTenantAdmin } = useTenant();
  const { isReadOnly, bannerText } = useSubscriptionGate();

  const tenantId = routeTenantId || activeTenantId;

  const [rounds, setRounds] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');

  // Modal Tambah Putaran
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newRoundPeriod, setNewRoundPeriod] = useState('');
  const [newRoundPool, setNewRoundPool] = useState('');
  const [newRoundNotes, setNewRoundNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Modal Rincian Iuran Peserta Putaran
  const [selectedRoundForBills, setSelectedRoundForBills] = useState(null);
  const [roundBills, setRoundBills] = useState([]);
  const [loadingRoundBills, setLoadingRoundBills] = useState(false);
  const [generatingBills, setGeneratingBills] = useState(false);
  const [markingPaidId, setMarkingPaidId] = useState(null);
  const [isResetCycleModalOpen, setIsResetCycleModalOpen] = useState(false);
  const [resettingCycle, setResettingCycle] = useState(false);

  // Load Data Putaran & Peserta
  const loadData = async () => {
    if (!tenantId) return;
    try {
      setLoading(true);
      const [roundsData, participantsData] = await Promise.all([
        fetchArisanRounds(tenantId),
        fetchArisanParticipants(tenantId),
      ]);
      setRounds(roundsData || []);
      setParticipants(participantsData || []);
    } catch (err) {
      console.error('[ArisanRounds] Gagal memuat data arisan:', err);
      toast.error('Gagal memuat daftar putaran arisan.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [tenantId]);

  // Nomor putaran berikutnya
  const nextRoundNumber = useMemo(() => {
    if (!rounds.length) return 1;
    const maxNumber = Math.max(...rounds.map((r) => r.round_number || 0));
    return maxNumber + 1;
  }, [rounds]);

  // Default target pool dari settings arisan
  const defaultPrizeAmount = useMemo(() => {
    return (
      activeTenant?.settings?.total_prize_per_round ||
      (activeTenant?.settings?.slot_count || 10) *
        (activeTenant?.settings?.contribution_amount || 300000)
    );
  }, [activeTenant]);

  // Statistik Cepat
  const stats = useMemo(() => {
    const totalRounds = rounds.length;
    const drawnCount = rounds.filter((r) => r.status === 'drawn').length;
    const activeRound = rounds.find(
      (r) => r.status === 'collecting' || r.status === 'ready_to_draw'
    );
    const totalWinners = participants.filter((p) => p.has_won).length;
    const totalParticipants = participants.length;

    return {
      totalRounds,
      drawnCount,
      activeRound,
      totalWinners,
      totalParticipants,
    };
  }, [rounds, participants]);

  // Filter putaran
  const filteredRounds = useMemo(() => {
    if (filterStatus === 'all') return rounds;
    return rounds.filter((r) => r.status === filterStatus);
  }, [rounds, filterStatus]);

  // Buka Modal Buat Putaran
  const handleOpenCreateModal = () => {
    if (isReadOnly) {
      toast.error('Layanan dalam status Read-Only. Perpanjang langganan untuk menambah putaran.');
      return;
    }
    const defaultPeriodName = `Putaran #${nextRoundNumber}`;
    setNewRoundPeriod(defaultPeriodName);
    setNewRoundPool(defaultPrizeAmount);
    setNewRoundNotes('');
    setIsCreateModalOpen(true);
  };

  // Submit Buat Putaran
  const handleCreateRound = async (e) => {
    e.preventDefault();
    if (!newRoundPeriod.trim()) {
      toast.error('Nama periode putaran wajib diisi.');
      return;
    }

    try {
      setSubmitting(true);
      await createArisanRound(tenantId, {
        round_number: nextRoundNumber,
        period: newRoundPeriod.trim(),
        total_pool_amount: parseFloat(newRoundPool) || defaultPrizeAmount,
        notes: newRoundNotes.trim(),
        status: 'collecting',
      });

      toast.success(`Putaran #${nextRoundNumber} berhasil dibuat!`);
      setIsCreateModalOpen(false);
      await loadData();
    } catch (err) {
      console.error('[ArisanRounds] Gagal membuat putaran:', err);
      toast.error(err.message || 'Gagal membuat putaran baru.');
    } finally {
      setSubmitting(false);
    }
  };

  // Buka rincian iuran peserta
  const handleOpenRoundBills = async (round) => {
    setSelectedRoundForBills(round);
    setLoadingRoundBills(true);
    try {
      const bills = await fetchArisanRoundBills(tenantId, round.id, round.period);
      setRoundBills(bills || []);
    } catch (err) {
      console.error('[ArisanRounds] Gagal memuat tagihan peserta:', err);
      toast.error('Gagal memuat rincian iuran peserta.');
    } finally {
      setLoadingRoundBills(false);
    }
  };

  // Terbitkan tagihan iuran serentak untuk putaran
  const handleGenerateBills = async (round) => {
    if (isReadOnly) {
      toast.error('Layanan dalam status Read-Only.');
      return;
    }
    setGeneratingBills(true);
    try {
      const res = await generateArisanRoundBills(tenantId, round.id);
      toast.success(
        `Iuran diterbitkan untuk ${res.total_generated} peserta (${res.total_skipped} sudah memiliki tagihan).`
      );
      await loadData();
      if (selectedRoundForBills?.id === round.id) {
        await handleOpenRoundBills(round);
      }
    } catch (err) {
      console.error('[ArisanRounds] Gagal menerbitkan tagihan:', err);
      toast.error(err.message || 'Gagal menerbitkan tagihan iuran.');
    } finally {
      setGeneratingBills(false);
    }
  };

  // Tandai iuran lunas secara manual oleh admin
  const handleMarkPaid = async (billId) => {
    if (isReadOnly) {
      toast.error('Layanan dalam status Read-Only.');
      return;
    }
    setMarkingPaidId(billId);
    try {
      await payArisanBillManual(tenantId, billId);
      toast.success('Iuran peserta berhasil ditandai lunas!');
      if (selectedRoundForBills) {
        await handleOpenRoundBills(selectedRoundForBills);
      }
      await loadData();
    } catch (err) {
      console.error('[ArisanRounds] Gagal verifikasi pembayaran:', err);
      toast.error(err.message || 'Gagal memperbarui status pembayaran.');
    } finally {
      setMarkingPaidId(null);
    }
  };

  // Handler Mulai Siklus Baru
  const handleConfirmResetCycle = async (force = false) => {
    if (isReadOnly) {
      toast.warning(bannerText || 'Fitur dinonaktifkan dalam status langganan read-only.');
      return;
    }
    if (!isTenantAdmin) {
      toast.error('Hanya Admin Arisan yang berwenang memulai siklus baru.');
      return;
    }

    try {
      setResettingCycle(true);
      const res = await startNewArisanCycle(tenantId, user?.id, force);
      toast.success(`Siklus baru #${res.new_cycle || ''} berhasil dimulai! Status seluruh peserta telah direset.`);
      setIsResetCycleModalOpen(false);
      await loadData();
    } catch (err) {
      console.error('[ArisanRounds] Gagal memulai siklus baru:', err);
      toast.error(err.message || 'Gagal memulai siklus arisan baru.');
    } finally {
      setResettingCycle(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#071f13] text-white py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Banner Langganan Read-Only jika aktif */}
        {isReadOnly && (
          <div className="p-4 bg-rose-500/20 border border-rose-500/40 rounded-2xl flex items-center justify-between gap-3 text-xs text-rose-200">
            <div className="flex items-center gap-2">
              <AiOutlineWarning className="text-base text-rose-400 flex-shrink-0" />
              <span>{bannerText || 'Layanan dalam mode Read-Only. Fitur pembuatan putaran dan pengocokan dibatasi.'}</span>
            </div>
            <button
              type="button"
              onClick={() => navigate('/account/subscription')}
              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-[11px] whitespace-nowrap"
            >
              Perpanjang
            </button>
          </div>
        )}

        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-forest-800">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-2xl">🎲</span>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white font-display">
                Putaran & Pengocokan Arisan
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-forest-300">
              Pantau jadwal putaran, progres pengumpulan iuran peserta, dan riwayat pemenang secara transparan.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={loadData}
              className="p-2.5 rounded-xl bg-forest-900 hover:bg-forest-800 text-forest-300 hover:text-white border border-forest-700 transition-colors"
              title="Segarkan Data"
            >
              <AiOutlineReload className={loading ? 'animate-spin' : ''} />
            </button>

            {isTenantAdmin && (
              <>
                <button
                  type="button"
                  disabled={isReadOnly}
                  onClick={() => setIsResetCycleModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-purple-900/60 hover:bg-purple-800 text-purple-200 hover:text-white border border-purple-700/60 font-semibold text-xs transition-colors disabled:opacity-50"
                  title="Mulai Siklus Baru Arisan (Reset Peserta)"
                >
                  <AiOutlineReload />
                  <span className="hidden sm:inline">Siklus Baru</span>
                </button>

                <button
                  type="button"
                  disabled={isReadOnly}
                  onClick={handleOpenCreateModal}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-amber-500 hover:from-purple-500 hover:to-amber-400 text-white font-bold text-xs shadow-lg shadow-purple-950/40 transition-all hover:scale-105 disabled:opacity-50 disabled:pointer-events-none"
                >
                  <AiOutlinePlus />
                  <span>+ Buat Putaran Baru</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Banner Siklus Arisan Lengkap */}
        {participants.length > 0 && stats.totalWinners >= stats.totalParticipants && (
          <div className="p-4 rounded-2xl bg-gradient-to-r from-purple-950/90 via-amber-950/40 to-forest-900/90 border border-gold-500/50 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center justify-center text-xl shrink-0">
                🏆
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">
                  Siklus Putaran Arisan Telah Selesai 100%!
                </h4>
                <p className="text-xs text-forest-300">
                  Seluruh peserta ({stats.totalParticipants} slot) telah memenangkan undian. Pengurus dapat memulai siklus baru.
                </p>
              </div>
            </div>

            {isTenantAdmin && (
              <button
                type="button"
                disabled={isReadOnly}
                onClick={() => setIsResetCycleModalOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-amber-500 hover:from-purple-500 hover:to-amber-400 text-white font-bold text-xs rounded-xl shadow-lg shrink-0 transition-all hover:scale-105 disabled:opacity-50"
              >
                <AiOutlineReload />
                <span>Mulai Siklus Baru</span>
              </button>
            )}
          </div>
        )}

        {/* 4 Kartu Metrik Ringkasan */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Putaran Aktif */}
          <div className="p-4 bg-forest-900/60 border border-forest-800 rounded-2xl flex items-center gap-3 shadow-lg">
            <div className="w-11 h-11 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center justify-center text-xl">
              <AiOutlineCalendar />
            </div>
            <div>
              <span className="text-[10px] text-forest-400 uppercase font-bold block">
                Putaran Berjalan
              </span>
              <span className="text-base sm:text-lg font-bold text-white font-display">
                {stats.activeRound ? `Putaran #${stats.activeRound.round_number}` : 'Semua Selesai'}
              </span>
            </div>
          </div>

          {/* Card 2: Status Pengocokan */}
          <div className="p-4 bg-forest-900/60 border border-forest-800 rounded-2xl flex items-center gap-3 shadow-lg">
            <div className="w-11 h-11 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/40 flex items-center justify-center text-xl">
              <AiOutlineTrophy />
            </div>
            <div>
              <span className="text-[10px] text-forest-400 uppercase font-bold block">
                Pemenang Terpilih
              </span>
              <span className="text-base sm:text-lg font-bold text-white font-display">
                {stats.drawnCount} Putaran
              </span>
            </div>
          </div>

          {/* Card 3: Progres Siklus Peserta */}
          <div className="p-4 bg-forest-900/60 border border-forest-800 rounded-2xl flex items-center gap-3 shadow-lg">
            <div className="w-11 h-11 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center text-xl">
              <AiOutlineTeam />
            </div>
            <div>
              <span className="text-[10px] text-forest-400 uppercase font-bold block">
                Giliran Pemenang
              </span>
              <span className="text-base sm:text-lg font-bold text-white font-display">
                {stats.totalWinners} / {stats.totalParticipants || activeTenant?.settings?.slot_count || 0} Slot
              </span>
            </div>
          </div>

          {/* Card 4: Total Hadiah per Putaran */}
          <div className="p-4 bg-forest-900/60 border border-forest-800 rounded-2xl flex items-center gap-3 shadow-lg">
            <div className="w-11 h-11 rounded-xl bg-gold-500/20 text-gold-400 border border-gold-500/40 flex items-center justify-center text-xl">
              <AiOutlineDollarCircle />
            </div>
            <div>
              <span className="text-[10px] text-forest-400 uppercase font-bold block">
                Total Hadiah / Putaran
              </span>
              <span className="text-base sm:text-lg font-bold text-amber-300 font-display">
                {formatRupiah(defaultPrizeAmount)}
              </span>
            </div>
          </div>
        </div>

        {/* Filter Status Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          {[
            { id: 'all', label: 'Semua Putaran' },
            { id: 'collecting', label: 'Pengumpulan Iuran' },
            { id: 'ready_to_draw', label: 'Siap Dikocok' },
            { id: 'drawn', label: 'Sudah Dikocok' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilterStatus(tab.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${
                filterStatus === tab.id
                  ? 'bg-purple-600/30 border-purple-400 text-purple-200 shadow'
                  : 'bg-forest-900/60 border-forest-800 text-forest-400 hover:text-forest-200 hover:border-forest-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Loading State */}
        {loading && (
          <div className="py-20 text-center">
            <div className="h-8 w-8 rounded-full border-2 border-forest-700 border-t-purple-500 animate-spin mx-auto mb-3" />
            <span className="text-xs text-forest-400">Memuat putaran arisan...</span>
          </div>
        )}

        {/* Empty State */}
        {!loading && filteredRounds.length === 0 && (
          <div className="p-10 bg-forest-900/40 border border-forest-800 rounded-3xl text-center max-w-md mx-auto space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-forest-800 text-forest-400 flex items-center justify-center text-3xl mx-auto">
              🎲
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Belum Ada Putaran Arisan</h3>
              <p className="text-xs text-forest-300 mt-1">
                {filterStatus === 'all'
                  ? 'Grup arisan belum memiliki putaran aktif. Buat putaran pertama untuk memulai pengumpulan iuran.'
                  : `Tidak ada putaran dengan status "${filterStatus}".`}
              </p>
            </div>
            {isTenantAdmin && (
              <button
                type="button"
                disabled={isReadOnly}
                onClick={handleOpenCreateModal}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow transition-colors"
              >
                <AiOutlinePlus />
                <span>Buat Putaran Pertama</span>
              </button>
            )}
          </div>
        )}

        {/* Grid Daftar Putaran */}
        {!loading && filteredRounds.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredRounds.map((round) => {
              const badge = STATUS_BADGES[round.status] || STATUS_BADGES.collecting;
              const StatusIcon = badge.icon;
              const isDrawn = round.status === 'drawn';
              const isReadyToDraw = round.status === 'ready_to_draw';

              return (
                <div
                  key={round.id}
                  className={`p-5 rounded-2xl border transition-all flex flex-col justify-between ${
                    isDrawn
                      ? 'bg-forest-900/50 border-forest-800/80 hover:border-purple-500/30'
                      : isReadyToDraw
                      ? 'bg-emerald-950/20 border-emerald-500/50 shadow-lg shadow-emerald-950/30'
                      : 'bg-forest-900/70 border-forest-700 hover:border-forest-600'
                  }`}
                >
                  <div className="space-y-4">
                    {/* Top Row: Round Number, Status Badge */}
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-1 rounded-lg bg-forest-950 border border-forest-700 text-purple-300 font-mono text-xs font-bold">
                          Putaran #{round.round_number}
                        </span>
                        <h3 className="text-sm font-bold text-white truncate">{round.period}</h3>
                      </div>

                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${badge.color}`}
                      >
                        <StatusIcon className="text-xs" />
                        <span>{badge.label}</span>
                      </span>
                    </div>

                    {/* Total Hadiah / Kas */}
                    <div className="p-3 bg-forest-950/70 rounded-xl border border-forest-800/80 flex items-center justify-between">
                      <div>
                        <span className="text-[10px] text-forest-400 block uppercase font-semibold">
                          Total Hadiah Putaran
                        </span>
                        <span className="text-sm sm:text-base font-extrabold text-amber-300">
                          {formatRupiah(round.total_pool_amount)}
                        </span>
                      </div>

                      {round.notes && (
                        <div className="text-right max-w-[50%]">
                          <span className="text-[10px] text-forest-400 block uppercase font-semibold">
                            Catatan
                          </span>
                          <span className="text-xs text-forest-300 truncate block">
                            {round.notes}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Rincian Pemenang jika status Drawn */}
                    {isDrawn && (
                      <div className="p-3 bg-purple-950/30 rounded-xl border border-purple-800/50 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center justify-center text-sm">
                            🏆
                          </div>
                          <div>
                            <span className="text-[10px] text-purple-300 block font-bold uppercase">
                              Pemenang Terpilih
                            </span>
                            <span className="text-xs font-bold text-white">
                              {round.winner?.full_name || 'Anggota Arisan'}
                            </span>
                          </div>
                        </div>

                        {round.drawn_at && (
                          <div className="text-right text-[11px] text-forest-400">
                            <span>Dikocok pada: </span>
                            <span className="font-semibold text-forest-200">
                              {new Date(round.drawn_at).toLocaleDateString('id-ID', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Tombol Aksi Bawah */}
                  <div className="pt-4 mt-4 border-t border-forest-800/80 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpenRoundBills(round)}
                        className="px-3 py-2 rounded-xl bg-forest-950 hover:bg-forest-800 text-purple-300 hover:text-white text-xs font-semibold border border-forest-800 transition-colors flex items-center gap-1.5"
                      >
                        <AiOutlineTeam />
                        <span>Iuran Peserta</span>
                      </button>

                      {isTenantAdmin && round.status === 'collecting' && (
                        <button
                          type="button"
                          disabled={generatingBills || isReadOnly}
                          onClick={() => handleGenerateBills(round)}
                          className="px-3 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-semibold border border-amber-500/40 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                          title="Terbitkan tagihan iuran untuk seluruh peserta yang belum memiliki tagihan pada putaran ini"
                        >
                          <span>⚡ Terbitkan Iuran</span>
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {isReadyToDraw && isTenantAdmin && (
                        <button
                          type="button"
                          disabled={isReadOnly}
                          onClick={() => navigate(`/t/${tenantId}/arisan/draw?roundId=${round.id}`)}
                          className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow flex items-center gap-1.5 animate-pulse disabled:opacity-50"
                        >
                          <span>🎲 Kocok Sekarang</span>
                          <AiOutlineArrowRight />
                        </button>
                      )}

                      {isReadyToDraw && !isTenantAdmin && (
                        <button
                          type="button"
                          onClick={() => navigate(`/t/${tenantId}/arisan/draw?roundId=${round.id}`)}
                          className="px-3.5 py-2 rounded-xl bg-emerald-700/80 hover:bg-emerald-600 text-white text-xs font-bold transition-colors flex items-center gap-1.5"
                        >
                          <span>🎲 Ruang Kocok</span>
                          <AiOutlineArrowRight />
                        </button>
                      )}

                      {round.status === 'collecting' && (
                        <button
                          type="button"
                          onClick={() => navigate(`/t/${tenantId}/arisan/draw?roundId=${round.id}`)}
                          className="px-3.5 py-2 rounded-xl bg-purple-700 hover:bg-purple-600 text-white text-xs font-bold transition-colors flex items-center gap-1.5"
                        >
                          <span>Ruang Kocok</span>
                          <AiOutlineArrowRight />
                        </button>
                      )}

                      {isDrawn && (
                        <button
                          type="button"
                          onClick={() => navigate(`/t/${tenantId}/arisan/draw?roundId=${round.id}`)}
                          className="px-3.5 py-2 rounded-xl bg-amber-600/30 hover:bg-amber-600/50 text-amber-300 hover:text-white border border-amber-500/40 text-xs font-bold transition-colors flex items-center gap-1.5"
                        >
                          <span>🏆 Hasil Undian</span>
                          <AiOutlineArrowRight />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Modal Buat Putaran Baru */}
        <Modal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          title={`Buat Putaran #${nextRoundNumber}`}
        >
          <form onSubmit={handleCreateRound} className="space-y-4 text-xs">
            <div className="space-y-1">
              <label className="font-bold text-forest-200 block">Nama / Periode Putaran</label>
              <input
                type="text"
                required
                value={newRoundPeriod}
                onChange={(e) => setNewRoundPeriod(e.target.value)}
                placeholder="Contoh: Putaran 2 - November 2026"
                className="w-full bg-forest-950 border border-forest-700 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-purple-400"
              />
            </div>

            <div className="space-y-1">
              <label className="font-bold text-forest-200 block">Total Hadiah Putaran (Target Kas)</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-forest-400 font-bold">
                  Rp
                </span>
                <input
                  type="number"
                  required
                  min={10000}
                  step={50000}
                  value={newRoundPool}
                  onChange={(e) => setNewRoundPool(e.target.value)}
                  className="w-full bg-forest-950 border border-forest-700 rounded-xl pl-9 pr-3 py-2.5 text-xs text-white font-bold focus:outline-none focus:border-purple-400"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="font-bold text-forest-200 block">Catatan Tambahan (Opsional)</label>
              <textarea
                rows={2}
                value={newRoundNotes}
                onChange={(e) => setNewRoundNotes(e.target.value)}
                placeholder="Catatan jadwal kumpul arisan atau lokasi pertemuan..."
                className="w-full bg-forest-950 border border-forest-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-400"
              />
            </div>

            <div className="pt-3 border-t border-forest-800 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-forest-800 hover:bg-forest-700 text-forest-200 font-bold text-xs"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow transition-colors disabled:opacity-50"
              >
                {submitting ? 'Menyimpan...' : 'Simpan Putaran'}
              </button>
            </div>
          </form>
        </Modal>

        {/* Modal Rincian Iuran Peserta Putaran */}
        <Modal
          isOpen={!!selectedRoundForBills}
          onClose={() => setSelectedRoundForBills(null)}
          title={`Rincian Iuran — ${selectedRoundForBills?.period || ''}`}
        >
          <div className="space-y-4 text-xs">
            {/* Header Summary */}
            <div className="p-3 bg-forest-950/80 rounded-xl border border-forest-800 flex items-center justify-between">
              <div>
                <span className="text-forest-400 block text-[10px] uppercase font-bold">
                  Status Pengumpulan Iuran
                </span>
                <span className="text-sm font-bold text-white">
                  {roundBills.filter((b) => b.status === 'paid').length} / {roundBills.length} Peserta Lunas
                </span>
              </div>
              <div className="text-right">
                <span className="text-forest-400 block text-[10px] uppercase font-bold">
                  Target Kas Putaran
                </span>
                <span className="text-sm font-bold text-amber-300">
                  {formatRupiah(selectedRoundForBills?.total_pool_amount)}
                </span>
              </div>
            </div>

            {/* Loading */}
            {loadingRoundBills && (
              <div className="py-8 text-center text-forest-400">
                <div className="h-6 w-6 border-2 border-purple-500 border-t-transparent animate-spin rounded-full mx-auto mb-2" />
                <span>Memuat data iuran peserta...</span>
              </div>
            )}

            {/* Empty Bills (Belum diterbitkan) */}
            {!loadingRoundBills && roundBills.length === 0 && (
              <div className="py-6 text-center space-y-3">
                <p className="text-forest-300">
                  Tagihan iuran untuk putaran ini belum diterbitkan kepada peserta.
                </p>
                {isTenantAdmin && (
                  <button
                    type="button"
                    disabled={generatingBills || isReadOnly}
                    onClick={() => handleGenerateBills(selectedRoundForBills)}
                    className="px-4 py-2 bg-gradient-to-r from-purple-600 to-amber-500 hover:from-purple-500 hover:to-amber-400 text-white font-bold rounded-xl shadow text-xs inline-flex items-center gap-1.5"
                  >
                    <span>⚡ Terbitkan Tagihan Iuran Sekarang</span>
                  </button>
                )}
              </div>
            )}

            {/* List Tagihan Peserta */}
            {!loadingRoundBills && roundBills.length > 0 && (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {roundBills.map((bill, index) => {
                  const isPaid = bill.status === 'paid';
                  const memberName = bill.tenant_members?.full_name || `Peserta #${index + 1}`;
                  const slotLabel = bill.tenant_units?.label;

                  return (
                    <div
                      key={bill.id}
                      className="p-3 bg-forest-950/70 border border-forest-800 rounded-xl flex items-center justify-between gap-3"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white text-xs">{memberName}</span>
                          {slotLabel && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-purple-950 text-purple-300 rounded border border-purple-800">
                              {slotLabel}
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-forest-400 block mt-0.5">
                          Nominal: {formatRupiah(bill.amount)}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            isPaid
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                              : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                          }`}
                        >
                          {isPaid ? 'Lunas' : 'Belum Bayar'}
                        </span>

                        {!isPaid && isTenantAdmin && (
                          <button
                            type="button"
                            disabled={markingPaidId === bill.id || isReadOnly}
                            onClick={() => handleMarkPaid(bill.id)}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-[10px] transition-colors shadow disabled:opacity-50"
                            title="Tandai pembayaran tunai/transfer telah diterima"
                          >
                            {markingPaidId === bill.id ? 'Memproses...' : 'Tandai Lunas'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Footer Modal */}
            <div className="pt-3 border-t border-forest-800 flex items-center justify-between">
              <span className="text-[11px] text-forest-400">
                Pengocokan siap dilakukan jika seluruh peserta telah lunas.
              </span>
              <button
                type="button"
                onClick={() => setSelectedRoundForBills(null)}
                className="px-4 py-1.5 bg-forest-800 hover:bg-forest-700 text-forest-200 font-bold rounded-xl text-xs"
              >
                Tutup
              </button>
            </div>
          </div>
        </Modal>

        {/* Modal Konfirmasi Mulai Siklus Baru */}
        {isResetCycleModalOpen && (
          <Modal
            isOpen={isResetCycleModalOpen}
            onClose={() => !resettingCycle && setIsResetCycleModalOpen(false)}
            title="🔄 Konfirmasi Mulai Siklus Baru"
            maxWidth="max-w-md"
          >
            <div className="p-4 space-y-4 text-left">
              <div className="p-3.5 bg-purple-950/40 border border-purple-800 rounded-xl text-xs text-purple-200 leading-relaxed">
                <p className="font-semibold text-white mb-1.5">Penjelasan &amp; Dampak Tindakan:</p>
                <ul className="list-disc list-inside space-y-1 text-forest-300">
                  <li>
                    Status kemenangan seluruh peserta (<strong>{participants.length} anggota</strong>) akan direset kembali menjadi <strong>Belum Menang</strong>.
                  </li>
                  <li>Nomor siklus grup arisan akan dinaikkan ke siklus berikutnya.</li>
                  <li>
                    Riwayat putaran dan catatan pemenang sebelumnya <strong>tetap aman tersimpan</strong> untuk arsip dan transparansi.
                  </li>
                </ul>
              </div>

              {stats.totalWinners < stats.totalParticipants && (
                <div className="p-3 bg-amber-500/20 border border-amber-500/40 rounded-xl text-xs text-amber-300 flex items-start gap-2">
                  <AiOutlineWarning className="text-lg shrink-0 mt-0.5" />
                  <span>
                    Masih terdapat <strong>{stats.totalParticipants - stats.totalWinners} peserta</strong> yang belum memenangkan undian pada siklus ini. Reset sekarang akan menjalankan force-reset.
                  </span>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  disabled={resettingCycle}
                  onClick={() => setIsResetCycleModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-forest-900 hover:bg-forest-800 text-forest-300 hover:text-white text-xs font-semibold transition-colors disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={resettingCycle || isReadOnly}
                  onClick={() => handleConfirmResetCycle(stats.totalWinners < stats.totalParticipants)}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-amber-500 hover:from-purple-500 hover:to-amber-400 text-white text-xs font-bold shadow-lg transition-all disabled:opacity-50 flex items-center gap-2"
                >
                  {resettingCycle ? (
                    <>
                      <AiOutlineReload className="animate-spin" />
                      <span>Memproses...</span>
                    </>
                  ) : (
                    <>
                      <span>🔄 Ya, Mulai Siklus Baru</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </Modal>
        )}
      </div>
    </div>
  );
}
