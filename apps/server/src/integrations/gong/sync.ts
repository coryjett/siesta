import { eq, and } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { gongCalls, gongTranscripts, sfAccounts, sfOpportunities, syncState } from '../../db/schema/index.js';
import { getTokens, saveTokens } from '../../services/oauth-token.service.js';
import { getSetting } from '../../services/settings.service.js';
import { decrypt } from '../../services/encryption.service.js';
import { logger } from '../../utils/logger.js';
import { GongClient } from './client.js';
import { refreshAccessToken } from './oauth.js';
import { mapCall, mapTranscript, buildSpeakerMap } from './mapper.js';
import type { GongApiCall } from './client.js';

const PROVIDER = 'gong';
const ENTITY = 'calls';
const BATCH_SIZE = 50;

/**
 * Get an authenticated GongClient, refreshing the token if needed.
 */
async function getGongClient(): Promise<GongClient> {
  const tokenData = await getTokens(PROVIDER);
  if (!tokenData) {
    throw new Error('No Gong OAuth tokens found. Please connect Gong in Settings.');
  }

  // Check if token is expired or close to expiring (within 5 minutes)
  if (tokenData.expiresAt && tokenData.expiresAt.getTime() < Date.now() + 5 * 60 * 1000) {
    logger.info('Gong access token expired or expiring soon, refreshing...');

    const clientIdEncrypted = await getSetting('gong_client_id');
    const clientSecretEncrypted = await getSetting('gong_client_secret');

    if (!clientIdEncrypted || !clientSecretEncrypted) {
      throw new Error('Gong OAuth credentials not configured in settings.');
    }

    const clientId = decrypt(clientIdEncrypted);
    const clientSecret = decrypt(clientSecretEncrypted);

    if (!tokenData.refreshToken) {
      throw new Error('No Gong refresh token available. Please re-authenticate.');
    }

    const newTokens = await refreshAccessToken(clientId, clientSecret, tokenData.refreshToken);

    await saveTokens(PROVIDER, {
      accessToken: newTokens.access_token,
      refreshToken: newTokens.refresh_token ?? tokenData.refreshToken,
      tokenType: newTokens.token_type,
      expiresAt: new Date(Date.now() + newTokens.expires_in * 1000),
    });

    return new GongClient(newTokens.access_token);
  }

  return new GongClient(tokenData.accessToken);
}

/**
 * Get the last sync state for Gong calls.
 */
