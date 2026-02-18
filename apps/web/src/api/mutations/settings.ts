import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../client';
import type { SfConnectionInput, GongConnectionInput, SeFieldMappingInput } from '@siesta/shared';

/**
 * Mutation to save Salesforce OAuth credentials.
 */
export function useSaveSfConnection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: SfConnectionInput) =>
      api.post('/settings/sf-connection', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      queryClient.invalidateQueries({ queryKey: ['settings', 'connections'] });
    },
  });
}

/**
 * Mutation to save Gong OAuth credentials.
 */
export function useSaveGongConnection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: GongConnectionInput) =>
      api.post('/settings/gong-connection', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      queryClient.invalidateQueries({ queryKey: ['settings', 'connections'] });
    },
  });
}

/**
 * Mutation to update the SE field mapping.
 */
export function useUpdateSeFieldMapping() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: SeFieldMappingInput) =>
      api.put('/settings/se-field-mapping', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });
}

/**
 * Mutation to update a user's role.
 */
export function useUpdateUserRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, role, sfUserId }: { userId: string; role: string; sfUserId?: string | null }) =>
      api.put(`/users/${userId}/role`, { role, sfUserId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

/**
 * Mutation to trigger a manual sync for a provider.
 */
export function useTriggerSync() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (provider: string) =>
      api.post(`/sync/trigger/${provider}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sync', 'status'] });
    },
  });
}
