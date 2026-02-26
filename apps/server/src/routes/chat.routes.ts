import { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { requireAuth } from '../auth/guards.js';
import { streamChat } from '../services/chat.service.js';
import { getRedisClient } from '../services/cache.service.js';
import { getHomepageData } from '../services/mcp-home.service.js';
import { summarizePOCs } from '../services/openai-summary.service.js';
import { db } from '../db/client.js';
import { userMcpTokens } from '../db/schema/index.js';
import { decrypt } from '../services/encryption.service.js';

const CHAT_HISTORY_TTL = 7 * 24 * 60 * 60; // 7 days

function chatHistoryKey(userId: string): string {
  return `chat:history:${userId}`;
}

export async function chatRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  /**
   * GET /api/chat/history
   * Load persisted chat history for the current user.
   */
  app.get('/api/chat/history', async (request, reply) => {
    const redis = getRedisClient();
    if (!redis) {
      return reply.send({ messages: [] });
    }

    try {
      const data = await redis.get(chatHistoryKey(request.user.id));
      return reply.send({ messages: data ? JSON.parse(data) : [] });
    } catch {
      return reply.send({ messages: [] });
    }
  });

  /**
   * PUT /api/chat/history
   * Save chat history for the current user.
   */
  app.put<{
    Body: {
      messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    };
  }>('/api/chat/history', async (request, reply) => {
    const redis = getRedisClient();
    if (!redis) {
      return reply.send({ ok: true });
    }

    try {
      const { messages } = request.body;
      await redis.set(
        chatHistoryKey(request.user.id),
        JSON.stringify(messages ?? []),
        'EX',
        CHAT_HISTORY_TTL,
      );
    } catch {
      // Ignore write failures
    }

    return reply.send({ ok: true });
  });

  /**
   * DELETE /api/chat/history
   * Clear chat history for the current user.
   */
  app.delete('/api/chat/history', async (request, reply) => {
    const redis = getRedisClient();
    if (redis) {
      try {
        await redis.del(chatHistoryKey(request.user.id));
      } catch {
        // Ignore
      }
    }
    return reply.send({ ok: true });
  });

  /**
   * POST /api/chat
   * Streaming SSE endpoint for the Digital Sherpa chat agent.
   */
  app.post<{
    Body: {
      messages: Array<{ role: 'user' | 'assistant'; content: string }>;
      pageContext: {
        path: string;
        accountId?: string;
        pageTitle?: string;
      };
    };
  }>('/api/chat', async (request, reply) => {
    const { messages, pageContext } = request.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'BadRequest',
        message: 'messages array is required',
      });
    }

    const user = {
      name: request.user.name,
      email: request.user.email,
      role: request.user.role,
    };

    // Fetch user's accounts and POC health for system prompt context
    let userAccounts: Array<{ id: string; name: string }> = [];
    let pocHealthData: Array<{ accountId: string; accountName: string; rating: string; reason: string; summary: string }> = [];
    try {
      const homeData = await getHomepageData(user.name, user.email);
      userAccounts = (homeData.myAccounts ?? []).map((a: Record<string, unknown>) => ({
        id: a.id as string,
        name: a.name as string,
      }));

      // Fetch POC health for all user accounts (cached 1hr, fast)
      const pocResults = await Promise.allSettled(
        userAccounts.map(async (a) => {
          const result = await summarizePOCs(a.id);
          if (result?.health) {
            return {
              accountId: a.id,
              accountName: a.name,
              rating: result.health.rating,
              reason: result.health.reason,
              summary: result.summary ?? '',
            };
          }
          return null;
        }),
      );
      for (const r of pocResults) {
        if (r.status === 'fulfilled' && r.value != null) {
          pocHealthData.push(r.value);
        }
      }
    } catch {
      // Continue without account/POC context
    }

    // Check if user has a connected support MCP token
    let supportMcpToken: string | null = null;
    try {
      const tokens = await db
        .select()
        .from(userMcpTokens)
        .where(and(eq(userMcpTokens.userId, request.user.id), eq(userMcpTokens.serverKey, 'support-agent-tools')))
        .limit(1);

      if (tokens.length > 0) {
        const isExpired = tokens[0].expiresAt && tokens[0].expiresAt < new Date();
        if (!isExpired) {
          supportMcpToken = decrypt(tokens[0].accessTokenEncrypted);
        }
      }
    } catch {
      // Continue without support MCP
    }

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    try {
      for await (const chunk of streamChat(messages, user, pageContext, userAccounts, pocHealthData, { userId: request.user.id, supportMcpToken })) {
        reply.raw.write(chunk);
      }
    } catch (err) {
      request.log.error({ err }, 'Chat stream error');
      reply.raw.write(
        `data: ${JSON.stringify({ type: 'error', content: 'Internal server error' })}\n\n`,
      );
      reply.raw.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    }

    reply.raw.write('data: [DONE]\n\n');
    reply.raw.end();
  });
}
