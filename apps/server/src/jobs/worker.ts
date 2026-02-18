import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { handleSfSync, SF_SYNC_JOB_NAME } from './sf-sync.job.js';
import { syncCalls } from '../integrations/gong/sync.js';

const GONG_SYNC_JOB_NAME = 'gong-sync';

const connection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

connection.on('error', (err) => {
  logger.error({ err: err.message }, 'Redis connection error (worker)');
});

export const worker = new Worker(
  'siesta-jobs',
  async (job) => {
    switch (job.name) {
      case SF_SYNC_JOB_NAME:
        return handleSfSync(job);

      case GONG_SYNC_JOB_NAME:
        logger.info({ jobId: job.id }, 'Starting Gong sync');
        return syncCalls();

      default:
        logger.warn({ jobName: job.name, jobId: job.id }, 'Unknown job name, skipping');
        return;
    }
  },
  {
    connection: connection as any,
    concurrency: 1,
  },
);

worker.on('completed', (job) => {
  logger.info({ jobId: job?.id, jobName: job?.name }, 'Job completed');
});

worker.on('failed', (job, error) => {
  logger.error(
    { jobId: job?.id, jobName: job?.name, error: error.message, attempt: job?.attemptsMade },
    'Job failed',
  );
});

worker.on('error', (error) => {
  logger.error({ error: error.message }, 'Worker error');
});

logger.info('Job worker started');
