import { logger } from '../../utils/logger.js';
import type { SalesforceTokenResponse } from './client.js';

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export interface SoapLoginResult {
  accessToken: string;
  instanceUrl: string;
}

/**
 * Authenticate against Salesforce using the SOAP login API (username + password + security token).
 * Returns the session access token and instance URL derived from the login response.
 */
export async function soapLogin(
  username: string,
  password: string,
  securityToken: string,
  loginUrl = 'https://login.salesforce.com',
): Promise<SoapLoginResult> {
  const soapBody = `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:urn="urn:partner.soap.sforce.com">
  <soapenv:Body>
    <urn:login>
      <urn:username>${escapeXml(username)}</urn:username>
      <urn:password>${escapeXml(password)}${escapeXml(securityToken)}</urn:password>
    </urn:login>
  </soapenv:Body>
</soapenv:Envelope>`;

  const endpoint = `${loginUrl}/services/Soap/u/60.0`;
  logger.debug({ username, loginUrl }, 'Salesforce SOAP login attempt');

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=UTF-8',
      SOAPAction: '""',
    },
    body: soapBody,
  });

  const responseText = await response.text();

  if (!response.ok) {
    const faultMatch = responseText.match(/<faultstring[^>]*>([\s\S]*?)<\/faultstring>/);
    const faultMessage = faultMatch?.[1] ?? `Salesforce SOAP login failed: ${response.status}`;
    logger.error({ username, loginUrl, status: response.status, fault: faultMessage, response: responseText }, 'Salesforce SOAP login failed');
    throw new Error(faultMessage);
  }

  const sessionIdMatch = responseText.match(/<sessionId>([\s\S]*?)<\/sessionId>/);
  const serverUrlMatch = responseText.match(/<serverUrl>([\s\S]*?)<\/serverUrl>/);

  if (!sessionIdMatch || !serverUrlMatch) {
    logger.error({ username, loginUrl, status: response.status, response: responseText }, 'Salesforce SOAP login response missing sessionId or serverUrl');
    throw new Error('Failed to parse Salesforce SOAP login response');
  }

  const instanceUrl = new URL(serverUrlMatch[1]).origin;
  logger.info({ username, instanceUrl }, 'Salesforce SOAP login succeeded');

  return {
    accessToken: sessionIdMatch[1],
    instanceUrl,
  };
}

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
