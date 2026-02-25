import { useQuery } from '@tanstack/react-query';
import { api } from '../client';
import type { AppSetting, User } from '@siesta/shared';

export interface McpConnectionStatus {
  mcp: {
    connected: boolean;
    lastError: string | null;
  };
}

export function useSettings() {
  return useQuery<AppSetting[]>({
    queryKey: ['settings'],
    queryFn: () => api.get<AppSetting[]>('/settings'),
  });
}

export function useConnectionStatus() {
  return useQuery<McpConnectionStatus>({
    queryKey: ['settings', 'connections'],
    queryFn: () => api.get<McpConnectionStatus>('/settings/connections'),
  });
}

export function useUsers() {
  return useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => api.get<User[]>('/users'),
  });
}

export interface CacheStats {
  connected: boolean;
  warmup: {
    status: 'idle' | 'running' | 'completed' | 'failed';
    startedAt: string | null;
    completedAt: string | null;
    durationMs: number | null;
    accountCount: number | null;
    error: string | null;
  };
  server: {
    redisVersion: string;
    uptimeSeconds: number;
    connectedClients: number;
    blockedClients: number;
    totalConnectionsReceived: number;
    rejectedConnections: number;
    pingLatencyMs: number;
  } | null;
  memory: {
    usedMemory: string;
    usedMemoryPeak: string;
    maxMemory: string;
    fragmentationRatio: number;
  } | null;
  cpu: {
    usedCpuSys: number;
    usedCpuUser: number;
  } | null;
  stats: {
    totalKeys: number;
    mcpKeys: number;
    supportMcpKeys: number;
    keysByPrefix: { prefix: string; count: number }[];
    hits: number;
    misses: number;
    hitRate: number;
    evictedKeys: number;
    expiredKeys: number;
    avgTtlMs: number;
    totalCommandsProcessed: number;
    instantaneousOpsPerSec: number;
    networkInputBytes: number;
    networkOutputBytes: number;
  } | null;
}

export function useCacheStats() {
  return useQuery<CacheStats>({
    queryKey: ['settings', 'cache'],
    queryFn: () => api.get<CacheStats>('/settings/cache/stats'),
    refetchInterval: 10_000,
  });
}

export interface SupportMcpStatus {
  connected: boolean;
  connectedAt?: string;
}

export function useSupportMcpStatus() {
  return useQuery<SupportMcpStatus>({
    queryKey: ['settings', 'support-mcp-status'],
    queryFn: () => api.get<SupportMcpStatus>('/settings/support-mcp-status'),
  });
}

export interface OpenAiStatus {
  configured: boolean;
  connected: boolean;
  baseUrl: string;
  model: string | null;
  latencyMs: number | null;
  error: string | null;
  cache: {
    accountOverviews: number;
    threadSummaries: number;
  };
}

export function useOpenAiStatus() {
  return useQuery<OpenAiStatus>({
    queryKey: ['settings', 'openai-status'],
    queryFn: () => api.get<OpenAiStatus>('/settings/openai/status'),
  });
}
