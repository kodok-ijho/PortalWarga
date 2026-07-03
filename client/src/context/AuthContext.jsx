import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';

const AuthContext = createContext(null);

const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';
const DEMO_STORAGE_KEY = 'pv_demo_session';

// Akun demo untuk preview UI tanpa project Supabase.
// (hanya aktif saat VITE_DEMO_MODE=true)
const DEMO_ACCOUNTS = {
  'admin@palmvillage.id': {
    password: 'demo123',
    profile: {
      id: 'demo-admin',
      full_name: 'Admin Demo',
      phone: '0812-0000-0001',
      role: 'admin',
      unit_id: null,
      occupancy_status: null,
      is_active: true,
    },
  },
  'rt@palmvillage.id': {
    password: 'demo123',
    profile: {
      id: 'demo-rt',
      full_name: 'Budi (Ketua RT)',
      phone: '0812-0000-0002',
      role: 'rt_rw',
      unit_id: 1,
      occupancy_status: 'owner_occupied',
      is_active: true,
    },
  },
  'warga@palmvillage.id': {
    password: 'demo123',
    profile: {
      id: 'demo-warga',
      full_name: 'Siti Warga',
      phone: '0812-0000-0003',
      role: 'resident',
      unit_id: 2,
      occupancy_status: 'owner_occupied',
      is_active: true,
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
    const acc = DEMO_ACCOUNTS[email.toLowerCase()];
    if (!acc || acc.password !== password) {
      throw new Error('Email atau password demo salah. Coba admin@palmvillage.id / demo123');
    }
    persist(acc.profile);
  }, []);

  const signUp = useCallback(async (email, _password, fullName) => {
    persist({
      id: 'demo-' + Date.now(),
      full_name: fullName || email.split('@')[0],
      phone: null,
      role: 'resident',
      unit_id: null,
      occupancy_status: null,
      is_active: true,
    });
  }, []);

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
  };
}

// ====== Supabase auth (production) ======
function useSupabaseAuth() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (userId) => {
    if (!userId) {
      setProfile(null);
      return;
    }
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, phone, role, unit_id, is_active')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      // eslint-disable-next-line no-console
      console.error('[auth] gagal memuat profil:', error.message);
      setProfile(null);
      return;
    }
    setProfile(data);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      if (session?.user?.id) await fetchProfile(session.user.id);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        setSession(newSession);
        if (newSession?.user?.id) await fetchProfile(newSession.user.id);
        else setProfile(null);
        setLoading(false);
      }
    );

    return () => listener.subscription.unsubscribe();
  }, [fetchProfile]);

  const signIn = useCallback(async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }, []);

  const signUp = useCallback(async (email, password, fullName) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    if (error) throw error;
    return data;
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setProfile(null);
  }, []);

  return {
    session,
    user: session?.user ?? null,
    profile,
    role: profile?.role ?? null,
    isAuthenticated: !!session,
    loading,
    signIn,
    signUp,
    signOut,
  };
}

export function AuthProvider({ children }) {
  const auth = DEMO_MODE ? useDemoAuth() : useSupabaseAuth();
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
