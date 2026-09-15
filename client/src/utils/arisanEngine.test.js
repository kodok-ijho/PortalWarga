import { describe, it, expect } from 'vitest';
import {
  filterEligibleCandidates,
  selectRandomWinner,
  validateRoundBillReadiness,
  executeRoundDraw,
  resetArisanCycle,
} from './arisanEngine';

describe('Arisan Engine - Algoritma Pengocokan & Integritas Siklus (T8.8)', () => {
  // Helper membuat peserta mock
  const createMockParticipants = (count = 10) => {
    return Array.from({ length: count }, (_, i) => ({
      id: `member-${i + 1}`,
      member_id: `member-${i + 1}`,
      full_name: `Peserta Arisan #${i + 1}`,
      slot_label: `Slot #${String(i + 1).padStart(2, '0')}`,
      has_won: false,
      status: 'approved',
    }));
  };

  describe('1. Uji Invarian Utama: Pemenang Tidak Pernah Terpilih Dua Kali Dalam 1 Siklus', () => {
    it('memastikan N putaran untuk N peserta menghasilkan N pemenang yang unik (0 duplikasi)', () => {
      const PARTICIPANTS_COUNT = 10;
      let participants = createMockParticipants(PARTICIPANTS_COUNT);
      const chosenWinners = [];

      for (let roundNum = 1; roundNum <= PARTICIPANTS_COUNT; roundNum++) {
        const round = {
          id: `round-${roundNum}`,
          round_number: roundNum,
          period: `Putaran #${roundNum}`,
          status: 'ready_to_draw',
        };

        const result = executeRoundDraw({
          round,
          participants,
          bills: [], // simulasi tagihan lunas/bebas
        });

        expect(result.success).toBe(true);
        expect(result.winner).toBeDefined();

        // Pastikan pemenang saat ini BELUM PERNAH terpilih di putaran sebelumnya
        const isAlreadyWon = chosenWinners.some((w) => w.id === result.winner.id);
        expect(isAlreadyWon).toBe(false);

        chosenWinners.push(result.winner);
        participants = result.updatedParticipants;

        // Verifikasi sisa kandidat berkurang 1 di setiap putaran
        const remainingCandidates = filterEligibleCandidates(participants);
        expect(remainingCandidates.length).toBe(PARTICIPANTS_COUNT - roundNum);
      }

      // Verifikasi akhir: Tepat 10 pemenang berbeda dari 10 peserta
      expect(chosenWinners.length).toBe(PARTICIPANTS_COUNT);
      const uniqueWinnerIds = new Set(chosenWinners.map((w) => w.id));
      expect(uniqueWinnerIds.size).toBe(PARTICIPANTS_COUNT);
    });
  });

  describe('2. Uji Monte Carlo Skala Besar (1.000 Siklus Penuh / 10.000 Putaran Pengundian)', () => {
    it('menjalankan 1.000 simulasi siklus penuh dengan Math.random dan membuktikan 0% kemungkinan double-winner', () => {
      const TOTAL_SIMULATION_CYCLES = 1000;
      const PARTICIPANTS_PER_CYCLE = 10;
      let totalRoundsDrawn = 0;
      let duplicateWinnerDetections = 0;

      for (let cycle = 1; cycle <= TOTAL_SIMULATION_CYCLES; cycle++) {
        let participants = createMockParticipants(PARTICIPANTS_PER_CYCLE);
        const cycleWinnersSet = new Set();

        for (let r = 1; r <= PARTICIPANTS_PER_CYCLE; r++) {
          const round = {
            id: `sim-c${cycle}-r${r}`,
            round_number: r,
            status: 'ready_to_draw',
          };

          const drawResult = executeRoundDraw({
            round,
            participants,
          });

          const winnerId = drawResult.winner.id;

          // Periksa apakah ID pemenang sudah pernah terpilih dalam siklus ini
          if (cycleWinnersSet.has(winnerId)) {
            duplicateWinnerDetections++;
          }

          cycleWinnersSet.add(winnerId);
          participants = drawResult.updatedParticipants;
          totalRoundsDrawn++;
        }

        // Setiap siklus harus memiliki tepat 10 pemenang unik
        expect(cycleWinnersSet.size).toBe(PARTICIPANTS_PER_CYCLE);
      }

      expect(totalRoundsDrawn).toBe(TOTAL_SIMULATION_CYCLES * PARTICIPANTS_PER_CYCLE); // 10.000 putaran
      expect(duplicateWinnerDetections).toBe(0); // 0 pelanggaran!
    });
  });

  describe('3. Uji Penolakan Pengundian Saat Siklus Selesai (Boundary Condition)', () => {
    it('menolak pengundian putaran tambahan jika seluruh peserta telah menang', () => {
      const PARTICIPANTS_COUNT = 5;
      let participants = createMockParticipants(PARTICIPANTS_COUNT);

      // Jalankan 5 putaran hingga semua menang
      for (let r = 1; r <= PARTICIPANTS_COUNT; r++) {
        const round = { id: `round-${r}`, round_number: r, status: 'ready_to_draw' };
        const result = executeRoundDraw({ round, participants });
        participants = result.updatedParticipants;
      }

      // Seluruh kandidat kini has_won = true
      expect(filterEligibleCandidates(participants).length).toBe(0);

      // Percobaan pengocokan putaran ke-6 wajib melempar error
      const extraRound = { id: 'round-6', round_number: 6, status: 'ready_to_draw' };
      expect(() => {
        executeRoundDraw({ round: extraRound, participants });
      }).toThrow(/Seluruh peserta arisan telah menang pada siklus ini/);
    });
  });

  describe('4. Uji Multi-Siklus Beruntun dengan Mulai Siklus Baru', () => {
    it('memperbolehkan peserta menang kembali HANYA SETELAH siklus baru direset secara resmi', () => {
      const PARTICIPANTS_COUNT = 4;
      let participants = createMockParticipants(PARTICIPANTS_COUNT);

      // --- SIKLUS 1 ---
      const cycle1Winners = [];
      for (let r = 1; r <= PARTICIPANTS_COUNT; r++) {
        const round = { id: `c1-r${r}`, round_number: r, status: 'ready_to_draw' };
        const res = executeRoundDraw({ round, participants });
        cycle1Winners.push(res.winner.id);
        participants = res.updatedParticipants;
      }

      // Verifikasi Siklus 1: 4 pemenang unik
      expect(new Set(cycle1Winners).size).toBe(4);
      expect(filterEligibleCandidates(participants).length).toBe(0);

      // --- RESET SIKLUS KE-2 ---
      const resetResult = resetArisanCycle(participants, 1, false);
      expect(resetResult.success).toBe(true);
      expect(resetResult.newCycle).toBe(2);
      expect(resetResult.totalParticipantsReset).toBe(4);
      participants = resetResult.participants;

      // Seluruh peserta kembali menjadi kandidat
      expect(filterEligibleCandidates(participants).length).toBe(4);

      // --- SIKLUS 2 ---
      const cycle2Winners = [];
      for (let r = 1; r <= PARTICIPANTS_COUNT; r++) {
        const round = { id: `c2-r${r}`, round_number: r, status: 'ready_to_draw' };
        const res = executeRoundDraw({ round, participants });
        cycle2Winners.push(res.winner.id);
        participants = res.updatedParticipants;
      }

      // Verifikasi Siklus 2: 4 pemenang unik lagi di dalam siklus 2
      expect(new Set(cycle2Winners).size).toBe(4);
    });

    it('menolak reset siklus jika masih ada kandidat belum menang kecuali menggunakan force=true', () => {
      const participants = createMockParticipants(5);
      participants[0].has_won = true; // baru 1 peserta yang menang

      // Reset tanpa force harus gagal
      expect(() => {
        resetArisanCycle(participants, 1, false);
      }).toThrow(/Siklus belum selesai/);

      // Reset dengan force=true harus berhasil
      const forceReset = resetArisanCycle(participants, 1, true);
      expect(forceReset.success).toBe(true);
      expect(forceReset.participants.every((p) => p.has_won === false)).toBe(true);
    });
  });

  describe('5. Uji Keadilan & Distribusi Pengocokan Acak (Uniform Distribution)', () => {
    it('memastikan seluruh kandidat memiliki kesempatan terpilih secara merata (tidak ada bias indeks)', () => {
      const CANDIDATES_COUNT = 5;
      const candidates = createMockParticipants(CANDIDATES_COUNT);
      const winCounts = {};
      candidates.forEach((c) => (winCounts[c.id] = 0));

      const ITERATIONS = 5000;
      for (let i = 0; i < ITERATIONS; i++) {
        const winner = selectRandomWinner(candidates);
        winCounts[winner.id]++;
      }

      // Ekspektasi rata-rata per kandidat: 5000 / 5 = 1000
      // Dalam 5000 iterasi dengan 5 kandidat acak, setiap kandidat harus mendapat minimal 750 kemenangan
      candidates.forEach((c) => {
        expect(winCounts[c.id]).toBeGreaterThan(700);
        expect(winCounts[c.id]).toBeLessThan(1300);
      });
    });
  });

  describe('6. Uji Validasi Kelunasan Tagihan Putaran (Bill Payment Gate)', () => {
    it('menolak pengocokan putaran jika masih terdapat tagihan berstatus unpaid / pending', () => {
      const participants = createMockParticipants(3);
      const round = { id: 'round-1', round_number: 1, status: 'ready_to_draw' };
      const billsWithUnpaid = [
        { id: 'b1', member_id: 'member-1', status: 'paid' },
        { id: 'b2', member_id: 'member-2', status: 'paid' },
        { id: 'b3', member_id: 'member-3', status: 'pending' }, // belum bayar
      ];

      expect(() => {
        executeRoundDraw({ round, participants, bills: billsWithUnpaid });
      }).toThrow(/Masih terdapat 1 peserta yang belum melunasi iuran/);
    });

    it('mengizinkan pengocokan putaran jika 100% tagihan berstatus paid', () => {
      const participants = createMockParticipants(3);
      const round = { id: 'round-1', round_number: 1, status: 'ready_to_draw' };
      const billsAllPaid = [
        { id: 'b1', member_id: 'member-1', status: 'paid' },
        { id: 'b2', member_id: 'member-2', status: 'paid' },
        { id: 'b3', member_id: 'member-3', status: 'paid' },
      ];

      const result = executeRoundDraw({ round, participants, bills: billsAllPaid });
      expect(result.success).toBe(true);
      expect(result.winner).toBeDefined();
    });
  });

  describe('7. Uji Skalabilitas dan Kasus Ekstrem (Edge Cases)', () => {
    it('bekerja dengan benar untuk arisan kelompok kecil (2 peserta)', () => {
      let participants = createMockParticipants(2);
      const w1 = executeRoundDraw({ round: { id: 'r1', status: 'ready_to_draw' }, participants });
      participants = w1.updatedParticipants;
      expect(w1.isCycleCompleted).toBe(false);

      const w2 = executeRoundDraw({ round: { id: 'r2', status: 'ready_to_draw' }, participants });
      expect(w2.isCycleCompleted).toBe(true);
      expect(w1.winner.id).not.toBe(w2.winner.id);
    });

    it('bekerja dengan stabil untuk arisan kelompok besar (50 peserta)', () => {
      const LARGE_COUNT = 50;
      let participants = createMockParticipants(LARGE_COUNT);
      const winners = [];

      for (let r = 1; r <= LARGE_COUNT; r++) {
        const res = executeRoundDraw({ round: { id: `r-${r}`, status: 'ready_to_draw' }, participants });
        winners.push(res.winner.id);
        participants = res.updatedParticipants;
      }

      expect(winners.length).toBe(LARGE_COUNT);
      expect(new Set(winners).size).toBe(LARGE_COUNT);
    });
  });
});
