import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { authApi, clearToken } from '../services/api';

export interface User {
  id: string;
  email: string;
  displayName: string | null;
  photoURL: string | null;
  githubConnected: boolean;
  githubUsername: string | null;
  tenantId: string;
  role: string;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  connectGitHub: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

const STORAGE_KEY = 'arcwright_user';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [user]);

  const refreshUser = useCallback(async () => {
    try {
      const me = await authApi.getMe();
      const updated: User = {
        id: me.id,
        email: me.email,
        displayName: me.display_name,
        photoURL: me.photo_url,
        githubConnected: !!me.github_username,
        githubUsername: me.github_username,
        tenantId: me.tenant_id,
        role: me.role,
      };
      setUser(updated);
    } catch {
      // Token invalid, clear state
      setUser(null);
      clearToken();
    }
  }, []);

  // On mount, verify token is still valid
  useEffect(() => {
    const token = localStorage.getItem('arcwright_token');
    if (token && user) {
      refreshUser();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const signInWithGoogle = useCallback(async () => {
    setLoading(true);
    // Redirect to Google OAuth via our Workers API
    window.location.href = authApi.getGoogleAuthUrl();
  }, []);

  const signOut = useCallback(async () => {
    clearToken();
    setUser(null);
  }, []);

  const connectGitHub = useCallback(() => {
    // Redirect to GitHub OAuth via our Workers API
    window.location.href = authApi.getGitHubAuthUrl();
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, signInWithGoogle, signOut, connectGitHub, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
