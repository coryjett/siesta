import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../client';

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
 * Mutation to force reconnect to MCP server.
 */
export function useReconnectMcp() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.post<{ connected: boolean; error: string | null }>('/settings/mcp-reconnect'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'connections'] });
    },
  });
}

/**
 * Mutation to flush the Redis cache.
 */
export function useFlushCache() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.post<{ success: boolean }>('/settings/cache/flush'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'cache'] });
    },
  });
}

/**
 * Mutation to disconnect from support MCP server.
 */
export function useDisconnectSupportMcp() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.post<{ success: boolean }>('/settings/support-mcp-disconnect'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'support-mcp-status'] });
    },
  });
}
