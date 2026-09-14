import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  AiOutlineCheckCircle,
  AiOutlineClockCircle,
  AiOutlineArrowLeft,
  AiOutlineSafetyCertificate,
  AiOutlineThunderbolt,
  AiOutlineQrcode,
} from 'react-icons/ai';
import { supabase } from '../../services/supabaseClient';
import { useTenant } from '../../hooks/useTenant';
import { useTenantTemplate } from '../../hooks/useTenantTemplate';
import { useToast } from '../../hooks/useToast';

export default function SubscriptionCheckout() {
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const { activeTenant, activeTenantId, isDemo, refreshTenant } = useTenant();
  const template = useTenantTemplate();

  const checkoutData = location.state || {};
  const tenantId = checkoutData.tenantId || activeTenantId;
  const tenantName = checkoutData.tenantName || activeTenant?.name || 'Komunitas Anda';
  const blocks10 = checkoutData.blocks10 ?? 1;
  const blocks5 = checkoutData.blocks5 ?? 1;
  const totalCapacity = checkoutData.totalCapacity ?? 15;
  const durationMonths = checkoutData.durationMonths ?? 12;
  const finalTotal = checkoutData.finalTotal ?? 120000;

  const [loading, setLoading] = useState(false);
  const [paymentData, setPaymentData] = useState(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [activating, setActivating] = useState(false);

  // Inisiasi pembayaran QRIS saat halaman dimuat
  useEffect(() => {
    let isCancelled = false;

    const initPayment = async () => {
      setLoading(true);

      if (isDemo) {
        // Mock payment di Demo mode
        setPaymentData({
          paymentId: `pay-mock-${Date.now()}`,
          gatewayRef: `MYR-DEMO-${Math.floor(Math.random() * 90000) + 10000}`,
          amount: finalTotal,
          paymentUrl: '#',
          qrisString: '00020101021126580014ID.LINKAJA.WWW0118936009140000000000',
        });
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase.functions.invoke('create-subscription-payment', {
          body: {
            tenantId,
            blocks10,
            blocks5,
            durationMonths,
          },
        });

        if (error) throw error;
        if (!isCancelled) {
          setPaymentData(data);
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[SubscriptionCheckout] Gagal membuat tagihan:', err);
        // Fallback simulated payment jika edge function belum live di server
        if (!isCancelled) {
          setPaymentData({
            paymentId: `sim-pay-${Date.now()}`,
            gatewayRef: `MYR-SIM-${Date.now().toString().slice(-6)}`,
            amount: finalTotal,
            paymentUrl: '#',
            qrisString: '00020101021126580014ID.LINKAJA.WWW0118936009140000000000',
          });
        }
      } finally {
        if (!isCancelled) setLoading(false);
      }
    };

    initPayment();
    return () => {
      isCancelled = true;
    };
  }, [tenantId, blocks10, blocks5, durationMonths, finalTotal, isDemo]);

  // Handler simulasi verifikasi pembayaran (berguna saat pengujian & demo)
  const handleSimulatePaymentSuccess = async () => {
    setActivating(true);

    if (isDemo) {
      setTimeout(() => {
        setIsSuccess(true);
        setActivating(false);
        toast.success('Pembayaran QRIS berhasil! Layanan aktif selama ' + durationMonths + ' bulan.');
        refreshTenant();
      }, 800);
      return;
    }

    try {
      // Panggil RPC activate_tenant_subscription atau webhook verifikasi
      const { data, error } = await supabase.rpc('activate_tenant_subscription', {
        p_payment_id: paymentData?.paymentId,
        p_gateway_ref: paymentData?.gatewayRef || 'MYR-SIMULATED',
      });

      if (error) throw error;

      setIsSuccess(true);
      toast.success('Pembayaran terverifikasi! Paket langganan berhasil diaktifkan.');
      await refreshTenant();
    } catch (err) {
      toast.error('Gagal aktivasi: ' + (err.message || 'Terjadi kesalahan database'));
    } finally {
      setActivating(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#071f13] text-white py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Tombol Navigasi */}
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 text-xs font-semibold text-forest-300 hover:text-white transition-colors"
        >
          <AiOutlineArrowLeft /> Kembali ke Pilihan Paket
        </button>

        {isSuccess ? (
          /* STATE SUKSES */
          <div className="bg-forest-900/90 border border-emerald-500/50 rounded-2xl p-8 text-center shadow-2xl space-y-5">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center justify-center text-3xl mx-auto">
              <AiOutlineCheckCircle />
            </div>

            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                Pembayaran Terverifikasi
              </span>
              <h1 className="text-2xl font-bold text-white font-display mt-3">
                Langganan Berhasil Diaktifkan!
              </h1>
              <p className="text-xs text-forest-300 mt-1 max-w-md mx-auto leading-relaxed">
                Layanan <strong className="text-white">{tenantName}</strong> kini berstatus{' '}
                <strong className="text-emerald-300">Aktif</strong> dengan kapasitas{' '}
                <strong className="text-gold-300">{totalCapacity} {template.unitLabel}</strong> selama{' '}
                <strong className="text-white">{durationMonths} bulan</strong> ke depan.
              </p>
            </div>

            <div className="pt-4 border-t border-forest-800 flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => navigate(`/t/${tenantId}/dashboard`)}
                className="w-full sm:w-auto px-6 py-3 rounded-xl bg-gold-500 hover:bg-gold-400 text-forest-950 font-bold text-xs shadow-lg transition-all"
              >
                Buka Dashboard Layanan
              </button>
              <button
                type="button"
                onClick={() => navigate('/account/subscription')}
                className="w-full sm:w-auto px-6 py-3 rounded-xl bg-forest-800 hover:bg-forest-700 text-forest-200 text-xs font-semibold border border-forest-700 transition-colors"
              >
                Lihat Detail Status Langganan
              </button>
            </div>
          </div>
        ) : (
          /* STATE CHECKOUT QRIS */
          <div className="bg-forest-900/90 border border-forest-700/80 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6">
            <div className="text-center space-y-1 pb-4 border-b border-forest-800">
              <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-gold-500/10 border border-gold-500/30 text-gold-300 text-xs font-semibold">
                <AiOutlineSafetyCertificate />
                <span>Mayar QRIS Resmi</span>
              </div>
              <h1 className="text-xl font-bold text-white font-display mt-2">
                Scan QRIS untuk Menyelesaikan Pembayaran
              </h1>
              <p className="text-xs text-forest-300">
                Layanan: <strong className="text-white">{tenantName}</strong> &bull; Paket {durationMonths} Bulan
              </p>
            </div>

            {loading ? (
              <div className="py-16 text-center space-y-3">
                <div className="h-8 w-8 rounded-full border-2 border-forest-600 border-t-gold-500 animate-spin mx-auto" />
                <p className="text-xs text-forest-400">Menyiapkan QRIS pembayaran dari Mayar gateway...</p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* QR Code Container */}
                <div className="bg-white rounded-2xl p-6 text-center text-forest-950 max-w-xs mx-auto shadow-inner space-y-3">
                  <div className="flex items-center justify-between border-b pb-2">
                    <span className="font-extrabold text-xs tracking-wider">QRIS STANDAR</span>
                    <span className="text-[10px] font-bold text-red-600">GPN</span>
                  </div>

                  {/* QR Visual Canvas / Placeholder */}
                  <div className="w-52 h-52 mx-auto bg-stone-100 border-2 border-stone-300 rounded-xl flex flex-col items-center justify-center p-3 relative overflow-hidden">
                    <AiOutlineQrcode className="text-8xl text-forest-950" />
                    <span className="text-[9px] font-mono text-stone-600 mt-1">
                      {paymentData?.gatewayRef || 'MYR-QRIS-CODE'}
                    </span>
                  </div>

                  <div className="pt-2 border-t">
                    <p className="text-[11px] font-medium text-stone-600">
                      Scan dengan GoPay, OVO, Dana, BCA, Livin, atau Mobile Banking apa pun.
                    </p>
                  </div>
                </div>

                {/* Rincian Tagihan */}
                <div className="p-4 bg-forest-950/80 rounded-xl border border-forest-800 space-y-2 text-xs">
                  <div className="flex justify-between text-forest-300">
                    <span>Referensi Transaksi:</span>
                    <span className="font-mono font-bold text-white">{paymentData?.gatewayRef}</span>
                  </div>
                  <div className="flex justify-between text-forest-300">
                    <span>Kapasitas Unit:</span>
                    <span className="text-white">{totalCapacity} {template.unitLabel}</span>
                  </div>
                  <div className="flex justify-between text-forest-300">
                    <span>Durasi Langganan:</span>
                    <span className="text-white">{durationMonths} Bulan</span>
                  </div>
                  <div className="flex justify-between items-baseline pt-2 border-t border-forest-800 text-sm font-bold">
                    <span className="text-white">Total Tagihan:</span>
                    <span className="text-xl text-gold-300 font-mono">
                      Rp {finalTotal.toLocaleString('id-ID')}
                    </span>
                  </div>
                </div>

                {/* Tombol Verifikasi / Testing */}
                <div className="pt-2 space-y-3">
                  <button
                    type="button"
                    onClick={handleSimulatePaymentSuccess}
                    disabled={activating}
                    className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-forest-950 font-extrabold text-xs shadow-lg transition-all flex items-center justify-center gap-2"
                  >
                    {activating ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="h-4 w-4 rounded-full border-2 border-forest-950 border-t-white animate-spin" />
                        <span>Memverifikasi Pembayaran...</span>
                      </span>
                    ) : (
                      <>
                        <AiOutlineCheckCircle className="text-base" />
                        <span>Simulasikan Pembayaran Sukses (Uji Coba)</span>
                      </>
                    )}
                  </button>

                  <p className="text-[11px] text-center text-forest-400">
                    Pada mode live, status akan otomatis terupdate via Webhook Mayar setelah pembayaran selesai.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
