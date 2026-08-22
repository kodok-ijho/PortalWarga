import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const TourContext = createContext(null);

export const TOUR_STORAGE_KEY = 'pv_onboarding_tour_completed';

/**
 * Daftar langkah panduan Shadow Point khusus alur Warga.
 */
export const WARGA_TOUR_STEPS = [
  {
    id: 'dashboard-welcome',
    route: '/',
    targetSelector: '[data-tour="dashboard-hero"]',
    fallbackSelector: 'main',
    title: 'Selamat Datang di Portal Warga! 👋',
    description: 'Portal resmi warga Palm Village untuk melihat informasi lingkungan, mengecek status tagihan IPL, dan melakukan pembayaran secara mudah & transparan.',
    placement: 'bottom',
  },
  {
    id: 'profile-detail',
    route: '/',
    targetSelector: '[data-tour="user-profile-button"]',
    fallbackSelector: '[data-tour="dashboard-hero"]',
    title: 'Edit & Lengkapi Profil Warga 👤',
    description: 'Klik profil untuk memperbarui nama lengkap, nomor WhatsApp aktif untuk notifikasi tagihan, serta mengecek nomor unit rumah terdaftar Anda.',
    placement: 'bottom',
  },
  {
    id: 'matrix-menu',
    route: '/',
    targetSelector: '[data-tour="nav-payment-matrix"]',
    fallbackSelector: '[data-tour="dashboard-features"]',
    title: 'Buka Matriks Pembayaran IPL 💳',
    description: 'Menu ini menampilkan seluruh riwayat dan status tagihan iuran IPL rumah Anda sepanjang tahun.',
    placement: 'bottom',
    nextRoute: '/payment-matrix',
  },
  {
    id: 'matrix-grid',
    route: '/payment-matrix',
    targetSelector: '[data-tour="matrix-grid"]',
    fallbackSelector: 'main',
    title: 'Tabel Matriks IPL Unit Anda 📅',
    description: 'Pantau iuran per bulan (Juli - Juni). Hijau = Lunas, Kuning = Menunggu Verifikasi Bendahara, dan Merah = Belum Bayar.',
    placement: 'top',
  },
  {
    id: 'matrix-pay-method',
    route: '/payment-matrix',
    targetSelector: '[data-tour="matrix-pay-guide"]',
    fallbackSelector: '[data-tour="matrix-grid"]',
    title: 'Pembayaran QRIS & Transfer Bank 📲',
    description: 'Pilih bulan yang ingin dibayar, lalu bayar instan via scan QRIS resmi DOKU (langsung terkonfirmasi) atau Transfer Bank manual dengan upload bukti transfer.',
    placement: 'bottom',
    nextRoute: '/houses',
  },
  {
    id: 'houses-mapsite',
    route: '/houses',
    targetSelector: '[data-tour="houses-mapsite"]',
    fallbackSelector: 'main',
    title: 'Denah Rumah & Mapsite 🗺️',
    description: 'Lihat peta denah resmi Palm Village (Blok CB1, CB2, CB3, CB4) beserta data dan status rumah di perumahan.',
    placement: 'bottom',
    nextRoute: '/residents',
  },
  {
    id: 'residents-list',
    route: '/residents',
    targetSelector: '[data-tour="residents-list"]',
    fallbackSelector: 'main',
    title: 'Buku Direktori Warga 👥',
    description: 'Daftar kontak sesama warga penghuni Palm Village untuk koordinasi lingkungan dan nomor darurat.',
    placement: 'bottom',
  },
];

export function TourProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [isOpen, setIsOpen] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  const steps = WARGA_TOUR_STEPS;
  const currentStep = steps[currentStepIndex] || null;

  // Cek apakah user pertama kali login dan belum pernah menyelesaikan tur
  useEffect(() => {
    if (!isAuthenticated) {
      setIsOpen(false);
      return;
    }

    const isCompleted = localStorage.getItem(TOUR_STORAGE_KEY);
    if (!isCompleted) {
      // Beri sedikit delay agar halaman awal ter-render sempurna
      const timer = setTimeout(() => {
        setIsOpen(true);
        setCurrentStepIndex(0);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [isAuthenticated]);

  const startTour = useCallback(() => {
    setCurrentStepIndex(0);
    setIsOpen(true);
    if (location.pathname !== '/') {
      navigate('/');
    }
  }, [location.pathname, navigate]);

  const skipTour = useCallback(() => {
    setIsOpen(false);
    localStorage.setItem(TOUR_STORAGE_KEY, 'true');
  }, []);

  const nextStep = useCallback(() => {
    if (currentStepIndex < steps.length - 1) {
      const nextIndex = currentStepIndex + 1;
      const nextStepConfig = steps[nextIndex];

      setCurrentStepIndex(nextIndex);

      if (nextStepConfig.route && location.pathname !== nextStepConfig.route) {
        navigate(nextStepConfig.route);
      }
    } else {
      // Selesai
      skipTour();
    }
  }, [currentStepIndex, steps, location.pathname, navigate, skipTour]);

  const prevStep = useCallback(() => {
    if (currentStepIndex > 0) {
      const prevIndex = currentStepIndex - 1;
      const prevStepConfig = steps[prevIndex];

      setCurrentStepIndex(prevIndex);

      if (prevStepConfig.route && location.pathname !== prevStepConfig.route) {
        navigate(prevStepConfig.route);
      }
    }
  }, [currentStepIndex, steps, location.pathname, navigate]);

  const resetTour = useCallback(() => {
    localStorage.removeItem(TOUR_STORAGE_KEY);
    startTour();
  }, [startTour]);

  return (
    <TourContext.Provider
      value={{
        isOpen,
        currentStepIndex,
        totalSteps: steps.length,
        currentStep,
        startTour,
        skipTour,
        nextStep,
        prevStep,
        resetTour,
      }}
    >
      {children}
    </TourContext.Provider>
  );
}

export function useTour() {
  const ctx = useContext(TourContext);
  if (!ctx) {
    throw new Error('useTour harus digunakan di dalam <TourProvider>');
  }
  return ctx;
}
