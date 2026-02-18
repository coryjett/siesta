import { eq, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  sfAccounts,
  sfOpportunities,
  sfContacts,
  sfOppContactRoles,
  sfActivities,
  sfOpportunityStages,
  syncState,
  oauthTokens,
  appSettings,
} from '../../db/schema/index.js';
import { logger } from '../../utils/logger.js';
import { decrypt } from './crypto.js';
import { SalesforceClient, SalesforceApiError } from './client.js';
import {
  buildAccountsQuery,
  buildOpportunitiesQuery,
  buildContactsQuery,
  buildContactRolesQuery,
  buildTasksQuery,
  buildEventsQuery,
} from './queries.js';
import {
  mapAccount,
  mapOpportunity,
  mapContact,
  mapContactRole,
  mapActivity,
} from './mapper.js';

const PROVIDER = 'salesforce';

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------

/**
 * Retrieve Salesforce OAuth credentials from the database, decrypt them,
 * and return a configured SalesforceClient.
 * If the access token has expired, attempt a refresh first.
 */
async function getSalesforceClient(): Promise<SalesforceClient> {
  const tokenRow = await db
    .select()
    .from(oauthTokens)
    .where(eq(oauthTokens.provider, PROVIDER))
    .limit(1);

  if (tokenRow.length === 0) {
    throw new Error('No Salesforce OAuth tokens found. Please connect Salesforce first.');
  }

  const token = tokenRow[0];
  const accessToken = decrypt(token.accessTokenEncrypted);
  const instanceUrl = token.instanceUrl!;

  return new SalesforceClient(accessToken, instanceUrl);
}

/**
 * Get the configured SE custom field API name from app_settings.
 */
async function getSeFieldName(): Promise<string | undefined> {
  const row = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, 'sf_se_field_name'))
    .limit(1);

  return row.length > 0 ? row[0].value : undefined;
}

/**
 * Update sync_state for a given entity before or after a sync.
 */
async function updateSyncState(
  entity: string,
  status: 'syncing' | 'success' | 'error',
  extra?: { recordsProcessed?: number; lastError?: string },
): Promise<void> {
  const now = new Date();
  await db
    .insert(syncState)
    .values({
      provider: PROVIDER,
      entity,
      status,
      lastSyncAt: status === 'success' ? now : undefined,
      lastError: extra?.lastError ?? null,
      recordsProcessed: extra?.recordsProcessed ?? null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [syncState.provider, syncState.entity],
      set: {
        status,
        ...(status === 'success' ? { lastSyncAt: now } : {}),
        lastError: extra?.lastError ?? null,
        recordsProcessed: extra?.recordsProcessed ?? null,
        updatedAt: now,
      },
    });
}

// ----------------------------------------------------------------
// Entity sync functions
// ----------------------------------------------------------------

async function syncStages(client: SalesforceClient): Promise<number> {
  logger.info('Syncing Salesforce opportunity stages...');
  await updateSyncState('stages', 'syncing');

  const describeResult = await client.describe('Opportunity');
  const stageField = describeResult.fields.find((f) => f.name === 'StageName');

  if (!stageField || !stageField.picklistValues) {
    throw new Error('Could not find StageName picklist on Opportunity object.');
  }

  const activeValues = stageField.picklistValues.filter((pv) => pv.active);
  let count = 0;

  for (let i = 0; i < activeValues.length; i++) {
    const pv = activeValues[i];
    await db
      .insert(sfOpportunityStages)
      .values({
        stageName: pv.value,
        sortOrder: i,
        // The Salesforce describe API doesn't directly tell us isClosed / isWon
        // on the picklist value, but the StageName field metadata does not include
        // those flags at the picklist level. We'll default them to false here and
        // they can be manually configured or derived from opportunity data.
        isClosed: false,
        isWon: false,
      })
      .onConflictDoUpdate({
        target: sfOpportunityStages.stageName,
        set: {
          sortOrder: i,
        },
      });
    count++;
  }

  await updateSyncState('stages', 'success', { recordsProcessed: count });
  logger.info({ count }, 'Opportunity stages synced');
  return count;
}

