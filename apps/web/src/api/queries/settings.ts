import { useQuery } from '@tanstack/react-query';
import { api } from '../client';
import type { AppSetting, User, SyncStatus } from '@siesta/shared';

export interface ConnectionStatus {
  salesforce: {
    configured: boolean;
    connected: boolean;
    instanceUrl: string | null;
  };
  gong: {
    configured: boolean;
    connected: boolean;
  };
}

/**
 * Fetch all application settings.
 */
export function useSettings() {
  return useQuery<AppSetting[]>({
    queryKey: ['settings'],
    queryFn: () => api.get<AppSetting[]>('/settings'),
  });
}

/**
 * Fetch connection status for all providers.
 */
export function useConnectionStatus() {
  return useQuery<ConnectionStatus>({
    queryKey: ['settings', 'connections'],
    queryFn: () => api.get<ConnectionStatus>('/settings/connections'),
  });
}

/**
 * Fetch sync status for all provider/entity combinations.
 */
export function useSyncStatus() {
  return useQuery<SyncStatus[]>({
    queryKey: ['sync', 'status'],
    queryFn: () => api.get<SyncStatus[]>('/sync/status'),
    refetchInterval: 15_000,
  });
}

/**
 * Fetch all users.
 */
export function useUsers() {
  return useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => api.get<User[]>('/users'),
  });
}
