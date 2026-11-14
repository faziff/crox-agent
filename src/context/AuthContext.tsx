import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../services/api';
import { UserProfile } from '../types/workflow';

interface AuthContextValue {
  user: UserProfile | null;
  loading: boolean;
  theme: 'light' | 'dark';
  setThemeLocal: (theme: 'light' | 'dark') => void;
  setUser: React.Dispatch<React.SetStateAction<UserProfile | null>>;
  refreshUser: () => Promise<void>;
  login: (email: string, password: string) => Promise<UserProfile>;
  loginDemo: () => Promise<UserProfile>;
  register: (fullName: string, email: string, password: string, confirmPassword: string) => Promise<UserProfile>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      const saved = window.localStorage.getItem('crox_theme');
      if (saved === 'dark') return 'dark';
    }
    return 'dark';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    window.localStorage.setItem('crox_theme', theme);
  }, [theme]);

  useEffect(() => {
    const onUnauthorized = () => {
      setUser(null);
    };
    window.addEventListener('crox:unauthorized', onUnauthorized);
    return () => window.removeEventListener('crox:unauthorized', onUnauthorized);
  }, []);

  const setThemeLocal = useCallback((next: 'light' | 'dark') => {
    setTheme(next);
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const res = await api.auth.me();
      setUser(res.user);
      if (res.user.theme === 'dark' || res.user.theme === 'light') {
        setTheme(res.user.theme);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.auth.login(email, password);
    setUser(res.user);
    if (res.user.theme === 'dark' || res.user.theme === 'light') {
      setTheme(res.user.theme);
    }
    return res.user;
  }, []);

  const loginDemo = useCallback(async () => {
    const res = await api.auth.demo();
    setUser(res.user);
    if (res.user.theme === 'dark' || res.user.theme === 'light') {
      setTheme(res.user.theme);
    }
    return res.user;
  }, []);

  const register = useCallback(
    async (fullName: string, email: string, password: string, confirmPassword: string) => {
      const res = await api.auth.register(fullName, email, password, confirmPassword);
      setUser(res.user);
      setTheme(res.user.theme === 'light' ? 'light' : 'dark');
      return res.user;
    },
    []
  );

  const logout = useCallback(async () => {
    await api.auth.logout();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        theme,
        setThemeLocal,
        setUser,
        refreshUser,
        login,
        loginDemo,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
