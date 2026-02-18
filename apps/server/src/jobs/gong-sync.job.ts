import { logger } from '../utils/logger.js';
import { syncCalls } from '../integrations/gong/sync.js';

/**
 * Job handler for Gong sync.
 * Orchestrates the full sync of Gong calls and transcripts.
 *
 * This can be invoked by a cron scheduler (e.g., node-cron) or
 * a BullMQ worker. It handles errors internally and updates
 * sync_state accordingly.
 */
export async function runGongSyncJob(): Promise<void> {
  const startTime = Date.now();
  logger.info('Starting Gong sync job');

  try {
    const result = await syncCalls();

    const durationMs = Date.now() - startTime;
    logger.info(
      {
        callsSynced: result.callsSynced,
        transcriptsSynced: result.transcriptsSynced,
        durationMs,
      },
      'Gong sync job completed successfully',
    );
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error(
      {
        error: errorMessage,
        durationMs,
      },
      'Gong sync job failed',
    );

    // The sync orchestrator already updates sync_state on failure,
    // so we just re-throw for the caller (e.g., BullMQ) to handle retries.
    throw error;
  }
}
