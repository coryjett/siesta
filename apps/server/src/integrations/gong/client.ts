import { logger } from '../../utils/logger.js';

export interface GongApiCallsResponse {
  requestId: string;
  records: {
    totalRecords: number;
    currentPageSize: number;
    currentPageNumber: number;
    cursor?: string;
  };
  calls: GongApiCall[];
}

export interface GongApiCall {
  id: string;
  title?: string;
  scheduled?: string;
  started?: string;
  duration?: number;
  direction?: string;
  scope?: string;
  media?: string;
  language?: string;
  url?: string;
  parties?: GongApiParty[];
  content?: {
    trackers?: unknown[];
  };
  context?: GongApiContext[];
}

export interface GongApiParty {
  id: string;
  emailAddress?: string;
  name?: string;
  affiliation?: 'Internal' | 'External' | 'Unknown';
  speakerId?: string;
}

export interface GongApiContext {
  system?: string;
  objects?: Array<{
    objectType?: string;
    objectId?: string;
    fields?: Array<{ name: string; value: string }>;
  }>;
}

export interface GongApiTranscriptResponse {
  requestId: string;
  records: {
    totalRecords: number;
    currentPageSize: number;
    currentPageNumber: number;
    cursor?: string;
  };
  callTranscripts: GongApiCallTranscript[];
}

export interface GongApiCallTranscript {
  callId: string;
  transcript: GongApiTranscriptEntry[];
}

export interface GongApiTranscriptEntry {
  speakerId?: string;
  topic?: string;
  sentences: Array<{
    start: number;
    end: number;
    text: string;
  }>;
}

export class GongApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public requestId?: string,
  ) {
    super(message);
    this.name = 'GongApiError';
  }
}

const GONG_API_BASE = 'https://api.gong.io/v2';

export class GongClient {
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  private get headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * List calls with optional date range filtering and pagination.
   */
  async listCalls(params: {
    fromDateTime?: string;
    toDateTime?: string;
    cursor?: string;
  }): Promise<{ calls: GongApiCall[]; cursor?: string }> {
    const body: Record<string, unknown> = {
      filter: {},
    };

    if (params.fromDateTime) {
      (body.filter as Record<string, unknown>).fromDateTime = params.fromDateTime;
    }
    if (params.toDateTime) {
      (body.filter as Record<string, unknown>).toDateTime = params.toDateTime;
    }
    if (params.cursor) {
      body.cursor = params.cursor;
    }

    const response = await fetch(`${GONG_API_BASE}/calls`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      await this.handleErrorResponse(response);
    }

    const data = (await response.json()) as GongApiCallsResponse;

    logger.debug(
      { totalRecords: data.records.totalRecords, pageSize: data.records.currentPageSize },
      'Gong listCalls response',
    );

    return {
      calls: data.calls ?? [],
      cursor: data.records.cursor,
    };
  }

  /**
   * Get transcripts for a batch of call IDs.
   */
  async getCallTranscripts(callIds: string[]): Promise<GongApiCallTranscript[]> {
    if (callIds.length === 0) return [];

    const body = {
      filter: {
        callIds,
      },
    };

    const response = await fetch(`${GONG_API_BASE}/calls/transcript`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      await this.handleErrorResponse(response);
    }

    const data = (await response.json()) as GongApiTranscriptResponse;

    logger.debug(
      { totalRecords: data.records.totalRecords, callIds: callIds.length },
      'Gong getCallTranscripts response',
    );

    return data.callTranscripts ?? [];
  }

  /**
   * Update the access token (e.g., after a refresh).
   */
  updateAccessToken(newToken: string): void {
    this.accessToken = newToken;
  }

  /**
   * Handle non-OK HTTP responses from the Gong API.
   */
  private async handleErrorResponse(response: Response): Promise<never> {
    let errorMessage = `Gong API error: ${response.status} ${response.statusText}`;
    let requestId: string | undefined;

    try {
      const errorBody = (await response.json()) as {
        requestId?: string;
        errors?: string[];
      };
      requestId = errorBody.requestId;
      if (errorBody.errors && errorBody.errors.length > 0) {
        errorMessage = `Gong API error: ${errorBody.errors.join(', ')}`;
      }
    } catch {
      // If we can't parse the error body, use the default message
    }

    if (response.status === 401) {
      throw new GongApiError(
        'Gong access token expired or invalid',
        401,
        requestId,
      );
    }

    throw new GongApiError(errorMessage, response.status, requestId);
  }
}
