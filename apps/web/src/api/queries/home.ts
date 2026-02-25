import { useQuery } from '@tanstack/react-query';
import { api } from '../client';
import type { HomeData } from '@siesta/shared';

export function useHomeData() {
  return useQuery<HomeData>({
    queryKey: ['home'],
    queryFn: () => api.get<HomeData>('/home'),
  });
}
