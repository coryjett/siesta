import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

const TOKEN_BUFFER_MS = 30_000; // refresh 30s before expiry

// Singleton backend token cache
let backendToken: { accessToken: string; expiresAt: number } | null = null;

/**
 * Get a valid access token for the backend MCP connection.
 * Uses client_credentials grant — no user context needed.
 */
export async function getAccessToken(): Promise<string> {
  if (backendToken && Date.now() < backendToken.expiresAt - TOKEN_BUFFER_MS) {
    return backendToken.accessToken;
  }

  logger.info('Fetching new MCP backend access token via client_credentials');

  const params = new URLSearchParams();
  params.set('grant_type', 'client_credentials');
  params.set('client_id', env.MCP_CLIENT_ID);
  params.set('client_secret', env.MCP_CLIENT_SECRET);

  const response = await fetch(env.MCP_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    logger.error({ status: response.status, body: text }, 'MCP client_credentials token fetch failed');
    throw new Error(`MCP token fetch failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  const expiresAt = Date.now() + data.expires_in * 1000;

  backendToken = {
    accessToken: data.access_token,
    expiresAt,
  };

  logger.info('MCP backend access token acquired');
  return data.access_token;
}
