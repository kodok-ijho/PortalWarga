/**
 * publicListingService.js
 * Service layer untuk Modul Listing Publik & Promosi (Phase 10, Spec §5.1, §6.1, §7.3)
 * Menangani query katalog listing publik (tanpa autentikasi), posting iklan warga/kamar,
 * dan pengecekan akses sesuai aturan RLS database.
 */

import { supabase } from './supabaseClient';
import { mockListingPricing, mockPublicListings } from './mockData';

/**
 * Memeriksa apakah sebuah listing memenuhi syarat untuk dilihat oleh publik (termasuk anonim)
 * Sesuai RLS Policy: (status = 'active' AND expires_at > now())
 * 
 * @param {Object} listing - Data listing
 * @param {Date|string} [referenceTime=new Date()] - Waktu acuan
 * @returns {boolean}
 */
export function isListingVisibleToPublic(listing, referenceTime = new Date()) {
  if (!listing) return false;
  if (listing.status !== 'active') return false;
  
  const expiry = new Date(listing.expires_at);
  const now = new Date(referenceTime);
  return expiry.getTime() > now.getTime();
}

/**
 * Memeriksa apakah seorang anggota tenant diperbolehkan memposting listing baru
 * Sesuai RLS Policy: Subscription tenant BUKAN read_only (status 'trial' atau 'active')
 * dan membership berstatus 'approved'.
 * 
 * @param {string} subscriptionStatus - Status subscription tenant ('trial' | 'active' | 'read_only' | 'expired')
 * @param {string} memberStatus - Status keanggotaan tenant ('approved' | 'pending' | 'rejected')
 * @returns {boolean}
 */
export function canMemberPostListing(subscriptionStatus, memberStatus = 'approved') {
  if (memberStatus !== 'approved') return false;
  return subscriptionStatus === 'trial' || subscriptionStatus === 'active';
}

/**
 * Memeriksa apakah user berhak mengupdate atau menghapus listing
 * Sesuai RLS Policy: Pemilik postingan, Tenant Admin, atau Platform Admin
 * 
 * @param {Object} listing - Data listing
 * @param {Object} authContext - Konteks user { userId, isPlatformAdmin, memberRole, tenantId }
 * @returns {boolean}
 */
export function canUserManageListing(listing, { userId, isPlatformAdmin = false, memberRole = 'anggota', tenantId = null } = {}) {
  if (!listing) return false;
  if (isPlatformAdmin) return true;
  if (userId && (listing.posted_by_user_id === userId || listing.user_id === userId)) return true;
  if (tenantId && listing.tenant_id === tenantId && memberRole === 'admin') return true;
  return false;
}

/**
 * Menyaring daftar listing agar hanya yang memenuhi kriteria publik yang tampil
 * 
 * @param {Array<Object>} listings - Daftar listing mentah
 * @param {Object} options - Filter tambahan (type, search, city, etc.)
 * @param {Date|string} [referenceTime=new Date()]
 * @returns {Array<Object>}
 */
export function filterPublicListings(listings = [], options = {}, referenceTime = new Date()) {
  const { type, query, featuredOnly } = options;
  const now = new Date(referenceTime);

  return listings.filter((item) => {
    // Syarat mutlak publik: active & belum kedaluwarsa
    if (!isListingVisibleToPublic(item, now)) {
      return false;
    }

    // Filter tipe (room_vacancy | umkm)
    if (type && item.type !== type) {
      return false;
    }

    // Filter khusus featured/promoted
    if (featuredOnly && !item.is_featured) {
      return false;
    }

    // Filter kata kunci pencarian
    if (query && query.trim() !== '') {
      const q = query.toLowerCase().trim();
      const matchTitle = item.title?.toLowerCase().includes(q);
      const matchDesc = item.description?.toLowerCase().includes(q);
      const matchLoc = item.location_hint?.toLowerCase().includes(q);
      if (!matchTitle && !matchDesc && !matchLoc) {
        return false;
      }
    }

    return true;
  });
}

function isSupabaseConfigured() {
  if (typeof import.meta === 'undefined' || !import.meta.env) return false;
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;
  return Boolean(url && key && !url.includes('placeholder'));
}

/**
 * Fetch katalog listing publik dari Supabase (bebas diakses tanpa login)
 * 
 * @param {Object} [filters={}]
 * @returns {Promise<Array<Object>>}
 */
