import { useState } from 'react';
import { Navigate, useNavigate, useLocation } from 'react-router-dom';
import { FiEye, FiEyeOff } from 'react-icons/fi';
import { useAuth, IS_DEMO_MODE, DEMO_ACCOUNT_LIST } from '../hooks/useAuth';
import { roleLabel, roleColor } from '../services/mockData';

export default function Login() {
  const { signIn, signUp, isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/';

  const [mode, setMode] = useState('login');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [pendingSuccess, setPendingSuccess] = useState(null); // { message }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-forest-500">Memuat...</div>;
  }
  if (isAuthenticated) {
    return <Navigate to={from} replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      if (mode === 'login') {
        await signIn(email, password);
        navigate(from, { replace: true });
      } else {
        const result = await signUp(email, password, fullName, phone);
        if (result?.pending) {
          // Registrasi berhasil tapi perlu approval — jangan navigate
          setPendingSuccess({ message: result.message });
        } else {
          navigate(from, { replace: true });
        }
      }
    } catch (err) {
      setError(err.message || 'Terjadi kesalahan.');
    } finally {
      setSubmitting(false);
    }
  };

  const fillDemo = (acc) => {
    setMode('login');
    setEmail(acc.email);
    setPassword('demo123');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-forest-50 px-4">
      <div className="w-full max-w-md">
        {/* Logo besar di atas form */}
        <div className="text-center mb-8">
          <img
            src="/logo.png"
            alt="Logo Palm Village"
            className="h-64 w-auto rounded-2xl object-cover mx-auto ring-4 ring-gold-500/30 shadow-elevated"
          />
          <h1 className="mt-4 text-2xl font-bold text-forest-800 font-display">
            Portal Warga Palm Village
          </h1>
          <p className="mt-1 text-sm text-forest-500">Masuk ke akun Anda</p>
        </div>

        {/* Tampilan Menunggu Persetujuan setelah registrasi sukses */}
        {pendingSuccess && (
          <div className="pv-card p-6 text-center mb-6">
            <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-amber-100 flex items-center justify-center">
              <span className="text-3xl animate-bounce">⏳</span>
            </div>
            <h2 className="text-lg font-bold text-forest-900 mb-2">Menunggu Persetujuan</h2>
            <p className="text-sm text-forest-600 mb-4">{pendingSuccess.message}</p>
            <p className="text-xs text-forest-400 mb-4">
              Pengurus RT/Bendahara akan memverifikasi data Anda dan menetapkan nomor rumah.
              Anda akan bisa login setelah akun disetujui.
            </p>
            <button
              type="button"
              onClick={() => { setPendingSuccess(null); setMode('login'); setError(''); }}
              className="pv-btn-ghost text-sm"
            >
              ← Kembali ke Login
            </button>
          </div>
        )}

        <div className="pv-card p-6">
          {/* Tab login/register */}
          <div className="flex gap-1 p-1 bg-forest-100 rounded-lg mb-6">
            <button
              type="button"
              onClick={() => { setMode('login'); setError(''); }}
              className={`flex-1 py-2.5 text-sm rounded-md transition-all ${
                mode === 'login'
                  ? 'bg-forest-800 text-gold-400 font-semibold shadow-sm'
                  : 'text-forest-600 hover:text-forest-800'
              }`}
            >
              Masuk
            </button>
            <button
              type="button"
              onClick={() => { setMode('register'); setError(''); }}
              className={`flex-1 py-2.5 text-sm rounded-md transition-all ${
                mode === 'register'
                  ? 'bg-forest-800 text-gold-400 font-semibold shadow-sm'
                  : 'text-forest-600 hover:text-forest-800'
              }`}
            >
              Daftar
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-forest-700 mb-1">Nama Lengkap</label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    className="w-full rounded-lg border border-forest-200 bg-white px-3 py-2.5 text-sm text-forest-900 placeholder:text-forest-400 focus:border-gold-500 focus:ring-2 focus:ring-gold-500/20 outline-none transition-all"
                    placeholder="Nama lengkap Anda"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-forest-700 mb-1">Nomor HP</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                    className="w-full rounded-lg border border-forest-200 bg-white px-3 py-2.5 text-sm text-forest-900 placeholder:text-forest-400 focus:border-gold-500 focus:ring-2 focus:ring-gold-500/20 outline-none transition-all"
                    placeholder="08xx-xxxx-xxxx"
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-sm font-medium text-forest-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-lg border border-forest-200 bg-white px-3 py-2.5 text-sm text-forest-900 placeholder:text-forest-400 focus:border-gold-500 focus:ring-2 focus:ring-gold-500/20 outline-none transition-all"
                placeholder="email@contoh.com"
              />
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between gap-3">
                <label htmlFor="password" className="block text-sm font-medium text-forest-700">
                  Password
                </label>
                <span
                  className={`text-[11px] font-semibold transition-colors ${
                    showPassword ? 'text-gold-700' : 'text-forest-400'
                  }`}
                  aria-hidden="true"
                >
                  {showPassword ? 'Peek mode aktif' : 'Rahasia aman'}
                </span>
              </div>
              <div className="group relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full rounded-lg border border-forest-200 bg-white px-3 py-2.5 pr-24 text-sm text-forest-900 placeholder:text-forest-400 focus:border-gold-500 focus:ring-2 focus:ring-gold-500/20 outline-none transition-all"
                  placeholder="Minimal 6 karakter"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  className={`absolute right-1.5 top-1/2 inline-flex -translate-y-1/2 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-gold-500/30 ${
                    showPassword
                      ? 'bg-gold-100 text-gold-800 hover:bg-gold-200'
                      : 'bg-forest-50 text-forest-700 hover:bg-forest-100'
                  }`}
                  aria-label={showPassword ? 'Sembunyikan password' : 'Lihat password'}
                  aria-pressed={showPassword}
                >
                  {showPassword ? <FiEyeOff aria-hidden="true" /> : <FiEye aria-hidden="true" />}
                  <span>{showPassword ? 'Tutup' : 'Peek'}</span>
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="pv-btn-primary w-full py-3 text-base rounded-lg"
            >
              {submitting
                ? 'Memproses...'
                : mode === 'login'
                ? 'Masuk'
                : 'Daftar Akun'}
            </button>
          </form>

          {/* Demo accounts */}
          {IS_DEMO_MODE && (
            <div className="mt-6 rounded-lg bg-gold-50 border border-gold-200 p-4">
              <p className="text-xs font-semibold text-gold-800 mb-3 flex items-center gap-1.5">
                <span className="text-base">🔧</span> Mode Demo — klik akun untuk login cepat
              </p>
              <div className="space-y-2">
                {DEMO_ACCOUNT_LIST.map((acc) => (
                  <button
                    key={acc.id}
                    type="button"
                    onClick={() =>
                      fillDemo({
                        email: acc.email,
                      })
                    }
                    className="w-full flex items-center justify-between text-left rounded-lg bg-white px-3 py-2.5 text-xs hover:bg-gold-100 transition-colors border border-gold-100 hover:border-gold-300 shadow-sm"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="h-8 w-8 rounded-full bg-forest-800 text-gold-400 flex items-center justify-center font-bold text-sm">
                        {acc.full_name.charAt(0)}
                      </span>
                      <div>
                        <p className="font-medium text-forest-900">{acc.full_name}</p>
                        <p className="text-[10px] text-forest-500">{acc.email} / demo123</p>
                      </div>
                    </div>
                    <span className={`pv-badge ${roleColor(acc.role)}`}>
                      {roleLabel(acc.role)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <p className="mt-5 text-center text-xs text-forest-400">
          Dengan masuk, Anda menyetujui kebijakan privasi &amp; UU PDP No.27/2022.
        </p>
      </div>
    </div>
  );
}
