import type { Job } from 'bullmq';
import { syncAll } from '../integrations/salesforce/sync.js';
import { logger } from '../utils/logger.js';

export const SF_SYNC_JOB_NAME = 'sf-sync';

export async function handleSfSync(job: Job): Promise<void> {
  const log = logger.child({ jobId: job.id, jobName: job.name });
  log.info('Salesforce sync job started');

  try {
    await job.updateProgress(0);

    const result = await syncAll();

    await job.updateProgress(100);
    log.info(
      {
        stages: result.stages,
        accounts: result.accounts,
        opportunities: result.opportunities,
        contacts: result.contacts,
        contactRoles: result.contactRoles,
        activities: result.activities,
        seAssignments: result.seAssignments,
      },
      'Salesforce sync job completed',
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error({ error: errorMessage }, 'Salesforce sync job failed');
    throw error; // Let BullMQ handle retries
  }
}
