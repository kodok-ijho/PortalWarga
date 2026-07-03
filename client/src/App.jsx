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
const Residents = lazy(() => import('./pages/Residents'));
const PaymentMatrix = lazy(() => import('./pages/PaymentMatrix'));
const Reports = lazy(() => import('./pages/Reports'));
const Settings = lazy(() => import('./pages/Settings'));
const Expenses = lazy(() => import('./pages/Expenses'));

const PageLoader = () => (
  <div className="flex items-center justify-center py-20">
    <div className="h-8 w-8 rounded-full border-2 border-forest-200 border-t-gold-500 animate-spin" />
  </div>
);

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
                      <Reports />
                    </Suspense>
                  }
                />
                <Route
                  path="/settings"
                  element={
                    <Suspense fallback={<PageLoader />}>
                      <Settings />
                    </Suspense>
                  }
                />
                <Route
                  path="/expenses"
                  element={
                    <Suspense fallback={<PageLoader />}>
                      <Expenses />
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
