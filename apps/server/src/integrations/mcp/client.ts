import { env } from '../../config/env.js';
import { getAccessToken } from './auth.js';
import { logger } from '../../utils/logger.js';
import type { JsonRpcRequest, McpTool, McpToolResult } from './types.js';

let sessionId: string | null = null;
let requestId = 0;
let initialized = false;

// In-memory cache for MCP tools list (5-min TTL)
let toolsCache: { tools: McpTool[]; expiresAt: number } | null = null;
const TOOLS_CACHE_TTL_MS = 5 * 60 * 1000;

function nextId(): number {
  return ++requestId;
}

/**
 * Initialize the MCP session via JSON-RPC initialize handshake.
 */
async function initialize(token: string): Promise<void> {
  if (initialized) return;

  const request: JsonRpcRequest = {
    jsonrpc: '2.0',
    id: nextId(),
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

  const initHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    Authorization: `Bearer ${token}`,
  };
  const response = await fetch(env.MCP_SERVER_URL, {
    method: 'POST',
    headers: initHeaders,
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`MCP initialize failed: ${response.status} ${text}`);
  }

  // Store session ID from response header
  const mcpSessionId = response.headers.get('Mcp-Session-Id');
  if (mcpSessionId) {
    sessionId = mcpSessionId;
  }

  initialized = true;
  logger.info({ sessionId }, 'MCP session initialized');
}

/**
 * Call an MCP tool by name with arguments.
 * Uses the shared backend token (no user context needed).
 */
export async function callTool<T = unknown>(
  toolName: string,
  args: Record<string, unknown>,
): Promise<T> {
  const token = await getAccessToken();
  await initialize(token);
  return doCallTool<T>(toolName, args, token);
}

async function doCallTool<T>(
  toolName: string,
  args: Record<string, unknown>,
  token: string,
  isRetry = false,
): Promise<T> {
  const request: JsonRpcRequest = {
    jsonrpc: '2.0',
    id: nextId(),
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

  if (sessionId) {
    headers['Mcp-Session-Id'] = sessionId;
  }

  const reqStart = Date.now();
  logger.info({ toolName, args, requestId: request.id }, `[mcp-client] Calling tool: ${toolName}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  let response: Response;
  try {
    response = await fetch(env.MCP_SERVER_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(request),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeout);
    const elapsed = Date.now() - reqStart;
    logger.error({ toolName, elapsed, err: (err as Error).message }, `[mcp-client] Fetch failed for ${toolName}`);

    // Retry on timeout or network error by re-initializing the session
    if (!isRetry) {
      logger.info('MCP fetch failed, re-initializing session and retrying');
      initialized = false;
      sessionId = null;
      const freshToken = await getAccessToken();
      await initialize(freshToken);
      return doCallTool<T>(toolName, args, freshToken, true);
    }

    throw err;
  }
  clearTimeout(timeout);

  const elapsed = Date.now() - reqStart;
  logger.info({ toolName, status: response.status, elapsed, contentType: response.headers.get('Content-Type') }, `[mcp-client] Response for ${toolName}`);

  // Retry on 401 (expired token), 404 (stale session), or 500 (upstream closed) with fresh session
  if ((response.status === 401 || response.status === 404) && !isRetry) {
    logger.info({ status: response.status }, 'MCP session invalid, re-initializing and retrying');
    initialized = false;
    sessionId = null;
    const freshToken = await getAccessToken();
    await initialize(freshToken);
    return doCallTool<T>(toolName, args, freshToken, true);
  }

  if (response.status === 500 && !isRetry) {
    const text = await response.text();
    if (text.includes('upstream closed') || text.includes('connection closed')) {
      logger.info({ status: response.status }, 'MCP upstream connection lost, re-initializing and retrying');
      initialized = false;
      sessionId = null;
      const freshToken = await getAccessToken();
      await initialize(freshToken);
      return doCallTool<T>(toolName, args, freshToken, true);
    }
    throw new Error(`MCP tool call failed: ${response.status} ${text}`);
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`MCP tool call failed: ${response.status} ${text}`);
  }

  const contentType = response.headers.get('Content-Type') ?? '';

  // Handle SSE response
  if (contentType.includes('text/event-stream')) {
    return parseSSEResponse<T>(response);
  }

  // Handle direct JSON response
  const json = await response.json();

  if (json.error) {
    throw new Error(`MCP tool error: ${json.error.message} (code: ${json.error.code})`);
  }

  const toolResult = json.result as McpToolResult;
  return parseToolResult<T>(toolResult);
}

/**
 * Parse an SSE response stream to extract the JSON-RPC result.
 */
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
          throw new Error(`MCP tool error: ${json.error.message} (code: ${json.error.code})`);
        }

        if (json.result) {
          const toolResult = json.result as McpToolResult;
          return parseToolResult<T>(toolResult);
        }
      } catch (e) {
        if (e instanceof SyntaxError) continue;
        throw e;
      }
    }
  }

  throw new Error('No result found in MCP SSE response');
}

/**
 * Parse the MCP tool result content to extract the JSON data.
 */
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
    // If not JSON, return the text as-is wrapped in an object
    return { content: textContent.text } as T;
  }
}

/**
 * List available MCP tools. Cached in-memory for 5 minutes.
 */
export async function listTools(): Promise<McpTool[]> {
  if (toolsCache && Date.now() < toolsCache.expiresAt) {
    return toolsCache.tools;
  }

  const token = await getAccessToken();
  await initialize(token);

  const request: JsonRpcRequest = {
    jsonrpc: '2.0',
    id: nextId(),
    method: 'tools/list',
    params: {},
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    Authorization: `Bearer ${token}`,
  };

  if (sessionId) {
    headers['Mcp-Session-Id'] = sessionId;
  }

  const response = await fetch(env.MCP_SERVER_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`MCP tools/list failed: ${response.status} ${text}`);
  }

  const contentType = response.headers.get('Content-Type') ?? '';
  let tools: McpTool[];

  if (contentType.includes('text/event-stream')) {
    const text = await response.text();
    const lines = text.split('\n');
    let parsed: { tools: McpTool[] } | null = null;
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6).trim();
        if (!data || data === '[DONE]') continue;
        try {
          const json = JSON.parse(data);
          if (json.result?.tools) {
            parsed = json.result;
            break;
          }
        } catch {
          continue;
        }
      }
    }
    tools = parsed?.tools ?? [];
  } else {
    const json = await response.json();
    if (json.error) {
      throw new Error(`MCP tools/list error: ${json.error.message}`);
    }
    tools = json.result?.tools ?? [];
  }

  toolsCache = { tools, expiresAt: Date.now() + TOOLS_CACHE_TTL_MS };
  logger.info({ count: tools.length }, 'MCP tools list fetched and cached');
  return tools;
}

/**
 * Reset the MCP session (useful for reconnection).
 */
export function resetSession(): void {
  sessionId = null;
  initialized = false;
  requestId = 0;
  toolsCache = null;
}