async function getSyncState() {
  const result = await db
    .select()
    .from(syncState)
    .where(and(eq(syncState.provider, PROVIDER), eq(syncState.entity, ENTITY)))
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

/**
 * Update the sync state for Gong calls.
 */
async function updateSyncState(updates: {
  status: string;
  cursor?: string | null;
  lastSyncAt?: Date;
  lastError?: string | null;
  recordsProcessed?: number;
}) {
  await db
    .insert(syncState)
    .values({
      provider: PROVIDER,
      entity: ENTITY,
      status: updates.status,
      cursor: updates.cursor ?? null,
      lastSyncAt: updates.lastSyncAt ?? null,
      lastError: updates.lastError ?? null,
      recordsProcessed: updates.recordsProcessed ?? null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [syncState.provider, syncState.entity],
      set: {
        status: updates.status,
        cursor: updates.cursor ?? null,
        lastSyncAt: updates.lastSyncAt ?? undefined,
        lastError: updates.lastError ?? null,
        recordsProcessed: updates.recordsProcessed ?? undefined,
        updatedAt: new Date(),
      },
    });
}

/**
 * Look up the internal account UUID by Salesforce ID.
 */
async function resolveAccountId(sfId: string): Promise<string | null> {
  const result = await db
    .select({ id: sfAccounts.id })
    .from(sfAccounts)
    .where(eq(sfAccounts.sfId, sfId))
    .limit(1);

  return result.length > 0 ? result[0].id : null;
}

/**
 * Look up the internal opportunity UUID by Salesforce ID.
 */
async function resolveOpportunityId(sfId: string): Promise<string | null> {
  const result = await db
    .select({ id: sfOpportunities.id })
    .from(sfOpportunities)
    .where(eq(sfOpportunities.sfId, sfId))
    .limit(1);

  return result.length > 0 ? result[0].id : null;
}

/**
 * Upsert a single Gong call into the database.
 * Returns the internal DB id.
 */
async function upsertCall(mapped: ReturnType<typeof mapCall>): Promise<string> {
  // Resolve FK references to sfAccounts / sfOpportunities
  let accountId: string | null = null;
  let opportunityId: string | null = null;

  if (mapped.accountSfId) {
    accountId = await resolveAccountId(mapped.accountSfId);
  }
  if (mapped.opportunitySfId) {
    opportunityId = await resolveOpportunityId(mapped.opportunitySfId);
  }

  const result = await db
    .insert(gongCalls)
    .values({
      gongId: mapped.gongId,
      title: mapped.title,
      scheduledStart: mapped.scheduledStart,
      scheduledEnd: mapped.scheduledEnd,
      started: mapped.started,
      duration: mapped.duration,
      direction: mapped.direction,
      scope: mapped.scope,
      media: mapped.media,
      language: mapped.language,
      url: mapped.url,
      accountSfId: mapped.accountSfId,
      accountId,
      opportunitySfId: mapped.opportunitySfId,
      opportunityId,
      participants: mapped.participants,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: gongCalls.gongId,
      set: {
        title: mapped.title,
        scheduledStart: mapped.scheduledStart,
        scheduledEnd: mapped.scheduledEnd,
        started: mapped.started,
        duration: mapped.duration,
        direction: mapped.direction,
        scope: mapped.scope,
        media: mapped.media,
        language: mapped.language,
        url: mapped.url,
        accountSfId: mapped.accountSfId,
        accountId,
        opportunitySfId: mapped.opportunitySfId,
        opportunityId,
        participants: mapped.participants,
        updatedAt: new Date(),
      },
    })
    .returning({ id: gongCalls.id });

  return result[0].id;
}

/**
 * Upsert a transcript for a call.
 */
async function upsertTranscript(mapped: ReturnType<typeof mapTranscript>): Promise<void> {
  await db
    .insert(gongTranscripts)
    .values({
      callId: mapped.callId,
      fullText: mapped.fullText,
      segments: mapped.segments,
    })
    .onConflictDoUpdate({
      target: gongTranscripts.callId,
      set: {
        fullText: mapped.fullText,
        segments: mapped.segments,
      },
    });
}

/**
 * Main sync orchestrator for Gong calls and transcripts.
 *
 * 1. Get last sync cursor from sync_state
 * 2. Fetch calls from Gong API (incremental by date)
 * 3. For each call, upsert into gong_calls
 * 4. Link to SF accounts/opportunities by matching CRM object IDs
 * 5. Fetch transcripts for new/updated calls
 * 6. Upsert transcripts into gong_transcripts
 * 7. Update sync_state with new cursor
 */
export async function syncCalls(): Promise<{ callsSynced: number; transcriptsSynced: number }> {
  const client = await getGongClient();
  const state = await getSyncState();

  // Mark sync as running
  await updateSyncState({ status: 'running' });

  let callsSynced = 0;
  let transcriptsSynced = 0;

  try {
    // Build the initial query parameters
    const params: { fromDateTime?: string; toDateTime?: string; cursor?: string } = {};

    // If we have a previous sync timestamp, use it for incremental sync
    if (state?.lastSyncAt) {
      params.fromDateTime = state.lastSyncAt.toISOString();
    }

    params.toDateTime = new Date().toISOString();

    let cursor: string | undefined;

    // Paginate through all calls
    do {
      if (cursor) {
        params.cursor = cursor;
      }

      const result = await client.listCalls(params);
      cursor = result.cursor;

      if (result.calls.length === 0) break;

      // Collect call IDs and their API data for transcript fetching
      const callIdMap = new Map<string, { dbId: string; apiCall: GongApiCall }>();

      // Upsert each call
      for (const apiCall of result.calls) {
        const mapped = mapCall(apiCall);
        const dbId = await upsertCall(mapped);
        callIdMap.set(apiCall.id, { dbId, apiCall });
        callsSynced++;
      }

      // Fetch transcripts in batches
      const gongCallIds = Array.from(callIdMap.keys());
      for (let i = 0; i < gongCallIds.length; i += BATCH_SIZE) {
        const batch = gongCallIds.slice(i, i + BATCH_SIZE);
        const transcripts = await client.getCallTranscripts(batch);

        for (const transcript of transcripts) {
          const callInfo = callIdMap.get(transcript.callId);
          if (!callInfo) continue;

          const speakerMap = buildSpeakerMap(callInfo.apiCall.parties);
          const mapped = mapTranscript(callInfo.dbId, transcript, speakerMap);
          await upsertTranscript(mapped);
          transcriptsSynced++;
        }
      }

      logger.info(
        { callsSynced, transcriptsSynced, hasMore: !!cursor },
        'Gong sync progress',
      );
    } while (cursor);

    // Update sync state with success
    await updateSyncState({
      status: 'idle',
      lastSyncAt: new Date(),
      lastError: null,
      recordsProcessed: callsSynced,
    });

    logger.info(
      { callsSynced, transcriptsSynced },
      'Gong sync completed successfully',
    );

    return { callsSynced, transcriptsSynced };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    await updateSyncState({
      status: 'error',
      lastError: errorMessage,
    });

    logger.error({ error: errorMessage }, 'Gong sync failed');
    throw error;
  }
}