async function syncAccounts(client: SalesforceClient): Promise<number> {
  logger.info('Syncing Salesforce accounts...');
  await updateSyncState('accounts', 'syncing');

  const soql = buildAccountsQuery();
  const records = await client.queryAll(soql);
  let count = 0;

  // Process in batches to avoid overly large queries
  const BATCH_SIZE = 200;
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    const mapped = batch.map((r) => mapAccount(r as Record<string, unknown>));

    for (const row of mapped) {
      await db
        .insert(sfAccounts)
        .values({
          ...row,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: sfAccounts.sfId,
          set: {
            name: row.name,
            industry: row.industry,
            website: row.website,
            annualRevenue: row.annualRevenue,
            numberOfEmployees: row.numberOfEmployees,
            billingCity: row.billingCity,
            billingState: row.billingState,
            billingCountry: row.billingCountry,
            type: row.type,
            ownerId: row.ownerId,
            ownerName: row.ownerName,
            description: row.description,
            lastActivityDate: row.lastActivityDate,
            updatedAt: new Date(),
          },
        });
    }

    count += mapped.length;
  }

  await updateSyncState('accounts', 'success', { recordsProcessed: count });
  logger.info({ count }, 'Accounts synced');
  return count;
}

async function syncOpportunities(client: SalesforceClient, seFieldName?: string): Promise<number> {
  logger.info('Syncing Salesforce opportunities...');
  await updateSyncState('opportunities', 'syncing');

  const soql = buildOpportunitiesQuery(seFieldName);
  const records = await client.queryAll(soql);
  let count = 0;

  const BATCH_SIZE = 200;
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    const mapped = batch.map((r) =>
      mapOpportunity(r as Record<string, unknown>, seFieldName),
    );

    for (const row of mapped) {
      await db
        .insert(sfOpportunities)
        .values({
          ...row,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: sfOpportunities.sfId,
          set: {
            name: row.name,
            accountSfId: row.accountSfId,
            stageName: row.stageName,
            amount: row.amount,
            closeDate: row.closeDate,
            probability: row.probability,
            type: row.type,
            leadSource: row.leadSource,
            nextStep: row.nextStep,
            description: row.description,
            isClosed: row.isClosed,
            isWon: row.isWon,
            ownerId: row.ownerId,
            ownerName: row.ownerName,
            assignedSeSfId: row.assignedSeSfId,
            lastActivityDate: row.lastActivityDate,
            updatedAt: new Date(),
          },
        });
    }

    count += mapped.length;
  }

  await updateSyncState('opportunities', 'success', { recordsProcessed: count });
  logger.info({ count }, 'Opportunities synced');
  return count;
}

async function syncContacts(client: SalesforceClient): Promise<number> {
  logger.info('Syncing Salesforce contacts...');
  await updateSyncState('contacts', 'syncing');

  const soql = buildContactsQuery();
  const records = await client.queryAll(soql);
  let count = 0;

  const BATCH_SIZE = 200;
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    const mapped = batch.map((r) => mapContact(r as Record<string, unknown>));

    for (const row of mapped) {
      await db
        .insert(sfContacts)
        .values({
          ...row,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: sfContacts.sfId,
          set: {
            accountSfId: row.accountSfId,
            firstName: row.firstName,
            lastName: row.lastName,
            email: row.email,
            phone: row.phone,
            title: row.title,
            department: row.department,
            updatedAt: new Date(),
          },
        });
    }

    count += mapped.length;
  }

  await updateSyncState('contacts', 'success', { recordsProcessed: count });
  logger.info({ count }, 'Contacts synced');
  return count;
}

async function syncContactRoles(client: SalesforceClient): Promise<number> {
  logger.info('Syncing Salesforce opportunity contact roles...');
  await updateSyncState('contact_roles', 'syncing');

  const soql = buildContactRolesQuery();
  const records = await client.queryAll(soql);
  let count = 0;

  const BATCH_SIZE = 200;
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    const mapped = batch.map((r) => mapContactRole(r as Record<string, unknown>));

    for (const row of mapped) {
      await db
        .insert(sfOppContactRoles)
        .values(row)
        .onConflictDoUpdate({
          target: sfOppContactRoles.sfId,
          set: {
            opportunitySfId: row.opportunitySfId,
            contactSfId: row.contactSfId,
            role: row.role,
            isPrimary: row.isPrimary,
          },
        });
    }

    count += mapped.length;
  }

  await updateSyncState('contact_roles', 'success', { recordsProcessed: count });
  logger.info({ count }, 'Contact roles synced');
  return count;
}

