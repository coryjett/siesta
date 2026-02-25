import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '../client';
import type {
  Account,
  AccountDetail,
  Contact,
  Interaction,
  Opportunity,
  Issue,
  Task,
  SentimentData,
  ArchitectureDoc,
} from '@siesta/shared';

interface AccountFilters {
  search?: string;
  healthStatus?: string;
  region?: string;
  csmOwner?: string;
  minArr?: number;
  maxArr?: number;
  renewalWithinDays?: number;
  products?: string[];
}

function buildQueryString(filters: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null && value !== '') {
      if (Array.isArray(value)) {
        params.set(key, value.join(','));
      } else {
        params.set(key, String(value));
      }
    }
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function useAccounts(filters: AccountFilters = {}) {
  return useQuery<Account[]>({
    queryKey: ['accounts', filters],
    queryFn: () => api.get<Account[]>(`/accounts${buildQueryString(filters as unknown as Record<string, unknown>)}`),
  });
}

export function useAccount(id: string | undefined) {
  return useQuery<AccountDetail>({
    queryKey: ['accounts', id],
    queryFn: () => api.get<AccountDetail>(`/accounts/${id}`),
    enabled: !!id,
    retry: 1,
  });
}

export function useAccountContacts(id: string | undefined) {
  return useQuery<Contact[]>({
    queryKey: ['accounts', id, 'contacts'],
    queryFn: () => api.get<Contact[]>(`/accounts/${id}/contacts`),
    enabled: !!id,
  });
}

export function useAccountInteractions(id: string | undefined, filters: {
  sourceTypes?: string[];
  fromDate?: string;
  toDate?: string;
  limit?: number;
} = {}) {
  return useQuery<Interaction[]>({
    queryKey: ['accounts', id, 'interactions', filters],
    queryFn: () => api.get<Interaction[]>(`/accounts/${id}/interactions${buildQueryString(filters)}`),
    enabled: !!id,
    retry: 1,
  });
}

export function useAccountOpportunities(id: string | undefined) {
  return useQuery<Opportunity[]>({
    queryKey: ['accounts', id, 'opportunities'],
    queryFn: () => api.get<Opportunity[]>(`/accounts/${id}/opportunities`),
    enabled: !!id,
  });
}

export function useAccountIssues(id: string | undefined) {
  return useQuery<Issue[]>({
    queryKey: ['accounts', id, 'issues'],
    queryFn: () => api.get<Issue[]>(`/accounts/${id}/issues`),
    enabled: !!id,
  });
}

export function useAccountTasks(id: string | undefined) {
  return useQuery<Task[]>({
    queryKey: ['accounts', id, 'tasks'],
    queryFn: () => api.get<Task[]>(`/accounts/${id}/tasks`),
    enabled: !!id,
  });
}

export function useAccountArchitecture(id: string | undefined) {
  return useQuery<ArchitectureDoc>({
    queryKey: ['accounts', id, 'architecture'],
    queryFn: () => api.get<ArchitectureDoc>(`/accounts/${id}/architecture`),
    enabled: !!id,
  });
}

export function useAccountSentiment(id: string | undefined) {
  return useQuery<SentimentData>({
    queryKey: ['accounts', id, 'sentiment'],
    queryFn: () => api.get<SentimentData>(`/accounts/${id}/sentiment`),
    enabled: !!id,
    retry: 1,
  });
}

export interface AccountOverviewResponse {
  overview: string | null;
}

export function useAccountOverview(id: string | undefined) {
  return useQuery<AccountOverviewResponse>({
    queryKey: ['accounts', id, 'overview'],
    queryFn: () => api.get<AccountOverviewResponse>(`/accounts/${id}/overview`),
    enabled: !!id,
    staleTime: 60 * 60 * 1000, // 1 hour — matches server Redis TTL
    retry: 1,
  });
}

export interface ActionItem {
  action: string;
  source: string;
  date: string;
  owner: string | null;
  status: 'open' | 'done';
}

export interface ActionItemsResponse {
  items: ActionItem[];
}

export function useAccountActionItems(id: string | undefined) {
  return useQuery<ActionItemsResponse>({
    queryKey: ['accounts', id, 'action-items'],
    queryFn: () => api.get<ActionItemsResponse>(`/accounts/${id}/action-items`),
    enabled: !!id,
    staleTime: 60 * 60 * 1000,
    retry: 1,
  });
}

export interface EmailThreadSummaryResponse {
  summary: string | null;
  emailCount: number;
  participants: string[];
}

interface EmailFallback {
  id: string;
  title: string;
  preview?: string;
  date: string;
  participants?: string[];
}

export function useEmailThreadSummary(
  accountId: string | undefined,
  emailIds: string[],
  emails?: EmailFallback[],
) {
  return useQuery<EmailThreadSummaryResponse>({
    queryKey: ['accounts', accountId, 'email-thread-summary', emailIds],
    queryFn: () =>
      api.post<EmailThreadSummaryResponse>(`/accounts/${accountId}/email-thread-summary`, {
        emailIds,
        emails,
      }),
    enabled: !!accountId && emailIds.length > 0,
    staleTime: 24 * 60 * 60 * 1000, // 24 hours — matches server Redis TTL
    retry: 1,
  });
}
