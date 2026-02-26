import { FastifyInstance } from 'fastify';
import { requireAuth } from '../auth/guards.js';
import {
  listAccounts,
  getAccount,
  getAccountContacts,
  getAccountInteractions,
  getAccountOpportunities,
  getAccountIssues,
  getAccountTasks,
  getAccountArchitecture,
  getAccountSentiment,
} from '../services/mcp-accounts.service.js';
import { getInteractionDetail } from '../services/mcp-interactions.service.js';
import { summarizeEmailThread, summarizeAccount, summarizeTechnicalDetails, generateGongCallBrief, summarizePOCs, generateMeetingBrief } from '../services/openai-summary.service.js';
import { getActionItemsWithStatus, completeActionItem, uncompleteActionItem } from '../services/action-items.service.js';
import { invalidateCache } from '../services/cache.service.js';
import { logger } from '../utils/logger.js';

export async function accountsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  /**
   * GET /api/accounts
   * List accounts with optional filters.
   */
  app.get<{
    Querystring: {
      search?: string;
      healthStatus?: string;
      region?: string;
      csmOwner?: string;
      minArr?: string;
      maxArr?: string;
      renewalWithinDays?: string;
      products?: string;
    };
  }>('/api/accounts', async (request, reply) => {
    const { search, healthStatus, region, csmOwner, minArr, maxArr, renewalWithinDays, products } = request.query;

    const result = await listAccounts({
      search: search || undefined,
      healthStatus: healthStatus || undefined,
      region: region || undefined,
      csmOwner: csmOwner || undefined,
      minArr: minArr ? parseFloat(minArr) : undefined,
      maxArr: maxArr ? parseFloat(maxArr) : undefined,
      renewalWithinDays: renewalWithinDays ? parseInt(renewalWithinDays, 10) : undefined,
      products: products ? products.split(',') : undefined,
    });

    // Enrich accounts with open pipeline totals from opportunities
    const enriched = await Promise.all(
      result.map(async (account: Record<string, unknown>) => {
        try {
          const opps = await getAccountOpportunities(account.id as string) as Array<{ arr?: number; stage?: string }>;
          const openPipeline = opps
            .filter((o) => o.stage && !o.stage.toLowerCase().includes('closed'))
            .filter((o) => !((o as Record<string, unknown>).name as string ?? '').toLowerCase().includes('renewal'))
            .reduce((sum, o) => sum + (o.arr ?? 0), 0);
          return { ...account, openPipeline };
        } catch {
          return { ...account, openPipeline: null };
        }
      }),
    );

    return reply.send(enriched);
  });

  /**
   * GET /api/accounts/:id
   * Get a single account by ID.
   */
  app.get<{ Params: { id: string } }>(
    '/api/accounts/:id',
    async (request, reply) => {
      const account = await getAccount(request.params.id);
      return reply.send(account);
    },
  );

  /**
   * GET /api/accounts/:id/contacts
   * Get all contacts for an account.
   */
  app.get<{ Params: { id: string } }>(
    '/api/accounts/:id/contacts',
    async (request, reply) => {
      const contacts = await getAccountContacts(request.params.id);
      return reply.send(contacts);
    },
  );

  /**
   * GET /api/accounts/:id/interactions
   * Get recent interactions for an account.
   */
  app.get<{
    Params: { id: string };
    Querystring: { sourceTypes?: string; fromDate?: string; toDate?: string; limit?: string };
  }>(
    '/api/accounts/:id/interactions',
    async (request, reply) => {
      const { sourceTypes, fromDate, toDate, limit } = request.query;
      const interactions = await getAccountInteractions(request.params.id, {
        sourceTypes: sourceTypes ? sourceTypes.split(',') : undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        limit: limit ? parseInt(limit, 10) : undefined,
      });
      return reply.send(interactions);
    },
  );

  /**
   * GET /api/accounts/:id/opportunities
   * Get all opportunities for an account.
   */
  app.get<{ Params: { id: string } }>(
    '/api/accounts/:id/opportunities',
    async (request, reply) => {
      const opportunities = await getAccountOpportunities(request.params.id);
      return reply.send(opportunities);
    },
  );

  /**
   * GET /api/accounts/:id/issues
   * Get open issues for an account.
   */
  app.get<{ Params: { id: string } }>(
    '/api/accounts/:id/issues',
    async (request, reply) => {
      const issues = await getAccountIssues(request.params.id);
      return reply.send(issues);
    },
  );

  /**
   * GET /api/accounts/:id/tasks
   * Get tasks for an account.
   */
  app.get<{ Params: { id: string } }>(
    '/api/accounts/:id/tasks',
    async (request, reply) => {
      const tasks = await getAccountTasks(request.params.id);
      return reply.send(tasks);
    },
  );

  /**
   * GET /api/accounts/:id/architecture
   * Get architecture documentation for an account.
   */
  app.get<{ Params: { id: string } }>(
    '/api/accounts/:id/architecture',
    async (request, reply) => {
      const doc = await getAccountArchitecture(request.params.id);
      return reply.send(doc);
    },
  );

  /**
   * GET /api/accounts/:id/sentiment
   * Get sentiment trends for an account.
   */
  app.get<{ Params: { id: string } }>(
    '/api/accounts/:id/sentiment',
    async (request, reply) => {
      const sentiment = await getAccountSentiment(request.params.id);
      return reply.send(sentiment);
    },
  );

  /**
   * GET /api/accounts/:id/overview
   * AI-generated account overview using OpenAI. Runs in the background, cached 1 hour.
   */
  app.get<{ Params: { id: string } }>(
    '/api/accounts/:id/overview',
    async (request, reply) => {
      const overview = await summarizeAccount(request.params.id);
      return reply.send({ overview });
    },
  );

  /**
   * GET /api/accounts/:id/action-items
   * AI-extracted action items from recent calls and emails, with completion status.
   */
  app.get<{ Params: { id: string } }>(
    '/api/accounts/:id/action-items',
    async (request, reply) => {
      const items = await getActionItemsWithStatus(request.params.id, request.user.id);
      return reply.send({ items });
    },
  );

  /**
   * POST /api/accounts/:id/action-items/:hash/complete
   * Mark an action item as completed.
   */
  app.post<{ Params: { id: string; hash: string } }>(
    '/api/accounts/:id/action-items/:hash/complete',
    async (request, reply) => {
      await completeActionItem(request.params.id, request.params.hash, request.user.id);
      await invalidateCache(`home:my-action-items:${request.user.id}`);
      return reply.status(204).send();
    },
  );

  /**
   * DELETE /api/accounts/:id/action-items/:hash/complete
   * Unmark an action item completion.
   */
  app.delete<{ Params: { id: string; hash: string } }>(
    '/api/accounts/:id/action-items/:hash/complete',
    async (request, reply) => {
      await uncompleteActionItem(request.params.hash, request.user.id);
      await invalidateCache(`home:my-action-items:${request.user.id}`);
      return reply.status(204).send();
    },
  );

  /**
   * GET /api/accounts/:id/technical-details
   * AI-generated technical details from calls, emails, and architecture docs.
   */
  app.get<{ Params: { id: string } }>(
    '/api/accounts/:id/technical-details',
    async (request, reply) => {
      const details = await summarizeTechnicalDetails(request.params.id);
      return reply.send({ details });
    },
  );

  /**
   * GET /api/accounts/:id/poc-summary
   * AI-generated summary of ongoing POCs from Gong calls and opportunities.
   */
  app.get<{ Params: { id: string } }>(
    '/api/accounts/:id/poc-summary',
    async (request, reply) => {
      const result = await summarizePOCs(request.params.id);
      return reply.send(result ?? { summary: null, health: null });
    },
  );

  /**
   * GET /api/accounts/:id/meeting-brief
   * AI-generated meeting prep brief for an upcoming meeting.
   */
  app.get<{ Params: { id: string }; Querystring: { title?: string; date?: string } }>(
    '/api/accounts/:id/meeting-brief',
    async (request, reply) => {
      const { title, date } = request.query;
      if (!title) {
        return reply.status(400).send({ error: 'title query parameter is required' });
      }
      const brief = await generateMeetingBrief(request.params.id, title, date);
      return reply.send({ brief });
    },
  );

  /**
   * POST /api/accounts/:id/warm-gong-briefs
   * Pre-generate Gong call briefs for all calls on an account.
   * Returns immediately; brief generation happens in the background.
   */
  app.post<{ Params: { id: string } }>(
    '/api/accounts/:id/warm-gong-briefs',
    async (request, reply) => {
      const accountId = request.params.id;

      // Fire and forget — don't block the response
      (async () => {
        try {
          const interactions = (await getAccountInteractions(accountId, {
            sourceTypes: ['gong_call'],
          })) as Array<Record<string, unknown>>;

          const titles = [...new Set(
            interactions
              .map((i) => String(i.title ?? ''))
              .filter((t) => t.length > 0),
          )];

          logger.info(
            { accountId, callCount: titles.length },
            '[warm-gong-briefs] Starting brief generation',
          );

          // Process sequentially to avoid hammering OpenAI
          for (const title of titles) {
            await generateGongCallBrief(accountId, title).catch((err) =>
              logger.warn({ accountId, title, err: (err as Error).message }, '[warm-gong-briefs] Failed'),
            );
          }

          logger.info(
            { accountId, callCount: titles.length },
            '[warm-gong-briefs] Complete',
          );
        } catch (err) {
          logger.warn({ accountId, err: (err as Error).message }, '[warm-gong-briefs] Failed to warm briefs');
        }
      })();

      return reply.status(202).send({ status: 'warming' });
    },
  );

  /**
   * POST /api/accounts/:id/email-thread-summary
   * Summarize an email thread using OpenAI.
   */
  app.post<{
    Params: { id: string };
    Body: { emailIds: string[]; emails?: Array<{ id: string; title: string; preview?: string; date: string; participants?: string[] }> };
  }>(
    '/api/accounts/:id/email-thread-summary',
    async (request, reply) => {
      const { emailIds, emails: clientEmails } = request.body;
      if (!emailIds?.length) {
        return reply.status(400).send({ error: 'emailIds required' });
      }

      // Build a map of fallback data from the client (list-level data)
      const fallbackMap = new Map<string, { title: string; preview?: string; date: string; participants?: string[] }>();
      if (clientEmails) {
        for (const e of clientEmails) {
          fallbackMap.set(e.id, e);
        }
      }

      // Error patterns from MCP that indicate missing data
      const errorPatterns = ['no rows in result set', 'not found', 'error:'];

      const emailDetails = await Promise.all(
        emailIds.map(async (emailId) => {
          try {
            const detail = await getInteractionDetail(
              request.params.id,
              'gmail_email',
              emailId,
            );

            // Check if the content is actually an error message from MCP
            const content = detail?.content ?? '';
            const isError = errorPatterns.some((p) => content.toLowerCase().includes(p));

            if (isError || !content) {
              // Fall back to client-provided preview data
              const fallback = fallbackMap.get(emailId);
              if (fallback?.preview) {
                return {
                  title: fallback.title,
                  content: fallback.preview,
                  date: fallback.date,
                  participants: (fallback.participants ?? []).map((p: string) => ({ name: p, email: null })),
                };
              }
              return null;
            }

            return detail;
          } catch {
            // Fall back to client-provided preview data
            const fallback = fallbackMap.get(emailId);
            if (fallback?.preview) {
              return {
                title: fallback.title,
                content: fallback.preview,
                date: fallback.date,
                participants: (fallback.participants ?? []).map((p: string) => ({ name: p, email: null })),
              };
            }
            return null;
          }
        }),
      );

      const validEmails = emailDetails.filter(
        (e): e is NonNullable<typeof e> => e != null,
      );

      if (validEmails.length === 0) {
        return reply.send({ summary: null, emailCount: 0, participants: [] });
      }

      const allParticipants = [
        ...new Set(
          validEmails.flatMap((e) =>
            (e.participants ?? []).map(
              (p: { name: string; email: string | null }) =>
                p.name || p.email || 'Unknown',
            ),
          ),
        ),
      ];

      const summary = await summarizeEmailThread(
        emailIds,
        validEmails.map((e) => ({
          title: e.title,
          content: e.content,
          date: e.date,
          participants: (e.participants ?? []).map(
            (p: { name: string; email: string | null }) =>
              p.name || p.email || 'Unknown',
          ),
        })),
      );

      return reply.send({
        summary,
        emailCount: validEmails.length,
        participants: allParticipants,
      });
    },
  );
}
