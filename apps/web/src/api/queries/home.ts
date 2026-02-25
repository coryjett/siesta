import { useQuery } from '@tanstack/react-query';
import { api } from '../client';
import type { HomeData } from '@siesta/shared';
import type { ActionItem } from './accounts';

export function useHomeData() {
  return useQuery<HomeData>({
    queryKey: ['home'],
    queryFn: () => api.get<HomeData>('/home'),
    staleTime: 5 * 60 * 1000, // 5 min — matches server Redis TTL
  });
}

export interface MyActionItemsResponse {
  items: Array<ActionItem & { accountId: string; accountName: string }>;
}

export function useMyActionItems() {
  return useQuery<MyActionItemsResponse>({
    queryKey: ['home', 'my-action-items'],
    queryFn: () => api.get<MyActionItemsResponse>('/home/my-action-items'),
    staleTime: 60 * 60 * 1000,
    retry: 1,
  });
}

export interface UpcomingMeeting {
  id: string;
  accountId: string;
  accountName: string;
  title: string;
  date: string;
  participants: string[];
}

export interface UpcomingMeetingsResponse {
  meetings: UpcomingMeeting[];
}

export function useUpcomingMeetings() {
  return useQuery<UpcomingMeetingsResponse>({
    queryKey: ['home', 'upcoming-meetings'],
    queryFn: () => api.get<UpcomingMeetingsResponse>('/home/upcoming-meetings'),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}
