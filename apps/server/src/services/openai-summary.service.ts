import crypto from 'node:crypto';
import OpenAI from 'openai';
import { env } from '../config/env.js';
import { cachedCall, getCache, invalidateCache, getRedisClient } from './cache.service.js';
import { logger } from '../utils/logger.js';
import { callTool } from '../integrations/mcp/client.js';
import { hashActionItem } from '../utils/hash.js';
import {
  listAccounts,
  getAccount,
  getAccountContacts,
  getAccountOpportunities,
  getAccountInteractions,
  getAccountIssues,
  getAccountTasks,
  getAccountArchitecture,
} from './mcp-accounts.service.js';
import { getInteractionDetail } from './mcp-interactions.service.js';
import { getHomepageData } from './mcp-home.service.js';
import { db } from '../db/client.js';
import { users } from '../db/schema/index.js';
import { gte } from 'drizzle-orm';

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
        model: env.OPENAI_MODEL,
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

  return cachedCall<string | null>(cacheKey, 0, async () => {
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

      // Recent interactions — include full Gong briefs where available
      const ints = interactions as Array<Record<string, unknown>>;
      if (ints.length > 0) {
        const gongCalls = ints.filter((i) => i.sourceType === 'gong_call');
        const otherInts = ints.filter((i) => i.sourceType !== 'gong_call');

        // Fetch full briefs for Gong calls (already cached if warmed)
        const gongBriefs = await Promise.all(
          [...new Set(gongCalls.map((c) => String(c.title ?? '')).filter(Boolean))]
            .slice(0, 10)
            .map(async (title) => {
              const brief = await generateGongCallBrief(accountId, title).catch(() => null);
              return brief ? `[Gong Call] ${title}:\n${brief}` : `[Gong Call] ${title}`;
            }),
        );

        if (gongBriefs.length > 0) {
          sections.push(`GONG CALL BRIEFS (${gongBriefs.length}):\n${gongBriefs.join('\n\n')}`);
        }

        if (otherInts.length > 0) {
          const intLines = otherInts.slice(0, 15).map(
            (i) =>
              `- [${i.sourceType}] ${i.title} (${i.date})${i.sentiment ? ` — sentiment: ${i.sentiment}` : ''}`,
          );
          sections.push(
            `OTHER INTERACTIONS (${otherInts.length}):\n${intLines.join('\n')}`,
          );
        }
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
        model: env.OPENAI_MODEL,
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
  id: string;
  action: string;
  source: string;
  sourceType: string;
  recordId: string | null;
  date: string;
  owner: string | null;
  status: 'open' | 'done';
  completedAt: string | null;
}

/**
 * Internal cache shape that tracks which interactions have already been
 * analyzed so we can do incremental extraction on new calls/emails only.
 */
interface ActionItemsCacheEntry {
  items: ActionItem[];
  analyzedCallTitles: string[];
  analyzedEmailIds: string[];
}

/**
 * Extract action items / follow-ups from recent Gong calls and emails.
 * Uses full AI-generated Gong briefs (cached indefinitely) and email
 * content to give OpenAI rich context for identifying commitments,
 * follow-ups, and next steps.
 *
 * Incremental: only analyzes interactions that haven't been analyzed yet,
 * then merges new items with existing ones. Cached indefinitely per account,
 * invalidated when new Gong calls are discovered by periodic refresh.
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

  // Check for existing cached entry with analyzed interaction tracking
  const existing = await getCache<ActionItemsCacheEntry>(cacheKey);

  try {
    // Fetch calls and emails separately so we can use full briefs for calls
    const [calls, emails] = await Promise.all([
      getAccountInteractions(accountId, { sourceTypes: ['gong_call'] }).catch(() => []),
      getAccountInteractions(accountId, { sourceTypes: ['gmail_email'], limit: 15 }).catch(() => []),
    ]);

    const callsArr = calls as Array<Record<string, unknown>>;
    const emailsArr = emails as Array<Record<string, unknown>>;

    if (callsArr.length === 0 && emailsArr.length === 0) {
      return existing?.items ?? [];
    }

    const analyzedCallTitles = new Set(existing?.analyzedCallTitles ?? []);
    const analyzedEmailIds = new Set(existing?.analyzedEmailIds ?? []);

    // Filter to only new (unanalyzed) interactions
    const allCallTitles = [...new Set(
      callsArr.map((c) => String(c.title ?? '')).filter(Boolean),
    )].slice(0, 10);
    const newCallTitles = allCallTitles.filter((t) => !analyzedCallTitles.has(t));

    const allEmailIds = emailsArr.slice(0, 10).map((e) => String(e.id ?? '')).filter(Boolean);
    const newEmails = emailsArr.slice(0, 10).filter((e) => {
      const id = String(e.id ?? '');
      return id && !analyzedEmailIds.has(id);
    });

    // If everything has already been analyzed, return cached items
    if (newCallTitles.length === 0 && newEmails.length === 0) {
      return existing?.items ?? [];
    }

    const isMcpError = (text: string): boolean => {
      if (!text || text.length > 200) return false;
      const lower = text.toLowerCase().trim();
      return lower.includes('no rows in result set') || lower.startsWith('error:') || lower === 'not found';
    };

    const sections: string[] = [];

    // Gong calls — only new ones
    if (newCallTitles.length > 0) {
      const gongData = await Promise.all(
        newCallTitles.map(async (title) => {
          const call = callsArr.find((c) => String(c.title ?? '') === title);
          const callDate = String(call?.date ?? '');
          const callRecordId = String(call?.id ?? call?.record_id ?? '');
          const [brief, transcript] = await Promise.all([
            generateGongCallBrief(accountId, title).catch(() => null),
            fetchFullGongTranscript(accountId, title).catch(() => null),
          ]);
          if (!brief && !transcript) return null;
          const parts: string[] = [`--- Call [sourceType=gong_call, recordId=${callRecordId}]: "${title}" (${callDate}) ---`];
          if (brief) parts.push(`Brief:\n${brief}`);
          if (transcript?.transcript) {
            const text = transcript.transcript.length > 3000
              ? transcript.transcript.slice(0, 3000) + '\n[...truncated]'
              : transcript.transcript;
            parts.push(`Transcript:\n${text}`);
          }
          return parts.join('\n');
        }),
      );
      const validCalls = gongData.filter(Boolean);
      if (validCalls.length > 0) {
        sections.push(validCalls.join('\n\n'));
      }
    }

    // Emails — only new ones
    if (newEmails.length > 0) {
      const emailDetails = await Promise.all(
        newEmails.map(async (i) => {
          const recordId = String(i.id ?? '');
          const title = String(i.title ?? '');
          const date = String(i.date ?? '');
          if (!recordId) return null;
          try {
            const detail = await getInteractionDetail(accountId, 'gmail_email', recordId);
            const content = String(detail?.content ?? '');
            if (content && !isMcpError(content)) {
              const participants = ((detail?.participants ?? []) as Array<{ name: string; email: string | null }>)
                .map((p) => p.name || p.email || 'unknown')
                .join(', ');
              return `--- Email [sourceType=gmail_email, recordId=${recordId}]: "${title}" (${date}) ---\nParticipants: ${participants || 'unknown'}\n\n${content}`;
            }
          } catch { /* skip */ }
          // Fallback to preview
          const preview = String(i.preview ?? '');
          return preview ? `--- Email [sourceType=gmail_email, recordId=${recordId}]: "${title}" (${date}) ---\n${preview}` : null;
        }),
      );
      const validEmails = emailDetails.filter(Boolean);
      if (validEmails.length > 0) {
        sections.push(validEmails.join('\n\n'));
      }
    }

    if (sections.length === 0) {
      // New interactions found but no usable content — return existing items
      return existing?.items ?? [];
    }

    logger.info(
      { accountId, newCalls: newCallTitles.length, newEmails: newEmails.length, existingItems: existing?.items.length ?? 0 },
      '[action-items] Analyzing new interactions only (incremental)',
    );

    const response = await client.chat.completions.create({
      model: env.OPENAI_MODEL,
      messages: [
        {
          role: 'system',
          content:
            'You are a sales engineering assistant. Given Gong call briefs, full call transcripts, and email threads from customer interactions, extract specific follow-up items and action items that our team needs to act on.\n\nFocus on:\n- Things our team committed to doing (deliverables, demos, docs, follow-up calls)\n- Customer requests or asks that need a response\n- Next steps agreed upon in calls or emails\n- Open questions that need answers\n- Deadlines or time-sensitive commitments\n- Verbal commitments or promises made during calls (use the full transcript for these)\n\nEach interaction is tagged with [sourceType=..., recordId=...] in its header. You MUST include these exact values in your response for each action item.\n\nReturn a JSON array of action items. Each item must have:\n- "action": concise description of what needs to be done\n- "source": the title of the call or email where this was identified\n- "sourceType": the sourceType tag from the interaction header (e.g. "gong_call", "gmail_email")\n- "recordId": the recordId tag from the interaction header\n- "date": the date of that interaction (ISO format)\n- "owner": who on our team is responsible (name if mentioned, null if unclear)\n- "status": always "open"\n\nOnly include concrete, actionable items — not vague observations. Prioritize items from the most recent interactions. Use the full transcripts to catch action items that may have been missed in the briefs. If no action items are found, return an empty array [].\n\nReturn ONLY valid JSON, no markdown fences or other text.',
        },
        {
          role: 'user',
          content: `Extract follow-up items and action items from these recent interactions:\n\n${sections.join('\n\n')}`,
        },
      ],
      temperature: 0.2,
      max_tokens: 2000,
    });

    const raw = response.choices[0]?.message?.content?.trim() ?? '[]';
    // Strip markdown fences if present
    const jsonStr = raw.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    const parsed = JSON.parse(jsonStr);

    const newItems: ActionItem[] = Array.isArray(parsed)
      ? parsed.map((item: Record<string, unknown>) => {
          const action = String(item.action ?? '');
          const source = String(item.source ?? '');
          const date = String(item.date ?? '');
          const sourceType = String(item.sourceType ?? '');
          const recordId = item.recordId ? String(item.recordId) : null;
          return {
            id: hashActionItem(accountId, action, source, date, sourceType, recordId ?? undefined),
            action,
            source,
            sourceType,
            recordId,
            date,
            owner: item.owner ? String(item.owner) : null,
            status: 'open' as const,
            completedAt: null,
          };
        })
      : [];

    // Merge: existing items + new items, deduplicate by id
    const existingItems = existing?.items ?? [];
    const itemsById = new Map<string, ActionItem>();
    for (const item of existingItems) itemsById.set(item.id, item);
    for (const item of newItems) itemsById.set(item.id, item);
    const mergedItems = [...itemsById.values()];

    // Update the tracked set of analyzed interactions
    const updatedEntry: ActionItemsCacheEntry = {
      items: mergedItems,
      analyzedCallTitles: [...new Set([...analyzedCallTitles, ...allCallTitles])],
      analyzedEmailIds: [...new Set([...analyzedEmailIds, ...allEmailIds])],
    };

    // Cache indefinitely (TTL 0)
    const redis = getRedisClient();
    if (redis) {
      await redis.set(cacheKey, JSON.stringify(updatedEntry));
    }

    return mergedItems;
  } catch (err) {
    logger.error({ err }, 'Failed to extract action items with OpenAI');
    return existing?.items ?? [];
  }
}

/**
 * Generate an AI-powered technical details summary for an account
 * by combining Gong call content, email content, and architecture docs.
 * Cached for 1 hour in Redis.
 */
