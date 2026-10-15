import { Navigate, Outlet, NavLink } from 'react-router-dom';
import {
  AiOutlineHome,
  AiOutlineTable,
  AiOutlineFolder,
  AiOutlineUser,
} from 'react-icons/ai';
import Header from './Header';
import Footer from './Footer';
import { useAuth } from '../hooks/useAuth';

/**
 * Layout untuk halaman yang butuh autentikasi.
 * Redirect ke /login bila belum login.
 */
export default function ProtectedLayout() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-forest-50">
        <div className="h-10 w-10 rounded-full border-3 border-forest-200 border-t-gold-500 animate-spin" />
        <p className="text-sm text-forest-500">Memuat...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-forest-50">
      <Header />
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6 pb-24 sm:pb-6">
        <Outlet />
      </main>
      <Footer />

      {/* Mobile Bottom Dock Navigation (Seruma Mobile First) */}
      <nav
        aria-label="Mobile Navigation"
        className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-forest-100 shadow-[0_-4px_16px_rgba(10,24,19,0.06)] px-3 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] flex items-center justify-around"
      >
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `flex flex-col items-center justify-center min-w-[56px] py-1 px-2 rounded-xl transition-colors ${
              isActive
                ? 'text-forest-900 font-bold'
                : 'text-forest-400 hover:text-forest-600'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <div
                className={`p-1 rounded-xl transition-all ${
                  isActive ? 'bg-gold-500/15 text-gold-600 scale-105' : ''
                }`}
              >
                <AiOutlineHome className="text-xl" />
              </div>
              <span className="text-[10px] tracking-tight mt-0.5">Beranda</span>
            </>
          )}
        </NavLink>

        <NavLink
          to="/payment-matrix"
          className={({ isActive }) =>
            `flex flex-col items-center justify-center min-w-[56px] py-1 px-2 rounded-xl transition-colors ${
              isActive
                ? 'text-forest-900 font-bold'
                : 'text-forest-400 hover:text-forest-600'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <div
                className={`p-1 rounded-xl transition-all ${
                  isActive ? 'bg-gold-500/15 text-gold-600 scale-105' : ''
                }`}
              >
                <AiOutlineTable className="text-xl" />
              </div>
              <span className="text-[10px] tracking-tight mt-0.5">Tagihan</span>
            </>
          )}
        </NavLink>

        <NavLink
          to="/documents"
          className={({ isActive }) =>
            `flex flex-col items-center justify-center min-w-[56px] py-1 px-2 rounded-xl transition-colors ${
              isActive
                ? 'text-forest-900 font-bold'
                : 'text-forest-400 hover:text-forest-600'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <div
                className={`p-1 rounded-xl transition-all ${
                  isActive ? 'bg-gold-500/15 text-gold-600 scale-105' : ''
                }`}
              >
                <AiOutlineFolder className="text-xl" />
              </div>
              <span className="text-[10px] tracking-tight mt-0.5">Dokumen</span>
            </>
          )}
        </NavLink>

        <NavLink
          to="/residents"
          className={({ isActive }) =>
            `flex flex-col items-center justify-center min-w-[56px] py-1 px-2 rounded-xl transition-colors ${
              isActive
                ? 'text-forest-900 font-bold'
                : 'text-forest-400 hover:text-forest-600'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <div
                className={`p-1 rounded-xl transition-all ${
                  isActive ? 'bg-gold-500/15 text-gold-600 scale-105' : ''
                }`}
              >
                <AiOutlineUser className="text-xl" />
              </div>
              <span className="text-[10px] tracking-tight mt-0.5">Warga</span>
            </>
          )}
        </NavLink>
      </nav>
    </div>
  );
}
