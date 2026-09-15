import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AiOutlineSearch,
  AiOutlineHome,
  AiOutlineEnvironment,
  AiOutlinePhone,
  AiOutlineStar,
  AiOutlineArrowRight,
  AiOutlineAppstore,
  AiOutlineDollar,
  AiOutlineClose,
} from 'react-icons/ai';
import { HiOutlineSparkles } from 'react-icons/hi';
import { fetchPublicListings } from '../../services/publicListingService';

function formatRupiah(amount) {
  if (amount === undefined || amount === null || isNaN(amount)) return 'Hubungi Pengelola';
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function RoomListingDirectory() {
  const navigate = useNavigate();
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [priceFilter, setPriceFilter] = useState('all'); // 'all' | 'under1m' | '1m-2m' | 'above2m'
  const [featuredOnly, setFeaturedOnly] = useState(false);

  useEffect(() => {
    let isMounted = true;
    async function loadDirectory() {
      setLoading(true);
      try {
        const data = await fetchPublicListings({ type: 'room_vacancy' });
        if (isMounted) setListings(data || []);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Gagal memuat direktori kamar kos:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadDirectory();
    return () => {
      isMounted = false;
    };
  }, []);

  // Filter & Urutkan (T10.9: Listing Featured selalu diprioritaskan)
  const filteredListings = useMemo(() => {
    return listings
      .filter((item) => {
        // Filter featuredOnly
        if (featuredOnly && !item.is_featured) return false;

        // Filter search query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const matchTitle = item.title?.toLowerCase().includes(q);
          const matchDesc = item.description?.toLowerCase().includes(q);
          const matchLoc = item.location_hint?.toLowerCase().includes(q);
          if (!matchTitle && !matchDesc && !matchLoc) return false;
        }

        // Filter rentang harga
        const price = Number(item.price) || 0;
        if (priceFilter === 'under1m' && price >= 1000000) return false;
        if (priceFilter === '1m-2m' && (price < 1000000 || price > 2000000)) return false;
        if (priceFilter === 'above2m' && price <= 2000000) return false;

        return true;
      })
      .sort((a, b) => {
        // Listing featured prioritas teratas (T10.9)
        if (a.is_featured && !b.is_featured) return -1;
        if (!a.is_featured && b.is_featured) return 1;
        return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      });
  }, [listings, searchQuery, priceFilter, featuredOnly]);

  const featuredListings = useMemo(() => {
    return filteredListings.filter((l) => l.is_featured);
  }, [filteredListings]);

  const regularListings = useMemo(() => {
    return filteredListings.filter((l) => !l.is_featured);
  }, [filteredListings]);

  return (
    <div className="min-h-screen bg-forest-50/40 text-forest-900 flex flex-col justify-between">
      {/* HEADER NAVIGASI PUBLIK */}
      <header className="sticky top-0 z-30 border-b border-forest-100 bg-white/90 backdrop-blur-md shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Link to="/listing/kos" className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-forest-800 text-gold-400 font-serif font-bold text-lg shadow-sm">
                RW
              </div>
              <div>
                <span className="font-serif font-bold text-forest-900 text-lg leading-none">RuangWarga</span>
                <span className="block text-[10px] font-semibold tracking-wider text-forest-500 uppercase">Katalog Publik</span>
              </div>
            </Link>

            {/* Navigasi Kategori Listing */}
            <div className="hidden md:flex items-center ml-6 gap-1 bg-forest-50 p-1 rounded-xl border border-forest-100">
              <Link
                to="/listing/kos"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-forest-800 text-white shadow-sm"
              >
                <AiOutlineHome className="text-sm" /> Kamar Kos
              </Link>
              <Link
                to="/listing/umkm"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-forest-700 hover:text-forest-900 hover:bg-forest-100/60"
              >
                <AiOutlineAppstore className="text-sm" /> UMKM Warga
              </Link>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <Link
              to="/login"
              className="pv-btn-primary text-xs py-1.5 px-3 rounded-lg shadow-sm"
            >
              Masuk / Kelola Kos
            </Link>
          </div>
        </div>
      </header>

      {/* HERO & SEARCH BAR */}
      <main className="flex-1 pb-16">
        <section className="bg-gradient-to-b from-forest-800 to-forest-900 text-white py-12 px-4 sm:px-6">
          <div className="mx-auto max-w-4xl text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-forest-700/80 px-3 py-1 text-xs font-semibold text-gold-300 border border-forest-600 mb-4">
              <HiOutlineSparkles className="text-gold-400 text-sm" /> Etalase Kamar Kos Bebas Calo
            </span>
            <h1 className="font-serif text-3xl font-extrabold sm:text-4xl text-white tracking-tight">
              Temukan Kamar Kos Idaman Anda
            </h1>
            <p className="mt-3 text-sm sm:text-base text-forest-200 max-w-2xl mx-auto">
              Langsung terhubung dengan pengelola kos terverifikasi. Transparan, akurat, dan tanpa biaya perantara.
            </p>

            {/* SEARCH BOX & FILTERS */}
            <div className="mt-8 rounded-2xl bg-white p-3 sm:p-4 text-forest-900 shadow-xl border border-forest-100/20">
              <div className="flex flex-col gap-3 md:flex-row md:items-center">
                <div className="relative flex-1">
                  <AiOutlineSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-forest-400 text-lg" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Cari lokasi, nama kos, fasilitas (AC, WiFi, kamar mandi dalam)..."
                    className="w-full rounded-xl border border-forest-200 pl-10 pr-9 py-2.5 text-sm focus:border-forest-600 focus:outline-none focus:ring-1 focus:ring-forest-600 placeholder-forest-400"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-forest-400 hover:text-forest-700"
                    >
                      <AiOutlineClose className="text-sm" />
                    </button>
                  )}
                </div>

                {/* Filter Rentang Harga */}
                <div className="flex items-center gap-2">
                  <select
                    value={priceFilter}
                    onChange={(e) => setPriceFilter(e.target.value)}
                    className="rounded-xl border border-forest-200 px-3 py-2.5 text-xs font-medium text-forest-700 focus:border-forest-600 focus:outline-none bg-white"
                  >
                    <option value="all">Semua Harga</option>
                    <option value="under1m">&lt; Rp 1 Juta / bln</option>
                    <option value="1m-2m">Rp 1 Juta - 2 Juta</option>
                    <option value="above2m">&gt; Rp 2 Juta / bln</option>
                  </select>

                  {/* Toggle Featured Only */}
                  <button
                    type="button"
                    onClick={() => setFeaturedOnly(!featuredOnly)}
                    className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl border text-xs font-medium transition-all ${
                      featuredOnly
                        ? 'border-gold-500 bg-amber-50 text-amber-900 ring-2 ring-gold-400 font-bold'
                        : 'border-forest-200 bg-white text-forest-700 hover:bg-forest-50'
                    }`}
                  >
                    <AiOutlineStar className={featuredOnly ? 'text-gold-600' : 'text-forest-400'} />
                    Unggulan
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CONTAINER HASIL DIREKTORI */}
        <section className="mx-auto max-w-7xl px-4 sm:px-6 pt-8">
          {/* Navigasi Mobile Kategori */}
          <div className="flex md:hidden items-center justify-center gap-2 mb-6">
            <Link
              to="/listing/kos"
              className="flex-1 text-center py-2 rounded-xl text-xs font-bold bg-forest-800 text-white shadow-sm"
            >
              Kamar Kos
            </Link>
            <Link
              to="/listing/umkm"
              className="flex-1 text-center py-2 rounded-xl text-xs font-semibold bg-white border border-forest-200 text-forest-800"
            >
              UMKM Warga
            </Link>
          </div>

          <div className="flex items-center justify-between mb-6">
            <h2 className="font-serif text-xl font-bold text-forest-900 sm:text-2xl">
              Daftar Kamar Kos Tersedia ({filteredListings.length})
            </h2>
            <span className="text-xs text-forest-500">
              Diperbarui secara berkala
            </span>
          </div>

          {loading ? (
            <div className="flex min-h-[300px] items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-forest-800 border-t-transparent" />
            </div>
          ) : filteredListings.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-forest-200 bg-white p-12 text-center shadow-sm">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-forest-50 text-forest-600 text-2xl mb-4">
                <AiOutlineHome />
              </div>
              <h3 className="font-serif text-lg font-bold text-forest-800">Tidak ada kamar kos yang cocok</h3>
              <p className="mt-1 text-xs text-forest-500 max-w-md mx-auto">
                {searchQuery || priceFilter !== 'all' || featuredOnly
                  ? 'Coba atur ulang kata kunci pencarian atau filter harga Anda.'
                  : 'Belum ada kamar kos yang diiklankan saat ini. Silakan kembali lagi nanti.'}
              </p>
              {(searchQuery || priceFilter !== 'all' || featuredOnly) && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setPriceFilter('all');
                    setFeaturedOnly(false);
                  }}
                  className="mt-4 pv-btn-ghost text-xs"
                >
                  Reset Filter
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-8">
              {/* SECTION UNGGULAN (T10.9) JIKA ADA */}
              {!featuredOnly && featuredListings.length > 0 && (
                <div>
                  <div className="mb-4 flex items-center gap-2">
                    <span className="flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-extrabold text-amber-900 border border-amber-300">
                      <AiOutlineStar className="text-gold-600 text-sm" /> Pilihan Unggulan
                    </span>
                    <span className="text-xs text-forest-500">Kamar pilihan dengan fasilitas terbaik</span>
                  </div>

                  <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {featuredListings.map((item) => (
                      <RoomListingCard key={item.id} listing={item} isFeaturedHighlight />
                    ))}
                  </div>
                </div>
              )}

              {/* LISTING REGULER */}
              <div>
                {!featuredOnly && featuredListings.length > 0 && (
                  <h3 className="mb-4 font-serif text-lg font-bold text-forest-800">
                    Kamar Lainnya
                  </h3>
                )}
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {(featuredOnly ? featuredListings : regularListings).map((item) => (
                    <RoomListingCard key={item.id} listing={item} />
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>
      </main>

      {/* FOOTER PUBLIK */}
      <footer className="border-t border-forest-100 bg-white py-8 text-center text-xs text-forest-500">
        <div className="mx-auto max-w-7xl px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-serif font-bold text-forest-800">RuangWarga SaaS Multi-Tenant</span>
            <span>&bull;</span>
            <span>Katalog Publik Terbuka</span>
          </div>
          <div className="flex items-center gap-4 text-forest-600">
            <Link to="/listing/kos" className="hover:text-forest-900">Kamar Kos</Link>
            <Link to="/listing/umkm" className="hover:text-forest-900">UMKM Warga</Link>
            <Link to="/login" className="hover:text-forest-900">Portal Pengelola</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

/**
 * Kartu komponen untuk satu kamar kos di direktori
 */
function RoomListingCard({ listing, isFeaturedHighlight = false }) {
  const photoUrl =
    Array.isArray(listing.photos) && listing.photos.length > 0
      ? listing.photos[0]
      : 'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=600&q=80';

  const cleanPhone = String(listing.contact_phone || '').replace(/[^0-9]/g, '');
  const waUrl = cleanPhone
    ? `https://wa.me/${cleanPhone.startsWith('0') ? '62' + cleanPhone.slice(1) : cleanPhone}?text=${encodeURIComponent(
        `Halo, saya melihat kamar "${listing.title}" di RuangWarga dan berminat menyewa. Apakah masih tersedia?`
      )}`
    : null;

  return (
    <div
      className={`group flex flex-col rounded-2xl bg-white overflow-hidden transition-all duration-200 hover:-translate-y-1 hover:shadow-lg ${
        listing.is_featured
          ? 'border-2 border-amber-400 shadow-md ring-1 ring-amber-200'
          : 'border border-forest-100 shadow-sm'
      }`}
    >
      {/* Thumbnail Foto */}
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-forest-100">
        <img
          src={photoUrl}
          alt={listing.title}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          onError={(e) => {
            e.target.src =
              'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=600&q=80';
          }}
        />

        {/* Badge Featured (T10.9) */}
        {listing.is_featured && (
          <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-500 to-gold-500 px-2.5 py-1 text-[11px] font-extrabold text-white shadow-md">
            <AiOutlineStar className="text-white" /> Unggulan
          </span>
        )}

        {/* Kategori Kamar */}
        {listing.category && (
          <span className="absolute right-3 top-3 rounded-lg bg-black/60 backdrop-blur-sm px-2.5 py-1 text-[11px] font-semibold text-white">
            {listing.category}
          </span>
        )}
      </div>

      {/* Konten Card */}
      <div className="flex flex-1 flex-col p-5">
        {/* Harga */}
        <div className="mb-2">
          <span className="text-lg font-extrabold text-forest-900">
            {formatRupiah(listing.price)}
          </span>
          {listing.price && <span className="text-xs text-forest-500"> / bulan</span>}
        </div>

        {/* Judul Kamar */}
        <h3 className="font-serif text-base font-bold text-forest-900 line-clamp-1 group-hover:text-forest-700">
          {listing.title}
        </h3>

        {/* Lokasi */}
        <div className="mt-1.5 flex items-center gap-1.5 text-xs text-forest-600 line-clamp-1">
          <AiOutlineEnvironment className="text-forest-500 flex-shrink-0" />
          <span>{listing.location_hint || 'Lokasi strategis'}</span>
        </div>

        {/* Cuplikan Deskripsi */}
        <p className="mt-2.5 flex-1 text-xs text-forest-600 line-clamp-2">
          {listing.description || 'Kamar kos siap huni dengan fasilitas lengkap, bersih dan nyaman.'}
        </p>

        {/* Tombol Aksi */}
        <div className="mt-5 flex items-center gap-2 border-t border-forest-100 pt-4">
          <Link
            to={`/listing/kos/${listing.id}`}
            className="flex-1 text-center rounded-xl bg-forest-50 hover:bg-forest-100 px-3 py-2 text-xs font-bold text-forest-800 transition-colors"
          >
            Lihat Detail
          </Link>

          {waUrl && (
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-xl bg-emerald-600 hover:bg-emerald-700 px-3 py-2 text-xs font-bold text-white shadow-sm transition-colors gap-1"
            >
              <AiOutlinePhone className="text-sm" /> WA
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
