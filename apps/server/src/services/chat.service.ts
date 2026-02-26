import OpenAI from 'openai';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { listTools, callTool } from '../integrations/mcp/client.js';
import type { McpTool } from '../integrations/mcp/types.js';
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
} from './mcp-accounts.service.js';
import { searchPortfolio } from './mcp-search.service.js';
import { getInteractionDetail } from './mcp-interactions.service.js';
import { listSupportTools, callSupportTool } from '../integrations/mcp/support-client.js';

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

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface PageContext {
  path: string;
  accountId?: string;
  pageTitle?: string;
}

interface UserContext {
  name: string;
  email: string;
  role: string;
}

interface SSEEvent {
  type: 'token' | 'tool_call' | 'error' | 'done';
  content?: string;
  name?: string;
}

const MAX_TOOL_ITERATIONS = 10;

interface SupportMcpContext {
  userId: string;
  supportMcpToken: string | null;
}

interface POCHealth {
  accountId: string;
  accountName: string;
  rating: string;
  reason: string;
  summary: string;
}

function buildSystemPrompt(user: UserContext, pageContext: PageContext, userAccounts: Array<{ id: string; name: string }> = [], pocHealth: POCHealth[] = []): string {
  const parts = [
    `You are Digital Sherpa, an AI assistant for Siesta — a Sales Engineering portfolio management platform.`,
    `You help sales engineers understand their accounts, interactions, opportunities, and portfolio health.`,
    '',
    `## Current User`,
    `- Name: ${user.name}`,
    `- Email: ${user.email}`,
    `- Role: ${user.role}`,
    '',
    `## User's Accounts`,
    userAccounts.length > 0
      ? `The current user owns or is involved with the following accounts:\n${userAccounts.map((a) => `- [${a.name}](/accounts/${a.id}) (ID: ${a.id})`).join('\n')}`
      : `No accounts found for this user.`,
    '',
    `## POC Health Status`,
    pocHealth.length > 0
      ? `Current POC health ratings for the user's accounts (green = healthy, yellow = caution, red = at risk):\n${pocHealth.map((p) => `- **[${p.accountName}](/accounts/${p.accountId})**: ${p.rating.toUpperCase()} — ${p.reason}${p.summary ? `\n  ${p.summary}` : ''}`).join('\n')}`
      : `No active POCs found for this user's accounts.`,
    '',
    `## Current Page Context`,
    `- Path: ${pageContext.path}`,
    pageContext.accountId ? `- Account ID: ${pageContext.accountId}` : null,
    pageContext.pageTitle ? `- Page Title: ${pageContext.pageTitle}` : null,
    '',
    `## App Routes (use these for generating in-app links)`,
    `- / — Home dashboard (personal accounts + action items)`,
    `- /accounts — All accounts list`,
    `- /accounts/$accountId — Account detail page (replace $accountId with the actual ID)`,
    `- /portfolio — Portfolio overview with health distribution`,
    `- /search — Semantic search across interactions`,
    `- /settings — App settings and integrations`,
    '',
    `## Instructions`,
    `- When the user asks about "my accounts", "my POCs", "my opportunities", or anything related to their portfolio, use the account IDs from the "User's Accounts" section above. Call MCP tools (e.g., get_opportunities, get_account_details, get_account_interactions) for each of those account IDs to gather the data. Do NOT try to use filter_accounts to find the user's accounts — that list is already provided.`,
    `- When the user asks about POC health, POCs in danger, or at-risk POCs, use the "POC Health Status" section above. This data is already pre-computed — answer directly from it without making additional tool calls. Red = at risk, yellow = caution, green = healthy.`,
    `- When referencing accounts, use markdown links like [Account Name](/accounts/account-id-here) so users can click to navigate.`,
    `- Use the available MCP tools to look up real data. Do not make up account names or IDs.`,
    `- If the user is on an account page (accountId is provided), you can use that ID to look up details about the current account without asking.`,
    `- Be concise and actionable. Use bullet points for lists.`,
    `- Format currency values with $ and commas (e.g., $1,250,000).`,
    `- When listing accounts, always include links.`,
  ].filter(Boolean);

  return parts.join('\n');
}

/**
 * Route MCP tool calls through the cached service layer when possible.
 * Falls back to direct callTool() for tools without a cached wrapper.
 */
async function cachedCallTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
  const companyId = (args.company_id ?? args.account_id ?? args.accountId) as string | undefined;
  const accountIds = args.account_ids as string[] | undefined;

  switch (toolName) {
    case 'filter_accounts':
      return listAccounts(args as Record<string, string>);
    case 'get_account_details':
    case 'get_account_info':
      if (accountIds?.[0]) return getAccount(accountIds[0]);
      if (companyId) return getAccount(companyId);
      break;
    case 'get_contacts':
      if (companyId) return getAccountContacts(companyId);
      break;
    case 'get_account_interactions':
      if (companyId) return getAccountInteractions(companyId, {
        sourceTypes: args.source_types as string[] | undefined,
        fromDate: args.from_date as string | undefined,
        toDate: args.to_date as string | undefined,
      });
      break;
    case 'get_opportunities':
      if (companyId) return getAccountOpportunities(companyId);
      break;
    case 'get_open_issues':
      if (companyId) return getAccountIssues(companyId);
      break;
    case 'get_tasks':
      if (companyId) return getAccountTasks(companyId);
      break;
    case 'get_architecture_doc':
      if (companyId) return getAccountArchitecture(companyId);
      break;
    case 'get_sentiment_trends':
      if (companyId) return getAccountSentiment(companyId);
      break;
    case 'search_portfolio_interactions':
      if (args.query) return searchPortfolio(args.query as string, {
        sourceTypes: args.source_types as string[] | undefined,
        fromDate: args.from_date as string | undefined,
        toDate: args.to_date as string | undefined,
      });
      break;
    case 'get_conversation_details':
      if (companyId && args.source_type && args.record_id) {
        return getInteractionDetail(
          companyId,
          args.source_type as string,
          args.record_id as string,
          args.title as string | undefined,
        );
      }
      break;
  }

  // Fallback to direct MCP call for unmatched tools
  return callTool(toolName, args);
}

