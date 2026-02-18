import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

const connection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null, // Required by BullMQ
});

connection.on('error', (err) => {
  logger.error({ err: err.message }, 'Redis connection error (job queue)');
});

export const jobQueue = new Queue('siesta-jobs', {
  connection: connection as any,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000, // 5s, 25s, 125s
    },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 200 },
  },
});

logger.info('Job queue initialized');
