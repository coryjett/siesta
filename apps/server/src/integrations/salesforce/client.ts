import { logger } from '../../utils/logger.js';

export interface SalesforceQueryResult<T = Record<string, unknown>> {
  totalSize: number;
  done: boolean;
  nextRecordsUrl?: string;
  records: T[];
}

export interface SalesforceDescribeResult {
  name: string;
  label: string;
  fields: SalesforceFieldDescribe[];
}

export interface SalesforceFieldDescribe {
  name: string;
  label: string;
  type: string;
  picklistValues?: SalesforcePicklistValue[];
}

export interface SalesforcePicklistValue {
  value: string;
  label: string;
  active: boolean;
  defaultValue: boolean;
}

export interface SalesforceTokenResponse {
  access_token: string;
  refresh_token?: string;
  instance_url: string;
  token_type: string;
  issued_at: string;
}

export class SalesforceApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public errorCode?: string,
  ) {
    super(message);
    this.name = 'SalesforceApiError';
  }
}

const SF_API_VERSION = 'v60.0';

export class SalesforceClient {
  private accessToken: string;
  private instanceUrl: string;

  constructor(accessToken: string, instanceUrl: string) {
    this.accessToken = accessToken;
    this.instanceUrl = instanceUrl.replace(/\/$/, '');
  }

  private get baseUrl(): string {
    return `${this.instanceUrl}/services/data/${SF_API_VERSION}`;
  }

  private get headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Execute a SOQL query and return the first page of results.
   */
  async query<T = Record<string, unknown>>(soql: string): Promise<SalesforceQueryResult<T>> {
    const url = `${this.baseUrl}/query?q=${encodeURIComponent(soql)}`;
    const response = await fetch(url, { headers: this.headers });

    if (!response.ok) {
      await this.handleErrorResponse(response);
    }

    return response.json() as Promise<SalesforceQueryResult<T>>;
  }

  /**
   * Execute a SOQL query and automatically handle pagination,
   * returning all records across all pages.
   */
  async queryAll<T = Record<string, unknown>>(soql: string): Promise<T[]> {
    const allRecords: T[] = [];
    let result = await this.query<T>(soql);
    allRecords.push(...result.records);

    while (!result.done && result.nextRecordsUrl) {
      result = await this.fetchNextPage<T>(result.nextRecordsUrl);
      allRecords.push(...result.records);
    }

    logger.debug({ totalRecords: allRecords.length }, 'Salesforce queryAll completed');
    return allRecords;
  }

  /**
   * Get object metadata (describe) for a given Salesforce object.
   */
  async describe(objectName: string): Promise<SalesforceDescribeResult> {
    const url = `${this.baseUrl}/sobjects/${objectName}/describe`;
    const response = await fetch(url, { headers: this.headers });

    if (!response.ok) {
      await this.handleErrorResponse(response);
    }

    return response.json() as Promise<SalesforceDescribeResult>;
  }

  /**
   * Refresh an OAuth access token using a refresh token.
   */
  static async refreshToken(
    clientId: string,
    clientSecret: string,
    refreshToken: string,
  ): Promise<SalesforceTokenResponse> {
    const url = 'https://login.salesforce.com/services/oauth2/token';
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new SalesforceApiError(
        `Failed to refresh token: ${errorText}`,
        response.status,
      );
    }

    return response.json() as Promise<SalesforceTokenResponse>;
  }

  /**
   * Update the access token (e.g., after a refresh).
   */
  updateAccessToken(newToken: string): void {
    this.accessToken = newToken;
  }

  /**
   * Fetch the next page of results using the nextRecordsUrl from a previous query.
   */
  private async fetchNextPage<T>(nextRecordsUrl: string): Promise<SalesforceQueryResult<T>> {
    const url = `${this.instanceUrl}${nextRecordsUrl}`;
    const response = await fetch(url, { headers: this.headers });

    if (!response.ok) {
      await this.handleErrorResponse(response);
    }

    return response.json() as Promise<SalesforceQueryResult<T>>;
  }

  /**
   * Handle non-OK HTTP responses from the Salesforce API.
   */
  private async handleErrorResponse(response: Response): Promise<never> {
    let errorMessage = `Salesforce API error: ${response.status} ${response.statusText}`;
    let errorCode: string | undefined;

    try {
      const errorBody = await response.json() as Array<{ errorCode?: string; message?: string }>;
      if (Array.isArray(errorBody) && errorBody.length > 0) {
        errorCode = errorBody[0].errorCode;
        errorMessage = `Salesforce API error: ${errorBody[0].errorCode} - ${errorBody[0].message}`;
      }
    } catch {
      // If we can't parse the error body, use the default message
    }

    if (response.status === 401) {
      throw new SalesforceApiError(
        'Salesforce access token expired or invalid',
        401,
        errorCode ?? 'INVALID_SESSION_ID',
      );
    }

    throw new SalesforceApiError(errorMessage, response.status, errorCode);
  }
}
