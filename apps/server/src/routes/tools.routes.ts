import { FastifyInstance } from 'fastify';
import { eq, desc } from 'drizzle-orm';
import { requireAuth } from '../auth/guards.js';
import { db } from '../db/client.js';
import { teamTools, users } from '../db/schema/index.js';

export async function toolsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  app.get('/api/tools', async (_request, reply) => {
    const rows = await db
      .select({
        id: teamTools.id,
        name: teamTools.name,
        url: teamTools.url,
        description: teamTools.description,
        createdBy: users.name,
        createdAt: teamTools.createdAt,
      })
      .from(teamTools)
      .innerJoin(users, eq(teamTools.createdBy, users.id))
      .orderBy(desc(teamTools.createdAt));

    return reply.send(rows);
  });

  app.post<{
    Body: { name: string; url: string; description?: string };
  }>('/api/tools', async (request, reply) => {
    const { name, url, description } = request.body;
    if (!name || !url) {
      return reply.status(400).send({ error: 'name and url are required' });
    }
    const [row] = await db
      .insert(teamTools)
      .values({ name, url, description: description ?? null, createdBy: request.user.id })
      .returning();
    return reply.status(201).send(row);
  });

  app.delete<{ Params: { id: string } }>(
    '/api/tools/:id',
    async (request, reply) => {
      await db.delete(teamTools).where(eq(teamTools.id, request.params.id));
      return reply.status(204).send();
    },
  );
}
