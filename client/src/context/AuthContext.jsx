import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { registerUnauthorizedHandler, portalApiPost } from '../services/apiClient';

const AuthContext = createContext(null);

const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';
const DEMO_STORAGE_KEY = 'pv_demo_session';
const APP_TOKEN_STORAGE_KEY = 'pv_app_jwt';
const APP_USER_STORAGE_KEY = 'pv_current_user';
const APP_TOKEN_EXPIRES_AT_STORAGE_KEY = 'pv_app_jwt_expires_at';
const N8N_API_BASE_URL = (import.meta.env.VITE_N8N_API_BASE_URL || '').replace(/\/+$/, '');
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

// Akun demo untuk preview UI tanpa project Supabase.
// (hanya aktif saat VITE_DEMO_MODE=true)
const DEMO_ACCOUNTS = {
  'admin@palmvillage.id': {
    password: 'demo123',
    profile: {
      id: 'demo-admin',
      full_name: 'Pak Hendra (Admin)',
      phone: '0812-1000-0001',
      role: 'admin',
      unit_id: null,
      occupancy_status: null,
      is_active: true,
      email: 'admin@palmvillage.id',
    },
  },
  'bendahara@palmvillage.id': {
    password: 'demo123',
    profile: {
      id: 'demo-bendahara',
      full_name: 'Budi Santoso (Bendahara)',
      phone: '0813-2000-0002',
      role: 'bendahara',
      unit_id: 1,
      occupancy_status: 'owner_occupied',
      is_active: true,
      email: 'bendahara@palmvillage.id',
    },
  },
  'pengurus@palmvillage.id': {
    password: 'demo123',
    profile: {
      id: 'demo-pengurus',
      full_name: 'Ibu Ratna (Pengurus RT)',
      phone: '0814-3000-0003',
      role: 'pengurus',
      unit_id: 6,
      occupancy_status: 'owner_occupied',
      is_active: true,
      email: 'pengurus@palmvillage.id',
    },
  },
  'warga@palmvillage.id': {
    password: 'demo123',
    profile: {
      id: 'demo-warga',
      full_name: 'Siti Rahayu',
      phone: '0812-3000-0003',
      role: 'warga',
      unit_id: 2,
      occupancy_status: 'owner_occupied',
      is_active: true,
      email: 'warga@palmvillage.id',
    },
  },
};

const DEMO_USERS = Object.values(DEMO_ACCOUNTS).map((a) => a.profile);

// ====== Demo auth (mock, tanpa Supabase) ======
function useDemoAuth() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem(DEMO_STORAGE_KEY);
    if (saved) setProfile(JSON.parse(saved));
    setLoading(false);
  }, []);

  const persist = (p) => {
    setProfile(p);
    if (p) localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(p));
    else localStorage.removeItem(DEMO_STORAGE_KEY);
  };

  const signIn = useCallback(async (email, password) => {
    const emailLower = email.toLowerCase();
    // 1. Coba cari di DEMO_ACCOUNTS (akun demo bawaan)
    const acc = DEMO_ACCOUNTS[emailLower];
    if (acc) {
      if (acc.password !== password) {
        throw new Error('Email atau password demo salah. Coba admin@palmvillage.id / demo123');
      }
      persist(acc.profile);
      return;
    }
    // 2. Cari di mockProfiles (user hasil registrasi / dynamic)
    const { mockProfiles } = await import('../services/mockData');
    const found = mockProfiles.find(
      (p) => p.email?.toLowerCase() === emailLower
    );
    if (!found) {
      throw new Error('Email atau password salah.');
    }
    // Cek approval status
    if (found.approval_status === 'pending') {
      throw new Error('Akun Anda belum disetujui oleh pengurus. Silakan tunggu proses verifikasi.');
    }
    if (found.approval_status === 'rejected') {
      throw new Error('Pendaftaran Anda ditolak oleh pengurus. Silakan hubungi pengelola.');
    }
    if (!found.is_active) {
      throw new Error('Akun Anda telah dinonaktifkan. Silakan hubungi pengelola.');
    }
    // Password check untuk non-demo accounts (demo: semua pakai 'demo123')
    if (password !== 'demo123') {
      throw new Error('Password salah.');
    }
    persist(found);
  }, []);

  const signUp = useCallback(async (email, _password, fullName, phone) => {
    // Cek apakah email sudah terdaftar
    const { mockProfiles } = await import('../services/mockData');
    const exists = mockProfiles.find(
      (p) => p.email?.toLowerCase() === email.toLowerCase()
    );
    if (exists) {
      throw new Error('Email sudah terdaftar. Silakan gunakan email lain.');
    }
    // Buat profil pending (TIDAK auto-login)
    const newProfile = {
      id: 'reg-' + Date.now(),
      full_name: fullName || email.split('@')[0],
      phone: phone || null,
      email: email.toLowerCase(),
      role: 'warga',
      unit_id: null,
      occupancy_status: null,
      is_active: false,
      approval_status: 'pending',
      registered_at: new Date().toISOString(),
    };
    mockProfiles.push(newProfile);
    // Return khusus: jangan persist session, kembalikan info pending
    return { pending: true, message: 'Pendaftaran berhasil! Silakan tunggu persetujuan dari pengurus RT.' };
  }, []);

  const updateProfile = useCallback(async (newProps) => {
    const { updateMockUser } = await import('../services/mockData');
    if (profile) {
      const updated = updateMockUser(profile.id, newProps);
      if (updated) {
        persist(updated);
        return updated;
      }
    }
    return null;
  }, [profile]);

  const signOut = useCallback(async () => persist(null), []);

  return {
    session: profile ? { user: { id: profile.id } } : null,
    user: profile ? { id: profile.id } : null,
    profile,
    role: profile?.role ?? null,
    isAuthenticated: !!profile,
    loading,
    signIn,
    signUp,
    signOut,
    updateProfile,
  };
}



