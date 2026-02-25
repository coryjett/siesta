import { useState } from 'react';
import type { UserRole } from '@siesta/shared';
import { useUsers, useSupportMcpStatus, useCacheStats, useOpenAiStatus, useWarmupStatus } from '../../api/queries/settings';
import { useUpdateUserRole, useDisconnectSupportMcp, useFlushCache } from '../../api/mutations/settings';
import Badge from '../../components/common/badge';
import RoleManager from '../../components/settings/role-manager';
import Card from '../../components/common/card';
import { useTheme } from '../../contexts/theme-context';

type TabId = 'users' | 'integrations' | 'ai' | 'cache' | 'preferences';

const TABS: { id: TabId; label: string }[] = [
  { id: 'users', label: 'User Management' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'ai', label: 'AI' },
  { id: 'cache', label: 'Cache' },
  { id: 'preferences', label: 'Preferences' },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('users');

  // Queries
  const { data: users, isLoading: usersLoading } = useUsers();

  // Mutations
  const updateUserRole = useUpdateUserRole();

  const handleUpdateRole = (userId: string, role: UserRole, sfUserId: string | null) => {
    updateUserRole.mutate({ userId, role, sfUserId });
  };

  return (
    <div className="min-h-screen bg-[#f9f9fb] dark:bg-[#0d0c12]">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="font-display text-xl md:text-2xl font-bold text-[#191726] dark:text-[#f2f2f2] mb-4 md:mb-6">Settings</h1>

        {/* Tab Navigation */}
        <div className="border-b border-[#dedde4] dark:border-[#2a2734] mb-4 md:mb-6">
          <nav className="-mb-px flex gap-4 md:gap-6 overflow-x-auto scrollbar-hide">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-3 px-1 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-[#6b26d9] text-[#6b26d9] dark:text-[#8249df]'
                    : 'border-transparent text-[#6b677e] dark:text-[#858198] hover:text-[#191726] dark:hover:text-[#f2f2f2] hover:border-[#dedde4] dark:hover:border-[#2a2734]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        {activeTab === 'users' && (
          <>
            {usersLoading ? (
              <p className="text-[#6b677e] text-sm">Loading users...</p>
            ) : (
              <RoleManager
                users={users ?? []}
                onUpdateRole={handleUpdateRole}
                isUpdating={updateUserRole.isPending}
              />
            )}
            {updateUserRole.isSuccess && (
              <div className="mt-4 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-3 text-sm text-green-700 dark:text-green-400">
                User role updated successfully.
              </div>
            )}
            {updateUserRole.isError && (
              <div className="mt-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-400">
                Failed to update user role.
              </div>
            )}
          </>
        )}

        {activeTab === 'integrations' && <IntegrationsTab />}

        {activeTab === 'ai' && <AiTab />}

        {activeTab === 'cache' && <CacheTab />}

        {activeTab === 'preferences' && <PreferencesTab />}
      </div>
    </div>
  );
}

// ── Integrations Tab ──

function IntegrationsTab() {
  const { data: status, isLoading } = useSupportMcpStatus();
  const disconnect = useDisconnectSupportMcp();

  const handleConnect = () => {
    window.location.href = '/auth/support-mcp/connect';
  };

  return (
    <div className="space-y-6">
      <Card title="Support Agent Tools">
        <p className="text-sm text-[#6b677e] dark:text-[#858198] mb-4">
          Connect to the Support Agent Tools MCP server to access additional customer support data and tooling.
        </p>

        {isLoading ? (
          <p className="text-sm text-[#6b677e] dark:text-[#858198]">Checking connection status...</p>
        ) : status?.connected ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="flex h-2.5 w-2.5 rounded-full bg-green-500" />
              <span className="text-sm font-medium text-[#191726] dark:text-[#f2f2f2]">Connected</span>
              {status.connectedAt && (
                <span className="text-xs text-[#6b677e] dark:text-[#858198]">
                  since {new Date(status.connectedAt).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => disconnect.mutate()}
              disabled={disconnect.isPending}
              className="inline-flex items-center gap-2 rounded-lg border border-red-200 dark:border-red-800 px-3 py-1.5 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
            >
              {disconnect.isPending ? 'Disconnecting...' : 'Disconnect'}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleConnect}
            className="inline-flex items-center gap-2 rounded-lg bg-[#6b26d9] dark:bg-[#8249df] px-4 py-2 text-sm font-medium text-white hover:bg-[#5a1fb8] dark:hover:bg-[#7040c0] transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
            Connect
          </button>
        )}

        {disconnect.isError && (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">Failed to disconnect.</p>
        )}
      </Card>
    </div>
  );
}

// ── AI Tab ──

