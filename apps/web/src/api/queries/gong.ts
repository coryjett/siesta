import { useQuery } from '@tanstack/react-query';
import { api } from '../client';
import type { GongCall, GongTranscript } from '@siesta/shared';

interface GongCallFilters {
  accountId?: string;
  opportunityId?: string;
  fromDate?: string;
  toDate?: string;
  page?: number;
  pageSize?: number;
}

interface PaginatedCalls {
  calls: Array<GongCall & { accountName?: string | null; opportunityName?: string | null }>;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

type CallWithTranscript = GongCall & {
  accountName?: string | null;
  opportunityName?: string | null;
  transcript: GongTranscript | null;
};

function buildQueryString(filters: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value));
    }
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/**
 * Fetch paginated Gong calls with optional filters.
 */
export function useCalls(filters: GongCallFilters = {}) {
  return useQuery<PaginatedCalls>({
    queryKey: ['gong-calls', filters],
    queryFn: () =>
      api.get<PaginatedCalls>(
        `/gong/calls${buildQueryString(filters)}`,
      ),
  });
}

/**
 * Fetch a single Gong call by ID, including its transcript.
 */
export function useCall(id: string | undefined) {
  return useQuery<CallWithTranscript>({
    queryKey: ['gong-calls', id],
    queryFn: () => api.get<CallWithTranscript>(`/gong/calls/${id}`),
    enabled: !!id,
  });
}

/**
 * Fetch the transcript for a specific Gong call.
 */
export function useCallTranscript(callId: string | undefined) {
  return useQuery<GongTranscript>({
    queryKey: ['gong-transcripts', callId],
    queryFn: () => api.get<GongTranscript>(`/gong/calls/${callId}/transcript`),
    enabled: !!callId,
  });
}

/**
 * Fetch the most recent Gong calls.
 */
export function useRecentCalls(limit: number = 10) {
  return useQuery<PaginatedCalls>({
    queryKey: ['gong-calls', 'recent', limit],
    queryFn: () =>
      api.get<PaginatedCalls>(
        `/gong/calls?pageSize=${limit}&page=1`,
      ),
  });
}