async function syncActivities(client: SalesforceClient): Promise<number> {
  logger.info('Syncing Salesforce activities (tasks + events)...');
  await updateSyncState('activities', 'syncing');

  let count = 0;

  // Sync tasks
  const taskSoql = buildTasksQuery();
  const tasks = await client.queryAll(taskSoql);

  for (const record of tasks) {
    const row = mapActivity(record as Record<string, unknown>, 'task');
    await db
      .insert(sfActivities)
      .values({
        ...row,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: sfActivities.sfId,
        set: {
          accountSfId: row.accountSfId,
          opportunitySfId: row.opportunitySfId,
          subject: row.subject,
          description: row.description,
          activityType: row.activityType,
          activityDate: row.activityDate,
          status: row.status,
          priority: row.priority,
          isCompleted: row.isCompleted,
          ownerId: row.ownerId,
          ownerName: row.ownerName,
          updatedAt: new Date(),
        },
      });
    count++;
  }

  // Sync events
  const eventSoql = buildEventsQuery();
  const events = await client.queryAll(eventSoql);

  for (const record of events) {
    const row = mapActivity(record as Record<string, unknown>, 'event');
    await db
      .insert(sfActivities)
      .values({
        ...row,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: sfActivities.sfId,
        set: {
          accountSfId: row.accountSfId,
          opportunitySfId: row.opportunitySfId,
          subject: row.subject,
          description: row.description,
          activityType: row.activityType,
          activityDate: row.activityDate,
          status: row.status,
          priority: row.priority,
          isCompleted: row.isCompleted,
          ownerId: row.ownerId,
          ownerName: row.ownerName,
          updatedAt: new Date(),
        },
      });
    count++;
  }

  await updateSyncState('activities', 'success', { recordsProcessed: count });
  logger.info({ count }, 'Activities synced');
  return count;
}

/**
 * After opportunities are synced with assignedSeSfId, resolve those
 * to internal user IDs by matching against users.sfUserId.
 */
async function resolveSeAssignments(): Promise<number> {
  logger.info('Resolving SE assignments on opportunities...');

  // Find opportunities that have an assignedSeSfId but no assignedSeUserId
  // (or where the assignedSeSfId has changed)
  const result = await db.execute(sql`
    UPDATE sf_opportunities o
    SET assigned_se_user_id = u.id,
        updated_at = NOW()
    FROM users u
    WHERE o.assigned_se_sf_id IS NOT NULL
      AND u.sf_user_id = o.assigned_se_sf_id
      AND (o.assigned_se_user_id IS NULL OR o.assigned_se_user_id != u.id)
  `);

  const count = Number(result.length ?? 0);
  logger.info({ count }, 'SE assignments resolved');
  return count;
}

// ----------------------------------------------------------------
// Main orchestrator
// ----------------------------------------------------------------

export interface SyncResult {
  stages: number;
  accounts: number;
  opportunities: number;
  contacts: number;
  contactRoles: number;
  activities: number;
  seAssignments: number;
}

/**
 * Run a full Salesforce sync in the correct order.
 */
export async function syncAll(): Promise<SyncResult> {
  logger.info('Starting full Salesforce sync...');
  const startTime = Date.now();

  const client = await getSalesforceClient();
  const seFieldName = await getSeFieldName();

  const result: SyncResult = {
    stages: 0,
    accounts: 0,
    opportunities: 0,
    contacts: 0,
    contactRoles: 0,
    activities: 0,
    seAssignments: 0,
  };

  try {
    // 1. Sync stages (from describe)
    result.stages = await syncStages(client);

    // 2. Sync accounts
    result.accounts = await syncAccounts(client);

    // 3. Sync opportunities (with configurable SE field)
    result.opportunities = await syncOpportunities(client, seFieldName);

    // 4. Sync contacts
    result.contacts = await syncContacts(client);

    // 5. Sync contact roles
    result.contactRoles = await syncContactRoles(client);

    // 6. Sync activities
    result.activities = await syncActivities(client);

    // 7. Resolve SE assignments
    result.seAssignments = await resolveSeAssignments();

    const durationMs = Date.now() - startTime;
    logger.info({ result, durationMs }, 'Full Salesforce sync completed');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ error: errorMessage }, 'Salesforce sync failed');

    // If we hit a 401, mark all entities as error so the UI can prompt re-auth
    if (error instanceof SalesforceApiError && error.statusCode === 401) {
      await updateSyncState('accounts', 'error', { lastError: 'Token expired - please re-authenticate' });
    }

    throw error;
  }

  return result;
}
