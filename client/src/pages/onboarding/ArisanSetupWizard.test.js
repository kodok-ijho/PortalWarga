import { describe, it, expect } from 'vitest';
import { formatRupiah } from '../../services/dataHelpers';

describe('ArisanSetupWizard Logic & Rules (T8.1)', () => {
  describe('Kalkulator Hadiah Pemenang per Putaran', () => {
    it('menghitung total hadiah arisan dengan rumus: jumlah_slot * nominal_kontribusi', () => {
      const slotCount = 10;
      const contributionAmount = 300000;
      const totalPrize = slotCount * contributionAmount;

      expect(totalPrize).toBe(3000000);
      expect(formatRupiah(totalPrize)).toMatch(/Rp[\s\u00a0]3\.000\.000/);
    });

    it('menghitung arisan skala kecil (5 slot @ Rp 100.000)', () => {
      const slotCount = 5;
      const contributionAmount = 100000;
      const totalPrize = slotCount * contributionAmount;

      expect(totalPrize).toBe(500000);
      expect(formatRupiah(totalPrize)).toMatch(/Rp[\s\u00a0]500\.000/);
    });

    it('menghitung arisan skala besar (25 slot @ Rp 1.000.000)', () => {
      const slotCount = 25;
      const contributionAmount = 1000000;
      const totalPrize = slotCount * contributionAmount;

      expect(totalPrize).toBe(25000000);
      expect(formatRupiah(totalPrize)).toMatch(/Rp[\s\u00a0]25\.000\.000/);
    });
  });

  describe('Generator & Validasi Slot Arisan', () => {
    it('membuat daftar slot awal dengan prefix yang sesuai', () => {
      const count = 6;
      const prefix = 'Nomor';
      const slots = Array.from({ length: count }, (_, i) => ({
        id: `slot-${i + 1}`,
        label: `${prefix} #${String(i + 1).padStart(2, '0')}`,
        assignedName: '',
      }));

      expect(slots).toHaveLength(6);
      expect(slots[0].label).toBe('Nomor #01');
      expect(slots[5].label).toBe('Nomor #06');
    });

    it('menolak jumlah slot kurang dari 2 (karena arisan butuh minimal 2 peserta)', () => {
      const validateSlotCount = (count) => {
        if (isNaN(count) || count < 2) {
          return { valid: false, error: 'Jumlah peserta/slot arisan minimal 2 slot.' };
        }
        if (count > 100) {
          return { valid: false, error: 'Maksimal kuota generator otomatis adalah 100 slot.' };
        }
        return { valid: true };
      };

      expect(validateSlotCount(1).valid).toBe(false);
      expect(validateSlotCount(0).valid).toBe(false);
      expect(validateSlotCount(-5).valid).toBe(false);
      expect(validateSlotCount(2).valid).toBe(true);
      expect(validateSlotCount(50).valid).toBe(true);
      expect(validateSlotCount(101).valid).toBe(false);
    });

    it('mencegah duplikasi nama atau nomor slot manual', () => {
      const existingSlots = [
        { label: 'Slot #01' },
        { label: 'Slot #02' },
      ];

      const isDuplicate = (newLabel) => {
        return existingSlots.some(
          (s) => s.label.toLowerCase() === newLabel.trim().toLowerCase()
        );
      };

      expect(isDuplicate('Slot #01')).toBe(true);
      expect(isDuplicate('slot #01')).toBe(true);
      expect(isDuplicate('Slot #03')).toBe(false);
    });
  });

  describe('Struktur Settings & Metadata Arisan', () => {
    it('menghasilkan payload settings arisan yang sesuai dengan spesifikasi', () => {
      const mockForm = {
        groupName: 'Arisan Keluarga Bani Sastro',
        category: 'Keluarga Besar',
        arisanRules: 'Setoran tgl 5, kocok tgl 10.',
        slotCount: 12,
        contributionAmount: 500000,
        drawFrequency: 'monthly',
        drawDay: 10,
        bankName: 'BCA',
        bankAccountNo: '1234567890',
        bankAccountHolder: 'Budi Santoso',
      };

      const settingsPayload = {
        onboarding_completed: true,
        invite_code: 'ARS-TEST-123',
        category: mockForm.category,
        arisan_rules: mockForm.arisanRules,
        slot_count: mockForm.slotCount,
        contribution_amount: mockForm.contributionAmount,
        draw_frequency: mockForm.drawFrequency,
        draw_day: mockForm.drawDay,
        total_prize_per_round: mockForm.slotCount * mockForm.contributionAmount,
        bank_account: {
          bank_name: mockForm.bankName,
          account_number: mockForm.bankAccountNo,
          account_holder: mockForm.bankAccountHolder,
        },
      };

      expect(settingsPayload.onboarding_completed).toBe(true);
      expect(settingsPayload.total_prize_per_round).toBe(6000000);
      expect(settingsPayload.draw_frequency).toBe('monthly');
      expect(settingsPayload.slot_count).toBe(12);
      expect(settingsPayload.bank_account.bank_name).toBe('BCA');
    });

    it('menghasilkan unit payload dengan metadata arisan_slot', () => {
      const slots = [
        { label: 'Slot #01', assignedName: 'Ibu Rina' },
        { label: 'Slot #02', assignedName: '' },
      ];

      const unitPayload = slots.map((s, index) => ({
        label: s.label,
        unit_identifier: s.label,
        status: 'active',
        metadata: {
          slot_number: index + 1,
          assigned_name: s.assignedName || null,
          type: 'arisan_slot',
        },
      }));

      expect(unitPayload[0].metadata.type).toBe('arisan_slot');
      expect(unitPayload[0].metadata.slot_number).toBe(1);
      expect(unitPayload[0].metadata.assigned_name).toBe('Ibu Rina');
      expect(unitPayload[1].metadata.assigned_name).toBeNull();
    });
  });
});
