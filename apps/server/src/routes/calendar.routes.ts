import { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { requireAuth } from '../auth/guards.js';
import { db } from '../db/client.js';
import { userGoogleTokens } from '../db/schema/index.js';
import { encrypt, decrypt } from '../services/encryption.service.js';
import { env } from '../config/env.js';

interface CalendarEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  meetLink: string | null;
  attendees: Array<{ email: string; displayName?: string }>;
}

interface GoogleCalendarEvent {
  id: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  hangoutLink?: string;
  conferenceData?: { entryPoints?: Array<{ entryPointType: string; uri: string }> };
  attendees?: Array<{ email: string; displayName?: string }>;
}

interface GoogleCalendarResponse {
  items?: GoogleCalendarEvent[];
}

/**
 * Refresh a Google access token using the refresh token.
 */
async function refreshAccessToken(
  refreshToken: string,
): Promise<{ accessToken: string; expiresIn: number }> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID!,
      client_secret: env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to refresh Google token: ${error}`);
  }

  const data = (await response.json()) as { access_token: string; expires_in: number };
  return { accessToken: data.access_token, expiresIn: data.expires_in };
}

/**
 * Get a valid access token for the user, refreshing if expired.
 */
async function getValidAccessToken(userId: string): Promise<string> {
  const tokenRow = await db
    .select()
    .from(userGoogleTokens)
    .where(eq(userGoogleTokens.userId, userId))
    .limit(1);

  if (tokenRow.length === 0) {
    throw new Error('No Google tokens found. Please re-authenticate.');
  }

  const row = tokenRow[0];
  const isExpired = row.expiresAt && new Date() >= row.expiresAt;

  if (!isExpired) {
    return decrypt(row.accessTokenEncrypted);
  }

  // Token expired — refresh it
  if (!row.refreshTokenEncrypted) {
    throw new Error('Google access token expired and no refresh token available. Please re-authenticate.');
  }

  const refreshToken = decrypt(row.refreshTokenEncrypted);
  const { accessToken, expiresIn } = await refreshAccessToken(refreshToken);

  // Store the new access token
  await db
    .update(userGoogleTokens)
    .set({
      accessTokenEncrypted: encrypt(accessToken),
      expiresAt: new Date(Date.now() + expiresIn * 1000),
      updatedAt: new Date(),
    })
    .where(eq(userGoogleTokens.userId, userId));

  return accessToken;
}

export async function calendarRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  /**
   * GET /api/calendar/upcoming
   * Returns the user's upcoming Google Calendar meetings for the next 7 days.
   */
  app.get('/api/calendar/upcoming', async (request, reply) => {
    const userId = request.user.id;

    let accessToken: string;
    try {
      accessToken = await getValidAccessToken(userId);
    } catch (error) {
      // No tokens or can't refresh — return empty list rather than failing
      request.log.warn({ userId, error: (error as Error).message }, 'Cannot fetch calendar: no valid tokens');
      return reply.send({ events: [] });
    }

    const now = new Date();
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const params = new URLSearchParams({
      timeMin: now.toISOString(),
      timeMax: sevenDaysFromNow.toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '20',
    });

    const calResponse = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );

    if (!calResponse.ok) {
      const errorText = await calResponse.text();
      request.log.error({ status: calResponse.status, error: errorText }, 'Google Calendar API error');
      return reply.send({ events: [] });
    }

    const data = (await calResponse.json()) as GoogleCalendarResponse;

    const events: CalendarEvent[] = (data.items ?? []).map((item) => {
      // Find a meeting link: hangoutLink or conferenceData video entry
      let meetLink: string | null = item.hangoutLink ?? null;
      if (!meetLink && item.conferenceData?.entryPoints) {
        const videoEntry = item.conferenceData.entryPoints.find(
          (ep) => ep.entryPointType === 'video',
        );
        if (videoEntry) {
          meetLink = videoEntry.uri;
        }
      }

      return {
        id: item.id,
        summary: item.summary ?? '(No title)',
        start: item.start?.dateTime ?? item.start?.date ?? '',
        end: item.end?.dateTime ?? item.end?.date ?? '',
        meetLink,
        attendees: (item.attendees ?? []).map((a) => ({
          email: a.email,
          displayName: a.displayName,
        })),
      };
    });

    return reply.send({ events });
  });
}
