import { eq, desc } from 'drizzle-orm';
import { db } from '../db/client.js';
import { sfActivities, gongCalls, notes, users } from '../db/schema/index.js';
import { parsePagination, buildPaginatedResponse } from '../utils/pagination.js';

interface TimelineItem {
  id: string;
  type: 'activity' | 'call' | 'note';
  date: string;
  title: string;
  preview: string;
  metadata: Record<string, unknown>;
}

/**
 * Get a unified timeline of activities, Gong calls, and notes for
 * a given account or opportunity. Results are sorted by date (newest first)
 * and paginated.
 */
export async function getUnifiedTimeline(
  accountId?: string,
  opportunityId?: string,
  page?: number,
  pageSize?: number,
) {
  const { page: p, pageSize: ps } = parsePagination({ page, pageSize });

  // Fetch all three data sources in parallel
  const [activities, calls, noteRows] = await Promise.all([
    fetchActivities(accountId, opportunityId),
    fetchCalls(accountId, opportunityId),
    fetchNotes(accountId, opportunityId),
  ]);

  // Transform each source into a common TimelineItem shape
  const activityItems: TimelineItem[] = activities.map((a) => ({
    id: a.id,
    type: 'activity' as const,
    date: (a.activityDate ?? a.createdAt).toISOString(),
    title: a.subject ?? 'Activity',
    preview: a.description ? a.description.slice(0, 200) : '',
    metadata: {
      activityType: a.activityType,
      status: a.status,
      priority: a.priority,
      isCompleted: a.isCompleted,
      ownerName: a.ownerName,
    },
  }));

  const callItems: TimelineItem[] = calls.map((c) => ({
    id: c.id,
    type: 'call' as const,
    date: (c.started ?? c.scheduledStart ?? c.createdAt).toISOString(),
    title: c.title ?? 'Call',
    preview: c.scope ?? '',
    metadata: {
      gongId: c.gongId,
      duration: c.duration,
      direction: c.direction,
      media: c.media,
      url: c.url,
      participants: c.participants,
    },
  }));

  const noteItems: TimelineItem[] = noteRows.map((n) => ({
    id: n.id,
    type: 'note' as const,
    date: n.createdAt.toISOString(),
    title: 'Note',
    preview: n.contentPlainText ? n.contentPlainText.slice(0, 200) : '',
    metadata: {
      authorId: n.authorId,
      authorName: n.authorName,
      contentHtml: n.contentHtml,
    },
  }));

  // Merge and sort by date descending
  const allItems = [...activityItems, ...callItems, ...noteItems].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );

  // Paginate the merged result
  const total = allItems.length;
  const offset = (p - 1) * ps;
  const paginatedItems = allItems.slice(offset, offset + ps);

  return buildPaginatedResponse(paginatedItems, total, p, ps);
}

async function fetchActivities(accountId?: string, opportunityId?: string) {
  if (accountId) {
    return db
      .select()
      .from(sfActivities)
      .where(eq(sfActivities.accountId, accountId))
      .orderBy(desc(sfActivities.activityDate));
  }
  if (opportunityId) {
    return db
      .select()
      .from(sfActivities)
      .where(eq(sfActivities.opportunityId, opportunityId))
      .orderBy(desc(sfActivities.activityDate));
  }
  return [];
}

async function fetchCalls(accountId?: string, opportunityId?: string) {
  if (accountId) {
    return db
      .select()
      .from(gongCalls)
      .where(eq(gongCalls.accountId, accountId))
      .orderBy(desc(gongCalls.started));
  }
  if (opportunityId) {
    return db
      .select()
      .from(gongCalls)
      .where(eq(gongCalls.opportunityId, opportunityId))
      .orderBy(desc(gongCalls.started));
  }
  return [];
}

async function fetchNotes(accountId?: string, opportunityId?: string) {
  if (accountId) {
    return db
      .select({
        id: notes.id,
        authorId: notes.authorId,
        authorName: users.name,
        contentHtml: notes.contentHtml,
        contentPlainText: notes.contentPlainText,
        createdAt: notes.createdAt,
      })
      .from(notes)
      .innerJoin(users, eq(notes.authorId, users.id))
      .where(eq(notes.accountId, accountId))
      .orderBy(desc(notes.createdAt));
  }
  if (opportunityId) {
    return db
      .select({
        id: notes.id,
        authorId: notes.authorId,
        authorName: users.name,
        contentHtml: notes.contentHtml,
        contentPlainText: notes.contentPlainText,
        createdAt: notes.createdAt,
      })
      .from(notes)
      .innerJoin(users, eq(notes.authorId, users.id))
      .where(eq(notes.opportunityId, opportunityId))
      .orderBy(desc(notes.createdAt));
  }
  return [];
}
