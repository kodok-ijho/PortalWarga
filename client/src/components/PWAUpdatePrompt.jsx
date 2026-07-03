import { useRegisterSW } from 'virtual:pwa-register/react';

/**
 * Komponen yang mendengarkan service worker update.
 * Saat versi baru tersedia, muncul banner dengan tombol "Muat ulang".
 *
 * Dipasang sekali di App.jsx (di dalam ToastProvider agar z-index konsisten).
 */
export default function PWAUpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, registration) {
      // Periksa update setiap 30 menit saat app aktif
      if (registration) {
        setInterval(() => {
          registration.update();
        }, 30 * 60 * 1000);
      }
    },
  });

  if (!needRefresh) return null;

  const close = () => {
    // Sembunyikan banner tanpa reload — akan muncul lagi nanti
    needRefresh.value = false;
  };

  return (
    <div className="fixed bottom-16 right-4 z-[70] max-w-sm rounded-lg border border-forest-200 bg-white px-4 py-3 shadow-elevated">
      <p className="text-sm text-forest-800">
        Versi baru tersedia. Muat ulang untuk mendapatkan pembaruan terbaru.
      </p>
      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={() => updateServiceWorker(true)}
          className="pv-btn-primary text-xs px-3 py-1.5"
        >
          Muat ulang
        </button>
        <button
          onClick={close}
          className="pv-btn-ghost text-xs px-3 py-1.5"
        >
          Nanti
        </button>
      </div>
    </div>
  );
}
