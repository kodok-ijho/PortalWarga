import { AiOutlineLock } from 'react-icons/ai';
import { useSubscriptionGate } from '../hooks/useSubscriptionGate';

/**
 * SubscriptionGateButton — Komponen tombol terstandarisasi yang otomatis menonaktifkan aksi
 * saat tenant dalam status read_only, lengkap dengan pesan tooltip dan penanganan klik.
 * Ref: task.md T5.2, requirement.md FR-15
 */
export default function SubscriptionGateButton({
  children,
  onClick,
  actionName = 'Aksi ini',
  className = '',
  disabled = false,
  showLockIcon = true,
  ...props
}) {
  const { canTransact, isReadOnly, isTenantAdmin, tooltip, redirectToRenewal } = useSubscriptionGate({
    actionName,
  });

  const handleClick = (e) => {
    if (!canTransact) {
      e.preventDefault();
      e.stopPropagation();
      if (isTenantAdmin) {
        redirectToRenewal();
      }
      return;
    }

    if (onClick) {
      onClick(e);
    }
  };

  const isDisabled = disabled || !canTransact;

  return (
    <div className="relative inline-block" title={!canTransact ? tooltip : undefined}>
      <button
        type="button"
        disabled={isDisabled}
        onClick={handleClick}
        className={`${className} ${
          !canTransact ? 'opacity-60 cursor-not-allowed filter grayscale-[30%]' : ''
        }`}
        {...props}
      >
        {children}
        {!canTransact && showLockIcon && (
          <AiOutlineLock className="inline-block ml-1.5 text-amber-300 text-xs" />
        )}
      </button>
    </div>
  );
}