export async function summarizeTechnicalDetails(
  accountId: string,
): Promise<string | null> {
  const client = getClient();
  if (!client) {
    logger.warn('OpenAI API key not configured, skipping technical details');
    return null;
  }

  const cacheKey = `openai:tech-details:${accountId}`;

  return cachedCall<string | null>(cacheKey, 0, async () => {
    try {
      // Fetch calls, emails, and architecture doc in parallel
      const [calls, emails, architectureDoc] = await Promise.all([
        getAccountInteractions(accountId, { sourceTypes: ['gong_call'] }).catch(() => []),
        getAccountInteractions(accountId, { sourceTypes: ['gmail_email'] }).catch(() => []),
        getAccountArchitecture(accountId).catch(() => null),
      ]);

      const callsArr = calls as Array<Record<string, unknown>>;
      const emailsArr = emails as Array<Record<string, unknown>>;

      // Check if a string looks like an MCP error
      const isMcpError = (text: string): boolean => {
        if (!text || text.length > 200) return false;
        const lower = text.toLowerCase().trim();
        return lower.includes('no rows in result set') || lower.startsWith('error:') || lower === 'not found';
      };

      const sections: string[] = [];

      // Architecture doc (if available)
      const archContent = (architectureDoc as Record<string, unknown> | null)?.content as string | undefined;
      if (archContent && !isMcpError(archContent)) {
        sections.push(`ARCHITECTURE DOCUMENTATION:\n${archContent}`);
      }

      // Gong calls — use full AI-generated briefs (already cached if warmed)
      const callTitles = [...new Set(
        callsArr.map((c) => String(c.title ?? '')).filter(Boolean),
      )].slice(0, 10);

      if (callTitles.length > 0) {
        const gongBriefs = await Promise.all(
          callTitles.map(async (title) => {
            const brief = await generateGongCallBrief(accountId, title).catch(() => null);
            return brief ? `--- "${title}" ---\n${brief}` : null;
          }),
        );
        const validBriefs = gongBriefs.filter(Boolean);
        if (validBriefs.length > 0) {
          sections.push(`GONG CALL BRIEFS (${validBriefs.length} calls):\n${validBriefs.join('\n\n')}`);
        }
      }

      // Emails — fetch content via getInteractionDetail
      if (emailsArr.length > 0) {
        const emailDetails = await Promise.all(
          emailsArr.slice(0, 15).map(async (i) => {
            const recordId = String(i.id ?? i.record_id ?? '');
            const title = String(i.title ?? '');
            if (!recordId) return null;
            try {
              const detail = await getInteractionDetail(accountId, 'gmail_email', recordId);
              const content = String(detail?.content ?? '');
              if (content && !isMcpError(content)) {
                return `--- "${title}" (${i.date}) ---\n${content}`;
              }
            } catch { /* skip */ }
            return null;
          }),
        );
        const validEmails = emailDetails.filter(Boolean);
        if (validEmails.length > 0) {
          sections.push(`EMAILS (${validEmails.length} emails):\n${validEmails.join('\n\n')}`);
        }
      }

      if (sections.length === 0) return null;

      logger.info({ accountId, calls: callTitles.length, emails: emailsArr.length, hasArchDoc: !!archContent }, '[tech-details] Sending to OpenAI');

      const response = await client.chat.completions.create({
        model: env.OPENAI_MODEL,
        messages: [
          {
            role: 'system',
            content:
              'You are a sales engineering assistant. Given Gong call transcripts, email threads, and architecture documentation for a customer account, extract and summarize all technical details. Organize into 3-8 sections covering areas like:\n\n- Current architecture and tech stack (languages, frameworks, cloud providers, databases)\n- Integration points and APIs (what they connect to, protocols, data flows)\n- Technical requirements and constraints (performance, security, compliance)\n- Technical discussions from calls (what was demoed, POC details, technical questions asked, concerns raised)\n- Technical blockers or concerns\n- Infrastructure and deployment details (hosting, CI/CD, environments)\n- Security and compliance requirements\n- Migration or implementation plans discussed\n\nFormat each section with a heading on its own line as **Heading** followed by concise bullet points (using - prefix). Only include sections where you have relevant information. Be specific and technical — this is for a sales engineer preparing for a call. Include specific technologies, versions, and configurations mentioned.',
          },
          {
            role: 'user',
            content: `Extract all technical details for this account:\n\n${sections.join('\n\n')}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 1500,
      });

      return response.choices[0]?.message?.content ?? null;
    } catch (err) {
      logger.error({ err }, 'Failed to generate technical details with OpenAI');
      return null;
    }
  });
}

/**
 * Fetch all available transcript chunks for a Gong call from the MCP vector
 * store and concatenate them into a full transcript. Cached indefinitely
 * since Gong data is immutable.
 */
export interface GongTranscript {
  title: string;
  summary: string | null;
  transcript: string;
  chunkCount: number;
}

export async function fetchFullGongTranscript(
  accountId: string,
  title: string,
): Promise<GongTranscript | null> {
  const hash = crypto.createHash('md5').update(`${accountId}:${title}`).digest('hex');
  const cacheKey = `gong:transcript:${hash}`;

  return cachedCall<GongTranscript | null>(cacheKey, 0, async () => {
    try {
      const searchResult = await callTool<Record<string, unknown>>('get_account_interactions', {
        company_id: accountId,
        query: title,
        source_types: ['gong_call'],
        limit: 100,
      });

      const results = ((searchResult.results ?? []) as Array<Record<string, unknown>>)
        .filter((r) => String(r.title ?? '') === title);

      if (results.length === 0) return null;

      const summaryChunks: string[] = [];
      const transcriptChunks: string[] = [];

      for (const r of results) {
        const content = String(r.content ?? '');
        if (!content) continue;
        if (content.trimStart().toLowerCase().startsWith('summary')) {
          summaryChunks.push(content);
        } else {
          transcriptChunks.push(content);
        }
      }

      logger.info(
        { accountId, title, summaryChunks: summaryChunks.length, transcriptChunks: transcriptChunks.length },
        '[gong-transcript] Full transcript fetched and cached',
      );

      if (summaryChunks.length === 0 && transcriptChunks.length === 0) return null;

      return {
        title,
        summary: summaryChunks.length > 0 ? summaryChunks.join('\n\n') : null,
        transcript: transcriptChunks.join('\n\n---\n\n'),
        chunkCount: results.length,
      };
    } catch (err) {
      logger.error({ err, accountId, title }, 'Failed to fetch full Gong transcript');
      return null;
    }
  });
}

/**
 * Generate a full Gong call brief by using the cached full transcript
 * and synthesizing via OpenAI.
 * Cached indefinitely (immutable Gong data).
 */
export async function generateGongCallBrief(
  accountId: string,
  title: string,
): Promise<string | null> {
  const client = getClient();
  if (!client) {
    logger.warn('OpenAI API key not configured, skipping Gong call brief');
    return null;
  }

  const hash = crypto.createHash('md5').update(`${accountId}:${title}`).digest('hex');
  const cacheKey = `openai:gong-brief:${hash}`;

  return cachedCall<string | null>(cacheKey, 0, async () => {
    try {
      // Use the cached full transcript
      const gongData = await fetchFullGongTranscript(accountId, title);
      if (!gongData) return null;

      const sections: string[] = [];
      if (gongData.summary) {
        sections.push(`EXISTING CALL SUMMARY (may be truncated):\n${gongData.summary}`);
      }
      if (gongData.transcript) {
        sections.push(`CALL TRANSCRIPT:\n${gongData.transcript}`);
      }

      if (sections.length === 0) return null;

      const response = await client.chat.completions.create({
        model: env.OPENAI_MODEL,
        messages: [
          {
            role: 'system',
            content:
              'You are a sales engineering assistant. Given a call summary and transcript from a Gong call recording, generate a complete, structured call brief.\n\nFormat the brief with these sections using markdown:\n\n## Summary\nA 2-4 sentence overview of the call covering who was involved, what was discussed, and the outcome.\n\n## Key Highlights\n- Bullet points covering the most important discussion topics and decisions\n\n## Action Items\n- Specific tasks or follow-ups that were committed to, with owners if mentioned\n\n## Next Steps\n- What was agreed upon for moving forward\n\nBe concise and factual. Only include information that is clearly supported by the transcript and summary. If a section has no relevant content, omit it.',
          },
          {
            role: 'user',
            content: `Generate a complete call brief for "${title}":\n\n${sections.join('\n\n')}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 1000,
      });

      return response.choices[0]?.message?.content ?? null;
    } catch (err) {
      logger.error({ err }, 'Failed to generate Gong call brief with OpenAI');
      return null;
    }
  });
}

export interface ContactPersonalInfoEntry {
  value: string;
  date?: string; // ISO date of the call where this was mentioned
}

export interface ContactPersonalInfo {
  location?: ContactPersonalInfoEntry;
  interests?: ContactPersonalInfoEntry;
  family?: ContactPersonalInfoEntry;
  hobbies?: ContactPersonalInfoEntry;
  background?: ContactPersonalInfoEntry;
  travel?: ContactPersonalInfoEntry;
  engagement_style?: ContactPersonalInfoEntry;
  concerns?: ContactPersonalInfoEntry;
  other?: ContactPersonalInfoEntry;
}

export interface ContactInsight {
  contactName: string;
  personalInfo: ContactPersonalInfo;
  sourceCallTitles: string[];
}

/**
 * Extract personal insights about contacts from Gong call transcripts.
 * Looks for casual conversation, small talk, and mentions of personal
 * details (location, family, hobbies, interests, travel, etc.).
 * Cached indefinitely — Gong data is immutable.
 */
export async function generateContactInsights(
  accountId: string,
): Promise<ContactInsight[]> {
  const client = getClient();
  if (!client) {
    logger.warn('OpenAI API key not configured, skipping contact insights');
    return [];
  }

  const cacheKey = `openai:contact-insights:${accountId}`;

  return cachedCall<ContactInsight[]>(cacheKey, 0, async () => {
    try {
      const [contacts, calls] = await Promise.all([
        getAccountContacts(accountId).catch(() => []),
        getAccountInteractions(accountId, { sourceTypes: ['gong_call'] }).catch(() => []),
      ]);

      const contactsArr = contacts as Array<Record<string, unknown>>;
      const callsArr = calls as Array<Record<string, unknown>>;

      if (contactsArr.length === 0 || callsArr.length === 0) return [];

      const contactNames = contactsArr.map((c) => String(c.name ?? '')).filter(Boolean);
      if (contactNames.length === 0) return [];

      // Build a map of call title -> date for timestamping
      const callDateMap = new Map<string, string>();
      for (const c of callsArr) {
        const title = String(c.title ?? '');
        const date = String(c.date ?? '');
        if (title && date) callDateMap.set(title, date);
      }

      // Get unique call titles, limit to 50 most recent
      const callTitles = [...new Set(
        callsArr.map((c) => String(c.title ?? '')).filter(Boolean),
      )].slice(0, 50);

      if (callTitles.length === 0) return [];

      // Fetch full transcripts for each call
      const transcripts = await Promise.all(
        callTitles.map(async (title) => {
          const data = await fetchFullGongTranscript(accountId, title).catch(() => null);
          if (!data?.transcript) return null;
          // Truncate individual transcripts to ~20000 chars if needed
          const text = data.transcript.length > 20000
            ? data.transcript.slice(0, 20000) + '\n[...truncated]'
            : data.transcript;
          const date = callDateMap.get(title) ?? '';
          return { title, text, date };
        }),
      );

      const validTranscripts = transcripts.filter(
        (t): t is { title: string; text: string; date: string } => t !== null,
      );

      if (validTranscripts.length === 0) return [];

      const transcriptText = validTranscripts
        .map((t) => `--- Call: "${t.title}" (${t.date || 'unknown date'}) ---\n${t.text}`)
        .join('\n\n');

      logger.info(
        { accountId, contacts: contactNames.length, calls: validTranscripts.length },
        '[contact-insights] Sending to OpenAI',
      );

      const response = await client.chat.completions.create({
        model: env.OPENAI_MODEL,
        messages: [
          {
            role: 'system',
            content:
              'You are a sales engineering assistant. Given Gong call transcripts and a list of contact names, extract personal details and communication patterns mentioned in conversations. Look carefully through ALL transcripts for ANY personal information or behavioral patterns. Be thorough — even brief mentions are valuable for rapport building. Look for mentions of:\n\n- Location: where they live, are based, or mentioned being from\n- Interests: things they mentioned being interested in or enthusiastic about, topics they care deeply about\n- Family: mentions of spouse, partner, children, pets, family events\n- Hobbies: activities they do outside work, sports, games, etc.\n- Background: career history, education, previous companies, certifications\n- Travel: upcoming trips, vacations, places visited, conferences attended\n- Engagement Style: their communication style observed across calls — e.g. direct and to-the-point, asks lots of questions, humorous/lighthearted, quiet/reserved, detail-oriented, big-picture thinker, collaborative, skeptical, etc. Describe how they typically engage in conversations.\n- Concerns: recurring themes they push on, things they worry about, priorities they consistently raise (e.g. security, cost, performance, timeline, team adoption)\n- Other: any other personal details worth remembering (favorite food, sports teams, etc.)\n\nOnly include contacts where you found personal information. Only include fields where you have concrete information — do not guess or infer. For each field, provide the value AND the date of the call where it was most recently mentioned.\n\nReturn a JSON array of objects with this structure:\n[\n  {\n    "contactName": "Full Name",\n    "personalInfo": {\n      "location": { "value": "Based in Austin, TX", "date": "2025-03-15" },\n      "interests": { "value": "Kubernetes and cloud-native technologies", "date": "2025-04-01" },\n      "family": { "value": "Has two kids", "date": "2025-02-20" },\n      "engagement_style": { "value": "Direct and detail-oriented, asks probing technical questions", "date": "2025-04-01" },\n      "concerns": { "value": "Focused on security compliance and migration timeline", "date": "2025-03-20" }\n    },\n    "sourceCallTitles": ["Call Title 1", "Call Title 2"]\n  }\n]\n\nEach field in personalInfo should be an object with "value" (concise sentence or phrase) and "date" (ISO date from the call header where this was mentioned, e.g. "2025-03-15"). Use the most recent mention date if mentioned in multiple calls. Only include fields in personalInfo that have actual data. sourceCallTitles should list which calls the information came from. If no personal information is found for any contact, return an empty array [].\n\nReturn ONLY valid JSON, no markdown fences or other text.',
          },
          {
            role: 'user',
            content: `Extract personal insights about these contacts from the call transcripts below. Be thorough — scan all transcripts for any personal details, even brief mentions.\n\nContacts: ${contactNames.join(', ')}\n\n${transcriptText}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 8000,
      });

      const raw = response.choices[0]?.message?.content?.trim() ?? '[]';
      const jsonStr = raw.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
      const parsed = JSON.parse(jsonStr);

      if (!Array.isArray(parsed)) return [];

      return parsed
        .filter((item: Record<string, unknown>) => item.contactName && item.personalInfo)
        .map((item: Record<string, unknown>) => {
          const rawInfo = item.personalInfo as Record<string, unknown>;
          // Normalize personalInfo — handle both old format (string) and new format ({ value, date })
          const normalizedInfo: ContactPersonalInfo = {};
          for (const [key, val] of Object.entries(rawInfo)) {
            if (!val) continue;
            if (typeof val === 'string') {
              (normalizedInfo as Record<string, ContactPersonalInfoEntry>)[key] = { value: val };
            } else if (typeof val === 'object' && val !== null && 'value' in val) {
              (normalizedInfo as Record<string, ContactPersonalInfoEntry>)[key] = {
                value: String((val as Record<string, unknown>).value),
                date: (val as Record<string, unknown>).date ? String((val as Record<string, unknown>).date) : undefined,
              };
            }
          }
          return {
            contactName: String(item.contactName),
            personalInfo: normalizedInfo,
            sourceCallTitles: Array.isArray(item.sourceCallTitles)
              ? (item.sourceCallTitles as string[]).map(String)
              : [],
          };
        });
    } catch (err) {
      logger.error({ err }, 'Failed to generate contact insights with OpenAI');
      return [];
    }
  });
}

export interface POCHealth {
  rating: 'green' | 'yellow' | 'red';
  reason: string;
}

export interface POCSummaryResult {
  summary: string;
  health: POCHealth;
}

/**
 * Summarize ongoing POCs for an account by analyzing Gong call briefs
 * and opportunity data. Returns null if no POC activity is detected.
 * Cached for 1 hour.
 */
export async function summarizePOCs(
  accountId: string,
): Promise<POCSummaryResult | null> {
  const client = getClient();
  if (!client) {
    logger.warn('OpenAI API key not configured, skipping POC summary');
    return null;
  }

  const cacheKey = `openai:poc-summary:${accountId}`;

  // cachedCall may return old-format cached values (plain string from before
  // the health rating was added). Normalize to the new shape.
  const raw = await cachedCall<POCSummaryResult | string | null>(cacheKey, 0, async () => {
    try {
      const [calls, opportunities] = await Promise.all([
        getAccountInteractions(accountId, { sourceTypes: ['gong_call'] }).catch(() => []),
        getAccountOpportunities(accountId).catch(() => []),
      ]);

      const callsArr = calls as Array<Record<string, unknown>>;
      const oppsArr = opportunities as Array<Record<string, unknown>>;

      // Get unique call titles and fetch briefs + full transcripts
      const callTitles = [...new Set(
        callsArr.map((c) => String(c.title ?? '')).filter(Boolean),
      )].slice(0, 15);

      const sections: string[] = [];

      if (callTitles.length > 0) {
        const callData = await Promise.all(
          callTitles.map(async (title) => {
            const [brief, transcript] = await Promise.all([
              generateGongCallBrief(accountId, title).catch(() => null),
              fetchFullGongTranscript(accountId, title).catch(() => null),
            ]);
            if (!brief && !transcript) return null;
            const parts: string[] = [`[Call] ${title}:`];
            if (brief) parts.push(`Brief:\n${brief}`);
            if (transcript?.transcript) {
              const text = transcript.transcript.length > 3000
                ? transcript.transcript.slice(0, 3000) + '\n[...truncated]'
                : transcript.transcript;
              parts.push(`Transcript:\n${text}`);
            }
            return parts.join('\n');
          }),
        );
        const validCalls = callData.filter(Boolean);
        if (validCalls.length > 0) {
          sections.push(`GONG CALLS:\n${validCalls.join('\n\n')}`);
        }
      }

      if (oppsArr.length > 0) {
        const oppLines = oppsArr.map(
          (o) =>
            `- ${o.name} | Stage: ${o.stage} | Amount: ${o.amount ?? 'N/A'} | Close: ${o.closeDate ?? 'N/A'}`,
        );
        sections.push(`OPPORTUNITIES:\n${oppLines.join('\n')}`);
      }

      if (sections.length === 0) return null;

      const response = await client.chat.completions.create({
        model: env.OPENAI_MODEL,
        messages: [
          {
            role: 'system',
            content:
              'You are a sales engineering assistant. Given Gong call briefs, full call transcripts, and opportunity data for a customer account, identify and summarize any ongoing Proof of Concept (POC) or trial evaluations.\n\nIf there are active POCs, format the response with these sections using **Bold Headings** followed by bullet points:\n\n**POC Overview**\n- What is being evaluated, the product/solution under test, and the overall goal\n\n**Current Status**\n- Where the POC stands today — what has been completed, what is in progress\n\n**Key Findings**\n- Technical discoveries, integration results, blockers encountered, or decisions made during the POC\n\n**Next Steps**\n- What remains to be done, upcoming milestones, or planned follow-ups\n\nBe concise and specific. Only include sections with relevant content. Use details from the full transcripts for deeper context where the briefs may have missed nuance. If there is no evidence of an ongoing POC or evaluation, return exactly the text: NO_POC_DETECTED\n\nAt the very end of your response, on a new line, include a JSON health assessment in this exact format:\n<!--HEALTH:{"rating":"green|yellow|red","reason":"one sentence explanation"}-->\n\nRating criteria:\n- green: POC is progressing well, positive sentiment, no major blockers, on track\n- yellow: POC has some concerns — minor blockers, slow progress, mixed signals, or unclear timeline\n- red: POC is at risk — major blockers, negative sentiment, stalled progress, or critical issues',
          },
          {
            role: 'user',
            content: `Identify and summarize any ongoing POCs for this account:\n\n${sections.join('\n\n')}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 800,
      });

      const raw = response.choices[0]?.message?.content?.trim() ?? null;
      if (!raw || raw === 'NO_POC_DETECTED') return null;

      // Parse out the <!--HEALTH:...--> tag
      const healthMatch = raw.match(/<!--HEALTH:(.*?)-->/);
      let health: POCHealth = { rating: 'yellow', reason: 'Unable to assess health automatically' };
      let summary = raw;

      if (healthMatch) {
        summary = raw.replace(/\n?<!--HEALTH:.*?-->/, '').trim();
        try {
          const parsed = JSON.parse(healthMatch[1]);
          if (parsed.rating && ['green', 'yellow', 'red'].includes(parsed.rating) && parsed.reason) {
            health = { rating: parsed.rating, reason: parsed.reason };
          }
        } catch {
          logger.warn('Failed to parse POC health rating JSON, using default');
        }
      }

      if (!summary || summary === 'NO_POC_DETECTED') return null;
      return { summary, health };
    } catch (err) {
      logger.error({ err }, 'Failed to generate POC summary with OpenAI');
      return null;
    }
  });

  // Migrate old cached string values to new shape
  if (typeof raw === 'string') {
    return { summary: raw, health: { rating: 'yellow', reason: 'Unable to assess health automatically' } };
  }
  return raw;
}

/**
 * Generate a meeting prep brief for an upcoming meeting on an account.
 * Gathers account details, opportunities, recent interactions, action items,
 * and issues, then asks OpenAI to create a focused prep brief.
 * Cached 1 hour.
 */
export async function generateMeetingBrief(
  accountId: string,
  meetingTitle: string,
  meetingDate?: string,
): Promise<string | null> {
  const client = getClient();
  if (!client) {
    logger.warn('OpenAI API key not configured, skipping meeting brief');
    return null;
  }

  const hash = crypto.createHash('md5').update(`${accountId}:${meetingTitle}:${meetingDate ?? ''}`).digest('hex');
  const cacheKey = `openai:meeting-brief:${accountId}:${hash}`;

  return cachedCall<string | null>(cacheKey, 3600, async () => {
    try {
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
          `\nCSM Owner: ${(account as Record<string, unknown>).csmOwner ?? 'unknown'}` +
          `\nCSE Owner: ${(account as Record<string, unknown>).cseOwner ?? 'unknown'}`,
      );

      // Opportunities
      const opps = opportunities as Array<Record<string, unknown>>;
      if (opps.length > 0) {
        const oppLines = opps.map(
          (o) =>
            `- ${o.name} | Stage: ${o.stage} | Amount: ${o.amount ?? 'N/A'} | Close: ${o.closeDate ?? 'N/A'}`,
        );
        sections.push(`OPPORTUNITIES (${opps.length}):\n${oppLines.join('\n')}`);
      }

      // Recent interactions with Gong briefs
      const ints = interactions as Array<Record<string, unknown>>;
      if (ints.length > 0) {
        const gongCalls = ints.filter((i) => i.sourceType === 'gong_call');
        const otherInts = ints.filter((i) => i.sourceType !== 'gong_call');

        const gongBriefs = await Promise.all(
          [...new Set(gongCalls.map((c) => String(c.title ?? '')).filter(Boolean))]
            .slice(0, 5)
            .map(async (title) => {
              const brief = await generateGongCallBrief(accountId, title).catch(() => null);
              return brief ? `[Gong Call] ${title}:\n${brief}` : `[Gong Call] ${title}`;
            }),
        );

        if (gongBriefs.length > 0) {
          sections.push(`RECENT CALL BRIEFS:\n${gongBriefs.join('\n\n')}`);
        }

        if (otherInts.length > 0) {
          const intLines = otherInts.slice(0, 10).map(
            (i) => `- [${i.sourceType}] ${i.title} (${i.date})`,
          );
          sections.push(`OTHER INTERACTIONS:\n${intLines.join('\n')}`);
        }
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
            `- ${t.title} | Status: ${t.status} | Due: ${t.dueDate ?? 'N/A'}`,
        );
        sections.push(`TASKS (${tks.length}):\n${tkLines.join('\n')}`);
      }

      // Action items
      const actionItems = await extractActionItems(accountId).catch(() => []);
      const openItems = actionItems.filter((ai) => ai.status === 'open');
      if (openItems.length > 0) {
        const aiLines = openItems.map(
          (ai) => `- ${ai.action} (from: ${ai.source}, ${ai.date})${ai.owner ? ` — owner: ${ai.owner}` : ''}`,
        );
        sections.push(`OPEN ACTION ITEMS (${openItems.length}):\n${aiLines.join('\n')}`);
      }

      // Build meeting context for the prompt
      const meetingInfo = meetingDate
        ? `Meeting: "${meetingTitle}"\nScheduled: ${meetingDate}\nAccount: ${(account as Record<string, unknown>).name}`
        : `Meeting: "${meetingTitle}"\nAccount: ${(account as Record<string, unknown>).name}`;

      const response = await client.chat.completions.create({
        model: env.OPENAI_MODEL,
        messages: [
          {
            role: 'system',
            content:
              'You are a sales engineering assistant preparing a meeting brief. You are given the meeting title, date, and account name along with all available data about the customer account. Your job is to generate a prep brief that is specifically tailored to THIS meeting — use the meeting title to infer the likely topic and focus your brief on what is relevant to that topic.\n\nFormat with sections using **Bold Headings** followed by concise bullet points (using - prefix).\n\nInclude these sections as relevant:\n\n**Meeting Context**\n- What this specific meeting is likely about based on the meeting title and recent activity\n- Why this meeting is happening now\n\n**Key Talking Points**\n- Topics directly relevant to this meeting\'s subject to raise or be prepared to discuss\n\n**Recent Activity**\n- Summary of recent calls, emails, and meetings that relate to this meeting\'s topic\n\n**Open Opportunities**\n- Active deals relevant to this meeting\n\n**Action Items to Follow Up**\n- Outstanding commitments and follow-ups relevant to this meeting\n\n**Open Issues**\n- Blockers or problems relevant to this meeting\'s topic\n\n**Suggested Questions**\n- Questions to ask during this specific meeting to advance the discussion\n\nBe concise, actionable, and focused on what a sales engineer needs to know before walking into THIS specific meeting. Only include sections where you have relevant information. Prioritize information that is directly relevant to the meeting title and topic.',
          },
          {
            role: 'user',
            content: `Prepare a meeting brief for the following meeting:\n\n${meetingInfo}\n\n--- ACCOUNT DATA ---\n\n${sections.join('\n\n')}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 1000,
      });

      return response.choices[0]?.message?.content ?? null;
    } catch (err) {
      logger.error({ err }, 'Failed to generate meeting brief with OpenAI');
      return null;
    }
  });
}

// ── Cross-account insights ──

export interface TechnologyPattern {
  pattern: string;
  accounts: string[];
  frequency: number;
  detail: string;
}

export interface ConversationTrend {
  topic: string;
  accounts: string[];
  recentMentions: number;
  trend: 'rising' | 'stable' | 'declining';
  detail: string;
}

export interface CrossTeamInsight {
  insight: string;
  accounts: string[];
}

export interface InsightsResult {
  technologyPatterns: TechnologyPattern[];
  conversationTrends: ConversationTrend[];
  crossTeamInsights: CrossTeamInsight[];
}

export interface CompetitorMention {
  competitor: string;
  accounts: string[];
  mentionCount: number;
  context: string;
  soloProduct: string;
  positioning: string;
}

export interface ProductAlignment {
  product: string;
  accounts: string[];
  useCases: string[];
  adoptionStage: 'evaluating' | 'testing' | 'deploying' | 'expanding';
}

export interface CompetitiveThreat {
  threat: string;
  accounts: string[];
  severity: 'high' | 'medium' | 'low';
  recommendation: string;
}

export interface CompetitiveBattlecard {
  competitor: string;
  category: string;
  soloStrengths: string[];
  competitorWeaknesses: string[];
  differentiators: string[];
  winStrategy: string;
}

export interface MarketPlayer {
  name: string;
  category: string;
  description: string;
  soloAdvantage: string;
  threat: 'high' | 'medium' | 'low';
}

export interface StrategicRecommendation {
  title: string;
  detail: string;
  priority: 'high' | 'medium' | 'low';
  competitors: string[];
}

export interface CompetitiveAnalysisResult {
  competitorMentions: CompetitorMention[];
  productAlignment: ProductAlignment[];
  competitiveThreats: CompetitiveThreat[];
  battlecards: CompetitiveBattlecard[];
  marketLandscape: MarketPlayer[];
  strategicRecommendations: StrategicRecommendation[];
}

// ── Competitor Detail types ──

export interface CompetitorDetailResult {
  competitor: string;
  category: string;
  overview: string;
  soloProduct: string;
  featureComparison: Array<{
    feature: string;
    solo: string;
    competitor: string;
    advantage: 'solo' | 'competitor' | 'tie';
  }>;
  soloStrengths: string[];
  competitorStrengths: string[];
  idealCustomerProfile: string;
  winStrategy: string;
  commonObjections: Array<{
    objection: string;
    response: string;
  }>;
  pricingInsight: string;
  marketTrend: string;
}

// ── Win/Loss Analysis types ──

export interface WinLossStats {
  totalClosed: number;
  wins: number;
  losses: number;
  winRate: number;
  totalWonAmount: number;
  totalLostAmount: number;
  avgWonAmount: number;
  avgLostAmount: number;
}

export interface WinLossFactor {
  factor: string;
  detail: string;
  accounts: string[];
}

export interface WinLossRecommendation {
  title: string;
  detail: string;
  priority: 'high' | 'medium' | 'low';
}

export interface WinLossAnalysisResult {
  summary: string;
  stats: WinLossStats;
  winFactors: WinLossFactor[];
  lossFactors: WinLossFactor[];
  recommendations: WinLossRecommendation[];
}

// ── Call Coaching types ──

export interface CoachingMetric {
  label: string;
  score: number;
  detail: string;
  suggestion: string;
}

export interface CoachingHighlight {
  type: 'strength' | 'improvement';
  title: string;
  detail: string;
  accounts: string[];
}

export interface CallCoachingResult {
  overallScore: number;
  totalCallsAnalyzed: number;
  metrics: CoachingMetric[];
  highlights: CoachingHighlight[];
  summary: string;
}

/**
 * Generate cross-account insights by analyzing cached Gong briefs and POC
 * summaries across the user's accounts. For cross-team insights, also
 * samples accounts not owned by the user. Cached 4 hours per user.
 */
export async function generateInsights(
  userId: string,
  userAccounts: Array<{ id: string; name: string }>,
  allAccounts: Array<{ id: string; name: string }>,
): Promise<InsightsResult | null> {
  const client = getClient();
  if (!client) {
    logger.warn('OpenAI API key not configured, skipping insights');
    return null;
  }

  if (userAccounts.length === 0) return null;

  const cacheKey = `openai:insights:${userId}`;

  return cachedCall<InsightsResult | null>(cacheKey, 14400, async () => {
    try {
      // Collect cached Gong briefs and POC summaries for user's accounts — in parallel
      const userSectionResults = await Promise.all(
        userAccounts.map(async (account) => {
          const parts: string[] = [`=== ${account.name} (${account.id}) ===`];

          // Get cached POC summary and interactions in parallel
          const [pocSummary, calls] = await Promise.all([
            summarizePOCs(account.id).catch(() => null),
            getAccountInteractions(account.id, { sourceTypes: ['gong_call'] }).catch(() => []),
          ]);

          if (pocSummary) {
            parts.push(`POC Health: ${pocSummary.health.rating} — ${pocSummary.health.reason}`);
            parts.push(`POC Summary: ${pocSummary.summary}`);
          }

          const callsArr = calls as Array<Record<string, unknown>>;
          const callTitles = [...new Set(
            callsArr.map((c) => String(c.title ?? '')).filter(Boolean),
          )].slice(0, 8);

          if (callTitles.length > 0) {
            const briefs = await Promise.all(
              callTitles.map(async (title) => {
                const brief = await generateGongCallBrief(account.id, title).catch(() => null);
                return brief ? `[Call] ${title}:\n${brief}` : null;
              }),
            );
            const validBriefs = briefs.filter(Boolean);
            if (validBriefs.length > 0) {
              parts.push(validBriefs.join('\n'));
            }
          }

          return parts.length > 1 ? parts.join('\n') : null;
        }),
      );
      const userSections = userSectionResults.filter(Boolean) as string[];

      // For cross-team insights, sample accounts not in user's set — in parallel
      const userAccountIds = new Set(userAccounts.map((a) => a.id));
      const otherAccounts = allAccounts
        .filter((a) => !userAccountIds.has(a.id))
        .slice(0, Math.max(0, 20 - userAccounts.length));

      const crossTeamResults = await Promise.all(
        otherAccounts.map(async (account) => {
          const parts: string[] = [`=== ${account.name} (${account.id}) ===`];
          const calls = await getAccountInteractions(account.id, { sourceTypes: ['gong_call'] }).catch(() => []);
          const callsArr = calls as Array<Record<string, unknown>>;
          const callTitles = [...new Set(
            callsArr.map((c) => String(c.title ?? '')).filter(Boolean),
          )].slice(0, 5);

          if (callTitles.length > 0) {
            const briefs = await Promise.all(
              callTitles.map(async (title) => {
                const brief = await generateGongCallBrief(account.id, title).catch(() => null);
                return brief ? `[Call] ${title}:\n${brief}` : null;
              }),
            );
            const validBriefs = briefs.filter(Boolean);
            if (validBriefs.length > 0) {
              parts.push(validBriefs.join('\n'));
            }
          }

          return parts.length > 1 ? parts.join('\n') : null;
        }),
      );
      const crossTeamSections = crossTeamResults.filter(Boolean) as string[];

      if (userSections.length === 0) return null;

      const prompt = [
        'MY ACCOUNTS:',
        userSections.join('\n\n'),
      ];

      if (crossTeamSections.length > 0) {
        prompt.push('\nOTHER TEAM ACCOUNTS:', crossTeamSections.join('\n\n'));
      }

      logger.info(
        { userId, userAccounts: userAccounts.length, otherAccounts: otherAccounts.length },
        '[insights] Sending to OpenAI',
      );

      const response = await client.chat.completions.create({
        model: env.OPENAI_MODEL,
        messages: [
          {
            role: 'system',
            content:
              'You are a sales engineering assistant. Given Gong call briefs and POC summaries across multiple customer accounts, analyze the data for cross-account patterns and trends.\n\nReturn a JSON object with three arrays:\n\n1. "technologyPatterns": Technology themes, products, or architectural patterns that appear across multiple accounts.\n   Each item: { "pattern": "name", "accounts": ["account names"], "frequency": number_of_mentions, "detail": "brief explanation" }\n   Examples: "Kubernetes migration", "API Gateway adoption", "Service mesh evaluation"\n\n2. "conversationTrends": Topics or themes trending across recent conversations.\n   Each item: { "topic": "name", "accounts": ["account names"], "recentMentions": count, "trend": "rising"|"stable"|"declining", "detail": "brief explanation" }\n   Base the trend direction on recency and frequency of mentions.\n\n3. "crossTeamInsights": Broader patterns visible across ALL accounts (including other team accounts), not just the user\'s accounts. These should surface patterns that an individual SE might miss.\n   Each item: { "insight": "observation", "accounts": ["account names involved"] }\n   Examples: "3 accounts are simultaneously evaluating competitor X", "Security compliance is a recurring blocker"\n\nReturn 3-8 items per array, sorted by relevance. Only include patterns that span 2+ accounts. Be specific and actionable — avoid generic observations. Return ONLY valid JSON, no markdown fences or other text.',
          },
          {
            role: 'user',
            content: `Analyze these accounts for cross-cutting patterns and trends:\n\n${prompt.join('\n')}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 3000,
      });

      const raw = response.choices[0]?.message?.content?.trim() ?? '{}';
      const jsonStr = raw.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
      const parsed = JSON.parse(jsonStr);

      return {
        technologyPatterns: Array.isArray(parsed.technologyPatterns) ? parsed.technologyPatterns : [],
        conversationTrends: Array.isArray(parsed.conversationTrends) ? parsed.conversationTrends : [],
        crossTeamInsights: Array.isArray(parsed.crossTeamInsights) ? parsed.crossTeamInsights : [],
      };
    } catch (err) {
      logger.error({ err }, 'Failed to generate insights with OpenAI');
      return null;
    }
  });
}

/**
 * Generate competitive analysis by analyzing cached Gong briefs across the
 * user's accounts. Identifies competitor mentions, Solo.io product alignment,
 * and competitive threats. Cached 4 hours per user.
 */
export async function generateCompetitiveAnalysis(
  userId: string,
  userAccounts: Array<{ id: string; name: string }>,
): Promise<CompetitiveAnalysisResult | null> {
  const client = getClient();
  if (!client) {
    logger.warn('OpenAI API key not configured, skipping competitive analysis');
    return null;
  }

  if (userAccounts.length === 0) return null;

  const cacheKey = `openai:competitive:${userId}`;

  return cachedCall<CompetitiveAnalysisResult | null>(cacheKey, 14400, async () => {
    try {
      // Collect cached Gong briefs for user's accounts — in parallel
      const sectionResults = await Promise.all(
        userAccounts.map(async (account) => {
          const parts: string[] = [`=== ${account.name} (${account.id}) ===`];

          const [pocSummary, calls] = await Promise.all([
            summarizePOCs(account.id).catch(() => null),
            getAccountInteractions(account.id, { sourceTypes: ['gong_call'] }).catch(() => []),
          ]);

          if (pocSummary) {
            parts.push(`POC Health: ${pocSummary.health.rating} — ${pocSummary.health.reason}`);
            parts.push(`POC Summary: ${pocSummary.summary}`);
          }

          const callsArr = calls as Array<Record<string, unknown>>;
          const callTitles = [...new Set(
            callsArr.map((c) => String(c.title ?? '')).filter(Boolean),
          )].slice(0, 8);

          if (callTitles.length > 0) {
            const briefs = await Promise.all(
              callTitles.map(async (title) => {
                const brief = await generateGongCallBrief(account.id, title).catch(() => null);
                return brief ? `[Call] ${title}:\n${brief}` : null;
              }),
            );
            const validBriefs = briefs.filter(Boolean);
            if (validBriefs.length > 0) {
              parts.push(validBriefs.join('\n'));
            }
          }

          return parts.length > 1 ? parts.join('\n') : null;
        }),
      );
      const sections = sectionResults.filter(Boolean) as string[];

      if (sections.length === 0) return null;

      logger.info(
        { userId, accounts: userAccounts.length },
        '[competitive-analysis] Sending to OpenAI',
      );

      const response = await client.chat.completions.create({
        model: env.OPENAI_MODEL,
        messages: [
          {
            role: 'system',
            content:
              `You are a competitive intelligence analyst for Solo.io, a company that sells: Gloo Gateway (API gateway), Gloo Mesh / Istio (service mesh, ambient mesh), Gloo Network (CNI/networking), and Gloo Portal (developer portal).

Given Gong call briefs and POC summaries across multiple customer accounts, analyze the data for competitive intelligence.

IMPORTANT: Solo.io's own products are NOT competitors. This includes: Gloo Gateway, Gloo Mesh, Gloo Network, Gloo Portal, Gloo Platform, Gloo AI Gateway, kgateway, kagent, Agent Gateway (agentgateway), and any product with "Gloo" in the name. Solo.io is also a primary contributor to Istio and Envoy — when these are discussed in the context of Solo.io's offerings (e.g. "Istio with Gloo Mesh", ambient mesh), they are NOT competitors. Never list any Solo.io or Gloo product as a competitor or threat.

Common competitors include (but are not limited to): Kong, NGINX, Apigee, AWS API Gateway, Azure API Management, Linkerd, Consul Connect, Envoy (standalone), F5, Traefik, HashiCorp, Mulesoft, Akamai, Cloudflare, LiteLLM, Portkey, Cilium, Calico, Tetrate, Aspen Mesh, Istio (when discussed as an alternative rather than with Solo.io). Also identify ANY other vendor, product, or open-source project mentioned as a competitor or alternative to Solo.io products, even if not listed here.

Return a JSON object with five arrays:

1. "competitorMentions": Competitors discussed across accounts.
   Each item: { "competitor": "name", "accounts": ["account names"], "mentionCount": number, "context": "brief summary of how/why the competitor was discussed", "soloProduct": "which Solo.io product competes (e.g. Gloo Gateway)", "positioning": "how to position Solo.io against this competitor — specific, actionable guidance" }
   Sort by mentionCount descending. Only include competitors actually mentioned in the data.

2. "productAlignment": For each Solo.io product being discussed, which accounts are evaluating or using it.
   Each item: { "product": "Solo.io product name", "accounts": ["account names"], "useCases": ["specific use cases mentioned"], "adoptionStage": "evaluating"|"testing"|"deploying"|"expanding" }
   Only include products with actual evidence in the call data.

3. "competitiveThreats": Situations where Solo.io faces competition from other vendors, open-source projects, or customer DIY/build-it-themselves approaches. Do NOT include general POC issues, migration concerns, or internal technical challenges — only include threats where a competing product, project, or DIY approach is being considered as an alternative to Solo.io.
   Each item: { "threat": "description of the competitive threat", "accounts": ["affected account names"], "severity": "high"|"medium"|"low", "recommendation": "specific action to take" }
   "high" = customer actively evaluating a competitor or building DIY alternative, "medium" = competitor or OSS alternative mentioned favorably or being compared, "low" = competitor or alternative mentioned in passing.

4. "battlecards": For each competitor mentioned in the calls, generate a competitive battlecard with actionable positioning guidance. Focus on how to WIN against each competitor.
   Each item: { "competitor": "name", "category": "product category they compete in (e.g. API Gateway, Service Mesh, AI Gateway)", "soloStrengths": ["Solo.io advantages over this competitor — specific, technical, defensible"], "competitorWeaknesses": ["known weaknesses or gaps of this competitor"], "differentiators": ["key technical or business differentiators that set Solo.io apart"], "winStrategy": "1-2 sentence strategy for how to win deals against this competitor" }
   Be specific and technical. Focus on real product differences, not marketing fluff. Include 3-5 items per sub-array.

5. "marketLandscape": General overview of competitive solutions in the market that compete with Solo.io products, including solutions NOT mentioned in the call data. Cover the broader competitive landscape across API gateways, service mesh, AI gateways, and developer portals.
   Each item: { "name": "competitor or project name", "category": "API Gateway"|"Service Mesh"|"AI Gateway"|"Developer Portal"|"Networking/CNI"|"Multi-product", "description": "1-2 sentence overview of what they offer and their market position", "soloAdvantage": "Solo.io's key advantage over this solution", "threat": "high"|"medium"|"low" }
   "high" = major market player or actively seen in deals, "medium" = growing presence or niche competitor, "low" = emerging or limited threat. Include 8-15 items covering the full competitive landscape.

6. "strategicRecommendations": Cross-cutting strategic guidance on how Solo.io can compete more effectively in the market. These should be actionable recommendations that address competitive dynamics, product positioning, sales strategy, and market trends — not tied to a single account but informed by the patterns you see across the deals and the broader competitive landscape.
   Each item: { "title": "short recommendation title", "detail": "specific, actionable guidance on what to do and why", "priority": "high"|"medium"|"low", "competitors": ["competitor names this recommendation addresses"] }
   Include 4-8 recommendations covering different aspects: sales tactics, product positioning, messaging, technical differentiation, and market strategy.

Return 0-10 items for arrays 1-4, 8-15 items for array 5, and 4-8 items for array 6. Be specific and actionable. For arrays 1-3, only report what is present in the call data. For arrays 4-6, use your knowledge of the competitive landscape to provide accurate, current intelligence. Return ONLY valid JSON, no markdown fences or other text.`,
          },
          {
            role: 'user',
            content: `Analyze these accounts for competitive intelligence:\n\n${sections.join('\n\n')}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 5000,
      });

      const raw = response.choices[0]?.message?.content?.trim() ?? '{}';
      const jsonStr = raw.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
      const parsed = JSON.parse(jsonStr);

      return {
        competitorMentions: Array.isArray(parsed.competitorMentions) ? parsed.competitorMentions : [],
        productAlignment: Array.isArray(parsed.productAlignment) ? parsed.productAlignment : [],
        competitiveThreats: Array.isArray(parsed.competitiveThreats) ? parsed.competitiveThreats : [],
        battlecards: Array.isArray(parsed.battlecards) ? parsed.battlecards : [],
        marketLandscape: Array.isArray(parsed.marketLandscape) ? parsed.marketLandscape : [],
        strategicRecommendations: Array.isArray(parsed.strategicRecommendations) ? parsed.strategicRecommendations : [],
      };
    } catch (err) {
      logger.error({ err }, 'Failed to generate competitive analysis with OpenAI');
      return null;
    }
  });
}

/**
 * Generate a detailed Solo.io vs competitor comparison for a specific
 * competitor from the market landscape. Uses general AI knowledge about
 * the competitor and Solo.io products. Cached 7 days per competitor
 * (general knowledge, not account-specific).
 */
export async function generateCompetitorDetail(
  competitor: string,
  category: string,
): Promise<CompetitorDetailResult | null> {
  const client = getClient();
  if (!client) {
    logger.warn('OpenAI API key not configured, skipping competitor detail');
    return null;
  }

  const cacheKey = `openai:competitor-detail:${competitor.toLowerCase().replace(/\s+/g, '-')}`;

  return cachedCall<CompetitorDetailResult | null>(cacheKey, 604800, async () => {
    try {
      logger.info({ competitor, category }, '[competitor-detail] Generating detailed analysis');

      const response = await client.chat.completions.create({
        model: env.OPENAI_MODEL,
        messages: [
          {
            role: 'system',
            content: `You are a competitive intelligence analyst specializing in cloud infrastructure, API management, service mesh, and cloud-native networking. You have deep knowledge of Solo.io's products and their competitors.

Solo.io's product portfolio:
- **Gloo Gateway** (formerly Gloo Edge): Enterprise API gateway built on Envoy Proxy. Features: advanced routing, rate limiting, transformation, external auth, WAF, GraphQL, portal integration.
- **Gloo Mesh** (formerly Gloo Mesh Enterprise): Enterprise Istio management platform. Multi-cluster service mesh, zero-trust security, traffic management, observability.
- **Gloo Network**: Enterprise CNI and networking solution based on Cilium. eBPF-based networking, network policy, encryption, observability.
- **Gloo Portal**: Developer portal for API documentation, onboarding, and self-service API key management.
- **Gloo AI Gateway**: AI-specific gateway for LLM traffic management, prompt routing, rate limiting, and observability for AI workloads.
- **Ambient Mesh**: Sidecar-less Istio mesh (ztunnel + waypoint proxies). Solo.io is a primary contributor to Istio ambient mode.

Generate a comprehensive competitive analysis comparing Solo.io vs the specified competitor. Be accurate, specific, and technical. Base your analysis on actual product capabilities and known market positioning.

Return a JSON object:
{
  "competitor": "<competitor name>",
  "category": "<product category>",
  "overview": "<2-3 sentence overview of the competitor, their primary market, and how they compete with Solo.io>",
  "soloProduct": "<which Solo.io product most directly competes>",
  "featureComparison": [
    { "feature": "<feature or capability name>", "solo": "<Solo.io's capability in this area>", "competitor": "<competitor's capability>", "advantage": "solo"|"competitor"|"tie" }
  ],
  "soloStrengths": ["<specific Solo.io advantages over this competitor>"],
  "competitorStrengths": ["<honest assessment of competitor's advantages>"],
  "idealCustomerProfile": "<description of the ideal customer profile where Solo.io wins against this competitor>",
  "winStrategy": "<2-3 sentence strategy for winning deals against this competitor>",
  "commonObjections": [
    { "objection": "<common objection customers raise when comparing>", "response": "<effective response to this objection>" }
  ],
  "pricingInsight": "<general guidance on how pricing compares and how to position Solo.io's value>",
  "marketTrend": "<1-2 sentences on where this competitive dynamic is heading>"
}

Include 8-12 items in featureComparison, 4-6 in soloStrengths and competitorStrengths, and 3-5 in commonObjections. Be balanced and honest — acknowledging competitor strengths builds credibility. Return ONLY valid JSON, no markdown fences or other text.`,
          },
          {
            role: 'user',
            content: `Generate a detailed competitive analysis: Solo.io vs ${competitor} (category: ${category})`,
          },
        ],
        temperature: 0.3,
        max_tokens: 4000,
      });

      const raw = response.choices[0]?.message?.content?.trim() ?? '{}';
      const jsonStr = raw.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
      const parsed = JSON.parse(jsonStr);

      return {
        competitor: typeof parsed.competitor === 'string' ? parsed.competitor : competitor,
        category: typeof parsed.category === 'string' ? parsed.category : category,
        overview: typeof parsed.overview === 'string' ? parsed.overview : '',
        soloProduct: typeof parsed.soloProduct === 'string' ? parsed.soloProduct : '',
        featureComparison: Array.isArray(parsed.featureComparison) ? parsed.featureComparison : [],
        soloStrengths: Array.isArray(parsed.soloStrengths) ? parsed.soloStrengths : [],
        competitorStrengths: Array.isArray(parsed.competitorStrengths) ? parsed.competitorStrengths : [],
        idealCustomerProfile: typeof parsed.idealCustomerProfile === 'string' ? parsed.idealCustomerProfile : '',
        winStrategy: typeof parsed.winStrategy === 'string' ? parsed.winStrategy : '',
        commonObjections: Array.isArray(parsed.commonObjections) ? parsed.commonObjections : [],
        pricingInsight: typeof parsed.pricingInsight === 'string' ? parsed.pricingInsight : '',
        marketTrend: typeof parsed.marketTrend === 'string' ? parsed.marketTrend : '',
      };
    } catch (err) {
      logger.error({ err, competitor }, 'Failed to generate competitor detail with OpenAI');
      return null;
    }
  });
}

/**
 * Generate call quality analysis by examining full Gong transcripts
 * across the user's accounts. Analyzes discovery depth, technical quality,
 * next steps clarity, and other conversation dimensions.
 * Cached 24 hours per user.
 */
export async function generateCallCoaching(
  userId: string,
  userAccounts: Array<{ id: string; name: string }>,
): Promise<CallCoachingResult | null> {
  const client = getClient();
  if (!client) {
    logger.warn('OpenAI API key not configured, skipping call quality analysis');
    return null;
  }

  if (userAccounts.length === 0) return null;

  const cacheKey = `openai:coaching:${userId}`;

  return cachedCall<CallCoachingResult | null>(cacheKey, 86400, async () => {
    try {
      // Collect full transcripts for call quality analysis
      const transcriptResults = await Promise.all(
        userAccounts.map(async (account) => {
          const calls = await getAccountInteractions(account.id, {
            sourceTypes: ['gong_call'],
          }).catch(() => []);

          const callsArr = calls as Array<Record<string, unknown>>;
          const callTitles = [...new Set(
            callsArr.map((c) => String(c.title ?? '')).filter(Boolean),
          )].slice(0, 5); // Up to 5 calls per account

          if (callTitles.length === 0) return [];

          const transcripts = await Promise.all(
            callTitles.map(async (title) => {
              const data = await fetchFullGongTranscript(account.id, title).catch(() => null);
              if (!data?.transcript) return null;
              return {
                accountName: account.name,
                title: data.title,
                transcript: data.transcript,
              };
            }),
          );

          return transcripts.filter(Boolean) as Array<{
            accountName: string;
            title: string;
            transcript: string;
          }>;
        }),
      );

      const allTranscripts = transcriptResults.flat();

      // Limit to 20 most recent calls total.
      // Account-level filtering is already handled by getHomepageData() which
      // identifies accounts via interaction participation (Gong calls, emails, etc).
      const transcripts = allTranscripts.slice(0, 20);

      if (transcripts.length === 0) return null;

      // Build the input text — include speaker-labeled transcript content
      const sections = transcripts.map((t) =>
        `=== Call: ${t.title} (${t.accountName}) ===\n${t.transcript}`,
      );

      logger.info(
        { userId, calls: transcripts.length, totalCalls: allTranscripts.length, accounts: userAccounts.length },
        '[call-quality] Sending to OpenAI',
      );

      const response = await client.chat.completions.create({
        model: env.OPENAI_MODEL,
        messages: [
          {
            role: 'system',
            content:
              `You are an expert sales call quality analyst. Given Gong call transcripts from multiple customer calls, analyze the overall quality of these conversations. Note: the transcripts do not include speaker labels, so analyze the conversation as a whole rather than attributing dialogue to specific individuals.

Analyze these 8 dimensions of call quality, scoring each 1-10:

1. **Discovery Depth** — How well does the call uncover customer needs, pain points, and requirements? Are thoughtful, open-ended questions asked? Score 10 = excellent discovery, 1 = superficial.
2. **Technical Depth** — Quality of technical discussions: clear explanations, appropriate detail for the audience, accurate information? Avoids unnecessary jargon?
3. **Next Steps Clarity** — Do calls conclude with clear, specific action items and owners? Or vague "we'll follow up" statements?
4. **Objection Handling** — When concerns arise, are they acknowledged and addressed effectively? Is evidence provided? Are objections dismissed or handled constructively?
5. **Competitive Handling** — When competitors are mentioned, are responses confident and factual? Is positioning done well without trash-talking?
6. **Customer Engagement** — Signs of active customer engagement (asking questions, showing interest, requesting demos/trials) vs disengagement (short answers, topic changes)?
7. **Value Articulation** — How well is business value communicated? Are benefits tied to specific customer outcomes rather than just features?
8. **Meeting Productivity** — Is time used efficiently? Does the conversation stay focused and cover meaningful ground? Is there a clear agenda or direction?

Also identify 3-5 highlights — specific strengths or areas for improvement observed across calls, with example account names.

Return a JSON object:
{
  "overallScore": <1-10 weighted average>,
  "totalCallsAnalyzed": <number>,
  "metrics": [
    { "label": "Discovery Depth", "score": <1-10>, "detail": "<what was observed>", "suggestion": "<specific improvement tip>" },
    ...
  ],
  "highlights": [
    { "type": "strength"|"improvement", "title": "<short title>", "detail": "<specific observation>", "accounts": ["account names where observed"] },
    ...
  ],
  "summary": "<2-3 sentence executive summary of overall call quality across these accounts>"
}

Be specific and constructive. Reference actual patterns from the transcripts. Return ONLY valid JSON, no markdown fences or other text.`,
          },
          {
            role: 'user',
            content: `Analyze these ${transcripts.length} call transcripts for call quality:\n\n${sections.join('\n\n')}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 3000,
      });

      const raw = response.choices[0]?.message?.content?.trim() ?? '{}';
      const jsonStr = raw.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
      const parsed = JSON.parse(jsonStr);

      return {
        overallScore: typeof parsed.overallScore === 'number' ? parsed.overallScore : 5,
        totalCallsAnalyzed: typeof parsed.totalCallsAnalyzed === 'number' ? parsed.totalCallsAnalyzed : transcripts.length,
        metrics: Array.isArray(parsed.metrics) ? parsed.metrics : [],
        highlights: Array.isArray(parsed.highlights) ? parsed.highlights : [],
        summary: typeof parsed.summary === 'string' ? parsed.summary : '',
      };
    } catch (err) {
      logger.error({ err }, 'Failed to generate call quality analysis with OpenAI');
      return null;
    }
  });
}

/**
 * Generate win/loss analysis by correlating closed opportunities with Gong call
 * briefs. Computes deterministic stats from opportunity data, then uses AI to
 * identify patterns behind wins and losses.
 * Cached 4 hours per user.
 */
export async function generateWinLossAnalysis(
  userId: string,
  userAccounts: Array<{ id: string; name: string }>,
  closedOpps: Array<{ id: string; name: string; stage: string; amount: number | null; closeDate: string | null; isWon: boolean; accountId: string; accountName: string }>,
): Promise<WinLossAnalysisResult | null> {
  // Compute deterministic stats regardless of AI availability
  const wins = closedOpps.filter((o) => o.isWon);
  const losses = closedOpps.filter((o) => !o.isWon);
  const totalWonAmount = wins.reduce((sum, o) => sum + (o.amount ?? 0), 0);
  const totalLostAmount = losses.reduce((sum, o) => sum + (o.amount ?? 0), 0);
  const stats: WinLossStats = {
    totalClosed: closedOpps.length,
    wins: wins.length,
    losses: losses.length,
    winRate: closedOpps.length > 0 ? Math.round((wins.length / closedOpps.length) * 100) : 0,
    totalWonAmount,
    totalLostAmount,
    avgWonAmount: wins.length > 0 ? Math.round(totalWonAmount / wins.length) : 0,
    avgLostAmount: losses.length > 0 ? Math.round(totalLostAmount / losses.length) : 0,
  };

  const client = getClient();
  if (!client) {
    logger.warn('OpenAI API key not configured, returning stats-only win/loss analysis');
    return { summary: '', stats, winFactors: [], lossFactors: [], recommendations: [] };
  }

  if (closedOpps.length === 0) return null;

  const cacheKey = `openai:winloss:${userId}`;

  return cachedCall<WinLossAnalysisResult | null>(cacheKey, 14400, async () => {
    try {
      // Gather unique account IDs from closed opps
      const accountIds = [...new Set(closedOpps.map((o) => o.accountId))];
      const accountNameMap = new Map(closedOpps.map((o) => [o.accountId, o.accountName]));

      // Collect Gong call briefs per account (up to 8 calls each)
      const sectionResults = await Promise.all(
        accountIds.map(async (accountId) => {
          const accountName = accountNameMap.get(accountId) ?? accountId;
          const parts: string[] = [`=== ${accountName} (${accountId}) ===`];

          // List opportunities for this account
          const accountOpps = closedOpps.filter((o) => o.accountId === accountId);
          for (const opp of accountOpps) {
            parts.push(`Opportunity: ${opp.name} | Stage: ${opp.stage} | Amount: ${opp.amount ?? 'N/A'} | Close Date: ${opp.closeDate ?? 'N/A'} | Outcome: ${opp.isWon ? 'WON' : 'LOST'}`);
          }

          // Fetch Gong call briefs
          const calls = await getAccountInteractions(accountId, { sourceTypes: ['gong_call'] }).catch(() => []);
          const callsArr = calls as Array<Record<string, unknown>>;
          const callTitles = [...new Set(
            callsArr.map((c) => String(c.title ?? '')).filter(Boolean),
          )].slice(0, 8);

          if (callTitles.length > 0) {
            const briefs = await Promise.all(
              callTitles.map(async (title) => {
                const brief = await generateGongCallBrief(accountId, title).catch(() => null);
                return brief ? `[Call] ${title}:\n${brief}` : null;
              }),
            );
            const validBriefs = briefs.filter(Boolean);
            if (validBriefs.length > 0) {
              parts.push(validBriefs.join('\n'));
            }
          }

          return parts.length > 1 ? parts.join('\n') : null;
        }),
      );
      const sections = sectionResults.filter(Boolean) as string[];

      if (sections.length === 0) {
        return { summary: '', stats, winFactors: [], lossFactors: [], recommendations: [] };
      }

      logger.info(
        { userId, accounts: accountIds.length, closedOpps: closedOpps.length },
        '[win-loss] Sending to OpenAI',
      );

      const response = await client.chat.completions.create({
        model: env.OPENAI_MODEL,
        messages: [
          {
            role: 'system',
            content:
              `You are a win/loss analyst for a sales engineering team. You are given closed opportunities (won and lost) along with Gong call briefs from those accounts. Your job is to identify patterns that correlate with winning or losing deals.

Analyze the opportunity outcomes alongside the Gong call content to identify:

1. **Win Factors** — Patterns, behaviors, or themes present in won deals. What did the team do well? What account characteristics or engagement patterns correlate with wins?
2. **Loss Factors** — Patterns, behaviors, or themes present in lost deals. What went wrong? Were there missed signals, competitive losses, timing issues, or engagement gaps?
3. **Recommendations** — Actionable guidance based on the win/loss patterns. What should the team do more of? What should they change?

Return a JSON object:
{
  "summary": "<2-3 sentence executive summary of win/loss patterns>",
  "winFactors": [
    { "factor": "<short pattern name>", "detail": "<explanation of the pattern>", "accounts": ["account names where this was observed"] }
  ],
  "lossFactors": [
    { "factor": "<short pattern name>", "detail": "<explanation of the pattern>", "accounts": ["account names where this was observed"] }
  ],
  "recommendations": [
    { "title": "<short recommendation>", "detail": "<specific actionable guidance>", "priority": "high"|"medium"|"low" }
  ]
}

Return 3-6 items per array based on what the data supports. Be specific and reference actual patterns from the data. Do not fabricate patterns — only report what is supported by the opportunity outcomes and call content. "high" priority = immediate action needed, "medium" = should address soon, "low" = nice to have.

Return ONLY valid JSON, no markdown fences or other text.`,
          },
          {
            role: 'user',
            content: `Analyze win/loss patterns across these ${closedOpps.length} closed opportunities (${wins.length} won, ${losses.length} lost):\n\n${sections.join('\n\n')}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 3000,
      });

      const raw = response.choices[0]?.message?.content?.trim() ?? '{}';
      const jsonStr = raw.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
      const parsed = JSON.parse(jsonStr);

      return {
        summary: typeof parsed.summary === 'string' ? parsed.summary : '',
        stats,
        winFactors: Array.isArray(parsed.winFactors) ? parsed.winFactors : [],
        lossFactors: Array.isArray(parsed.lossFactors) ? parsed.lossFactors : [],
        recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
      };
    } catch (err) {
      logger.error({ err }, 'Failed to generate win/loss analysis with OpenAI');
      return { summary: '', stats, winFactors: [], lossFactors: [], recommendations: [] };
    }
  });
}

// ── Warmup status tracking ──

export interface WarmupStatus {
  status: 'idle' | 'warming' | 'complete' | 'error';
  phase: 'gong-briefs' | 'contact-insights' | 'poc-summaries' | 'action-items' | 'done';
  totalAccounts: number;
  processedAccounts: number;
  totalCalls: number;
  generated: number;
  skipped: number;
  contactInsightsWarmed: number;
  pocSummariesWarmed: number;
  actionItemsWarmed: number;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
  refreshCount: number;
  lastRefreshAt: string | null;
  lastRefreshNewCalls: number;
  insightsWarmed: number;
  lastInsightsWarmupAt: string | null;
}

const warmupState: WarmupStatus = {
  status: 'idle',
  phase: 'done',
  totalAccounts: 0,
  processedAccounts: 0,
  totalCalls: 0,
  generated: 0,
  skipped: 0,
  contactInsightsWarmed: 0,
  pocSummariesWarmed: 0,
  actionItemsWarmed: 0,
  startedAt: null,
  completedAt: null,
  error: null,
  refreshCount: 0,
  lastRefreshAt: null,
  lastRefreshNewCalls: 0,
  insightsWarmed: 0,
  lastInsightsWarmupAt: null,
};

export function getWarmupStatus(): WarmupStatus {
  return { ...warmupState };
}

const REFRESH_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Periodic refresh: discover new Gong calls across all accounts,
 * generate briefs for any new ones, and invalidate derivative caches
 * so they regenerate with the new data on next access.
 */
async function runPeriodicRefresh(): Promise<void> {
  logger.info('[refresh] Starting periodic Gong call discovery');

  try {
    const accounts = await listAccounts();
    let totalNewCalls = 0;
    const accountsWithNewCalls: string[] = [];

    for (const account of accounts) {
      const accountId = account.id as string;
      const accountName = account.name as string;

      try {
        // Fetch Gong calls (interaction list has a 5-min TTL, so reflects new calls)
        const interactions = (await getAccountInteractions(accountId, {
          sourceTypes: ['gong_call'],
        })) as Array<Record<string, unknown>>;

        const titles = [
          ...new Set(
            interactions
              .map((i) => String(i.title ?? ''))
              .filter((t) => t.length > 0),
          ),
        ];

        if (titles.length === 0) continue;

        // Check which calls already have cached transcripts
        let accountNewCalls = 0;
        for (const title of titles) {
          const hash = crypto.createHash('md5').update(`${accountId}:${title}`).digest('hex');
          const transcriptKey = `gong:transcript:${hash}`;
          const existing = await getCache<unknown>(transcriptKey);

          if (!existing) {
            // New call — fetch transcript and generate brief
            logger.info({ accountId, accountName, title }, '[refresh] New Gong call discovered');
            await fetchFullGongTranscript(accountId, title).catch((err) => {
              logger.warn({ accountId, title, err: (err as Error).message }, '[refresh] Failed to fetch transcript');
            });
            await generateGongCallBrief(accountId, title).catch((err) => {
              logger.warn({ accountId, title, err: (err as Error).message }, '[refresh] Failed to generate brief');
            });
            accountNewCalls++;
          }
        }

        if (accountNewCalls > 0) {
          totalNewCalls += accountNewCalls;
          accountsWithNewCalls.push(accountId);

          // Invalidate derivative caches for this account
          await invalidateCache(`openai:contact-insights:${accountId}`);
          await invalidateCache(`openai:poc-summary:${accountId}`);
          await invalidateCache(`openai:action-items:${accountId}`);
          await invalidateCache(`openai:account-overview:${accountId}`);
          await invalidateCache(`openai:tech-details:${accountId}`);

          logger.info(
            { accountId, accountName, newCalls: accountNewCalls },
            '[refresh] Invalidated derivative caches for account',
          );
        }
      } catch (err) {
        logger.warn(
          { accountId, accountName, err: (err as Error).message },
          '[refresh] Failed to check account for new calls',
        );
      }
    }

    // Derivative caches were already invalidated above.
    // Data will regenerate lazily on next access, avoiding unnecessary
    // OpenAI calls for accounts nobody is actively viewing.

    warmupState.refreshCount++;
    warmupState.lastRefreshAt = new Date().toISOString();
    warmupState.lastRefreshNewCalls = totalNewCalls;

    logger.info(
      {
        newCalls: totalNewCalls,
        accountsRefreshed: accountsWithNewCalls.length,
        totalAccounts: accounts.length,
        refreshCount: warmupState.refreshCount,
      },
      '[refresh] Periodic refresh complete',
    );
  } catch (err) {
    logger.error({ err: (err as Error).message }, '[refresh] Periodic refresh failed');
  }
}

/**
 * Warm Gong call briefs, contact insights, and POC summaries for ALL
 * accounts on server startup. Processes sequentially to avoid hammering
 * OpenAI. Already-cached data is skipped (cache hit).
 * Runs in the background — does not block server startup.
 * After warmup completes, starts a periodic refresh every 30 minutes.
 */
export async function warmAllGongBriefs(): Promise<void> {
  const client = getClient();
  if (!client) {
    logger.info('[warm-all-briefs] OpenAI not configured, skipping');
    warmupState.status = 'complete';
    warmupState.phase = 'done';
    warmupState.completedAt = new Date().toISOString();
    return;
  }

  warmupState.status = 'warming';
  warmupState.phase = 'gong-briefs';
  warmupState.startedAt = new Date().toISOString();
  warmupState.completedAt = null;
  warmupState.error = null;
  warmupState.processedAccounts = 0;
  warmupState.totalCalls = 0;
  warmupState.generated = 0;
  warmupState.skipped = 0;
  warmupState.contactInsightsWarmed = 0;
  warmupState.pocSummariesWarmed = 0;
  warmupState.actionItemsWarmed = 0;

  try {
    const accounts = await listAccounts();
    warmupState.totalAccounts = accounts.length;
    logger.info(
      { accountCount: accounts.length },
      '[warm-all-briefs] Starting Gong brief warming for all accounts',
    );

    for (const account of accounts) {
      const accountId = account.id as string;
      const accountName = account.name as string;

      try {
        const interactions = (await getAccountInteractions(accountId, {
          sourceTypes: ['gong_call'],
        })) as Array<Record<string, unknown>>;

        const titles = [
          ...new Set(
            interactions
              .map((i) => String(i.title ?? ''))
              .filter((t) => t.length > 0),
          ),
        ];

        if (titles.length === 0) {
          warmupState.processedAccounts++;
          continue;
        }

        warmupState.totalCalls += titles.length;
        logger.info(
          { accountId, accountName, callCount: titles.length },
          '[warm-all-briefs] Warming briefs for account',
        );

        for (const title of titles) {
          const result = await generateGongCallBrief(accountId, title).catch(
            (err) => {
              logger.warn(
                { accountId, title, err: (err as Error).message },
                '[warm-all-briefs] Failed to generate brief',
              );
              return null;
            },
          );
          if (result) {
            warmupState.generated++;
          } else {
            warmupState.skipped++;
          }
        }
      } catch (err) {
        logger.warn(
          { accountId, accountName, err: (err as Error).message },
          '[warm-all-briefs] Failed to process account',
        );
      }

      warmupState.processedAccounts++;
    }

    logger.info(
      { totalCalls: warmupState.totalCalls, generated: warmupState.generated, skipped: warmupState.skipped, accountCount: accounts.length },
      '[warm-all-briefs] Gong briefs phase complete',
    );

    // Phase 2: Warm contact insights (skip accounts already cached)
    warmupState.phase = 'contact-insights';
    let contactInsightsSkipped = 0;
    logger.info({ accountCount: accounts.length }, '[warmup] Starting contact insights warming');

    for (const account of accounts) {
      const accountId = account.id as string;
      const accountName = account.name as string;
      try {
        const cached = await getCache<ContactInsight[]>(`openai:contact-insights:${accountId}`);
        if (cached) {
          if (cached.length > 0) warmupState.contactInsightsWarmed++;
          contactInsightsSkipped++;
          continue;
        }
        const insights = await generateContactInsights(accountId);
        if (insights.length > 0) {
          warmupState.contactInsightsWarmed++;
          logger.info(
            { accountId, accountName, contactsWithInsights: insights.length },
            '[warmup] Warmed contact insights',
          );
        }
      } catch (err) {
        logger.warn(
          { accountId, accountName, err: (err as Error).message },
          '[warmup] Failed to warm contact insights',
        );
      }
    }

    logger.info(
      { warmed: warmupState.contactInsightsWarmed, skipped: contactInsightsSkipped, accountCount: accounts.length },
      '[warmup] Contact insights phase complete',
    );

    // Phase 3: Warm POC summaries (skip accounts already cached)
    warmupState.phase = 'poc-summaries';
    let pocSummariesSkipped = 0;
    logger.info({ accountCount: accounts.length }, '[warmup] Starting POC summary warming');

    for (const account of accounts) {
      const accountId = account.id as string;
      const accountName = account.name as string;
      try {
        const cached = await getCache<POCSummaryResult | string | null>(`openai:poc-summary:${accountId}`);
        if (cached) {
          warmupState.pocSummariesWarmed++;
          pocSummariesSkipped++;
          continue;
        }
        const result = await summarizePOCs(accountId);
        if (result) {
          warmupState.pocSummariesWarmed++;
          logger.info(
            { accountId, accountName, health: result.health.rating },
            '[warmup] Warmed POC summary',
          );
        }
      } catch (err) {
        logger.warn(
          { accountId, accountName, err: (err as Error).message },
          '[warmup] Failed to warm POC summary',
        );
      }
    }

    logger.info(
      { warmed: warmupState.pocSummariesWarmed, skipped: pocSummariesSkipped, accountCount: accounts.length },
      '[warmup] POC summaries phase complete',
    );

    // Phase 4: Warm action items (skip accounts already cached)
    warmupState.phase = 'action-items';
    let actionItemsSkipped = 0;
    logger.info({ accountCount: accounts.length }, '[warmup] Starting action items warming');

    for (const account of accounts) {
      const accountId = account.id as string;
      const accountName = account.name as string;
      try {
        const cached = await getCache<ActionItemsCacheEntry>(`openai:action-items:${accountId}`);
        if (cached && cached.items && cached.items.length > 0) {
          warmupState.actionItemsWarmed++;
          actionItemsSkipped++;
          continue;
        }
        const items = await extractActionItems(accountId);
        if (items.length > 0) {
          warmupState.actionItemsWarmed++;
          logger.info(
            { accountId, accountName, itemCount: items.length },
            '[warmup] Warmed action items',
          );
        }
      } catch (err) {
        logger.warn(
          { accountId, accountName, err: (err as Error).message },
          '[warmup] Failed to warm action items',
        );
      }
    }

    logger.info(
      { warmed: warmupState.actionItemsWarmed, skipped: actionItemsSkipped, accountCount: accounts.length },
      '[warmup] Action items phase complete',
    );

    warmupState.phase = 'done';
    warmupState.status = 'complete';
    warmupState.completedAt = new Date().toISOString();
    logger.info(
      {
        totalCalls: warmupState.totalCalls,
        generated: warmupState.generated,
        skipped: warmupState.skipped,
        contactInsightsWarmed: warmupState.contactInsightsWarmed,
        pocSummariesWarmed: warmupState.pocSummariesWarmed,
        actionItemsWarmed: warmupState.actionItemsWarmed,
        accountCount: accounts.length,
      },
      '[warmup] All phases complete',
    );

    // Start periodic refresh to discover new Gong calls
    setInterval(() => {
      runPeriodicRefresh().catch((err) => {
        logger.error({ err: (err as Error).message }, '[refresh] Unhandled error in periodic refresh');
      });
    }, REFRESH_INTERVAL_MS);
    logger.info({ intervalMs: REFRESH_INTERVAL_MS }, '[warmup] Periodic refresh scheduled');

    // Schedule daily insights pre-generation at 6 AM local time
    const scheduleNext6AM = () => {
      const now = new Date();
      const next = new Date(now);
      next.setHours(6, 0, 0, 0);
      if (next <= now) next.setDate(next.getDate() + 1);
      const delayMs = next.getTime() - now.getTime();
      logger.info({ nextRun: next.toISOString(), delayMs }, '[insights-warmup] Scheduled next run');
      setTimeout(() => {
        warmDailyInsights().catch((err) =>
          logger.error({ err: (err as Error).message }, '[insights-warmup] Failed'),
        );
        scheduleNext6AM();
      }, delayMs);
    };

    // Run once 5 min after warmup completes, then schedule daily at 6 AM
    setTimeout(() => {
      warmDailyInsights().catch((err) =>
        logger.error({ err: (err as Error).message }, '[insights-warmup] Failed'),
      );
      scheduleNext6AM();
    }, 5 * 60 * 1000);
    logger.info('[warmup] Daily insights warmup scheduled (5 min initial, then daily at 6 AM)');
  } catch (err) {
    warmupState.status = 'error';
    warmupState.error = (err as Error).message;
    warmupState.completedAt = new Date().toISOString();
    logger.error(
      { err: (err as Error).message },
      '[warmup] Failed during warming',
    );
  }
}

/**
 * Pre-warm all Insights page data for a single user. Skips sections already cached.
 * Warms: insights, competitive analysis, POC summaries, and action items.
 * Called on first login and during daily batch warmup.
 */
export async function warmInsightsForUser(userId: string, userName: string, userEmail: string): Promise<boolean> {
  const client = getClient();
  if (!client) return false;

  const [data, allAccountsRaw] = await Promise.all([
    getHomepageData(userName, userEmail),
    listAccounts(),
  ]);
  const userAccounts = (data.myAccounts ?? []).map((a) => ({
    id: a.id,
    name: a.name,
  }));
  const allAccounts = allAccountsRaw.map((a) => ({
    id: a.id as string,
    name: a.name as string,
  }));

  if (userAccounts.length === 0) return true;

  // Check which caches need warming
  const [cachedInsights, cachedCompetitive, cachedCoaching] = await Promise.all([
    getCache(`openai:insights:${userId}`),
    getCache(`openai:competitive:${userId}`),
    getCache(`openai:coaching:${userId}`),
  ]);

  // Phase 1: Warm cross-account AI analysis (insights + competitive + coaching) in parallel
  const aiTasks: Promise<unknown>[] = [];
  if (!cachedInsights) aiTasks.push(generateInsights(userId, userAccounts, allAccounts));
  if (!cachedCompetitive) aiTasks.push(generateCompetitiveAnalysis(userId, userAccounts));
  if (!cachedCoaching) aiTasks.push(generateCallCoaching(userId, userAccounts));
  if (aiTasks.length > 0) await Promise.all(aiTasks);

  // Phase 2: Warm per-account data (POC summaries + action items) sequentially per account
  for (const account of userAccounts) {
    try {
      const [cachedPoc, cachedActions] = await Promise.all([
        getCache(`openai:poc-summary:${account.id}`),
        getCache<ActionItemsCacheEntry>(`openai:action-items:${account.id}`),
      ]);

      const perAccountTasks: Promise<unknown>[] = [];
      if (!cachedPoc) perAccountTasks.push(summarizePOCs(account.id));
      if (!cachedActions || !cachedActions.items || cachedActions.items.length === 0) {
        perAccountTasks.push(extractActionItems(account.id));
      }
      if (perAccountTasks.length > 0) await Promise.all(perAccountTasks);
    } catch (err) {
      logger.warn(
        { accountId: account.id, accountName: account.name, err: (err as Error).message },
        '[insights-warmup] Failed to warm per-account data',
      );
    }
  }

  return true;
}

/**
 * Pre-generate insights for all active users (logged in within the past 30 days).
 * Processes users sequentially to avoid hammering OpenAI.
 * Skips users whose insights are already cached.
 */
export async function warmDailyInsights(): Promise<void> {
  const client = getClient();
  if (!client) {
    logger.info('[insights-warmup] OpenAI not configured, skipping');
    return;
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const activeUsers = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(gte(users.lastLoginAt, thirtyDaysAgo));

  logger.info(
    { userCount: activeUsers.length },
    '[insights-warmup] Starting daily insights pre-generation',
  );

  let generated = 0;
  let failed = 0;

  for (const user of activeUsers) {
    try {
      const result = await warmInsightsForUser(user.id, user.name, user.email);
      if (result) generated++;
    } catch (err) {
      failed++;
      logger.warn(
        { userId: user.id, err: (err as Error).message },
        '[insights-warmup] Failed for user',
      );
    }
  }

  warmupState.insightsWarmed = generated;
  warmupState.lastInsightsWarmupAt = new Date().toISOString();

  logger.info(
    { generated, failed, total: activeUsers.length },
    '[insights-warmup] Daily insights pre-generation complete',
  );
}
