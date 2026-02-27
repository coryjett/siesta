import { FastifyInstance } from 'fastify';
import { eq, desc, or } from 'drizzle-orm';
import { requireAuth } from '../auth/guards.js';
import { db } from '../db/client.js';
import { teamResources, users } from '../db/schema/index.js';

export async function resourcesRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  app.get('/api/resources', async (_request, reply) => {
    const rows = await db
      .select({
        id: teamResources.id,
        name: teamResources.name,
        url: teamResources.url,
        description: teamResources.description,
        createdBy: users.name,
        createdAt: teamResources.createdAt,
      })
      .from(teamResources)
      .innerJoin(users, eq(teamResources.createdBy, users.id))
      .orderBy(desc(teamResources.createdAt));

    return reply.send(rows);
  });

  app.post<{
    Body: { name: string; url: string; description?: string };
  }>('/api/resources', async (request, reply) => {
    const { name, url, description } = request.body;
    if (!name || !url) {
      return reply.status(400).send({ error: 'name and url are required' });
    }

    // Check for duplicate name or URL
    const existing = await db
      .select({ id: teamResources.id, name: teamResources.name, url: teamResources.url })
      .from(teamResources)
      .where(or(eq(teamResources.name, name), eq(teamResources.url, url)))
      .limit(1);
    if (existing.length > 0) {
      const match = existing[0];
      const field = match.name === name ? 'name' : 'URL';
      return reply.status(409).send({ error: `A resource with that ${field} already exists` });
    }

    const [row] = await db
      .insert(teamResources)
      .values({ name, url, description: description ?? null, createdBy: request.user.id })
      .returning();
    return reply.status(201).send(row);
  });

  app.delete<{ Params: { id: string } }>(
    '/api/resources/:id',
    async (request, reply) => {
      await db.delete(teamResources).where(eq(teamResources.id, request.params.id));
      return reply.status(204).send();
    },
  );
}
