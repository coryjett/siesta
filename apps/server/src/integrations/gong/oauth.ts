const GONG_AUTH_URL = 'https://app.gong.io/oauth2/authorize';
const GONG_TOKEN_URL = 'https://app.gong.io/oauth2/generate-customer-token';

export interface GongTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
  api_base_url_for_customer?: string;
}

/**
 * Build the Gong OAuth authorization URL that the user should be redirected to.
 */
export function buildAuthUrl(clientId: string, redirectUri: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'api:calls:read:transcript api:calls:read:basic',
  });

  return `${GONG_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange an authorization code for access and refresh tokens.
 * Gong uses HTTP Basic authentication with clientId:clientSecret for token requests.
 */
export async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): Promise<GongTokenResponse> {
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  });

  const response = await fetch(GONG_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to exchange Gong auth code: ${errorText}`);
  }

  return response.json() as Promise<GongTokenResponse>;
}

/**
 * Refresh an access token using a refresh token.
 * Gong uses HTTP Basic authentication with clientId:clientSecret for token requests.
 */
export async function refreshAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Promise<GongTokenResponse> {
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  const response = await fetch(GONG_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to refresh Gong token: ${errorText}`);
  }

  return response.json() as Promise<GongTokenResponse>;
}
