// @ts-expect-error node-cron has no type declarations
import cron from 'node-cron';
import { jobQueue } from './queue.js';
import { SF_SYNC_JOB_NAME } from './sf-sync.job.js';
import { logger } from '../utils/logger.js';

const GONG_SYNC_JOB_NAME = 'gong-sync';

/**
 * Start all scheduled jobs.
 *
 * - Salesforce sync runs every 15 minutes
 * - Gong sync runs every 30 minutes (placeholder)
 *
 * Also enqueues an initial Salesforce sync on startup.
 */
export function startScheduler(): void {
  // Salesforce sync every 15 minutes
  cron.schedule('*/15 * * * *', async () => {
    try {
      await jobQueue.add(SF_SYNC_JOB_NAME, {}, {
        jobId: `sf-sync-${Date.now()}`,
      });
      logger.info('Scheduled Salesforce sync job enqueued');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage }, 'Failed to enqueue scheduled Salesforce sync job');
    }
  });

  // Gong sync every 30 minutes (placeholder)
  cron.schedule('*/30 * * * *', async () => {
    try {
      await jobQueue.add(GONG_SYNC_JOB_NAME, {}, {
        jobId: `gong-sync-${Date.now()}`,
      });
      logger.info('Scheduled Gong sync job enqueued (placeholder)');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage }, 'Failed to enqueue scheduled Gong sync job');
    }
  });

  // Initial sync on startup (short delay to let the worker spin up)
  setTimeout(async () => {
    try {
      await jobQueue.add(SF_SYNC_JOB_NAME, {}, {
        jobId: `sf-sync-initial-${Date.now()}`,
      });
      logger.info('Initial Salesforce sync job enqueued');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage }, 'Failed to enqueue initial Salesforce sync job');
    }
  }, 5000);

  logger.info('Job scheduler started (SF sync every 15m, Gong sync every 30m)');
}
