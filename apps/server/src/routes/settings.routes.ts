import { FastifyInstance } from 'fastify';
import { requireAuth, requireRole } from '../auth/guards.js';
import { getAllSettings, setSetting, getSetting } from '../services/settings.service.js';
import { saveTokens, hasTokens } from '../services/oauth-token.service.js';
import { encrypt } from '../services/encryption.service.js';
import { BadRequestError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { soapLogin } from '../integrations/salesforce/oauth.js';
import {
  sfConnectionSchema,
  gongConnectionSchema,
  seFieldMappingSchema,
} from '@siesta/shared';

export async function settingsRoutes(app: FastifyInstance) {
  // All routes require authentication and admin role
  app.addHook('preHandler', requireAuth);
  app.addHook('preHandler', requireRole('admin'));

  /**
   * GET /api/settings
   * Get all application settings.
   */
  app.get('/api/settings', async (_request, reply) => {
    const settings = await getAllSettings();
    return reply.send(settings);
  });

  /**
   * PUT /api/settings/:key
   * Update a single setting by key.
   */
  app.put<{ Params: { key: string }; Body: { value: string } }>(
    '/api/settings/:key',
    async (request, reply) => {
      const { key } = request.params;
      const { value } = request.body as { value: string };

      if (!value && value !== '') {
        throw new BadRequestError('value is required');
      }

      await setSetting(key, value);
      return reply.send({ success: true, key, value });
    },
  );

  /**
   * POST /api/settings/sf-connection
   * Authenticate with Salesforce using username + password + security token (SOAP login).
   * Stores the resulting access token and instance URL in oauth_tokens.
   */
  app.post('/api/settings/sf-connection', async (request, reply) => {
    logger.info({ body: request.body }, 'POST /api/settings/sf-connection received');
    const parsed = sfConnectionSchema.safeParse(request.body);
    if (!parsed.success) {
      logger.error({ errors: parsed.error.errors }, 'Invalid Salesforce connection settings');
      throw new BadRequestError(parsed.error.errors.map((e) => e.message).join(', '));
    }

    const { username, password, securityToken, loginUrl } = parsed.data;

    let accessToken: string;
    let instanceUrl: string;
    try {
      logger.error('Attempting Salesforce SOAP login for user %s', username);
      ({ accessToken, instanceUrl } = await soapLogin(username, password, securityToken, loginUrl));
    } catch (err) {
      throw new BadRequestError(err instanceof Error ? err.message : 'Salesforce login failed');
    }

    await saveTokens('salesforce', { accessToken, instanceUrl });
    await setSetting('sf_instance_url', instanceUrl);

    return reply.send({ success: true });
  });

  /**
   * POST /api/settings/gong-connection
   * Save Gong OAuth credentials.
   * Encrypts clientId and clientSecret and stores them in app_settings.
   */
  app.post('/api/settings/gong-connection', async (request, reply) => {
    const parsed = gongConnectionSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new BadRequestError(parsed.error.errors.map((e) => e.message).join(', '));
    }

    const { clientId, clientSecret } = parsed.data;

    // Encrypt and store credentials in app_settings
    await setSetting('gong_client_id', encrypt(clientId));
    await setSetting('gong_client_secret', encrypt(clientSecret));

    return reply.send({ success: true });
  });

  /**
   * PUT /api/settings/se-field-mapping
   * Update the SE assignment field mapping.
   */
  app.put('/api/settings/se-field-mapping', async (request, reply) => {
    const parsed = seFieldMappingSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new BadRequestError(parsed.error.errors.map((e) => e.message).join(', '));
    }

    const { fieldApiName } = parsed.data;
    await setSetting('se_field_api_name', fieldApiName);

    return reply.send({ success: true, fieldApiName });
  });

  /**
   * GET /api/settings/connections
   * Get connection status for all providers.
   * Returns whether tokens exist, without exposing secrets.
   */
  app.get('/api/settings/connections', async (_request, reply) => {
    const [sfConnected, gongConnected] = await Promise.all([
      hasTokens('salesforce'),
      hasTokens('gong'),
    ]);

    const gongClientId = await getSetting('gong_client_id');
    const sfInstanceUrl = await getSetting('sf_instance_url');

    return reply.send({
      salesforce: {
        configured: sfConnected,
        connected: sfConnected,
        instanceUrl: sfInstanceUrl ?? null,
      },
      gong: {
        configured: !!gongClientId,
        connected: gongConnected,
      },
    });
  });
}
