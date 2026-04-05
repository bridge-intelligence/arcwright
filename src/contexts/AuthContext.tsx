import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';

export interface User {
  id: string;
  email: string;
  displayName: string | null;
  photoURL: string | null;
  githubConnected: boolean;
  tenantId: string;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  connectGitHub: () => Promise<void>;
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

  const signInWithGoogle = useCallback(async () => {
    setLoading(true);
    try {
      // TODO: Replace with real Google OAuth flow
      // For now, simulate a successful sign-in for development
      await new Promise(resolve => setTimeout(resolve, 800));

      const mockUser: User = {
        id: crypto.randomUUID(),
        email: 'dev@arcwright.dev',
        displayName: 'Dev User',
        photoURL: null,
        githubConnected: false,
        tenantId: crypto.randomUUID(),
      };
      setUser(mockUser);
    } finally {
      setLoading(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    setUser(null);
  }, []);

  const connectGitHub = useCallback(async () => {
    if (!user) return;
    // TODO: Replace with real GitHub OAuth flow
    await new Promise(resolve => setTimeout(resolve, 500));
    setUser(prev => prev ? { ...prev, githubConnected: true } : null);
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, loading, signInWithGoogle, signOut, connectGitHub }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
