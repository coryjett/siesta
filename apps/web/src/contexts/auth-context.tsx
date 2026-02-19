import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import type { User, AuthState, UserRole } from '@siesta/shared';

interface AuthContextType extends AuthState {
  login: () => void;
  logout: () => Promise<void>;
  refetch: () => Promise<void>;
  setRole: (role: UserRole) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    isAuthenticated: false,
    isLoading: true,
    authMode: null,
  });

  const fetchUser = async () => {
    try {
      const res = await fetch('/auth/me', { credentials: 'include' });
      if (!res.ok) throw new Error('Not authenticated');
      const data = await res.json();
      setState({ user: data.user, isAuthenticated: true, isLoading: false, authMode: data.authMode });
    } catch {
      setState({ user: null, isAuthenticated: false, isLoading: false, authMode: null });
    }
  };

  useEffect(() => {
    fetchUser();
  }, []);

  const login = () => {
    window.location.href = '/auth/login';
  };

  const logout = async () => {
    await fetch('/auth/logout', { method: 'POST', credentials: 'include' });
    setState({ user: null, isAuthenticated: false, isLoading: false, authMode: null });
    window.location.href = '/login';
  };

  const setRole = async (role: UserRole) => {
    await fetch('/auth/dev-set-role', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ role }),
    });
    await fetchUser();
  };

  return (
    <AuthContext.Provider value={{ ...state, login, logout, refetch: fetchUser, setRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