function extractCurrentUser(data) {
  return data?.currentUser || data?.profile || data?.user || null;
}

function decodeJwtPayload(token) {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const decoded = atob(padded);
    return JSON.parse(decoded);
  } catch (_error) {
    return null;
  }
}

function resolveTokenExpiry(token, expiresAt) {
  if (expiresAt) return expiresAt;
  const payload = decodeJwtPayload(token);
  return payload?.exp ? new Date(payload.exp * 1000).toISOString() : null;
}

function hasExpired(expiresAt) {
  if (!expiresAt) return false;
  const time = Date.parse(expiresAt);
  return Number.isFinite(time) && time <= Date.now();
}

function mapAuthError(error) {
  switch (error?.code) {
    case 'PENDING_APPROVAL':
      return {
        status: 'pending_approval',
        message: error.message || 'Akun masih menunggu verifikasi pengurus.',
      };
    case 'ACCOUNT_REJECTED':
      return {
        status: 'rejected',
        message: error.message || 'Pendaftaran Anda ditolak. Silakan hubungi pengurus.',
      };
    case 'SUSPENDED_USER':
      return {
        status: 'suspended',
        message: error.message || 'Akun tidak aktif. Hubungi pengurus.',
      };
    case 'UNAUTHORIZED':
    case 'INVALID_TOKEN':
    case 'TOKEN_EXPIRED':
      return {
        status: 'invalid_session',
        message: error.message || 'Sesi berakhir. Silakan login ulang.',
      };
    default:
      return {
        status: error?.status === 403 ? 'forbidden' : 'session_check_failed',
        message: error?.message || 'Sesi tidak dapat diverifikasi. Silakan login ulang.',
      };
  }
}

