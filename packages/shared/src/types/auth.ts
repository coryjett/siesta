export type UserRole = 'se' | 'se_manager' | 'admin';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  sfUserId: string | null;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Session {
  id: string;
  userId: string;
  expiresAt: string;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  authMode: 'google' | 'dev-bypass' | null;
}

export interface DevBypassLoginRequest {
  email: string;
  name: string;
  role: UserRole;
}