function AiTab() {
  const { data, isLoading } = useOpenAiStatus();

  if (isLoading) {
    return <p className="text-sm text-[#6b677e] dark:text-[#858198]">Checking OpenAI status...</p>;
  }

  if (!data) {
    return <p className="text-sm text-[#6b677e] dark:text-[#858198]">Unable to load OpenAI status.</p>;
  }

  return (
    <div className="space-y-6">
      <Card title="OpenAI Integration">
        <div className="space-y-5">
          {/* Connection status */}
          <div className="flex items-center gap-3">
            <span className={`flex h-2.5 w-2.5 rounded-full ${data.connected ? 'bg-green-500' : data.configured ? 'bg-yellow-500' : 'bg-red-500'}`} />
            <span className="text-sm font-medium text-[#191726] dark:text-[#f2f2f2]">OpenAI</span>
            <Badge variant={data.connected ? 'success' : data.configured ? 'warning' : 'danger'}>
              {data.connected ? 'Connected' : data.configured ? 'Configured (not reachable)' : 'Not Configured'}
            </Badge>
          </div>

          {/* Details */}
          <div className="grid grid-cols-2 gap-x-8 gap-y-3 border-t border-[#dedde4] dark:border-[#2a2734] pt-4 sm:grid-cols-4">
            <Metric label="API Key" value={data.configured ? 'Set' : 'Missing'} />
            <Metric label="Base URL" value={data.baseUrl} />
            {data.model && <Metric label="Model" value={data.model} />}
            {data.latencyMs != null && <Metric label="Latency" value={`${data.latencyMs}ms`} />}
          </div>

          {data.error && (
            <div className="rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/20 px-4 py-3">
              <p className="text-sm text-red-600 dark:text-red-400">{data.error}</p>
            </div>
          )}

          {/* Cache stats */}
          <div className="border-t border-[#dedde4] dark:border-[#2a2734] pt-4">
            <p className="text-[11px] uppercase tracking-wide text-[#6b677e] dark:text-[#858198] mb-3">Cached AI Responses</p>
            <div className="grid grid-cols-2 gap-x-8 sm:grid-cols-4">
              <Metric label="Account Overviews" value={data.cache.accountOverviews.toLocaleString()} detail="1 hour TTL" />
              <Metric label="Thread Summaries" value={data.cache.threadSummaries.toLocaleString()} detail="24 hour TTL" />
            </div>
          </div>
        </div>
      </Card>

      <Card title="Features">
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border border-[#dedde4] dark:border-[#2a2734] px-4 py-3">
            <div>
              <p className="text-sm font-medium text-[#191726] dark:text-[#f2f2f2]">Account Overview</p>
              <p className="text-xs text-[#6b677e] dark:text-[#858198]">AI-generated summary of account health, opportunities, and activity on account detail pages</p>
            </div>
            <Badge variant={data.configured ? 'success' : 'default'}>
              {data.configured ? 'Active' : 'Inactive'}
            </Badge>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-[#dedde4] dark:border-[#2a2734] px-4 py-3">
            <div>
              <p className="text-sm font-medium text-[#191726] dark:text-[#f2f2f2]">Email Thread Summaries</p>
              <p className="text-xs text-[#6b677e] dark:text-[#858198]">AI-generated summaries of email thread conversations when viewing thread details</p>
            </div>
            <Badge variant={data.configured ? 'success' : 'default'}>
              {data.configured ? 'Active' : 'Inactive'}
            </Badge>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ── Cache Tab ──

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function formatTtl(ms: number): string {
  if (ms === 0) return 'N/A';
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  return `${hours}h`;
}

function formatCpu(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = (seconds % 60).toFixed(0);
  return `${minutes}m ${secs}s`;
}

function WarmupStatusCard() {
  const { data: warmup } = useWarmupStatus();

  if (!warmup || warmup.status === 'idle') return null;

  const isWarming = warmup.status === 'warming';
  const isComplete = warmup.status === 'complete';
  const isError = warmup.status === 'error';
  const progress = warmup.totalAccounts > 0
    ? Math.round((warmup.processedAccounts / warmup.totalAccounts) * 100)
    : 0;
  const briefsProcessed = warmup.generated + warmup.skipped;

  return (
    <Card title="Gong Brief Warmup">
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <span
            className={`flex h-2.5 w-2.5 rounded-full ${
              isWarming ? 'bg-amber-500 animate-pulse' : isComplete ? 'bg-green-500' : 'bg-red-500'
            }`}
          />
          <span className="text-sm font-medium text-[#191726] dark:text-[#f2f2f2]">
            {isWarming ? 'Warming...' : isComplete ? 'Complete' : 'Error'}
          </span>
          {isWarming && (
            <span className="text-xs text-[#6b677e] dark:text-[#858198]">
              {warmup.processedAccounts} / {warmup.totalAccounts} accounts ({progress}%)
            </span>
          )}
          {isComplete && warmup.completedAt && (
            <span className="text-xs text-[#6b677e] dark:text-[#858198]">
              finished {new Date(warmup.completedAt).toLocaleTimeString()}
            </span>
          )}
        </div>

        {isWarming && (
          <div className="h-2 w-full rounded-full bg-[#eeedf3] dark:bg-[#1e1b29] overflow-hidden">
            <div
              className="h-full rounded-full bg-amber-500 transition-all duration-500"
              style={{ width: `${Math.max(progress, 2)}%` }}
            />
          </div>
        )}

        {isError && warmup.error && (
          <div className="rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/20 px-4 py-3">
            <p className="text-sm text-red-600 dark:text-red-400">{warmup.error}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-x-8 gap-y-3 border-t border-[#dedde4] dark:border-[#2a2734] pt-4 sm:grid-cols-4">
          <Metric label="Accounts" value={`${warmup.processedAccounts} / ${warmup.totalAccounts}`} />
          <Metric label="Calls Found" value={warmup.totalCalls.toLocaleString()} />
          <Metric label="Briefs Generated" value={warmup.generated.toLocaleString()} detail={isWarming && warmup.totalCalls > 0 ? `${warmup.totalCalls - briefsProcessed} remaining` : undefined} />
          <Metric label="Skipped" value={warmup.skipped.toLocaleString()} detail="cache hits or errors" />
        </div>
      </div>
    </Card>
  );
}

function CacheTab() {
  const { data, isLoading } = useCacheStats();
  const flush = useFlushCache();

  if (isLoading) {
    return <p className="text-sm text-[#6b677e] dark:text-[#858198]">Loading cache stats...</p>;
  }

  if (!data) {
    return <p className="text-sm text-[#6b677e] dark:text-[#858198]">Unable to load cache stats.</p>;
  }

  return (
    <div className="space-y-6">
      <WarmupStatusCard />

      <Card>
        <div className="space-y-5">
          {/* Header row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className={`flex h-2 w-2 rounded-full ${data.connected ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="text-sm font-medium text-[#191726] dark:text-[#f2f2f2]">Redis</span>
              <Badge variant={data.connected ? 'success' : 'danger'}>
                {data.connected ? 'Connected' : 'Disconnected'}
              </Badge>
              {data.server && (
                <span className="text-xs text-[#6b677e] dark:text-[#858198]">
                  v{data.server.redisVersion} &middot; up {formatUptime(data.server.uptimeSeconds)}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => flush.mutate()}
              disabled={flush.isPending || !data.connected}
              className="rounded-lg border border-red-200 dark:border-red-800 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
            >
              {flush.isPending ? 'Flushing...' : 'Flush Cache'}
            </button>
          </div>

          {flush.isSuccess && (
            <p className="text-xs text-green-600 dark:text-green-400">Cache flushed successfully.</p>
          )}
          {flush.isError && (
            <p className="text-xs text-red-600 dark:text-red-400">Failed to flush cache.</p>
          )}

          {/* Key stats + hit rate */}
          {data.stats && (
            <div className="grid grid-cols-3 gap-x-8 gap-y-3 border-t border-[#dedde4] dark:border-[#2a2734] pt-4 sm:grid-cols-5">
              <Metric label="Stored Keys" value={data.stats.totalKeys.toLocaleString()} detail={`${data.stats.mcpKeys.toLocaleString()} MCP \u00b7 ${data.stats.supportMcpKeys.toLocaleString()} Support`} />
              <Metric label="Hit Rate" value={`${data.stats.hitRate}%`} detail={`${data.stats.hits.toLocaleString()} hits \u00b7 ${data.stats.misses.toLocaleString()} misses`} />
              <Metric label="Evicted" value={data.stats.evictedKeys.toLocaleString()} detail="capacity drops" />
              <Metric label="Expired" value={data.stats.expiredKeys.toLocaleString()} detail="TTL expirations" />
              <Metric label="Avg TTL" value={formatTtl(data.stats.avgTtlMs)} />
            </div>
          )}

          {/* Server + performance */}
          {(data.server || data.stats) && (
            <div className="grid grid-cols-3 gap-x-8 gap-y-3 border-t border-[#dedde4] dark:border-[#2a2734] pt-4 sm:grid-cols-5">
              {data.server && (
                <>
                  <Metric label="Ping Latency" value={`${data.server.pingLatencyMs}ms`} />
                  <Metric label="Clients" value={data.server.connectedClients.toLocaleString()} detail={data.server.blockedClients > 0 ? `${data.server.blockedClients} blocked` : undefined} />
                  <Metric label="Connections" value={data.server.totalConnectionsReceived.toLocaleString()} detail={data.server.rejectedConnections > 0 ? `${data.server.rejectedConnections} rejected` : 'total received'} />
                </>
              )}
              {data.stats && (
                <>
                  <Metric label="Ops/sec" value={data.stats.instantaneousOpsPerSec.toLocaleString()} />
                  <Metric label="Commands" value={data.stats.totalCommandsProcessed.toLocaleString()} />
                </>
              )}
            </div>
          )}

          {/* Memory + CPU + Network */}
          {(data.memory || data.cpu || data.stats) && (
            <div className="grid grid-cols-3 gap-x-8 gap-y-3 border-t border-[#dedde4] dark:border-[#2a2734] pt-4 sm:grid-cols-5">
              {data.memory && (
                <>
                  <Metric label="Memory" value={data.memory.usedMemory} detail={`peak ${data.memory.usedMemoryPeak}`} />
                  <Metric label="Fragmentation" value={`${data.memory.fragmentationRatio}x`} />
                </>
              )}
              {data.cpu && (
                <Metric label="CPU" value={formatCpu(data.cpu.usedCpuSys + data.cpu.usedCpuUser)} detail={`sys ${formatCpu(data.cpu.usedCpuSys)} \u00b7 user ${formatCpu(data.cpu.usedCpuUser)}`} />
              )}
              {data.stats && (
                <Metric label="Network I/O" value={`${formatBytes(data.stats.networkInputBytes)} / ${formatBytes(data.stats.networkOutputBytes)}`} detail="in / out" />
              )}
            </div>
          )}
        </div>
      </Card>

      {/* Per-prefix key breakdown */}
      {data.stats?.keysByPrefix && data.stats.keysByPrefix.length > 0 && (
        <Card title="Keys by Prefix">
          <div className="space-y-1.5">
            {data.stats.keysByPrefix.map(({ prefix, count }) => {
              const pct = data.stats!.totalKeys > 0 ? (count / data.stats!.totalKeys) * 100 : 0;
              return (
                <div key={prefix} className="flex items-center gap-3">
                  <code className="w-48 shrink-0 truncate text-xs text-[#191726] dark:text-[#f2f2f2]">{prefix}</code>
                  <div className="flex-1 h-4 rounded-full bg-[#eeedf3] dark:bg-[#1e1b29] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#6b26d9] dark:bg-[#8249df] transition-all"
                      style={{ width: `${Math.max(pct, 1)}%` }}
                    />
                  </div>
                  <span className="w-16 shrink-0 text-right text-xs tabular-nums text-[#6b677e] dark:text-[#858198]">
                    {count.toLocaleString()}
                  </span>
                  <span className="w-12 shrink-0 text-right text-xs tabular-nums text-[#6b677e] dark:text-[#858198]">
                    {pct.toFixed(1)}%
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-[#6b677e] dark:text-[#858198]">{label}</p>
      <p className="text-sm font-medium text-[#191726] dark:text-[#f2f2f2]">{value}</p>
      {detail && <p className="text-[11px] text-[#6b677e] dark:text-[#858198]">{detail}</p>}
    </div>
  );
}

// ── Preferences Tab ──

const THEME_OPTIONS = [
  {
    value: 'light' as const,
    label: 'Light',
    description: 'Use a light background with dark text',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="5" />
        <line x1="12" y1="1" x2="12" y2="3" />
        <line x1="12" y1="21" x2="12" y2="23" />
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
        <line x1="1" y1="12" x2="3" y2="12" />
        <line x1="21" y1="12" x2="23" y2="12" />
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
      </svg>
    ),
  },
  {
    value: 'dark' as const,
    label: 'Dark',
    description: 'Use a dark background with light text',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    ),
  },
  {
    value: 'system' as const,
    label: 'System',
    description: 'Follow your operating system preference',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
      </svg>
    ),
  },
];

function PreferencesTab() {
  const { theme, setTheme } = useTheme();

  return (
    <Card title="Appearance">
      <p className="text-sm text-[#6b677e] dark:text-[#858198] mb-4">
        Choose how Siesta looks to you. Select a single theme or sync with your system settings.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {THEME_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setTheme(option.value)}
            className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 text-center transition-colors ${
              theme === option.value
                ? 'border-[#6b26d9] bg-[#6b26d9]/5 dark:bg-[#8249df]/10'
                : 'border-[#dedde4] dark:border-[#2a2734] hover:border-[#6b26d9]/30 dark:hover:border-[#8249df]/30'
            }`}
          >
            <span className={theme === option.value ? 'text-[#6b26d9] dark:text-[#8249df]' : 'text-[#6b677e] dark:text-[#858198]'}>
              {option.icon}
            </span>
            <span className={`text-sm font-medium ${theme === option.value ? 'text-[#6b26d9] dark:text-[#8249df]' : 'text-[#191726] dark:text-[#f2f2f2]'}`}>
              {option.label}
            </span>
            <span className="text-xs text-[#6b677e] dark:text-[#858198]">
              {option.description}
            </span>
          </button>
        ))}
      </div>
    </Card>
  );
}
