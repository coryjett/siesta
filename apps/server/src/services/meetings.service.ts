import { cachedCall } from './cache.service.js';
import { getAccountInteractions } from './mcp-accounts.service.js';
import { logger } from '../utils/logger.js';

export interface UpcomingMeeting {
  id: string;
  accountId: string;
  accountName: string;
  title: string;
  date: string;
  participants: string[];
}

/**
 * Get upcoming meetings for the current user across all their accounts.
 * Filters calendar events to future meetings where the user is a participant.
 * Cached 5 min.
 */
export async function getUpcomingMeetings(
  userName: string,
  userEmail: string,
  accounts: Array<{ id: string; name: string }>,
): Promise<UpcomingMeeting[]> {
  const cacheKey = `meetings:upcoming:${userName}`;

  return cachedCall<UpcomingMeeting[]>(cacheKey, 300, async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const results = await Promise.allSettled(
      accounts.map(async (account) => {
        const interactions = (await getAccountInteractions(account.id, {
          sourceTypes: ['calendar_event'],
        })) as Array<Record<string, unknown>>;

        return interactions
          .filter((i) => {
            const dateStr = String(i.date ?? '');
            if (!dateStr) return false;
            const meetingDate = new Date(dateStr);
            return meetingDate >= today;
          })
          .filter((i) => {
            const participants = (i.participants ?? []) as Array<string | Record<string, unknown>>;

            // If MCP doesn't provide participants, include the meeting —
            // it's already on one of the user's accounts (CSE owner or interaction participant)
            if (participants.length === 0) return true;

            const nameLower = userName.toLowerCase();
            const emailLower = userEmail.toLowerCase();

            return participants.some((p) => {
              const pStr = typeof p === 'string' ? p : String(p.name ?? p.email ?? '');
              const pLower = pStr.toLowerCase();
              return pLower.includes(nameLower) || pLower.includes(emailLower)
                || nameLower.includes(pLower)
                || (typeof p === 'object' && p.email && String(p.email).toLowerCase() === emailLower);
            });
          })
          .map((i): UpcomingMeeting => ({
            id: String(i.id ?? ''),
            accountId: account.id,
            accountName: account.name,
            title: String(i.title ?? 'Untitled Meeting'),
            date: String(i.date ?? ''),
            participants: ((i.participants ?? []) as Array<string | Record<string, unknown>>).map(
              (p) => typeof p === 'string' ? p : String(p.name ?? p.email ?? 'Unknown'),
            ),
          }));
      }),
    );

    const meetings: UpcomingMeeting[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled') {
        meetings.push(...result.value);
      }
    }

    // Sort by date ascending (soonest first)
    meetings.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    logger.info(
      { userName, accountCount: accounts.length, meetingCount: meetings.length },
      '[meetings] Found upcoming meetings',
    );

    return meetings;
  });
}