export async function fetchPublicListings(filters = {}) {
  const isDemo = typeof import.meta !== 'undefined' && import.meta.env?.VITE_DEMO_MODE === 'true';

  if (!isSupabaseConfigured() || isDemo) {
    return [];
  }

  let query = supabase
    .from('public_listings')
    .select('*')
    .eq('status', 'active')
    .gt('expires_at', new Date().toISOString())
    .order('is_featured', { ascending: false })
    .order('created_at', { ascending: false });

  if (filters.type) {
    query = query.eq('type', filters.type);
  }

  if (filters.is_featured !== undefined) {
    query = query.eq('is_featured', filters.is_featured);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Gagal memuat listing publik: ${error.message}`);
  }

  return data || [];
}

/**
 * Mencari tarif spesifik dari katalog listing_pricing
 * 
 * @param {Array<Object>} pricingList - Array tarif dari listing_pricing
 * @param {Object} criteria - { listingType, isFeatured, durationDays }
 * @returns {Object|null}
 */
export function getPricingForListing(pricingList = [], { listingType, isFeatured = false, durationDays = 30 } = {}) {
  if (!Array.isArray(pricingList) || !listingType) return null;
  return (
    pricingList.find(
      (p) =>
        p.listing_type === listingType &&
        Boolean(p.is_featured) === Boolean(isFeatured) &&
        Number(p.duration_days) === Number(durationDays)
    ) || null
  );
}

/**
 * Fetch daftar tarif listing untuk publik (katalog pricing listing)
 * 
 * @param {Object} [options={}] - { listingType }
 * @returns {Promise<Array<Object>>}
 */
export async function fetchListingPricing(options = {}) {
  const isDemo = typeof import.meta !== 'undefined' && import.meta.env?.VITE_DEMO_MODE === 'true';

  if (!isSupabaseConfigured() || isDemo) {
    let result = [...mockListingPricing];
    if (options.listingType) {
      result = result.filter((p) => p.listing_type === options.listingType);
    }
    return result;
  }

  let query = supabase
    .from('listing_pricing')
    .select('*')
    .order('price', { ascending: true });

  if (options.listingType) {
    query = query.eq('listing_type', options.listingType);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Gagal memuat tarif listing: ${error.message}`);
  }

  return data || [];
}

// In-memory list untuk demo mode
let inMemoryListings = [...mockPublicListings];

/**
 * Membuat postingan listing publik baru (FR-25, FR-27, FR-28, FR-29)
 * 
 * @param {string} tenantId
 * @param {Object} payload
 * @returns {Promise<Object>}
 */
export async function createPublicListing(tenantId, payload = {}) {
  if (!tenantId) {
    throw new Error('Tenant ID wajib disertakan.');
  }
  if (!payload.title || !payload.title.trim()) {
    throw new Error('Judul listing wajib diisi.');
  }
  if (!payload.contact_phone || !payload.contact_phone.trim()) {
    throw new Error('Nomor kontak WhatsApp/telepon wajib diisi.');
  }

  const durationDays = Number(payload.duration_days) || 30;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000).toISOString();
  const isFeatured = Boolean(payload.is_featured);

  const listingRecord = {
    tenant_id: tenantId,
    unit_id: payload.unit_id ? Number(payload.unit_id) : null,
    posted_by: payload.posted_by || 'mem-default-poster',
    type: payload.type || 'room_vacancy',
    title: payload.title.trim(),
    description: payload.description ? payload.description.trim() : '',
    category: payload.category ? payload.category.trim() : null,
    price: payload.price !== undefined && payload.price !== '' ? Number(payload.price) : null,
    photos: Array.isArray(payload.photos) ? payload.photos : [],
    contact_phone: payload.contact_phone.trim(),
    location_hint: payload.location_hint ? payload.location_hint.trim() : null,
    is_featured: isFeatured,
    featured_until: isFeatured ? expiresAt : null,
    status: payload.status || 'active',
    expires_at: expiresAt,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  };

  const isDemo = typeof import.meta !== 'undefined' && import.meta.env?.VITE_DEMO_MODE === 'true';

  if (!isSupabaseConfigured() || isDemo || String(tenantId).startsWith('demo-')) {
    const createdItem = {
      id: `listing-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      ...listingRecord,
    };
    inMemoryListings.unshift(createdItem);
    return createdItem;
  }

  const { data, error } = await supabase
    .from('public_listings')
    .insert([listingRecord])
    .select()
    .single();

  if (error) {
    throw new Error(`Gagal membuat listing publik: ${error.message}`);
  }

  return data;
}

/**
 * Fetch semua listing milik tenant tertentu (untuk kelola postingan di dashboard tenant)
 * 
 * @param {string} tenantId
 * @returns {Promise<Array<Object>>}
 */
export async function fetchTenantListings(tenantId) {
  if (!tenantId) return [];

  const isDemo = typeof import.meta !== 'undefined' && import.meta.env?.VITE_DEMO_MODE === 'true';

  if (!isSupabaseConfigured() || isDemo || String(tenantId).startsWith('demo-')) {
    return inMemoryListings.filter((l) => l.tenant_id === tenantId);
  }

  const { data, error } = await supabase
    .from('public_listings')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Gagal memuat listing tenant: ${error.message}`);
  }

  return data || [];
}
