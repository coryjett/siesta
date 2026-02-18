import { eq, and, gte, lte, desc } from 'drizzle-orm';
import { db } from '../db/client.js';
import { sfActivities } from '../db/schema/index.js';
import { getActiveOpportunities, getAttentionItems } from './opportunities.service.js';
import { getRecentCalls } from './gong.service.js';

type UserRole = 'se' | 'se_manager' | 'admin';

interface HomepageData {
  activeOpps: Awaited<ReturnType<typeof getActiveOpportunities>>;
  attentionItems: Awaited<ReturnType<typeof getAttentionItems>>;
  upcomingActivities: typeof sfActivities.$inferSelect[];
  recentCalls: Awaited<ReturnType<typeof getRecentCalls>>;
}

/**
 * Get homepage data for the current user.
 * SEs see their own data, managers/admins see all.
 */
export async function getHomepageData(
  userId: string,
  role: UserRole,
): Promise<HomepageData> {
  // SEs are scoped to their own data; managers/admins see everything
  const seUserId = role === 'se' ? userId : undefined;

  const now = new Date();
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [activeOpps, attentionItems, upcomingActivities, recentCalls] = await Promise.all([
    getActiveOpportunities(seUserId),
    getAttentionItems(seUserId),
    // Upcoming activities: events in the next 7 days
    db
      .select()
      .from(sfActivities)
      .where(
        and(
          eq(sfActivities.activityType, 'event'),
          gte(sfActivities.activityDate, now),
          lte(sfActivities.activityDate, sevenDaysFromNow),
        ),
      )
      .orderBy(sfActivities.activityDate)
      .limit(20),
    getRecentCalls(5),
  ]);

  return {
    activeOpps,
    attentionItems,
    upcomingActivities,
    recentCalls,
  };
}
