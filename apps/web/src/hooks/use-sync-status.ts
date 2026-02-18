import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

export type ProviderSyncStatus = {
  provider: string;
  status: 'healthy' | 'running' | 'failed' | 'idle';
  lastSyncAt: string | null;
  error: string | null;
};

export type SyncStatusResponse = {
  overall: 'healthy' | 'running' | 'failed' | 'idle';
  providers: ProviderSyncStatus[];
};

export function useSyncStatus() {
  return useQuery<SyncStatusResponse>({
    queryKey: ['sync-status'],
    queryFn: () => api.get<SyncStatusResponse>('/sync/status'),
    refetchInterval: 30_000,
    retry: false,
  });
}
