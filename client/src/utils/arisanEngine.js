/**
 * Modul Engine Logika Pengocokan dan Siklus Arisan (Spec §5, FR-18)
 * Menyediakan fungsi murni untuk pemfilteran kandidat, pemilihan pemenang acak,
 * eksekusi undian putaran, dan reset siklus arisan.
 */

/**
 * Memfilter peserta yang berhak mengikuti undian pada siklus berjalan (has_won = false)
 * @param {Array} participants - Daftar peserta arisan
 * @returns {Array} Daftar peserta yang belum pernah menang
 */
export function filterEligibleCandidates(participants = []) {
  if (!Array.isArray(participants)) return [];
  return participants.filter(
    (p) => !p.has_won && (p.status ? p.status === 'approved' : true)
  );
}

/**
 * Memilih satu pemenang secara acak dari daftar kandidat yang berhak
 * @param {Array} candidates - Daftar kandidat berhak undi
 * @param {Function} randomFn - Fungsi generator acak (default: Math.random)
 * @returns {Object} Kandidat pemenang terpilih
 */
export function selectRandomWinner(candidates = [], randomFn = Math.random) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new Error('Tidak ada kandidat peserta yang tersisa untuk diundi dalam siklus ini.');
  }

  const randomIndex = Math.floor(randomFn() * candidates.length);
  // Proteksi bounds jika randomFn mengembalikan 1
  const safeIndex = Math.min(randomIndex, candidates.length - 1);
  return candidates[safeIndex];
}

/**
 * Memeriksa apakah seluruh tagihan iuran putaran telah lunas
 * @param {Array} bills - Daftar tagihan putaran arisan
 * @returns {Object} Ringkasan kelunasan tagihan
 */
export function validateRoundBillReadiness(bills = []) {
  if (!Array.isArray(bills) || bills.length === 0) {
    return { isReady: false, total: 0, paidCount: 0, unpaidCount: 0, reason: 'NO_BILLS' };
  }

  const total = bills.length;
  const paidCount = bills.filter((b) => b.status === 'paid').length;
  const unpaidCount = total - paidCount;
  const isReady = unpaidCount === 0;

  return {
    isReady,
    total,
    paidCount,
    unpaidCount,
    reason: isReady ? 'READY' : 'UNPAID_BILLS',
  };
}

/**
 * Menjalankan simulasi/eksekusi pengundian satu putaran arisan secara murni
 * @param {Object} params
 * @param {Object} params.round - Data putaran arisan
 * @param {Array} params.participants - Seluruh peserta arisan
 * @param {Array} params.bills - Tagihan iuran untuk putaran ini
 * @param {Function} params.randomFn - Generator acak opsional
 * @returns {Object} Hasil pengundian putaran
 */
export function executeRoundDraw({ round, participants = [], bills = [], randomFn = Math.random }) {
  if (!round) {
    throw new Error('Data putaran arisan wajib disertakan.');
  }

  if (round.status === 'drawn') {
    throw new Error('Putaran ini sudah pernah diundi sebelumnya.');
  }

  // 1. Validasi tagihan iuran jika ada tagihan
  if (bills.length > 0) {
    const billCheck = validateRoundBillReadiness(bills);
    if (!billCheck.isReady) {
      throw new Error(`Pengocokan ditolak: Masih terdapat ${billCheck.unpaidCount} peserta yang belum melunasi iuran.`);
    }
  }

  // 2. Filter kandidat yang belum pernah menang (has_won = false)
  const eligibleCandidates = filterEligibleCandidates(participants);
  if (eligibleCandidates.length === 0) {
    throw new Error('Seluruh peserta arisan telah menang pada siklus ini. Silakan mulai siklus baru.');
  }

  // 3. Pilih acak 1 pemenang
  const winner = selectRandomWinner(eligibleCandidates, randomFn);

  // 4. Perbarui status peserta (has_won = true)
  const updatedParticipants = participants.map((p) => {
    const pId = p.member_id || p.id;
    const wId = winner.member_id || winner.id;
    if (pId === wId) {
      return {
        ...p,
        has_won: true,
        won_at_round_id: round.id,
        won_at: new Date().toISOString(),
      };
    }
    return p;
  });

  // 5. Hitung sisa kandidat setelah pemenang terpilih
  const remainingCandidates = updatedParticipants.filter((p) => !p.has_won);
  const isCycleCompleted = remainingCandidates.length === 0;

  // 6. Perbarui data putaran
  const updatedRound = {
    ...round,
    status: 'drawn',
    winner_member_id: winner.member_id || winner.id,
    winner: winner,
    drawn_at: new Date().toISOString(),
  };

  return {
    success: true,
    round: updatedRound,
    winner,
    updatedParticipants,
    remainingCandidatesCount: remainingCandidates.length,
    isCycleCompleted,
  };
}

/**
 * Mereset siklus arisan untuk memulai putaran baru (Mulai Siklus Baru)
 * @param {Array} participants - Daftar peserta arisan
 * @param {number} currentCycle - Nomor siklus saat ini
 * @param {boolean} force - Apakah memaksa reset meski belum semua menang
 * @returns {Object} Metadata siklus baru dan peserta yang direset
 */
export function resetArisanCycle(participants = [], currentCycle = 1, force = false) {
  if (!Array.isArray(participants) || participants.length === 0) {
    throw new Error('Daftar peserta tidak boleh kosong.');
  }

  const remainingCandidates = participants.filter((p) => !p.has_won);
  if (!force && remainingCandidates.length > 0) {
    throw new Error(
      `Siklus belum selesai. Masih terdapat ${remainingCandidates.length} peserta yang belum mendapatkan giliran menang.`
    );
  }

  const resetParticipants = participants.map((p) => ({
    ...p,
    has_won: false,
    won_at_round_id: null,
    won_at: null,
  }));

  return {
    success: true,
    newCycle: currentCycle + 1,
    totalParticipantsReset: resetParticipants.length,
    participants: resetParticipants,
    resetAt: new Date().toISOString(),
  };
}
