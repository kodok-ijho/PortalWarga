/**
 * publicListingService.js
 * Service layer untuk Modul Listing Publik & Promosi (Phase 10, Spec §5.1, §6.1, §7.3)
 * Menangani query katalog listing publik (tanpa autentikasi), posting iklan warga/kamar,
 * dan pengecekan akses sesuai aturan RLS database.
 */

import { supabase } from './supabaseClient';

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

/**
 * Fetch katalog listing publik dari Supabase (bebas diakses tanpa login)
 * 
 * @param {Object} [filters={}]
 * @returns {Promise<Array<Object>>}
 */
export async function fetchPublicListings(filters = {}) {
  if (!supabase) {
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
 * Fetch daftar tarif listing untuk publik (katalog pricing listing)
 * 
 * @returns {Promise<Array<Object>>}
 */
export async function fetchListingPricing() {
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from('listing_pricing')
    .select('*')
    .order('price', { ascending: true });

  if (error) {
    throw new Error(`Gagal memuat tarif listing: ${error.message}`);
  }

  return data || [];
}
