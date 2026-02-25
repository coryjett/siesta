import crypto from 'node:crypto';
import OpenAI from 'openai';
import { env } from '../config/env.js';
import { cachedCall } from './cache.service.js';
import { logger } from '../utils/logger.js';
import {
  getAccount,
  getAccountOpportunities,
  getAccountInteractions,
  getAccountIssues,
  getAccountTasks,
} from './mcp-accounts.service.js';
import { getInteractionDetail } from './mcp-interactions.service.js';

let openai: OpenAI | null = null;

function getClient(): OpenAI | null {
  if (!env.OPENAI_API_KEY) return null;
  if (!openai) {
    openai = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
      baseURL: env.OPENAI_BASE_URL,
    });
  }
  return openai;
}

interface EmailInput {
  title: string;
  content: string;
  date: string;
  participants: string[];
}

export async function summarizeEmailThread(
  emailIds: string[],
  emails: EmailInput[],
): Promise<string | null> {
  const client = getClient();
  if (!client) {
    logger.warn('OpenAI API key not configured, skipping email thread summary');
    return null;
  }

  const sortedIds = [...emailIds].sort();
  const hash = crypto.createHash('md5').update(sortedIds.join(',')).digest('hex');
  const cacheKey = `openai:thread-summary:${hash}`;

  return cachedCall<string | null>(cacheKey, 86400, async () => {
    try {
      const sorted = [...emails].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      );

      const threadText = sorted
        .map(
          (e, i) =>
            `--- Email ${i + 1} (${e.date}) ---\nFrom/To: ${e.participants.join(', ')}\nSubject: ${e.title}\n\n${e.content}`,
        )
        .join('\n\n');

      const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'You are a helpful assistant that summarizes email threads for sales engineers. Provide a concise summary covering: key points discussed, decisions made, action items, and overall tone. Use bullet points for clarity. Keep it under 200 words.',
          },
          {
            role: 'user',
            content: `Summarize this email thread (${sorted.length} emails):\n\n${threadText}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 500,
      });

      return response.choices[0]?.message?.content ?? null;
    } catch (err) {
      logger.error({ err }, 'Failed to summarize email thread with OpenAI');
      return null;
    }
  });
}

/**
 * Generate an AI overview of an account by gathering all available data
 * (account details, opportunities, recent interactions, issues, tasks)
 * and asking OpenAI for a brief summary. Cached for 1 hour in Redis.
 */
export async function summarizeAccount(
  accountId: string,
): Promise<string | null> {
  const client = getClient();
  if (!client) {
    logger.warn('OpenAI API key not configured, skipping account overview');
    return null;
  }

  const cacheKey = `openai:account-overview:${accountId}`;

  return cachedCall<string | null>(cacheKey, 3600, async () => {
    try {
      // Gather all data in parallel — each call is individually cached via MCP cache
      const [account, opportunities, interactions, issues, tasks] =
        await Promise.all([
          getAccount(accountId).catch(() => null),
          getAccountOpportunities(accountId).catch(() => []),
          getAccountInteractions(accountId, { limit: 20 }).catch(() => []),
          getAccountIssues(accountId).catch(() => []),
          getAccountTasks(accountId).catch(() => []),
        ]);

      if (!account) return null;

      const sections: string[] = [];

      // Account details
      sections.push(
        `ACCOUNT: ${(account as Record<string, unknown>).name}` +
          `\nHealth: ${(account as Record<string, unknown>).healthStatus ?? 'unknown'}` +
          `\nARR: ${(account as Record<string, unknown>).arr ?? 'unknown'}` +
          `\nRegion: ${(account as Record<string, unknown>).region ?? 'unknown'}` +
          `\nProducts: ${((account as Record<string, unknown>).products as string[])?.join(', ') || 'none'}` +
          `\nRenewal Date: ${(account as Record<string, unknown>).renewalDate ?? 'unknown'}` +
          `\nCSM Owner: ${(account as Record<string, unknown>).csmOwner ?? 'unknown'}` +
          `\nCSE Owner: ${(account as Record<string, unknown>).cseOwner ?? 'unknown'}` +
          `\nDescription: ${(account as Record<string, unknown>).description ?? 'none'}`,
      );

      // Opportunities
      const opps = opportunities as Array<Record<string, unknown>>;
      if (opps.length > 0) {
        const oppLines = opps.map(
          (o) =>
            `- ${o.name} | Stage: ${o.stage} | Amount: ${o.amount ?? 'N/A'} | Close: ${o.closeDate ?? 'N/A'} | Probability: ${o.probability ?? 'N/A'}%`,
        );
        sections.push(`OPPORTUNITIES (${opps.length}):\n${oppLines.join('\n')}`);
      }

      // Recent interactions
      const ints = interactions as Array<Record<string, unknown>>;
      if (ints.length > 0) {
        const intLines = ints.slice(0, 15).map(
          (i) =>
            `- [${i.sourceType}] ${i.title} (${i.date})${i.sentiment ? ` — sentiment: ${i.sentiment}` : ''}`,
        );
        sections.push(
          `RECENT INTERACTIONS (${ints.length}):\n${intLines.join('\n')}`,
        );
      }

      // Issues
      const iss = issues as Array<Record<string, unknown>>;
      if (iss.length > 0) {
        const issLines = iss.map(
          (i) =>
            `- [${i.sourceSystem}] ${i.title} | Status: ${i.status} | Priority: ${i.priority ?? 'N/A'}`,
        );
        sections.push(`OPEN ISSUES (${iss.length}):\n${issLines.join('\n')}`);
      }

      // Tasks
      const tks = tasks as Array<Record<string, unknown>>;
      if (tks.length > 0) {
        const tkLines = tks.map(
          (t) =>
            `- ${t.title} | Status: ${t.status} | Priority: ${t.priority ?? 'N/A'} | Due: ${t.dueDate ?? 'N/A'}`,
        );
        sections.push(`TASKS (${tks.length}):\n${tkLines.join('\n')}`);
      }

      const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'You are a sales engineering assistant. Given all available data about a customer account, provide a structured overview organized into 3-5 sections. Each section must have a heading on its own line formatted as **Heading** followed by 1-3 short bullet points (using - prefix) with concise details. Example format:\n\n**Recent Conversations**\n- Discussed migration timeline in last Gong call, customer targeting Q3\n- Follow-up needed on security questionnaire\n\n**Active Opportunities**\n- Expansion deal in negotiation stage, $50K ARR\n\nFocus on: what was discussed in recent calls and emails (key topics, decisions, asks), active opportunities and their status, open issues or blockers, and next steps or action items. Synthesize insights from Gong calls and email threads. Be concise and actionable. Do not repeat raw data — extract what a sales engineer needs to know.',
          },
          {
            role: 'user',
            content: `Provide a brief overview of this account:\n\n${sections.join('\n\n')}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 600,
      });

      return response.choices[0]?.message?.content ?? null;
    } catch (err) {
      logger.error({ err }, 'Failed to generate account overview with OpenAI');
      return null;
    }
  });
}

