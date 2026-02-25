import { useQuery } from '@tanstack/react-query';
import { api } from '../client';
import type { PortfolioStats } from '@siesta/shared';

export function usePortfolioStats() {
  return useQuery<PortfolioStats>({
    queryKey: ['portfolio', 'stats'],
    queryFn: () => api.get<PortfolioStats>('/portfolio/stats'),
  });
}
