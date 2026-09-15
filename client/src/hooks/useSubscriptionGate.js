import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTenant } from './useTenant';

/**
 * useSubscriptionGate — Single source of truth untuk memeriksa izin aksi transaksi/tulis lintas platform.
 * Ref: task.md T5.1, T5.2, requirement.md FR-15, specification.md §6
 *
 * Aturan Bisnis (FR-15):
 * - Saat status tenant = 'active' atau 'trial': canTransact = true
 * - Saat status tenant = 'read_only': canTransact = false
 * - Pesan proteksi dipisahkan secara elegan:
 *   * Untuk Admin/Pengurus/Bendahara: Info jelas tentang perpanjangan paket langganan.
 *   * Untuk Anggota/Warga: Pesan ramah tanpa membocorkan istilah teknis "subscription/platform".
 */
export function useSubscriptionGate(options = {}) {
  const navigate = useNavigate();
  const { activeTenant, activeTenantId, subscriptionStatus, isTenantAdmin, userRole } = useTenant();

  const isReadOnly = subscriptionStatus === 'read_only';
  const canTransact = !isReadOnly;

  const isStaff = ['admin', 'bendahara', 'pengurus'].includes(userRole);

  const actionName = options.actionName || 'Aksi ini';

  const tooltip = useMemo(() => {
    if (!isReadOnly) return '';
    if (isStaff) {
      return `${actionName} dinonaktifkan sementara karena status layanan Read-Only. Klik untuk memperpanjang paket langganan.`;
    }
    // Pesan ramah untuk anggota/warga/siswa (tanpa istilah teknis platform)
    return 'Layanan sedang dalam pemeliharaan sistem. Silakan hubungi pengurus atau pengelola Anda.';
  }, [isReadOnly, isStaff, actionName]);

  const redirectToRenewal = () => {
    const tid = activeTenant?.id || activeTenantId;
    if (tid) {
      navigate(`/account/choose-plan?tenantId=${tid}`);
    }
  };

  return {
    canTransact,
    isReadOnly,
    isStaff,
    isTenantAdmin,
    tooltip,
    redirectToRenewal,
  };
}
