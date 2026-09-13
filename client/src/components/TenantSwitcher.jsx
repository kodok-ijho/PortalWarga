import { useState, useRef, useEffect } from 'react';
import { AiOutlineDown, AiOutlineCheck, AiOutlineSwap } from 'react-icons/ai';
import { useTenant } from '../hooks/useTenant';

const TYPE_ICONS = {
  rt_rw: '🏘️',
  kos: '🏢',
  arisan: '🎲',
  kelas: '📚',
};

const TYPE_LABELS = {
  rt_rw: 'RT/RW',
  kos: 'Kos-Kosan',
  arisan: 'Arisan',
  kelas: 'Kelas',
};

const STATUS_STYLES = {
  active: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  trial: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  read_only: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
};

export default function TenantSwitcher({ isMobile = false }) {
  const {
    activeTenant,
    activeTenantId,
    userTenants,
    switchTenant,
    subscriptionStatus,
  } = useTenant();

  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!userTenants || userTenants.length === 0) {
    return null;
  }

  const currentType = activeTenant?.type || 'rt_rw';
  const typeIcon = TYPE_ICONS[currentType] || '🏘️';
  const typeLabel = TYPE_LABELS[currentType] || currentType;
  const statusStyle = STATUS_STYLES[subscriptionStatus] || STATUS_STYLES.trial;

  // Jika hanya ada 1 tenant dan bukan mobile, tampilkan badge ringkas
  if (userTenants.length <= 1 && !isMobile) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 bg-forest-800/80 rounded-lg border border-forest-600/40 text-xs">
        <span className="text-sm">{typeIcon}</span>
        <span className="font-semibold text-forest-100 max-w-[140px] truncate" title={activeTenant?.name}>
          {activeTenant?.name || 'Komunitas Anda'}
        </span>
        <span className={`text-[10px] px-1.5 py-0.2 rounded border font-medium uppercase ${statusStyle}`}>
          {subscriptionStatus === 'trial' ? 'Trial' : subscriptionStatus === 'active' ? 'Aktif' : 'Read-Only'}
        </span>
      </div>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-all text-xs font-semibold ${
          isOpen
            ? 'bg-forest-700 text-gold-300 border-gold-400/50 shadow'
            : 'bg-forest-800/80 hover:bg-forest-700 text-forest-100 border-forest-600/50'
        }`}
        title="Ganti Tenant / Layanan"
      >
        <span className="text-sm">{typeIcon}</span>
        <div className="text-left">
          <p className="leading-tight max-w-[130px] truncate font-bold">
            {activeTenant?.name || 'Pilih Tenant'}
          </p>
          <p className="text-[9px] text-forest-300 font-normal leading-none mt-0.5">
            {typeLabel} &bull; <span className="capitalize">{subscriptionStatus}</span>
          </p>
        </div>
        {userTenants.length > 1 && (
          <AiOutlineDown className={`text-[10px] ml-1 transition-transform ${isOpen ? 'rotate-180 text-gold-400' : 'text-forest-300'}`} />
        )}
      </button>

      {isOpen && userTenants.length > 1 && (
        <div className="absolute left-0 mt-1.5 w-64 bg-forest-900 border border-forest-600 rounded-xl shadow-2xl overflow-hidden z-50 animate-fadeIn">
          <div className="px-3 py-2 bg-forest-950/80 border-b border-forest-800 flex items-center justify-between text-[11px] text-forest-300 font-semibold uppercase tracking-wider">
            <span>Daftar Layanan ({userTenants.length})</span>
            <AiOutlineSwap className="text-xs text-gold-400" />
          </div>

          <div className="max-h-60 overflow-y-auto py-1 divide-y divide-forest-800/50">
            {userTenants.map((tenant) => {
              const isSelected = tenant.id === activeTenantId;
              const itemType = tenant.type || 'rt_rw';
              const itemIcon = TYPE_ICONS[itemType] || '🏘️';
              const itemLabel = TYPE_LABELS[itemType] || itemType;
              const subStatus = tenant.subscription?.status || 'trial';
              const itemStatusStyle = STATUS_STYLES[subStatus] || STATUS_STYLES.trial;

              return (
                <button
                  key={tenant.id}
                  type="button"
                  onClick={() => {
                    switchTenant(tenant.id);
                    setIsOpen(false);
                  }}
                  className={`w-full px-3 py-2.5 text-left flex items-start gap-2.5 transition-colors ${
                    isSelected
                      ? 'bg-forest-800/90 text-gold-300 border-l-2 border-gold-500'
                      : 'hover:bg-forest-800/50 text-forest-100'
                  }`}
                >
                  <span className="text-base mt-0.5">{itemIcon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold truncate leading-tight">{tenant.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[10px] text-forest-300">{itemLabel}</span>
                      <span className="text-[9px] text-forest-500">&bull;</span>
                      <span className={`text-[9px] px-1 py-0.2 rounded border uppercase font-semibold ${itemStatusStyle}`}>
                        {subStatus}
                      </span>
                    </div>
                  </div>
                  {isSelected && <AiOutlineCheck className="text-gold-400 text-sm mt-1 shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
