import { describe, it, expect } from 'vitest';

describe('ArisanDraw Logic & Safeguards (T8.6)', () => {
  const mockRounds = [
    {
      id: 'round-1',
      round_number: 1,
      period: 'Januari 2026',
      status: 'drawn',
      pool_amount: 2500000,
      winner_member_id: 'member-1',
      winner: { full_name: 'Budi Santoso', phone_number: '08123456781' },
      drawn_at: '2026-01-15T19:00:00Z',
    },
    {
      id: 'round-2',
      round_number: 2,
      period: 'Februari 2026',
      status: 'ready_to_draw',
      pool_amount: 2500000,
      winner_member_id: null,
      drawn_at: null,
    },
    {
      id: 'round-3',
      round_number: 3,
      period: 'Maret 2026',
      status: 'collecting',
      pool_amount: 2500000,
      winner_member_id: null,
      drawn_at: null,
    },
  ];

  const mockParticipants = [
    { id: 'part-1', member_id: 'member-1', full_name: 'Budi Santoso', has_won: true },
    { id: 'part-2', member_id: 'member-2', full_name: 'Siti Aminah', has_won: false },
    { id: 'part-3', member_id: 'member-3', full_name: 'Dewi Lestari', has_won: false },
    { id: 'part-4', member_id: 'member-4', full_name: 'Agus Pratama', has_won: false },
    { id: 'part-5', member_id: 'member-5', full_name: 'Hendra Wijaya', has_won: false },
  ];

  describe('Seleksi Putaran Otomatis (Default Active Round)', () => {
    it('memprioritaskan putaran dengan status ready_to_draw untuk arena kocok', () => {
      const readyRound = mockRounds.find((r) => r.status === 'ready_to_draw');
      expect(readyRound).toBeDefined();
      expect(readyRound.id).toBe('round-2');
      expect(readyRound.round_number).toBe(2);
    });

    it('memilih putaran collecting jika tidak ada putaran ready_to_draw', () => {
      const roundsWithoutReady = mockRounds.filter((r) => r.status !== 'ready_to_draw');
      const fallbackRound =
        roundsWithoutReady.find((r) => r.status === 'ready_to_draw') ||
        roundsWithoutReady.find((r) => r.status === 'collecting');
      expect(fallbackRound).toBeDefined();
      expect(fallbackRound.id).toBe('round-3');
    });
  });

  describe('Filter Kandidat Undian (Spec §5: has_won = false)', () => {
    it('memastikan hanya peserta yang has_won = false yang masuk daftar kandidat', () => {
      const candidates = mockParticipants.filter((p) => !p.has_won);
      expect(candidates).toHaveLength(4);
      expect(candidates.some((c) => c.full_name === 'Budi Santoso')).toBe(false);
      expect(candidates.every((c) => c.has_won === false)).toBe(true);
    });

    it('mendeteksi jika seluruh peserta telah menang (siklus penuh selesai)', () => {
      const allWonParticipants = mockParticipants.map((p) => ({ ...p, has_won: true }));
      const remainingCandidates = allWonParticipants.filter((p) => !p.has_won);
      expect(remainingCandidates).toHaveLength(0);
      const isCycleCompleted = remainingCandidates.length === 0;
      expect(isCycleCompleted).toBe(true);
    });
  });

  describe('Validasi Kelunasan Tagihan Putaran (Bill Readiness Check)', () => {
    const mockRoundBillsPartial = [
      { id: 'bill-1', member_id: 'member-1', status: 'paid', amount: 500000 },
      { id: 'bill-2', member_id: 'member-2', status: 'paid', amount: 500000 },
      { id: 'bill-3', member_id: 'member-3', status: 'pending', amount: 500000 },
    ];

    const mockRoundBillsFull = [
      { id: 'bill-1', member_id: 'member-1', status: 'paid', amount: 500000 },
      { id: 'bill-2', member_id: 'member-2', status: 'paid', amount: 500000 },
      { id: 'bill-3', member_id: 'member-3', status: 'paid', amount: 500000 },
    ];

    it('menghitung statistik kelunasan putaran parsial secara tepat', () => {
      const total = mockRoundBillsPartial.length;
      const paidCount = mockRoundBillsPartial.filter((b) => b.status === 'paid').length;
      const unpaidCount = total - paidCount;
      const isFullyPaid = total > 0 && paidCount === total;
      const percentage = Math.round((paidCount / total) * 100);

      expect(total).toBe(3);
      expect(paidCount).toBe(2);
      expect(unpaidCount).toBe(1);
      expect(isFullyPaid).toBe(false);
      expect(percentage).toBe(67);
    });

    it('menandai isFullyPaid = true jika 100% peserta telah melunasi iuran', () => {
      const total = mockRoundBillsFull.length;
      const paidCount = mockRoundBillsFull.filter((b) => b.status === 'paid').length;
      const isFullyPaid = total > 0 && paidCount === total;
      const percentage = Math.round((paidCount / total) * 100);

      expect(isFullyPaid).toBe(true);
      expect(percentage).toBe(100);
    });
  });

  describe('Proteksi Subscription Gate & Hak Operator', () => {
    const validateCanExecuteDraw = ({
      status,
      isReadOnly,
      userRole,
      candidatesCount,
      isFullyPaid,
    }) => {
      if (isReadOnly) return { allowed: false, reason: 'READ_ONLY_LOCKED' };
      if (!['admin', 'bendahara'].includes(userRole)) return { allowed: false, reason: 'UNAUTHORIZED_ROLE' };
      if (status !== 'ready_to_draw') return { allowed: false, reason: 'NOT_READY_TO_DRAW' };
      if (!isFullyPaid) return { allowed: false, reason: 'BILLS_UNPAID' };
      if (candidatesCount === 0) return { allowed: false, reason: 'NO_CANDIDATES' };
      return { allowed: true, reason: 'READY' };
    };

    it('mengizinkan pengurus menjalankan kocok saat semua syarat terpenuhi', () => {
      const result = validateCanExecuteDraw({
        status: 'ready_to_draw',
        isReadOnly: false,
        userRole: 'admin',
        candidatesCount: 4,
        isFullyPaid: true,
      });
      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('READY');
    });

    it('menolak pengocokan jika tenant berstatus read_only via useSubscriptionGate', () => {
      const result = validateCanExecuteDraw({
        status: 'ready_to_draw',
        isReadOnly: true,
        userRole: 'admin',
        candidatesCount: 4,
        isFullyPaid: true,
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('READ_ONLY_LOCKED');
    });

    it('menolak pengocokan jika dijalankan oleh role anggota biasa', () => {
      const result = validateCanExecuteDraw({
        status: 'ready_to_draw',
        isReadOnly: false,
        userRole: 'anggota',
        candidatesCount: 4,
        isFullyPaid: true,
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('UNAUTHORIZED_ROLE');
    });

    it('menolak pengocokan jika masih ada tagihan belum lunas', () => {
      const result = validateCanExecuteDraw({
        status: 'collecting',
        isReadOnly: false,
        userRole: 'admin',
        candidatesCount: 4,
        isFullyPaid: false,
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('NOT_READY_TO_DRAW');
    });
  });

  describe('Transparansi Riwayat Pemenang', () => {
    it('mengurutkan riwayat putaran yang telah selesai diundi secara descending (putaran terbaru di atas)', () => {
      const drawnRounds = mockRounds
        .filter((r) => r.status === 'drawn')
        .sort((a, b) => b.round_number - a.round_number);

      expect(drawnRounds).toHaveLength(1);
      expect(drawnRounds[0].winner.full_name).toBe('Budi Santoso');
      expect(drawnRounds[0].pool_amount).toBe(2500000);
      expect(drawnRounds[0].drawn_at).toBeDefined();
    });
  });

  describe('Aksi Mulai Siklus Baru (T8.7)', () => {
    const simulateResetCycle = ({ participants, currentCycle, isReadOnly, userRole, force = false }) => {
      if (isReadOnly) throw new Error('READ_ONLY_LOCKED');
      if (userRole !== 'admin') throw new Error('UNAUTHORIZED_ROLE');

      const remainingCandidates = participants.filter((p) => !p.has_won);
      if (!force && remainingCandidates.length > 0) {
        throw new Error(`CYCLE_INCOMPLETE: ${remainingCandidates.length} participants remaining`);
      }

      const resetParticipants = participants.map((p) => ({
        ...p,
        has_won: false,
        won_at_round_id: null,
      }));

      return {
        success: true,
        new_cycle: currentCycle + 1,
        total_participants_reset: resetParticipants.length,
        participants: resetParticipants,
      };
    };

    it('berhasil mereset seluruh peserta dan menaikkan nomor siklus saat siklus selesai', () => {
      const allWonParticipants = mockParticipants.map((p) => ({ ...p, has_won: true }));
      const result = simulateResetCycle({
        participants: allWonParticipants,
        currentCycle: 1,
        isReadOnly: false,
        userRole: 'admin',
        force: false,
      });

      expect(result.success).toBe(true);
      expect(result.new_cycle).toBe(2);
      expect(result.total_participants_reset).toBe(5);
      expect(result.participants.every((p) => p.has_won === false)).toBe(true);
    });

    it('menolak reset siklus jika tenant dalam status read_only', () => {
      const allWonParticipants = mockParticipants.map((p) => ({ ...p, has_won: true }));
      expect(() =>
        simulateResetCycle({
          participants: allWonParticipants,
          currentCycle: 1,
          isReadOnly: true,
          userRole: 'admin',
        })
      ).toThrow('READ_ONLY_LOCKED');
    });

    it('menolak reset siklus jika bukan dilakukan oleh admin', () => {
      const allWonParticipants = mockParticipants.map((p) => ({ ...p, has_won: true }));
      expect(() =>
        simulateResetCycle({
          participants: allWonParticipants,
          currentCycle: 1,
          isReadOnly: false,
          userRole: 'anggota',
        })
      ).toThrow('UNAUTHORIZED_ROLE');
    });

    it('menolak reset siklus jika masih ada kandidat belum menang tanpa force=true', () => {
      expect(() =>
        simulateResetCycle({
          participants: mockParticipants, // masih ada 4 peserta has_won = false
          currentCycle: 1,
          isReadOnly: false,
          userRole: 'admin',
          force: false,
        })
      ).toThrow(/CYCLE_INCOMPLETE/);
    });

    it('mengizinkan force reset siklus jika admin mengonfirmasi force=true', () => {
      const result = simulateResetCycle({
        participants: mockParticipants,
        currentCycle: 1,
        isReadOnly: false,
        userRole: 'admin',
        force: true,
      });
      expect(result.success).toBe(true);
      expect(result.new_cycle).toBe(2);
      expect(result.participants.every((p) => p.has_won === false)).toBe(true);
    });
  });
});
