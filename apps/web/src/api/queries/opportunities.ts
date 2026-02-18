import { useQuery } from '@tanstack/react-query';
import { api } from '../client';
import type {
  SfOpportunity,
  SfOppContactRole,
  SfActivity,
  KanbanColumn,
  PaginatedResponse,
} from '@siesta/shared';

interface OpportunityFilters {
  assignedSeUserId?: string;
  stageName?: string;
  accountId?: string;
  search?: string;
  minAmount?: number;
  maxAmount?: number;
  closeDateFrom?: string;
  closeDateTo?: string;
  page?: number;
  pageSize?: number;
}

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
 * Fetch paginated opportunities list with filters.
 */
export function useOpportunities(filters: OpportunityFilters = {}) {
  return useQuery<PaginatedResponse<SfOpportunity>>({
    queryKey: ['opportunities', filters],
    queryFn: () =>
      api.get<PaginatedResponse<SfOpportunity>>(
        `/opportunities${buildQueryString(filters)}`,
      ),
  });
}

/**
 * Fetch a single opportunity by ID.
 */
export function useOpportunity(id: string | undefined) {
  return useQuery<SfOpportunity>({
    queryKey: ['opportunities', id],
    queryFn: () => api.get<SfOpportunity>(`/opportunities/${id}`),
    enabled: !!id,
  });
}

/**
 * Fetch contacts with roles for an opportunity.
 */
export function useOpportunityContacts(id: string | undefined) {
  return useQuery<SfOppContactRole[]>({
    queryKey: ['opportunities', id, 'contacts'],
    queryFn: () => api.get<SfOppContactRole[]>(`/opportunities/${id}/contacts`),
    enabled: !!id,
  });
}

/**
 * Fetch activities for an opportunity.
 */
export function useOpportunityActivities(id: string | undefined) {
  return useQuery<SfActivity[]>({
    queryKey: ['opportunities', id, 'activities'],
    queryFn: () => api.get<SfActivity[]>(`/opportunities/${id}/activities`),
    enabled: !!id,
  });
}

/**
 * Fetch kanban data: stages + grouped opportunities.
 */
export function useKanbanData(filters: { assignedSeUserId?: string } = {}) {
  return useQuery<KanbanColumn[]>({
    queryKey: ['opportunities', 'kanban', filters],
    queryFn: () =>
      api.get<KanbanColumn[]>(
        `/opportunities/kanban${buildQueryString(filters)}`,
      ),
  });
}
