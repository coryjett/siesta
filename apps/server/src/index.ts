import { buildApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { warmAllGongBriefs } from './services/openai-summary.service.js';

async function start() {
  const app = await buildApp();

  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' });
    logger.info(`Server listening on port ${env.PORT}`);

    // Fire-and-forget: warm all Gong call briefs in the background
    warmAllGongBriefs().catch((err) =>
      logger.warn({ err: (err as Error).message }, 'Background Gong brief warming failed'),
    );
  } catch (err) {
    logger.error(err, 'Failed to start server');
    process.exit(1);
  }
}

start();
