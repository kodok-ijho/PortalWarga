import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import ProtectedLayout from './components/Layout';
import PWAUpdatePrompt from './components/PWAUpdatePrompt';
import Home from './pages/Home';
import Login from './pages/Login';
import NotFound from './pages/NotFound';

// Lazy-load halaman berat untuk code-splitting (recharts, papaparse)
import { lazy, Suspense } from 'react';
import { useAuth } from './hooks/useAuth';
const Residents = lazy(() => import('./pages/Residents'));
const Houses = lazy(() => import('./pages/Houses'));
const PaymentMatrix = lazy(() => import('./pages/PaymentMatrix'));
const Reports = lazy(() => import('./pages/Reports'));
const Settings = lazy(() => import('./pages/Settings'));
const Expenses = lazy(() => import('./pages/Expenses'));
const Users = lazy(() => import('./pages/Users'));
const Logs = lazy(() => import('./pages/Logs'));
const UserApproval = lazy(() => import('./pages/UserApproval'));
const PaymentVerification = lazy(() => import('./pages/PaymentVerification'));

const PageLoader = () => (
  <div className="flex items-center justify-center py-20">
    <div className="h-8 w-8 rounded-full border-2 border-forest-200 border-t-gold-500 animate-spin" />
  </div>
);

/**
 * RoleGuard — renders children only if user has one of the allowed roles.
 * Otherwise redirects to home page.
 */
function RoleGuard({ allowed, children }) {
  const { role } = useAuth();
  if (!role || !allowed.includes(role)) {
    return <Navigate to="/" replace />;
  }
  return children;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <PWAUpdatePrompt />
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              {/* Login terbuka */}
              <Route path="/login" element={<Login />} />

              {/* Halaman butuh login */}
              <Route element={<ProtectedLayout />}>
                <Route path="/" element={<Home />} />
                <Route
                  path="/residents"
                  element={
                    <Suspense fallback={<PageLoader />}>
                      <Residents />
                    </Suspense>
                  }
                />
                <Route
                  path="/houses"
                  element={
                    <Suspense fallback={<PageLoader />}>
                      <RoleGuard allowed={['pengurus', 'bendahara', 'admin']}>
                        <Houses />
                      </RoleGuard>
                    </Suspense>
                  }
                />
                <Route
                  path="/payment-matrix"
                  element={
                    <Suspense fallback={<PageLoader />}>
                      <PaymentMatrix />
                    </Suspense>
                  }
                />
                <Route
                  path="/reports"
                  element={
                    <Suspense fallback={<PageLoader />}>
                      <RoleGuard allowed={['pengurus', 'bendahara', 'admin']}>
                        <Reports />
                      </RoleGuard>
                    </Suspense>
                  }
                />
                <Route
                  path="/settings"
                  element={
                    <Suspense fallback={<PageLoader />}>
                      <RoleGuard allowed={['pengurus', 'bendahara', 'admin']}>
                        <Settings />
                      </RoleGuard>
                    </Suspense>
                  }
                />
                <Route
                  path="/expenses"
                  element={
                    <Suspense fallback={<PageLoader />}>
                      <RoleGuard allowed={['bendahara', 'admin']}>
                        <Expenses />
                      </RoleGuard>
                    </Suspense>
                  }
                />
                <Route
                  path="/users"
                  element={
                    <Suspense fallback={<PageLoader />}>
                      <RoleGuard allowed={['pengurus', 'bendahara', 'admin']}>
                        <Users />
                      </RoleGuard>
                    </Suspense>
                  }
                />
                <Route
                  path="/logs"
                  element={
                    <Suspense fallback={<PageLoader />}>
                      <RoleGuard allowed={['admin']}>
                        <Logs />
                      </RoleGuard>
                    </Suspense>
                  }
                />
                <Route
                  path="/user-approval"
                  element={
                    <Suspense fallback={<PageLoader />}>
                      <RoleGuard allowed={['pengurus', 'bendahara', 'admin']}>
                        <UserApproval />
                      </RoleGuard>
                    </Suspense>
                  }
                />
                <Route
                  path="/payment-verification"
                  element={
                    <Suspense fallback={<PageLoader />}>
                      <RoleGuard allowed={['bendahara', 'admin']}>
                        <PaymentVerification />
                      </RoleGuard>
                    </Suspense>
                  }
                />
              </Route>

              <Route path="/404" element={<NotFound />} />
              <Route path="*" element={<Navigate to="/404" replace />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}

