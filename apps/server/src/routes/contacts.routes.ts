import { FastifyInstance } from 'fastify';
import { requireAuth } from '../auth/guards.js';
import { listAccounts, getAccountContacts } from '../services/mcp-accounts.service.js';
import { searchAccountInteractions } from '../services/mcp-search.service.js';
import { cachedCall } from '../services/cache.service.js';
import { logger } from '../utils/logger.js';

export async function contactsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  /**
   * GET /api/contacts
   * Aggregates contacts across all accounts, attaching accountId and accountName.
   */
  app.get('/api/contacts', async (_request, reply) => {
    const accounts = await listAccounts();
    const accountsArr = accounts as Array<{ id: string; name: string }>;

    const results = await Promise.allSettled(
      accountsArr.map(async (account) => {
        const contacts = await getAccountContacts(account.id);
        return (contacts as Array<Record<string, unknown>>).map((c) => ({
          ...c,
          accountId: account.id,
          accountName: account.name,
        }));
      }),
    );

    const allContacts: Array<Record<string, unknown>> = [];
    for (const result of results) {
      if (result.status === 'fulfilled') {
        allContacts.push(...result.value);
      } else {
        logger.warn({ error: result.reason }, 'Failed to fetch contacts for an account');
      }
    }

    // Enrich contacts with interaction counts from MCP search
    const SOURCE_TYPE_MAP: Record<string, string> = {
      calendar_event: 'meeting', gong_call: 'call', gong: 'call',
      gmail: 'email', gmail_email: 'email',
      zendesk_ticket: 'ticket', github_issue: 'ticket',
    };
    const enriched = await Promise.all(
      allContacts.map(async (contact) => {
        const name = (contact.name as string) || '';
        const accountId = contact.accountId as string;
        if (!name || !accountId) return contact;
        try {
          const interactions = await cachedCall(
            `mcp:contact-interactions:${accountId}:${name}`,
            300,
            () => searchAccountInteractions(accountId, name),
          ) as Array<Record<string, unknown>>;
          let callCount = 0;
          let emailCount = 0;
          for (const i of interactions) {
            const rawType = ((i.sourceType ?? i.source_type ?? '') as string);
            const normalized = SOURCE_TYPE_MAP[rawType] ?? rawType;
            if (normalized === 'call') callCount++;
            else if (normalized === 'email') emailCount++;
          }
          return { ...contact, gongCallCount: callCount, emailCount };
        } catch {
          return contact;
        }
      }),
    );

    return reply.send(enriched);
  });

  /**
   * GET /api/contacts/:accountId/:contactName/interactions
   * Searches for interactions involving a specific contact within an account.
   */
  app.get<{
    Params: { accountId: string; contactName: string };
  }>('/api/contacts/:accountId/:contactName/interactions', async (request, reply) => {
    const { accountId, contactName } = request.params;
    const decodedName = decodeURIComponent(contactName);

    const results = await cachedCall(
      `mcp:contact-interactions:${accountId}:${decodedName}`,
      300,
      () => searchAccountInteractions(accountId, decodedName),
    );

    return reply.send(results);
  });
}
