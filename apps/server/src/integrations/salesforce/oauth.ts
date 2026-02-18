import type { SalesforceTokenResponse } from './client.js';

const SF_AUTH_BASE = 'https://login.salesforce.com';
const SF_AUTH_URL = `${SF_AUTH_BASE}/services/oauth2/authorize`;
const SF_TOKEN_URL = `${SF_AUTH_BASE}/services/oauth2/token`;

/**
 * Build the Salesforce OAuth authorization URL that the user should be redirected to.
 */
export function buildAuthUrl(clientId: string, redirectUri: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'api refresh_token',
    prompt: 'consent',
  });

  return `${SF_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange an authorization code for access and refresh tokens.
 */
export async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): Promise<SalesforceTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
  });

  const response = await fetch(SF_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to exchange Salesforce auth code: ${errorText}`);
  }

  return response.json() as Promise<SalesforceTokenResponse>;
}

/**
 * Refresh an access token using a refresh token.
 */
export async function refreshAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Promise<SalesforceTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });

  const response = await fetch(SF_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to refresh Salesforce token: ${errorText}`);
  }

  return response.json() as Promise<SalesforceTokenResponse>;
}
