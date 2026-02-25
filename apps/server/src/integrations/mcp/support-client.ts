import crypto from 'node:crypto';
import { logger } from '../../utils/logger.js';
import { cachedCall } from '../../services/cache.service.js';
import type { JsonRpcRequest, McpToolResult } from './types.js';

const SUPPORT_MCP_URL = 'https://support-agent-tools.is.solo.io/mcp';

// Per-user session tracking
const userSessions = new Map<string, { sessionId: string | null; initialized: boolean; requestId: number }>();

function getUserState(userId: string) {
  if (!userSessions.has(userId)) {
    userSessions.set(userId, { sessionId: null, initialized: false, requestId: 0 });
  }
  return userSessions.get(userId)!;
}

/**
 * Initialize an MCP session for a specific user.
 */
async function initialize(userId: string, token: string): Promise<void> {
  const state = getUserState(userId);
  if (state.initialized) return;

  const request: JsonRpcRequest = {
    jsonrpc: '2.0',
    id: ++state.requestId,
    method: 'initialize',
    params: {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: {
        name: 'siesta',
        version: '1.0.0',
      },
    },
  };

  const response = await fetch(SUPPORT_MCP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Support MCP initialize failed: ${response.status} ${text}`);
  }

  const mcpSessionId = response.headers.get('Mcp-Session-Id');
  if (mcpSessionId) {
    state.sessionId = mcpSessionId;
  }

  state.initialized = true;
  logger.info({ sessionId: state.sessionId, userId }, 'Support MCP session initialized');
}

function hashArgs(obj: Record<string, unknown>): string {
  const sorted = JSON.stringify(obj, Object.keys(obj).sort());
  return crypto.createHash('md5').update(sorted).digest('hex').slice(0, 12);
}

/**
 * Call a tool on the support MCP server using a user's access token.
 * Results are cached in Redis for 5 minutes.
 */
export async function callSupportTool<T = unknown>(
  userId: string,
  token: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<T> {
  const cacheKey = `support-mcp:${userId}:${toolName}:${hashArgs(args)}`;

  return cachedCall<T>(cacheKey, 300, async () => {
    await initialize(userId, token);
    return doCallTool<T>(userId, token, toolName, args);
  });
}

async function doCallTool<T>(
  userId: string,
  token: string,
  toolName: string,
  args: Record<string, unknown>,
  isRetry = false,
): Promise<T> {
  const state = getUserState(userId);

  const request: JsonRpcRequest = {
    jsonrpc: '2.0',
    id: ++state.requestId,
    method: 'tools/call',
    params: {
      name: toolName,
      arguments: args,
    },
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    Authorization: `Bearer ${token}`,
  };

  if (state.sessionId) {
    headers['Mcp-Session-Id'] = state.sessionId;
  }

  const response = await fetch(SUPPORT_MCP_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(request),
  });

  // On 401, reset session and let caller handle token refresh
  if (response.status === 401 && !isRetry) {
    state.initialized = false;
    state.sessionId = null;
    throw new Error('SUPPORT_MCP_TOKEN_EXPIRED');
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Support MCP tool call failed: ${response.status} ${text}`);
  }

  const contentType = response.headers.get('Content-Type') ?? '';

  if (contentType.includes('text/event-stream')) {
    return parseSSEResponse<T>(response);
  }

  const json = await response.json();

  if (json.error) {
    throw new Error(`Support MCP tool error: ${json.error.message} (code: ${json.error.code})`);
  }

  const toolResult = json.result as McpToolResult;
  return parseToolResult<T>(toolResult);
}

/**
 * List available tools on the support MCP server.
 */
export async function listSupportTools(userId: string, token: string): Promise<unknown[]> {
  await initialize(userId, token);

  const state = getUserState(userId);
  const request: JsonRpcRequest = {
    jsonrpc: '2.0',
    id: ++state.requestId,
    method: 'tools/list',
    params: {},
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    Authorization: `Bearer ${token}`,
  };

  if (state.sessionId) {
    headers['Mcp-Session-Id'] = state.sessionId;
  }

  const response = await fetch(SUPPORT_MCP_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Support MCP tools/list failed: ${response.status} ${text}`);
  }

  const contentType = response.headers.get('Content-Type') ?? '';
  let json: Record<string, unknown>;

  if (contentType.includes('text/event-stream')) {
    const text = await response.text();
    const lines = text.split('\n');
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6).trim();
        if (!data || data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          if (parsed.result?.tools) return parsed.result.tools;
        } catch { continue; }
      }
    }
    return [];
  }

  json = await response.json();
  return (json.result as Record<string, unknown>)?.tools as unknown[] ?? [];
}

/**
 * Reset a user's MCP session.
 */
export function resetSupportSession(userId: string): void {
  userSessions.delete(userId);
}

async function parseSSEResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  const lines = text.split('\n');

  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = line.slice(6).trim();
      if (!data || data === '[DONE]') continue;

      try {
        const json = JSON.parse(data);
        if (json.error) {
          throw new Error(`Support MCP tool error: ${json.error.message} (code: ${json.error.code})`);
        }
        if (json.result) {
          return parseToolResult<T>(json.result as McpToolResult);
        }
      } catch (e) {
        if (e instanceof SyntaxError) continue;
        throw e;
      }
    }
  }

  throw new Error('No result found in Support MCP SSE response');
}

function parseToolResult<T>(result: McpToolResult): T {
  if (!result.content || result.content.length === 0) {
    return {} as T;
  }

  const textContent = result.content.find((c) => c.type === 'text');
  if (!textContent) {
    return {} as T;
  }

  try {
    return JSON.parse(textContent.text) as T;
  } catch {
    return { content: textContent.text } as T;
  }
}
