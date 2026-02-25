import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { AppError } from './utils/errors.js';
import { authPlugin } from './auth/plugin.js';
import { settingsRoutes } from './routes/settings.routes.js';
import { usersRoutes } from './routes/users.routes.js';
import { searchRoutes } from './routes/search.routes.js';
import { accountsRoutes } from './routes/accounts.routes.js';
import { opportunitiesRoutes } from './routes/opportunities.routes.js';
import { homeRoutes } from './routes/home.routes.js';
import { notesRoutes } from './routes/notes.routes.js';
import { interactionsRoutes } from './routes/interactions.routes.js';
import { portfolioRoutes } from './routes/portfolio.routes.js';
import { supportMcpAuthRoutes } from './routes/support-mcp-auth.routes.js';

export async function buildApp() {
  const app = Fastify({
    loggerInstance: logger,
  });

  await app.register(cors, {
    origin: env.APP_URL,
    credentials: true,
  });

  await app.register(cookie, {
    secret: env.SESSION_SECRET,
  });

  // Rate limiting
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    keyGenerator: (request) => request.ip,
  });

  // CSP headers
  app.addHook('onSend', async (request, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('X-XSS-Protection', '1; mode=block');
    if (env.NODE_ENV === 'production') {
      reply.header(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://fonts.cdnfonts.com; img-src 'self' data:; font-src 'self' https://fonts.gstatic.com https://fonts.cdnfonts.com",
      );
    }
  });

  // Global error handler
  app.setErrorHandler((error: Error & { validation?: unknown; statusCode?: number }, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        statusCode: error.statusCode,
        error: error.name,
        message: error.message,
      });
    }

    // Fastify validation errors
    if (error.validation) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'ValidationError',
        message: error.message,
      });
    }

    // Rate limit errors
    if (error.statusCode === 429) {
      return reply.status(429).send({
        statusCode: 429,
        error: 'TooManyRequests',
        message: 'Rate limit exceeded',
      });
    }

    request.log.error(error);
    return reply.status(500).send({
      statusCode: 500,
      error: 'InternalServerError',
      message: env.NODE_ENV === 'production' ? 'Internal server error' : error.message,
    });
  });

  // Health check
  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  // Auth routes
  await app.register(authPlugin);

  // API routes
  await app.register(settingsRoutes);
  await app.register(usersRoutes);
  await app.register(searchRoutes);
  await app.register(accountsRoutes);
  await app.register(opportunitiesRoutes);
  await app.register(homeRoutes);
  await app.register(notesRoutes);
  await app.register(interactionsRoutes);
  await app.register(portfolioRoutes);
  await app.register(supportMcpAuthRoutes);

  // Serve static frontend in production
  if (env.NODE_ENV === 'production') {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const webDistPath = path.resolve(__dirname, '../../../apps/web/dist');

    await app.register(fastifyStatic, {
      root: webDistPath,
      prefix: '/',
      wildcard: false,
    });

    // SPA fallback: serve index.html for non-API routes
    app.setNotFoundHandler(async (request, reply) => {
      if (request.url.startsWith('/api/') || request.url.startsWith('/auth/')) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'NotFound',
          message: 'Route not found',
        });
      }
      return reply.sendFile('index.html');
    });
  }

  return app;
}
