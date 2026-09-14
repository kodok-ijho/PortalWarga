import { describe, it, expect } from 'vitest';
import {
  isListingVisibleToPublic,
  canMemberPostListing,
  canUserManageListing,
  filterPublicListings,
  getPricingForListing,
  fetchListingPricing,
  createPublicListing,
  fetchTenantListings,
} from './publicListingService';

describe('publicListingService - Unit Tests (T10.2: RLS & Public Access)', () => {
  const mockNow = new Date('2026-10-01T12:00:00Z');

  describe('isListingVisibleToPublic (RLS Rule: status = active AND expires_at > now())', () => {
    it('mengizinkan akses publik untuk listing active yang belum kedaluwarsa', () => {
      const activeListing = {
        id: 'list-1',
        title: 'Kamar Kos Mahasiswa',
        status: 'active',
        expires_at: '2026-10-15T00:00:00Z',
      };
      expect(isListingVisibleToPublic(activeListing, mockNow)).toBe(true);
    });

    it('menolak akses publik untuk listing yang sudah expired', () => {
      const expiredListing = {
        id: 'list-2',
        title: 'Kamar Kos Lama',
        status: 'expired',
        expires_at: '2026-09-30T00:00:00Z',
      };
      expect(isListingVisibleToPublic(expiredListing, mockNow)).toBe(false);
    });

    it('menolak akses publik jika status active tapi expires_at sudah lewat', () => {
      const lateListing = {
        id: 'list-3',
        title: 'Kamar Kos Terlewat',
        status: 'active',
        expires_at: '2026-09-30T23:59:59Z',
      };
      expect(isListingVisibleToPublic(lateListing, mockNow)).toBe(false);
    });

    it('menolak akses publik untuk listing yang sudah rented_or_sold', () => {
      const soldListing = {
        id: 'list-4',
        title: 'Kamar Kos Sudah Laku',
        status: 'rented_or_sold',
        expires_at: '2026-10-20T00:00:00Z',
      };
      expect(isListingVisibleToPublic(soldListing, mockNow)).toBe(false);
    });

    it('mengembalikan false jika data listing tidak ada', () => {
      expect(isListingVisibleToPublic(null, mockNow)).toBe(false);
      expect(isListingVisibleToPublic(undefined, mockNow)).toBe(false);
    });
  });

  describe('canMemberPostListing (RLS Insert Guard: Tenant subscription bukan read_only)', () => {
    it('mengizinkan posting jika tenant subscription berstatus trial dan member approved', () => {
      expect(canMemberPostListing('trial', 'approved')).toBe(true);
    });

    it('mengizinkan posting jika tenant subscription berstatus active dan member approved', () => {
      expect(canMemberPostListing('active', 'approved')).toBe(true);
    });

    it('menolak posting jika tenant subscription berstatus read_only (pembatasan subscription gate)', () => {
      expect(canMemberPostListing('read_only', 'approved')).toBe(false);
    });

    it('menolak posting jika tenant subscription berstatus expired', () => {
      expect(canMemberPostListing('expired', 'approved')).toBe(false);
    });

    it('menolak posting jika keanggotaan belum diapprove (misal status pending)', () => {
      expect(canMemberPostListing('active', 'pending')).toBe(false);
      expect(canMemberPostListing('trial', 'rejected')).toBe(false);
    });
  });

  describe('canUserManageListing (RLS Update/Delete: Owner, Tenant Admin, Platform Admin)', () => {
    const sampleListing = {
      id: 'list-100',
      tenant_id: 'tenant-kos-1',
      posted_by_user_id: 'user-alice',
    };

    it('mengizinkan pemilik postingan untuk mengelola listingnya', () => {
      expect(
        canUserManageListing(sampleListing, {
          userId: 'user-alice',
          isPlatformAdmin: false,
          memberRole: 'anggota',
          tenantId: 'tenant-kos-1',
        })
      ).toBe(true);
    });

    it('mengizinkan tenant admin dari tenant terkait untuk mengelola listing anggotanya', () => {
      expect(
        canUserManageListing(sampleListing, {
          userId: 'user-admin',
          isPlatformAdmin: false,
          memberRole: 'admin',
          tenantId: 'tenant-kos-1',
        })
      ).toBe(true);
    });

    it('mengizinkan platform admin mengelola listing apa pun', () => {
      expect(
        canUserManageListing(sampleListing, {
          userId: 'user-platform-admin',
          isPlatformAdmin: true,
        })
      ).toBe(true);
    });

    it('menolak anggota lain di tenant yang sama untuk mengedit listing bukan miliknya', () => {
      expect(
        canUserManageListing(sampleListing, {
          userId: 'user-bob',
          isPlatformAdmin: false,
          memberRole: 'anggota',
          tenantId: 'tenant-kos-1',
        })
      ).toBe(false);
    });

    it('menolak admin dari tenant lain untuk mengedit listing', () => {
      expect(
        canUserManageListing(sampleListing, {
          userId: 'user-other-admin',
          isPlatformAdmin: false,
          memberRole: 'admin',
          tenantId: 'tenant-other-99',
        })
      ).toBe(false);
    });
  });

  describe('filterPublicListings (Katalog Listing Publik)', () => {
    const rawListings = [
      {
        id: '1',
        type: 'room_vacancy',
        title: 'Kost Putri Kamar AC Bersih',
        description: 'Dekat kampus UGM dan minimarket',
        location_hint: 'Sleman, Depok',
        status: 'active',
        expires_at: '2026-10-20T00:00:00Z',
        is_featured: true,
      },
      {
        id: '2',
        type: 'umkm',
        title: 'Catering Rumahan Bu Joko',
        description: 'Menerima pesanan tumpeng dan nasi box',
        location_hint: 'Sleman, Mlati',
        status: 'active',
        expires_at: '2026-10-15T00:00:00Z',
        is_featured: false,
      },
      {
        id: '3',
        type: 'room_vacancy',
        title: 'Kost Murah Dekat Stasiun',
        description: 'Sudah penuh',
        location_hint: 'Kota Yogyakarta',
        status: 'rented_or_sold',
        expires_at: '2026-10-30T00:00:00Z',
        is_featured: false,
      },
      {
        id: '4',
        type: 'umkm',
        title: 'Laundry Kiloan Bersih Wangi',
        description: 'Promo bulan lalu',
        location_hint: 'Bantul',
        status: 'expired',
        expires_at: '2026-09-25T00:00:00Z',
        is_featured: false,
      },
    ];

    it('hanya meloloskan listing yang active dan belum kedaluwarsa ke publik', () => {
      const publicOnly = filterPublicListings(rawListings, {}, mockNow);
      expect(publicOnly).toHaveLength(2);
      expect(publicOnly.map((l) => l.id)).toEqual(['1', '2']);
    });

    it('dapat menyaring berdasarkan tipe listing (room_vacancy)', () => {
      const rooms = filterPublicListings(rawListings, { type: 'room_vacancy' }, mockNow);
      expect(rooms).toHaveLength(1);
      expect(rooms[0].id).toBe('1');
    });

    it('dapat menyaring berdasarkan tipe listing (umkm)', () => {
      const umkm = filterPublicListings(rawListings, { type: 'umkm' }, mockNow);
      expect(umkm).toHaveLength(1);
      expect(umkm[0].id).toBe('2');
    });

    it('dapat menyaring berdasarkan pencarian teks (judul / deskripsi / lokasi)', () => {
      const searchRes = filterPublicListings(rawListings, { query: 'catering' }, mockNow);
      expect(searchRes).toHaveLength(1);
      expect(searchRes[0].title).toContain('Catering');

      const searchLoc = filterPublicListings(rawListings, { query: 'Depok' }, mockNow);
      expect(searchLoc).toHaveLength(1);
      expect(searchLoc[0].id).toBe('1');
    });

    it('dapat menyaring khusus listing yang dipromosikan (is_featured)', () => {
      const featured = filterPublicListings(rawListings, { featuredOnly: true }, mockNow);
      expect(featured).toHaveLength(1);
      expect(featured[0].id).toBe('1');
    });
  });

  describe('Listing Pricing Catalogue & Helpers (T10.3)', () => {
    const samplePricing = [
      { id: 'p1', listing_type: 'room_vacancy', is_featured: false, duration_days: 30, price: 15000 },
      { id: 'p2', listing_type: 'room_vacancy', is_featured: true, duration_days: 30, price: 35000 },
      { id: 'p3', listing_type: 'umkm', is_featured: false, duration_days: 30, price: 10000 },
      { id: 'p4', listing_type: 'umkm', is_featured: true, duration_days: 30, price: 25000 },
    ];

    it('getPricingForListing menemukan tarif yang tepat untuk kamar kos biasa (Rp 15.000)', () => {
      const priceItem = getPricingForListing(samplePricing, {
        listingType: 'room_vacancy',
        isFeatured: false,
        durationDays: 30,
      });
      expect(priceItem).toBeDefined();
      expect(priceItem.price).toBe(15000);
    });

    it('getPricingForListing menemukan tarif yang tepat untuk kamar kos featured (Rp 35.000)', () => {
      const priceItem = getPricingForListing(samplePricing, {
        listingType: 'room_vacancy',
        isFeatured: true,
        durationDays: 30,
      });
      expect(priceItem).toBeDefined();
      expect(priceItem.price).toBe(35000);
    });

    it('getPricingForListing menemukan tarif yang tepat untuk UMKM biasa (Rp 10.000) dan featured (Rp 25.000)', () => {
      const regularUmkm = getPricingForListing(samplePricing, {
        listingType: 'umkm',
        isFeatured: false,
      });
      expect(regularUmkm.price).toBe(10000);

      const featuredUmkm = getPricingForListing(samplePricing, {
        listingType: 'umkm',
        isFeatured: true,
      });
      expect(featuredUmkm.price).toBe(25000);
    });

    it('getPricingForListing mengembalikan null jika kombinasi tidak ditemukan', () => {
      const notFound = getPricingForListing(samplePricing, {
        listingType: 'room_vacancy',
        isFeatured: false,
        durationDays: 90, // tidak ada paket 90 hari
      });
      expect(notFound).toBeNull();
    });

    it('fetchListingPricing mengembalikan seluruh data pricing mock di mode demo', async () => {
      const pricing = await fetchListingPricing();
      expect(Array.isArray(pricing)).toBe(true);
      expect(pricing.length).toBeGreaterThanOrEqual(4);
      expect(pricing.some((p) => p.listing_type === 'room_vacancy')).toBe(true);
      expect(pricing.some((p) => p.listing_type === 'umkm')).toBe(true);
    });

    it('fetchListingPricing dapat memfilter berdasarkan tipe listing', async () => {
      const kosPricing = await fetchListingPricing({ listingType: 'room_vacancy' });
      expect(Array.isArray(kosPricing)).toBe(true);
      expect(kosPricing.every((p) => p.listing_type === 'room_vacancy')).toBe(true);
      expect(kosPricing.length).toBe(2); // regular & featured
    });
  });

  describe('Post Listing Operations & Management (T10.4)', () => {
    it('melempar error jika tenantId tidak disertakan saat membuat listing', async () => {
      await expect(createPublicListing('', { title: 'Test', contact_phone: '08123' })).rejects.toThrow(
        'Tenant ID wajib disertakan.'
      );
    });

    it('melempar error jika judul iklan atau nomor kontak kosong', async () => {
      await expect(createPublicListing('demo-tenant-1', { title: '', contact_phone: '08123' })).rejects.toThrow(
        'Judul listing wajib diisi.'
      );
      await expect(createPublicListing('demo-tenant-1', { title: 'Judul Valid', contact_phone: '' })).rejects.toThrow(
        'Nomor kontak WhatsApp/telepon wajib diisi.'
      );
    });

    it('berhasil membuat listing kamar kos baru dengan prefill unit_id dan tanggal kedaluwarsa 30 hari', async () => {
      const newListing = await createPublicListing('demo-tenant-kos', {
        unit_id: 101,
        type: 'room_vacancy',
        title: 'Kamar 101 - Kos Melati Eksklusif',
        description: 'AC, kamar mandi dalam, WiFi, water heater',
        price: 1500000,
        contact_phone: '081234567890',
        location_hint: 'Sleman, Depok',
        is_featured: false,
        duration_days: 30,
      });

      expect(newListing).toBeDefined();
      expect(newListing.id).toBeDefined();
      expect(newListing.tenant_id).toBe('demo-tenant-kos');
      expect(newListing.unit_id).toBe(101);
      expect(newListing.type).toBe('room_vacancy');
      expect(newListing.status).toBe('active');
      expect(newListing.expires_at).toBeDefined();

      const createdDate = new Date(newListing.created_at);
      const expiryDate = new Date(newListing.expires_at);
      const diffDays = Math.round((expiryDate - createdDate) / (1000 * 60 * 60 * 24));
      expect(diffDays).toBe(30);
    });

    it('berhasil membuat listing UMKM warga dengan paket unggulan (is_featured = true)', async () => {
      const umkmListing = await createPublicListing('demo-tenant-rtrw', {
        unit_id: null,
        type: 'umkm',
        title: 'Katering Nasi Kotak Ibu Joko',
        category: 'Kuliner & Makanan',
        description: 'Menerima pesanan tumpeng dan nasi kotak untuk rapat RT',
        price: 25000,
        contact_phone: '081999888777',
        location_hint: 'Blok B2 No. 5',
        is_featured: true,
        duration_days: 30,
      });

      expect(umkmListing).toBeDefined();
      expect(umkmListing.type).toBe('umkm');
      expect(umkmListing.is_featured).toBe(true);
      expect(umkmListing.featured_until).toBeDefined();
      expect(umkmListing.featured_until).toBe(umkmListing.expires_at);
    });

    it('fetchTenantListings mengembalikan daftar listing milik tenant yang diminta', async () => {
      const tenantListings = await fetchTenantListings('demo-tenant-kos');
      expect(Array.isArray(tenantListings)).toBe(true);
      expect(tenantListings.length).toBeGreaterThan(0);
      expect(tenantListings.every((l) => l.tenant_id === 'demo-tenant-kos')).toBe(true);
    });
  });
});

