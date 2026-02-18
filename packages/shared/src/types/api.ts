export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface PaginationParams {
  page?: number;
  pageSize?: number;
}

export interface ApiError {
  statusCode: number;
  error: string;
  message: string;
}

export interface SyncStatus {
  provider: 'salesforce' | 'gong';
  entity: string;
  status: 'idle' | 'running' | 'completed' | 'failed';
  lastSyncAt: string | null;
  lastError: string | null;
  recordsProcessed: number | null;
}

export interface AppSetting {
  key: string;
  value: string;
  updatedAt: string;
}
