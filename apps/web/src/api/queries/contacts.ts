import { useQuery } from '@tanstack/react-query';
import { api } from '../client';
import type { Contact } from '@siesta/shared';

export interface ContactWithAccount extends Contact {
  accountId: string;
  accountName: string;
}

export function useAllContacts() {
  return useQuery<ContactWithAccount[]>({
    queryKey: ['contacts'],
    queryFn: () => api.get<ContactWithAccount[]>('/contacts'),
    staleTime: 10 * 60 * 1000, // 10 min — matches server Redis TTL for contacts
  });
}
