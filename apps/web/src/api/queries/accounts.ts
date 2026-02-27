import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
    staleTime: 10 * 60 * 1000, // 10 min — matches server Redis TTL
  });
}

export function useAccount(id: string | undefined) {
  return useQuery<AccountDetail>({
    queryKey: ['accounts', id],
    queryFn: () => api.get<AccountDetail>(`/accounts/${id}`),
    enabled: !!id,
    staleTime: 5 * 60 * 1000, // 5 min — matches server Redis TTL
    retry: 1,
  });
}

export function useAccountContacts(id: string | undefined) {
  return useQuery<Contact[]>({
    queryKey: ['accounts', id, 'contacts'],
    queryFn: () => api.get<Contact[]>(`/accounts/${id}/contacts`),
    enabled: !!id,
    staleTime: 10 * 60 * 1000, // 10 min — matches server Redis TTL
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
    staleTime: 5 * 60 * 1000, // 5 min — matches server Redis TTL
    retry: 1,
  });
}

export function useAccountOpportunities(id: string | undefined) {
  return useQuery<Opportunity[]>({
    queryKey: ['accounts', id, 'opportunities'],
    queryFn: () => api.get<Opportunity[]>(`/accounts/${id}/opportunities`),
    enabled: !!id,
    staleTime: 10 * 60 * 1000, // 10 min — matches server Redis TTL
  });
}

export function useAccountIssues(id: string | undefined) {
  return useQuery<Issue[]>({
    queryKey: ['accounts', id, 'issues'],
    queryFn: () => api.get<Issue[]>(`/accounts/${id}/issues`),
    enabled: !!id,
    staleTime: 5 * 60 * 1000, // 5 min — matches server Redis TTL
  });
}

export function useAccountTasks(id: string | undefined) {
  return useQuery<Task[]>({
    queryKey: ['accounts', id, 'tasks'],
    queryFn: () => api.get<Task[]>(`/accounts/${id}/tasks`),
    enabled: !!id,
    staleTime: 5 * 60 * 1000, // 5 min — matches server Redis TTL
  });
}

export function useAccountArchitecture(id: string | undefined) {
  return useQuery<ArchitectureDoc>({
    queryKey: ['accounts', id, 'architecture'],
    queryFn: () => api.get<ArchitectureDoc>(`/accounts/${id}/architecture`),
    enabled: !!id,
    staleTime: 15 * 60 * 1000, // 15 min — matches server Redis TTL
  });
}

export function useAccountSentiment(id: string | undefined) {
  return useQuery<SentimentData>({
    queryKey: ['accounts', id, 'sentiment'],
    queryFn: () => api.get<SentimentData>(`/accounts/${id}/sentiment`),
    enabled: !!id,
    staleTime: 15 * 60 * 1000, // 15 min — matches server Redis TTL
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

export interface TechnicalDetailsResponse {
  details: string | null;
}

export function useAccountTechnicalDetails(id: string | undefined) {
  return useQuery<TechnicalDetailsResponse>({
    queryKey: ['accounts', id, 'technical-details'],
    queryFn: () => api.get<TechnicalDetailsResponse>(`/accounts/${id}/technical-details`),
    enabled: !!id,
    staleTime: 60 * 60 * 1000,
    retry: 1,
  });
}

export interface POCSummaryResponse {
  summary: string | null;
  health: { rating: 'green' | 'yellow' | 'red'; reason: string } | null;
}

export function useAccountPOCSummary(id: string | undefined) {
  return useQuery<POCSummaryResponse>({
    queryKey: ['accounts', id, 'poc-summary'],
    queryFn: () => api.get<POCSummaryResponse>(`/accounts/${id}/poc-summary`),
    enabled: !!id,
    staleTime: 60 * 60 * 1000,
    retry: 1,
  });
}

export interface ActionItem {
  id: string;
  action: string;
  source: string;
  sourceType: string;
  recordId: string | null;
  date: string;
  owner: string | null;
  status: 'open' | 'done';
  completedAt: string | null;
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

export interface MeetingBriefResponse {
  brief: string | null;
}

export function useMeetingBrief(accountId: string | undefined, title: string | undefined, date?: string) {
  return useQuery<MeetingBriefResponse>({
    queryKey: ['accounts', accountId, 'meeting-brief', title, date],
    queryFn: () => {
      const params = new URLSearchParams();
      if (title) params.set('title', title);
      if (date) params.set('date', date);
      return api.get<MeetingBriefResponse>(
        `/accounts/${accountId}/meeting-brief?${params.toString()}`,
      );
    },
    enabled: !!accountId && !!title,
    staleTime: 60 * 60 * 1000,
    retry: 1,
  });
}

export interface ContactPersonalInfoEntry {
  value: string;
  date?: string;
}

export interface ContactPersonalInfo {
  location?: ContactPersonalInfoEntry;
  interests?: ContactPersonalInfoEntry;
  family?: ContactPersonalInfoEntry;
  hobbies?: ContactPersonalInfoEntry;
  background?: ContactPersonalInfoEntry;
  travel?: ContactPersonalInfoEntry;
  other?: ContactPersonalInfoEntry;
}

export interface ContactInsight {
  contactName: string;
  personalInfo: ContactPersonalInfo;
  sourceCallTitles: string[];
}

export interface ContactInsightsResponse {
  insights: ContactInsight[];
}

export function useContactInsights(id: string | undefined) {
  return useQuery<ContactInsightsResponse>({
    queryKey: ['accounts', id, 'contact-insights'],
    queryFn: () => api.get<ContactInsightsResponse>(`/accounts/${id}/contact-insights`),
    enabled: !!id,
    staleTime: 24 * 60 * 60 * 1000, // 24 hours — cached indefinitely on server
    retry: 1,
  });
}

export function useWarmGongBriefs() {
  return useMutation({
    mutationFn: (accountId: string) =>
      api.post<{ status: string }>(`/accounts/${accountId}/warm-gong-briefs`, {}),
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

export function useCompleteActionItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ accountId, hash }: { accountId: string; hash: string }) =>
      api.post(`/accounts/${accountId}/action-items/${hash}/complete`),
    onSuccess: (_data, { accountId }) => {
      queryClient.invalidateQueries({ queryKey: ['accounts', accountId, 'action-items'] });
      queryClient.invalidateQueries({ queryKey: ['home', 'my-action-items'] });
    },
  });
}

export function useUncompleteActionItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ accountId, hash }: { accountId: string; hash: string }) =>
      api.delete(`/accounts/${accountId}/action-items/${hash}/complete`),
    onSuccess: (_data, { accountId }) => {
      queryClient.invalidateQueries({ queryKey: ['accounts', accountId, 'action-items'] });
      queryClient.invalidateQueries({ queryKey: ['home', 'my-action-items'] });
    },
  });
}
