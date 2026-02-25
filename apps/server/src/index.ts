import { buildApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { warmUpCache } from './services/cache-warmup.service.js';

async function start() {
  const app = await buildApp();

  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' });
    logger.info(`Server listening on port ${env.PORT}`);

    // Warm up cache in the background — don't block the server
    warmUpCache().catch((err) => {
      logger.warn({ err: (err as Error).message }, 'Background cache warm-up failed');
    });
  } catch (err) {
    logger.error(err, 'Failed to start server');
    process.exit(1);
  }
}

start();
