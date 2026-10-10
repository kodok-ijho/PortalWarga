/**
 * Layar loading penuh bernuansa Palm Village, dipakai saat proses login
 * berjalan agar pengguna tidak mengira harus menekan tombol login lagi.
 */
export default function FullScreenLoader({ title = 'Memuat...', message = '' }) {
  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-gradient-to-br from-forest-900 via-forest-800 to-[#082315] px-6 text-center"
      role="status"
      aria-live="polite"
    >
      <div className="relative mb-6 h-28 w-28">
        <div className="absolute inset-0 animate-spin rounded-full border-4 border-gold-500/20 border-t-gold-400" />
        <img
          src="/logo.png"
          alt="Logo Palm Village"
          className="absolute left-3 top-3 h-[88px] w-[88px] rounded-full object-cover shadow-2xl"
        />
      </div>
      <p className="text-lg font-bold text-white font-display tracking-wide">{title}</p>
      {message && <p className="mt-2 max-w-xs text-sm text-forest-200">{message}</p>}
    </div>
  );
}