function mcpToolsToOpenAIFunctions(
  tools: McpTool[],
): OpenAI.Chat.Completions.ChatCompletionTool[] {
  return tools.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    },
  }));
}

function formatSSE(event: SSEEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function* streamChat(
  messages: ChatMessage[],
  user: UserContext,
  pageContext: PageContext,
  userAccounts: Array<{ id: string; name: string }> = [],
  pocHealth: POCHealth[] = [],
  supportMcp: SupportMcpContext = { userId: '', supportMcpToken: null },
): AsyncGenerator<string> {
  const client = getClient();
  if (!client) {
    yield formatSSE({ type: 'error', content: 'OpenAI API key not configured' });
    yield formatSSE({ type: 'done' });
    return;
  }

  let mcpTools: McpTool[] = [];
  try {
    mcpTools = await listTools();
  } catch (err) {
    logger.error({ err }, 'Failed to fetch MCP tools for chat');
  }

  // Fetch support MCP tools if the user has a connected token
  const supportToolNames = new Set<string>();
  if (supportMcp.supportMcpToken) {
    try {
      const rawTools = await listSupportTools(supportMcp.userId, supportMcp.supportMcpToken);
      const supportTools = (rawTools as McpTool[]).filter((t) => t.name && t.inputSchema);
      for (const t of supportTools) {
        supportToolNames.add(t.name);
      }
      mcpTools = [...mcpTools, ...supportTools];
    } catch (err) {
      logger.error({ err }, 'Failed to fetch support MCP tools for chat');
    }
  }

  const openaiTools = mcpTools.length > 0 ? mcpToolsToOpenAIFunctions(mcpTools) : undefined;
  const systemPrompt = buildSystemPrompt(user, pageContext, userAccounts, pocHealth);

  const openaiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...messages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
  ];

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    const stream = await client.chat.completions.create({
      model: env.OPENAI_MODEL,
      messages: openaiMessages,
      tools: openaiTools,
      stream: true,
      temperature: 0.4,
      max_tokens: 2000,
    });

    let currentToolCalls: Map<
      number,
      { id: string; name: string; arguments: string }
    > = new Map();
    let hasToolCalls = false;
    let contentBuffer = '';

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;

      // Handle text content tokens
      if (delta.content) {
        contentBuffer += delta.content;
        yield formatSSE({ type: 'token', content: delta.content });
      }

      // Handle tool calls
      if (delta.tool_calls) {
        hasToolCalls = true;
        for (const tc of delta.tool_calls) {
          const idx = tc.index;
          if (!currentToolCalls.has(idx)) {
            currentToolCalls.set(idx, {
              id: tc.id ?? '',
              name: tc.function?.name ?? '',
              arguments: '',
            });
          }
          const entry = currentToolCalls.get(idx)!;
          if (tc.id) entry.id = tc.id;
          if (tc.function?.name) entry.name = tc.function.name;
          if (tc.function?.arguments) entry.arguments += tc.function.arguments;
        }
      }
    }

    // If no tool calls, we're done streaming the final response
    if (!hasToolCalls) {
      yield formatSSE({ type: 'done' });
      return;
    }

    // Process tool calls: append the assistant message with tool calls,
    // then execute each tool and append results
    if (contentBuffer) {
      openaiMessages.push({
        role: 'assistant',
        content: contentBuffer,
        tool_calls: [...currentToolCalls.values()].map((tc) => ({
          id: tc.id,
          type: 'function' as const,
          function: { name: tc.name, arguments: tc.arguments },
        })),
      });
    } else {
      openaiMessages.push({
        role: 'assistant',
        content: null,
        tool_calls: [...currentToolCalls.values()].map((tc) => ({
          id: tc.id,
          type: 'function' as const,
          function: { name: tc.name, arguments: tc.arguments },
        })),
      });
    }

    for (const [, tc] of currentToolCalls) {
      yield formatSSE({ type: 'tool_call', name: tc.name });

      let toolResult: string;
      try {
        const args = JSON.parse(tc.arguments || '{}');
        let result: unknown;
        if (supportToolNames.has(tc.name) && supportMcp.supportMcpToken) {
          result = await callSupportTool(supportMcp.userId, supportMcp.supportMcpToken, tc.name, args);
        } else {
          result = await cachedCallTool(tc.name, args);
        }
        toolResult = JSON.stringify(result);
      } catch (err) {
        logger.error({ err, tool: tc.name }, 'MCP tool call failed during chat');
        toolResult = JSON.stringify({
          error: `Tool call failed: ${(err as Error).message}`,
        });
      }

      openaiMessages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: toolResult,
      });
    }

    // Loop back to send results to OpenAI for the next iteration
  }

  // If we exhausted iterations, send what we have
  yield formatSSE({
    type: 'error',
    content: 'Reached maximum tool call iterations',
  });
  yield formatSSE({ type: 'done' });
}
