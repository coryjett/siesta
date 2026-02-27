import { FastifyInstance } from 'fastify';
import { requireAuth } from '../auth/guards.js';
import { fetchInstancePrices } from '../services/instance-pricing.service.js';

export async function pricingRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  app.get<{
    Querystring: { provider: string; types: string; regions?: string };
  }>('/api/pricing', async (request, reply) => {
    const { provider, types, regions } = request.query;

    if (!provider || !types) {
      return reply.status(400).send({ error: 'provider and types are required' });
    }

    const validProviders = ['AWS', 'Azure', 'GCP'];
    if (!validProviders.includes(provider)) {
      return reply.status(400).send({ error: `provider must be one of: ${validProviders.join(', ')}` });
    }

    const typeList = types.split(',').map((t) => t.trim()).filter(Boolean);
    const regionList = regions ? regions.split(',').map((r) => r.trim()).filter(Boolean) : [];

    if (typeList.length === 0) {
      return reply.status(400).send({ error: 'types must contain at least one instance type' });
    }

    try {
      const prices = await fetchInstancePrices(
        provider as 'AWS' | 'Azure' | 'GCP',
        typeList,
        regionList,
      );
      return reply.send({ prices });
    } catch (err) {
      request.log.error(err, 'Failed to fetch instance pricing');
      return reply.status(502).send({
        error: 'Failed to fetch pricing data from external source',
      });
    }
  });
}
