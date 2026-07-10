import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useLocation } from 'react-router-dom';
import {
  useAuth,
  IS_DEMO_MODE,
  DEMO_ACCOUNT_LIST,
  GOOGLE_AUTH_READY,
  GOOGLE_OAUTH_CLIENT_ID,
} from '../hooks/useAuth';
import { roleLabel, roleColor } from '../services/mockData';
import { AiOutlineSafetyCertificate, AiOutlineCloudSync } from 'react-icons/ai';
import { FcGoogle } from 'react-icons/fc';

const GOOGLE_SCRIPT_ID = 'google-identity-services';

export default function Login() {
  const {
    signIn,
    signUp,
    signInWithGoogle,
    isAuthenticated,
    loading,
    accountStatus,
    authError,
  } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/';

  const googleButtonRef = useRef(null);
  const [mode, setMode] = useState('login'); // 'login' | 'register_google'
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [googleEmail, setGoogleEmail] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [pendingSuccess, setPendingSuccess] = useState(null);
  const [googleButtonReady, setGoogleButtonReady] = useState(false);

  const handleGoogleCredential = useCallback(async (credential) => {
    if (!credential) {
      setError('Token Google tidak diterima. Silakan coba lagi.');
      return;
    }

    setError('');
    setSubmitting(true);
    try {
      const result = await signInWithGoogle(credential);
      if (result?.pending) {
        setPendingSuccess({ message: result.message });
        return;
      }
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message || 'Login Google belum berhasil.');
    } finally {
      setSubmitting(false);
    }
  }, [from, navigate, signInWithGoogle]);

  useEffect(() => {
    if (IS_DEMO_MODE || !GOOGLE_AUTH_READY) return;

    let cancelled = false;
    const initializeGoogle = () => {
      if (cancelled || !window.google?.accounts?.id || !googleButtonRef.current) return;

      window.google.accounts.id.initialize({
        client_id: GOOGLE_OAUTH_CLIENT_ID,
        callback: (response) => handleGoogleCredential(response?.credential),
        auto_select: false,
        cancel_on_tap_outside: true,
      });

      googleButtonRef.current.innerHTML = '';
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: 'outline',
        size: 'large',
        type: 'standard',
        text: 'signin_with',
        shape: 'rectangular',
        logo_alignment: 'left',
        width: Math.min(360, googleButtonRef.current.offsetWidth || 360),
      });
      setGoogleButtonReady(true);
    };

    const existingScript = document.getElementById(GOOGLE_SCRIPT_ID);
    if (existingScript) {
      initializeGoogle();
      existingScript.addEventListener('load', initializeGoogle, { once: true });
      return () => {
        cancelled = true;
        existingScript.removeEventListener('load', initializeGoogle);
      };
    }

    const script = document.createElement('script');
    script.id = GOOGLE_SCRIPT_ID;
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = initializeGoogle;
    script.onerror = () => {
      if (!cancelled) setError('Google login tidak dapat dimuat. Coba refresh halaman.');
    };
    document.head.appendChild(script);

    return () => {
      cancelled = true;
    };
  }, [handleGoogleCredential]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-forest-500">Memuat sesi keamanan JWT...</div>;
  }
  if (isAuthenticated) {
    return <Navigate to={from} replace />;
  }

  const contextualError = pendingSuccess ? error : (error || authError);
  const statusTitle = {
    pending_approval: 'Akun menunggu persetujuan',
    rejected: 'Pendaftaran ditolak',
    suspended: 'Akun tidak aktif',
    invalid_session: 'Sesi berakhir',
    session_check_failed: 'Sesi perlu diverifikasi ulang',
  }[accountStatus] || 'Login belum berhasil';

  // Simulasi login Google untuk demo mode tanpa backend production.
  const handleGoogleLoginDemo = async (emailToUse) => {
    setError('');
    setSubmitting(true);
    try {
      await signIn(emailToUse || 'warga@palmvillage.id', 'demo123');
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message || 'Gagal mengotentikasi token JWT Google.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleRegisterSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!googleEmail.includes('@')) {
      setError('Silakan masukkan email akun Google Anda yang sah (@gmail.com / @palmvillage.id).');
      return;
    }
    setSubmitting(true);
    try {
      const result = await signUp(googleEmail, 'demo123', fullName, phone);
      if (result?.pending) {
        setPendingSuccess({ message: result.message });
      } else {
        navigate(from, { replace: true });
      }
    } catch (err) {
      setError(err.message || 'Gagal mendaftar dengan akun Google.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-forest-900 via-forest-800 to-[#082315] px-4 py-8">
      <div className="w-full max-w-md">
        {/* Brand Header */}
        <div className="text-center mb-6">
          <img
            src="/logo.png"
            alt="Logo Palm Village"
            className="h-24 w-auto rounded-2xl object-cover mx-auto ring-4 ring-gold-500/40 shadow-2xl mb-3"
          />
          <h1 className="text-2xl font-bold text-white font-display tracking-wide">
            Portal Warga Palm Village
          </h1>
          <p className="text-xs text-forest-300 uppercase tracking-wider mt-1">
            Sistem Layanan IPL &amp; Informasi Hunian
          </p>
        </div>

        {/* Tampilan Menunggu Persetujuan setelah registrasi sukses */}
        {pendingSuccess && (
          <div className="bg-forest-900 border border-gold-500/50 rounded-2xl p-6 text-center mb-6 shadow-2xl text-white">
            <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/40">
              <AiOutlineSafetyCertificate className="text-3xl" />
            </div>
            <h2 className="text-lg font-bold text-gold-400 mb-2">Pendaftaran Google Berhasil!</h2>
            <p className="text-sm text-forest-200 mb-3">{pendingSuccess.message}</p>
            <div className="bg-forest-950 p-3 rounded-xl text-xs text-forest-300 text-left space-y-1 mb-5 border border-forest-800">
              <p><strong>Status:</strong> Menunggu persetujuan Pengurus/Bendahara</p>
              <p><strong>Auth Provider:</strong> Google OAuth 2.0 + App JWT</p>
              <p><strong>Alokasi Unit:</strong> Ditentukan saat verifikasi</p>
            </div>
            <button
              type="button"
              onClick={() => { setPendingSuccess(null); setMode('login'); setError(''); }}
              className="w-full py-2.5 bg-forest-800 hover:bg-forest-700 text-gold-400 font-semibold rounded-xl border border-forest-700 transition-colors text-sm"
            >
              Kembali ke Layar Masuk
            </button>
          </div>
        )}

        <div className="bg-forest-900/90 border border-forest-700/80 rounded-2xl p-6 shadow-2xl backdrop-blur-xl text-white">
          {/* Tab Mode */}
          {IS_DEMO_MODE && (
            <div className="flex gap-1 p-1 bg-forest-950 rounded-xl mb-6 border border-forest-800">
              <button
                type="button"
                onClick={() => { setMode('login'); setError(''); }}
                className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${
                  mode === 'login'
                    ? 'bg-gold-500 text-forest-950 shadow-md'
                    : 'text-forest-400 hover:text-white'
                }`}
              >
                Masuk Demo
              </button>
              <button
                type="button"
                onClick={() => { setMode('register_google'); setError(''); }}
                className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${
                  mode === 'register_google'
                    ? 'bg-gold-500 text-forest-950 shadow-md'
                    : 'text-forest-400 hover:text-white'
                }`}
              >
                Daftar Demo
              </button>
            </div>
          )}

          {!IS_DEMO_MODE || mode === 'login' ? (
            <div className="space-y-5">
              {/* Tombol Utama Google OAuth */}
              {IS_DEMO_MODE ? (
                <button
                  type="button"
                  onClick={() => handleGoogleLoginDemo('warga@palmvillage.id')}
                  disabled={submitting}
                  className="w-full flex items-center justify-center gap-3 py-3.5 px-4 bg-white hover:bg-gray-100 text-gray-800 font-bold rounded-xl shadow-lg transition-all transform hover:-translate-y-0.5 active:translate-y-0 group border border-gray-200"
                >
                  <FcGoogle className="w-5 h-5 shrink-0" />
                  <span className="text-sm">Masuk sebagai Warga Demo</span>
                </button>
              ) : (
                <div className="space-y-3">
                  {!GOOGLE_AUTH_READY ? (
                    <div className="rounded-xl border border-amber-500/50 bg-amber-950/30 p-3.5 text-xs text-amber-100">
                      Konfigurasi VITE_GOOGLE_CLIENT_ID atau VITE_N8N_API_BASE_URL belum tersedia.
                    </div>
                  ) : (
                    <div className="rounded-xl bg-white p-2 shadow-lg">
                      <div ref={googleButtonRef} className="min-h-[44px] w-full flex items-center justify-center" />
                      {!googleButtonReady && (
                        <button
                          type="button"
                          disabled
                          className="w-full flex items-center justify-center gap-3 py-3 px-4 text-sm font-semibold text-gray-500"
                        >
                          <FcGoogle className="text-xl" />
                          Memuat Google...
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Info Keamanan JWT & Supabase */}
              <div className="bg-forest-950/80 border border-forest-800 rounded-xl p-3.5 text-xs text-forest-300 space-y-2">
                <div className="flex items-center gap-2 text-gold-400 font-semibold">
                  <AiOutlineSafetyCertificate className="text-base shrink-0" />
                  <span>{IS_DEMO_MODE ? 'Mode Demo' : 'Google OAuth dan App JWT'}</span>
                </div>
                <p className="text-[11px] leading-relaxed text-forest-400">
                  {IS_DEMO_MODE
                    ? 'Akun demo tidak memakai Google asli dan tidak menghubungi backend production.'
                    : 'Setelah Google berhasil, portal memakai App JWT dari n8n untuk akses API warga.'}
                </p>
              </div>
            </div>
          ) : (
            <form onSubmit={handleGoogleRegisterSubmit} className="space-y-4">
              <div className="bg-forest-950/60 p-3 rounded-xl border border-forest-800 text-xs text-forest-300 mb-2">
                <p>Pendaftaran demo warga baru akan masuk status menunggu persetujuan.</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-forest-300 mb-1 uppercase tracking-wider">
                  Email Akun Google (@gmail.com)
                </label>
                <input
                  type="email"
                  value={googleEmail}
                  onChange={(e) => setGoogleEmail(e.target.value)}
                  required
                  placeholder="nama.anda@gmail.com"
                  className="w-full rounded-xl bg-forest-950 border border-forest-700 px-3.5 py-2.5 text-sm text-white placeholder-forest-500 focus:border-gold-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-forest-300 mb-1 uppercase tracking-wider">
                  Nama Lengkap Sesuai KTP
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  placeholder="Nama Lengkap Anda"
                  className="w-full rounded-xl bg-forest-950 border border-forest-700 px-3.5 py-2.5 text-sm text-white placeholder-forest-500 focus:border-gold-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-forest-300 mb-1 uppercase tracking-wider">
                  Nomor HP / WhatsApp Aktif
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  placeholder="08xx-xxxx-xxxx"
                  className="w-full rounded-xl bg-forest-950 border border-forest-700 px-3.5 py-2.5 text-sm text-white placeholder-forest-500 focus:border-gold-500 outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 bg-gold-500 hover:bg-gold-400 text-forest-950 font-bold rounded-xl shadow-lg transition-all text-sm mt-2 flex items-center justify-center gap-2"
              >
                {submitting ? 'Memverifikasi Google OAuth...' : 'Daftar dengan Google Account'}
              </button>
            </form>
          )}

          {contextualError && (
            <div className="mt-4 rounded-xl bg-red-900/50 border border-red-500/50 p-3.5 text-xs text-red-200 text-center animate-fadeIn">
              <strong className="block text-red-100 mb-1">{statusTitle}</strong>
              {contextualError}
            </div>
          )}

          {/* Simulator JWT untuk Evaluasi / Demo Mode */}
          {IS_DEMO_MODE && (
            <div className="mt-6 pt-5 border-t border-forest-800">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-bold text-gold-400 uppercase tracking-wider flex items-center gap-1.5">
                  <AiOutlineCloudSync className="text-sm" /> Simulator JWT (Mode Demo)
                </span>
                <span className="text-[9px] bg-forest-800 text-forest-300 px-2 py-0.5 rounded-full border border-forest-700">
                  Supabase + n8n Ready
                </span>
              </div>
              <p className="text-[11px] text-forest-400 mb-3 leading-tight">
                Klik peran di bawah untuk menyimulasikan penerimaan token JWT Google OAuth secara instan tanpa melewati popup login eksternal:
              </p>
              <div className="grid grid-cols-1 gap-2">
                {DEMO_ACCOUNT_LIST.map((acc) => (
                  <button
                    key={acc.id}
                    type="button"
                    onClick={() => handleGoogleLoginDemo(acc.email)}
                    className="w-full flex items-center justify-between text-left rounded-xl bg-forest-950/80 hover:bg-forest-800 px-3.5 py-2.5 text-xs transition-all border border-forest-800 hover:border-gold-500/50 group shadow"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-7 w-7 rounded-lg bg-forest-800 text-gold-400 flex items-center justify-center font-bold text-xs shrink-0 group-hover:bg-gold-500 group-hover:text-forest-950 transition-colors">
                        G
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-white truncate">{acc.full_name}</p>
                        <p className="text-[10px] text-forest-400 truncate">{acc.email}</p>
                      </div>
                    </div>
                    <span className={`pv-badge text-[10px] shrink-0 ${roleColor(acc.role)}`}>
                      {roleLabel(acc.role)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer info Arsitektur */}
        <div className="mt-6 text-center space-y-1">
          <p className="text-[11px] text-forest-400">
            Protected by Google OAuth 2.0 and App JWT
          </p>
          <p className="text-[10px] text-forest-500">
            Backend orchestrated via n8n workflows &bull; Database by Supabase PostgreSQL
          </p>
        </div>
      </div>
    </div>
  );
}
