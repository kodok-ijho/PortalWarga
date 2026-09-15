import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  AiOutlineArrowLeft,
  AiOutlineHome,
  AiOutlineEnvironment,
  AiOutlinePhone,
  AiOutlineStar,
  AiOutlineShareAlt,
  AiOutlineCheck,
  AiOutlineInfoCircle,
  AiOutlineCheckCircle,
} from 'react-icons/ai';
import { HiOutlineSparkles } from 'react-icons/hi';
import { fetchPublicListingById } from '../../services/publicListingService';

function formatRupiah(amount) {
  if (amount === undefined || amount === null || isNaN(amount)) return 'Hubungi Pengelola';
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function RoomListingDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [listing, setListing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activePhotoIdx, setActivePhotoIdx] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let isMounted = true;
    async function loadDetail() {
      setLoading(true);
      try {
        const data = await fetchPublicListingById(id);
        if (isMounted) setListing(data);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Gagal memuat detail kamar kos:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    if (id) {
      loadDetail();
    }
    return () => {
      isMounted = false;
    };
  }, [id]);

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: listing?.title || 'Kamar Kos di RuangWarga',
        url: window.location.href,
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-forest-50/40">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-forest-800 border-t-transparent" />
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="min-h-screen bg-forest-50/40 flex flex-col items-center justify-center p-4 text-center">
        <div className="rounded-2xl border border-forest-200 bg-white p-8 max-w-md shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-red-600 text-2xl mb-4">
            <AiOutlineHome />
          </div>
          <h2 className="font-serif text-xl font-bold text-forest-900">Kamar Tidak Ditemukan</h2>
          <p className="mt-2 text-xs text-forest-500">
            Iklan kamar ini mungkin sudah selesai masa tayang, dinonaktifkan oleh pemilik, atau tautan tidak valid.
          </p>
          <Link
            to="/listing/kos"
            className="mt-6 inline-flex items-center gap-2 pv-btn-primary text-xs"
          >
            <AiOutlineArrowLeft /> Kembali ke Katalog Kamar Kos
          </Link>
        </div>
      </div>
    );
  }

  const photos =
    Array.isArray(listing.photos) && listing.photos.length > 0
      ? listing.photos
      : ['https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=1200&q=80'];

  const cleanPhone = String(listing.contact_phone || '').replace(/[^0-9]/g, '');
  const waUrl = cleanPhone
    ? `https://wa.me/${cleanPhone.startsWith('0') ? '62' + cleanPhone.slice(1) : cleanPhone}?text=${encodeURIComponent(
        `Halo, saya melihat informasi kamar "${listing.title}" di RuangWarga dan berminat menyewa. Apakah kamar ini masih tersedia?`
      )}`
    : null;

  return (
    <div className="min-h-screen bg-forest-50/40 text-forest-900">
      {/* HEADER NAVIGASI */}
      <header className="sticky top-0 z-30 border-b border-forest-100 bg-white/90 backdrop-blur-md shadow-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-xs font-semibold text-forest-700 hover:text-forest-900"
          >
            <AiOutlineArrowLeft className="text-base" /> Kembali ke Katalog
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleShare}
              className="inline-flex items-center gap-1.5 rounded-xl border border-forest-200 bg-white px-3 py-1.5 text-xs font-semibold text-forest-700 hover:bg-forest-50"
            >
              <AiOutlineShareAlt className="text-sm" />
              {copied ? 'Tautan Disalin!' : 'Bagikan'}
            </button>
            <Link to="/login" className="pv-btn-primary text-xs py-1.5 px-3">
              Masuk
            </Link>
          </div>
        </div>
      </header>

      {/* KONTEN DETAIL */}
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* KOLOM KIRI (FOTO & DETAIL LENGKAP) */}
          <div className="lg:col-span-2 space-y-6">
            {/* GALERI FOTO */}
            <div className="overflow-hidden rounded-2xl bg-white border border-forest-100 shadow-sm">
              <div className="relative aspect-[16/10] w-full bg-forest-100 overflow-hidden">
                <img
                  src={photos[activePhotoIdx] || photos[0]}
                  alt={listing.title}
                  className="h-full w-full object-cover transition-all duration-300"
                  onError={(e) => {
                    e.target.src =
                      'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=1200&q=80';
                  }}
                />

                {/* Badge Unggulan (T10.9) */}
                {listing.is_featured && (
                  <span className="absolute left-4 top-4 inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-500 to-gold-500 px-3 py-1 text-xs font-extrabold text-white shadow-md">
                    <AiOutlineStar className="text-white text-sm" /> Kamar Unggulan
                  </span>
                )}

                {listing.category && (
                  <span className="absolute right-4 top-4 rounded-lg bg-black/60 backdrop-blur-sm px-3 py-1 text-xs font-semibold text-white">
                    {listing.category}
                  </span>
                )}
              </div>

              {/* Thumbnails jika > 1 foto */}
              {photos.length > 1 && (
                <div className="flex gap-2 p-3 overflow-x-auto border-t border-forest-100 bg-forest-50/30">
                  {photos.map((src, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setActivePhotoIdx(idx)}
                      className={`relative h-16 w-20 flex-shrink-0 overflow-hidden rounded-lg border-2 transition-all ${
                        activePhotoIdx === idx
                          ? 'border-forest-700 ring-2 ring-forest-500'
                          : 'border-transparent opacity-60 hover:opacity-100'
                      }`}
                    >
                      <img src={src} alt={`Foto ${idx + 1}`} className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* INFORMASI UTAMA */}
            <div className="rounded-2xl border border-forest-100 bg-white p-6 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h1 className="font-serif text-2xl font-bold text-forest-900 sm:text-3xl">
                    {listing.title}
                  </h1>
                  <div className="mt-2 flex items-center gap-2 text-xs text-forest-600">
                    <AiOutlineEnvironment className="text-forest-500 text-sm" />
                    <span>{listing.location_hint || 'Lokasi tidak disebutkan'}</span>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-2xl font-extrabold text-forest-900 block">
                    {formatRupiah(listing.price)}
                  </span>
                  <span className="text-xs text-forest-500">per bulan</span>
                </div>
              </div>

              {/* STATUS & TIPE */}
              <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-forest-100 pt-4">
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800 border border-emerald-200">
                  <AiOutlineCheckCircle className="text-emerald-600" /> Siap Huni / Tersedia
                </span>
                <span className="rounded-full bg-forest-50 px-3 py-1 text-xs font-semibold text-forest-700 border border-forest-100">
                  Tipe: {listing.category || 'Kamar Kos Standar'}
                </span>
              </div>
            </div>

            {/* DESKRIPSI & FASILITAS */}
            <div className="rounded-2xl border border-forest-100 bg-white p-6 shadow-sm space-y-4">
              <h2 className="font-serif text-lg font-bold text-forest-900">
                Deskripsi & Fasilitas Kamar
              </h2>
              <div className="text-sm leading-relaxed text-forest-700 whitespace-pre-line">
                {listing.description || 'Tidak ada deskripsi tambahan untuk kamar ini.'}
              </div>
            </div>
          </div>

          {/* KOLOM KANAN (KARTU KONTAK & BOOKING) */}
          <div className="space-y-6">
            <div className="sticky top-20 rounded-2xl border border-forest-100 bg-white p-6 shadow-md">
              <h3 className="font-serif text-lg font-bold text-forest-900">
                Tertarik dengan Kamar Ini?
              </h3>
              <p className="mt-1 text-xs text-forest-500">
                Hubungi pengelola langsung tanpa perantara untuk survei lokasi dan negosiasi sewa.
              </p>

              <div className="mt-6 rounded-xl border border-forest-100 bg-forest-50/50 p-4">
                <p className="text-xs text-forest-500">Nomor Kontak Pengelola</p>
                <p className="mt-0.5 font-mono text-base font-bold text-forest-900">
                  {listing.contact_phone || 'Nomor tidak tersedia'}
                </p>
              </div>

              {waUrl ? (
                <a
                  href={waUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-4 py-3 text-sm font-bold text-white shadow-md transition-colors"
                >
                  <AiOutlinePhone className="text-lg" /> Chat Pengelola via WhatsApp
                </a>
              ) : (
                <div className="mt-5 text-center text-xs text-forest-500">
                  Nomor WhatsApp tidak tercantum pada iklan ini.
                </div>
              )}

              <div className="mt-4 rounded-lg bg-blue-50 p-3 text-[11px] text-blue-800 flex items-start gap-2 border border-blue-100">
                <AiOutlineInfoCircle className="text-base text-blue-600 flex-shrink-0 mt-0.5" />
                <span>
                  Pastikan Anda melakukan survei fisik langsung ke kamar sebelum melakukan transfer uang muka atau pembayaran sewa.
                </span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