// ====== n8n App JWT auth (production) ======
function useProductionAuth() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [accountStatus, setAccountStatus] = useState(null);
  const [authError, setAuthError] = useState(null);
  const [tokenExpiresAt, setTokenExpiresAt] = useState(null);

  const persist = useCallback((token, currentUser, expiresAt) => {
    if (token && currentUser) {
      const resolvedExpiresAt = resolveTokenExpiry(token, expiresAt);
      localStorage.setItem(APP_TOKEN_STORAGE_KEY, token);
      localStorage.setItem(APP_USER_STORAGE_KEY, JSON.stringify(currentUser));
      if (resolvedExpiresAt) {
        localStorage.setItem(APP_TOKEN_EXPIRES_AT_STORAGE_KEY, resolvedExpiresAt);
      } else {
        localStorage.removeItem(APP_TOKEN_EXPIRES_AT_STORAGE_KEY);
      }
      setSession({ access_token: token, user: { id: currentUser.id, email: currentUser.email } });
      setProfile(currentUser);
      setAccountStatus(currentUser.approval_status || 'approved');
      setAuthError(null);
      setTokenExpiresAt(resolvedExpiresAt);
      return;
    }

    localStorage.removeItem(APP_TOKEN_STORAGE_KEY);
    localStorage.removeItem(APP_USER_STORAGE_KEY);
    localStorage.removeItem(APP_TOKEN_EXPIRES_AT_STORAGE_KEY);
    setSession(null);
    setProfile(null);
    setTokenExpiresAt(null);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const restoreSession = async () => {
      const token = localStorage.getItem(APP_TOKEN_STORAGE_KEY);
      const savedUser = localStorage.getItem(APP_USER_STORAGE_KEY);
      const savedExpiresAt = localStorage.getItem(APP_TOKEN_EXPIRES_AT_STORAGE_KEY);

      if (!token) {
        persist(null, null);
        if (!cancelled) setLoading(false);
        return;
      }

      if (hasExpired(savedExpiresAt)) {
        persist(null, null);
        if (!cancelled) {
          setAccountStatus('invalid_session');
          setAuthError('Sesi berakhir. Silakan login ulang.');
          setLoading(false);
        }
        return;
      }

      try {
        if (savedUser) {
          const currentUser = JSON.parse(savedUser);
          if (!cancelled) {
            setSession({ access_token: token, user: { id: currentUser.id, email: currentUser.email } });
            setProfile(currentUser);
            setAccountStatus(currentUser.approval_status || 'approved');
            setTokenExpiresAt(savedExpiresAt || resolveTokenExpiry(token, null));
          }
        }

        const data = await portalApiPost('/auth/me', { token });
        if (cancelled) return;

        const currentUser = extractCurrentUser(data);
        if (!currentUser) {
          throw new Error('Profil sesi tidak diterima dari server.');
        }

        persist(token, currentUser, savedExpiresAt || resolveTokenExpiry(token, null));
      } catch (error) {
        const authState = mapAuthError(error);
        persist(null, null);
        if (!cancelled) {
          setAccountStatus(authState.status);
          setAuthError(authState.message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    restoreSession();

    return () => {
      cancelled = true;
    };
  }, [persist]);

  const signInWithGoogle = useCallback(async (idToken) => {
    let data;
    setAuthError(null);
    setAccountStatus(null);
    try {
      data = await portalApiPost('/auth/google', {
        body: { id_token: idToken },
      });
    } catch (error) {
      const authState = mapAuthError(error);
      persist(null, null);
      setAccountStatus(authState.status);
      setAuthError(authState.message);
      throw error;
    }

    const currentUser = extractCurrentUser(data);
    const approvalStatus = data?.approval_status || currentUser?.approval_status || data?.status || null;

    if (approvalStatus === 'pending_approval' || approvalStatus === 'pending') {
      persist(null, null);
      setAccountStatus('pending_approval');
      setAuthError(data?.message || 'Akun Anda menunggu persetujuan pengurus.');
      return {
        pending: true,
        message: data?.message || 'Akun Anda menunggu persetujuan pengurus.',
        currentUser,
      };
    }

    if (approvalStatus === 'rejected' || approvalStatus === 'suspended') {
      persist(null, null);
      setAccountStatus(approvalStatus);
      setAuthError(
        approvalStatus === 'suspended'
          ? 'Akun Anda sedang dinonaktifkan. Silakan hubungi pengurus.'
          : 'Pendaftaran Anda ditolak. Silakan hubungi pengurus.'
      );
      throw new Error(
        approvalStatus === 'suspended'
          ? 'Akun Anda sedang dinonaktifkan. Silakan hubungi pengurus.'
          : 'Pendaftaran Anda ditolak. Silakan hubungi pengurus.'
      );
    }

    const appToken = data?.app_jwt || data?.appJwt || data?.token || data?.access_token;
    if (!appToken || !currentUser) {
      throw new Error('Login Google berhasil, tetapi App JWT belum diterima.');
    }

    persist(appToken, currentUser, data?.expires_at || data?.expiresAt);
    return { currentUser };
  }, [persist]);

  const signIn = useCallback(async () => {
    throw new Error('Production mode hanya mendukung login Google.');
  }, []);

  const signUp = useCallback(async () => {
    throw new Error('Pendaftaran production dilakukan melalui login Google.');
  }, []);

  const signOut = useCallback(async () => {
    persist(null, null);
    setAccountStatus(null);
    setAuthError(null);
    if (window.google?.accounts?.id?.disableAutoSelect) {
      window.google.accounts.id.disableAutoSelect();
    }
  }, [persist]);

  useEffect(() => {
    registerUnauthorizedHandler(() => {
      signOut();
    });
  }, [signOut]);

  const updateProfile = useCallback(async (newProps) => {
    if (!profile) return null;
    const editableProps = {
      ...(Object.prototype.hasOwnProperty.call(newProps, 'full_name') ? { full_name: newProps.full_name } : {}),
      ...(Object.prototype.hasOwnProperty.call(newProps, 'phone') ? { phone: newProps.phone } : {}),
      ...(Object.prototype.hasOwnProperty.call(newProps, 'avatar_url') ? { avatar_url: newProps.avatar_url } : {}),
    };
    const updated = { ...profile, ...editableProps };
    persist(session?.access_token, updated, tokenExpiresAt);
    return updated;
  }, [persist, profile, session?.access_token, tokenExpiresAt]);

  return {
    session,
    user: session?.user ?? null,
    profile,
    role: profile?.role ?? null,
    isAuthenticated: !!session,
    loading,
    accountStatus,
    authError,
    tokenExpiresAt,
    signIn,
    signUp,
    signInWithGoogle,
    signOut,
    updateProfile,
  };
}

export function AuthProvider({ children }) {
  const auth = DEMO_MODE ? useDemoAuth() : useProductionAuth();
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth harus dipakai di dalam <AuthProvider>');
  return ctx;
}

// Export konstanta untuk dipakai di komponen lain (mis. Login menampilkan info akun demo).
export const IS_DEMO_MODE = DEMO_MODE;
export const DEMO_ACCOUNT_LIST = DEMO_USERS;
export const GOOGLE_AUTH_READY = Boolean(GOOGLE_CLIENT_ID && N8N_API_BASE_URL);
export const GOOGLE_OAUTH_CLIENT_ID = GOOGLE_CLIENT_ID;
export const PORTAL_API_BASE_URL = N8N_API_BASE_URL;
