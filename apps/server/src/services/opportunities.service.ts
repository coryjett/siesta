import { eq, and, ilike, gte, lte, lt, desc, asc, count, ne, or, isNull, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import {
  sfOpportunities,
  sfAccounts,
  sfContacts,
  sfOppContactRoles,
  sfActivities,
  sfOpportunityStages,
  users,
} from '../db/schema/index.js';
import { NotFoundError } from '../utils/errors.js';
import { parsePagination, buildPaginatedResponse } from '../utils/pagination.js';

interface ListOpportunitiesFilters {
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

/**
 * List opportunities with filters and pagination.
 */
export async function listOpportunities(filters: ListOpportunitiesFilters = {}) {
  const { page, pageSize, offset } = parsePagination(filters);

  const conditions = [];

  if (filters.assignedSeUserId) {
    conditions.push(eq(sfOpportunities.assignedSeUserId, filters.assignedSeUserId));
  }
  if (filters.stageName) {
    conditions.push(eq(sfOpportunities.stageName, filters.stageName));
  }
  if (filters.accountId) {
    conditions.push(eq(sfOpportunities.accountId, filters.accountId));
  }
  if (filters.search) {
    conditions.push(ilike(sfOpportunities.name, `%${filters.search}%`));
  }
  if (filters.minAmount != null) {
    conditions.push(gte(sfOpportunities.amount, String(filters.minAmount)));
  }
  if (filters.maxAmount != null) {
    conditions.push(lte(sfOpportunities.amount, String(filters.maxAmount)));
  }
  if (filters.closeDateFrom) {
    conditions.push(gte(sfOpportunities.closeDate, new Date(filters.closeDateFrom)));
  }
  if (filters.closeDateTo) {
    conditions.push(lte(sfOpportunities.closeDate, new Date(filters.closeDateTo)));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [data, totalResult] = await Promise.all([
    db
      .select({
        id: sfOpportunities.id,
        sfId: sfOpportunities.sfId,
        name: sfOpportunities.name,
        accountSfId: sfOpportunities.accountSfId,
        accountId: sfOpportunities.accountId,
        accountName: sfAccounts.name,
        stageName: sfOpportunities.stageName,
        amount: sfOpportunities.amount,
        closeDate: sfOpportunities.closeDate,
        probability: sfOpportunities.probability,
        type: sfOpportunities.type,
        leadSource: sfOpportunities.leadSource,
        nextStep: sfOpportunities.nextStep,
        description: sfOpportunities.description,
        isClosed: sfOpportunities.isClosed,
        isWon: sfOpportunities.isWon,
        ownerId: sfOpportunities.ownerId,
        ownerName: sfOpportunities.ownerName,
        assignedSeSfId: sfOpportunities.assignedSeSfId,
        assignedSeUserId: sfOpportunities.assignedSeUserId,
        assignedSeName: users.name,
        lastActivityDate: sfOpportunities.lastActivityDate,
        createdAt: sfOpportunities.createdAt,
        updatedAt: sfOpportunities.updatedAt,
      })
      .from(sfOpportunities)
      .leftJoin(sfAccounts, eq(sfOpportunities.accountId, sfAccounts.id))
      .leftJoin(users, eq(sfOpportunities.assignedSeUserId, users.id))
      .where(whereClause)
      .orderBy(asc(sfOpportunities.closeDate))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ count: count() })
      .from(sfOpportunities)
      .where(whereClause),
  ]);

  const total = totalResult[0]?.count ?? 0;
  return buildPaginatedResponse(data, total, page, pageSize);
}

/**
 * Get a single opportunity by ID with account info. Throws NotFoundError if not found.
 */
export async function getOpportunity(id: string) {
  const result = await db
    .select({
      id: sfOpportunities.id,
      sfId: sfOpportunities.sfId,
      name: sfOpportunities.name,
      accountSfId: sfOpportunities.accountSfId,
      accountId: sfOpportunities.accountId,
      accountName: sfAccounts.name,
      stageName: sfOpportunities.stageName,
      amount: sfOpportunities.amount,
      closeDate: sfOpportunities.closeDate,
      probability: sfOpportunities.probability,
      type: sfOpportunities.type,
      leadSource: sfOpportunities.leadSource,
      nextStep: sfOpportunities.nextStep,
      description: sfOpportunities.description,
      isClosed: sfOpportunities.isClosed,
      isWon: sfOpportunities.isWon,
      ownerId: sfOpportunities.ownerId,
      ownerName: sfOpportunities.ownerName,
      assignedSeSfId: sfOpportunities.assignedSeSfId,
      assignedSeUserId: sfOpportunities.assignedSeUserId,
      assignedSeName: users.name,
      lastActivityDate: sfOpportunities.lastActivityDate,
      createdAt: sfOpportunities.createdAt,
      updatedAt: sfOpportunities.updatedAt,
    })
    .from(sfOpportunities)
    .leftJoin(sfAccounts, eq(sfOpportunities.accountId, sfAccounts.id))
    .leftJoin(users, eq(sfOpportunities.assignedSeUserId, users.id))
    .where(eq(sfOpportunities.id, id))
    .limit(1);

  if (result.length === 0) {
    throw new NotFoundError('Opportunity', id);
  }

  return result[0];
}

/**
 * Get contacts with roles for an opportunity via sf_opp_contact_roles join.
 */
export async function getOpportunityContacts(opportunityId: string) {
  return db
    .select({
      id: sfOppContactRoles.id,
      opportunityId: sfOppContactRoles.opportunityId,
      contactId: sfOppContactRoles.contactId,
      role: sfOppContactRoles.role,
      isPrimary: sfOppContactRoles.isPrimary,
      contact: {
        id: sfContacts.id,
        sfId: sfContacts.sfId,
        accountId: sfContacts.accountId,
        firstName: sfContacts.firstName,
        lastName: sfContacts.lastName,
        email: sfContacts.email,
        phone: sfContacts.phone,
        title: sfContacts.title,
        department: sfContacts.department,
        createdAt: sfContacts.createdAt,
        updatedAt: sfContacts.updatedAt,
      },
    })
    .from(sfOppContactRoles)
    .innerJoin(sfContacts, eq(sfOppContactRoles.contactId, sfContacts.id))
    .where(eq(sfOppContactRoles.opportunityId, opportunityId))
    .orderBy(desc(sfOppContactRoles.isPrimary), sfContacts.lastName);
}

/**
 * Get activities for an opportunity, sorted by date descending.
 */
export async function getOpportunityActivities(opportunityId: string) {
  return db
    .select()
    .from(sfActivities)
    .where(eq(sfActivities.opportunityId, opportunityId))
    .orderBy(desc(sfActivities.activityDate));
}

/**
 * Get kanban data: all stages + opportunities grouped by stage.
 */
export async function getKanbanData(filters: { assignedSeUserId?: string } = {}) {
  const [stages, opps] = await Promise.all([
    db
      .select()
      .from(sfOpportunityStages)
      .orderBy(asc(sfOpportunityStages.sortOrder)),
    (() => {
      const conditions = [];
      if (filters.assignedSeUserId) {
        conditions.push(eq(sfOpportunities.assignedSeUserId, filters.assignedSeUserId));
      }
      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      return db
        .select({
          id: sfOpportunities.id,
          sfId: sfOpportunities.sfId,
          name: sfOpportunities.name,
          accountSfId: sfOpportunities.accountSfId,
          accountId: sfOpportunities.accountId,
          accountName: sfAccounts.name,
          stageName: sfOpportunities.stageName,
          amount: sfOpportunities.amount,
          closeDate: sfOpportunities.closeDate,
          probability: sfOpportunities.probability,
          type: sfOpportunities.type,
          leadSource: sfOpportunities.leadSource,
          nextStep: sfOpportunities.nextStep,
          description: sfOpportunities.description,
          isClosed: sfOpportunities.isClosed,
          isWon: sfOpportunities.isWon,
          ownerId: sfOpportunities.ownerId,
          ownerName: sfOpportunities.ownerName,
          assignedSeSfId: sfOpportunities.assignedSeSfId,
          assignedSeUserId: sfOpportunities.assignedSeUserId,
          assignedSeName: users.name,
          lastActivityDate: sfOpportunities.lastActivityDate,
          createdAt: sfOpportunities.createdAt,
          updatedAt: sfOpportunities.updatedAt,
        })
        .from(sfOpportunities)
        .leftJoin(sfAccounts, eq(sfOpportunities.accountId, sfAccounts.id))
        .leftJoin(users, eq(sfOpportunities.assignedSeUserId, users.id))
        .where(whereClause)
        .orderBy(asc(sfOpportunities.closeDate));
    })(),
  ]);

  // Group opportunities by stage
  const oppsByStage = new Map<string, typeof opps>();
  for (const opp of opps) {
    const existing = oppsByStage.get(opp.stageName) ?? [];
    existing.push(opp);
    oppsByStage.set(opp.stageName, existing);
  }

  return stages.map((stage) => ({
    stage,
    opportunities: oppsByStage.get(stage.stageName) ?? [],
  }));
}

/**
 * Get active (non-closed) opportunities sorted by close date ascending.
 */
export async function getActiveOpportunities(assignedSeUserId?: string) {
  const conditions = [eq(sfOpportunities.isClosed, false)];

  if (assignedSeUserId) {
    conditions.push(eq(sfOpportunities.assignedSeUserId, assignedSeUserId));
  }

  return db
    .select({
      id: sfOpportunities.id,
      sfId: sfOpportunities.sfId,
      name: sfOpportunities.name,
      accountSfId: sfOpportunities.accountSfId,
      accountId: sfOpportunities.accountId,
      accountName: sfAccounts.name,
      stageName: sfOpportunities.stageName,
      amount: sfOpportunities.amount,
      closeDate: sfOpportunities.closeDate,
      probability: sfOpportunities.probability,
      type: sfOpportunities.type,
      leadSource: sfOpportunities.leadSource,
      nextStep: sfOpportunities.nextStep,
      description: sfOpportunities.description,
      isClosed: sfOpportunities.isClosed,
      isWon: sfOpportunities.isWon,
      ownerId: sfOpportunities.ownerId,
      ownerName: sfOpportunities.ownerName,
      assignedSeSfId: sfOpportunities.assignedSeSfId,
      assignedSeUserId: sfOpportunities.assignedSeUserId,
      assignedSeName: users.name,
      lastActivityDate: sfOpportunities.lastActivityDate,
      createdAt: sfOpportunities.createdAt,
      updatedAt: sfOpportunities.updatedAt,
    })
    .from(sfOpportunities)
    .leftJoin(sfAccounts, eq(sfOpportunities.accountId, sfAccounts.id))
    .leftJoin(users, eq(sfOpportunities.assignedSeUserId, users.id))
    .where(and(...conditions))
    .orderBy(asc(sfOpportunities.closeDate));
}

/**
 * Get attention items: overdue deals (closeDate < now, not closed) and
 * stale deals (no activity in 14 days, not closed).
 */
export async function getAttentionItems(assignedSeUserId?: string) {
  const now = new Date();
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const baseConditions = [eq(sfOpportunities.isClosed, false)];
  if (assignedSeUserId) {
    baseConditions.push(eq(sfOpportunities.assignedSeUserId, assignedSeUserId));
  }

  const selectFields = {
    id: sfOpportunities.id,
    sfId: sfOpportunities.sfId,
    name: sfOpportunities.name,
    accountSfId: sfOpportunities.accountSfId,
    accountId: sfOpportunities.accountId,
    accountName: sfAccounts.name,
    stageName: sfOpportunities.stageName,
    amount: sfOpportunities.amount,
    closeDate: sfOpportunities.closeDate,
    probability: sfOpportunities.probability,
    type: sfOpportunities.type,
    leadSource: sfOpportunities.leadSource,
    nextStep: sfOpportunities.nextStep,
    description: sfOpportunities.description,
    isClosed: sfOpportunities.isClosed,
    isWon: sfOpportunities.isWon,
    ownerId: sfOpportunities.ownerId,
    ownerName: sfOpportunities.ownerName,
    assignedSeSfId: sfOpportunities.assignedSeSfId,
    assignedSeUserId: sfOpportunities.assignedSeUserId,
    assignedSeName: users.name,
    lastActivityDate: sfOpportunities.lastActivityDate,
    createdAt: sfOpportunities.createdAt,
    updatedAt: sfOpportunities.updatedAt,
  };

  const [overdue, stale] = await Promise.all([
    // Overdue: closeDate < now and not closed
    db
      .select(selectFields)
      .from(sfOpportunities)
      .leftJoin(sfAccounts, eq(sfOpportunities.accountId, sfAccounts.id))
      .leftJoin(users, eq(sfOpportunities.assignedSeUserId, users.id))
      .where(and(...baseConditions, lt(sfOpportunities.closeDate, now)))
      .orderBy(asc(sfOpportunities.closeDate)),

    // Stale: no activity in 14 days and not closed
    db
      .select(selectFields)
      .from(sfOpportunities)
      .leftJoin(sfAccounts, eq(sfOpportunities.accountId, sfAccounts.id))
      .leftJoin(users, eq(sfOpportunities.assignedSeUserId, users.id))
      .where(
        and(
          ...baseConditions,
          or(
            lt(sfOpportunities.lastActivityDate, fourteenDaysAgo),
            isNull(sfOpportunities.lastActivityDate),
          ),
        ),
      )
      .orderBy(asc(sfOpportunities.closeDate)),
  ]);

  return { overdue, stale };
}
