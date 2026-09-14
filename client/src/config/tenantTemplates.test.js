import { describe, it, expect } from 'vitest';
import { getTenantTemplate, TENANT_TEMPLATES } from './tenantTemplates';
import { occupancyStatusLabel, occupancyStatusColor } from '../services/dataHelpers';

describe('tenantTemplates & Dynamic Naming (T7.5)', () => {
  describe('Template Vertikal Kos-kosan', () => {
    it('mengembalikan istilah Kamar, Penyewa, dan Sewa untuk tipe kos', () => {
      const kosTemplate = getTenantTemplate('kos');

      expect(kosTemplate).toBeDefined();
      expect(kosTemplate.unitLabel).toBe('Kamar');
      expect(kosTemplate.unitPluralLabel).toBe('Kamar / Pintu');
      expect(kosTemplate.memberLabel).toBe('Penyewa');
      expect(kosTemplate.memberPluralLabel).toBe('Daftar Penyewa');
      expect(kosTemplate.billLabel).toBe('Sewa');
      expect(kosTemplate.billPluralLabel).toBe('Tagihan Sewa Kamar');
      expect(kosTemplate.emptyUnitLabel).toBe('Kamar Kosong');
      expect(kosTemplate.occupiedUnitLabel).toBe('Tersewa');
      expect(kosTemplate.headerResidentUnit).toBe('Kamar / Penyewa');
      expect(kosTemplate.contractLabel).toBe('Kontrak Sewa');
      expect(kosTemplate.feeLabel).toBe('Tarif Sewa');
      expect(kosTemplate.features.hasRoomStatus).toBe(true);
    });

    it('mengembalikan istilah Rumah, Warga, dan IPL untuk tipe default rt_rw', () => {
      const rtTemplate = getTenantTemplate('rt_rw');

      expect(rtTemplate).toBeDefined();
      expect(rtTemplate.unitLabel).toBe('Rumah');
      expect(rtTemplate.memberLabel).toBe('Warga');
      expect(rtTemplate.billLabel).toBe('IPL');
      expect(rtTemplate.emptyUnitLabel).toBe('Rumah Kosong');
      expect(rtTemplate.occupiedUnitLabel).toBe('Dihuni');
      expect(rtTemplate.headerResidentUnit).toBe('Rumah / Warga');
    });

    it('fallback ke rt_rw jika tipe tenant tidak dikenal', () => {
      const fallbackTemplate = getTenantTemplate('unknown_type');
      expect(fallbackTemplate.type).toBe('rt_rw');
      expect(fallbackTemplate.unitLabel).toBe('Rumah');
    });
  });

  describe('Dynamic Occupancy Status Helpers', () => {
    it('menghasilkan label status hunian yang disesuaikan untuk kos', () => {
      expect(occupancyStatusLabel('tenant', 'kos')).toBe('Penyewa Aktif');
      expect(occupancyStatusLabel('owner_occupied', 'kos')).toBe('Pemilik / Pengelola');
      expect(occupancyStatusLabel('checkout', 'kos')).toBe('Selesai / Checkout');
      expect(occupancyStatusLabel('booking', 'kos')).toBe('Dipesan / Booking');
    });

    it('menghasilkan label status hunian standar untuk rt_rw', () => {
      expect(occupancyStatusLabel('tenant', 'rt_rw')).toBe('Kontrak');
      expect(occupancyStatusLabel('owner_occupied', 'rt_rw')).toBe('Tetap / Owner - Dihuni');
    });

    it('memberikan warna badge yang sesuai untuk status checkout dan booking', () => {
      expect(occupancyStatusColor('checkout')).toContain('bg-gray-100');
      expect(occupancyStatusColor('booking')).toContain('bg-amber-100');
    });
  });
});
