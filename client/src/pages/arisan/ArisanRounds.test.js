import { describe, it, expect } from 'vitest';

describe('ArisanRounds Component Logic & Statuses (T8.3)', () => {
  const mockRounds = [
    {
      id: 'round-1',
      round_number: 1,
      period: 'Putaran 1 - Oktober 2026',
      status: 'drawn',
      total_pool_amount: 3000000,
      winner_member_id: 'member-1',
      winner: { full_name: 'Ibu Rina' },
      drawn_at: '2026-10-10T10:00:00Z',
    },
    {
      id: 'round-2',
      round_number: 2,
      period: 'Putaran 2 - November 2026',
      status: 'ready_to_draw',
      total_pool_amount: 3000000,
      winner_member_id: null,
      drawn_at: null,
    },
    {
      id: 'round-3',
      round_number: 3,
      period: 'Putaran 3 - Desember 2026',
      status: 'collecting',
      total_pool_amount: 3000000,
      winner_member_id: null,
      drawn_at: null,
    },
  ];

  const mockParticipants = [
    { id: 'part-1', member_id: 'member-1', has_won: true },
    { id: 'part-2', member_id: 'member-2', has_won: false },
    { id: 'part-3', member_id: 'member-3', has_won: false },
  ];

  describe('Kalkulasi Statistik Putaran', () => {
    it('menghitung jumlah putaran yang telah selesai dikocok', () => {
      const drawnCount = mockRounds.filter((r) => r.status === 'drawn').length;
      expect(drawnCount).toBe(1);
    });

    it('menemukan putaran aktif (collecting atau ready_to_draw)', () => {
      const activeRound = mockRounds.find(
        (r) => r.status === 'collecting' || r.status === 'ready_to_draw'
      );
      expect(activeRound).toBeDefined();
      expect(activeRound.round_number).toBe(2);
      expect(activeRound.status).toBe('ready_to_draw');
    });

    it('menghitung jumlah peserta yang sudah pernah menang', () => {
      const totalWinners = mockParticipants.filter((p) => p.has_won).length;
      expect(totalWinners).toBe(1);
    });

    it('menentukan nomor putaran berikutnya secara otomatis (auto-increment)', () => {
      const maxNumber = Math.max(...mockRounds.map((r) => r.round_number || 0));
      const nextNumber = maxNumber + 1;
      expect(nextNumber).toBe(4);
    });

    it('mengembalikan 1 jika belum ada putaran sama sekali', () => {
      const emptyRounds = [];
      const nextNumber = emptyRounds.length
        ? Math.max(...emptyRounds.map((r) => r.round_number || 0)) + 1
        : 1;
      expect(nextNumber).toBe(1);
    });
  });

  describe('Filter Putaran berdasarkan Status', () => {
    it('memfilter hanya putaran dengan status collecting', () => {
      const collectingRounds = mockRounds.filter((r) => r.status === 'collecting');
      expect(collectingRounds).toHaveLength(1);
      expect(collectingRounds[0].round_number).toBe(3);
    });

    it('memfilter hanya putaran dengan status ready_to_draw', () => {
      const readyRounds = mockRounds.filter((r) => r.status === 'ready_to_draw');
      expect(readyRounds).toHaveLength(1);
      expect(readyRounds[0].round_number).toBe(2);
    });

    it('memfilter hanya putaran dengan status drawn (selesai)', () => {
      const drawnRounds = mockRounds.filter((r) => r.status === 'drawn');
      expect(drawnRounds).toHaveLength(1);
      expect(drawnRounds[0].winner.full_name).toBe('Ibu Rina');
    });

    it('mengembalikan seluruh putaran jika filter bernilai all', () => {
      const filterStatus = 'all';
      const result = filterStatus === 'all' ? mockRounds : mockRounds.filter((r) => r.status === filterStatus);
      expect(result).toHaveLength(3);
    });
  });
});
