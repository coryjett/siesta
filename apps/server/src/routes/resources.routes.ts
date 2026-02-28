import { FastifyInstance } from 'fastify';
import { eq, desc, sql } from 'drizzle-orm';
import { requireAuth } from '../auth/guards.js';
import { db } from '../db/client.js';
import { teamResources, users } from '../db/schema/index.js';

export async function resourcesRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  // List resources (with optional tag filtering)
  app.get<{
    Querystring: { tags?: string };
  }>('/api/resources', async (request, reply) => {
    const tagFilter = request.query.tags
      ? request.query.tags.split(',').map((t) => t.trim()).filter(Boolean)
      : null;

    const baseQuery = db
      .select({
        id: teamResources.id,
        name: teamResources.name,
        type: teamResources.type,
        url: teamResources.url,
        description: teamResources.description,
        content: teamResources.content,
        fileName: teamResources.fileName,
        fileMimeType: teamResources.fileMimeType,
        fileSize: teamResources.fileSize,
        tags: teamResources.tags,
        createdBy: users.name,
        createdAt: teamResources.createdAt,
      })
      .from(teamResources)
      .innerJoin(users, eq(teamResources.createdBy, users.id))
      .orderBy(desc(teamResources.createdAt));

    let rows;
    if (tagFilter && tagFilter.length > 0) {
      rows = await baseQuery.where(
        sql`${teamResources.tags} && ${sql`ARRAY[${sql.join(tagFilter.map(t => sql`${t}`), sql`, `)}]::text[]`}`
      );
    } else {
      rows = await baseQuery;
    }

    return reply.send(rows);
  });

  // Get all distinct tags
  app.get('/api/resources/tags', async (_request, reply) => {
    const result = await db.execute<{ tag: string }>(
      sql`SELECT DISTINCT unnest(tags) as tag FROM team_resources ORDER BY tag`
    );
    const tags = (result as unknown as Array<{ tag: string }>).map((r) => r.tag);
    return reply.send(tags);
  });

  // Download file for a file-type resource
  app.get<{ Params: { id: string } }>('/api/resources/:id/file', async (request, reply) => {
    const [resource] = await db
      .select({
        type: teamResources.type,
        fileData: teamResources.fileData,
        fileName: teamResources.fileName,
        fileMimeType: teamResources.fileMimeType,
      })
      .from(teamResources)
      .where(eq(teamResources.id, request.params.id))
      .limit(1);

    if (!resource || resource.type !== 'file' || !resource.fileData) {
      return reply.status(404).send({ error: 'File not found' });
    }

    return reply
      .header('Content-Type', resource.fileMimeType || 'application/octet-stream')
      .header('Content-Disposition', `attachment; filename="${resource.fileName || 'download'}"`)
      .send(resource.fileData);
  });

  // Create resource (multipart for file, JSON for link/markdown)
  app.post('/api/resources', async (request, reply) => {
    const contentType = request.headers['content-type'] || '';
    let name: string;
    let type: string;
    let url: string | null = null;
    let description: string | null = null;
    let content: string | null = null;
    let tags: string[] = [];
    let fileData: Buffer | null = null;
    let fileName: string | null = null;
    let fileMimeType: string | null = null;
    let fileSize: number | null = null;

    if (contentType.includes('multipart/form-data')) {
      const parts = request.parts();
      for await (const part of parts) {
        if (part.type === 'file') {
          if (part.fieldname === 'file') {
            fileData = await part.toBuffer();
            fileName = part.filename;
            fileMimeType = part.mimetype;
            fileSize = fileData.length;
          }
        } else {
          const value = part.value as string;
          switch (part.fieldname) {
            case 'name': name = value; break;
            case 'type': type = value; break;
            case 'url': url = value || null; break;
            case 'description': description = value || null; break;
            case 'content': content = value || null; break;
            case 'tags':
              try { tags = JSON.parse(value); } catch { tags = []; }
              break;
          }
        }
      }
    } else {
      const body = request.body as Record<string, unknown>;
      name = body.name as string;
      type = body.type as string || 'link';
      url = (body.url as string) || null;
      description = (body.description as string) || null;
      content = (body.content as string) || null;
      tags = Array.isArray(body.tags) ? body.tags : [];
    }

    if (!name!) {
      return reply.status(400).send({ error: 'name is required' });
    }
    if (!type!) {
      return reply.status(400).send({ error: 'type is required' });
    }

    if (type === 'link' && !url) {
      return reply.status(400).send({ error: 'url is required for link resources' });
    }
    if (type === 'markdown' && !content) {
      return reply.status(400).send({ error: 'content is required for markdown resources' });
    }
    if (type === 'file' && !fileData) {
      return reply.status(400).send({ error: 'file is required for file resources' });
    }

    // Check for duplicate name
    const existing = await db
      .select({ id: teamResources.id })
      .from(teamResources)
      .where(eq(teamResources.name, name))
      .limit(1);
    if (existing.length > 0) {
      return reply.status(409).send({ error: 'A resource with that name already exists' });
    }

    const [row] = await db
      .insert(teamResources)
      .values({
        name,
        type,
        url,
        description,
        content,
        fileData,
        fileName,
        fileMimeType,
        fileSize,
        tags,
        createdBy: request.user.id,
      })
      .returning({
        id: teamResources.id,
        name: teamResources.name,
        type: teamResources.type,
        url: teamResources.url,
        description: teamResources.description,
        content: teamResources.content,
        fileName: teamResources.fileName,
        fileMimeType: teamResources.fileMimeType,
        fileSize: teamResources.fileSize,
        tags: teamResources.tags,
        createdAt: teamResources.createdAt,
      });
    return reply.status(201).send(row);
  });

  // Update resource (multipart for file replacement, JSON otherwise)
  app.patch<{ Params: { id: string } }>('/api/resources/:id', async (request, reply) => {
    const contentType = request.headers['content-type'] || '';
    const updates: Record<string, unknown> = {};

    if (contentType.includes('multipart/form-data')) {
      const parts = request.parts();
      for await (const part of parts) {
        if (part.type === 'file') {
          if (part.fieldname === 'file') {
            const buf = await part.toBuffer();
            updates.fileData = buf;
            updates.fileName = part.filename;
            updates.fileMimeType = part.mimetype;
            updates.fileSize = buf.length;
          }
        } else {
          const value = part.value as string;
          switch (part.fieldname) {
            case 'name': updates.name = value; break;
            case 'url': updates.url = value || null; break;
            case 'description': updates.description = value || null; break;
            case 'content': updates.content = value || null; break;
            case 'tags':
              try { updates.tags = JSON.parse(value); } catch { /* ignore */ }
              break;
          }
        }
      }
    } else {
      const body = request.body as Record<string, unknown>;
      if (body.name !== undefined) updates.name = body.name;
      if (body.url !== undefined) updates.url = body.url || null;
      if (body.description !== undefined) updates.description = body.description || null;
      if (body.content !== undefined) updates.content = body.content || null;
      if (body.tags !== undefined) updates.tags = body.tags;
    }

    if (Object.keys(updates).length === 0) {
      return reply.status(400).send({ error: 'No fields to update' });
    }

    const [row] = await db
      .update(teamResources)
      .set(updates)
      .where(eq(teamResources.id, request.params.id))
      .returning({
        id: teamResources.id,
        name: teamResources.name,
        type: teamResources.type,
        url: teamResources.url,
        description: teamResources.description,
        content: teamResources.content,
        fileName: teamResources.fileName,
        fileMimeType: teamResources.fileMimeType,
        fileSize: teamResources.fileSize,
        tags: teamResources.tags,
        createdAt: teamResources.createdAt,
      });

    if (!row) {
      return reply.status(404).send({ error: 'Resource not found' });
    }

    return reply.send(row);
  });

  app.delete<{ Params: { id: string } }>(
    '/api/resources/:id',
    async (request, reply) => {
      await db.delete(teamResources).where(eq(teamResources.id, request.params.id));
      return reply.status(204).send();
    },
  );
}
