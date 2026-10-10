// Layar penuh saat sesi login sedang diverifikasi, agar pengguna dengan
// koneksi lambat tidak mengira perlu menekan tombol Google lagi.
export default function AuthLoadingScreen({ title = 'Memuat sesi...', message }) {
  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-gradient-to-br from-forest-900 via-forest-800 to-[#082315] px-6 text-center"
      role="status"
      aria-live="polite"
    >
      <img
        src="/logo.png"
        alt="Logo Palm Village"
        className="h-20 w-auto rounded-2xl object-cover ring-4 ring-gold-500/40 shadow-2xl mb-6"
      />
      <div className="h-12 w-12 rounded-full border-4 border-forest-600 border-t-gold-500 animate-spin mb-5" />
      <p className="text-lg font-bold text-white font-display">{title}</p>
      {message && <p className="mt-2 max-w-xs text-sm text-forest-200">{message}</p>}
    </div>
  );
}