export interface ActionItem {
  action: string;
  source: string;
  date: string;
  owner: string | null;
  status: 'open' | 'done';
}

/**
 * Extract action items from recent calls and emails for an account.
 * Fetches the content of recent Gong calls and Gmail emails, then asks
 * OpenAI to identify commitments and action items. Cached 1 hour.
 */
export async function extractActionItems(
  accountId: string,
): Promise<ActionItem[]> {
  const client = getClient();
  if (!client) {
    logger.warn('OpenAI API key not configured, skipping action items');
    return [];
  }

  const cacheKey = `openai:action-items:${accountId}`;

  return cachedCall<ActionItem[]>(cacheKey, 3600, async () => {
    try {
      // Get recent calls and emails
      const interactions = (await getAccountInteractions(accountId, { limit: 30 }).catch(
        () => [],
      )) as Array<Record<string, unknown>>;

      const callsAndEmails = interactions.filter(
        (i) => i.sourceType === 'gong_call' || i.sourceType === 'gmail_email',
      );

      if (callsAndEmails.length === 0) return [];

      // Fetch content for the most recent interactions (limit to 10 to avoid huge prompts)
      const recent = callsAndEmails.slice(0, 10);
      const details = await Promise.all(
        recent.map(async (i) => {
          try {
            const detail = await getInteractionDetail(
              accountId,
              i.sourceType as string,
              i.id as string,
            );
            return {
              sourceType: i.sourceType as string,
              title: (detail?.title ?? i.title) as string,
              date: (detail?.date ?? i.date) as string,
              content: (detail?.content ?? '') as string,
              participants: (detail?.participants ?? []) as Array<{ name: string; email: string | null }>,
            };
          } catch {
            return {
              sourceType: i.sourceType as string,
              title: i.title as string,
              date: i.date as string,
              content: (i.preview ?? '') as string,
              participants: [] as Array<{ name: string; email: string | null }>,
            };
          }
        }),
      );

      const validDetails = details.filter((d) => d.content);
      if (validDetails.length === 0) return [];

      const interactionText = validDetails
        .map(
          (d, i) =>
            `--- ${d.sourceType === 'gong_call' ? 'Call' : 'Email'} ${i + 1}: "${d.title}" (${d.date}) ---\nParticipants: ${d.participants.map((p) => p.name || p.email).join(', ') || 'unknown'}\n\n${d.content}`,
        )
        .join('\n\n');

      const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'You are a sales engineering assistant. Given transcripts and emails from customer interactions, extract specific action items — things our team committed to doing, follow-ups promised, deliverables requested, or next steps agreed upon.\n\nReturn a JSON array of action items. Each item must have:\n- "action": concise description of what needs to be done\n- "source": the title of the call or email where this was committed\n- "date": the date of that interaction (ISO format)\n- "owner": who on our team is responsible (name if mentioned, null if unclear)\n- "status": always "open"\n\nOnly include concrete, actionable items — not vague observations. If no action items are found, return an empty array [].\n\nReturn ONLY valid JSON, no markdown fences or other text.',
          },
          {
            role: 'user',
            content: `Extract action items from these recent interactions:\n\n${interactionText}`,
          },
        ],
        temperature: 0.2,
        max_tokens: 800,
      });

      const raw = response.choices[0]?.message?.content?.trim() ?? '[]';
      // Strip markdown fences if present
      const jsonStr = raw.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
      const parsed = JSON.parse(jsonStr);

      if (!Array.isArray(parsed)) return [];

      return parsed.map((item: Record<string, unknown>) => ({
        action: String(item.action ?? ''),
        source: String(item.source ?? ''),
        date: String(item.date ?? ''),
        owner: item.owner ? String(item.owner) : null,
        status: 'open' as const,
      }));
    } catch (err) {
      logger.error({ err }, 'Failed to extract action items with OpenAI');
      return [];
    }
  });
}
