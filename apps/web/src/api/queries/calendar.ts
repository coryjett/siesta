import { useQuery } from '@tanstack/react-query';
import { api } from '../client';

export interface CalendarEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  meetLink: string | null;
  attendees: Array<{ email: string; displayName?: string }>;
}

interface CalendarResponse {
  events: CalendarEvent[];
}

/**
 * Fetch upcoming Google Calendar meetings for the current user.
 * Refetches every 5 minutes.
 */
export function useUpcomingMeetings() {
  return useQuery<CalendarEvent[]>({
    queryKey: ['calendar', 'upcoming'],
    queryFn: async () => {
      const data = await api.get<CalendarResponse>('/calendar/upcoming');
      return data.events;
    },
    refetchInterval: 5 * 60 * 1000, // 5 minutes
  });
}
