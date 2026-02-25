import crypto from 'node:crypto';
import OpenAI from 'openai';
import { env } from '../config/env.js';
import { cachedCall } from './cache.service.js';
import { logger } from '../utils/logger.js';
import { callTool } from '../integrations/mcp/client.js';
import { hashActionItem } from '../utils/hash.js';
import {
  listAccounts,
  getAccount,
  getAccountOpportunities,
  getAccountInteractions,
  getAccountIssues,
  getAccountTasks,
  getAccountArchitecture,
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
  id: string;
  action: string;
  source: string;
  date: string;
  owner: string | null;
  status: 'open' | 'done';
}

/**
 * Extract action items / follow-ups from recent Gong calls and emails.
 * Uses full AI-generated Gong briefs (cached indefinitely) and email
 * content to give OpenAI rich context for identifying commitments,
 * follow-ups, and next steps. Cached 1 hour.
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

  // 7-day TTL to minimize re-extraction and avoid duplicate action items
  // from OpenAI rephrasing the same items differently on each call.
  return cachedCall<ActionItem[]>(cacheKey, 604800, async () => {
    try {
      // Fetch calls and emails separately so we can use full briefs for calls
      const [calls, emails] = await Promise.all([
        getAccountInteractions(accountId, { sourceTypes: ['gong_call'] }).catch(() => []),
        getAccountInteractions(accountId, { sourceTypes: ['gmail_email'], limit: 15 }).catch(() => []),
      ]);

      const callsArr = calls as Array<Record<string, unknown>>;
      const emailsArr = emails as Array<Record<string, unknown>>;

      if (callsArr.length === 0 && emailsArr.length === 0) return [];

      const isMcpError = (text: string): boolean => {
        if (!text || text.length > 200) return false;
        const lower = text.toLowerCase().trim();
        return lower.includes('no rows in result set') || lower.startsWith('error:') || lower === 'not found';
      };

      const sections: string[] = [];

      // Gong calls — use full AI-generated briefs (already cached if warmed)
      const callTitles = [...new Set(
        callsArr.map((c) => String(c.title ?? '')).filter(Boolean),
      )].slice(0, 10);

      if (callTitles.length > 0) {
        const gongBriefs = await Promise.all(
          callTitles.map(async (title) => {
            const callDate = callsArr.find((c) => String(c.title ?? '') === title)?.date ?? '';
            const brief = await generateGongCallBrief(accountId, title).catch(() => null);
            return brief
              ? `--- Call: "${title}" (${callDate}) ---\n${brief}`
              : null;
          }),
        );
        const validBriefs = gongBriefs.filter(Boolean);
        if (validBriefs.length > 0) {
          sections.push(validBriefs.join('\n\n'));
        }
      }

      // Emails — fetch content via getInteractionDetail
      if (emailsArr.length > 0) {
        const emailDetails = await Promise.all(
          emailsArr.slice(0, 10).map(async (i) => {
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
                return `--- Email: "${title}" (${date}) ---\nParticipants: ${participants || 'unknown'}\n\n${content}`;
              }
            } catch { /* skip */ }
            // Fallback to preview
            const preview = String(i.preview ?? '');
            return preview ? `--- Email: "${title}" (${date}) ---\n${preview}` : null;
          }),
        );
        const validEmails = emailDetails.filter(Boolean);
        if (validEmails.length > 0) {
          sections.push(validEmails.join('\n\n'));
        }
      }

      if (sections.length === 0) return [];

      logger.info(
        { accountId, calls: callTitles.length, emails: emailsArr.length },
        '[action-items] Sending to OpenAI',
      );

      const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'You are a sales engineering assistant. Given Gong call briefs and email threads from customer interactions, extract specific follow-up items and action items that our team needs to act on.\n\nFocus on:\n- Things our team committed to doing (deliverables, demos, docs, follow-up calls)\n- Customer requests or asks that need a response\n- Next steps agreed upon in calls or emails\n- Open questions that need answers\n- Deadlines or time-sensitive commitments\n\nReturn a JSON array of action items. Each item must have:\n- "action": concise description of what needs to be done\n- "source": the title of the call or email where this was identified\n- "date": the date of that interaction (ISO format)\n- "owner": who on our team is responsible (name if mentioned, null if unclear)\n- "status": always "open"\n\nOnly include concrete, actionable items — not vague observations. Prioritize items from the most recent interactions. If no action items are found, return an empty array [].\n\nReturn ONLY valid JSON, no markdown fences or other text.',
          },
          {
            role: 'user',
            content: `Extract follow-up items and action items from these recent interactions:\n\n${sections.join('\n\n')}`,
          },
        ],
        temperature: 0.2,
        max_tokens: 1000,
      });

      const raw = response.choices[0]?.message?.content?.trim() ?? '[]';
      // Strip markdown fences if present
      const jsonStr = raw.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
      const parsed = JSON.parse(jsonStr);

      if (!Array.isArray(parsed)) return [];

      return parsed.map((item: Record<string, unknown>) => {
        const action = String(item.action ?? '');
        const source = String(item.source ?? '');
        const date = String(item.date ?? '');
        return {
          id: hashActionItem(accountId, action, source, date),
          action,
          source,
          date,
          owner: item.owner ? String(item.owner) : null,
          status: 'open' as const,
        };
      });
    } catch (err) {
      logger.error({ err }, 'Failed to extract action items with OpenAI');
      return [];
    }
  });
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

  return cachedCall<string | null>(cacheKey, 3600, async () => {
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
        model: 'gpt-4o-mini',
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
 * Generate a full Gong call brief by fetching all available chunks
 * from semantic search (summary + transcript) and synthesizing via OpenAI.
 * The MCP vector store truncates call briefs at ~500 chars, cutting off
 * Key Highlights, Action Items, and Next Steps. This reconstructs them.
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
      const searchResult = await callTool<Record<string, unknown>>('get_account_interactions', {
        company_id: accountId,
        query: title,
        source_types: ['gong_call'],
        limit: 20,
      });

      const results = ((searchResult.results ?? []) as Array<Record<string, unknown>>)
        .filter((r) => String(r.title ?? '') === title);

      if (results.length === 0) return null;

      // Separate summary chunks from transcript chunks
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
        '[gong-brief] Chunks collected for synthesis',
      );

      if (summaryChunks.length === 0 && transcriptChunks.length === 0) return null;

      const sections: string[] = [];
      if (summaryChunks.length > 0) {
        sections.push(`EXISTING CALL SUMMARY (may be truncated):\n${summaryChunks[0]}`);
      }
      if (transcriptChunks.length > 0) {
        // Include up to 10 transcript chunks to stay within token limits
        const chunks = transcriptChunks.slice(0, 10);
        sections.push(`CALL TRANSCRIPT EXCERPTS:\n${chunks.join('\n\n---\n\n')}`);
      }

      const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'You are a sales engineering assistant. Given a partial call summary and transcript excerpts from a Gong call recording, generate a complete, structured call brief.\n\nFormat the brief with these sections using markdown:\n\n## Summary\nA 2-4 sentence overview of the call covering who was involved, what was discussed, and the outcome.\n\n## Key Highlights\n- Bullet points covering the most important discussion topics and decisions\n\n## Action Items\n- Specific tasks or follow-ups that were committed to, with owners if mentioned\n\n## Next Steps\n- What was agreed upon for moving forward\n\nBe concise and factual. Only include information that is clearly supported by the transcript and summary. If a section has no relevant content, omit it.',
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
  const raw = await cachedCall<POCSummaryResult | string | null>(cacheKey, 3600, async () => {
    try {
      const [calls, opportunities] = await Promise.all([
        getAccountInteractions(accountId, { sourceTypes: ['gong_call'] }).catch(() => []),
        getAccountOpportunities(accountId).catch(() => []),
      ]);

      const callsArr = calls as Array<Record<string, unknown>>;
      const oppsArr = opportunities as Array<Record<string, unknown>>;

      // Get unique call titles and generate briefs
      const callTitles = [...new Set(
        callsArr.map((c) => String(c.title ?? '')).filter(Boolean),
      )].slice(0, 15);

      const sections: string[] = [];

      if (callTitles.length > 0) {
        const briefs = await Promise.all(
          callTitles.map(async (title) => {
            const brief = await generateGongCallBrief(accountId, title).catch(() => null);
            return brief ? `[Call] ${title}:\n${brief}` : null;
          }),
        );
        const validBriefs = briefs.filter(Boolean);
        if (validBriefs.length > 0) {
          sections.push(`GONG CALL BRIEFS:\n${validBriefs.join('\n\n')}`);
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
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'You are a sales engineering assistant. Given Gong call briefs and opportunity data for a customer account, identify and summarize any ongoing Proof of Concept (POC) or trial evaluations.\n\nIf there are active POCs, format the response with these sections using **Bold Headings** followed by bullet points:\n\n**POC Overview**\n- What is being evaluated, the product/solution under test, and the overall goal\n\n**Current Status**\n- Where the POC stands today — what has been completed, what is in progress\n\n**Key Findings**\n- Technical discoveries, integration results, blockers encountered, or decisions made during the POC\n\n**Next Steps**\n- What remains to be done, upcoming milestones, or planned follow-ups\n\nBe concise and specific. Only include sections with relevant content. If there is no evidence of an ongoing POC or evaluation, return exactly the text: NO_POC_DETECTED\n\nAt the very end of your response, on a new line, include a JSON health assessment in this exact format:\n<!--HEALTH:{"rating":"green|yellow|red","reason":"one sentence explanation"}-->\n\nRating criteria:\n- green: POC is progressing well, positive sentiment, no major blockers, on track\n- yellow: POC has some concerns — minor blockers, slow progress, mixed signals, or unclear timeline\n- red: POC is at risk — major blockers, negative sentiment, stalled progress, or critical issues',
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
        model: 'gpt-4o-mini',
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

// ── Warmup status tracking ──

export interface WarmupStatus {
  status: 'idle' | 'warming' | 'complete' | 'error';
  totalAccounts: number;
  processedAccounts: number;
  totalCalls: number;
  generated: number;
  skipped: number;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
}

const warmupState: WarmupStatus = {
  status: 'idle',
  totalAccounts: 0,
  processedAccounts: 0,
  totalCalls: 0,
  generated: 0,
  skipped: 0,
  startedAt: null,
  completedAt: null,
  error: null,
};

export function getWarmupStatus(): WarmupStatus {
  return { ...warmupState };
}

/**
 * Warm Gong call briefs for ALL accounts on server startup.
 * Fetches every account, gets their Gong calls, and generates briefs
 * for each unique call title. Processes sequentially to avoid
 * hammering OpenAI. Already-cached briefs are skipped (cache hit).
 * Runs in the background — does not block server startup.
 */
export async function warmAllGongBriefs(): Promise<void> {
  const client = getClient();
  if (!client) {
    logger.info('[warm-all-briefs] OpenAI not configured, skipping');
    warmupState.status = 'complete';
    warmupState.completedAt = new Date().toISOString();
    return;
  }

  warmupState.status = 'warming';
  warmupState.startedAt = new Date().toISOString();
  warmupState.completedAt = null;
  warmupState.error = null;
  warmupState.processedAccounts = 0;
  warmupState.totalCalls = 0;
  warmupState.generated = 0;
  warmupState.skipped = 0;

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

    warmupState.status = 'complete';
    warmupState.completedAt = new Date().toISOString();
    logger.info(
      { totalCalls: warmupState.totalCalls, generated: warmupState.generated, skipped: warmupState.skipped, accountCount: accounts.length },
      '[warm-all-briefs] Complete',
    );
  } catch (err) {
    warmupState.status = 'error';
    warmupState.error = (err as Error).message;
    warmupState.completedAt = new Date().toISOString();
    logger.error(
      { err: (err as Error).message },
      '[warm-all-briefs] Failed to warm Gong briefs',
    );
  }
}
